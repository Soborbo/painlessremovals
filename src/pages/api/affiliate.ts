/**
 * Affiliate Referral API route — Cloudflare Workers + Astro
 *
 * POST /api/affiliate
 *
 * Sends two emails:
 *  1. Admin notification to hello@painlessremovals.com
 *  2. Auto-intro email to the referred client
 *
 * Migrated from functions/api/affiliate.ts.
 */

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import {
  json,
  escapeHtml,
  stripNewlines,
  verifyTurnstile,
  sendEmail,
  emailChrome,
  emailFooter,
  PHONE,
  FROM_DEFAULT,
} from '@/lib/forms/utils';
import { logger } from '@/lib/utils/logger';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = (await request.json()) as Record<string, string>;
    const { referringAgent, clientName, clientPhone, clientEmail, gdprConsent, honeypot, turnstileToken } = body;

    // 1. Honeypot
    if (honeypot) return json({ success: true, clientName: '' });

    // 2. Required fields
    if (!referringAgent || !clientName || !clientPhone || !clientEmail) {
      return json({ error: 'Please fill in all required fields.' }, 400);
    }
    if (!gdprConsent) {
      return json({ error: 'GDPR consent is required to submit a referral.' }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
      return json({ error: 'Please provide a valid email address for the client.' }, 400);
    }
    if (!/^(?:\+44|0)\d{9,10}$/.test(clientPhone.replace(/\s/g, ''))) {
      return json({ error: 'Please provide a valid UK phone number for the client.' }, 400);
    }

    // 3. Turnstile
    if (!turnstileToken) {
      return json({ error: 'Security verification is required. Please complete the CAPTCHA.' }, 400);
    }
    const secret = env.TURNSTILE_SECRET_KEY;
    if (!secret) {
      logger.error('Affiliate', 'TURNSTILE_SECRET_KEY is not configured');
      return json({ error: 'Security configuration error. Please try again later.' }, 500);
    }
    if (!(await verifyTurnstile(turnstileToken, secret))) {
      return json({ error: 'Security verification failed. Please try again.' }, 403);
    }

    // 4. Send emails via Resend REST API
    const apiKey = env.RESEND_API_KEY;
    if (!apiKey) {
      logger.error('Affiliate', 'RESEND_API_KEY is not configured');
      return json({ error: `Email service is temporarily unavailable. Please call us on ${PHONE}.` }, 500);
    }

    // Email 1 — Admin notification
    const adminRows = `
      <tr>
        <td style="padding: 8px 0; font-weight: 600; color: #3b6587; width: 140px; vertical-align: top;">Referring Agent</td>
        <td style="padding: 8px 0;">${escapeHtml(referringAgent)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">Client Name</td>
        <td style="padding: 8px 0;">${escapeHtml(clientName)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">Client Phone</td>
        <td style="padding: 8px 0;"><a href="tel:${escapeHtml(clientPhone)}">${escapeHtml(clientPhone)}</a></td>
      </tr>
      <tr>
        <td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">Client Email</td>
        <td style="padding: 8px 0;"><a href="mailto:${escapeHtml(clientEmail)}">${escapeHtml(clientEmail)}</a></td>
      </tr>
    `;

    const adminResult = await sendEmail(apiKey, {
      from: FROM_DEFAULT,
      to: ['hello@painlessremovals.com'],
      subject: `New Referral from ${stripNewlines(referringAgent)}`,
      html: emailChrome(
        'New Partner Referral',
        `<table style="width: 100%; border-collapse: collapse;">${adminRows}</table>${emailFooter('painlessremovals.com/affiliate-form')}`,
      ),
    });

    if (!adminResult.success) {
      logger.error('Affiliate', 'Resend admin email failed', { error: adminResult.error });
      return json({ error: `Failed to send the referral. Please try again or call us on ${PHONE}.` }, 500);
    }

    // Email 2 — Auto-intro to client
    const clientResult = await sendEmail(apiKey, {
      from: 'Jay Newton — Painless Removals <noreply@painlessremovals.com>',
      to: [clientEmail],
      reply_to: 'hello@painlessremovals.com',
      subject: 'Our partner referred you to us',
      html: emailChrome('Painless Removals', `
        <p style="font-size: 16px; line-height: 1.6; margin: 0 0 16px;">
          Hi ${escapeHtml(clientName)},
        </p>
        <p style="font-size: 16px; line-height: 1.6; margin: 0 0 16px;">
          I'm Jay Newton from Painless Removals. Our partner <strong>${escapeHtml(referringAgent)}</strong> let us know you might need help with a move, so I wanted to introduce myself.
        </p>
        <p style="font-size: 16px; line-height: 1.6; margin: 0 0 16px;">
          We're a family-run removals company based in Bristol, and we've been helping people move since 1978. We pride ourselves on making the whole process as stress-free as possible &mdash; it's right there in our name!
        </p>
        <p style="font-size: 16px; line-height: 1.6; margin: 0 0 16px;">
          Here's how we can help:
        </p>
        <ul style="font-size: 16px; line-height: 1.8; margin: 0 0 16px; padding-left: 20px;">
          <li>A free, no-obligation quote for your move</li>
          <li>Professional packing services if you need them</li>
          <li>Fully insured and experienced crews</li>
          <li>Flexible scheduling to suit your timeline</li>
        </ul>
        <p style="font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
          The easiest way to get started is to grab an instant quote online, or give us a ring and we'll chat through your move together.
        </p>
        <div style="text-align: center; margin: 0 0 24px;">
          <a href="https://www.painlessremovals.com/instantquote/" style="display: inline-block; background-color: #ea580c; color: #ffffff; padding: 14px 32px; font-size: 16px; font-weight: bold; text-decoration: none; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Get Your Instant Quote</a>
        </div>
        <p style="font-size: 16px; line-height: 1.6; margin: 0 0 16px;">
          Or call us directly on <a href="tel:01172870082" style="color: #0E3C54; font-weight: 600; text-decoration: none;">${PHONE}</a> (Mon&ndash;Fri, 9am&ndash;5pm).
        </p>
        <p style="font-size: 16px; line-height: 1.6; margin: 0 0 4px;">
          Looking forward to helping with your move!
        </p>
        <p style="font-size: 16px; line-height: 1.6; margin: 0 0 0;">
          <strong>Jay Newton</strong><br />
          Painless Removals<br />
          <a href="https://www.painlessremovals.com" style="color: #0E3C54; text-decoration: none;">www.painlessremovals.com</a>
        </p>
      `),
    });

    if (!clientResult.success) {
      logger.error('Affiliate', 'Resend client email failed', { error: clientResult.error });
      return json({
        success: true,
        clientName,
        warning: 'Referral registered, but the introduction email to the client could not be sent. The team will follow up manually.',
      });
    }

    return json({ success: true, clientName });
  } catch (err) {
    logger.error('Affiliate', 'Form handler crashed', { error: err instanceof Error ? err.message : String(err) });
    return json({ error: `Something went wrong. Please try again or call us on ${PHONE}.` }, 500);
  }
};
