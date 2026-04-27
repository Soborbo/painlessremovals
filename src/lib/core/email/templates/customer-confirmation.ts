/**
 * CUSTOMER CONFIRMATION EMAIL TEMPLATE
 *
 * Sent to the customer after they receive their quote.
 * Service-specific variants: home, home-complex (>£1800), office, clearance.
 */

import type { Quote } from '@/lib/core/types';
import { formatPrice } from '@/lib/utils';
import { escapeHtml, sanitizeUrl, EMAIL_STYLES } from './helpers';

const IMG = 'https://painlessremovals.com/images/email';

function buildHomeBody(isComplex: boolean): string {
  const complexDisclaimer = isComplex
    ? `<p style="margin:0 0 16px;font-size:14px;color:#555555;">Your move is a little more complex than what our instant calculator is able to handle, so please treat this price as a ballpark figure &ndash; the final quote could be slightly lower or higher depending on your real needs. We&rsquo;ll need a free survey to give you an accurate, personalised price.</p>

        <p style="margin:0 0 16px;">We recommend a <strong style="color:#005349;">free 15-minute survey</strong> to make sure every detail is covered. You can choose how:</p>`
    : `<p style="margin:0 0 16px;">To give you a precise, personalised quote, we recommend a <strong style="color:#005349;">free 15-minute assessment</strong>. Using the details you&rsquo;ve shared about your home, our team can tailor the perfect plan for your move:</p>`;

  return `${complexDisclaimer}
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
          <tr>
            <td style="padding:0 0 8px;font-size:14px;color:#333333;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
              &bull;&nbsp; <strong>Video call</strong> &ndash; we walk through your home together, live<br>
              &bull;&nbsp; <strong>Send a video</strong> &ndash; record a quick walkthrough at your convenience<br>
              &bull;&nbsp; <strong>In-person visit</strong> &ndash; we come to you and survey everything on-site
            </td>
          </tr>
        </table>
        <p style="margin:0 0 24px;font-size:14px;color:#555555;">All completely free, with no obligation. Just hit the button below and we&rsquo;ll call you to arrange a time that suits you.</p>`;
}

function buildOfficeBody(): string {
  return `<p style="margin:0 0 16px;">To ensure a smooth office relocation with minimal disruption to your business, we recommend a <strong style="color:#005349;">free site survey</strong>. We&rsquo;ll assess your office layout, IT equipment, and furniture to plan a move that works around your schedule:</p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
          <tr>
            <td style="padding:0 0 8px;font-size:14px;color:#333333;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
              &bull;&nbsp; <strong>Site survey</strong> &ndash; we visit your office and plan every detail on-site<br>
              &bull;&nbsp; <strong>Video call</strong> &ndash; walk us through your office remotely, quick and easy<br>
              &bull;&nbsp; <strong>Out-of-hours move</strong> &ndash; we can relocate evenings or weekends to minimise downtime
            </td>
          </tr>
        </table>
        <p style="margin:0 0 24px;font-size:14px;color:#555555;">All completely free, with no obligation. Just hit the button below and we&rsquo;ll call you to arrange a time that suits your business.</p>`;
}

function buildClearanceBody(): string {
  return `<p style="margin:0 0 6px;font-weight:700;font-size:16px;color:#005349;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">What happens next?</p>
        <p style="margin:0 0 16px;">Booking your clearance is simple:</p>

        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e8e8e8;border-radius:8px;overflow:hidden;margin-bottom:20px;">
          <tr>
            <td width="44" valign="top" style="padding:12px 0 12px 14px;border-bottom:1px solid #eeeeee;">
              <span style="display:inline-block;width:24px;height:24px;background:#005349;color:#fff;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:700;">1</span>
            </td>
            <td style="padding:12px 14px 12px 0;font-size:14px;color:#444;border-bottom:1px solid #eeeeee;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
              <strong>Confirm your date</strong> &ndash; we&rsquo;ll arrange a convenient time
            </td>
          </tr>
          <tr>
            <td width="44" valign="top" style="padding:12px 0 12px 14px;border-bottom:1px solid #eeeeee;">
              <span style="display:inline-block;width:24px;height:24px;background:#005349;color:#fff;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:700;">2</span>
            </td>
            <td style="padding:12px 14px 12px 0;font-size:14px;color:#444;border-bottom:1px solid #eeeeee;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
              <strong>Our team arrives</strong> &ndash; we handle all the heavy lifting
            </td>
          </tr>
          <tr>
            <td width="44" valign="top" style="padding:12px 0 12px 14px;">
              <span style="display:inline-block;width:24px;height:24px;background:#005349;color:#fff;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:700;">3</span>
            </td>
            <td style="padding:12px 14px 12px 0;font-size:14px;color:#444;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
              <strong>Responsible disposal</strong> &ndash; recycled, donated, or properly disposed
            </td>
          </tr>
        </table>

        <p style="margin:0 0 24px;font-size:14px;color:#555555;">Ready to book, or have questions about what we can clear? Just hit the button below and we&rsquo;ll call you to sort everything out.</p>`;
}

