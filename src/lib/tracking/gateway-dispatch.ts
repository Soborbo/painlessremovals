/**
 * Server-to-server conversion dispatch to the Soborbo event-gateway Worker.
 *
 * WHY THIS EXISTS. The browser leg (`worker-tracking.ts` → `sendToWorker`) can
 * only reach the gateway with a Turnstile token, and it bails silently when it
 * cannot get one. That is not a hypothetical: an unbaked `PUBLIC_TURNSTILE_SITE_KEY`
 * killed every server-side conversion between 2026-06-28 and 2026-07-13 without a
 * single error surfacing. Meanwhile the lead itself always arrived (email + i-mve +
 * Painless-CRM), so the business saw leads while Meta saw nothing.
 *
 * This module is the backstop: the lead chokepoints (`save-quote.ts`,
 * `callbacks.ts`) push the conversion straight from the server, authenticated with
 * a per-site token, so it no longer depends on a browser, a widget, or consent to
 * a challenge. The browser leg stays as-is — both legs carry the SAME `event_id`,
 * so Meta dedupes them into one Lead (CLAUDE.md #16).
 *
 * Shape deliberately mirrors `lib/crm/server.ts` (background delivery via
 * `waitUntil`, injectable `fetchImpl`, never throws into the request path).
 */

import { logger } from '@/lib/utils/logger';
import type { WaitUntil } from '@/lib/crm/server';

/**
 * ── A SZERVER-LÁB MAGJA A KANONIKUS CSOMAGÉ (F9/3.4, szerver-szelet) ─────────
 *
 * Ami innen ELTŰNT, az nem veszett el: a `readConsentFromCookie`,
 * `readMetaCookies`, `resolveTestEventCode`, `buildConsentSources` és a payload-
 * építő mostantól a vendorolt `soborbo-tracking@6.6.0` szerver-backendjéből jön.
 * Ezek TISZTA függvények — nincs env-, binding- vagy zóna-függésük —, ezért a
 * delegálás kockázata nulla, a haszna viszont az, hogy a szabály egy helyen él.
 *
 * Ami SZÁNDÉKOSAN ITT MARADT, és miért:
 *
 *   `GatewayEnv` / `gatewayBaseUrl` / `isGatewayConfigured` / `sendGatewayConversion`
 *       Ezek a site DEPLOY-KÖTÖTT tényeire épülnek, és a kanonikus alak MÁS:
 *         · a binding neve itt `EVENT_GATEWAY` (wrangler.toml), a kanonikusban `GATEWAY`
 *         · a `TRACKING_GATEWAY_URL` felülírás a kanonikusban NEM létezik
 *         · a kanonikus `isGatewayConfigured` MEGKÖVETELI a bindingot
 *       Egy vak csere itt nem fordítási hibát adna, hanem NÉMA NULLÁT: a
 *       kanonikus küldő `env.GATEWAY`-t keresne, nem találná, és a lead-végpont
 *       továbbra is 200-at adna, miközben a gateway sosem látja az eventet.
 *       Ezek átvétele deploy-koordinációt igényel (binding-átnevezés), nem
 *       kódcserét — ezért külön szelet.
 *
 *   `splitFullName`, `deliverGatewayConversion`, `service`
 *       Nincs kanonikus párjuk. A `service`-t három élő hívási pont küldi
 *       (`save-quote.ts` ×2, `thank-you-callback.astro`); a kanonikus payload-
 *       építő nem ismeri, ezért a burkoló teszi vissza. Két teszt pinneli — az
 *       egyik a DRÓTON, mert a builder-szintű pin egy teljes delegálásnál
 *       zölden hazudna.
 */
import {
  buildGatewayPayload as canonicalBuildGatewayPayload,
  sendGatewayConversion as canonicalSendGatewayConversion,
  type GatewayConversionInput as CanonicalGatewayConversionInput,
  type GatewayEnv as CanonicalGatewayEnv,
} from '@/lib/soborbo-tracking/server/backend/gateway-dispatch';

