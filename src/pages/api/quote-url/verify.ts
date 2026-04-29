/**
 * Quote URL verification endpoint.
 *
 * Accepts a `<payload>.<sig>` token (the value of the `?q=` parameter
 * on a shared `/instantquote/your-quote/` URL) and returns the decoded
 * state if the HMAC matches the server's secret. Used by ResultPage
 * when the URL contains `?q=` so a forged token cannot pre-populate
 * the calculator with attacker-chosen pricing.
 */

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requireAllowedOrigin, json } from '@/lib/forms/utils';
import { checkRateLimit, createRateLimitResponse } from '@/lib/features/security/rate-limit';
import { decodeQuoteState } from '@/lib/quote-url';
import { verifyQuoteToken } from '@/lib/quote-url-server';
import { generateErrorId } from '@/lib/utils/error';
import { getCORSHeaders } from '@/lib/utils/cors';
import { logger } from '@/lib/utils/logger';

export const prerender = false;

const MAX_TOKEN_LEN = 4096;

export const OPTIONS: APIRoute = async ({ request }) => {
  const origin = request.headers.get('Origin');
  return new Response(null, { status: 204, headers: getCORSHeaders(origin) });
};

export const POST: APIRoute = async (context) => {
  const { request } = context;
  const origin = request.headers.get('Origin');
  const corsHeaders = getCORSHeaders(origin);

  if (!requireAllowedOrigin(request)) return json({ valid: false }, 403);

  const rateLimitOk = await checkRateLimit(context);
  if (!rateLimitOk) return createRateLimitResponse(generateErrorId(), corsHeaders);

  const ctype = request.headers.get('content-type') || '';
  if (!ctype.includes('application/json')) return json({ valid: false }, 415);

  let body: { token?: unknown };
  try {
    body = (await request.json()) as { token?: unknown };
  } catch {
    return json({ valid: false }, 400);
  }

  if (typeof body.token !== 'string' || body.token.length === 0 || body.token.length > MAX_TOKEN_LEN) {
    return json({ valid: false }, 400);
  }

  const verifiedPayload = verifyQuoteToken(body.token, env);
  if (!verifiedPayload) {
    logger.info('QuoteUrl', 'Verify failed', {});
    return new Response(JSON.stringify({ valid: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const state = decodeQuoteState(verifiedPayload);
  if (!state) {
    return new Response(JSON.stringify({ valid: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  return new Response(JSON.stringify({ valid: true, state }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
};
