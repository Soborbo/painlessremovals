// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setUserDataOnDOM,
  readUserDataFromDOM,
  readUserDataForDispatch,
  restoreUserDataFromStorage,
  clearUserDataOnDOM,
} from './tracking';
import {
  USER_DATA_ELEMENT_ID,
  USER_DATA_STORAGE_KEY,
  USER_DATA_INPAGE_WINDOW_MS,
  USER_DATA_TTL_MS,
} from './config';

/**
 * KETTŐS RETENTION, KETTŐS TÁR (D2/M3).
 *
 * A kanonikus 5 másodperc és a painless 24 óra NEM ugyanarra a kérdésre adott,
 * versengő válasz:
 *
 *   5 mp   = meddig maradhat a nyers PII OLVASHATÓ A LAPON, miután a tagek
 *            elolvasták → IN-PAGE EXPOZÍCIÓS ABLAK (a DOM-elem)
 *   24 óra = meddig élhet az identitás egy KÉSŐBBI oldalon történő
 *            konverzióhoz → CROSS-PAGE ABLAK (a localStorage-blob)
 *
 * Eddig a painlessnek csak a második volt meg: a nyers e-mail/telefon a lap
 * teljes életére a DOM-ban maradt. Ez a szelet a másikat adja hozzá — ÚGY, hogy
 * a késleltetett klikk-konverzió (más oldal, percekkel később) NE veszítse el az
 * identitást: az a fogyasztó mostantól az at-rest tárra esik vissza.
 *
 * A §8 tiltása pont ez volt: a kanonikus 5 mp MECHANIZMUSA kell, nem a POLICY-ja
 * — az 5 mp utáni törlés at-rest fallback nélkül megölné a klikk-konverziókat.
 */

function grantAdStorage() {
  (window as any).google_tag_data = { ics: { entries: { ad_storage: { update: true } } } };
}
function denyAdStorage() {
  (window as any).google_tag_data = { ics: { entries: { ad_storage: { update: false, default: false } } } };
}

beforeEach(() => {
  vi.useFakeTimers();
  delete (window as any).getCkyConsent;
  delete (window as any).__trackingConsent;
  delete (window as any).google_tag_data;
  localStorage.clear();
  document.getElementById(USER_DATA_ELEMENT_ID)?.remove();
  document.cookie = 'cookieyes-consent=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('in-page expozíciós ablak — a DOM-elem nem él a lap végéig', () => {
  it('az ablak lejártakor a DOM-elem eltűnik', () => {
    grantAdStorage();
    setUserDataOnDOM({ email: 'a@b.com' });
    expect(document.getElementById(USER_DATA_ELEMENT_ID)).not.toBeNull();

    vi.advanceTimersByTime(USER_DATA_INPAGE_WINDOW_MS + 1);

    expect(document.getElementById(USER_DATA_ELEMENT_ID)).toBeNull();
  });

  it('az ablakon BELÜL a GTM még olvassa (a tagek erre az ablakra kaptak időt)', () => {
    grantAdStorage();
    setUserDataOnDOM({ email: 'a@b.com' });
    vi.advanceTimersByTime(USER_DATA_INPAGE_WINDOW_MS - 1);
    expect(readUserDataFromDOM().email).toBe('a@b.com');
  });

  it('minden ÚJ írás ÚJRAINDÍTJA az ablakot (a többlépcsős űrlap nem esik ki alóla)', () => {
    grantAdStorage();
    setUserDataOnDOM({ email: 'a@b.com' });
    vi.advanceTimersByTime(USER_DATA_INPAGE_WINDOW_MS - 100);
    setUserDataOnDOM({ phone_number: '+447700900123' });
    vi.advanceTimersByTime(200); // az ELSŐ ablak itt már lejárt volna
    expect(readUserDataFromDOM().email).toBe('a@b.com');
  });

  it('a boot-időbeli visszaállítás is csak az ablak idejére teszi ki a PII-t', () => {
    grantAdStorage();
    setUserDataOnDOM({ email: 'a@b.com' });
    document.getElementById(USER_DATA_ELEMENT_ID)?.remove(); // új oldalbetöltés
    restoreUserDataFromStorage();
    expect(readUserDataFromDOM().email).toBe('a@b.com');

    vi.advanceTimersByTime(USER_DATA_INPAGE_WINDOW_MS + 1);
    expect(document.getElementById(USER_DATA_ELEMENT_ID)).toBeNull();
  });
});

