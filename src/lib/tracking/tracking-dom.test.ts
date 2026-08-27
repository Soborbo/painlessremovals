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
import { purgeMarketingStorage } from '@/lib/soborbo-tracking/persistence';

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
  // A consent-jelek GLOBÁLISAK: ha egy eset beállítja a CookieYes JS API-t vagy
  // a kanonikus override-ot, a következő eset „unknown" fixture-je csendben
  // grantté válna. Minden forrást nullázunk, nem csak az ICS-t.
  delete (window as any).getCkyConsent;
  delete (window as any).__trackingConsent;
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

  it.each([
    ['source', 'cta_context'],
    ['medium', 'cta_medium'],
    ['campaign', 'cta_campaign'],
  ])('remaps GA4-reserved attribution key "%s" to "%s" — a literal `source` param overwrites the GA4 session source', (reserved, safe) => {
    trackEvent('phone_conversion', { [reserved]: 'after_calculator', keepme: 1 });
    const last = dl().at(-1)!;
    expect(last[reserved]).toBeUndefined();
    expect(last[safe]).toBe('after_calculator');
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

/**
 * A CONSENT-OSZTÁLYOZÁS AUTHORITYJE A KANONIKUS CSOMAG (6.5.0).
 *
 * A fenti hét eset a SZERZŐDÉST rögzíti — az alábbiak azt, hogy a döntést már
 * nem itt hozzuk meg. A site saját háromállapotú resolvere és a kanonikus
 * `getMarketingConsentState()` ugyanazt a kérdést válaszolta meg kétféle
 * kóddal; a 6.5.0 óta ez felesleges második authority.
 *
 * EGY tier marad site-oldali, és ez SZÁNDÉKOS: a `google_tag_data.ics` UPDATE
 * bejegyzése (GTM Consent Mode) olyan jel, amit a kanonikus mag NEM modellez.
 * A csendes eldobása azt jelentené, hogy egy oldal ÉLETE SORÁN hozott
 * banner-döntést csak a süti-olvasáson keresztül látnánk meg.
 */
describe('adStorageConsent — a döntés a kanonikus magé', () => {
  it('a CookieYes JS API grantje ELÉG, süti nélkül is', () => {
    // Ezt a site saját resolvere NEM tudta: nála csak az ICS és a SÜTI volt
    // forrás, tehát a „JS API már mondja, a süti még nincs kiírva" ablakban
    // `unknown`-t adott — miközben a gateway ugyanabban a pillanatban már
    // grantként dolgozott. Két láb, két igazság.
    (window as unknown as Record<string, unknown>).getCkyConsent = () => ({
      categories: { advertisement: true, analytics: true }
    });
    expect(adStorageConsent()).toBe('granted');
  });

  it('a kanonikus override-ot is tiszteletben tartja', () => {
    (window as unknown as Record<string, unknown>).__trackingConsent = {
      ad_user_data: 'DENIED',
      ad_personalization: 'DENIED',
      ad_storage: 'DENIED',
      analytics_storage: 'DENIED'
    };
    expect(adStorageConsent()).toBe('denied');
  });

  it('nem tart saját CookieYes-süti parsert', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(join(process.cwd(), 'src/lib/tracking/tracking.ts'), 'utf8');
    expect(
      /cookieyes-consent/.test(source),
      'a site újra saját CookieYes-süti parsert kapott'
    ).toBe(false);
    expect(source).toContain('getMarketingConsentState');
  });
});

describe('setUserDataOnDOM / readUserDataFromDOM round-trip', () => {
  it('round-trips all fields through the hidden DOM element', () => {
    grantAdStorage();
    const data = {
      email: 'a@b.com', phone_number: '+447700900123', first_name: 'John',
      last_name: 'Smith', city: 'Bristol',
      postal_code: 'BS1 2AB', country: 'GB',
    };
    setUserDataOnDOM(data);
    expect(readUserDataFromDOM()).toEqual(data);
  });

  it('a `street`-et NEM írja ki és nem is olvassa vissza (6.6.3: kikerült a szerződésből)', () => {
    grantAdStorage();
    setUserDataOnDOM({ email: 'a@b.com', street: '12 High St' } as Record<string, string>);
    expect(readUserDataFromDOM()).toEqual({ email: 'a@b.com' });
    expect(document.getElementById(USER_DATA_ELEMENT_ID)?.dataset.street).toBeUndefined();
  });

  // A fixture SZÁNDÉKOSAN `grant`: ez az eset a verbatim tárolásról szól, nem a
  // consentről. (Korábban `deny` volt — akkor a DOM-írás még kapuzatlan volt.)
  it('stores values verbatim (no normalization in the side-channel)', () => {
    grantAdStorage();
    setUserDataOnDOM({ email: 'Mixed@Case.COM' });
    expect(readUserDataFromDOM().email).toBe('Mixed@Case.COM');
  });

  it('returns {} when no element exists', () => {
    expect(readUserDataFromDOM()).toEqual({});
  });

  it('only writes the provided fields', () => {
    grantAdStorage();
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

  // MEGFORDULT (PII-P0). Korábban: „keeps PII on the DOM but NOT in localStorage".
  // A rejtett elem tracking-oldalcsatorna, nem a quote teljesítéséhez kell —
  // DENIED alatt nincs jogalap olvashatóan tartani, és ugyanezeken az oldalakon
  // consent-kapu nélküli session-replay (Clarity) fut.
  it('writes NEITHER the DOM NOR localStorage when consent is denied', () => {
    denyAdStorage();
    setUserDataOnDOM({ email: 'a@b.com' });
    expect(readUserDataFromDOM()).toEqual({});
    expect(document.getElementById(USER_DATA_ELEMENT_ID)).toBeNull();
    expect(localStorage.getItem(USER_DATA_STORAGE_KEY)).toBeNull();
  });

  it('a DENIED írás a KORÁBBAN kiírt DOM-elemet is elviszi, nem csak kihagyja', () => {
    grantAdStorage();
    setUserDataOnDOM({ email: 'a@b.com' });
    expect(readUserDataFromDOM().email).toBe('a@b.com');
    denyAdStorage();
    setUserDataOnDOM({ first_name: 'John' });
    expect(document.getElementById(USER_DATA_ELEMENT_ID)).toBeNull();
  });

  it('merges successive writes in localStorage (earlier fields not wiped)', () => {
    grantAdStorage();
    setUserDataOnDOM({ email: 'a@b.com' });
    setUserDataOnDOM({ phone_number: '+447700900123' });
    const blob = JSON.parse(localStorage.getItem(USER_DATA_STORAGE_KEY)!);
    expect(blob.data.email).toBe('a@b.com');
    expect(blob.data.phone_number).toBe('+447700900123');
  });

  it('purges the at-rest copy AND the DOM element when consent is later revoked', () => {
    grantAdStorage();
    setUserDataOnDOM({ email: 'a@b.com' });
    denyAdStorage();
    setUserDataOnDOM({ first_name: 'John' });
    expect(localStorage.getItem(USER_DATA_STORAGE_KEY)).toBeNull();
    expect(document.getElementById(USER_DATA_ELEMENT_ID)).toBeNull();
  });

  // RÉSZBEN MEGFORDULT (PII-P0): a DOM-írás elmarad, az at-rest ág VÁLTOZATLAN.
  // A kettő szándékosan válik szét — lásd a lenti „unknown ≠ denied" esetet.
  it('under UNKNOWN consent: writes NO new PII to the DOM, and neither persists nor purges an existing blob', () => {
    grantAdStorage();
    setUserDataOnDOM({ email: 'a@b.com' }); // consented persist on an earlier page
    document.getElementById(USER_DATA_ELEMENT_ID)?.remove(); // fresh page-load
    delete (window as any).google_tag_data; // consent not yet readable
    setUserDataOnDOM({ first_name: 'John' });
    expect(readUserDataFromDOM()).toEqual({}); // no new DOM write…
    const blob = JSON.parse(localStorage.getItem(USER_DATA_STORAGE_KEY)!);
    expect(blob.data.email).toBe('a@b.com'); // …existing blob survives…
    expect(blob.data.first_name).toBeUndefined(); // …and no new persist without a grant
  });

  it('unknown ≠ denied: az UNKNOWN írás LÉTRE SEM hozza az elemet, de nem is takarít', () => {
    grantAdStorage();
    setUserDataOnDOM({ email: 'a@b.com' });
    document.getElementById(USER_DATA_ELEMENT_ID)?.remove();
    delete (window as any).google_tag_data;
    setUserDataOnDOM({ email: 'c@d.com' });
    expect(document.getElementById(USER_DATA_ELEMENT_ID)).toBeNull();
    expect(localStorage.getItem(USER_DATA_STORAGE_KEY)).not.toBeNull();
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

  // Ez a VISSZAVONÁS útja: a `boot.ts` a `cookieyes_consent_update` eseményre
  // ezt a függvényt hívja. Eddig csak a localStorage-ot vitte, a nyers PII a
  // DOM-ban maradt a lap további életére.
  it('a visszavonás a DOM-elemet is elviszi, nem csak az at-rest másolatot', () => {
    grantAdStorage();
    setUserDataOnDOM({ email: 'a@b.com' });
    expect(document.getElementById(USER_DATA_ELEMENT_ID)).not.toBeNull();
    denyAdStorage();
    restoreUserDataFromStorage();
    expect(document.getElementById(USER_DATA_ELEMENT_ID)).toBeNull();
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

describe('a site bejelentkezik a kanonikus visszavonás-takarításra', () => {
  // A mechanizmus a magé (`registerMarketingPurgeHook` + `purgeMarketingStorage`),
  // a POLICY a site-é: a mag a SAJÁT `__sb_user_data__` elemét takarítja, a
  // painless rejtett eleme (`__pl_user_data__`) külön tár. Enélkül a
  // consent-visszavonás egyik útja sem érte el a site oldalcsatornáját.
  it('purgeMarketingStorage() kiüti a painless DOM-elemét ÉS az at-rest másolatot', () => {
    grantAdStorage();
    setUserDataOnDOM({ email: 'a@b.com' });
    expect(document.getElementById(USER_DATA_ELEMENT_ID)).not.toBeNull();

    purgeMarketingStorage();

    expect(document.getElementById(USER_DATA_ELEMENT_ID)).toBeNull();
    expect(localStorage.getItem(USER_DATA_STORAGE_KEY)).toBeNull();
  });
});