export {
  readConsentFromCookie,
  readMetaCookies,
  resolveTestEventCode,
  readGa4IdsFromCookie,
  buildConsentSources,
  type GatewayFetcher,
  type ConsentSignal,
  type ConsentState,
  type GatewayEventName,
  type GatewayUserData,
  type GatewayResult,
  type ConsentSourceSnapshot,
  type ConsentSourcesPayload,
} from '@/lib/soborbo-tracking/server/backend/gateway-dispatch';

import type {
  GatewayFetcher,
  GatewayResult,
  GatewayEventName,
} from '@/lib/soborbo-tracking/server/backend/gateway-dispatch';

export interface GatewayEnv {
  /**
   * Service binding to the event-gateway Worker. REQUIRED in production, and not
   * merely an optimisation.
   *
   * A plain `fetch()` to https://painlessremovals.com/api/event/conversion-server
   * DOES NOT REACH THE GATEWAY. That URL is served by a Worker route on our OWN
   * zone, and Cloudflare deliberately does not let a Worker's subrequest re-enter
   * another Worker route on the same zone (loop protection) — the subrequest is
   * short-circuited instead. The lead endpoint still answered 200, the gateway
   * simply never saw the event: a silent zero, the exact failure class this module
   * was written to end.
   *
   * The binding is Worker-to-Worker and bypasses zone routing entirely. We still
   * fetch the site's own absolute URL through it, because the gateway resolves the
   * tenant from the request hostname (CLAUDE.md #14) — the Host must stay
   * painlessremovals.com or the site-config lookup 404s.
   */
  EVENT_GATEWAY?: GatewayFetcher;
  /**
   * Plaintext per-site token. Its SHA-256 lives in the gateway's SITE_CONFIG KV
   * as `crm_token_sha256`. Per-site by design: a leak affects THIS site only —
   * the gateway explicitly refuses the global operator token on this route.
   */
  TRACKING_GATEWAY_TOKEN?: string;
  /**
   * Gateway origin. MUST be a hostname the gateway has a KV site-config for —
   * it routes by `new URL(request.url).hostname` (CLAUDE.md #14). For Painless
   * that is our own apex, which Cloudflare routes to the gateway Worker via the
   * `painlessremovals.com/api/event/*` route. Defaults to SITE_URL.
   */
  TRACKING_GATEWAY_URL?: string;
  SITE_URL?: string;
  /**
   * Synthetic-lead smoke test. A conversion is tagged with
   * `TRACKING_TEST_EVENT_CODE` — landing it in Meta's *Test* stream instead of the
   * live one — ONLY when the lead's email equals `TRACKING_TEST_LEAD_EMAIL`.
   *
   * Keyed on the lead itself, not on a global "test mode" flag, and that is the
   * whole point: a global flag (or the gateway's KV `meta.test_event_code`) also
   * catches every REAL lead that happens to arrive while it is on, quietly routing
   * paying conversions into the Test stream. Keying on the address means real leads
   * can never carry the code, so these two vars are safe to leave set permanently
   * and the chain stays re-testable end-to-end at any time.
   */
  TRACKING_TEST_LEAD_EMAIL?: string;
  TRACKING_TEST_EVENT_CODE?: string;
}



/**
 * A KÖNYVTÁR-VERZIÓ, amit ez a backend jelent a gateway-nek.
 *
 * ── Miért nem kézzel írt szám ────────────────────────────────────────────────
 * Ez a mező a `consent_receipts.client_lib_version`-be megy, és az EGYETLEN
 * gépi jelünk arról, mi fut valójában a site-on. Egy kézzel karbantartott
 * literál pontosan azt a driftet tudná elfedni, amit mérni hivatott — ezért a
 * vendorolt kanonikus magból SZÁRMAZTATJUK. Ha a mag verziója változik, ez
 * együtt mozdul; ha valaki a magot kicseréli, de a számot nem, az lehetetlen.
 *
 * ── Miért NEM `0.0.0-painless-fork` többé ────────────────────────────────────
 * Volt. A fork-jelölő igaz állítás volt, amíg a szerver-láb SAJÁT
 * implementációt futtatott, és szándékosan a gateway `MIN_CLIENT_LIB_VERSION`-je
 * (6.1.0) alatt maradt, hogy valósan kiváltson egy információs `TRK-910-006`-ot.
 *
 * Az F9/3.4 szerver-szelete után ez már nem igaz: a payload-építés, a
 * süti-olvasók, a transzport, a retry-politika és az auth MIND a kanonikus magé.
 *
 * Ami site-lokális maradt, az nem könyvtár-logika:
 *   · `GatewayEnv` — a site env-változóinak NEVEI (a binding itt `EVENT_GATEWAY`)
 *   · `gatewayBaseUrl` / `isGatewayConfigured` — config-politika
 *   · `deliverGatewayConversion` — logging + `waitUntil` burkoló
 *   · `splitFullName` — nincs kanonikus párja
 *   · `toCanonicalEnv` / `toCanonicalInput` — a fenti nevek leképezése
 *
 * Ezért a szám mostantól a magé. A ledger sorai a
 * `NULL → 0.0.0-painless-fork → 6.6.x` úton haladtak — ez a váltás a migráció
 * kívülről, gépileg igazolható jele.
 */
