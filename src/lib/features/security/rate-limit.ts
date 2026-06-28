/**
 * RATE LIMITING
 *
 * Two-layer best-effort limiter:
 *
 *  1. In-memory token bucket per Worker isolate — atomic, fast, but
 *     doesn't share state across isolates or colos. Catches burst
 *     traffic from a single hot path.
 *  2. KV-backed sliding window — shared across all isolates and colos,
 *     but read-modify-write is racy and KV is eventually consistent.
 *     Catches sustained abuse.
 *
 * Both fail open on backing-store errors so legitimate form submissions
 * are never blocked by infrastructure faults.
 *
 * Hash-based key on IP only (UA is deliberately excluded — see below).
 */

import { CONFIG } from '@/lib/config';
import { generateRateLimitKey } from '@/lib/utils/fingerprint';
import { kvGet, kvPut, safeKV } from '@/lib/utils/kv';
import { logger } from '@/lib/utils/logger';
import type { APIContext } from 'astro';
import { env as cfEnv } from 'cloudflare:workers';

// In-memory bucket: { key -> array of timestamps within the window }.
// Bounded to MAX_BUCKETS by periodic GC; pre-isolate, atomic.
const memBuckets = new Map<string, number[]>();
const MAX_BUCKETS = 10_000;

function checkInMemoryWindow(key: string, windowMs: number, limit: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  const bucket = memBuckets.get(key) || [];
  const fresh = bucket.filter((t) => t > cutoff);
  if (fresh.length >= limit) {
    memBuckets.set(key, fresh);
    return false;
  }
  fresh.push(now);
  memBuckets.set(key, fresh);
  if (memBuckets.size > MAX_BUCKETS) {
    for (const [k, v] of memBuckets) {
      if (!v.length || v[v.length - 1]! < cutoff) memBuckets.delete(k);
    }
  }
  return true;
}

/**
 * Check rate limit.
 *
 * Intentionally FAILS OPEN on any backing-store error (KV unbound or
 * throwing). For a lead-gen site, dropping a legitimate form submission
 * because of an infrastructure fault is worse than briefly losing the
 * KV abuse layer — the per-isolate in-memory bucket still applies, and
 * KV is "eventually consistent — fine for form spam control" (not a hard
 * security boundary). Do not change to fail-closed without revisiting the
 * never-lose-a-lead policy.
 */
export async function checkRateLimit(context: APIContext): Promise<boolean> {
  if (!CONFIG.features.rateLimiting) {
    return true; // Feature disabled
  }

  const { request } = context;

  const kv = safeKV(cfEnv, 'RATE_LIMITER');
  if (!kv) {
    logger.warn('RateLimit', 'KV not configured, allowing request (no KV bound)');
    // Fail open: allow requests when KV is not bound — email/iMove must fire
    return true;
  }

  // Get IP address
  const ip =
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0] ||
    'unknown';

  if (ip === 'unknown') {
    logger.warn('RateLimit', 'Could not determine IP');
    return true;
  }

  // Key on IP ONLY. The canonical policy is "N submissions per window per
  // IP". Folding User-Agent into the key would let a bot widen its keyspace
  // (a fresh bucket per spoofed UA) and defeat the limit entirely.
  const keyHash = generateRateLimitKey(ip);
  const env = CONFIG.debug ? 'dev' : 'prod';
  const key = `rate_limit:${env}:${keyHash}`;

  // Layer 1: in-memory token bucket. Catches single-isolate burst
  // traffic atomically without a KV round-trip.
  if (!checkInMemoryWindow(key, CONFIG.security.rateLimitWindowMs, CONFIG.security.rateLimitRequests)) {
    logger.warn('RateLimit', 'In-memory limit exceeded', { ip });
    return false;
  }

  // Fixed-window counter stored as `count:resetAtMs`. The window expiry
  // (resetAt) is set once on the first request and PRESERVED across
  // increments — re-deriving the KV TTL from resetAt each time. Refreshing
  // the TTL on every write (the previous bug) turned this into a rolling
  // block that never reset for a steadily-active client.
  const windowMs = CONFIG.security.rateLimitWindowMs;
  const now = Date.now();

  try {
    const current = await kvGet<string>(kv, key);
    const [countStr, resetStr] = (current ?? '').split(':');
    const parsedCount = Number.parseInt(countStr ?? '', 10);
    const parsedReset = Number.parseInt(resetStr ?? '', 10);

    const windowValid =
      !Number.isNaN(parsedCount) && !Number.isNaN(parsedReset) && parsedReset > now;

    if (!current || !windowValid) {
      // First request of a fresh window (or unparseable/expired state).
      const resetAt = now + windowMs;
      await kvPut(kv, key, `1:${resetAt}`, {
        expirationTtl: Math.max(1, Math.ceil(windowMs / 1000)),
      });
      return true;
    }

    if (parsedCount >= CONFIG.security.rateLimitRequests) {
      logger.warn('RateLimit', 'Limit exceeded', {
        ip,
        count: parsedCount,
        limit: CONFIG.security.rateLimitRequests,
      });
      return false;
    }

    // Increment, preserving the original window expiry.
    await kvPut(kv, key, `${parsedCount + 1}:${parsedReset}`, {
      expirationTtl: Math.max(1, Math.ceil((parsedReset - now) / 1000)),
    });

    return true;
  } catch (error) {
    logger.error('RateLimit', 'Check failed, allowing request', { error });
    // Fail open: allow requests when KV errors — email/iMove must fire
    return true;
  }
}

/**
 * Get remaining requests
 */
export async function getRemainingRequests(context: APIContext): Promise<number> {
  const { request } = context;

  const kv = safeKV(cfEnv, 'RATE_LIMITER');
  if (!kv) return CONFIG.security.rateLimitRequests;

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const keyHash = generateRateLimitKey(ip);
  const env = CONFIG.debug ? 'dev' : 'prod';
  const key = `rate_limit:${env}:${keyHash}`;

  try {
    const current = await kvGet<string>(kv, key);
    if (!current) return CONFIG.security.rateLimitRequests;

    // Stored as `count:resetAtMs`; parseInt stops at the colon.
    const count = Number.parseInt(current, 10);
    if (Number.isNaN(count)) return CONFIG.security.rateLimitRequests;
    return Math.max(0, CONFIG.security.rateLimitRequests - count);
  } catch {
    return CONFIG.security.rateLimitRequests;
  }
}

/**
 * Create rate limit response
 * Includes CORS headers so the browser can read the error
 */
export function createRateLimitResponse(
  errorId: string,
  corsHeaders: Record<string, string> = {}
): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: 'Rate limit exceeded. Please try again later.',
      errorId,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(CONFIG.security.rateLimitWindowMs / 1000),
        ...corsHeaders,
      },
    }
  );
}
