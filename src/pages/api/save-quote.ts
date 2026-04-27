/**
 * SAVE QUOTE ENDPOINT
 *
 * Features:
 * - Payload size limit
 * - IP anonymization (GDPR)
 * - Email with timeout + retry
 * - iMove CRM sync with retry
 * - Rate limiting
 */

import { getRuntimeConfig } from '@/lib/config';
import { CONFIG } from '@/lib/config';
import type { Quote } from '@/lib/core/types';
import { sendEmail } from '@/lib/core/email/sender';
import {
  generateAdminNotificationEmail,
  generateQuoteConfirmationEmail,
} from '@/lib/core/email/templates';
import { saveQuoteSchema } from '@/lib/core/validations/schemas';
import { getDeviceInfo } from '@/lib/features/enrichment';
import {
  checkPayloadSize,
  createPayloadTooLargeResponse,
} from '@/lib/features/security/payload-limit';
import { checkRateLimit, createRateLimitResponse } from '@/lib/features/security/rate-limit';
import { syncQuoteToImve } from '@/lib/features/imve';
import { getCORSHeaders } from '@/lib/utils/cors';
import { createErrorResponse, formatError, generateErrorId } from '@/lib/utils/error';
import { generateFingerprint } from '@/lib/utils/fingerprint';
import { kvGet, kvPut, safeKV } from '@/lib/utils/kv';
import { logger } from '@/lib/utils/logger';
import { deriveClientId, sendGA4MP } from '@/lib/tracking/server';
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

/**
 * Idempotency window for duplicate submissions. A repeat request with the
 * same fingerprint arriving within this window gets the cached response
 * back so a refreshed result page or double-click doesn't fire a second
 * round of emails / CRM leads.
 */
const SAVE_QUOTE_DEDUP_TTL_SECONDS = 60;

