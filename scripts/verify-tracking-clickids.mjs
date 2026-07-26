/**
 * Regressziós ellenőrzés: Google klikk-ID-k (gclid / gbraid / wbraid) kölcsönös
 * kizárása a tracking-perzisztenciában.  Futtatás:  npm run verify:clickids
 *
 * Miért van rá szükség: a Google egy kattintáshoz EGY klikk-azonosítót ad, a 90 napos
 * `sb_tracking` blob viszont korábban kulcsonként merge-elődött — így egy visszatérő
 * fizetett látogatónál a régi ID bennragadt az új mellett, és a lead MINDKETTŐT vitte
 * a CRM-be (2026-07: 11 fizetett leadből 10 volt ilyen). Az offline konverzió-feltöltés
 * az ilyen sort elutasítja.
 *
 * A repóban nincs teszt-futtató, ezért ez egy önálló szkript: minimál DOM-stub +
 * a VALÓDI persistence.ts betöltése (tsx), nem másolat.
 */
import { existsSync } from 'node:fs';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
// A consent két csatornán olvasható: a CookieYes JS API (getCkyConsent) és a
// `cookieyes-consent` COOKIE. A lib változatai eltérően preferálják őket, ezért a
// stub MINDKETTŐT megadja — különben a klikk-ID-k fail-closed módon kiesnének.
const CKY_COOKIE = 'cookieyes-consent=consentid:test,consent:yes,necessary:yes,'
  + 'functional:yes,analytics:yes,performance:yes,advertisement:yes,other:yes';
globalThis.document = { cookie: CKY_COOKIE, addEventListener: () => {} };
// Néhány repóban a tracking-modul tranzitívan olyan modult húz be, ami betöltéskor
// eseményfigyelőt regisztrál (pl. errors/tracker.ts) — a stub ezért kap ilyeneket is.
const noop = () => {};
const setUrl = (search) => {
  globalThis.window = {
    location: { search, pathname: '/arkalkulator/', href: 'https://lomtalan.hu/arkalkulator/' },
    innerWidth: 1280,
    addEventListener: noop, removeEventListener: noop,
    navigator: { sendBeacon: noop },
    // CookieYes-stub: megadott marketing-hozzájárulás (enélkül a persist no-opol).
    // A lib két változata van forgalomban: az egyik a CookieYes valódi
    // `advertisement` kategóriáját nézi, a régebbi a `marketing` nevet — a stub
    // MINDKETTŐT megadja, hogy a szkript repótól függetlenül fusson.
    getCkyConsent: () => ({
      categories: { analytics: true, advertisement: true, marketing: true, functional: true, necessary: true },
    }),
  };
};
setUrl('');
// A `navigator` a Node-ban csak getter — nem írjuk felül, csak ami hiányzik.
globalThis.addEventListener = noop;

// A modul helye repónként eltér (src/lib/tracking vs. tracking-kit/lib) — a
// szkript ugyanaz marad mindenhol, csak a jelöltek közül veszi az elsőt, ami létezik.
const CANDIDATES = ['../src/lib/tracking/persistence.ts', '../tracking-kit/lib/persistence.ts',
                    '../src/lib/tracking/gclid.ts'];
let p, resolved;
for (const rel of CANDIDATES) {
  const url = new URL(rel, import.meta.url);
  if (!existsSync(url)) continue;
  p = await import(url.href);
  resolved = rel;
  break;
}
// Nem minden repóban van perzisztencia-modul (a painless csak collectAttribution-t
// visz) — ilyenkor az a blokk kimarad, a collectAttribution-ág viszont lefut.
console.log(p ? `modul: ${resolved}\n` : 'SKIP  persistence modul (ebben a repóban nincs)\n');

