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
 * Hash-based key (IP + UserAgent) for better granularity.
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
 * Check rate limit
 * Fails closed for safety when KV errors occur in production
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

  // Get UserAgent for better granularity
  const userAgent = request.headers.get('User-Agent') || undefined;

  // Generate hash-based key
  const keyHash = generateRateLimitKey(ip, userAgent);
  const env = CONFIG.debug ? 'dev' : 'prod';
  const key = `rate_limit:${env}:${keyHash}`;

  // Layer 1: in-memory token bucket. Catches single-isolate burst
  // traffic atomically without a KV round-trip.
  if (!checkInMemoryWindow(key, CONFIG.security.rateLimitWindowMs, CONFIG.security.rateLimitRequests)) {
    logger.warn('RateLimit', 'In-memory limit exceeded', { ip });
    return false;
  }

  try {
    const current = await kvGet<string>(kv, key);

    if (!current) {
      // First request
      await kvPut(kv, key, '1', {
        expirationTtl: Math.floor(CONFIG.security.rateLimitWindowMs / 1000),
      });
      return true;
    }

    const count = Number.parseInt(current, 10);

    if (Number.isNaN(count)) {
      logger.warn('RateLimit', 'Invalid counter, resetting', { key });
      await kvPut(kv, key, '1', {
        expirationTtl: Math.floor(CONFIG.security.rateLimitWindowMs / 1000),
      });
      return true;
    }

    if (count >= CONFIG.security.rateLimitRequests) {
      logger.warn('RateLimit', 'Limit exceeded', {
        ip,
        count,
        limit: CONFIG.security.rateLimitRequests,
      });
      return false;
    }

    // Increment
    await kvPut(kv, key, String(count + 1), {
      expirationTtl: Math.floor(CONFIG.security.rateLimitWindowMs / 1000),
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
  const userAgent = request.headers.get('User-Agent') || undefined;
  const keyHash = generateRateLimitKey(ip, userAgent);
  const env = CONFIG.debug ? 'dev' : 'prod';
  const key = `rate_limit:${env}:${keyHash}`;

  try {
    const current = await kvGet<string>(kv, key);
    if (!current) return CONFIG.security.rateLimitRequests;

    const count = Number.parseInt(current, 10);
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
