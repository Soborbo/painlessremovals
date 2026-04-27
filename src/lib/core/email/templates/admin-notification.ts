/**
 * ADMIN NOTIFICATION EMAIL TEMPLATE
 *
 * Sent to hello@painlessremovals.com when a new quote is submitted.
 * Painless Removals brand design.
 */

import type { Quote } from '@/lib/core/types';
import { formatPrice } from '@/lib/utils';
import {
  escapeHtml,
  buildSelectionRows,
  buildBreakdownRows,
  sectionHeader,
  row,
  EMAIL_STYLES,
} from './helpers';

export interface AdminEmailOptions {
  /** When false, a prominent banner is shown warning that the CRM sync failed. */
  crmSynced?: boolean;
}

export function generateAdminNotificationEmail(quote: Quote, options: AdminEmailOptions = {}): string {
  const data = (quote.calculatorData || {}) as Record<string, unknown>;
  const breakdown = (quote.breakdown || {}) as Record<string, number>;
  const phone = quote.phone || '';
  const priceFormatted = formatPrice(quote.totalPrice, quote.currency);
  const crmSynced = options.crmSynced !== false;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>&#x1F7E2; New Instant Quote  - ${escapeHtml(priceFormatted)}</title>
  <style>${EMAIL_STYLES}</style>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f4;">
<tr><td align="center" style="padding:24px 12px;">

  <table cellpadding="0" cellspacing="0" border="0" class="email-container" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

    <!-- Header -->
    <tr>
      <td class="email-header" style="background-color:#005349;padding:28px 24px;text-align:center;">
        <h1 style="margin:0 0 6px;font-size:22px;color:#ffffff;font-weight:700;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
          &#x1F7E2; New Instant Quote
        </h1>
        <p style="margin:0;font-size:28px;font-weight:800;color:#f9a00f;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">${escapeHtml(priceFormatted)}</p>
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td class="email-body" style="padding:28px 24px 8px;font-size:15px;line-height:1.65;color:#333333;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

        <p style="margin:0 0 8px;">Hello Team,</p>
        <p style="margin:0 0 20px;">A new removal inquiry has just come in. Please review the details below and <strong style="color:#dc3f04;">call the client as soon as possible.</strong></p>

        ${crmSynced ? '' : `
        <!-- CRM sync failure banner -->
        <div style="margin:0 0 20px;padding:14px 16px;background:#fff4e5;border:2px solid #dc3f04;border-radius:8px;color:#8a2b00;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
          <p style="margin:0 0 6px;font-size:15px;font-weight:700;">&#x26A0; CRM sync failed for this lead</p>
          <p style="margin:0;font-size:14px;">The i-mve sync did not complete after retries. <strong>Please add this lead to the CRM manually</strong> from the details below.</p>
        </div>
        `}

        ${phone ? `
        <!-- Call button -->
        <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 24px;">
          <tr>
            <td style="background-color:#dc3f04;border-radius:8px;text-align:center;">
              <a href="tel:${escapeHtml(phone)}" style="color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 28px;display:inline-block;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">&#x1F4DE; Call Client Now: ${escapeHtml(phone)}</a>
            </td>
          </tr>
        </table>
        ` : ''}

        <!-- Details tables -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid #e8e8e8;border-radius:8px;overflow:hidden;margin-bottom:8px;">
          ${sectionHeader('Client Details')}
          ${row('Inquiry ID', `#${quote.id}`)}
          ${row('Name', quote.name)}
          ${row('Phone', phone)}
          ${row('Email', quote.email)}

          ${buildSelectionRows(data)}

          ${Object.keys(breakdown).length > 0 ? buildBreakdownRows(breakdown, quote.currency) : ''}

          ${sectionHeader('Total')}
          <tr>
            <td style="padding:12px 14px;font-weight:700;font-size:17px;color:#005349;background:#f0f7f6;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">Total excl. VAT</td>
            <td style="padding:12px 14px;font-weight:800;font-size:17px;color:#005349;background:#f0f7f6;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">${escapeHtml(priceFormatted)}</td>
          </tr>
        </table>

      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td class="email-footer" style="text-align:center;padding:16px 24px 20px;font-size:12px;color:#aaaaaa;background:#f9f9f9;border-top:1px solid #eeeeee;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
        <p style="margin:0;">Painless Removals  - Internal notification &middot; #${escapeHtml(String(quote.id))}</p>
      </td>
    </tr>

  </table>
</td></tr>
</table>
</body>
</html>`;
}
