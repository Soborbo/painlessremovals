/**
 * HEALTH CHECK ENDPOINT
 *
 * Returns service status
 * Used by monitoring tools, load balancers
 */

import { CONFIG } from '@/lib/config';
import { logger } from '@/lib/utils/logger';
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  let result = 0;
  for (let i = 0; i < ab.length; i++) {
    result |= (ab[i] as number) ^ (bb[i] as number);
  }
  return result === 0;
}

export const GET: APIRoute = async ({ request }) => {
  logger.debug('API', 'Health check requested');

  const healthToken = request.headers.get('Authorization') || request.headers.get('X-Health-Token');

  // Public response: minimal info only (no version exposed)
  const publicHealth = {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };

  // If no auth header, return only public info
  if (!healthToken) {
    return new Response(JSON.stringify(publicHealth, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, must-revalidate',
      },
    });
  }

  // Validate the token against a known secret (constant-time comparison)
  const expectedToken = env.HEALTH_CHECK_TOKEN;
  const expected = `Bearer ${expectedToken || ''}`;
  const isValidToken = expectedToken
    && healthToken.length === expected.length
    && crypto.subtle !== undefined
    && timingSafeEqual(healthToken, expected);
  if (!isValidToken) {
    return new Response(JSON.stringify(publicHealth, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, must-revalidate',
      },
    });
  }

  // Authenticated response: include detailed info
  const detailedHealth = {
    ...publicHealth,
    version: '2.0.0',
    environment: env.ENVIRONMENT || 'unknown',
    features: {
      analytics: CONFIG.features.analytics,
      auth: CONFIG.features.auth,
      crmSync: CONFIG.features.crmSync,
      rateLimiting: CONFIG.features.rateLimiting,
      errorTracking: CONFIG.features.errorTracking,
    },
    checks: {
      email: !!env.RESEND_API_KEY,
      kv: !!env.RATE_LIMITER,
    },
  };

  return new Response(JSON.stringify(detailedHealth, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
};
