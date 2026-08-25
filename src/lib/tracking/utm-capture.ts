/**
 * UTM / click-ID capture — a Painless SESSION-szintű CRM-attribúciója.
 *
 * ── Mi a sajátunk és mi a kanonikusé ─────────────────────────────────────────
 * A TÁROLÓ-MODELL a miénk, és szándékosan más, mint a kanonikus csomagé: ez egy
 * session-scope-ú `sessionStorage` store (`pr_tracking`) + egy first-party
 * affiliate süti (`pr_ref`), a CRM lead-attribúciójához. A csomag gateway-e
 * ezzel szemben last-touch `localStorage`-ot vezet a hirdetési platformoknak.
 * A kettő nem egymás változata — az összevonásuk attribution-policy döntés
 * lenne, nem fork-takarítás, ezért NEM történt meg.
 *
 * A SZABÁLYOK viszont nem a miénk. A Google klikk-ID kölcsönös kizárása és a
 * forrás-sorrend a `soborbo-tracking/google-click-id` primitívben él, a
 * marketing-consent háromállapotú osztályozása pedig a
 * `getMarketingConsentState()`-ben. Ez a fájl korábban mindkettőt újra
 * implementálta; a szétsodródás ára a 6.4.1 volt.
 *
 * ── Consent ──────────────────────────────────────────────────────────────────
 * A `pr_tracking` EGÉSZE marketing-scoped. Egy store → egy consent-osztály:
 * nem mezőnként találgatunk (`utm_source` analytics? `utm_campaign`
 * marketing?), mert az determinisztikusan eldönthetetlen. A PECR/ICO szabály
 * szempontjából nem az számít, hogy az érték PII-e, hanem hogy információt
 * tárolunk-e a felhasználó eszközén — a web storage is ide tartozik.
 *
 *   UNKNOWN → a friss URL-jel EFEMER MEMÓRIÁBAN vár; eszközre semmi nem íródik
 *   GRANTED → a puffer kiíródik, és a tároló frissül
 *   DENIED  → a puffer ürül, és a MÁR KIÍRT tároló+süti is törlődik
 *
 * A memória-puffer nem kényelmi megoldás: enélkül a
 * `landing ?gclid=ABC → banner → Accept` úton a klikk-ID elveszne, vagyis a
 * consent-javítás egy attribúció-vesztést szülne.
 */

import {
  applyGoogleClickId,
  resolveGoogleClickId
} from '@/lib/soborbo-tracking/google-click-id';
import { getMarketingConsentState } from '@/lib/soborbo-tracking/gateway';

const STORAGE_KEY = 'pr_tracking';
const KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  // gbraid/wbraid arrive INSTEAD of gclid when Google cannot set one (iOS /
  // in-app webview traffic). Without them a mobile-heavy paid click reaches
  // save-quote → CRM → gateway with no Google click ID at all.
  'gbraid',
  'wbraid',
  'fbclid',
] as const;

export interface AttributionParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  fbclid?: string;
  ref?: string;
  _landing?: string;
  _ts?: string;
}

// First-party cookie holding the affiliate `?ref=` code for the session.
// Session-scoped (no Max-Age) so it expires when the browser closes, which
// matches the first-touch-per-session model of the sessionStorage store.
const REF_COOKIE = 'pr_ref';

/**
 * EFEMER pre-consent puffer. Csak memória — az oldal elhagyásával elvész, és
 * ez így helyes: consent nélkül nincs mit megőrizni.
 */
let pending: AttributionParams = {};

function setRefCookie(code: string): void {
  try {
    document.cookie = `${REF_COOKIE}=${encodeURIComponent(code)}; path=/; SameSite=Lax`;
  } catch {
    // document.cookie can throw in sandboxed iframes; ignore.
  }
}

