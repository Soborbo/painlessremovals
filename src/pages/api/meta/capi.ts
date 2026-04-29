/**
 * Meta Conversions API mirror endpoint.
 *
 * The browser fires Meta Pixel events (Lead, Contact, ViewContent) via
 * GTM. For each conversion the client also POSTs (or `sendBeacon`s)
 * here with the same `event_id` so Meta can dedupe browser + server.
 *
 * Hardening:
 *   - Origin allowlist FAIL-CLOSED: missing or unknown Origin → reject.
 *   - Per-IP sliding-window rate limit (in-memory, 20/min) on top of
 *     the shared KV-backed limiter — small enough that a runaway client
 *     can't burn Meta CAPI quota even before the KV limiter catches it.
 *   - Strict input validation: event_id regex, event_name allowlist,
 *     event_time clamped, custom_data WHITELIST (only value/currency/
 *     content_name with range/regex checks), event_source_url pinned to
 *     our own origin (with Referer fallback), email regex, length caps
 *     on every string.
 *   - Consent re-check: the client sends its Consent Mode snapshot;
 *     we refuse to forward to Meta if ad_storage or ad_user_data is
 *     denied.
 *   - OPTIONS preflight responder echoes only the requesting allowed
 *     origin, never `*`.
 */

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { CONFIG } from '@/lib/config';
import { logger } from '@/lib/utils/logger';
import { checkRateLimit } from '@/lib/features/security/rate-limit';
import { sendMetaCapi, type MetaCapiEvent } from '@/lib/tracking/server';
import { DEFAULT_COUNTRY } from '@/lib/tracking/config';
import { isAllowedOrigin } from '@/lib/forms/utils';
import { kvGet, kvPut, safeKV } from '@/lib/utils/kv';

export const prerender = false;

const ALLOWED_EVENTS = new Set(['Lead', 'Contact', 'ViewContent']);
const SITE_ORIGIN = 'https://painlessremovals.com';

const EVENT_TIME_MIN_AGE_S = 24 * 60 * 60;
const EVENT_TIME_FUTURE_S = 5 * 60;

const EVENT_ID_RE = /^[a-zA-Z0-9_-]{8,200}$/;
const ISO_4217_RE = /^[A-Z]{3}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// _fbp: fb.<subdomain_index>.<ms>.<rand>  — e.g. fb.1.1700000000000.1234567890
const FBP_RE = /^fb\.[0-9]\.[0-9]{10,}\.[0-9]+$/;
// _fbc: fb.<subdomain_index>.<ms>.<click_id>. Newer Meta click IDs can
// include `.`, `:`, and other punctuation, so we accept any non-empty
// trailing segment up to a length cap rather than constraining the
// charset (the prefix `fb.<n>.<ms>.` is still tightly checked).
const FBC_RE = /^fb\.[0-9]\.[0-9]{10,}\..{1,512}$/;

const MAX_EMAIL_LEN = 320;
const MAX_NAME_LEN = 100;
const MAX_PHONE_LEN = 32;
const MAX_CITY_LEN = 100;
const MAX_POSTAL_LEN = 20;
const MAX_COUNTRY_LEN = 4;
const MAX_VALUE = 1_000_000;

const RATE_WINDOW_MS = 60 * 1000;
const RATE_PER_IP_PER_WINDOW = 20;
const ipBuckets = new Map<string, number[]>();

