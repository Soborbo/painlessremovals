// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  trackEvent,
  trackEventBeforeNavigate,
  adStorageGranted,
  adStorageConsent,
  setUserDataOnDOM,
  readUserDataFromDOM,
  restoreUserDataFromStorage,
  clearUserDataOnDOM,
} from './tracking';
import { USER_DATA_ELEMENT_ID, USER_DATA_STORAGE_KEY, USER_DATA_TTL_MS } from './config';

/**
 * Regression net for the browser-side PII guard (rule #1) and the consent-
 * gated DOM/localStorage side-channel. PII must never reach the dataLayer;
 * at-rest persistence must follow ad_storage consent.
 */

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PII_KEYS = [
  'user_data', 'user_email', 'user_phone', 'email', 'phone', 'phone_number',
  'first_name', 'last_name', 'name', 'street', 'city', 'postal_code', 'postcode',
  'em', 'ph', 'fn', 'ln',
];

function dl(): Array<Record<string, unknown>> {
  return (window as unknown as { dataLayer: Array<Record<string, unknown>> }).dataLayer;
}
function grantAdStorage() {
  (window as any).google_tag_data = { ics: { entries: { ad_storage: { update: true } } } };
}
function denyAdStorage() {
  (window as any).google_tag_data = { ics: { entries: { ad_storage: { update: false, default: false } } } };
}

beforeEach(() => {
  localStorage.clear();
  document.getElementById(USER_DATA_ELEMENT_ID)?.remove();
  (window as any).dataLayer = undefined;
  delete (window as any).google_tag_data;
  document.cookie = 'cookieyes-consent=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('trackEvent — dataLayer push', () => {
  it('pushes the event name and a generated event_id', () => {
    const id = trackEvent('lead', { value: 100, currency: 'GBP' });
    expect(id).toMatch(V4);
    expect(dl().at(-1)).toMatchObject({ event: 'lead', event_id: id, value: 100, currency: 'GBP' });
  });

  it('returns and uses a caller-provided event_id (dedup with server mirror)', () => {
    const id = trackEvent('lead', { event_id: 'evt_fixed01' });
    expect(id).toBe('evt_fixed01');
    expect(dl().at(-1)!.event_id).toBe('evt_fixed01');
  });

  it('initializes window.dataLayer when absent', () => {
    expect((window as any).dataLayer).toBeUndefined();
    trackEvent('x');
    expect(Array.isArray(dl())).toBe(true);
  });

  it('preserves non-PII params', () => {
    trackEvent('lead', { value: 7, service: 'home', step_name: 'done' });
    expect(dl().at(-1)).toMatchObject({ value: 7, service: 'home', step_name: 'done' });
  });

  it.each(PII_KEYS)('strips PII key "%s" while keeping a non-PII sibling', (key) => {
    (window as any).dataLayer = undefined;
    trackEvent('lead', { [key]: 'SECRET', keepme: 1 });
    const last = dl().at(-1)!;
    expect(last[key]).toBeUndefined();
    expect(last.keepme).toBe(1);
  });
});

