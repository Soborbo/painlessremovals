/**
 * PAYLOAD SIZE LIMIT
 *
 * Prevents large payloads from consuming memory
 * 1MB default limit
 * Checks both Content-Length header and rejects missing Content-Length
 */

import { CONFIG } from '@/lib/config';
import { logger } from '@/lib/utils/logger';
import type { APIContext } from 'astro';

/**
 * Check payload size
 * Returns true if within limit
 * Rejects requests without Content-Length to prevent chunked bypass
 */
export async function checkPayloadSize(context: APIContext): Promise<boolean> {
  if (!CONFIG.features.payloadLimit) {
    return true; // Feature disabled
  }

  const contentLength = context.request.headers.get('Content-Length');

  if (!contentLength) {
    // Reject requests without Content-Length to prevent chunked transfer bypass
    logger.warn('Security', 'Missing Content-Length header, rejecting request');
    return false;
  }

  const size = Number.parseInt(contentLength, 10);

  if (isNaN(size)) {
    logger.warn('Security', 'Invalid Content-Length header');
    return false;
  }

  if (size > CONFIG.security.maxPayloadSize) {
    logger.warn('Security', 'Payload too large', {
      size,
      limit: CONFIG.security.maxPayloadSize,
    });
    return false;
  }

  return true;
}

/**
 * Create payload too large response
 * Includes CORS headers so the browser can read the error
 */
export function createPayloadTooLargeResponse(
  errorId: string,
  corsHeaders: Record<string, string> = {}
): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: 'Payload too large',
      maxSize: CONFIG.security.maxPayloadSize,
      errorId,
    }),
    {
      status: 413,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    }
  );
}
