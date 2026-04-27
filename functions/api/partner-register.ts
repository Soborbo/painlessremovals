/**
 * Partner Registration — Cloudflare Pages Function
 *
 * POST /api/partner-register
 */

import {
  type Env,
  json,
  escapeHtml,
  stripNewlines,
  verifyTurnstile,
  sendEmail,
  emailChrome,
  emailFooter,
  PHONE,
  FROM_DEFAULT,
} from '../_shared/utils';

const businessTypeLabels: Record<string, string> = {
  'estate-agent': 'Estate Agent',
  'solicitor': 'Solicitor / Conveyancer',
  'care-home': 'Care Home / Senior Living',
  'relocation-agent': 'Corporate Relocation',
  'home-staging': 'Home Staging / Interior Design',
  'property-developer': 'Property Developer',
  'other': 'Other',
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = (await context.request.json()) as Record<string, string>;
    const {
      name, companyName, role, businessType, estimatedReferrals,
      whatMatters, email, phone, preferredContact, honeypot, turnstileToken,
    } = body;

    // 1. Honeypot
    if (honeypot) return json({ success: true });

    // 2. Required fields
    if (!name || !companyName || !email || !phone) {
      return json({ error: 'Please fill in all required fields.' }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'Please provide a valid email address.' }, 400);
    }

    // 3. Turnstile
    if (!turnstileToken) {
      return json({ error: 'Security verification is required. Please complete the CAPTCHA.' }, 400);
    }
    const secret = context.env.TURNSTILE_SECRET_KEY;
    if (!secret) {
      console.error('TURNSTILE_SECRET_KEY is not configured');
      return json({ error: 'Security configuration error. Please try again later.' }, 500);
    }
    if (!(await verifyTurnstile(turnstileToken, secret))) {
      return json({ error: 'Security verification failed. Please try again.' }, 403);
    }

    // 4. Send email via Resend REST API
    const apiKey = context.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('RESEND_API_KEY is not configured');
      return json({ error: `Email service is temporarily unavailable. Please call us on ${PHONE}.` }, 500);
    }

    const tableRows = `
      <tr>
        <td style="padding: 8px 0; font-weight: 600; color: #3b6587; width: 160px; vertical-align: top;">Name</td>
        <td style="padding: 8px 0;">${escapeHtml(name)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">Company</td>
        <td style="padding: 8px 0;">${escapeHtml(companyName)}</td>
      </tr>
      ${role ? `
      <tr>
        <td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">Role</td>
        <td style="padding: 8px 0;">${escapeHtml(role)}</td>
      </tr>` : ''}
      ${businessType ? `
      <tr>
        <td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">Business Type</td>
        <td style="padding: 8px 0;">${escapeHtml(businessTypeLabels[businessType] || businessType)}</td>
      </tr>` : ''}
      ${estimatedReferrals ? `
      <tr>
        <td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">Est. Referrals/Month</td>
        <td style="padding: 8px 0;">${escapeHtml(estimatedReferrals)}</td>
      </tr>` : ''}
      <tr>
        <td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">Phone</td>
        <td style="padding: 8px 0;"><a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a></td>
      </tr>
      <tr>
        <td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">Email</td>
        <td style="padding: 8px 0;"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td>
      </tr>
      ${preferredContact ? `
      <tr>
        <td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">Preferred Contact</td>
        <td style="padding: 8px 0;">${escapeHtml(preferredContact.charAt(0).toUpperCase() + preferredContact.slice(1))}</td>
      </tr>` : ''}
      ${whatMatters ? `
      <tr>
        <td style="padding: 8px 0; font-weight: 600; color: #3b6587; vertical-align: top;">What Matters Most</td>
        <td style="padding: 8px 0; white-space: pre-wrap;">${escapeHtml(whatMatters)}</td>
      </tr>` : ''}
    `;

    const result = await sendEmail(apiKey, {
      from: FROM_DEFAULT,
      to: ['jay@painlessremovals.com'],
      reply_to: email,
      subject: `New Trade Partner Registration: ${stripNewlines(name)} — ${stripNewlines(companyName)}`,
      html: emailChrome(
        'New Trade Partner Registration',
        `<table style="width: 100%; border-collapse: collapse;">${tableRows}</table>${emailFooter('painlessremovals.com/partners')}`,
      ),
    });

    if (!result.success) {
      console.error('Resend error:', result.error);
      return json({ error: `Failed to send your registration. Please try again or call us on ${PHONE}.` }, 500);
    }

    return json({ success: true });
  } catch (err) {
    console.error('Partner registration error:', err);
    return json({ error: `Something went wrong. Please try again or call us on ${PHONE}.` }, 500);
  }
};
