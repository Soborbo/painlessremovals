/**
 * CALLBACKS ENDPOINT
 *
 * Handles callback requests for specialist items or large properties.
 * Sends email notifications to both the customer and admin,
 * and syncs lead data to i-mve CRM.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getRuntimeConfig, CONFIG } from '@/lib/config';
import { sendEmail } from '@/lib/core/email/sender';
import { emailSchema, phoneSchema, nameSchema } from '@/lib/core/validations/schemas';
import { sanitizeSubjectPart } from '@/lib/core/email/templates/helpers';
import { generateCallbackCustomerEmail, generateCallbackAdminEmail } from '@/lib/core/email/templates';
import {
  checkPayloadSize,
  createPayloadTooLargeResponse,
} from '@/lib/features/security/payload-limit';
import { checkRateLimit, createRateLimitResponse } from '@/lib/features/security/rate-limit';
import { syncQuoteToImve } from '@/lib/features/imve';
import { deliverCallbackLead, getWaitUntil } from '@/lib/crm/server';
import {
  deliverGatewayConversion,
  readConsentFromCookie,
  splitFullName,
} from '@/lib/tracking/gateway-dispatch';
import {
  ga4ClientIdFromRequest,
  ga4SessionIdFromRequest,
  pageLocationFromRequest,
} from '@/lib/tracking/server';
import { generateFingerprint } from '@/lib/utils/fingerprint';
import { getCORSHeaders } from '@/lib/utils/cors';
import { requireAllowedOrigin } from '@/lib/forms/utils';
import { generateErrorId } from '@/lib/utils/error';
import { logger } from '@/lib/utils/logger';
import { trackServerError, buildErrorConfig } from '@/lib/errors/tracker-server';
import { env } from 'cloudflare:workers';

export const prerender = false;

const callbackSchema = z.object({
  callbackReason: z.string().max(500).optional(),
  contact: z.object({
    firstName: nameSchema.optional(),
    lastName: nameSchema.optional(),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
  }).optional(),
  name: nameSchema.optional(),
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  data: z.record(z.string().max(200), z.unknown()).optional(),
  // The browser-minted conversion id for this callback (the same UUID the
  // dataLayer push — and therefore the Meta Pixel — carries). We need it here so
  // the server-side gateway conversion dedupes against the Pixel instead of
  // counting a second Lead. Optional: an older client that omits it still gets
  // its lead delivered, it just gets no server-side conversion (logged).
  //
  // NOTE this is deliberately NOT the CRM's event_id: the CRM keeps its
  // content-derived `cb-<fingerprint>` key, which is what makes a client retry
  // idempotent there. Two ids, two jobs — they meet again via `lead_id`.
  event_id: z.string().max(200).optional(),
});

export const POST: APIRoute = async (context) => {
  const errorId = generateErrorId();
  const origin = context.request.headers.get('Origin');
  const corsHeaders = getCORSHeaders(origin);

  // Origin fail-closed.
  if (!requireAllowedOrigin(context.request)) {
    return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

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

  // Build error config once — used by every trackServerError call below.
  // PUBLIC_SITE_ID is the literal site identifier (matches the value
  // baked in at build time in astro.config.mjs); it intentionally is NOT
  // env.SITE_URL — the previous mapping put a URL into the siteId column
  // of the error sheet, breaking grouping/filtering.
  const errorEnv: Record<string, string | undefined> = {
    PUBLIC_SITE_ID: 'painless-removals',
    CF_PAGES_BRANCH: env.ENVIRONMENT,
    ERROR_SHEETS_ID: env.ERROR_SHEETS_ID,
    GOOGLE_SERVICE_ACCOUNT_EMAIL: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    GOOGLE_SERVICE_ACCOUNT_KEY: env.GOOGLE_SERVICE_ACCOUNT_KEY,
    ERROR_EMAIL_TO: env.ERROR_EMAIL_TO,
    ERROR_ALERT_FROM: env.ERROR_ALERT_FROM,
    RESEND_API_KEY: env.RESEND_API_KEY,
  };
  const errorConfig = buildErrorConfig(errorEnv);

  // Tracks which step succeeded so the top-level catch can label the
  // failing phase in MOVE-CB-006.
  let validated: z.infer<typeof callbackSchema> | undefined;

  try {
    const body = await context.request.json();
    try {
      validated = callbackSchema.parse(body);
    } catch (zodError) {
      // Distinct code so the error sheet rows let us see exactly which
      // submissions fail validation (vs. the email or CRM steps below).
      const fields = zodError && typeof zodError === 'object' && 'issues' in zodError
        ? (zodError as { issues: Array<{ path: (string | number)[] }> }).issues
            .map((i) => i.path.join('.'))
            .join(',')
        : 'unknown';
      await trackServerError(
        'MOVE-CB-002',
        zodError,
        {
          errorMessage: zodError instanceof Error ? zodError.message : String(zodError),
          fields,
        },
        errorConfig,
      );
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid request', errorId }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Extract contact info from either flat or nested format
    const contactEmail = validated.email || validated.contact?.email;
    const contactPhone = validated.phone || validated.contact?.phone;
    const contactName = validated.name ||
      (validated.contact ? `${validated.contact.firstName || ''} ${validated.contact.lastName || ''}`.trim() : undefined);

    logger.info('API', 'Callback request received', {
      reason: validated.callbackReason,
      hasEmail: !!contactEmail,
    });

    const runtimeConfig = getRuntimeConfig(env);

    // Send customer confirmation email
    if (contactEmail) {
      try {
        const customerHtml = generateCallbackCustomerEmail(
          contactName || 'there',
          validated.callbackReason
        );

        await sendEmail(
          {
            to: contactEmail,
            subject: "We'll call you back soon \u2013 Painless Removals",
            html: customerHtml,
            replyTo: CONFIG.calculator.emailSupport,
          },
          runtimeConfig.email
        );

        logger.info('Email', 'Callback confirmation sent to customer');
      } catch (emailError) {
        logger.error('Email', 'Failed to send callback confirmation', { error: emailError });
        await trackServerError(
          'MOVE-CB-003',
          emailError,
          { errorMessage: emailError instanceof Error ? emailError.message : String(emailError) },
          errorConfig,
        );
      }
    }

    // Send admin notification email
    if (CONFIG.calculator.emailSupport) {
      try {
        const adminHtml = generateCallbackAdminEmail(
          { name: contactName, email: contactEmail, phone: contactPhone },
          validated.callbackReason,
          validated.data
        );

        const safeNameSuffix = contactName ? ` \u2014 ${sanitizeSubjectPart(contactName)}` : '';
        await sendEmail(
          {
            to: CONFIG.calculator.emailSupport,
            subject: `\u26A1 Callback Request${safeNameSuffix}`,
            html: adminHtml,
          },
          runtimeConfig.email
        );

        logger.info('Email', 'Callback admin notification sent');
      } catch (emailError) {
        logger.error('Email', 'Failed to send callback admin notification', { error: emailError });
        await trackServerError(
          'MOVE-CB-004',
          emailError,
          { errorMessage: emailError instanceof Error ? emailError.message : String(emailError) },
          errorConfig,
        );
      }
    }

    // Sync to i-mve CRM
    if (CONFIG.features.imveSync && runtimeConfig.imve.enabled) {
      try {
        const callbackId = `CB-${Date.now().toString(36).toUpperCase()}`;
        await syncQuoteToImve(
          { id: callbackId, name: contactName ?? null, email: contactEmail ?? null, phone: contactPhone ?? null },
          validated.data || {},
          runtimeConfig.imve
        );
        logger.info('i-mve', 'Callback lead synced', { callbackId });
      } catch (imveError) {
        logger.error('i-mve', 'Failed to sync callback lead', { error: imveError });
        await trackServerError(
          'MOVE-CB-005',
          imveError,
          { errorMessage: imveError instanceof Error ? imveError.message : String(imveError) },
          errorConfig,
        );
      }
    }

    // Painless-CRM signed webhook mirror. This is the single chokepoint for
    // all calculator callback forms (SimpleCallbackForm + Step12 + ResultPage,
    // each of which may retry the POST). A content-derived event_id makes the
    // delivery idempotent, so a client retry that re-POSTs identical data
    // dedupes on the CRM instead of creating a second lead.
    {
      const fp = generateFingerprint({
        email: contactEmail,
        phone: contactPhone,
        reason: validated.callbackReason,
        data: validated.data,
      });
      const dataObj = (validated.data || {}) as Record<string, unknown>;
      const fromAddr = dataObj.fromAddress as { postcode?: string } | undefined;
      // Lift the captured gclid/utm out of the calculator state so callback
      // leads land in the CRM `attributions` table the same way quote leads do.
      const asStr = (v: unknown) =>
        typeof v === 'string' && v.length > 0 ? v : undefined;
      const attributionEntries = {
        heard_about: asStr(dataObj.attribution),
        utm_source: asStr(dataObj.utmSource),
        utm_medium: asStr(dataObj.utmMedium),
        utm_campaign: asStr(dataObj.utmCampaign),
        gclid: asStr(dataObj.gclid),
        landing_page: asStr(dataObj.landingPage),
        session_id: asStr(dataObj.sessionId),
      };
      const attribution = Object.values(attributionEntries).some((v) => v !== undefined)
        ? attributionEntries
        : undefined;
      const crmEventId = `cb-${fp.slice(0, 40)}`;
      deliverCallbackLead(env, getWaitUntil(context.locals), {
        fullName: contactName,
        email: contactEmail,
        phone: contactPhone,
        message: validated.callbackReason,
        propertyPostcode: fromAddr?.postcode,
        eventId: crmEventId,
        attribution,
      });

      // Server-side conversion → Soborbo event-gateway, on the same chokepoint
      // that already guarantees the CRM lead. The browser leg stays, but it can
      // no longer be the ONLY path: it bails silently whenever Turnstile does not
      // hand it a token.
      //
      // event_id = the BROWSER's UUID (Meta dedupes the Pixel + CAPI legs on the
      // (event_name, event_id) pair — a different id here would count 2 Leads).
      // lead_id  = the CRM's content-derived key, so the gateway ledger row joins
      //            the CRM lead record and the later offline-loop statuses.
      if (validated.event_id) {
        deliverGatewayConversion(env, getWaitUntil(context.locals), {
          eventName: 'callback_request_submitted',
          eventId: validated.event_id,
          leadId: crmEventId,
          // No value/currency on a callback — CLAUDE.md #3 forbids value: 0, and
          // this surface genuinely has no money value in scope.
          source: 'server',
          userData: {
            email: contactEmail,
            phone_number: contactPhone,
            ...splitFullName(contactName),
            postal_code: fromAddr?.postcode,
            country: context.request.headers.get('CF-IPCountry') || 'GB',
          },
          attribution: {
            gclid: asStr(dataObj.gclid),
            utm_source: asStr(dataObj.utmSource),
            utm_medium: asStr(dataObj.utmMedium),
            utm_campaign: asStr(dataObj.utmCampaign),
            landing_page: asStr(dataObj.landingPage),
          },
          // Consent Mode state from the CookieYes cookie on this POST — becomes the
          // lead's explicit consent-receipt in the gateway ledger (offline-upload gate).
          consent: readConsentFromCookie(context.request.headers.get('Cookie')),
          clientId: ga4ClientIdFromRequest(context.request),
          sessionId: ga4SessionIdFromRequest(context.request, env.GA4_MEASUREMENT_ID),
          eventSourceUrl: pageLocationFromRequest(context.request),
          clientIpAddress: context.request.headers.get('CF-Connecting-IP') ?? undefined,
          clientUserAgent: context.request.headers.get('User-Agent') ?? undefined,
        });
      } else {
        // NOT an error: the auto-submitting callback surfaces (the post-quote
        // email/"we'll call you" blocks in ResultPage/Step12Quote) deliver a lead
        // but deliberately fire no conversion event, so they send no event_id.
        // Only the three interactive callback CTAs mint one. Warn, don't page.
        logger.warn('GATEWAY', 'Callback lead without event_id — no conversion dispatched', {
          leadId: crmEventId,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Callback request received',
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
    logger.error('API', 'Callback request failed', { error });
    // Top-level catch: anything that escapes the inner try blocks lands
    // here. CRITICAL severity so the alert email fires immediately.
    await trackServerError(
      'MOVE-CB-006',
      error,
      {
        errorMessage: error instanceof Error ? error.message : String(error),
        phase: validated ? 'post-validation' : 'pre-validation',
      },
      errorConfig,
    );

    return new Response(
      JSON.stringify({
        success: false,
        error: 'Failed to process callback request',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
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
