/**
 * Server-side tracking helpers (GA4 Measurement Protocol).
 *
 * Used from `save-quote.ts` (engagement event mirror), the abandonment
 * beacon endpoint, and the contact / clearance-callback conversion
 * backstops. Meta CAPI is NOT sent from here anymore — the Soborbo
 * event-gateway Worker owns the server-side Meta leg (see
 * `docs/tracking-worker-rebuild.md`); the old `sendMetaCapi` was removed
 * at cutover (runbook §6, `docs/gateway-golive.md`).
 *
 * All sends are best-effort: failures are logged but never thrown — the
 * primary tracking signal is the browser side, server is a redundancy
 * layer.
 */

import { logger } from '@/lib/utils/logger';

interface ServerEnv {
  GA4_MEASUREMENT_ID?: string;
  GA4_API_SECRET?: string;
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
 * ATTRIBUTION: an MP hit with only a `client_id` lands in GA4 as
 * Unassigned / source "(not set)" and can never be tied back to a
 * gclid — which shows up downstream as £spend with 0 conversions in
 * Google Ads even when the leads exist. To stitch the hit into the
 * browser session (and inherit its source/medium/gclid) every event
 * needs `session_id` + `engagement_time_msec`, and `page_location`
 * for the page dimension. Pass `sessionId`/`pageLocation` via
 * options (see `ga4SessionIdFromRequest` / `pageLocationFromRequest`)
 * — they are merged into every event's params unless the event
 * already carries its own value.
 */
export async function sendGA4MP(
  env: ServerEnv,
  clientId: string,
  events: GA4MPEvent[],
  options: {
    userId?: string;
    ipOverride?: string;
    userAgent?: string;
    sessionId?: string;
    pageLocation?: string;
  } = {},
): Promise<void> {
  const measurementId = env.GA4_MEASUREMENT_ID;
  const apiSecret = env.GA4_API_SECRET;
  if (!measurementId || !apiSecret) {
    logger.debug('GA4MP', 'Skipping send — measurement_id or api_secret missing');
    return;
  }

  // Session-stitching params. Caller-provided event params always win —
  // the spread order below only fills gaps. `engagement_time_msec` is
  // required for the hit to register against the session at all, so it
  // gets a floor value even when the caller didn't set one.
  const enrichedEvents = events.map((event) => ({
    name: event.name,
    params: {
      ...(options.sessionId ? { session_id: options.sessionId } : {}),
      ...(options.pageLocation ? { page_location: options.pageLocation } : {}),
      engagement_time_msec: 1,
      ...event.params,
    },
  }));

  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
  const body = {
    client_id: clientId,
    ...(options.userId ? { user_id: options.userId } : {}),
    events: enrichedEvents,
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

/**
 * Extracts the browser's GA4 `client_id` from the `_ga` cookie on a
 * same-origin request, so server-side MP hits attach to the SAME GA4
 * user the browser-side gtag reports under. `_ga` format is
 * `GA1.<domain-level>.<random>.<timestamp>` — the client_id is always
 * the last two segments (robust against GA1.1/GA1.2/GA1.3 variants).
 * Returns undefined when the cookie is absent (consent denied, first
 * hit, cookieless) — callers fall back to a fingerprint-derived id.
 */
export function ga4ClientIdFromRequest(request: Request): string | undefined {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(/(?:^|;\s*)_ga=([^;]+)/);
  if (!match) return undefined;
  const parts = decodeURIComponent(match[1]!).split('.');
  if (parts.length < 4) return undefined;
  const clientId = parts.slice(-2).join('.');
  // Sanity: both segments must be numeric-ish; reject junk cookies.
  return /^\d+\.\d+$/.test(clientId) ? clientId : undefined;
}

/**
 * Extracts the browser's GA4 `session_id` from the `_ga_<STREAM>` cookie
 * (`<STREAM>` = the measurement ID minus its `G-` prefix). Without this
 * on the MP hit, GA4 mints a phantom session with no source/medium —
 * the event lands as Unassigned / "(not set)" and Google Ads can't
 * match it to a gclid. Handles both cookie generations:
 *
 *   GS1.1.1712345678.5.1.1712345699.60.0.0            → 1712345678
 *   GS2.1.s1712345678$o5$g1$t1712345699$j60$l0$h0     → 1712345678
 *
 * Returns undefined when the cookie is absent (consent denied, first
 * hit, cookieless) — callers just omit session_id and accept the
 * Unassigned fallback for that minority of hits.
 */
export function ga4SessionIdFromRequest(
  request: Request,
  measurementId?: string,
): string | undefined {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return undefined;
  const stream = measurementId?.replace(/^G-/, '');
  // With a known measurement ID, match its exact stream cookie; without
  // one, accept any _ga_* cookie (single-stream site).
  const pattern = stream
    ? new RegExp(`(?:^|;\\s*)_ga_${stream.replace(/[^A-Z0-9]/gi, '')}=([^;]+)`)
    : /(?:^|;\s*)_ga_[A-Z0-9]+=([^;]+)/;
  const match = cookieHeader.match(pattern);
  if (!match) return undefined;
  const value = decodeURIComponent(match[1]!);
  // GS2+: session id is the `s<digits>` field.
  const gs2 = value.match(/^GS\d+\.\d+\.s(\d+)/);
  if (gs2) return gs2[1];
  // GS1: dot-separated, session id is the third segment.
  const parts = value.split('.');
  if (parts.length >= 3 && /^\d+$/.test(parts[2]!)) return parts[2];
  return undefined;
}

/**
 * Best-effort `page_location` for a server-side MP hit: the Referer of
 * the same-origin API POST is the page the user was on when the request
 * fired (default referrer policy sends the full URL same-origin).
 * Returns undefined for missing/non-http values.
 */
export function pageLocationFromRequest(request: Request): string | undefined {
  const referer = request.headers.get('Referer');
  if (!referer || !/^https?:\/\//.test(referer)) return undefined;
  return referer.slice(0, 500);
}

/**
 * Creates a STABLE GA4 `client_id` from a fingerprint. GA4 expects a
 * dot-separated `random.timestamp` shape but accepts any string. Both
 * segments are derived from the fingerprint hex (NOT Date.now), so the same
 * fingerprint always maps to the same client_id — otherwise the timestamp
 * suffix changed every second and the same user fragmented into a new GA4
 * "user"/session on every server-side hit (e.g. each abandonment beacon).
 */
export function deriveClientId(fingerprint: string): string {
  if (fingerprint && fingerprint.length >= 16) {
    const head = parseInt(fingerprint.slice(0, 8), 16);
    const tail = parseInt(fingerprint.slice(8, 16), 16);
    if (Number.isFinite(head) && Number.isFinite(tail)) {
      return `${head}.${tail}`;
    }
  }
  if (fingerprint && fingerprint.length >= 8) {
    const head = parseInt(fingerprint.slice(0, 8), 16);
    if (Number.isFinite(head)) {
      return `${head}.${head}`;
    }
  }
  // No usable fingerprint — fall back to a random id (not stable, but this
  // path shouldn't be hit for real traffic).
  return `${Math.floor(Math.random() * 1e10)}.${Math.floor(Date.now() / 1000)}`;
}
