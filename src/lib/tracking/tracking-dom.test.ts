// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  trackEvent,
  adStorageGranted,
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

describe('adStorageGranted', () => {
  it('is false when nothing is set', () => {
    expect(adStorageGranted()).toBe(false);
  });

  it('is true when ICS ad_storage update is true', () => {
    grantAdStorage();
    expect(adStorageGranted()).toBe(true);
  });

  it('is false when ICS ad_storage is denied', () => {
    denyAdStorage();
    expect(adStorageGranted()).toBe(false);
  });

  it('falls back to the most recent dataLayer consent push (granted)', () => {
    (window as any).dataLayer = [['consent', 'update', { ad_storage: 'granted' }]];
    expect(adStorageGranted()).toBe(true);
  });

  it('falls back to the dataLayer consent push (denied)', () => {
    (window as any).dataLayer = [['consent', 'default', { ad_storage: 'denied' }]];
    expect(adStorageGranted()).toBe(false);
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
