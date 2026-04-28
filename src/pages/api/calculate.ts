/**
 * CALCULATE ENDPOINT
 *
 * Calculate quote based on input data
 */

import { calculateTotal } from '@/lib/core/calculator/calculations';
import { calculateSchema } from '@/lib/core/validations/schemas';
import {
  checkPayloadSize,
  createPayloadTooLargeResponse,
} from '@/lib/features/security/payload-limit';
import { checkRateLimit, createRateLimitResponse } from '@/lib/features/security/rate-limit';
import { getCORSHeaders } from '@/lib/utils/cors';
import { createErrorResponse, formatError, generateErrorId } from '@/lib/utils/error';
import { logger } from '@/lib/utils/logger';
import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const errorId = generateErrorId();
  const origin = context.request.headers.get('Origin');
  const corsHeaders = getCORSHeaders(origin);

  logger.info('API', 'Calculate request received');

  // 1. Payload size check
  const payloadOk = await checkPayloadSize(context);
  if (!payloadOk) {
    return createPayloadTooLargeResponse(errorId, corsHeaders);
  }

  // 2. Rate limit check
  const rateLimitOk = await checkRateLimit(context);
  if (!rateLimitOk) {
    return createRateLimitResponse(errorId, corsHeaders);
  }

  try {
    // 3. Parse and validate request
    const body = await context.request.json();
    const validated = calculateSchema.parse(body);

    logger.debug('API', 'Calculate data validated', {
      step: validated.step,
      language: validated.language,
    });

    // 4. Calculate result
    const result = calculateTotal(validated.data);

    logger.info('API', 'Calculation successful', {
      total: result.totalPrice,
      currency: result.currency,
    });

    // 5. Return result
    return new Response(
      JSON.stringify({
        success: true,
        result,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  } catch (error) {
    logger.error('API', 'Calculate failed', formatError(error, errorId));

    // Handle Zod validation errors - return simplified details
    if (error && typeof error === 'object' && 'issues' in error) {
      const issues = (error as { issues: Array<{ path: (string | number)[]; message: string }> }).issues;
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Validation error',
          details: issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          errorId,
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }

    return createErrorResponse('Calculation failed', errorId, 500, corsHeaders);
  }
};

// CORS preflight
export const OPTIONS: APIRoute = async (context) => {
  const origin = context.request.headers.get('Origin');
  const corsHeaders = getCORSHeaders(origin);

  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
};
