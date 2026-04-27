/**
 * VALIDATE ENDPOINT
 *
 * Validate step data without calculating
 */

import { validateCalculatorData } from '@/lib/core/calculator/calculations';
import { validateStepSchema } from '@/lib/core/validations/schemas';
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

  logger.info('API', 'Validate request received');

  // Payload size check
  const payloadOk = await checkPayloadSize(context);
  if (!payloadOk) {
    return createPayloadTooLargeResponse(errorId, corsHeaders);
  }

  // Rate limit check
  const rateLimitOk = await checkRateLimit(context);
  if (!rateLimitOk) {
    return createRateLimitResponse(errorId, corsHeaders);
  }

  try {
    // Parse and validate request
    const body = await context.request.json();
    const validated = validateStepSchema.parse(body);

    logger.debug('API', 'Validating step data', { step: validated.step });

    // Validate calculator data
    const validation = validateCalculatorData(validated.data);

    logger.info('API', 'Validation complete', {
      step: validated.step,
      isValid: validation.isValid,
      errorCount: Object.keys(validation.errors).length,
    });

    // Return validation result
    return new Response(
      JSON.stringify({
        success: true,
        isValid: validation.isValid,
        errors: validation.errors,
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
    logger.error('API', 'Validate failed', formatError(error, errorId));

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

    return createErrorResponse('Validation failed', errorId, 500, corsHeaders);
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
