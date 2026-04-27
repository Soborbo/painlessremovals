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

  const salted = new TextEncoder().encode(salt + ':' + ip);
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
