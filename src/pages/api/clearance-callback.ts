/**
 * Clearance Calculator Callback API route — Cloudflare Workers + Astro
 *
 * Admin notification + user confirmation email.
 * Migrated from functions/api/clearance-callback.ts.
 */

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isAllowedOrigin, escapeHtml, stripNewlines, json, PHONE } from '@/lib/forms/utils';

export const prerender = false;

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

    const body = await request.json() as Record<string, string>;
    const { name, phone, email, honeypot, turnstileToken, estimate, summary, postcode } = body;

    if (honeypot) return json({ success: true });

    if (!name || !phone || !email) return json({ error: 'Please fill in all required fields.' }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Please provide a valid email address.' }, 400);

    // Turnstile
    if (!turnstileToken) return json({ error: 'Security verification is required. Please complete the CAPTCHA.' }, 400);
    if (env.TURNSTILE_SECRET_KEY && turnstileToken) {
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
      console.error('Resend admin email error:', adminResult.error);
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

    if (!userResult.ok) console.error('Resend user confirmation error:', userResult.error);

    return json({ success: true });
  } catch (err) {
    console.error('Clearance callback error:', err);
    return json({ error: `Something went wrong. Please try again or call us on ${PHONE}.` }, 500);
  }
};
