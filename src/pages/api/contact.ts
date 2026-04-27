/**
 * Contact Form API route — Cloudflare Workers + Astro
 *
 * Honeypot + Turnstile + Resend REST API.
 * Migrated from functions/api/contact.ts.
 */

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isAllowedOrigin, escapeHtml, stripNewlines, json, PHONE } from '@/lib/forms/utils';
import { sendGA4MP, sendMetaCapi, deriveClientId } from '@/lib/tracking/server';

export const prerender = false;

const INTERNAL_SOURCES = ['later-life-lead-magnet', 'later-life-callback', 'later-life-calculator'];

interface ContactBody {
  name?: string;
  phone?: string;
  email?: string;
  message?: string;
  honeypot?: string;
  turnstileToken?: string;
  source?: string;
  event_id?: string;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    // Origin check
    const origin = request.headers.get('origin') || '';
    if (origin && !isAllowedOrigin(origin)) {
      return json({ error: 'Forbidden.' }, 403);
    }

    const body = await request.json() as ContactBody;
    const { name, phone, email, message, honeypot, turnstileToken, source, event_id } = body;

    // Honeypot
    if (honeypot) return json({ success: true });

    // Validate
    if (!name || !phone || !email) return json({ error: 'Please fill in all required fields.' }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Please provide a valid email address.' }, 400);

    // Turnstile (skip for internal forms)
    const isInternalForm = !!(source && INTERNAL_SOURCES.includes(source));
    if (!turnstileToken && !isInternalForm) {
      return json({ error: 'Security verification is required. Please complete the CAPTCHA.' }, 400);
    }
    if (turnstileToken && env.TURNSTILE_SECRET_KEY) {
      const tsRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: turnstileToken }),
      });
      if (!tsRes.ok) return json({ error: 'Security verification unavailable. Please try again.' }, 502);
      const tsData = await tsRes.json() as { success: boolean };
      if (!tsData.success) return json({ error: 'Security verification failed. Please try again.' }, 403);
    }

    // Send email via Resend REST API
    if (!env.RESEND_API_KEY) return json({ error: `Email service is temporarily unavailable. Please call us on ${PHONE}.` }, 500);

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Painless Removals Website <noreply@painlessremovals.com>',
        to: ['hello@painlessremovals.com'],
        reply_to: email,
        subject: `New Contact Form: ${stripNewlines(name)} – ${stripNewlines(phone)}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #0E3C54; padding: 20px 24px; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; font-size: 20px; margin: 0;">New Contact Form Submission</h1>
            </div>
            <div style="background: #ffffff; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; font-weight: 600; color: #3b6587; width: 120px; vertical-align: top;">Name</td><td style="padding: 8px 0;">${escapeHtml(name)}</td></tr>
                <tr><td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">Phone</td><td style="padding: 8px 0;"><a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a></td></tr>
                <tr><td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">Email</td><td style="padding: 8px 0;"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
                ${message ? `<tr><td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">Message</td><td style="padding: 8px 0; white-space: pre-wrap;">${escapeHtml(message)}</td></tr>` : ''}
              </table>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
              <p style="font-size: 12px; color: #9ca3af; margin: 0;">Submitted from painlessremovals.com/contact at ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}</p>
            </div>
          </div>`,
      }),
    });

    if (!resendRes.ok) {
      const err = await resendRes.text();
      console.error('Resend error:', err);
      return json({ error: `Failed to send your message. Please try again or call us on ${PHONE}.` }, 500);
    }

    // ──────────────────────────────────────────────────────────────────
    // CONVERSION fire — server-side, only after Turnstile + Resend OK.
    // Browser fires the same event with the same event_id; Meta dedupes.
    // Skipped if no event_id was provided (e.g. an internal/legacy caller).
    // ──────────────────────────────────────────────────────────────────
    if (event_id && typeof event_id === 'string') {
      const fingerprint = event_id.replace(/-/g, '').slice(0, 16);
      const clientId = deriveClientId(fingerprint);
      const userAgent = request.headers.get('user-agent') || undefined;
      const cf = (request as unknown as { cf?: { country?: string } }).cf;
      const ipAddress = request.headers.get('cf-connecting-ip')
        || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || undefined;

      // Split name into first/last for Meta CAPI
      const nameParts = name.trim().split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined;

      // Fire-and-forget: don't block the response on tracking
      void sendGA4MP(
        env,
        clientId,
        [{
          name: 'contact_form_conversion',
          params: {
            form_source: source || 'contact_page',
            engagement_time_msec: 100,
          },
        }],
        { userAgent, ipOverride: ipAddress },
      ).catch(() => { /* best-effort */ });

      void sendMetaCapi(env, [{
        event_name: 'contact_form_conversion',
        event_id,
        event_time: Math.floor(Date.now() / 1000),
        event_source_url: request.headers.get('referer') || `https://painlessremovals.com/contact/`,
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
          form_source: source || 'contact_page',
        },
      }]).catch(() => { /* best-effort */ });
    }

    return json({ success: true, event_id: event_id || null });
  } catch (err) {
    console.error('Contact form error:', err);
    return json({ error: `Something went wrong. Please try again or call us on ${PHONE}.` }, 500);
  }
};
