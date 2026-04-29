/**
 * SERVER-ONLY HELPERS for quote URL signing/verification.
 *
 * The secret comes from the runtime env (`QUOTE_URL_SECRET`, with
 * `IP_HASH_SALT` as a backstop if the dedicated secret isn't set —
 * IP_HASH_SALT is already provisioned and reused as a generic
 * server-only entropy source).
 *
 * The signed token format is `<encoded-payload>.<urlsafe-base64-hmac>`
 * — see `splitQuoteToken` in `./quote-url`. HMAC-SHA-256 is computed
 * over the encoded payload (i.e. the urlsafe-base64 string before the
 * dot), not the raw JSON, so the token is self-contained and cannot
 * be forged without the secret.
 */

import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { splitQuoteToken } from './quote-url';

const enc = new TextEncoder();

interface QuoteUrlEnv {
  QUOTE_URL_SECRET?: string;
  IP_HASH_SALT?: string;
}

function getSecret(env: QuoteUrlEnv): Uint8Array | null {
  const raw = env.QUOTE_URL_SECRET || env.IP_HASH_SALT;
  if (!raw) return null;
  return enc.encode(raw);
}

function urlsafeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    const chunk = bytes.subarray(i, Math.min(i + 8192, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function constantTimeEq(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/**
 * Sign a quote URL payload. Returns `<payload>.<sig>` — the entire
 * value goes into the `?q=` URL parameter.
 *
 * Returns null if no secret is configured.
 */
export function signQuotePayload(payload: string, env: QuoteUrlEnv): string | null {
  const secret = getSecret(env);
  if (!secret) return null;
  const macHex = bytesToHex(hmac(sha256, secret, enc.encode(payload)));
  const macBytes = hexToBytes(macHex);
  return `${payload}.${urlsafeBase64(macBytes)}`;
}

/**
 * Verify a `<payload>.<sig>` token. Returns the raw encoded payload on
 * success, null on any failure (unknown shape, secret unset, HMAC
 * mismatch).
 */
export function verifyQuoteToken(token: string, env: QuoteUrlEnv): string | null {
  const secret = getSecret(env);
  if (!secret) return null;
  const split = splitQuoteToken(token);
  if (!split) return null;
  const expectedHex = bytesToHex(hmac(sha256, secret, enc.encode(split.payload)));
  const expectedBytes = hexToBytes(expectedHex);
  // Decode the provided sig back from urlsafe base64
  let providedB64 = split.sig.replace(/-/g, '+').replace(/_/g, '/');
  providedB64 += '=='.slice(0, (4 - (providedB64.length % 4)) % 4);
  let providedBytes: Uint8Array;
  try {
    const binary = atob(providedB64);
    providedBytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
  if (!constantTimeEq(expectedBytes, providedBytes)) return null;
  return split.payload;
}

/**
 * Build a full signed URL for a save-quote response or a customer
 * email link. The encoded payload comes from the client's
 * `encodeQuoteState`; the server signs and assembles the URL so the
 * secret never leaves the Worker.
 */
export function buildSignedQuoteUrl(payload: string, origin: string, env: QuoteUrlEnv): string | null {
  const signed = signQuotePayload(payload, env);
  if (!signed) return null;
  // Trailing slash required: `trailingSlash: 'always'` in astro.config.mjs.
  return `${origin}/instantquote/your-quote/?q=${encodeURIComponent(signed)}`;
}
