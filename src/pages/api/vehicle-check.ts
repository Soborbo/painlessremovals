/**
 * Vehicle Check Form API route — Cloudflare Workers + Astro
 *
 * Daily vehicle inspection with image attachments.
 * Migrated from functions/api/vehicle-check.ts.
 */

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isAllowedOrigin, escapeHtml, stripNewlines, json } from '@/lib/forms/utils';

export const prerender = false;

const REQUIRED_FLUIDS = ['Water levels', 'Oil levels', 'Tyre pressure', 'Lights', 'AdBlue'];
const REQUIRED_CONDITIONS = ['Cabin is tidy', 'Back is swept', 'Blankets are folded', 'Straps are stowed'];

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 8192) {
    const chunk = bytes.subarray(i, Math.min(i + 8192, bytes.length));
    chunks.push(String.fromCharCode(...chunk));
  }
  return btoa(chunks.join(''));
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const origin = request.headers.get('origin') || '';
    if (origin && !isAllowedOrigin(origin)) return json({ error: 'Forbidden.' }, 403);

    const formData = await request.formData();
    const name = (formData.get('name') as string || '').trim();
    const van = (formData.get('van') as string || '').trim();
    const fluids = (formData.get('fluids') as string || '').trim();
    const condition = (formData.get('condition') as string || '').trim();
    const comments = (formData.get('comments') as string || '').trim();
    const honeypot = (formData.get('honeypot') as string || '').trim();
    const turnstileToken = (formData.get('turnstileToken') as string || '').trim();

    if (honeypot) return json({ success: true, name });

    if (!name) return json({ error: 'Please enter your name.' }, 400);
    if (!van) return json({ error: 'Please select a van.' }, 400);

    const fluidItems = fluids.split(', ').map(s => s.trim()).filter(Boolean);
    if (!REQUIRED_FLUIDS.every(item => fluidItems.includes(item))) {
      return json({ error: 'All fluids & safety items must be ticked.' }, 400);
    }
    const conditionItems = condition.split(', ').map(s => s.trim()).filter(Boolean);
    if (!REQUIRED_CONDITIONS.every(item => conditionItems.includes(item))) {
      return json({ error: 'All vehicle condition items must be ticked.' }, 400);
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

    // Process images
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/heic'];
    const attachments: { filename: string; content: string; content_type: string }[] = [];
    const imageFiles = formData.getAll('images') as File[];

    if (imageFiles.length > 10) return json({ error: 'Maximum 10 images allowed per submission.' }, 400);

    for (const file of imageFiles) {
      if (file.size > 0) {
        if (file.size > MAX_FILE_SIZE) return json({ error: `Image "${file.name}" exceeds the 10MB size limit.` }, 400);
        if (!file.type || !ALLOWED_TYPES.includes(file.type)) return json({ error: `Invalid file type "${file.type}". Only JPEG, PNG, and HEIC are accepted.` }, 400);
        const buffer = await file.arrayBuffer();
        attachments.push({ filename: file.name, content: arrayBufferToBase64(buffer), content_type: file.type || 'application/octet-stream' });
      }
    }

    if (!env.RESEND_API_KEY) return json({ error: 'Email service is temporarily unavailable.' }, 500);

    const subject = comments
      ? `Warning — Van ${stripNewlines(van)} checked by ${stripNewlines(name)}`
      : `Van ${stripNewlines(van)} checked by ${stripNewlines(name)}`;

    const emailPayload: Record<string, unknown> = {
      from: 'Painless Removals Website <noreply@painlessremovals.com>',
      to: ['jay@painlessremovals.com'],
      subject,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #0E3C54; padding: 20px 24px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; font-size: 20px; margin: 0;">Daily Vehicle Inspection</h1>
          </div>
          <div style="background: #ffffff; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; font-weight: 600; color: #3b6587; width: 140px; vertical-align: top;">Name</td><td style="padding: 8px 0;">${escapeHtml(name)}</td></tr>
              <tr><td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">Van</td><td style="padding: 8px 0;">${escapeHtml(van)}</td></tr>
              <tr><td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">Fluids &amp; Safety</td><td style="padding: 8px 0;">${escapeHtml(fluids)}</td></tr>
              <tr><td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">Condition</td><td style="padding: 8px 0;">${escapeHtml(condition)}</td></tr>
              ${comments ? `<tr><td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">Comments</td><td style="padding: 8px 0; white-space: pre-wrap;">${escapeHtml(comments)}</td></tr>` : ''}
              ${attachments.length > 0 ? `<tr><td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">Photos</td><td style="padding: 8px 0;">${attachments.length} image${attachments.length > 1 ? 's' : ''} attached</td></tr>` : ''}
            </table>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
            <p style="font-size: 12px; color: #9ca3af; margin: 0;">Submitted from painlessremovals.com/vehicle-check at ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}</p>
          </div>
        </div>`,
    };

    if (attachments.length > 0) emailPayload.attachments = attachments;

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(emailPayload),
    });

    if (!resendRes.ok) {
      console.error('Resend error:', await resendRes.text());
      return json({ error: 'Failed to send inspection report. Please try again.' }, 500);
    }

    return json({ success: true, name });
  } catch (err) {
    console.error('Vehicle check form error:', err);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
};
