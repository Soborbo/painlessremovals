/**
 * Browser-side dataLayer push helper + PII side-channel.
 *
 * Why a side-channel for PII? Anything pushed to `window.dataLayer` is
 * visible to every GTM tag and (for HTML-tag templates) to anything that
 * iterates `window.dataLayer` directly. We keep email/phone/name/address
 * in `data-*` attributes on a hidden DOM node and read them from GTM
 * Variables when (and only when) a tag actually needs them. That keeps
 * the dataLayer free of PII for inspection, vendor audits, and the
 * accidental third-party script that decides to grep it.
 */

import {
  DEFAULT_COUNTRY,
  USER_DATA_ELEMENT_ID,
  USER_DATA_STORAGE_KEY,
  USER_DATA_TTL_MS,
} from './config';
import { generateUUID } from './uuid';

/**
 * Reads Google Consent Mode v2 state. Returns `true` only when
 * `ad_storage` is granted; we use this gate before persisting PII to
 * localStorage. A user who hasn't granted ads consent gets the in-memory
 * DOM side-channel (which dies with the page) but no at-rest copy.
 *
 * Source of truth is `window.google_tag_data.ics`, populated by GTM's
 * Consent Mode shim. Falls back to checking the dataLayer for an
 * explicit `consent.update` push, then defaults to `denied`.
 */
function adStorageGranted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const ics = (window as unknown as { google_tag_data?: { ics?: { entries?: Record<string, { default?: boolean; update?: boolean }> } } }).google_tag_data?.ics;
    const entry = ics?.entries?.ad_storage;
    if (entry) {
      // ICS reports booleans on default/update; update wins when set.
      const v = entry.update ?? entry.default;
      return v === true;
    }
  } catch {
    // ignore
  }
  // Fallback: walk dataLayer for the most recent `consent` push.
  try {
    const dl = window.dataLayer || [];
    for (let i = dl.length - 1; i >= 0; i--) {
      const item = dl[i] as { 0?: string; 1?: string; 2?: { ad_storage?: string } } | undefined;
      if (item && item[0] === 'consent' && (item[1] === 'update' || item[1] === 'default')) {
        return item[2]?.ad_storage === 'granted';
      }
    }
  } catch {
    // ignore
  }
  return false;
}

export { adStorageGranted };

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
  }
}

export type TrackingParams = Record<string, unknown> & { event_id?: string };

// Keys that must NEVER reach the dataLayer in cleartext. Meta's automatic
// detection blocks events that ship raw email/phone/name through the pixel,
// and Google's policies are equivalent. PII belongs on the hidden DOM
// side-channel via `setUserDataOnDOM()` — server-hashed before egress.
// The guard is name-based, not value-based: passing a PII string in a
// non-PII key (e.g. `lead_id: '<email>'`) will NOT be caught.
const PII_KEYS = new Set([
  'user_data',
  'user_email', 'user_phone',
  'email', 'phone', 'phone_number',
  'first_name', 'last_name', 'name',
  'street', 'city', 'postal_code', 'postcode',
  'em', 'ph', 'fn', 'ln',
]);

/**
 * Pushes a NON-PII event to `window.dataLayer`. Returns the `event_id`
 * used (generated if not provided) so callers that need to mirror to a
 * server-side endpoint with the same dedup key can do so.
 */
export function trackEvent(name: string, params: TrackingParams = {}): string {
  if (typeof window === 'undefined') return '';

  const { event_id: providedId, ...rest } = params;
  const safe: Record<string, unknown> = {};
  const stripped: string[] = [];
  for (const [k, v] of Object.entries(rest)) {
    if (PII_KEYS.has(k)) {
      stripped.push(k);
      continue;
    }
    safe[k] = v;
  }
  if (stripped.length && import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(
      `[tracking] PII keys stripped from trackEvent('${name}'): ${stripped.join(', ')}. Use setUserDataOnDOM() instead.`,
    );
  }

  const event_id = (providedId as string | undefined) || generateUUID();
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: name,
    event_id,
    ...safe,
  });
  return event_id;
}

// ---------------------------------------------------------------------------
// User-data side-channel (DOM-based, NOT dataLayer)
// ---------------------------------------------------------------------------

export interface UserData {
  email?: string;
  phone_number?: string;
  first_name?: string;
  last_name?: string;
  city?: string;
  street?: string;
  postal_code?: string;
  country?: string;
}

function ensureUserDataElement(): HTMLElement {
  let el = document.getElementById(USER_DATA_ELEMENT_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = USER_DATA_ELEMENT_ID;
    el.style.display = 'none';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
  }
  return el;
}

function writeUserDataToDOMElement(data: UserData): void {
  const el = ensureUserDataElement();
  if (data.email) el.dataset.email = data.email;
  if (data.phone_number) el.dataset.phone = data.phone_number;
  if (data.first_name) el.dataset.firstName = data.first_name;
  if (data.last_name) el.dataset.lastName = data.last_name;
  if (data.city) el.dataset.city = data.city;
  if (data.street) el.dataset.street = data.street;
  if (data.postal_code) el.dataset.postalCode = data.postal_code;
  if (data.country) el.dataset.country = data.country;
}

/**
 * Stores user data on a hidden DOM element AND in localStorage so the
 * data survives a page close. Subsequent page-loads call
 * `restoreUserDataFromStorage()` from boot to repopulate the DOM —
 * this is what lets the late-conversion CAPI mirror (fired from
 * `boot.ts` before any React component mounts) include hashed user
 * identifiers, which Meta requires.
 *
 * Each call merges with previously-stored fields rather than replacing
 * the whole blob, so earlier-step data isn't wiped by later steps.
 */
