/**
 * Pure formatting helpers shared by client form wiring and (potentially) the
 * server. No secrets, safe to import in the browser.
 */

/**
 * Normalize a UK phone string into a CRM-acceptable form. The CRM accepts
 * `^[+0-9 ()-]+$`, 7–20 chars; this strips stray characters and rewrites a
 * national `0XXXXXXXXXX` into `+44XXXXXXXXXX`. Anything that doesn't look UK
 * is returned trimmed (and still passes the CRM regex if it only contains
 * the allowed characters).
 */
export function normalizeUKPhoneForCRM(raw: string | undefined | null): string {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  // Keep only the characters the CRM regex permits.
  const cleaned = trimmed.replace(/[^+0-9 ()-]/g, '');
  const digits = cleaned.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('0')) return `+44${digits.slice(1)}`;
  return cleaned;
}

/**
 * The event-gateway's `event_id` contract (Serverside `isValidConversionPayload`):
 * 1–40 chars of `[A-Za-z0-9_-]`. Anything longer is a hard 400 there — the CRM's
 * outbox books it `failed_permanent` and the conversion is gone. Three callback
 * Leads were lost this way in 2026-07/08 (`cb-<sha1>` = 43 chars).
 */
export const GATEWAY_EVENT_ID_MAX = 40;
export const GATEWAY_EVENT_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

/**
 * The CRM idempotency key for a calculator callback: content-derived so a client
 * retry that re-POSTs identical data dedupes on the CRM. Capped to the gateway
 * contract because the CRM forwards its initial conversion under this id when no
 * separate `tracking_event_id` travels with it.
 */
export function callbackCrmEventId(fingerprint: string): string {
  return `cb-${fingerprint.slice(0, GATEWAY_EVENT_ID_MAX - 3)}`;
}

/** Slugify a free-text label into an affiliate-code-safe token (1–80). */
export function slugifyAffiliateCode(raw: string | undefined | null): string {
  if (!raw) return '';
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
