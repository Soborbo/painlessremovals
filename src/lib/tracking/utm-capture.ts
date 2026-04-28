/**
 * UTM / click-ID capture.
 *
 * On every page load, we look at the URL search params and persist any
 * known attribution keys (utm_*, gclid, fbclid) to sessionStorage under
 * `pr_tracking`. This survives across navigations within the session
 * but resets when the tab closes — appropriate for first-touch
 * attribution within a single browsing session.
 *
 * Forms read this storage at submit time to decorate their dataLayer
 * pushes with attribution context. The calculator's `trackEvent` does
 * NOT auto-decorate events with UTMs because GTM Variables can pull
 * them from sessionStorage themselves — keeping events small.
 */

const STORAGE_KEY = 'pr_tracking';
const KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
] as const;

export interface AttributionParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  gclid?: string;
  fbclid?: string;
  _landing?: string;
  _ts?: string;
}

export function captureUTMs(): void {
  if (typeof window === 'undefined') return;

  const params = new URLSearchParams(window.location.search);
  let stored: AttributionParams = {};
  try {
    stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    stored = {};
  }

  let updated = false;
  for (const k of KEYS) {
    const v = params.get(k);
    if (v) {
      stored[k] = v;
      updated = true;
    }
  }

  if (updated) {
    stored._landing = window.location.pathname;
    stored._ts = new Date().toISOString();
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // sessionStorage can be disabled in some privacy modes; ignore.
    }
  }
}

export function readAttribution(): AttributionParams {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}
