/**
 * Form abandonment beacon endpoint.
 *
 * Receives `navigator.sendBeacon()` payloads from `form-tracking.ts` and
 * forwards them to GA4 Measurement Protocol.
 *
 * Hardening matches `/api/meta/capi`:
 *   - Origin allowlist FAIL-CLOSED.
 *   - Per-IP sliding-window in-memory rate limit (60/min — looser than
 *     CAPI because abandonment beacons fire on every form drop-off,
 *     and a bursty user filling and abandoning multiple forms is
 *     legitimate).
 *   - Field whitelist + length caps.
 *   - OPTIONS preflight responder echoing only allowed origins.
 */

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { CONFIG } from '@/lib/config';
import { logger } from '@/lib/utils/logger';
import { checkRateLimit } from '@/lib/features/security/rate-limit';
import { deriveClientId, sendGA4MP } from '@/lib/tracking/server';
import { isAllowedOrigin } from '@/lib/forms/utils';

export const prerender = false;

const ALLOWED_KEYS = new Set([
  'form_name',
  'last_step',
  'last_field',
  'time_spent_seconds',
  'exit_page_path',
  'exit_page_title',
  'exit_page_url',
]);

const RATE_WINDOW_MS = 60 * 1000;
const RATE_PER_IP_PER_WINDOW = 60;
const ipBuckets = new Map<string, number[]>();

interface AbandonmentPayload {
  form_name?: string;
  last_step?: string;
  last_field?: string;
  time_spent_seconds?: number;
  exit_page_path?: string;
  exit_page_title?: string;
  exit_page_url?: string;
}

function sanitize(input: unknown): AbandonmentPayload {
  if (!input || typeof input !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!ALLOWED_KEYS.has(k)) continue;
    if (typeof v === 'string') out[k] = v.slice(0, 500);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out as AbandonmentPayload;
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !isAllowedOrigin(origin)) {
    return {};
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin',
  };
}

function checkInMemoryRateLimit(ip: string): boolean {
  if (!ip) return true;
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;
  const bucket = ipBuckets.get(ip) || [];
  const fresh = bucket.filter((t) => t > cutoff);
  if (fresh.length >= RATE_PER_IP_PER_WINDOW) {
    ipBuckets.set(ip, fresh);
    return false;
  }
  fresh.push(now);
  ipBuckets.set(ip, fresh);
  if (ipBuckets.size > 5000) {
    for (const [k, v] of ipBuckets) {
      if (!v.length || v[v.length - 1]! < cutoff) ipBuckets.delete(k);
    }
  }
  return true;
}

export const OPTIONS: APIRoute = async ({ request }) => {
  const origin = request.headers.get('Origin');
  const headers = corsHeaders(origin);
  if (Object.keys(headers).length === 0) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, { status: 204, headers });
};

export const POST: APIRoute = async (context) => {
  const { request } = context;
  const origin = request.headers.get('Origin');

  // Origin allowlist — FAIL CLOSED. sendBeacon does set Origin on
  // cross-origin POSTs from the page, so missing-Origin here is
  // suspicious and rejected.
  if (!origin || !isAllowedOrigin(origin)) {
    return new Response(null, { status: 403 });
  }

  const ip = request.headers.get('CF-Connecting-IP') || '';
  if (!checkInMemoryRateLimit(ip)) {
    return new Response(null, { status: 429 });
  }
  const rateLimitOk = await checkRateLimit(context);
  if (!rateLimitOk) {
    return new Response(null, { status: 429 });
  }

  try {
    const raw = (await request.json()) as unknown;
    const payload = sanitize(raw);

    const ua = request.headers.get('User-Agent') || '';
    const clientId = deriveClientId(`${ip}${ua}`.replace(/[^a-f0-9]/gi, '').padEnd(32, '0'));

    await sendGA4MP(env, clientId, [
      {
        name: 'form_abandonment',
        params: payload as Record<string, unknown>,
      },
    ]);
  } catch (err) {
    logger.warn('Abandonment', 'Failed to process beacon', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
};
