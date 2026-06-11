/**
 * CRM webhook request signer.
 *
 * Produces the header set the Painless-CRM inbound receivers verify. The
 * canonical signature base is `${timestamp}.${version}.${rawBody}` and the
 * signature is HMAC-SHA256, lowercase hex, prefixed with `sha256=`.
 *
 * SECURITY: this module runs SERVER-SIDE ONLY (Cloudflare Worker / Astro
 * server endpoint). The HMAC secret must never reach the browser — do not
 * import this from client components and never expose CRM_WEBHOOK_SECRET via
 * a PUBLIC_ env var.
 *
 * Hashing uses WebCrypto (`crypto.subtle`) because this is the Workers
 * runtime; there is no Node `crypto` module guaranteed at the edge.
 */

/** The only webhook protocol version the CRM allow-lists. */
export const WEBHOOK_VERSION = '1.0';

// Intersection with Record<string, string> gives the index signature that
// `fetch`'s HeadersInit requires, while still documenting the known keys.
export type SignedWebhookHeaders = Record<string, string> & {
  'content-type': 'application/json';
  'x-webhook-signature': string;
  'x-webhook-timestamp': string;
  'x-webhook-version': string;
};

const encoder = new TextEncoder();

/** Lowercase hex encoding of a byte buffer. */
function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/**
 * Returns the lowercase-hex HMAC-SHA256 of the canonical base string
 * `${timestamp}.${version}.${rawBody}`. No `sha256=` prefix — that is added
 * when building the header. `rawBody` MUST be the exact byte string sent as
 * the request body (serialize once, sign that string, send that string).
 */
export async function signWebhook(
  secret: string,
  rawBody: string,
  timestamp: number | string,
  version: string = WEBHOOK_VERSION,
): Promise<string> {
  const base = `${timestamp}.${version}.${rawBody}`;
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(base));
  return toHex(signature);
}

/**
 * Builds the full header set for a signed webhook POST. The timestamp is
 * unix seconds (defaults to now); the CRM rejects timestamps outside ±300s
 * of its own clock, so callers re-build headers on each retry attempt.
 */
export async function buildSignedHeaders(
  secret: string,
  rawBody: string,
  options: { timestamp?: number; version?: string } = {},
): Promise<SignedWebhookHeaders> {
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const version = options.version ?? WEBHOOK_VERSION;
  const hex = await signWebhook(secret, rawBody, timestamp, version);
  return {
    'content-type': 'application/json',
    'x-webhook-signature': `sha256=${hex}`,
    'x-webhook-timestamp': String(timestamp),
    'x-webhook-version': version,
  };
}