export { BACKEND_LIB_VERSION } from '@/lib/soborbo-tracking/server/backend/gateway-dispatch';
import { BACKEND_LIB_VERSION } from '@/lib/soborbo-tracking/server/backend/gateway-dispatch';






/** Loose fetch shape so test mocks and Node's fetch both assign. */
export type FetchLike = (
  input: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<Response>;





/**
 * A site bemeneti alakja: a kanonikus input + három site-specifikus mező.
 *
 * A `clientId` / `sessionId` a kanonikusban `ga4ClientId` / `ga4SessionId` néven
 * él — ugyanaz a szemantika, más név. A burkoló képezi le őket, hogy az öt
 * hívási pont ne változzon; a régi nevek maradnak a site szerződése.
 */
export interface GatewayConversionInput extends CanonicalGatewayConversionInput {
  /** Lead-gen szolgáltatás-címke. Nincs kanonikus párja — a burkoló adja vissza. */
  service?: string;
  /** A kanonikus `ga4ClientId` régi neve ezen a site-on. */
  clientId?: string;
  /** A kanonikus `ga4SessionId` régi neve ezen a site-on. */
  sessionId?: string;
}


/**
 * A payload-építő a kanonikus magé. Ez a burkoló egyetlen dolgot csinál: a
 * `clientId`/`sessionId` RÉGI NEVEKET a kanonikus `ga4*` nevekre képezi, hogy az
 * öt hívási pont ne változzon.
 *
 * A `service`-t 6.6.2 óta a kanonikus payload-építő maga emitálja — a
 * böngésző-láb eddig is küldte, a gateway fogyasztja, csak a szerver-lábból
 * hiányzott. Innentől nem kell visszatenni.
 *
 * Az érték/pénznem szabálya a KANONIKUSÉ: `value` csak érvényes 3-betűs
 * `currency`-vel megy ki, néma `'GBP'`-alapértelmezés nincs. Minden élő hívó ma
 * is explicit currency-t ad.
 */
export function buildGatewayPayload(input: GatewayConversionInput): Record<string, unknown> {
  return canonicalBuildGatewayPayload(toCanonicalInput(input));
}

/** A site régi mezőnevei → a kanonikus input. */
function toCanonicalInput(input: GatewayConversionInput): CanonicalGatewayConversionInput {
  const { clientId, sessionId, ...rest } = input;
  return {
    ...rest,
    ga4ClientId: rest.ga4ClientId ?? clientId,
    ga4SessionId: rest.ga4SessionId ?? sessionId,
  };
}

/**
 * A SITE ENV → KANONIKUS ENV. Ez a leképezés váltja ki a deploy-koordinációt.
 *
 * Két néven múlt az egész: a service binding itt `EVENT_GATEWAY`
 * (`wrangler.toml`), a kanonikus magban `GATEWAY`. A binding ÁTNEVEZÉSE
 * deployt igényelne, és egy rosszul időzített deploy néma nullát adna — a
 * kanonikus küldő nem találná a bindingot, a lead-végpont továbbra is 200-at
 * adna, a gateway pedig sosem látná az eventet. Egy leképezés a hívás
 * pillanatában ugyanezt megoldja, kockázat nélkül.
 *
 * A `SITE_URL`-be a site `TRACKING_GATEWAY_URL` felülírását is belehajtjuk: a
 * kanonikus `gatewayBaseUrl` csak `SITE_URL`-t néz, tehát enélkül a felülírás
 * némán elveszne.
 */
function toCanonicalEnv(env: GatewayEnv): CanonicalGatewayEnv {
  return {
    ...env,
    GATEWAY: env.EVENT_GATEWAY,
    SITE_URL: gatewayBaseUrl(env),
  };
}

export function gatewayBaseUrl(env: GatewayEnv): string | undefined {
  const raw = env.TRACKING_GATEWAY_URL || env.SITE_URL;
  return raw ? raw.replace(/\/+$/, '') : undefined;
}

export function isGatewayConfigured(env: GatewayEnv): boolean {
  return Boolean(env.TRACKING_GATEWAY_TOKEN && gatewayBaseUrl(env));
}

/**
 * Egyetlen „teljes név" mezőt bont first/last-ra a Meta `fn`/`ln`-jéhez.
 * NYERS értéket küldünk — a gateway az egyetlen normalizáló (CLAUDE.md 1.),
 * tehát a lowercase/trim itt csak egy második, sodródásra hajlamos másolat lenne.
 */
export function splitFullName(full?: string): { first_name?: string; last_name?: string } {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { first_name: parts[0] };
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
}

/**
 * A KÜLDÉS a kanonikus magé (6.6.2): URL, auth-fejléc, retry-politika és a
 * 400/401/403/404 „ez a mi hibánk, ne retry-old" szabály mind onnan jön.
 *
 * Ami itt marad, az a site-specifikus ENV-leképezés (`toCanonicalEnv`) és a
 * régi mezőnevek (`toCanonicalInput`) — semmi több.
 *
 * Egy viselkedés SZÁNDÉKOSAN szigorodott: binding nélkül a kanonikus küldő
 * `gateway_not_configured`-t ad, nem esik vissza `globalThis.fetch`-re. A
 * korábbi fallback on-zone amúgy is NÉMA NULLA volt (a Cloudflare loop-védelme
 * rövidre zárja a saját zónánk route-jára menő subrequestet), csak épp
 * észrevétlenül — a `deliverGatewayConversion` mostantól hangosan logolja.
 */
export async function sendGatewayConversion(
  env: GatewayEnv,
  input: GatewayConversionInput,
  opts: {
    fetchImpl?: FetchLike;
    sleepImpl?: (ms: number) => Promise<void>;
    retryDelaysMs?: number[];
  } = {},
): Promise<GatewayResult> {
  return canonicalSendGatewayConversion(toCanonicalEnv(env), toCanonicalInput(input), {
    ...opts,
    fetchImpl: opts.fetchImpl as unknown as GatewayFetcher['fetch'] | undefined,
  });
}

/**
 * Backgrounds a gateway conversion; safe no-op when the gateway is unconfigured.
 * Never throws — the lead response must not depend on tracking.
 */
export function deliverGatewayConversion(
  env: GatewayEnv,
  waitUntil: WaitUntil | undefined,
  input: GatewayConversionInput,
): void {
  if (!isGatewayConfigured(env)) {
    // Loud on purpose: an unconfigured gateway is exactly the silent-zero state
    // this module exists to end.
    logger.error('GATEWAY', 'Conversion not dispatched — gateway not configured', {
      eventName: input.eventName,
      eventId: input.eventId,
    });
    return;
  }

  const promise = sendGatewayConversion(env, input)
    .then((res) => {
      if (!res.ok) {
        logger.error('GATEWAY', 'Server-side conversion dispatch failed', {
          eventName: input.eventName,
          eventId: input.eventId,
          status: res.status,
          error: res.error,
          retriable: res.retriable,
          attempts: res.attempts,
        });
      }
      return res;
    })
    .catch((err) => {
      logger.error('GATEWAY', 'Server-side conversion dispatch threw', {
        eventName: input.eventName,
        eventId: input.eventId,
        error: err instanceof Error ? err.message : String(err),
      });
    });

  if (waitUntil) {
    waitUntil(promise as Promise<unknown>);
  } else {
    void promise;
  }
}
