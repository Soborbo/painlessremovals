/**
 * Shared utilities for form-handling Astro API routes.
 *
 * Migrated from functions/_shared/utils.ts when we moved off Cloudflare Pages
 * Functions to Workers + Astro API routes.
 */

export const PHONE = '0117 287 0082';
export const FROM_DEFAULT = 'Painless Removals Website <noreply@painlessremovals.com>';

const ALLOWED_ORIGINS = [
  'https://painlessremovals.com',
  'https://www.painlessremovals.com',
];

export function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Workers preview URLs: <worker>.<account>.workers.dev (two subdomains).
  if (/^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/.test(origin)) return true;
  // Legacy Pages preview URLs (during transition).
  if (/^https:\/\/[a-z0-9-]+\.painlessremovals2026\.pages\.dev$/.test(origin)) return true;
  if (origin === 'https://painlessremovals2026.pages.dev') return true;
  return false;
}

export function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function stripNewlines(str: string): string {
  return String(str).replace(/[\r\n]/g, '');
}

export function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function verifyTurnstile(token: string, secret: string): Promise<boolean> {
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, response: token }),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { success: boolean };
  return data.success;
}

interface SendEmailOptions {
  from: string;
  to: string[];
  reply_to?: string;
  subject: string;
  html: string;
}

export async function sendEmail(
  apiKey: string,
  options: SendEmailOptions,
): Promise<{ success: boolean; error?: string }> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(options),
  });
  if (!res.ok) {
    const err = await res.text();
    return { success: false, error: err };
  }
  return { success: true };
}

export function emailChrome(heading: string, body: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #0E3C54; padding: 20px 24px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; font-size: 20px; margin: 0;">${heading}</h1>
      </div>
      <div style="background: #ffffff; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        ${body}
      </div>
    </div>`;
}

export function emailFooter(source: string): string {
  return `
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
    <p style="font-size: 12px; color: #9ca3af; margin: 0;">Submitted from ${source} at ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}</p>`;
}
