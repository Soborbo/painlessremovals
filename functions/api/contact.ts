/**
 * Contact Form — Cloudflare Pages Function
 *
 * Honeypot + Turnstile + Resend REST API
 */

interface Env {
  RESEND_API_KEY: string;
  TURNSTILE_SECRET_KEY: string;
}

const PHONE = '0117 287 0082';
const ALLOWED_ORIGINS = ['https://painlessremovals.com', 'https://www.painlessremovals.com'];
function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.includes(origin) || /^https:\/\/[a-z0-9-]+\.painlessremovals2026\.pages\.dev$/.test(origin) || origin === 'https://painlessremovals2026.pages.dev';
}
const INTERNAL_SOURCES = ['later-life-lead-magnet', 'later-life-callback', 'later-life-calculator'];

function escapeHtml(str: string): string {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function stripNewlines(str: string): string {
  return String(str).replace(/[\r\n]/g, '');
}
function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    // Origin check
    const origin = request.headers.get('origin') || '';
    if (origin && !isAllowedOrigin(origin)) {
      return json({ error: 'Forbidden.' }, 403);
    }

    const body: Record<string, string> = await request.json();
    const { name, phone, email, message, honeypot, turnstileToken, source } = body;

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

    return json({ success: true });
  } catch (err) {
    console.error('Contact form error:', err);
    return json({ error: `Something went wrong. Please try again or call us on ${PHONE}.` }, 500);
  }
};