interface IncomingPayload {
  event_name?: unknown;
  event_id?: unknown;
  event_time?: unknown;
  event_source_url?: unknown;
  user_data?: unknown;
  custom_data?: unknown;
  consent?: unknown;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function clampEventTime(input: unknown): number | null {
  const now = Math.floor(Date.now() / 1000);
  if (typeof input !== 'number' || !Number.isFinite(input)) return now;
  // Out-of-window event times are signal-poisoning candidates (a
  // hostile client can shift attribution time). Reject rather than
  // silently clamping.
  if (input < now - EVENT_TIME_MIN_AGE_S) return null;
  if (input > now + EVENT_TIME_FUTURE_S) return null;
  return Math.floor(input);
}

function corsHeaders(origin: string | null): Record<string, string> {
  // Echo only allowed origins. Never `*` — this endpoint reads PII.
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
  if (!ip) return true; // can't bucket without an IP, fall through to KV limiter
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
  // Periodic GC: keep the map bounded.
  if (ipBuckets.size > 5000) {
    for (const [k, v] of ipBuckets) {
      if (!v.length || v[v.length - 1]! < cutoff) ipBuckets.delete(k);
    }
  }
  return true;
}

// Apex and www are both legitimate origins for our site. Either one is
// accepted in `event_source_url` (path is preserved); the canonical
// host is the apex.
const ACCEPTED_HOSTS = new Set(['painlessremovals.com', 'www.painlessremovals.com']);

function pickEventSourceUrl(input: unknown, referer: string | null): string {
  // Pin to our own origin. If the client sent something off-domain or
  // empty, fall back to the Referer header (also enforced to our origin).
  for (const candidate of [input, referer]) {
    if (typeof candidate !== 'string') continue;
    try {
      const u = new URL(candidate);
      if (u.protocol === 'https:' && ACCEPTED_HOSTS.has(u.host)) {
        return u.toString().slice(0, 2000);
      }
    } catch {
      // not a URL
    }
  }
  return `${SITE_ORIGIN}/`;
}

function pickCustomData(input: unknown): Record<string, unknown> {
  // Whitelist + range/regex validation. Anything else is dropped — we
  // do NOT echo arbitrary client attributes to Meta because Smart
  // Bidding consumes value/currency for optimisation and a hostile
  // client could otherwise pollute the signal.
  const out: Record<string, unknown> = {};
  if (!isPlainObject(input)) return out;

  if (typeof input.value === 'number' && Number.isFinite(input.value)) {
    const v = input.value;
    if (v >= 0 && v <= MAX_VALUE) out.value = v;
  }
  if (typeof input.currency === 'string' && ISO_4217_RE.test(input.currency)) {
    out.currency = input.currency;
  }
  if (typeof input.content_name === 'string' && input.content_name.length > 0 && input.content_name.length <= 200) {
    out.content_name = input.content_name;
  }
  return out;
}

function consentAllowsAds(input: unknown): boolean {
  if (!isPlainObject(input)) return false;
  return input.ad_storage === 'granted' && input.ad_user_data === 'granted';
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

  // Origin allowlist — FAIL CLOSED. Missing Origin is suspicious for
  // this endpoint (browser sendBeacon/fetch always sets it on
  // cross-origin POSTs). Same-origin omits Origin per spec, but our
  // custom domain is always cross-origin to the *.workers.dev preview;
  // and on production the page origin matches an allowlist entry.
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
    const body = (await request.json()) as IncomingPayload;

    if (!isPlainObject(body)) {
      return new Response(JSON.stringify({ error: 'invalid body' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    if (typeof body.event_name !== 'string' || !ALLOWED_EVENTS.has(body.event_name)) {
      return new Response(JSON.stringify({ error: 'event_name not allowed' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (typeof body.event_id !== 'string' || !EVENT_ID_RE.test(body.event_id)) {
      return new Response(JSON.stringify({ error: 'event_id invalid' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Replay protection. Without this, a captured (event_name, event_id)
    // pair could be replayed to poison Smart Bidding signals. KV is
    // eventually consistent so this is best-effort, but combined with
    // the per-IP rate limit it's enough to make replay attacks
    // unattractive.
    const seenKv = safeKV(env, 'RATE_LIMITER');
    if (seenKv) {
      const seenKey = `capi_seen:${body.event_name}:${body.event_id}`;
      const seen = await kvGet<string>(seenKv, seenKey);
      if (seen) {
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
      }
      // Stake the claim immediately so a near-simultaneous replay loses.
      // 25h TTL covers the EVENT_TIME_MIN_AGE_S window plus a margin.
      await kvPut(seenKv, seenKey, '1', { expirationTtl: 90_000 });
    }

    // Consent re-check (defense in depth — client already gated, but
    // we don't trust the client). Refuse to forward if ads consent is
    // not granted.
    if (!consentAllowsAds(body.consent)) {
      return new Response(null, { status: 204 });
    }

    const ua = request.headers.get('User-Agent') || undefined;
    const incomingUserData = isPlainObject(body.user_data) ? body.user_data : {};

    const userData: MetaCapiEvent['user_data'] = {};
    if (typeof incomingUserData.email === 'string' && incomingUserData.email.length <= MAX_EMAIL_LEN && EMAIL_RE.test(incomingUserData.email)) {
      userData.email = incomingUserData.email;
    }
    if (typeof incomingUserData.phone_number === 'string' && incomingUserData.phone_number.length <= MAX_PHONE_LEN) {
      userData.phone_number = incomingUserData.phone_number;
    }
    if (typeof incomingUserData.first_name === 'string' && incomingUserData.first_name.length <= MAX_NAME_LEN) {
      userData.first_name = incomingUserData.first_name;
    }
    if (typeof incomingUserData.last_name === 'string' && incomingUserData.last_name.length <= MAX_NAME_LEN) {
      userData.last_name = incomingUserData.last_name;
    }
    if (typeof incomingUserData.city === 'string' && incomingUserData.city.length <= MAX_CITY_LEN) {
      userData.city = incomingUserData.city;
    }
    if (typeof incomingUserData.postal_code === 'string' && incomingUserData.postal_code.length <= MAX_POSTAL_LEN) {
      userData.postal_code = incomingUserData.postal_code;
    }
    userData.country = (typeof incomingUserData.country === 'string' && incomingUserData.country.length <= MAX_COUNTRY_LEN)
      ? incomingUserData.country
      : DEFAULT_COUNTRY;
    if (typeof incomingUserData.fbp === 'string' && FBP_RE.test(incomingUserData.fbp)) {
      userData.fbp = incomingUserData.fbp;
    }
    if (typeof incomingUserData.fbc === 'string' && FBC_RE.test(incomingUserData.fbc)) {
      userData.fbc = incomingUserData.fbc;
    }
    if (ua) userData.client_user_agent = ua;
    if (ip) userData.client_ip_address = ip;

    const eventTime = clampEventTime(body.event_time);
    if (eventTime === null) {
      return new Response(JSON.stringify({ error: 'event_time out of range' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const event: MetaCapiEvent = {
      event_name: body.event_name,
      event_id: body.event_id,
      event_time: eventTime,
      action_source: 'website',
      user_data: userData,
      custom_data: pickCustomData(body.custom_data),
      event_source_url: pickEventSourceUrl(body.event_source_url, request.headers.get('Referer')),
    };

    await sendMetaCapi(env, [event], DEFAULT_COUNTRY);
  } catch (err) {
    logger.warn('MetaCAPI', 'Failed to process mirror request', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return new Response(null, { status: 204, headers: corsHeaders(origin) });
};
