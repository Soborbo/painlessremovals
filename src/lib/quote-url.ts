/**
 * QUOTE URL ENCODING
 *
 * Encodes/decodes calculator state for shareable URL links.
 * Only includes quote-relevant fields — contact info excluded for privacy.
 *
 * The signed token is a `<base64-payload>.<base64-hmac>` pair. Signing
 * happens server-side only (server holds the secret). Client builds an
 * unsigned encoded payload and POSTs it to `/api/quote-url/verify` to
 * load a shared quote, or receives a signed URL from `/api/save-quote`
 * to put in share buttons / customer emails.
 *
 * The unsigned encoded form is also sent to the server in the
 * save-quote payload so the server can re-sign it under its own secret
 * — i.e. we trust the SHAPE of the encoded payload through `safeParse`,
 * never the implied identity.
 */

import type { CalculatorState } from './calculator-store';
import { LocalStorageStateSchema } from './calculator-store';

// All fields needed to recalculate and display the quote.
// Contact info, tracking params, and session metadata are intentionally excluded.
const QUOTE_FIELDS = [
  'serviceType',
  'propertySize',
  'officeSize',
  'furnitureOnly',
  'sliderPosition',
  'useManualOverride',
  'manualMen',
  'manualVans',
  'dateFlexibility',
  'selectedDate',
  'complications',
  'propertyChain',
  'fromAddress',
  'toAddress',
  'distances',
  'keyWaitWaiver',
  'extras',
  'clearance',
] as const satisfies ReadonlyArray<keyof CalculatorState>;

export function encodeQuoteState(state: CalculatorState): string {
  const partial: Record<string, unknown> = {};
  for (const field of QUOTE_FIELDS) {
    const value = state[field];
    if (value !== undefined && value !== null) {
      partial[field] = value;
    }
  }
  const json = JSON.stringify(partial);
  // TextEncoder handles non-ASCII (e.g. accented address chars) before base64
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    const chunk = bytes.subarray(i, Math.min(i + 8192, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  // URL-safe base64 (no +, /, or = characters)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Decode WITHOUT signature verification. The result is trusted only as
 * far as `safeParse` allows — the caller MUST gate any state-changing
 * action (auto-submit, conversion fire) on a separate signature check.
 *
 * Used server-side after HMAC verification, and as a defensive shape
 * check for tokens that have already been verified.
 */
export function decodeQuoteState(encoded: string): Partial<CalculatorState> | null {
  try {
    // Restore standard base64 from URL-safe variant, add padding
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '=='.slice(0, (4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const result = LocalStorageStateSchema.partial().safeParse(parsed);
    if (!result.success) return null;
    return result.data as Partial<CalculatorState>;
  } catch {
    return null;
  }
}

/**
 * Token format: `<urlsafe-base64-payload>.<urlsafe-base64-hmac>`.
 * Two-part split is sufficient — neither half contains '.' because
 * urlsafe base64 strips '+', '/', and '=' to '-', '_', '' respectively.
 */
export function splitQuoteToken(token: string): { payload: string; sig: string } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  if (!payload || !sig) return null;
  return { payload, sig };
}