function clearRefCookie(): void {
  try {
    document.cookie = `${REF_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  } catch {
    // ignore
  }
}

function readRefCookie(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${REF_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function readStore(): AttributionParams {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function purgeStore(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // sessionStorage can be disabled in some privacy modes; ignore.
  }
  clearRefCookie();
}

export function captureUTMs(): void {
  if (typeof window === 'undefined') return;

  const consent = getMarketingConsentState();

  // A visszavonás NYUGALMI ÁLLAPOTBAN is érvényes: nem elég nem írni többet,
  // a korábban kiírtat is el kell takarítani.
  if (consent === 'DENIED') {
    pending = {};
    purgeStore();
    return;
  }

  const params = new URLSearchParams(window.location.search);

  // A friss URL-jelek MINDIG a memória-pufferbe mennek — ez nem eszközre írás,
  // és ez teszi lehetővé, hogy egy későbbi grant ne veszítse el a klikk-ID-t.
  for (const k of KEYS) {
    const v = params.get(k);
    if (v) pending[k] = v;
  }
  const ref = params.get('ref');
  if (ref) pending.ref = ref;
  if (!pending._landing) pending._landing = window.location.pathname;

  // UNKNOWN: eszközre semmi. A puffer megvár egy döntést.
  if (consent !== 'GRANTED') return;

  const stored = readStore();
  const merged: AttributionParams = { ...stored, ...pending };

  // A Google klikk-ID döntése a KANONIKUS primitívé: kölcsönös kizárás +
  // forrás-sorrend. A `pr_tracking`-nek szándékosan NINCS `_gcl_aw` rétege —
  // az a gateway saját store-jának a dolga; itt az URL és a korábbi session
  // az egyetlen két jelölt.
  applyGoogleClickId(
    merged as Record<string, unknown>,
    resolveGoogleClickId({ url: params, stored: { ...stored, ...pending } })
  );

  merged._ts = new Date().toISOString();
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // sessionStorage can be disabled in some privacy modes; ignore.
  }
  if (merged.ref) setRefCookie(merged.ref);
  pending = {};
}

/**
 * A KALKULÁTOR állapotába menő három klikk-ID mező — pontosan EGY lehet
 * nem-null.
 *
 * Miért kell ez külön: a hívó korábban mezőnként, EGYMÁSTÓL FÜGGETLENÜL
 * választott (`params.get('gclid') || stored.gclid`, aztán ugyanez gbraid-re),
 * és egy kommentre támaszkodott — „a `captureUTMs` már eldobta az elavult
 * testvéreket". Ez a feltevés csak akkor állt, ha a capture MÁR LEFUTOTT ÉS
 * volt marketing-consent. Egy `?gclid=A` URL + `{gbraid: B}` tároló mellett
 * KÉT különböző kattintás azonosítója került a save-quote → CRM útra.
 *
 * Feltevés helyett most a közös primitív dönt.
 */
export function resolveClickIdFields(
  params: URLSearchParams,
  stored: AttributionParams
): { gclid: string | null; gbraid: string | null; wbraid: string | null } {
  const resolved = resolveGoogleClickId({
    url: params,
    stored: stored as Record<string, string | undefined>
  });
  return {
    gclid: resolved?.key === 'gclid' ? resolved.value : null,
    gbraid: resolved?.key === 'gbraid' ? resolved.value : null,
    wbraid: resolved?.key === 'wbraid' ? resolved.value : null
  };
}

/**
 * A CMP döntése az oldal ÉLETE SORÁN is megváltozhat — a banner épp ezért van.
 * Ezt a boot köti a provider consent-eseményére; a `captureUTMs()` idempotens,
 * ezért a grant-ág flush, a denied-ág purge, az unknown-ág no-op.
 */
export function syncAttributionOnConsentChange(): void {
  captureUTMs();
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
  gbraid?: string;
  wbraid?: string;
  fbclid?: string;
  landing_page?: string;
} {
  // A DRÓT külön szabály a TÁROLÁSTÓL. A tárolás PECR-kérdés (mit írunk az
  // eszközre); ez itt azt dönti el, mit küldünk a saját CRM-ünknek. A kanonikus
  // `collectAttribution` szabályát követjük, hogy a két láb ne mondjon mást:
  // UTM/landing mehet döntés nélkül is, hirdetési klikk-azonosító NEM.
  const consent = typeof window === 'undefined' ? 'UNKNOWN' : getMarketingConsentState();
  const a: AttributionParams =
    consent === 'DENIED' ? {} : { ...readAttribution(), ...pending };
  const out: Record<string, string> = {};
  if (a.utm_source) out.utm_source = a.utm_source;
  if (a.utm_medium) out.utm_medium = a.utm_medium;
  if (a.utm_campaign) out.utm_campaign = a.utm_campaign;
  if (consent === 'GRANTED') {
    if (a.gclid) out.gclid = a.gclid;
    if (a.gbraid) out.gbraid = a.gbraid;
    if (a.wbraid) out.wbraid = a.wbraid;
    if (a.fbclid) out.fbclid = a.fbclid;
  }
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
