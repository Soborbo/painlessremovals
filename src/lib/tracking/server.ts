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