export function generateQuoteConfirmationEmail(quote: Quote & { quoteUrl?: string | null }): string {
  const data = (quote.calculatorData || {}) as Record<string, unknown>;
  const firstName = quote.name?.split(' ')[0] || 'there';
  const serviceType = (data.serviceType as string) || 'home';
  const isComplex = serviceType === 'home' && quote.totalPrice > 1800;
  // Link the "Call Me to Book a Survey" button to the standalone
  // callback form under /instantquote/.
  const callbackUrl = `https://painlessremovals.com/instantquote/simple-callback/?ref=${encodeURIComponent(String(quote.id))}`;

  const titleLabel = serviceType === 'office'
    ? 'Office Removal'
    : serviceType === 'clearance'
      ? 'Clearance'
      : 'Home Removal';

  const introText = serviceType === 'clearance'
    ? `Thank you for using our clearance calculator. Based on the items you&rsquo;ve selected, your estimated clearance price is`
    : serviceType === 'office'
      ? `Thank you for completing our Instant Quote calculator. Based on the details you&rsquo;ve shared, your estimated office relocation price is`
      : `Thank you for completing our Instant Quote calculator. Based on the details you&rsquo;ve shared, your estimated home removal price is`;

  let middleSection: string;
  if (serviceType === 'clearance') {
    middleSection = buildClearanceBody();
  } else if (serviceType === 'office') {
    middleSection = buildOfficeBody();
  } else {
    middleSection = buildHomeBody(isComplex);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your ${escapeHtml(titleLabel)} Estimate &ndash; Painless Removals</title>
  <style>${EMAIL_STYLES}</style>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f4;">
<tr><td align="center" style="padding:24px 12px;">

  <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

    <!-- Header -->
    <tr>
      <td style="background-color:#005349;padding:28px 24px;text-align:center;">
        <h1 style="margin:0;font-size:22px;color:#ffffff;font-weight:700;font-family:Georgia,serif;line-height:1.3;">
          Your <span style="color:#f9a00f;">Painless</span> ${escapeHtml(titleLabel)} Estimate
        </h1>
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td style="padding:28px 28px 8px;font-size:15px;line-height:1.65;color:#333333;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

        <p style="margin:0 0 16px;">Dear ${escapeHtml(firstName)},</p>
        <p style="margin:0 0 6px;">${introText} <strong style="color:#005349;font-size:17px;">${escapeHtml(formatPrice(quote.totalPrice, quote.currency))}</strong> (excl.&nbsp;VAT).</p>
        ${quote.quoteUrl ? `<p style="margin:0 0 20px;font-size:13px;text-align:center;"><a href="${sanitizeUrl(quote.quoteUrl)}" style="color:#005349;text-decoration:underline;">&raquo; View your full estimate online</a></p>` : '<p style="margin:0 0 20px;"></p>'}

        ${middleSection}

        <!-- CTA -->
        <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 10px;">
          <tr>
            <td style="background-color:#dc3f04;border-radius:8px;text-align:center;">
              <a href="${callbackUrl}" style="color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 32px;display:inline-block;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">Yes, Call Me to Book a Survey</a>
            </td>
          </tr>
        </table>

        <!-- Trustpilot -->
        <p style="text-align:center;font-size:13px;color:#555555;margin:0 0 16px;">
          <strong>Exceptional <span style="color:#f9a00f;">&#9733;&#9733;&#9733;&#9733;&#9733;</span> reviews on <span style="color:#005349;">Trustpilot</span></strong>
        </p>

        <p style="margin:0 0 20px;font-size:14px;color:#444444;">If you have any questions or would like us to walk you through the estimate, we&rsquo;re happy to help.<br><br>With nearly 50 years&rsquo; experience, my team and I are here for whatever you need &ndash; and we hope to welcome you as a happy Painless customer very soon.<br><br>Best regards,</p>

        <!-- Jay signature -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #eeeeee;padding-top:20px;margin-top:4px;">
          <tr>
            <td width="96" valign="top" style="padding-right:16px;">
              <img src="${IMG}/jay.jpg" alt="Jay Newton" width="80" height="80" style="border-radius:8px;display:block;object-fit:cover;">
            </td>
            <td valign="middle" style="font-size:14px;color:#444444;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
              <strong style="color:#005349;font-size:15px;">Jay Newton</strong><br>
              Director, Painless Removals<br>
              0117 28 700 82<br>
              hello@painlessremovals.com
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="text-align:center;padding:16px 24px 20px;font-size:12px;color:#aaaaaa;background:#f9f9f9;border-top:1px solid #eeeeee;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
        <p style="margin:0 0 4px;">Quote Reference: #${escapeHtml(String(quote.id))}</p>
        <p style="margin:0;">Painless Removals &middot; Bristol &middot; hello@painlessremovals.com</p>
      </td>
    </tr>

  </table>
</td></tr>
</table>
</body>
</html>`;
}
