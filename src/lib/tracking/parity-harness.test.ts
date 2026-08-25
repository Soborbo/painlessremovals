// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * F9/3 · 3. LÉPÉS — PARITÁS-HARNESS A MAI FORK ELLEN.
 *
 * ── Mire való ────────────────────────────────────────────────────────────────
 * A `src/lib/tracking/` a `soborbo-tracking` csomag FORKJA: a kiadás 27
 * fájljából 22 nincs is meg benne (`check-vendored-copy` verdikt: FORK). A
 * migráció ezért CSERE, nem frissítés — és a csere csak akkor biztonságos, ha
 * előbb rögzítjük, mit csinál MA a rendszer.
 *
 * Ez a fájl azt rögzíti. Kétszer fog lefutni:
 *   1. MOST, a fork fölött  → GREEN (a mai viselkedés definíciója);
 *   2. a 4. lépés után, a kanonikus mag fölött, adapterrel → ugyanennek
 *      GREEN-nek kell lennie.
 * Ami eltér, az vagy adapter-hiba, vagy tudatos döntés — de nem maradhat
 * észrevétlen.
 *
 * ── A harness két szabálya ───────────────────────────────────────────────────
 * 1. **KIZÁRÓLAG a publikus felületet hívja** (`./index`), soha nem belső
 *    modult. Az adapter célja épp az, hogy a belső hívásláncok megváltozzanak —
 *    egy belsőkre pinnelt teszt a cserét lehetetlenné tenné, nem védené.
 * 2. **A MEGFIGYELHETŐ kimenetre állít**: dataLayer-push, a hálózatra kerülő
 *    JSON, és a tárolt állapot. Nem arra, hogy melyik függvény hívja melyiket.
 *
 * ── Amit véd (mindegyik mögött megtörtént, MÉRT hiba) ────────────────────────
 * INV-A  GA4 foglalt kampány-paraméterek átnevezése. A GA4 a `source` NEVŰ
 *        event-paramétert MANUÁLIS kampány-jelzésnek veszi: a címke a
 *        MUNKAMENET forrása lesz. Mérve (GA4 413271735, 90 nap):
 *        `standalone / (not set)` 57, `server / (not set)` 23,
 *        `after_calculator / (not set)` 9, `email_click / (not set)` 4
 *        munkamenet. A javítás hatása is mérve: 2026-08-18 óta NULLA.
 *        🔴 A KANONIKUS CSOMAGBAN EZ A VÉDELEM MA NINCS MEG — ezért ez a
 *        harness legfontosabb esete.
 * INV-B  PII soha nem megy a dataLayerbe (CLAUDE.md 15.).
 * INV-C  A böngésző- és a szerver-láb UGYANAZT az `event_id`-t hordozza.
 * INV-E  A szerver-láb NEM viszi tovább a `source` címkét — az a leg megkerüli
 *        a remap-chokepointot, és a gateway literál `source`-ként adta tovább
 *        GA4 MP-nek.
 */

import {
  trackEvent,
  setUserDataOnDOM,
  readUserDataFromDOM,
  clearUserDataOnDOM,
  dispatchWorkerConversion,
  normalizePhoneE164,
  normalizeUserData,
} from './index';

type Push = Record<string, unknown>;

function dl(): Push[] {
  return (window as unknown as { dataLayer: Push[] }).dataLayer ?? [];
}

/** A hálózatra ténylegesen kikerülő JSON — transport-szinten elkapva. */
const beacons: Array<{ url: string; body: unknown }> = [];

