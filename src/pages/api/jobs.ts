/**
 * Job Application Form API route — Cloudflare Workers + Astro
 *
 * Honeypot + Turnstile + Resend REST API (with CV attachment).
 * Migrated from functions/api/jobs.ts.
 */

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isAllowedOrigin, escapeHtml, stripNewlines, json, PHONE } from '@/lib/forms/utils';

export const prerender = false;

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt'];
const ALLOWED_MIME_TYPES = [
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain', 'text/rtf', 'application/rtf',
  'application/vnd.oasis.opendocument.text',
];

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  // Process in 8KB chunks to avoid call stack limits with String.fromCharCode
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 8192) {
    const chunk = bytes.subarray(i, Math.min(i + 8192, bytes.length));
    chunks.push(String.fromCharCode(...chunk));
  }
  return btoa(chunks.join(''));
}

export const POST: APIRoute = async ({ request }) => {
  try {
    // Origin check
    const origin = request.headers.get('origin') || '';
    if (origin && !isAllowedOrigin(origin)) return json({ error: 'Forbidden.' }, 403);

    const formData = await request.formData();
    const name = (formData.get('name') as string || '').trim();
    const phone = (formData.get('phone') as string || '').trim();
    const email = (formData.get('email') as string || '').trim();
    const position = (formData.get('position') as string || '').trim();
    const licence = (formData.get('licence') as string || '').trim();
    const message = (formData.get('message') as string || '').trim();
    const honeypot = (formData.get('honeypot') as string || '').trim();
    const turnstileToken = (formData.get('turnstileToken') as string || '').trim();
    const cvFile = formData.get('cv') as File | null;

    // Honeypot
    if (honeypot) return json({ success: true });

    // Validate
    if (!name || !phone || !email || !position || !licence) return json({ error: 'Please fill in all required fields.' }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Please provide a valid email address.' }, 400);

    // Validate CV
    let cvAttachment: { filename: string; content: string } | null = null;
    if (cvFile && cvFile.size > 0) {
      if (cvFile.size > MAX_FILE_SIZE) return json({ error: 'CV file is too large. Maximum size is 5 MB.' }, 400);
      const fileName = cvFile.name || '';
      const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
      if (!ALLOWED_EXTENSIONS.includes(ext) || (cvFile.type && !ALLOWED_MIME_TYPES.includes(cvFile.type))) {
        return json({ error: 'Invalid file type. Please upload a PDF, DOC, DOCX, TXT, RTF, or ODT file.' }, 400);
      }
      const arrayBuffer = await cvFile.arrayBuffer();
      cvAttachment = { filename: fileName, content: arrayBufferToBase64(arrayBuffer) };
    }

    // Turnstile
    if (!turnstileToken) return json({ error: 'Security verification is required. Please complete the CAPTCHA.' }, 400);
    if (!env.TURNSTILE_SECRET_KEY) return json({ error: 'Security configuration error. Please try again later.' }, 500);
    const tsRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: turnstileToken }),
    });
    if (!tsRes.ok) return json({ error: 'Security verification unavailable. Please try again.' }, 502);
    const tsData = await tsRes.json() as { success: boolean };
    if (!tsData.success) return json({ error: 'Security verification failed. Please try again.' }, 403);

    // Send email via Resend REST API
    if (!env.RESEND_API_KEY) return json({ error: `Email service is temporarily unavailable. Please call us on ${PHONE}.` }, 500);

    const emailPayload: Record<string, unknown> = {
      from: 'Painless Removals Website <noreply@painlessremovals.com>',
      to: ['jay@painlessremovals.com'],
      reply_to: email,
      subject: `New Job Application: ${stripNewlines(name)} — ${stripNewlines(position)}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #0E3C54; padding: 20px 24px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; font-size: 20px; margin: 0;">New Job Application</h1>
          </div>
          <div style="background: #ffffff; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; font-weight: 600; color: #3b6587; width: 120px; vertical-align: top;">Name</td><td style="padding: 8px 0;">${escapeHtml(name)}</td></tr>
              <tr><td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">Phone</td><td style="padding: 8px 0;"><a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a></td></tr>
              <tr><td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">Email</td><td style="padding: 8px 0;"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
              <tr><td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">Position</td><td style="padding: 8px 0;">${escapeHtml(position)}</td></tr>
              <tr><td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">Driving Licence</td><td style="padding: 8px 0;">${escapeHtml(licence)}</td></tr>
              ${message ? `<tr><td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">Message</td><td style="padding: 8px 0; white-space: pre-wrap;">${escapeHtml(message)}</td></tr>` : ''}
              ${cvAttachment ? `<tr><td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">CV</td><td style="padding: 8px 0;">Attached: ${escapeHtml(cvAttachment.filename)}</td></tr>` : ''}
            </table>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
            <p style="font-size: 12px; color: #9ca3af; margin: 0;">Submitted from painlessremovals.com/jobs at ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}</p>
          </div>
        </div>`,
    };

    if (cvAttachment) {
      emailPayload.attachments = [{ filename: cvAttachment.filename, content: cvAttachment.content }];
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(emailPayload),
    });

    if (!resendRes.ok) {
      const err = await resendRes.text();
      console.error('Resend error:', err);
      return json({ error: `Failed to send your application. Please try again or call us on ${PHONE}.` }, 500);
    }

    // Send confirmation email to applicant (fire-and-forget)
    const confirmationPayload = {
      from: 'Painless Removals <noreply@painlessremovals.com>',
      to: [email],
      reply_to: 'jay@painlessremovals.com',
      subject: "We've received your application — Painless Removals",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #0E3C54; padding: 20px 24px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; font-size: 20px; margin: 0;">Application Received</h1>
          </div>
          <div style="background: #ffffff; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            <p style="font-size: 16px; color: #1f2937; margin: 0 0 16px;">Dear ${escapeHtml(name)}!</p>
            <p style="font-size: 15px; color: #374151; line-height: 1.6; margin: 0 0 12px;">Thank you for your application to join the Painless Removals team as a <strong>${escapeHtml(position)}</strong>.</p>
            <p style="font-size: 15px; color: #374151; line-height: 1.6; margin: 0 0 12px;">We've received your details and Jay will review your application personally. If your profile is a good fit, we'll be in touch soon to arrange a chat.</p>
            <p style="font-size: 15px; color: #374151; line-height: 1.6; margin: 0 0 12px;">In the meantime, if you have any questions, feel free to give us a call on <a href="tel:01172870082" style="color: #0E3C54; font-weight: 600;">${PHONE}</a> or reply to this email.</p>
            <p style="font-size: 15px; color: #374151; line-height: 1.6; margin: 0;">Kind regards,<br/><strong>The Painless Removals Team</strong></p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0 12px;" />
            <p style="font-size: 12px; color: #9ca3af; margin: 0;">Painless Removals — Moving Bristol families since 1978</p>
          </div>
        </div>`,
    };

    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(confirmationPayload),
    }).catch((err) => console.error('Confirmation email error:', err));

    return json({ success: true });
  } catch (err) {
    console.error('Job application form error:', err);
    return json({ error: `Something went wrong. Please try again or call us on ${PHONE}.` }, 500);
  }
};
