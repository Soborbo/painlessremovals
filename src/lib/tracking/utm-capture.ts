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
  ref?: string;
  _landing?: string;
  _ts?: string;
}

// First-party cookie holding the affiliate `?ref=` code for the session.
// Session-scoped (no Max-Age) so it expires when the browser closes, which
// matches the first-touch-per-session model of the sessionStorage store.
const REF_COOKIE = 'pr_ref';

function setRefCookie(code: string): void {
  try {
    document.cookie = `${REF_COOKIE}=${encodeURIComponent(code)}; path=/; SameSite=Lax`;
  } catch {
    // document.cookie can throw in sandboxed iframes; ignore.
  }
}

function readRefCookie(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${REF_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
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

  // Affiliate referral code — persist to both the session store and a
  // first-party cookie so it survives even if sessionStorage is unavailable.
  const ref = params.get('ref');
  if (ref) {
    stored.ref = ref;
    setRefCookie(ref);
    updated = true;
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

/** The affiliate code from this session (sessionStorage first, then cookie). */
export function readAffiliateCode(): string | undefined {
  return readAttribution().ref || readRefCookie();
}

/**
 * Build the CRM `attribution` object from captured params + current location.
 * Empty/absent fields are omitted so the CRM schema's optionals stay clean.
 */
export function buildAttribution(): {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  gclid?: string;
  fbclid?: string;
  landing_page?: string;
} {
  const a = readAttribution();
  const out: Record<string, string> = {};
  if (a.utm_source) out.utm_source = a.utm_source;
  if (a.utm_medium) out.utm_medium = a.utm_medium;
  if (a.utm_campaign) out.utm_campaign = a.utm_campaign;
  if (a.gclid) out.gclid = a.gclid;
  if (a.fbclid) out.fbclid = a.fbclid;
  if (typeof window !== 'undefined') {
    out.landing_page = (a._landing || window.location.pathname).slice(0, 500);
  }
  return out;
}

export function readAttribution(): AttributionParams {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}
