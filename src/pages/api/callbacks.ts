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
import { escapeHtml, EMAIL_STYLES, sectionHeader, row, buildSelectionRows } from '@/lib/core/email/templates/helpers';
import {
  checkPayloadSize,
  createPayloadTooLargeResponse,
} from '@/lib/features/security/payload-limit';
import { checkRateLimit, createRateLimitResponse } from '@/lib/features/security/rate-limit';
import { syncQuoteToImve } from '@/lib/features/imve';
import { getCORSHeaders } from '@/lib/utils/cors';
import { requireAllowedOrigin, sanitizePhoneForEmail } from '@/lib/forms/utils';
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
});

/**
 * Strip CRLF / control characters before interpolating a value into
 * an email Subject header. Defence in depth against header injection —
 * Resend sanitizes on its side but we don't want to rely on that alone.
 */
function sanitizeSubjectPart(value: string): string {
  return value.replace(/[\r\n\t\f\v\0]+/g, ' ').trim().slice(0, 120);
}

const IMG = 'https://painlessremovals.com/images/email';

function generateCallbackCustomerEmail(name: string, reason?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>We'll Call You Back &ndash; Painless Removals</title>
  <style>${EMAIL_STYLES}</style>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f4;">
<tr><td align="center" style="padding:24px 12px;">
  <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

    <tr>
      <td style="background-color:#005349;padding:28px 24px;text-align:center;">
        <h1 style="margin:0;font-size:22px;color:#ffffff;font-weight:700;font-family:Georgia,serif;line-height:1.3;">
          Thank you for your <span style="color:#f9a00f;">Painless</span> Removals enquiry!
        </h1>
      </td>
    </tr>

    <tr>
      <td style="padding:28px 28px 8px;font-size:15px;line-height:1.65;color:#333333;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <p style="margin:0 0 16px;">Dear ${escapeHtml(name)},</p>
        <p style="margin:0 0 20px;">Thank you for requesting a callback. We&rsquo;ve received your details and our team will be in touch shortly.</p>

        <!-- What happens next -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e8e8e8;border-radius:8px;overflow:hidden;margin-bottom:20px;">
          <tr><td style="padding:12px 14px;font-weight:700;font-size:14px;color:#005349;background:#f0f7f6;border-bottom:1px solid #ddecea;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">What happens next?</td></tr>
          <tr>
            <td style="padding:12px 14px;font-size:14px;color:#444;border-bottom:1px solid #eeeeee;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
              <span style="display:inline-block;width:24px;height:24px;background:#005349;color:#fff;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:700;margin-right:10px;vertical-align:middle;">1</span>
              Our team will review all the details you&rsquo;ve shared
            </td>
          </tr>
          <tr>
            <td style="padding:12px 14px;font-size:14px;color:#444;border-bottom:1px solid #eeeeee;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
              <span style="display:inline-block;width:24px;height:24px;background:#005349;color:#fff;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:700;margin-right:10px;vertical-align:middle;">2</span>
              We&rsquo;ll call you to discuss your move and arrange a free survey
            </td>
          </tr>
          <tr>
            <td style="padding:12px 14px;font-size:14px;color:#444;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
              <span style="display:inline-block;width:24px;height:24px;background:#005349;color:#fff;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:700;margin-right:10px;vertical-align:middle;">3</span>
              You&rsquo;ll receive a precise, personalised quote by email
            </td>
          </tr>
        </table>

        <!-- Availability -->
        <p style="margin:0 0 24px;text-align:center;font-size:14px;color:#555555;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
          Our team is available <strong>Monday &ndash; Friday, 9am &ndash; 5pm</strong>.
        </p>

        ${reason ? `<p style="margin:0 0 16px;font-size:14px;color:#666;"><strong>Note:</strong> ${escapeHtml(reason)}</p>` : ''}

        <p style="margin:0 0 20px;font-size:14px;color:#444444;">I&rsquo;ll be reviewing everything you&rsquo;ve sent us shortly and will give you a call to discuss the details. Thank you for your interest in Painless Removals &ndash; we look forward to working with you.<br><br>Best regards,</p>

        <!-- Tom signature -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #eeeeee;padding-top:20px;margin-top:4px;">
          <tr>
            <td width="96" valign="top" style="padding-right:16px;">
              <img src="${IMG}/tom.jpg" alt="Tom" width="80" height="80" style="border-radius:8px;display:block;object-fit:cover;object-position:top;">
            </td>
            <td valign="middle" style="font-size:14px;color:#444444;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
              <strong style="color:#005349;font-size:15px;">Tom</strong><br>
              Operations, Painless Removals<br>
              0117 28 700 82<br>
              hello@painlessremovals.com
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="text-align:center;padding:16px 24px 20px;font-size:12px;color:#aaaaaa;background:#f9f9f9;border-top:1px solid #eeeeee;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
        <p style="margin:0;">Painless Removals &middot; Bristol &middot; hello@painlessremovals.com</p>
      </td>
    </tr>

  </table>
</td></tr>
</table>
</body>
</html>`;
}

function generateCallbackAdminEmail(
  contact: { name?: string | undefined; email?: string | undefined; phone?: string | undefined },
  reason?: string,
  data?: Record<string, unknown>
): string {
  const phone = contact.phone || '';
  const hasQuoteData = data && Object.keys(data).length > 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Callback Request</title>
  <style>${EMAIL_STYLES}</style>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f4;">
<tr><td align="center" style="padding:24px 12px;">
  <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

    <tr>
      <td style="background:linear-gradient(135deg,#dc3f04,#b83200);padding:28px 24px;text-align:center;">
        <h1 style="margin:0 0 6px;font-size:22px;color:#ffffff;font-weight:800;font-family:-apple-system,BlinkMacSystemFont,sans-serif;text-transform:uppercase;letter-spacing:0.03em;">Callback Request</h1>
        <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.88);font-family:-apple-system,BlinkMacSystemFont,sans-serif;">A potential client is waiting for your call</p>
      </td>
    </tr>

    <tr>
      <td style="padding:28px 28px 8px;font-size:15px;line-height:1.65;color:#333333;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <p style="margin:0 0 8px;">Hello Team,</p>
        <p style="margin:0 0 20px;">A client has requested a callback. Please call them as soon as possible.</p>

        ${phone ? `
        <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 24px;">
          <tr>
            <td style="background-color:#dc3f04;border-radius:8px;text-align:center;">
              <a href="tel:${escapeHtml(sanitizePhoneForEmail(phone))}" style="color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 28px;display:inline-block;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">Call Now: ${escapeHtml(phone)}</a>
            </td>
          </tr>
        </table>
        ` : ''}

        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid #e8e8e8;border-radius:8px;overflow:hidden;margin-bottom:8px;">
          ${sectionHeader('Contact Details')}
          ${row('Phone', phone || null)}
          ${row('Name', contact.name)}
          ${row('Email', contact.email)}
          ${reason ? row('Reason', reason) : ''}
          ${hasQuoteData ? buildSelectionRows(data!) : ''}
        </table>

      </td>
    </tr>

    <tr>
      <td style="text-align:center;padding:16px 24px 20px;font-size:12px;color:#aaaaaa;background:#f9f9f9;border-top:1px solid #eeeeee;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
        <p style="margin:0;">Painless Removals  - Internal notification</p>
      </td>
    </tr>

  </table>
</td></tr>
</table>
</body>
</html>`;
}

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
