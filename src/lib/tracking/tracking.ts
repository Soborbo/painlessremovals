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
import { getMarketingConsentState } from '@/lib/soborbo-tracking/gateway';

/**
 * Ad-storage consent as a three-state decision.
 *
 * ── Hol dől el, és hol NEM ───────────────────────────────────────────────────
 * A DÖNTÉS a kanonikus csomagé (`getMarketingConsentState()`, 6.5.0). Ez a
 * függvény már csak ADAPTER: a csomag `GRANTED/DENIED/UNKNOWN` állapotát
 * fordítja le a site publikus szerződésére. Korábban a site SAJÁT
 * CookieYes-süti parsert és saját háromállapotú logikát tartott fenn —
 * ugyanarra a kérdésre kétféle kód, vagyis második authority.
 *
 * Egy tier maradt itt, és ez SZÁNDÉKOS:
 *
 *   `google_tag_data.ics` UPDATE — a GTM Consent Mode jele. A kanonikus mag
 *   ezt NEM modellezi (ő a saját sütijét, a CookieYes-sütit és a CookieYes JS
 *   API-t nézi). Ha csendben eldobnánk, egy oldal ÉLETE SORÁN hozott
 *   banner-döntést csak a süti-olvasáson keresztül látnánk meg — pont azt a
 *   jelet veszítenénk el, amiért ez a tier eredetileg bekerült.
 *
 * Amiért a DEFAULT bejegyzés nem elég: boot-időben a GTM még nem töltött be,
 * az egyetlen látható jel a GTMHead consent DEFAULT (denied) — az NEM
 * felhasználói döntés. Döntésnek véve minden oldalbetöltésen kiürítettük a
 * perzisztált PII side-channelt, teljesen konszenzusos felhasználóknál is
 * (a CookieYes az `update: granted`-et jóval a boot után pusholja).
 */
export type ConsentDecision = 'granted' | 'denied' | 'unknown';

export function adStorageConsent(): ConsentDecision {
  if (typeof window === 'undefined') return 'unknown';
  try {
    const ics = (window as unknown as { google_tag_data?: { ics?: { entries?: Record<string, { default?: boolean; update?: boolean }> } } }).google_tag_data?.ics;
    const entry = ics?.entries?.ad_storage;
    // Only an explicit UPDATE is a user decision — the default entry is
    // just the pre-CMP baseline (always denied on this site).
    if (entry && entry.update !== undefined) {
      return entry.update === true ? 'granted' : 'denied';
    }
  } catch {
    // ignore
  }

  switch (getMarketingConsentState()) {
    case 'GRANTED':
      return 'granted';
    case 'DENIED':
      return 'denied';
    default:
      return 'unknown';
  }
}

/** Back-compat boolean gate: persist PII at rest only on an explicit grant. */
function adStorageGranted(): boolean {
  return adStorageConsent() === 'granted';
}

import {
  normalizePhone as canonicalNormalizePhone,
  registerMarketingPurgeHook,
} from '@/lib/soborbo-tracking/persistence';
import { normalizeEmailIdentity } from '@/lib/soborbo-tracking/email-identity';

export { adStorageGranted };

