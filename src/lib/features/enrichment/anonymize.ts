/**
 * IP ANONYMIZATION
 *
 * GDPR-compliant IP hashing
 * Store hash instead of raw IP in production
 */

import { CONFIG } from '@/lib/config';
import { logger } from '@/lib/utils/logger';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { env as cfEnv } from 'cloudflare:workers';

/**
 * Anonymize IP address
 * Always hashes in production; returns raw IP only in development
 * Never stores raw IP in production regardless of feature flags
 */
export function anonymizeIP(ip: string): { raw: string | null; hash: string } {
  if (!CONFIG.features.ipAnonymization) {
    // Development mode: store raw IP
    return { raw: ip, hash: '' };
  }

  // Production mode: hash IP with salt for GDPR compliance
  // Salt comes from environment variable; falls back to a default only in development
  const salt = (cfEnv as unknown as Record<string, unknown>).IP_HASH_SALT as string | undefined
    || (CONFIG.debug ? 'dev-ip-salt' : '');
  if (!salt) {
    logger.error('Enrichment', 'IP_HASH_SALT not configured, cannot hash IP');
    return { raw: null, hash: '' };
  }

  // Truncate the IP to a network prefix BEFORE hashing — IPv4 to /24, IPv6
  // to /48. Hashing a full address with a single static salt is only
  // pseudonymisation (the ~4B IPv4 space is brute-forceable if the salt
  // leaks); dropping host bits makes the value genuinely non-identifying
  // while still useful as a coarse dedup/geo signal.
  const truncated = truncateIPForHashing(ip);
  const salted = new TextEncoder().encode(salt + ':' + truncated);
  const hash = sha256(salted);
  const hashHex = bytesToHex(hash);

  logger.debug('Enrichment', 'IP anonymized');

  // Never return raw IP in production
  return {
    raw: null,
    hash: hashHex,
  };
}

/**
 * Reduce an IP to a network prefix so host bits don't end up in the hash.
 * IPv4 → /24 (zero the last octet); IPv6 → /48 (keep the first 3 hextets).
 * Falls back to the original string for anything unparseable.
 */
function truncateIPForHashing(ip: string): string {
  const trimmed = ip.trim();
  // IPv4 (incl. IPv4-mapped suffix handled by the dotted check)
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(trimmed)) {
    const parts = trimmed.split('.');
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }
  // IPv6
  if (trimmed.includes(':')) {
    const hextets = trimmed.split(':');
    return `${hextets.slice(0, 3).join(':')}::`;
  }
  return trimmed;
}

/**
 * Get IP from request headers
 */
export function getIPFromRequest(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

/**
 * Check if IP is from Cloudflare
 */
export function isCloudflareIP(request: Request): boolean {
  return !!request.headers.get('CF-Ray');
}

/**
 * Get country from Cloudflare headers
 */
export function getCountryFromRequest(request: Request): string | null {
  return request.headers.get('CF-IPCountry');
}