interface StoredUserData {
  data: UserData;
  savedAt: number;
}

export function setUserDataOnDOM(data: UserData): void {
  if (typeof document === 'undefined') return;
  writeUserDataToDOMElement(data);

  // At-rest persistence is gated on ad_storage consent. Without it,
  // PII still lives on the DOM for as long as the page is open (so
  // the immediate Meta CAPI mirror works), but we do NOT write it to
  // localStorage where it would survive into future sessions. If
  // there's a previously-stored blob (consent was granted earlier and
  // is now revoked), purge it so revocation is honored at-rest.
  if (!adStorageGranted()) {
    if (typeof localStorage !== 'undefined') {
      try { localStorage.removeItem(USER_DATA_STORAGE_KEY); } catch { /* ignore */ }
    }
    return;
  }

  if (typeof localStorage !== 'undefined') {
    try {
      const existing = readUserDataFromStorage();
      const merged: UserData = { ...existing, ...data };
      const blob: StoredUserData = { data: merged, savedAt: Date.now() };
      localStorage.setItem(USER_DATA_STORAGE_KEY, JSON.stringify(blob));
    } catch {
      // localStorage full / disabled — DOM-only is still functional
    }
  }
}

function readUserDataFromStorage(): UserData {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(USER_DATA_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};

    // Backward-compat: pre-TTL blobs are bare UserData (no savedAt).
    // Treat them as expired and purge so we converge on the TTL'd shape.
    const blob = parsed as Partial<StoredUserData> & UserData;
    if (typeof blob.savedAt !== 'number' || !blob.data) {
      try { localStorage.removeItem(USER_DATA_STORAGE_KEY); } catch { /* ignore */ }
      return {};
    }
    if (Date.now() - blob.savedAt > USER_DATA_TTL_MS) {
      try { localStorage.removeItem(USER_DATA_STORAGE_KEY); } catch { /* ignore */ }
      return {};
    }
    return blob.data;
  } catch {
    return {};
  }
}

/**
 * Called from `boot.ts` on every page-load so the hidden DOM element
 * is repopulated before `resumeQuoteTimer()` runs (which may
 * immediately fire a late conversion + CAPI mirror).
 *
 * Re-checks `adStorageGranted` so a user who revoked consent doesn't
 * keep getting their previously-stored PII pushed back into the DOM.
 */
export function restoreUserDataFromStorage(): void {
  if (typeof document === 'undefined') return;
  if (!adStorageGranted()) {
    if (typeof localStorage !== 'undefined') {
      try { localStorage.removeItem(USER_DATA_STORAGE_KEY); } catch { /* ignore */ }
    }
    return;
  }
  const data = readUserDataFromStorage();
  if (Object.keys(data).length === 0) return;
  writeUserDataToDOMElement(data);
}

export function clearUserDataOnDOM(): void {
  if (typeof document === 'undefined') return;
  document.getElementById(USER_DATA_ELEMENT_ID)?.remove();
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(USER_DATA_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

export function readUserDataFromDOM(): UserData {
  if (typeof document === 'undefined') return {};
  const el = document.getElementById(USER_DATA_ELEMENT_ID);
  if (!el) return {};
  const d = el.dataset;
  const out: UserData = {};
  if (d.email) out.email = d.email;
  if (d.phone) out.phone_number = d.phone;
  if (d.firstName) out.first_name = d.firstName;
  if (d.lastName) out.last_name = d.lastName;
  if (d.city) out.city = d.city;
  if (d.street) out.street = d.street;
  if (d.postalCode) out.postal_code = d.postalCode;
  if (d.country) out.country = d.country;
  return out;
}

// ---------------------------------------------------------------------------
// Normalization (used by both client side and the CAPI endpoint)
// ---------------------------------------------------------------------------

export type CountryCode = 'GB' | 'HU';

export function normalizePhoneE164(
  phone: string,
  countryCode: CountryCode = DEFAULT_COUNTRY,
): string {
  if (!phone) return '';
  let cleaned = phone.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (countryCode === 'GB') {
    if (cleaned.startsWith('0')) cleaned = `+44${cleaned.slice(1)}`;
    else if (cleaned.startsWith('44')) cleaned = `+${cleaned}`;
    else cleaned = `+44${cleaned}`;
  } else {
    if (cleaned.startsWith('06')) cleaned = `+36${cleaned.slice(2)}`;
    else if (cleaned.startsWith('0')) cleaned = `+36${cleaned.slice(1)}`;
    else if (cleaned.startsWith('36')) cleaned = `+${cleaned}`;
    else cleaned = `+36${cleaned}`;
  }
  return cleaned;
}

export function normalizeUserData(
  input: Partial<UserData>,
  countryCode: CountryCode = DEFAULT_COUNTRY,
): UserData {
  const out: UserData = { country: countryCode };
  if (input.email) out.email = input.email.toLowerCase().trim();
  if (input.phone_number) out.phone_number = normalizePhoneE164(input.phone_number, countryCode);
  if (input.first_name) out.first_name = input.first_name.toLowerCase().trim();
  if (input.last_name) out.last_name = input.last_name.toLowerCase().trim();
  if (input.city) out.city = input.city.toLowerCase().trim();
  if (input.street) out.street = input.street.toLowerCase().trim();
  if (input.postal_code) out.postal_code = input.postal_code.toUpperCase().replace(/\s/g, '');
  return out;
}
