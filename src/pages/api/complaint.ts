/**
 * Complaint form API route.
 *
 * Honeypot + Turnstile + Resend, then a mirror into the Soborbo CRM
 * (`lib/crm/complaints.ts`). Modelled on `api/contact.ts`, with two deliberate
 * differences:
 *
 *  - A complaint is NOT a conversion. Nothing is pushed to the dataLayer and no
 *    server-side conversion is fired — counting an unhappy customer as a lead
 *    would poison Ads/GA4 reporting.
 *  - Email is the delivery guarantee, the CRM is the system of record. If the
 *    CRM mirror fails we still return success: the complaint is already in
 *    hello@'s inbox, and losing it because a Worker was down is worse than a
 *    complaint that has to be re-keyed by hand.
 */

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requireAllowedOrigin, escapeHtml, sanitizePhoneForEmail, stripNewlines, json, PHONE, isValidUkPhone } from '@/lib/forms/utils';
import { checkRateLimit, createRateLimitResponse } from '@/lib/features/security/rate-limit';
import { forwardComplaint } from '@/lib/crm/complaints';
import { logger } from '@/lib/utils/logger';
import { generateErrorId } from '@/lib/utils/error';

export const prerender = false;

// A sulyossagot SZANDEKOSAN nem a bejelento allitja: az osztalyozas a panaszt kezelo
// admin dontese a CRM-ben (egy feldult ugyfel onertekelese nem prioritasi bemenet).
// A CRM Zod-semaja ennek hianyaban a kozepso fokozatot veszi fel.

interface ComplaintBody {
  name?: string;
  email?: string;
  phone?: string;
  jobNumber?: string;
  removalDate?: string;
  description?: string;
  honeypot?: string;
  turnstileToken?: string;
}

export const POST: APIRoute = async (context) => {
  const { request } = context;
  try {
    if (!requireAllowedOrigin(request)) {
      return json({ error: 'Forbidden.' }, 403);
    }

    const rateLimitOk = await checkRateLimit(context);
    if (!rateLimitOk) {
      return createRateLimitResponse(generateErrorId());
    }

    const ctype = request.headers.get('content-type') || '';
    if (!ctype.includes('application/json')) {
      return json({ error: 'Invalid content type.' }, 415);
    }

    let body: ComplaintBody;
    try {
      body = await request.json() as ComplaintBody;
    } catch {
      return json({ error: 'Invalid request body.' }, 400);
    }
    const { name, email, phone, jobNumber, removalDate, description, honeypot, turnstileToken } = body;

    // Honeypot — silent "success" so the bot learns nothing.
    if (honeypot) return json({ success: true, silent: true });

    if (!name || !description) {
      return json({ error: 'Please tell us your name and what happened.' }, 400);
    }
    if (description.trim().length < 10) {
      return json({ error: 'Please describe what happened in a little more detail.' }, 400);
    }
    // Either channel is enough — a complaint we cannot reply to is not actionable,
    // but demanding both would turn people away at exactly the wrong moment.
    if (!email && !phone) {
      return json({ error: 'Please leave an email address or a phone number so we can reply.' }, 400);
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'Please provide a valid email address.' }, 400);
    }
    if (phone && !isValidUkPhone(phone)) {
      return json({ error: 'Please provide a valid UK phone number.' }, 400);
    }
    const movedOn = removalDate && /^\d{4}-\d{2}-\d{2}$/.test(removalDate) ? removalDate : null;

    if (!turnstileToken) {
      return json({ error: 'Security verification is required. Please complete the CAPTCHA.' }, 400);
    }
    if (!env.TURNSTILE_SECRET_KEY) {
      return json({ error: 'Security verification unavailable. Please try again.' }, 500);
    }
    const tsRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET_KEY,
        response: turnstileToken,
        remoteip: request.headers.get('cf-connecting-ip') || undefined,
      }),
    });
    if (!tsRes.ok) return json({ error: 'Security verification unavailable. Please try again.' }, 502);
    const tsData = await tsRes.json() as { success: boolean };
    if (!tsData.success) return json({ error: 'Security verification failed. Please try again.' }, 403);

    if (!env.RESEND_API_KEY) return json({ error: `Complaint service is temporarily unavailable. Please call us on ${PHONE}.` }, 500);

    const contactRows = [
      email ? `<tr><td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">Email</td><td style="padding: 8px 0;"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>` : '',
      phone ? `<tr><td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">Phone</td><td style="padding: 8px 0;"><a href="tel:${escapeHtml(sanitizePhoneForEmail(phone))}">${escapeHtml(phone)}</a></td></tr>` : '',
      movedOn ? `<tr><td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">Removal date</td><td style="padding: 8px 0;">${escapeHtml(movedOn)}</td></tr>` : '',
      jobNumber ? `<tr><td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">Job number</td><td style="padding: 8px 0;">${escapeHtml(jobNumber)}</td></tr>` : '',
    ].join('');

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Painless Removals Website <noreply@painlessremovals.com>',
        to: ['hello@painlessremovals.com'],
        ...(email ? { reply_to: email } : {}),
        subject: `COMPLAINT: ${stripNewlines(name)}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #7f1d1d; padding: 20px 24px; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; font-size: 20px; margin: 0;">New Complaint</h1>
            </div>
            <div style="background: #ffffff; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; font-weight: 600; color: #3b6587; width: 120px; vertical-align: top;">Name</td><td style="padding: 8px 0;">${escapeHtml(name)}</td></tr>
                ${contactRows}
                <tr><td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">What happened</td><td style="padding: 8px 0; white-space: pre-wrap;">${escapeHtml(description)}</td></tr>
              </table>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
              <p style="font-size: 12px; color: #9ca3af; margin: 0;">Submitted from painlessremovals.com/complaints at ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}. A copy is in the CRM under Complaints, with a 24h first-response SLA.</p>
            </div>
          </div>`,
      }),
    });

    if (!resendRes.ok) {
      // Resend echoes parts of the payload (incl. PII) on 4xx — log only the status.
      logger.error('Complaint', 'Resend send failed', { status: resendRes.status });
      return json({ error: `Failed to send your complaint. Please try again or call us on ${PHONE}.` }, 500);
    }

    // The CRM is the system of record, but never the delivery guarantee — a
    // failure here is logged inside forwardComplaint and does not fail the request.
    const mirrored = await forwardComplaint({
      name,
      email: email ?? null,
      phone: phone ?? null,
      jobNumber: jobNumber?.trim() || null,
      description: movedOn ? `Removal date: ${movedOn}\n\n${description}` : description,
    });

    return json({ success: true, mirrored });
  } catch (err) {
    const errorId = generateErrorId();
    logger.error('Complaint', 'Unhandled error', { errorId, error: err instanceof Error ? err.message : String(err) });
    return json({ error: `Something went wrong. Please call us on ${PHONE}.`, errorId }, 500);
  }
};