let failures = 0;
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`);
};

// A tárolókulcs repónként eltér (sb_tracking / sso_tracking), ezért NEM hardcode-oljuk:
// egy próba-írásból derítjük ki, melyik kulcsot használja a betöltött modul.
if (p) {
  const persist = () => { if (typeof p.captureUrlParams === 'function') p.captureUrlParams(); p.persistTrackingParams(); };
  store.clear();
  setUrl('?gclid=PROBE');
  persist();
  // Több kulcs is íródhat (pl. a first-touch blob) — a FŐ blobot a `landingPage`
  // mezőjéről ismerjük fel, nem a beírás sorrendjéről.
  const TRACKING_KEY = [...store.keys()].find((k) => {
    try { return 'landingPage' in JSON.parse(store.get(k)); } catch { return false; }
  });
  if (!TRACKING_KEY) { console.error('nem sikerult kideriteni a tarolokulcsot (a persist nem irt)'); process.exit(2); }
  console.log(`tarolokulcs: ${TRACKING_KEY}\n`);
  const seed = (obj) => store.set(TRACKING_KEY, JSON.stringify({ timestamp: Date.now(), landingPage: '/', ...obj }));
  const stored = () => JSON.parse(store.get(TRACKING_KEY) ?? '{}');

  // 1. Friss gbraid-kattintás egy korábbi gclid MELLÉ → a gclid kiesik (ez a prod-hiba).
  seed({ gclid: 'OLD_GCLID' });
  setUrl('?gbraid=NEW_GBRAID');
  persist();
  check('friss gbraid kiüti a tárolt gclid-et (tárolás)', [stored().gclid, stored().gbraid], [undefined, 'NEW_GBRAID']);
  check('friss gbraid kiüti a tárolt gclid-et (kimenő adat)', [p.getAllTrackingData().gclid, p.getAllTrackingData().gbraid], [undefined, 'NEW_GBRAID']);
  check('getGclid() nem ad vissza korábbi kattintásból való gclid-et', p.getGclid(), null);

  // 2. Fordítva: friss gclid egy korábbi gbraid mellé.
  store.clear();
  seed({ gbraid: 'OLD_GBRAID' });
  setUrl('?gclid=NEW_GCLID');
  persist();
  check('friss gclid kiüti a tárolt gbraid-et', [stored().gclid, stored().gbraid], ['NEW_GCLID', undefined]);

  // 3. Nincs friss Google klikk-ID (organikus visszatérés) → a tárolt MEGMARAD.
  store.clear();
  seed({ gclid: 'KEPT_GCLID' });
  setUrl('?utm_source=newsletter');
  persist();
  check('friss Google klikk-ID nélkül a tárolt gclid megmarad', stored().gclid, 'KEPT_GCLID');
  check('...és a kimenő adatban is ott van', p.getAllTrackingData().gclid, 'KEPT_GCLID');

  // 4. Legacy, már beszennyezett blob (a 10 prod-lead esete) → egyszeri ön-gyógyítás.
  store.clear();
  seed({ gclid: 'LEGACY_GCLID', gbraid: 'LEGACY_GBRAID' });
  setUrl('');
  const healed = p.getStoredData();
  check('legacy blob ön-gyógyul (gclid marad, gbraid kiesik)', [healed.gclid, healed.gbraid], ['LEGACY_GCLID', undefined]);
  check('...és a javítás vissza is íródik a tárolóba', [stored().gclid, stored().gbraid], ['LEGACY_GCLID', undefined]);
  check('...a kimenő adat sem visz többé kettőt', [p.getAllTrackingData().gclid, p.getAllTrackingData().gbraid], ['LEGACY_GCLID', undefined]);

  // 5. Az fbclid MÁS hálózat — a Google-tisztítás nem nyúlhat hozzá.
  store.clear();
  seed({ fbclid: 'FBCLID_KEPT', gclid: 'OLD_GCLID' });
  setUrl('?gbraid=NEW_GBRAID');
  persist();
  check('fbclid érintetlen marad a Google-tisztítás során', stored().fbclid, 'FBCLID_KEPT');
}


// ── 6. A MÁSODIK klikk-ID tár: collectAttribution() (`__sb_attribution`) ──────
// A gateway-dispatch payload attribúciója innen jön, és a beautyflow/painless űrlapjai
// is ide esnek vissza (`t.gclid || c.gclid`). Ugyanaz a merge-hiba volt benne.
const GW_CANDIDATES = ['../src/lib/tracking/gateway.ts', '../tracking-kit/lib/gateway.ts',
                       '../src/lib/worker-tracking.ts'];
let gw;
for (const rel of GW_CANDIDATES) {
  const url = new URL(rel, import.meta.url);
  if (!existsSync(url)) continue;
  gw = await import(url.href);
  break;
}
if (gw?.collectAttribution) {
  const ATTR_KEY = '__sb_attribution';
  store.clear();
  store.set(ATTR_KEY, JSON.stringify({ gclid: 'OLD_GCLID' }));
  setUrl('?gbraid=NEW_GBRAID');
  const a1 = gw.collectAttribution();
  check('collectAttribution: friss gbraid kiüti a tárolt gclid-et', [a1.gclid, a1.gbraid], [undefined, 'NEW_GBRAID']);

  store.clear();
  store.set(ATTR_KEY, JSON.stringify({ gclid: 'LEGACY_GCLID', gbraid: 'LEGACY_GBRAID' }));
  setUrl('');
  const a2 = gw.collectAttribution();
  check('collectAttribution: legacy páros ön-gyógyul', [a2.gclid, a2.gbraid], ['LEGACY_GCLID', undefined]);

  store.clear();
  store.set(ATTR_KEY, JSON.stringify({ gclid: 'KEPT', fbclid: 'FB' }));
  setUrl('?utm_source=hirlevel');
  const a3 = gw.collectAttribution();
  check('collectAttribution: friss Google klikk-ID nélkül a tárolt marad', [a3.gclid, a3.fbclid], ['KEPT', 'FB']);
} else {
  console.log('SKIP  collectAttribution (ebben a repóban nincs)');
}

console.log(failures === 0 ? '\nMinden ellenőrzés zöld.' : `\n${failures} ellenőrzés bukott.`);
process.exit(failures === 0 ? 0 : 1);
