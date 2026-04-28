/**
 * Clearance Calculator Callback API route — Cloudflare Workers + Astro
 *
 * Admin notification + user confirmation email.
 * Migrated from functions/api/clearance-callback.ts.
 */

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isAllowedOrigin, escapeHtml, stripNewlines, json, PHONE } from '@/lib/forms/utils';
import { sendGA4MP, sendMetaCapi, deriveClientId } from '@/lib/tracking/server';
import { logger } from '@/lib/utils/logger';

export const prerender = false;

interface ClearanceBody {
  name?: string;
  phone?: string;
  email?: string;
  honeypot?: string;
  turnstileToken?: string;
  estimate?: string;
  summary?: string;
  postcode?: string;
  event_id?: string;
}

async function sendResend(apiKey: string, payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return { ok: false, error: await res.text() };
  return { ok: true };
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const origin = request.headers.get('origin') || '';
    if (origin && !isAllowedOrigin(origin)) return json({ error: 'Forbidden.' }, 403);

    const body = await request.json() as ClearanceBody;
    const { name, phone, email, honeypot, turnstileToken, estimate, summary, postcode, event_id } = body;

    if (honeypot) return json({ success: true });

    if (!name || !phone || !email) return json({ error: 'Please fill in all required fields.' }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Please provide a valid email address.' }, 400);
    if (!/^(?:\+44|0)\d{9,10}$/.test(phone.replace(/\s/g, ''))) {
      return json({ error: 'Please provide a valid UK phone number.' }, 400);
    }

    // Turnstile
    if (!turnstileToken) return json({ error: 'Security verification is required. Please complete the CAPTCHA.' }, 400);
    if (!env.TURNSTILE_SECRET_KEY) return json({ error: 'Security verification unavailable. Please try again.' }, 500);
    {
      const tsRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: turnstileToken }),
      });
      if (!tsRes.ok) return json({ error: 'Security verification unavailable. Please try again.' }, 502);
      const tsData = await tsRes.json() as { success: boolean };
      if (!tsData.success) return json({ error: 'Security verification failed. Please try again.' }, 403);
    }

    if (!env.RESEND_API_KEY) return json({ error: `Email service is temporarily unavailable. Please call us on ${PHONE}.` }, 500);

    const timestamp = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' });
    const summaryHtml = escapeHtml(summary || '').replace(/\n/g, '<br>');

    // Admin notification
    const adminResult = await sendResend(env.RESEND_API_KEY, {
      from: 'Painless Removals Website <noreply@painlessremovals.com>',
      to: ['hello@painlessremovals.com'],
      reply_to: email,
      subject: `Clearance Callback: ${stripNewlines(name)} – ${stripNewlines(phone)} (${stripNewlines(estimate || 'no estimate')})`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #0E3C54; padding: 20px 24px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; font-size: 20px; margin: 0;">Clearance Callback Request</h1>
          </div>
          <div style="background: #ffffff; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; font-weight: 600; color: #3b6587; width: 120px; vertical-align: top;">Name</td><td style="padding: 8px 0;">${escapeHtml(name)}</td></tr>
              <tr><td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">Phone</td><td style="padding: 8px 0;"><a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a></td></tr>
              <tr><td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">Email</td><td style="padding: 8px 0;"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
              ${postcode ? `<tr><td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">Postcode</td><td style="padding: 8px 0;">${escapeHtml(postcode)}</td></tr>` : ''}
              ${estimate ? `<tr><td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">Estimate</td><td style="padding: 8px 0; font-size: 18px; font-weight: bold;">${escapeHtml(estimate)}</td></tr>` : ''}
              ${summary ? `<tr><td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">Breakdown</td><td style="padding: 8px 0; font-size: 13px; color: #6b7280;">${summaryHtml}</td></tr>` : ''}
            </table>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
            <p style="font-size: 12px; color: #9ca3af; margin: 0;">Submitted from clearance calculator at ${timestamp}</p>
          </div>
        </div>`,
    });

    if (!adminResult.ok) {
      logger.error('ClearanceCallback', 'Resend admin email failed', { error: adminResult.error });
      return json({ error: `Failed to send your request. Please try again or call us on ${PHONE}.` }, 500);
    }

    // User confirmation
    const userResult = await sendResend(env.RESEND_API_KEY, {
      from: 'Jay Newton — Painless Removals <noreply@painlessremovals.com>',
      to: [email],
      reply_to: 'hello@painlessremovals.com',
      subject: "We've received your clearance enquiry",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #0E3C54; padding: 20px 24px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; font-size: 20px; margin: 0;">Thanks for your enquiry, ${escapeHtml(name.split(' ')[0])}!</h1>
          </div>
          <div style="background: #ffffff; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            <p style="font-size: 16px; color: #374151; margin: 0 0 16px;">We've received your clearance callback request and one of our team will be in touch shortly.</p>
            ${estimate ? `
            <div style="background: #f0f7ff; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
              <p style="font-size: 13px; color: #6b7280; margin: 0 0 4px;">Your estimated clearance cost:</p>
              <p style="font-size: 28px; font-weight: bold; color: #0E3C54; margin: 0;">${escapeHtml(estimate)}</p>
              <p style="font-size: 12px; color: #9ca3af; margin: 4px 0 0;">Guide price only – we'll confirm after assessment.</p>
            </div>` : ''}
            <p style="font-size: 14px; color: #374151; margin: 0 0 8px;"><strong>Our office hours:</strong> Monday – Friday, 9am – 5pm</p>
            <p style="font-size: 14px; color: #374151; margin: 0 0 20px;">Need us sooner? Call us directly on <a href="tel:01172870082" style="color: #3b6587; font-weight: 600;">${PHONE}</a></p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
            <p style="font-size: 13px; color: #6b7280; margin: 0;">Jay Newton<br>Director, Painless Removals<br><a href="https://www.painlessremovals.com" style="color: #3b6587;">www.painlessremovals.com</a></p>
          </div>
        </div>`,
    });

    if (!userResult.ok) logger.error('ClearanceCallback', 'Resend user confirmation failed', { error: userResult.error });

    // ──────────────────────────────────────────────────────────────────
    // CONVERSION fire — server-side, only after Turnstile + Resend OK.
    // Browser fires the same event with the same event_id; Meta dedupes.
    // ──────────────────────────────────────────────────────────────────
    if (event_id && typeof event_id === 'string') {
      const fingerprint = event_id.replace(/-/g, '').slice(0, 16);
      const clientId = deriveClientId(fingerprint);
      const userAgent = request.headers.get('user-agent') || undefined;
      const cf = (request as unknown as { cf?: { country?: string } }).cf;
      const ipAddress = request.headers.get('cf-connecting-ip')
        || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || undefined;

      const nameParts = name.trim().split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined;

      // Parse the £ estimate to a numeric value for Smart Bidding signal.
      const estimateValue = (() => {
        if (!estimate) return undefined;
        const m = String(estimate).replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
        return m ? Number(m[1]) : undefined;
      })();

      void sendGA4MP(
        env,
        clientId,
        [{
          name: 'clearance_callback_conversion',
          params: {
            form_source: 'clearance-calculator',
            engagement_time_msec: 100,
            ...(estimateValue !== undefined ? { value: estimateValue, currency: 'GBP' } : {}),
            ...(postcode ? { postcode } : {}),
          },
        }],
        { userAgent, ipOverride: ipAddress },
      ).catch(() => { /* best-effort */ });

      void sendMetaCapi(env, [{
        event_name: 'clearance_callback_conversion',
        event_id,
        event_time: Math.floor(Date.now() / 1000),
        event_source_url: request.headers.get('referer') || `https://painlessremovals.com/house-and-waste-clearance/`,
        action_source: 'website',
        user_data: {
          email,
          phone_number: phone,
          first_name: firstName,
          last_name: lastName,
          country: cf?.country,
          client_user_agent: userAgent,
          client_ip_address: ipAddress,
        },
        custom_data: {
          form_source: 'clearance-calculator',
          ...(estimateValue !== undefined ? { value: estimateValue, currency: 'GBP' } : {}),
        },
      }]).catch(() => { /* best-effort */ });
    }

    return json({ success: true, event_id: event_id || null });
  } catch (err) {
    logger.error('ClearanceCallback', 'Form handler crashed', { error: err instanceof Error ? err.message : String(err) });
    return json({ error: `Something went wrong. Please try again or call us on ${PHONE}.` }, 500);
  }
};
