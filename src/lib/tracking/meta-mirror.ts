/**
 * Client → server Meta CAPI mirror.
 *
 * When a conversion fires in the browser via `trackEvent`, we POST the
 * same `event_id` plus value/currency to `/api/meta/capi`. The server
 * reads PII from the hidden DOM element… well, it can't — the DOM is
 * client-side. So we read PII here, hash nothing, and send it over to
 * the server which hashes and forwards. The browser side (Meta Pixel)
 * fires too; Meta dedupes the pair using `event_id`.
 */

import { META_CAPI_ENDPOINT } from './config';
import { readUserDataFromDOM, type UserData } from './tracking';

export interface MetaMirrorPayload {
  value?: number;
  currency?: string;
  content_name?: string;
}

const META_EVENT_NAMES: Record<string, string> = {
  quote_calculator_conversion: 'Lead',
  callback_conversion: 'Lead',
  contact_form_submit: 'Contact',
  phone_conversion: 'Contact',
  email_conversion: 'Contact',
  whatsapp_conversion: 'Contact',
  quote_calculator_first_view: 'ViewContent',
};

interface ConsentSnapshot {
  ad_storage: 'granted' | 'denied' | 'unknown';
  ad_user_data: 'granted' | 'denied' | 'unknown';
}

/**
 * Reads the live Consent Mode v2 snapshot. The mirror endpoint trusts
 * us less than gtag does — even with this client check, the server
 * re-reads `consent` from the payload and re-validates (defense in
 * depth). Both must say `granted` for ads-related signals.
 */
function readConsentSnapshot(): ConsentSnapshot {
  const out: ConsentSnapshot = { ad_storage: 'unknown', ad_user_data: 'unknown' };
  if (typeof window === 'undefined') return out;
  try {
    const ics = (window as unknown as { google_tag_data?: { ics?: { entries?: Record<string, { default?: boolean; update?: boolean }> } } }).google_tag_data?.ics;
    const entries = ics?.entries;
    if (entries) {
      const a = entries.ad_storage;
      const b = entries.ad_user_data;
      if (a) out.ad_storage = (a.update ?? a.default) ? 'granted' : 'denied';
      if (b) out.ad_user_data = (b.update ?? b.default) ? 'granted' : 'denied';
    }
  } catch {
    // ignore — leave as 'unknown'
  }
  return out;
}

export async function mirrorMetaCapi(
  internalEventName: string,
  eventId: string,
  data: MetaMirrorPayload = {},
): Promise<void> {
  if (typeof window === 'undefined') return;
  const metaName = META_EVENT_NAMES[internalEventName];
  if (!metaName) return;

  // Client-side consent gate. The server re-checks via the snapshot
  // we send below, but skipping here saves a network round-trip and
  // never starts the request when the user hasn't consented.
  const consent = readConsentSnapshot();
  if (consent.ad_storage !== 'granted' || consent.ad_user_data !== 'granted') {
    return;
  }

  const userData: UserData = readUserDataFromDOM();
  // Best-effort _fbp / _fbc cookie parse — Meta uses these to attribute the
  // browser side; CAPI strongly recommends including them server-side too.
  const cookies = parseCookies();

  const payload = {
    event_name: metaName,
    event_id: eventId,
    event_time: Math.floor(Date.now() / 1000),
    event_source_url: window.location.href,
    user_data: {
      ...userData,
      fbp: cookies._fbp,
      fbc: cookies._fbc,
      client_user_agent: navigator.userAgent,
    },
    custom_data: data,
    // Consent snapshot. The server enforces this independently so we
    // can't accidentally bypass by spoofing — defense in depth.
    consent: {
      ad_storage: consent.ad_storage,
      ad_user_data: consent.ad_user_data,
    },
  };

  try {
    if (typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      const ok = navigator.sendBeacon(META_CAPI_ENDPOINT, blob);
      if (ok) return;
    }
    await fetch(META_CAPI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // Mirror is best-effort. The browser Pixel side is the primary signal.
  }
}

function parseCookies(): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof document === 'undefined') return out;
  document.cookie.split(';').forEach((part) => {
    const [k, ...rest] = part.trim().split('=');
    if (k) out[k] = decodeURIComponent(rest.join('='));
  });
  return out;
}
