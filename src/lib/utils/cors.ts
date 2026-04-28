/**
 * CORS HELPER
 *
 * Generate CORS headers based on config.
 * Never use wildcard (*) in production.
 *
 * Delegates to `isAllowedOrigin` (lib/forms/utils.ts) so the production
 * domain, www, Workers preview URLs (*.workers.dev), and legacy Pages
 * preview URLs all match — keeps a single source of truth for what
 * "allowed" means across both the calc API routes and the form API
 * routes.
 */

import { CONFIG } from '@/lib/config';
import { isAllowedOrigin } from '@/lib/forms/utils';

/**
 * Get CORS headers for response
 */
export function getCORSHeaders(origin: string | null): Record<string, string> {
  // Check if origin is allowed
  const isAllowed = !!origin && isAllowedOrigin(origin);

  if (isAllowed) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
      'Access-Control-Allow-Credentials': 'true',
    };
  }

  // Development fallback: only allow explicit localhost origins, never wildcard or arbitrary origins
  if (CONFIG.debug) {
    const devOrigins = ['http://localhost:4321', 'http://localhost:4322'];
    const safeOrigin = origin && devOrigins.includes(origin) ? origin : 'http://localhost:4321';
    return {
      'Access-Control-Allow-Origin': safeOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
  }

  // No CORS headers if origin not allowed
  return {};
}

/**
 * Handle CORS preflight
 */
export function handleCORSPreflight(request: Request): Response {
  const origin = request.headers.get('Origin');
  const headers = getCORSHeaders(origin);

  return new Response(null, {
    status: 204,
    headers,
  });
}
