/**
 * Pure formatting helpers shared by client form wiring and (potentially) the
 * server. No secrets, safe to import in the browser.
 */

/**
 * Normalize a UK phone string into a CRM-acceptable form. The CRM accepts
 * `^[+0-9 ()-]+$`, 7–20 chars; this strips stray characters and rewrites a
 * national `0XXXXXXXXXX` into `+44XXXXXXXXXX`. Anything that doesn't look UK
 * is returned trimmed (and still passes the CRM regex if it only contains
 * the allowed characters).
 */
export function normalizeUKPhoneForCRM(raw: string | undefined | null): string {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  // Keep only the characters the CRM regex permits.
  const cleaned = trimmed.replace(/[^+0-9 ()-]/g, '');
  const digits = cleaned.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('0')) return `+44${digits.slice(1)}`;
  return cleaned;
}

/** Slugify a free-text label into an affiliate-code-safe token (1–80). */
export function slugifyAffiliateCode(raw: string | undefined | null): string {
  if (!raw) return '';
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