describe('trackEventBeforeNavigate — navigation-safe conversion push', () => {
  it('pushes the event with an eventCallback + eventTimeout and returns the event_id', () => {
    const id = trackEventBeforeNavigate('callback_conversion', { value: 500, currency: 'GBP' }, '/thanks/', { navigate: () => {} });
    const last = dl().at(-1)!;
    expect(id).toBeTruthy();
    expect(last).toMatchObject({ event: 'callback_conversion', event_id: id, value: 500 });
    expect(typeof last.eventCallback).toBe('function');
    expect(typeof last.eventTimeout).toBe('number');
  });

  it('strips PII keys exactly like trackEvent', () => {
    trackEventBeforeNavigate('callback_conversion', { email: 'a@b.com', keepme: 1 }, '/thanks/', { navigate: () => {} });
    const last = dl().at(-1)!;
    expect(last.email).toBeUndefined();
    expect(last.keepme).toBe(1);
  });

  it('uses a caller-provided event_id', () => {
    const id = trackEventBeforeNavigate('callback_conversion', { event_id: 'evt_nav1' }, '/thanks/', { navigate: () => {} });
    expect(id).toBe('evt_nav1');
    expect(dl().at(-1)!.event_id).toBe('evt_nav1');
  });

  it('navigates to the destination when GTM invokes the eventCallback', () => {
    const navigate = vi.fn();
    trackEventBeforeNavigate('callback_conversion', {}, '/thanks/', { navigate });
    expect(navigate).not.toHaveBeenCalled();
    (dl().at(-1)!.eventCallback as () => void)();
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/thanks/');
  });

  it('navigates via the safety timeout when GTM never calls back, exactly once', () => {
    vi.useFakeTimers();
    try {
      const navigate = vi.fn();
      trackEventBeforeNavigate('callback_conversion', {}, '/thanks/', { navigate, timeoutMs: 2500 });
      vi.advanceTimersByTime(2500);
      expect(navigate).toHaveBeenCalledTimes(1);
      // Late GTM callback after the timeout must NOT navigate again.
      (dl().at(-1)!.eventCallback as () => void)();
      expect(navigate).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits for BOTH the GTM callback and alsoWaitFor before navigating', async () => {
    const navigate = vi.fn();
    let resolveDispatch!: (v: boolean) => void;
    const dispatch = new Promise<boolean>((r) => { resolveDispatch = r; });
    trackEventBeforeNavigate('callback_conversion', {}, '/thanks/', { navigate, alsoWaitFor: dispatch });
    (dl().at(-1)!.eventCallback as () => void)();
    expect(navigate).not.toHaveBeenCalled(); // GTM done, dispatch pending
    resolveDispatch(true);
    await Promise.resolve(); // flush the .then
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/thanks/');
  });

  it('a REJECTED alsoWaitFor still releases the navigation', async () => {
    const navigate = vi.fn();
    const dispatch = Promise.reject(new Error('gateway down'));
    trackEventBeforeNavigate('callback_conversion', {}, '/thanks/', { navigate, alsoWaitFor: dispatch });
    (dl().at(-1)!.eventCallback as () => void)();
    await Promise.resolve();
    await Promise.resolve();
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});

describe('adStorageConsent — three-state decision', () => {
  it('is unknown when nothing is set (pre-CMP boot)', () => {
    expect(adStorageConsent()).toBe('unknown');
    expect(adStorageGranted()).toBe(false);
  });

  it('is granted when ICS ad_storage update is true', () => {
    grantAdStorage();
    expect(adStorageConsent()).toBe('granted');
    expect(adStorageGranted()).toBe(true);
  });

  it('is denied when ICS ad_storage update is false', () => {
    denyAdStorage();
    expect(adStorageConsent()).toBe('denied');
    expect(adStorageGranted()).toBe(false);
  });

  it('treats an ICS DEFAULT entry without an update as unknown — the GTMHead default is not a user decision', () => {
    (window as any).google_tag_data = { ics: { entries: { ad_storage: { default: false } } } };
    expect(adStorageConsent()).toBe('unknown');
  });

  it('reads a CookieYes cookie grant before GTM initialises', () => {
    document.cookie = 'cookieyes-consent=consentid:abc,consent:yes,analytics:yes,advertisement:yes';
    expect(adStorageConsent()).toBe('granted');
  });

  it('reads a CookieYes cookie denial before GTM initialises', () => {
    document.cookie = 'cookieyes-consent=consentid:abc,consent:yes,analytics:yes,advertisement:no';
    expect(adStorageConsent()).toBe('denied');
  });

  it('prefers an explicit ICS update over the cookie', () => {
    document.cookie = 'cookieyes-consent=consentid:abc,advertisement:no';
    grantAdStorage();
    expect(adStorageConsent()).toBe('granted');
  });
});

describe('setUserDataOnDOM / readUserDataFromDOM round-trip', () => {
  it('round-trips all fields through the hidden DOM element', () => {
    grantAdStorage();
    const data = {
      email: 'a@b.com', phone_number: '+447700900123', first_name: 'John',
      last_name: 'Smith', city: 'Bristol', street: '12 High St',
      postal_code: 'BS1 2AB', country: 'GB',
    };
    setUserDataOnDOM(data);
    expect(readUserDataFromDOM()).toEqual(data);
  });

  it('stores values verbatim (no normalization in the side-channel)', () => {
    denyAdStorage();
    setUserDataOnDOM({ email: 'Mixed@Case.COM' });
    expect(readUserDataFromDOM().email).toBe('Mixed@Case.COM');
  });

  it('returns {} when no element exists', () => {
    expect(readUserDataFromDOM()).toEqual({});
  });

  it('only writes the provided fields', () => {
    denyAdStorage();
    setUserDataOnDOM({ email: 'a@b.com' });
    expect(readUserDataFromDOM()).toEqual({ email: 'a@b.com' });
  });
});

describe('consent gating of at-rest persistence', () => {
  it('persists to localStorage when ad_storage is granted', () => {
    grantAdStorage();
    setUserDataOnDOM({ email: 'a@b.com' });
    const raw = localStorage.getItem(USER_DATA_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const blob = JSON.parse(raw!);
    expect(blob.data.email).toBe('a@b.com');
    expect(typeof blob.savedAt).toBe('number');
  });

  it('keeps PII on the DOM but NOT in localStorage when consent is denied', () => {
    denyAdStorage();
    setUserDataOnDOM({ email: 'a@b.com' });
    expect(readUserDataFromDOM().email).toBe('a@b.com');
    expect(localStorage.getItem(USER_DATA_STORAGE_KEY)).toBeNull();
  });

  it('merges successive writes in localStorage (earlier fields not wiped)', () => {
    grantAdStorage();
    setUserDataOnDOM({ email: 'a@b.com' });
    setUserDataOnDOM({ phone_number: '+447700900123' });
    const blob = JSON.parse(localStorage.getItem(USER_DATA_STORAGE_KEY)!);
    expect(blob.data.email).toBe('a@b.com');
    expect(blob.data.phone_number).toBe('+447700900123');
  });

  it('purges the at-rest copy when consent is later revoked', () => {
    grantAdStorage();
    setUserDataOnDOM({ email: 'a@b.com' });
    denyAdStorage();
    setUserDataOnDOM({ first_name: 'John' });
    expect(localStorage.getItem(USER_DATA_STORAGE_KEY)).toBeNull();
  });

  it('under UNKNOWN consent: writes the DOM but neither persists nor purges an existing blob', () => {
    grantAdStorage();
    setUserDataOnDOM({ email: 'a@b.com' }); // consented persist on an earlier page
    delete (window as any).google_tag_data; // fresh page, consent not yet readable
    setUserDataOnDOM({ first_name: 'John' });
    expect(readUserDataFromDOM().first_name).toBe('John'); // DOM write happens
    const blob = JSON.parse(localStorage.getItem(USER_DATA_STORAGE_KEY)!);
    expect(blob.data.email).toBe('a@b.com'); // existing blob survives…
    expect(blob.data.first_name).toBeUndefined(); // …but no new persist without a grant
  });
});

describe('restoreUserDataFromStorage', () => {
  it('repopulates the DOM from a fresh stored blob when granted', () => {
    grantAdStorage();
    setUserDataOnDOM({ email: 'a@b.com' });
    document.getElementById(USER_DATA_ELEMENT_ID)?.remove();
    expect(readUserDataFromDOM()).toEqual({});
    restoreUserDataFromStorage();
    expect(readUserDataFromDOM().email).toBe('a@b.com');
  });

  it('does not restore and purges storage when consent is denied', () => {
    grantAdStorage();
    setUserDataOnDOM({ email: 'a@b.com' });
    document.getElementById(USER_DATA_ELEMENT_ID)?.remove();
    denyAdStorage();
    restoreUserDataFromStorage();
    expect(readUserDataFromDOM()).toEqual({});
    expect(localStorage.getItem(USER_DATA_STORAGE_KEY)).toBeNull();
  });

  it('does NOT purge storage while consent is still unknown (boot before GTM/CMP loads)', () => {
    // Regression: boot used to see the pre-CMP default (no ICS, no cookie),
    // treat it as denial, and delete the consented user's persisted blob on
    // every page-load — killing user_data for late CAPI dispatches.
    grantAdStorage();
    setUserDataOnDOM({ email: 'a@b.com' });
    document.getElementById(USER_DATA_ELEMENT_ID)?.remove();
    delete (window as any).google_tag_data; // fresh page-load, GTM not yet up
    restoreUserDataFromStorage();
    expect(readUserDataFromDOM()).toEqual({}); // no hydration without a grant…
    expect(localStorage.getItem(USER_DATA_STORAGE_KEY)).not.toBeNull(); // …but no destruction either
  });

  it('drops a blob older than the TTL and purges it', () => {
    grantAdStorage();
    const stale = { data: { email: 'a@b.com' }, savedAt: Date.now() - (USER_DATA_TTL_MS + 1000) };
    localStorage.setItem(USER_DATA_STORAGE_KEY, JSON.stringify(stale));
    restoreUserDataFromStorage();
    expect(readUserDataFromDOM()).toEqual({});
    expect(localStorage.getItem(USER_DATA_STORAGE_KEY)).toBeNull();
  });

  it('drops a legacy bare blob (no savedAt) and purges it', () => {
    grantAdStorage();
    localStorage.setItem(USER_DATA_STORAGE_KEY, JSON.stringify({ email: 'a@b.com' }));
    restoreUserDataFromStorage();
    expect(localStorage.getItem(USER_DATA_STORAGE_KEY)).toBeNull();
  });
});

describe('clearUserDataOnDOM', () => {
  it('removes the DOM element and the at-rest copy', () => {
    grantAdStorage();
    setUserDataOnDOM({ email: 'a@b.com' });
    clearUserDataOnDOM();
    expect(document.getElementById(USER_DATA_ELEMENT_ID)).toBeNull();
    expect(localStorage.getItem(USER_DATA_STORAGE_KEY)).toBeNull();
    expect(readUserDataFromDOM()).toEqual({});
  });
});