function grantAdStorage() {
  (window as unknown as Record<string, unknown>).google_tag_data = {
    ics: { entries: { ad_storage: { update: true } } },
  };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.body.innerHTML = '';
  (window as unknown as { dataLayer: Push[] }).dataLayer = [];
  beacons.length = 0;
  grantAdStorage();

  // A `sendBeacon` az elsődleges út (túléli a navigációt). Itt fogjuk el, mert
  // ez az, ami TÉNYLEGESEN kimegy — függetlenül attól, melyik modul állította
  // össze. Pont ez teszi a harnesst cserével szemben ellenállóvá.
  Object.defineProperty(navigator, 'sendBeacon', {
    configurable: true,
    writable: true,
    value: (url: string, blob: Blob) => {
      // A jsdom Blob-ja nem ad szinkron text()-et, ezért a konstruktorba adott
      // részt olvassuk vissza a mockolt Blob-ról.
      beacons.push({ url, body: (blob as unknown as { __text?: string }).__text });
      return true;
    },
  });

  // Blob-mock, ami megőrzi a szöveget (a jsdom nem ad szinkron olvasást).
  class TextBlob {
    __text: string;
    type: string;
    constructor(parts: string[], opts?: { type?: string }) {
      this.__text = parts.join('');
      this.type = opts?.type ?? '';
    }
  }
  (globalThis as unknown as Record<string, unknown>).Blob = TextBlob;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function lastBeaconBody(): Record<string, unknown> | null {
  const last = beacons[beacons.length - 1];
  if (!last || typeof last.body !== 'string') return null;
  return JSON.parse(last.body) as Record<string, unknown>;
}

describe('INV-A · GA4 foglalt kampány-paraméterek — a legfontosabb eset', () => {
  it('a `source` a dataLayerben `cta_context`-ként jelenik meg, SOHA `source`-ként', () => {
    trackEvent('callback_conversion', { source: 'standalone', service: 'removals' });
    const push = dl().at(-1)!;

    // Ha ez elbukik a csere után, a `standalone / (not set)` munkamenetek
    // visszatérnek — 90 nap alatt 57-et mértünk belőlük.
    expect(push).not.toHaveProperty('source');
    expect(push.cta_context).toBe('standalone');
    expect(push.service).toBe('removals');
  });

  it('a `medium` és a `campaign` ugyanígy átnevezve', () => {
    trackEvent('test_event', { medium: 'cta', campaign: 'summer' });
    const push = dl().at(-1)!;
    expect(push).not.toHaveProperty('medium');
    expect(push).not.toHaveProperty('campaign');
    expect(push.cta_medium).toBe('cta');
    expect(push.cta_campaign).toBe('summer');
  });

  it('a NEM foglalt nevek érintetlenül mennek át', () => {
    trackEvent('test_event', { calculator_name: 'quote', device: 'mobile' });
    const push = dl().at(-1)!;
    expect(push.calculator_name).toBe('quote');
    expect(push.device).toBe('mobile');
  });
});

describe('INV-B · PII soha nem megy a dataLayerbe', () => {
  const PII_KEYS = [
    'user_data', 'user_email', 'user_phone', 'email', 'phone', 'phone_number',
    'first_name', 'last_name', 'name', 'street', 'city', 'postal_code', 'postcode',
    'em', 'ph', 'fn', 'ln',
  ];

  it('minden PII-alakú kulcs kiesik a push-ból', () => {
    trackEvent('callback_conversion', {
      email: 'a@b.com',
      phone: '+447123456789',
      first_name: 'Jane',
      user_data: { email: 'a@b.com' },
      value: 100,
    } as Record<string, unknown>);
    const push = dl().at(-1)!;
    for (const key of PII_KEYS) expect(push, `PII szivárgott: ${key}`).not.toHaveProperty(key);
    // A nem-PII mezők viszont megmaradnak — a szűrő nem ürítheti ki az eventet.
    expect(push.value).toBe(100);
  });
});

describe('INV-C · a két láb ugyanazt az event_id-t hordozza', () => {
  it('a dataLayer push és a hálózatra kerülő payload event_id-je azonos', async () => {
    // BÖNGÉSZŐ-UTAS event: a `phone_conversion` a gateway böngésző-ágán mehet.
    // A high-value (form/lead) eventeket a gateway 403-mal dobja onnan
    // (TRK-400-017) — azokat a site BACKENDJE dispatcheli, lásd lentebb.
    const eventId = trackEvent('phone_conversion', { source: 'standalone' });
    await dispatchWorkerConversion('phone_conversion', eventId, {});

    const push = dl().at(-1)!;
    const body = lastBeaconBody();
    expect(body, 'nem ment ki beacon — a szerver-láb néma').not.toBeNull();
    expect(push.event_id).toBe(eventId);
    expect(body!.event_id).toBe(eventId);
  });
});

describe('INV-E · a szerver-láb NEM viszi tovább a `source` címkét', () => {
  it('a kimenő payloadban sem `source`, sem `cta_context` nincs', async () => {
    const eventId = trackEvent('phone_conversion', { source: 'standalone' });
    await dispatchWorkerConversion('phone_conversion', eventId, {});

    const body = lastBeaconBody()!;
    // A gateway `ConversionPayload` szerződése nem ismer `cta_context`-et; egy
    // elutasított payload (400) NÉMÁN kilőné a Meta CAPI-lábat.
    expect(body).not.toHaveProperty('source');
    expect(body).not.toHaveProperty('cta_context');
  });

  it('value:0 esetén sem `value`, sem `currency` nem megy ki (CLAUDE.md 3.)', async () => {
    const eventId = trackEvent('phone_conversion', {});
    await dispatchWorkerConversion('phone_conversion', eventId, { value: 0, currency: 'GBP' });
    const body = lastBeaconBody()!;
    expect(body).not.toHaveProperty('value');
    expect(body).not.toHaveProperty('currency');
  });
});

describe('a high-value eventek SOHA nem hagyják el a böngészőt', () => {
  // A gateway a form/lead/purchase konverziókat CSAK a hitelesített
  // szerver-ingressen fogadja; a böngésző-útról 403 (TRK-400-017). Ezeket a site
  // BACKENDJE dispatcheli ugyanazzal az event_id-vel. Ha a csere után ez a
  // némítás elveszne, minden ilyen call site garantált-403 zajt termelne — és a
  // valódi szerver-leg mellé egy néma, sikertelen böngésző-legünk lenne.
  const SERVER_ONLY = ['callback_conversion', 'contact_form_submit', 'quote_calculator_conversion'];

  for (const internal of SERVER_ONLY) {
    it(`${internal} → nem megy ki beacon a böngészőből`, async () => {
      const eventId = trackEvent(internal, {});
      const queued = await dispatchWorkerConversion(internal, eventId, {});
      expect(queued).toBe(false);
      expect(beacons).toHaveLength(0);
      // A dataLayer push viszont MEGTÖRTÉNIK (Pixel/GA4/Ads a böngészőben).
      expect(dl().at(-1)!.event_id).toBe(eventId);
    });
  }

  it('ismeretlen belső event-név → néma kihagyás, nem kivétel', async () => {
    expect(await dispatchWorkerConversion('nincs_ilyen_event', 'e1', {})).toBe(false);
    expect(beacons).toHaveLength(0);
  });
});

describe('PII-oldalcsatorna (DOM) — a csere után is ugyanígy kell viselkednie', () => {
  it('írás → olvasás → törlés körút', () => {
    setUserDataOnDOM({ email: 'jane@example.com', phone_number: '07123456789' });
    const read = readUserDataFromDOM();
    expect(read?.email).toBe('jane@example.com');

    clearUserDataOnDOM();
    // A SZERZŐDÉS: törlés után ÜRES OBJEKTUM jön, nem `undefined`. Ez rögzítve
    // van, mert lábon lövős: egy `if (readUserDataFromDOM())` igazat adna egy
    // üres objektumra is, tehát a hívó azt hihetné, van adata. A csere után
    // ennek a szerződésnek AZONOSNAK kell maradnia — egy `undefined`-re váltás
    // némán megváltoztatná minden ilyen hívó ágát.
    const afterClear = readUserDataFromDOM();
    expect(afterClear).toEqual({});
    expect(Object.keys(afterClear)).toHaveLength(0);
  });

  it('a PII a DOM-ban van, NEM a dataLayerben', () => {
    setUserDataOnDOM({ email: 'jane@example.com' });
    expect(JSON.stringify(dl())).not.toContain('jane@example.com');
  });
});

describe('normalizálás — a #87 néma hash-divergencia után KÖTELEZŐ paritás', () => {
  // A #87 azt találta, hogy a kliens korai return-je miatt a `+44 (0)7123…`
  // írásmódból `+4407123456789` lett a böngészőben és `+447123456789` a
  // szerveren: a Pixel és a CAPI MÁS embert látott ugyanabban a látogatóban.
  // A csere után a kanonikus implementációnak ugyanezt kell adnia.
  const CASES: Array<[string, string]> = [
    ['07123456789', '+447123456789'],
    ['+44 7123 456789', '+447123456789'],
    ['+44 (0)7123-456.789', '+447123456789'],
    ['447123456789', '+447123456789'],
    ['+447123456789', '+447123456789'],
  ];

  for (const [input, expected] of CASES) {
    it(`${input} → ${expected}`, () => {
      expect(normalizePhoneE164(input)).toBe(expected);
    });
  }

  it('a normalizeUserData a teljes objektumon ugyanezt adja', () => {
    const out = normalizeUserData({ email: '  Jane@Email.com ', phone_number: '+44 (0)7123-456.789' });
    expect(out.phone_number).toBe('+447123456789');
    // A Meta-szabály: lowercase + trim, de a plus-suffixet és a Gmail-pontot
    // NEM strippeljük (CLAUDE.md 1.).
    expect(out.email).toBe('jane@email.com');
  });
});
