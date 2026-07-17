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
import { requireAllowedOrigin } from '@/lib/forms/utils';
import { buildSignedQuoteUrl } from '@/lib/quote-url-server';
import { createErrorResponse, formatError, generateErrorId } from '@/lib/utils/error';
import { generateFingerprint } from '@/lib/utils/fingerprint';
import { kvGet, kvPut, safeKV } from '@/lib/utils/kv';
import { logger } from '@/lib/utils/logger';
import {
  deriveClientId,
  ga4ClientIdFromRequest,
  ga4SessionIdFromRequest,
  pageLocationFromRequest,
  sendGA4MP,
} from '@/lib/tracking/server';
import { deliverQuoteLead, getWaitUntil } from '@/lib/crm/server';
import {
  deliverGatewayConversion,
  readConsentFromCookie,
  splitFullName,
} from '@/lib/tracking/gateway-dispatch';
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

  if (!requireAllowedOrigin(context.request)) {
    return new Response(JSON.stringify({ success: false, error: 'Forbidden', errorId }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

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

  // Hoisted so the catch handler can clear the in-flight sentinel on
  // failure; otherwise a dead request blocks retries for 60s.
  let dedupCleanupKey: string | null = null;

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
    //
    // Two-phase write: stamp an in-flight sentinel BEFORE doing any work
    // so a near-simultaneous second request sees it and bails. The
    // sentinel is replaced with the real response body once the work
    // completes. Read-modify-write is still racy across colos (KV is
    // eventually consistent), so this is best-effort — but markedly
    // better than the previous fire-and-forget post-write where two
    // requests would both miss the cache.
    const dedupKv = safeKV(env, 'RATE_LIMITER');
    const dedupKey = `save_quote_dedup:${fingerprint}`;
    const INFLIGHT_SENTINEL = '__inflight__';
    if (dedupKv) {
      const cached = await kvGet<string>(dedupKv, dedupKey);
      if (cached === INFLIGHT_SENTINEL) {
        // Another request is already processing this exact payload.
        // Tell the client we accepted it; the real work is in flight
        // elsewhere and will email/CRM-sync.
        logger.info('API', 'Concurrent save-quote in flight, returning 202', { fingerprint });
        return new Response(JSON.stringify({ success: true, deferred: true }), {
          status: 202,
          headers: { 'Content-Type': 'application/json', 'X-Idempotent-Replay': 'inflight', ...corsHeaders },
        });
      }
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
      // Stake the in-flight claim before doing any side-effect work.
      // Awaited so the next read sees it.
      await kvPut(dedupKv, dedupKey, INFLIGHT_SENTINEL, { expirationTtl: SAVE_QUOTE_DEDUP_TTL_SECONDS });
      dedupCleanupKey = dedupKey;
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

    // Build a server-signed shareable quote URL. The client used to
    // assemble this with no signature; an attacker could craft an
    // arbitrary `?q=` URL and load it into a victim's calculator. With
    // server-side HMAC the token is unforgeable. Falls back to null if
    // no QUOTE_URL_SECRET / IP_HASH_SALT is provisioned (in which case
    // the email's "view your quote" link is simply omitted).
    const siteOrigin = env.SITE_URL || 'https://painlessremovals.com';
    const signedQuoteUrl = validated.quoteUrlPayload
      ? buildSignedQuoteUrl(validated.quoteUrlPayload, siteOrigin, env)
      : null;

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
      quoteUrl: signedQuoteUrl,
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

    // Painless-CRM signed webhook mirror. Runs alongside i-mve (both are CRM
    // syncs) but delivery + retry is backgrounded via ctx.waitUntil so it
    // never holds up the response. This is the single chokepoint for the
    // calculator quote lead — Step12 and the /your-quote ResultPage both POST
    // here, so the lead is pushed once regardless of which surface saved it.
    {
      const data = validated.data as Record<string, unknown>;
      const fromAddr = data.fromAddress as { postcode?: string } | undefined;
      const toAddr = data.toAddress as { postcode?: string } | undefined;
      // Hand the FULL calculator submission to the mapper so every entered
      // item (addresses, move date, resources, extras, consent, attribution,
      // line-item breakdown) reaches the CRM — not just the old 4-field summary.
      deliverQuoteLead(env, getWaitUntil(context.locals), {
        fullName: validated.name,
        email: validated.email,
        phone: validated.phone,
        postcode: fromAddr?.postcode || toAddr?.postcode,
        totalPence: Math.round(validated.totalPrice * 100),
        eventId: validated.event_id,
        data,
        breakdown: validated.breakdown,
        utmSource: validated.utm_source,
        utmMedium: validated.utm_medium,
        utmCampaign: validated.utm_campaign,
        gclid: validated.gclid,
      });

      // Server-side conversion → Soborbo event-gateway. The SAME chokepoint that
      // guarantees the CRM lead now also guarantees the tracking event, so the
      // conversion no longer depends on the browser winning a Turnstile challenge
      // (which silently lost every quote conversion 2026-06-28 → 2026-07-13).
      //
      // `validated.event_id` is the browser-minted UUID that the dataLayer push
      // (and therefore the Meta Pixel) already carries — sending the SAME id here
      // is what makes Meta dedupe the two legs into ONE Lead instead of two.
      // Without an event_id we cannot dedupe, so we skip rather than double-count.
      if (validated.event_id) {
        deliverGatewayConversion(env, getWaitUntil(context.locals), {
          eventName: 'quote_calculator_submitted',
          eventId: validated.event_id,
          leadId: validated.event_id,
          value: validated.totalPrice,
          currency: validated.currency || 'GBP',
          service:
            typeof data.serviceType === 'string' ? (data.serviceType as string) : 'removal',
          source: 'server',
          userData: {
            email: validated.email,
            phone_number: validated.phone,
            ...splitFullName(validated.name),
            postal_code: fromAddr?.postcode || toAddr?.postcode,
            country: country || 'GB',
          },
          attribution: {
            gclid: validated.gclid,
            utm_source: validated.utm_source,
            utm_medium: validated.utm_medium,
            utm_campaign: validated.utm_campaign,
            utm_term: validated.utm_term,
            utm_content: validated.utm_content,
            landing_page: typeof data.landingPage === 'string' ? data.landingPage : undefined,
          },
          // The user's Consent Mode state from the CookieYes cookie riding on this
          // very POST — the gateway stores it as an explicit consent-receipt for the
          // lead, which is what later authorises (or lawfully blocks) the offline
          // Enhanced-Conversions upload.
          consent: readConsentFromCookie(context.request.headers.get('Cookie')),
          clientId: ga4ClientIdFromRequest(context.request),
          sessionId: ga4SessionIdFromRequest(context.request, env.GA4_MEASUREMENT_ID),
          eventSourceUrl: pageLocationFromRequest(context.request),
          // The real end user's IP/UA — without these the gateway would hand Meta
          // our own Worker's egress identity (wrong geo, worse EMQ).
          clientIpAddress: context.request.headers.get('CF-Connecting-IP') ?? undefined,
          clientUserAgent: userAgent ?? undefined,
        });
      } else {
        logger.error('GATEWAY', 'Quote lead has no event_id — conversion NOT dispatched', {
          quoteId: quote.id,
        });
      }

      // Stash the customer's contact + attribution keyed by quote id, so the
      // "Yes, Call Me to Book a Survey" link in the confirmation email
      // (/instantquote/simple-callback/?ref=<quoteId>) can register a callback
      // WITHOUT asking the customer to re-enter anything. We already have all
      // their details here — the email link only carries the opaque quote id,
      // so we keep the PII server-side in KV rather than in the URL.
      // Only stored when we have enough to fire a callback later (email+phone).
      if (dedupKv && validated.email && validated.phone) {
        const asStr = (v: unknown) =>
          typeof v === 'string' && v.length > 0 ? v : undefined;
        const cbRecord = {
          name: validated.name,
          email: validated.email,
          phone: validated.phone,
          postcode: fromAddr?.postcode || toAddr?.postcode,
          attribution: {
            heard_about: asStr(data.attribution),
            utm_source: validated.utm_source,
            utm_medium: validated.utm_medium,
            utm_campaign: validated.utm_campaign,
            gclid: validated.gclid,
            landing_page: asStr(data.landingPage),
            session_id: asStr(data.sessionId),
          },
        };
        // 60-day window — matches the realistic quote follow-up horizon.
        const cbWrite = kvPut(dedupKv, `cb_ref:${quote.id}`, JSON.stringify(cbRecord), {
          expirationTtl: 60 * 24 * 60 * 60,
        });
        const cbWaitUntil = getWaitUntil(context.locals);
        if (cbWaitUntil) cbWaitUntil(cbWrite);
        else void cbWrite;
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

    // Use waitUntil if available (Cloudflare Workers) to ensure emails complete
    // after the response. NOTE: the execution context lives at
    // `locals.cfContext` (see getWaitUntil) — the old `locals.runtime.waitUntil`
    // probe never matched, so every "background" promise below actually ran
    // unprotected and could be cancelled when the response flushed.
    const waitUntil = getWaitUntil(context.locals);
    if (waitUntil) {
      waitUntil(emailTasks);
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
      quoteUrl: signedQuoteUrl,
      ...(warnings.length > 0 && { warnings }),
    });

    // Replace the in-flight sentinel with the real response. Use
    // waitUntil so the cache write doesn't block the response, but is
    // also not cancelled when the response flushes.
    if (dedupKv) {
      const cachePut = kvPut(dedupKv, dedupKey, responseBody, { expirationTtl: SAVE_QUOTE_DEDUP_TTL_SECONDS });
      if (waitUntil) waitUntil(cachePut);
      else void cachePut;
      // Sentinel will be replaced by the response body — no need to
      // clear in the catch.
      dedupCleanupKey = null;
    }

    // Server-side mirror of `quote_calculator_complete` to GA4 MP. This
    // is the engagement event (the conversion, `quote_calculator_conversion`,
    // fires client-side immediately at completion with this same
    // event_id). Server-side gives us a backstop for sessions where the
    // browser dataLayer push gets dropped (adblock, navigation race).
    // Fire-and-forget via waitUntil.
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
    // Prefer the browser's real GA4 client_id (same-origin POST carries the
    // `_ga` cookie) so the MP hit attaches to the same GA4 user as the
    // browser-side dataLayer push instead of minting a phantom user per
    // fingerprint. Fingerprint-derived id remains the consent-denied /
    // cookieless fallback.
    //
    // session_id + page_location stitch the hit into the live browser
    // session so it inherits the session's source/medium/gclid instead
    // of landing as Unassigned / "(not set)" — without them Google Ads
    // never sees these completions as conversions.
    const ga4ClientId = ga4ClientIdFromRequest(context.request) ?? deriveClientId(fingerprint);
    const ga4Mirror = sendGA4MP(
      env,
      ga4ClientId,
      [
        {
          name: 'quote_calculator_complete',
          params: mirrorParams,
        },
      ],
      {
        sessionId: ga4SessionIdFromRequest(context.request, env.GA4_MEASUREMENT_ID),
        pageLocation: pageLocationFromRequest(context.request),
      },
    );
    if (waitUntil) {
      waitUntil(ga4Mirror);
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

    // If we staked an in-flight claim, clear it so the user's retry can
    // actually retry instead of seeing a stale 202 deferred for 60s.
    if (dedupCleanupKey) {
      try {
        const cleanupKv = safeKV(env, 'RATE_LIMITER');
        if (cleanupKv) await cleanupKv.delete(dedupCleanupKey);
      } catch { /* swallow */ }
    }

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