describe('a két tár KÜLÖN él — az in-page ablak nem nyúl az at-resthez', () => {
  it('az ablak lejárta NEM törli a 24 órás at-rest másolatot', () => {
    grantAdStorage();
    setUserDataOnDOM({ email: 'a@b.com' });
    vi.advanceTimersByTime(USER_DATA_INPAGE_WINDOW_MS + 1);
    expect(document.getElementById(USER_DATA_ELEMENT_ID)).toBeNull();
    expect(localStorage.getItem(USER_DATA_STORAGE_KEY)).not.toBeNull();
  });

  it('a VISSZAVONÁS viszont mindkettőt elviszi — az egy purge, nem ablak-lejárat', () => {
    grantAdStorage();
    setUserDataOnDOM({ email: 'a@b.com' });
    clearUserDataOnDOM();
    expect(document.getElementById(USER_DATA_ELEMENT_ID)).toBeNull();
    expect(localStorage.getItem(USER_DATA_STORAGE_KEY)).toBeNull();
  });
});

describe('késleltetett klikk-konverzió — a §8 bizonyított C-esete', () => {
  it('az ablak lejárta UTÁN is van identitás: a fogyasztó az at-restre esik vissza', () => {
    grantAdStorage();
    setUserDataOnDOM({ email: 'a@b.com', phone_number: '+447700900123' });
    vi.advanceTimersByTime(USER_DATA_INPAGE_WINDOW_MS + 1);

    // A DOM üres — a GTM-expozíció lejárt…
    expect(readUserDataFromDOM()).toEqual({});
    // …de a telefonklikk CAPI-lába továbbra is teljes identitást küld.
    const forDispatch = readUserDataForDispatch();
    expect(forDispatch.email).toBe('a@b.com');
    expect(forDispatch.phone_number).toBe('+447700900123');
  });

  it('amíg a DOM él, ONNAN olvas (a friss akvizíció nyer a tárolt fölött)', () => {
    grantAdStorage();
    setUserDataOnDOM({ email: 'friss@b.com' });
    expect(readUserDataForDispatch().email).toBe('friss@b.com');
  });

  it('DENIED alatt a fallback sem ad identitást', () => {
    grantAdStorage();
    setUserDataOnDOM({ email: 'a@b.com' });
    vi.advanceTimersByTime(USER_DATA_INPAGE_WINDOW_MS + 1);
    denyAdStorage();
    expect(readUserDataForDispatch()).toEqual({});
  });

  it('UNKNOWN alatt sem — olvasható consent nélkül nincs identitás', () => {
    // Ez a mai viselkedés RÖGZÍTÉSE: UNKNOWN alatt a boot-restore sem hidratál,
    // tehát a klikk eddig is üresen ment. A fallback ezt NEM tágíthatja ki.
    grantAdStorage();
    setUserDataOnDOM({ email: 'a@b.com' });
    vi.advanceTimersByTime(USER_DATA_INPAGE_WINDOW_MS + 1);
    delete (window as any).google_tag_data;
    expect(readUserDataForDispatch()).toEqual({});
  });

  it('a 24 órás ablakon TÚL nincs identitás — a szigorú TTL a fallbackre is áll', () => {
    grantAdStorage();
    const stale = { data: { email: 'a@b.com' }, savedAt: Date.now() - (USER_DATA_TTL_MS + 1000) };
    localStorage.setItem(USER_DATA_STORAGE_KEY, JSON.stringify(stale));
    expect(readUserDataForDispatch()).toEqual({});
  });
});

describe('a 24 óra SZIGORÚ, nem sliding (D2)', () => {
  it('az OLVASÁS nem hosszabbítja meg az ablakot', () => {
    grantAdStorage();
    setUserDataOnDOM({ email: 'a@b.com' });
    const savedAt = JSON.parse(localStorage.getItem(USER_DATA_STORAGE_KEY)!).savedAt;

    vi.advanceTimersByTime(60 * 60 * 1000); // egy óra telik el, közben olvasunk
    restoreUserDataFromStorage();
    readUserDataForDispatch();

    expect(JSON.parse(localStorage.getItem(USER_DATA_STORAGE_KEY)!).savedAt).toBe(savedAt);
  });

  it('de egy ÚJ akvizíció indíthat új ablakot (ezt a D2 kimondottan engedi)', () => {
    grantAdStorage();
    setUserDataOnDOM({ email: 'a@b.com' });
    const first = JSON.parse(localStorage.getItem(USER_DATA_STORAGE_KEY)!).savedAt;

    vi.advanceTimersByTime(60 * 60 * 1000);
    setUserDataOnDOM({ phone_number: '+447700900123' });

    expect(JSON.parse(localStorage.getItem(USER_DATA_STORAGE_KEY)!).savedAt).toBeGreaterThan(first);
  });
});
