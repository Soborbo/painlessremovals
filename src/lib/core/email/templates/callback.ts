/**
 * CALLBACK EMAIL TEMPLATES
 *
 * Customer confirmation + internal admin notification for callback requests.
 * Shared between the `/api/callbacks` POST route (form submissions) and the
 * email-click flow on `simple-callback.astro` (customer clicks the CTA in the
 * quote email), so both surfaces send byte-identical emails.
 */

import { escapeHtml, EMAIL_STYLES, sectionHeader, row, buildSelectionRows } from './helpers';
import { sanitizePhoneForEmail } from '@/lib/forms/utils';

const IMG = 'https://painlessremovals.com/images/email';

export function generateCallbackCustomerEmail(name: string, reason?: string): string {
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

export function generateCallbackAdminEmail(
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