export const POST: APIRoute = async (context) => {
  const errorId = generateErrorId();
  const origin = context.request.headers.get('Origin');
  const corsHeaders = getCORSHeaders(origin);

  logger.info('API', 'Save quote request received');

  // Payload size check
  const payloadOk = await checkPayloadSize(context);
  if (!payloadOk) {
    return createPayloadTooLargeResponse(errorId, corsHeaders);
  }

  // Rate limit
  const rateLimitOk = await checkRateLimit(context);
  if (!rateLimitOk) {
    return createRateLimitResponse(errorId, corsHeaders);
  }

  try {
    const body = await context.request.json();
    const validated = saveQuoteSchema.parse(body);

    logger.debug('API', 'Quote data validated');

    // Get runtime config
    const runtimeConfig = getRuntimeConfig(env);

    // Generate fingerprint (used as quote reference)
    const fingerprint = generateFingerprint({
      data: validated.data,
      totalPrice: validated.totalPrice,
    });

    // Short-window idempotency. If this exact quote data was already
    // processed seconds ago (double-click, refresh, React StrictMode
    // double-fire), return the cached response instead of firing a
    // second set of emails and a second CRM lead.
    const dedupKv = safeKV(env, 'RATE_LIMITER');
    const dedupKey = `save_quote_dedup:${fingerprint}`;
    if (dedupKv) {
      const cached = await kvGet<string>(dedupKv, dedupKey);
      if (cached) {
        logger.info('API', 'Returning cached save-quote response for duplicate request', { fingerprint });
        return new Response(cached, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Idempotent-Replay': 'true',
            ...corsHeaders,
          },
        });
      }
    }

    // Get enrichment data
    const country = context.request.headers.get('CF-IPCountry');
    const userAgent = context.request.headers.get('User-Agent');
    const deviceInfo = getDeviceInfo(userAgent);

    // Combine fingerprint + crypto-random suffix for uniqueness. The
    // previous implementation used a 4-char slice of Date.now().toString(36),
    // which wrapped every ~28 minutes and gave only ~1.6M unique suffixes —
    // enough for collisions under realistic traffic. crypto.randomUUID()
    // yields ~62 bits of entropy in the 4-char slice we keep.
    const randomPart = crypto.randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase();
    const quoteId = `${fingerprint.slice(0, 4).toUpperCase()}${randomPart}`;

    // Construct quote object for email templates + CRM
    const quote = {
      id: quoteId,
      name: validated.name || null,
      email: validated.email || null,
      phone: validated.phone || null,
      totalPrice: validated.totalPrice,
      currency: validated.currency || 'GBP',
      language: validated.language || 'en',
      country,
      device: deviceInfo.type,
      calculatorData: validated.data,
      breakdown: validated.breakdown,
      quoteUrl: validated.quoteUrl || null,
      createdAt: new Date().toISOString(),
    };

    logger.info('API', 'Quote prepared', { quoteId: quote.id });

    // ===================
    // CRITICAL: Email + iMove must ALWAYS fire reliably
    // Run all three in parallel with retry logic.
    // ===================

    // Helper: retry an async operation up to maxRetries times
    async function withRetry<T>(
      label: string,
      fn: () => Promise<T>,
      maxRetries: number = 2,
      delayMs: number = 1500,
    ): Promise<T | null> {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await fn();
        } catch (err) {
          const errorDetail = err instanceof Error
            ? { name: err.name, message: err.message, stack: err.stack?.split('\n').slice(0, 3).join(' | ') }
            : { raw: String(err) };
          logger.error(label, `Attempt ${attempt}/${maxRetries} failed`, {
            ...errorDetail,
            quoteId: quote.id,
          });
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
          }
        }
      }
      return null;
    }

    // CRM sync runs inline — if it fails we want the client (and any
    // downstream ops tooling) to know, not just see a happy 201. Leads
    // that never reach the CRM are effectively lost revenue, so this is
    // the one background task we surface.
    const warnings: string[] = [];
    let crmSynced = true;

    if (CONFIG.features.imveSync && runtimeConfig.imve.enabled) {
      const imveOutcome = await withRetry('i-mve', async () => {
        const imveResult = await syncQuoteToImve(
          { id: quote.id, name: validated.name ?? null, email: validated.email ?? null, phone: validated.phone ?? null, totalPrice: validated.totalPrice },
          validated.data,
          runtimeConfig.imve
        );
        if (!imveResult.success) {
          throw new Error('i-mve sync returned unsuccessful');
        }
        logger.info('i-mve', 'Quote synced', { quoteId: quote.id });
        return true;
      });
      if (imveOutcome === null) {
        crmSynced = false;
        warnings.push('CRM sync failed — lead requires manual follow-up');
        logger.error('i-mve', 'Quote NOT synced after retries — manual follow-up required', {
          quoteId: quote.id,
          name: validated.name ?? null,
          email: validated.email ?? null,
          phone: validated.phone ?? null,
        });
      }
    }

    // Emails stay on the background track — if Resend hiccups, the quote
    // is still persisted and the admin email can be resent manually.
    const emailTasks = Promise.allSettled([
      validated.email ? withRetry('Email:Customer', async () => {
        const emailHtml = generateQuoteConfirmationEmail(quote as Quote & { quoteUrl?: string | null });
        await sendEmail(
          {
            to: validated.email!,
            subject: `Your Quote Confirmation - #${quote.id}`,
            html: emailHtml,
            replyTo: CONFIG.calculator.emailSupport,
          },
          runtimeConfig.email
        );
        logger.info('Email', 'Customer confirmation sent', { quoteId: quote.id });
      }) : Promise.resolve(null),

      CONFIG.calculator.emailSupport ? withRetry('Email:Admin', async () => {
        const adminEmailHtml = generateAdminNotificationEmail(quote as Quote, { crmSynced });
        await sendEmail(
          {
            to: CONFIG.calculator.emailSupport,
            subject: `${crmSynced ? '' : '⚠ CRM SYNC FAILED — '}New Quote Request #${quote.id}`,
            html: adminEmailHtml,
          },
          runtimeConfig.email
        );
        logger.info('Email', 'Admin notification sent', { quoteId: quote.id });
      }) : Promise.resolve(null),
    ]);

    // Use waitUntil if available (Cloudflare Workers) to ensure emails complete after response
    const cfContext = (context as unknown as { locals?: { runtime?: { waitUntil: (p: Promise<unknown>) => void } } }).locals?.runtime;
    if (cfContext?.waitUntil) {
      cfContext.waitUntil(emailTasks);
    } else {
      await emailTasks;
    }

    // Return success. The response now reflects the real CRM state so
    // the client (or a monitoring tool) can alert ops if the lead wasn't
    // synced.
    const responseBody = JSON.stringify({
      success: true,
      quoteId: quote.id,
      message: 'Quote saved successfully',
      crmSynced,
      ...(warnings.length > 0 && { warnings }),
    });

    // Cache the response under the fingerprint so duplicate submissions
    // within the dedup window get the same reply. We fire-and-forget the
    // KV write to avoid adding latency to the happy-path response.
    if (dedupKv) {
      void kvPut(dedupKv, dedupKey, responseBody, { expirationTtl: SAVE_QUOTE_DEDUP_TTL_SECONDS });
    }

    // Server-side mirror of `quote_calculator_complete` to GA4 MP. This
    // is the engagement event (not the conversion — that fires later on
    // upgrade or 60-min timeout, client-side). Server-side gives us a
    // backstop for sessions where the browser dataLayer push gets
    // dropped (adblock, navigation race). Fire-and-forget via waitUntil.
    //
    // `event_id` and `service` come from the validated payload so the
    // server hit carries the same identifiers as the matching browser
    // push (when the browser sent them) — useful for cross-system
    // correlation in BigQuery / GA4 explorer.
    const calcServiceType = typeof validated.data.serviceType === 'string'
      ? validated.data.serviceType
      : 'removal';
    const mirrorParams: Record<string, unknown> = {
      quote_id: quote.id,
      quote_value: validated.totalPrice,
      value: validated.totalPrice,
      currency: validated.currency || 'GBP',
      service: calcServiceType,
      source: 'server',
    };
    if (validated.event_id) {
      mirrorParams.event_id = validated.event_id;
    }
    const ga4Mirror = sendGA4MP(env, deriveClientId(fingerprint), [
      {
        name: 'quote_calculator_complete',
        params: mirrorParams,
      },
    ]);
    if (cfContext?.waitUntil) {
      cfContext.waitUntil(ga4Mirror);
    } else {
      void ga4Mirror;
    }

    return new Response(
      responseBody,
      {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  } catch (error) {
    logger.error('API', 'Save quote failed', formatError(error, errorId));

    // Handle Zod validation errors
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

    return createErrorResponse('Failed to save quote', errorId, 500, corsHeaders);
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
