/**
 * Server-side tracking helpers (GA4 Measurement Protocol + Meta CAPI).
 *
 * Used from `save-quote.ts` (engagement event mirror), the abandonment
 * beacon endpoint, and the `/api/meta/capi` ingress for client-driven
 * Meta CAPI mirrors.
 *
 * All sends are best-effort: failures are logged but never thrown — the
 * primary tracking signal is the browser side, server is a redundancy
 * layer.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { logger } from '@/lib/utils/logger';
import {
  normalizePhoneE164,
  type CountryCode,
  type UserData,
} from './tracking';
import { DEFAULT_COUNTRY, META_GRAPH_API_VERSION } from './config';

interface ServerEnv {
  GA4_MEASUREMENT_ID?: string;
  GA4_API_SECRET?: string;
  META_PIXEL_ID?: string;
  META_CAPI_ACCESS_TOKEN?: string;
  META_CAPI_TEST_EVENT_CODE?: string;
}

// ---------------------------------------------------------------------------
// SHA-256 hashing for Meta CAPI
// ---------------------------------------------------------------------------

const enc = new TextEncoder();

function hash(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return bytesToHex(sha256(enc.encode(value.trim().toLowerCase())));
}

function hashPostal(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return bytesToHex(sha256(enc.encode(value.replace(/\s/g, '').toUpperCase())));
}

function hashCountry(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return bytesToHex(sha256(enc.encode(value.trim().toLowerCase().slice(0, 2))));
}

// ---------------------------------------------------------------------------
// GA4 Measurement Protocol
// ---------------------------------------------------------------------------

export interface GA4MPEvent {
  name: string;
  params?: Record<string, unknown>;
}

/**
 * Sends one or more events to GA4 via Measurement Protocol. Uses a
 * stable `client_id` (caller-provided, e.g. derived from request
 * fingerprint) so server-side hits attribute to the same user the
 * browser-side gtag is reporting under, when possible.
 *
 * Server-side hits do NOT carry browser context (no _ga cookie, no
 * gclid auto-resolution). Use this primarily for events the browser
 * may not have a chance to fire (abandonment, late conversions where
 * we know the tab closed) — not as a primary conversion path.
 */
export async function sendGA4MP(
  env: ServerEnv,
  clientId: string,
  events: GA4MPEvent[],
  options: { userId?: string; ipOverride?: string; userAgent?: string } = {},
): Promise<void> {
  const measurementId = env.GA4_MEASUREMENT_ID;
  const apiSecret = env.GA4_API_SECRET;
  if (!measurementId || !apiSecret) {
    logger.debug('GA4MP', 'Skipping send — measurement_id or api_secret missing');
    return;
  }

  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
  const body = {
    client_id: clientId,
    ...(options.userId ? { user_id: options.userId } : {}),
    events,
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      logger.warn('GA4MP', `Non-2xx response: ${res.status}`);
    }
  } catch (err) {
    logger.warn('GA4MP', 'Send failed', { error: err instanceof Error ? err.message : String(err) });
  }
}

// ---------------------------------------------------------------------------
// Meta Conversions API
// ---------------------------------------------------------------------------

export interface MetaCapiEvent {
  event_name: string;
  event_id: string;
  event_time: number;
  event_source_url?: string;
  action_source?: 'website';
  user_data?: UserData & {
    fbp?: string;
    fbc?: string;
    client_user_agent?: string;
    client_ip_address?: string;
  };
  custom_data?: Record<string, unknown>;
}

export async function sendMetaCapi(
  env: ServerEnv,
  events: MetaCapiEvent[],
  countryCode: CountryCode = DEFAULT_COUNTRY,
): Promise<void> {
  const pixelId = env.META_PIXEL_ID;
  const accessToken = env.META_CAPI_ACCESS_TOKEN;
  if (!pixelId || !accessToken) {
    logger.debug('MetaCAPI', 'Skipping send — pixel_id or access_token missing');
    return;
  }

  const transformed = events.map((evt) => {
    const ud = evt.user_data || {};
    // Meta CAPI expects phone hashed as digits-only (no leading `+`),
    // per the spec at developers.facebook.com/docs/marketing-api/audiences/guides/advanced-matching.
    // Previously we fed the full E.164 string `+447700...` into SHA-256
    // and Meta's hash of `447700...` never matched ours, collapsing
    // browser+CAPI dedup match quality.
    const phoneE164 = ud.phone_number ? normalizePhoneE164(ud.phone_number, countryCode) : undefined;
    const phoneForHash = phoneE164 ? phoneE164.replace(/^\+/, '') : undefined;
    // Hash each PII field exactly once. Earlier code called hash(...)
    // twice per field (once in the conditional, once in the value),
    // burning CPU and complicating diffs. Cache the result locally.
    const em = hash(ud.email);
    const ph = hash(phoneForHash);
    const fn = hash(ud.first_name);
    const ln = hash(ud.last_name);
    const ct = hash(ud.city);
    const zp = hashPostal(ud.postal_code);
    const country = hashCountry(ud.country);
    return {
      event_name: evt.event_name,
      event_id: evt.event_id,
      event_time: evt.event_time,
      event_source_url: evt.event_source_url,
      action_source: evt.action_source || 'website',
      user_data: {
        em: em ? [em] : undefined,
        ph: ph ? [ph] : undefined,
        fn: fn ? [fn] : undefined,
        ln: ln ? [ln] : undefined,
        ct: ct ? [ct] : undefined,
        zp: zp ? [zp] : undefined,
        country: country ? [country] : undefined,
        fbp: ud.fbp,
        fbc: ud.fbc,
        client_user_agent: ud.client_user_agent,
        client_ip_address: ud.client_ip_address,
      },
      custom_data: evt.custom_data,
    };
  });

  const payload: Record<string, unknown> = { data: transformed };
  if (env.META_CAPI_TEST_EVENT_CODE) {
    payload.test_event_code = env.META_CAPI_TEST_EVENT_CODE;
  }

  const url = `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(accessToken)}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.warn('MetaCAPI', `Non-2xx response: ${res.status}`, { body: text.slice(0, 500) });
      return;
    }
  } catch (err) {
    logger.warn('MetaCAPI', 'Send failed', { error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Creates a stable-ish GA4 `client_id` from a fingerprint. GA4 expects a
 * dot-separated random.timestamp shape but accepts any string; we use the
 * fingerprint hex so two server-side hits for the same quote share an id.
 */
export function deriveClientId(fingerprint: string): string {
  if (fingerprint && fingerprint.length >= 8) {
    const head = parseInt(fingerprint.slice(0, 8), 16);
    if (Number.isFinite(head)) {
      return `${head}.${Math.floor(Date.now() / 1000)}`;
    }
  }
  return `${Math.floor(Math.random() * 1e10)}.${Math.floor(Date.now() / 1000)}`;
}
