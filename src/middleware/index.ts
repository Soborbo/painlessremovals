/**
 * GLOBAL MIDDLEWARE
 *
 * Handles:
 * - Boot application
 * - Error tracking (server-side)
 * - Security headers
 * - Global error handling
 */

import { defineMiddleware } from 'astro:middleware';
import { bootApp } from '@/lib/boot';
import { trackServerError, buildErrorConfig } from '@/lib/errors/tracker-server';
import { logger } from '@/lib/utils/logger';
import { env } from 'cloudflare:workers';

// Track if boot already ran
let _booted = false;

/**
 * Global middleware
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const { url } = context;

  // Boot app once (first request)
  if (!_booted) {
    try {
      await bootApp(env);
      _booted = true;
      logger.info('Middleware', 'Application booted successfully');
    } catch (error) {
      logger.error('Middleware', 'Boot failed', { error });
    }
  }

  let response: Response;

  try {
    // Continue to route handler
    response = await next();
  } catch (error) {
    // Catch unhandled errors
    logger.error('Middleware', 'Unhandled route error', { error });

    // Track via error tracking system
    try {
      const errorConfig = buildErrorConfig(env as unknown as Record<string, string>);
      await trackServerError(
        'SRV-FUNC-001',
        error,
        { functionPath: url.pathname, errorMessage: error instanceof Error ? error.message : String(error) },
        errorConfig,
      );
    } catch {
      // Never let error tracking break the middleware
    }

    // Return 500 error page
    return new Response('Internal Server Error', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Security headers
  const headers = new Headers(response.headers);

  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-XSS-Protection', '1; mode=block');
  // Permissions-Policy is set via public/_headers to avoid duplicates

  // Cache control for API routes
  if (url.pathname.startsWith('/api/')) {
    headers.set('Cache-Control', 'private, no-store, must-revalidate');
    headers.set('Pragma', 'no-cache');
    headers.set('Expires', '0');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});
