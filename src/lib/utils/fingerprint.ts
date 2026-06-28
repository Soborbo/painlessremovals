/**
 * FINGERPRINT GENERATION
 *
 * Generate unique hashes for duplicate prevention
 * Uses @noble/hashes (Edge-compatible)
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

/**
 * Recursively sort object keys so that two semantically-identical payloads
 * serialize to identical JSON regardless of key insertion order — at every
 * nesting level, not just the top. Arrays keep their order (order is
 * meaningful); objects are key-sorted.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/**
 * Generate SHA-256 hash from data
 * Used for duplicate detection
 */
export function generateFingerprint(data: unknown): string {
  if (!data || typeof data !== 'object') {
    const json = JSON.stringify(data ?? '');
    const hash = sha256(new TextEncoder().encode(json));
    return bytesToHex(hash);
  }
  // Deep-canonicalize keys (all levels) for order-independent, consistent hashing.
  const json = JSON.stringify(canonicalize(data));
  const hash = sha256(new TextEncoder().encode(json));
  return bytesToHex(hash);
}

/**
 * Generate rate limit key hash
 * Combines IP + UserAgent for better granularity
 */
export function generateRateLimitKey(ip: string, userAgent?: string): string {
  const combined = `${ip}:${userAgent || 'unknown'}`;
  const hash = sha256(new TextEncoder().encode(combined));
  return bytesToHex(hash).substring(0, 32); // First 32 chars (128 bits)
}

/**
 * Generate session ID
 */
export function generateSessionId(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToHex(randomBytes);
}

/**
 * Hash sensitive data (one-way)
 * WARNING: Not suitable for password hashing. Use bcrypt/scrypt/argon2 for passwords.
 * Suitable for hashing tokens, fingerprints, and non-secret identifiers.
 */
export function hashSensitiveData(data: string): string {
  const hash = sha256(new TextEncoder().encode(data));
  return bytesToHex(hash);
}

/**
 * Verify HMAC signature
 * Used for webhook authentication
 */
export async function verifyHMAC(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();

    // Import secret as key
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // Convert hex signature to bytes
    const signatureBytes = hexToBytes(signature);
    const payloadBytes = encoder.encode(payload);

    // Verify signature - use the buffer property
    const sigBuffer = signatureBytes.buffer.slice(
      signatureBytes.byteOffset,
      signatureBytes.byteOffset + signatureBytes.byteLength
    ) as ArrayBuffer;
    return await crypto.subtle.verify('HMAC', key, sigBuffer, payloadBytes);
  } catch (error) {
    return false;
  }
}

/**
 * Generate HMAC signature
 * Used for signing outgoing webhooks
 */
export async function generateHMAC(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();

  // Import secret as key
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // Generate signature
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return bytesToHex(new Uint8Array(signature));
}

/**
 * Helper: hex string to bytes
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