declare global {
  interface Window {
    /**
     * A KANONIKUS csomag alakjával egyezik (`Record<string, unknown>[]`, NEM
     * opcionális). Az F9/4 vendorolásakor derült ki, hogy a két deklaráció
     * ütközött: a TypeScript ugyanarra a globálisra nem enged kétféle
     * modifikátort (TS2687/TS2717), tehát a kanonikus mag be sem fordult
     * volna. A futásidejű védelem VÁLTOZATLAN: minden hívó helyen marad a
     * `window.dataLayer = window.dataLayer || []` őrzés.
     */
    dataLayer: Record<string, unknown>[];
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
 * GA4-reserved manual-campaign parameter names. An event param literally
 * named `source` / `medium` / `campaign` is interpreted by GA4 as a
 * TRAFFIC-SOURCE signal: when such a hit opens (or is early in) a session,
 * the label becomes the session's source. That is exactly how the
 * `standalone / (not set)`, `after_calculator / (not set)` and
 * `email_click / (not set)` phantom rows appeared in sessionSourceMedium
 * (audit 2026-08, P0-A) — 40%+ of key events detached from their real
 * acquisition source. The label itself is legitimate reporting data, so
 * it is REMAPPED to a safe name rather than dropped. GTM must read the
 * remapped key (`cta_context`), never `source`.
 */
const GA4_RESERVED_ATTRIBUTION_KEYS: Record<string, string> = {
  source: 'cta_context',
  medium: 'cta_medium',
  campaign: 'cta_campaign',
};

/**
 * Pushes a NON-PII event to `window.dataLayer`. Returns the `event_id`
 * used (generated if not provided) so callers that need to mirror to a
 * server-side endpoint with the same dedup key can do so.
 */
export function trackEvent(name: string, params: TrackingParams = {}): string {
  if (typeof window === 'undefined') return '';
  const { event_id, payload } = buildSafePush(name, params);
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(payload);
  return event_id;
}

function buildSafePush(
  name: string,
  params: TrackingParams,
): { event_id: string; payload: Record<string, unknown> } {
  const { event_id: providedId, ...rest } = params;
  const safe: Record<string, unknown> = {};
  const stripped: string[] = [];
  const remapped: string[] = [];
  for (const [k, v] of Object.entries(rest)) {
    if (PII_KEYS.has(k)) {
      stripped.push(k);
      continue;
    }
    const remap = GA4_RESERVED_ATTRIBUTION_KEYS[k];
    if (remap) {
      remapped.push(k);
      safe[remap] = v;
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
  if (remapped.length && import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(
      `[tracking] GA4-reserved attribution keys remapped in trackEvent('${name}'): ${remapped
        .map((k) => `${k}→${GA4_RESERVED_ATTRIBUTION_KEYS[k]}`)
        .join(', ')}. A literal 'source' event param overwrites the GA4 session source.`,
    );
  }
  const event_id = (providedId as string | undefined) || generateUUID();
  return { event_id, payload: { event: name, event_id, ...safe } };
}

/**
 * Pushes a conversion event and navigates AFTER GTM's tags have had a
 * chance to fire. A bare `trackEvent(...)` followed by a synchronous
 * `window.location.href = ...` cancels the Google Ads / GA4 / Meta
 * pixel requests mid-flight — the exact race that made "Callback
 * requested" report ~0 conversions in Ads while real callbacks arrived.
 *
 * Uses GTM's `eventCallback` (invoked when all tags for the event have
 * fired) plus a safety timeout so navigation still happens when GTM is
 * blocked by an extension or never calls back.
 *
 * `alsoWaitFor`: pass the Promise returned by `dispatchWorkerConversion`
 * when the same handler also fires a server-side CAPI leg — the beacon
 * only queues after the Turnstile token mint, and a navigation kills a
 * pending mint. Navigation then waits for BOTH the GTM callback and the
 * dispatch (the safety timeout still overrides everything).
 */
export function trackEventBeforeNavigate(
  name: string,
  params: TrackingParams,
  destination: string,
  opts: {
    timeoutMs?: number;
    alsoWaitFor?: Promise<unknown>;
    /** Test seam — defaults to a real location change. */
    navigate?: (url: string) => void;
  } = {},
): string {
  if (typeof window === 'undefined') return '';
  const { timeoutMs = 2500, alsoWaitFor } = opts;
  const navigate = opts.navigate || ((url: string) => { window.location.href = url; });
  const { event_id, payload } = buildSafePush(name, params);

  let navigated = false;
  let gtmDone = false;
  let dispatchDone = !alsoWaitFor;
  const go = () => {
    if (navigated) return;
    navigated = true;
    navigate(destination);
  };
  const tryGo = () => {
    if (gtmDone && dispatchDone) go();
  };

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    ...payload,
    eventCallback: () => {
      gtmDone = true;
      tryGo();
    },
    eventTimeout: timeoutMs - 500 > 0 ? timeoutMs - 500 : timeoutMs,
  });
  if (alsoWaitFor) {
    const settle = () => {
      dispatchDone = true;
      tryGo();
    };
    alsoWaitFor.then(settle, settle);
  }
  // Safety net: navigate even if GTM never calls back / the dispatch hangs.
  setTimeout(go, timeoutMs);
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
 *
 * MINDKÉT tár ad_storage-consenthez kötött — a DOM-elem is, nem csak a
 * localStorage. A háromállapotú kapu a függvény törzsében van kifejtve.
 * Ez NEM viszi el a lead-et: a business-adat a form saját POST-bodyjában
 * megy a CRM-nek, ez a rejtett elem kizárólag tracking-oldalcsatorna.
 */
interface StoredUserData {
  data: UserData;
  savedAt: number;
}

export function setUserDataOnDOM(data: UserData): void {
  if (typeof document === 'undefined') return;

  // A DOM-ág ÉS az at-rest ág ugyanarra a háromállapotú consentre épül, de NEM
  // ugyanúgy reagál az `unknown`-ra — ezért egy kapu, két külön következmény:
  //
  //   GRANTED → DOM-írás + at-rest perzisztencia (a teljes mai granted út)
  //   UNKNOWN → NINCS új DOM-írás, de az at-rest másolatot SEM bántjuk
  //   DENIED  → azonnali purge: a DOM-elem ÉS a localStorage-kulcs is megy
  //
  // Miért nem ír UNKNOWN alatt (ez a változás): a rejtett elem tracking
  // oldalcsatorna, nem a quote teljesítéséhez szükséges business data, tehát
  // nem-esszenciális — olvasható consent nélkül nincs jogalap kiírni. Ugyanezen
  // oldalak DOM-ját egy consent-kapu nélküli session-replay is olvassa.
  //
  // Miért NEM töröl UNKNOWN alatt (ez marad): boot-időben a CMP még nem
  // töltött be, tehát minden oldalbetöltés `unknown`-nal indul. Ha ezt
  // tagadásnak vennénk, a konszenzusos felhasználó perzisztált adatát
  // törölnénk minden lapon — ez egyszer már megtörtént, van rá teszt.
  const consent = adStorageConsent();
  if (consent !== 'granted') {
    if (consent === 'denied') clearUserDataOnDOM();
    return;
  }

  writeUserDataToDOMElement(data);

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
 * Called from `boot.ts` on every page-load (and again on the CookieYes
 * consent-update event) so the hidden DOM element is repopulated for
 * tags/dispatches that read user data later in the page's life — e.g. a
 * phone-click CAPI mirror on a page the user navigated to after
 * completing the calculator.
 *
 * Three-state consent handling: hydrate on an explicit grant, purge the
 * at-rest copy on an explicit denial, and do NOTHING when consent isn't
 * readable yet — at boot time GTM/CookieYes haven't initialised, and
 * treating that as a denial used to delete the persisted blob on every
 * page-load, breaking the feature for everyone.
 */
export function restoreUserDataFromStorage(): void {
  if (typeof document === 'undefined') return;
  const consent = adStorageConsent();
  if (consent !== 'granted') {
    // Ez a VISSZAVONÁS útja is: a `boot.ts` a `cookieyes_consent_update`
    // eseményre ezt hívja. Eddig csak az at-rest másolatot vitte, a nyers
    // e-mail/telefon pedig a DOM-ban maradt a lap további életére — pont
    // abban a pillanatban, amikor a látogató azt kérte, hogy ne maradjon.
    if (consent === 'denied') clearUserDataOnDOM();
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

// A MECHANIZMUS a kanonikus magé, a POLICY a site-é. A mag visszavonáskor a
// SAJÁT ephemeral EC-oldalcsatornáját (`__sb_user_data__`) takarítja — a
// painless rejtett eleme (`__pl_user_data__`) külön tár, saját kulccsal és
// saját mezőkészlettel, tehát külön be kell jelentkeznie a takarításra.
// Modul-szintű mellékhatás, mint a magban: aki a side-channelt importálja, az
// a takarítását is megkapja. (Teszt-izolációhoz a mag `clearMarketingPurgeHooks`-ot
// exportál — ebben a fájlban SZÁNDÉKOSAN nem hívjuk, mert a regisztráció csak
// egyszer, a modul kiértékelésekor fut.)
registerMarketingPurgeHook(clearUserDataOnDOM);

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
  if (d.postalCode) out.postal_code = d.postalCode;
  if (d.country) out.country = d.country;
  return out;
}

// ---------------------------------------------------------------------------
// Normalization (used by both client side and the CAPI endpoint)
// ---------------------------------------------------------------------------

export type CountryCode = 'GB' | 'HU';

/**
 * Országhívó-kódok, amelyek TÉNYLEGESEN trunk-`0`-t használnak.
 *
 * FIGYELEM: csak az kerülhet ide, aki tényleg így hív. Olaszország,
 * Spanyolország, Csehország, Szlovákia, Lengyelország MEGTARTJA a vezető
 * nullát — őket felvenni ide adatrontás lenne.
 */
const TRUNK_PREFIX_DIAL_CODES = new Set(['44', '36', '49', '33', '31', '32', '43', '41', '40']);

/**
 * `+CC0…` → `+CC…`. A `+44 (0)7123 456 789` írásmód a UK-ban általános, és
 * E.164-ben a hívókód utáni `0` SOHA nem érvényes.
 */
function stripTrunkPrefix(plus: string): string {
  for (const codeLen of [3, 2]) {
    const candidate = plus.slice(1, 1 + codeLen);
    if (TRUNK_PREFIX_DIAL_CODES.has(candidate) && plus.length > 1 + codeLen && plus[1 + codeLen] === '0') {
      return '+' + candidate + plus.slice(2 + codeLen);
    }
  }
  return plus;
}

/**
 * Telefon → E.164. **A KANONIKUS CSOMAG IMPLEMENTÁCIÓJÁRA DELEGÁL** (F9/4).
 *
 * ── Miért delegálás, és nem saját kód ────────────────────────────────────────
 * Ez a függvény korábban a fork saját implementációja volt, és NÉMÁN eltért a
 * szervertől: a `+44 (0)7123-456.789` alakból a böngésző `+4407123456.789`-et
 * csinált, a szerver `+447123456789`-et. A Meta Pixel és a CAPI ugyanarról a
 * látogatóról KÉT KÜLÖN hash-elt identitást adott — a user matching, az EMQ és
 * az Enhanced Conversions match-rate némán romlott. (A dedup ép volt: az az
 * `(event_name, event_id)` páron áll.)
 *
 * A javítás önmagában nem elég: amíg KÉT implementáció létezik ugyanarra a
 * szabályra, a szétcsúszás bármikor megismételhető. Ezért innentől EGY forrás
 * van — a vendorolt kanonikus csomag (`src/lib/soborbo-tracking/`), amelynek
 * bitazonosságát a Serverside `check:vendored --paths=lib/` igazolja.
 *
 * Az ÜRES bemenet szándékosan itt marad: a kanonikus `normalizePhone('')`
 * `'+44'`-et adna (nincs üres-őre), a hívók viszont üres stringre üres
 * stringet várnak — ezt a `normalize.test.ts` régóta rögzíti.
 */
export function normalizePhoneE164(
  phone: string,
  countryCode: CountryCode = DEFAULT_COUNTRY,
): string {
  if (!phone) return '';
  return canonicalNormalizePhone(phone, countryCode);
}

export function normalizeUserData(
  input: Partial<UserData>,
  countryCode: CountryCode = DEFAULT_COUNTRY,
): UserData {
  const out: UserData = { country: countryCode };
  // Az e-mail-identitás szabálya a KANONIKUS magé (6.6.0):
  // trim → lowercase → `@`-őr → >254 OKTET esetén ELDOBÁS, sosem csonkítás.
  // Ugyanezt a modult importálja a Worker `hash.ts` is, tehát a böngésző-Pixel
  // és a CAPI/offline láb bitre ugyanazt a stringet hasheli.
  const email = normalizeEmailIdentity(input.email);
  if (email) out.email = email;
  if (input.phone_number) out.phone_number = normalizePhoneE164(input.phone_number, countryCode);
  if (input.first_name) out.first_name = input.first_name.toLowerCase().trim();
  if (input.last_name) out.last_name = input.last_name.toLowerCase().trim();
  if (input.city) out.city = input.city.toLowerCase().trim();
  if (input.postal_code) out.postal_code = input.postal_code.toUpperCase().replace(/\s/g, '');
  return out;
}
