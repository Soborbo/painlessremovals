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
  buildConsentSources as canonicalBuildConsentSources,
  resolveTestEventCode,
  type GatewayConversionInput as CanonicalGatewayConversionInput,
  type ConsentSourcesPayload,
  type SboCookieReadOptions,
} from '@/lib/soborbo-tracking/server/backend/gateway-dispatch';

export {
  readConsentFromCookie,
  readMetaCookies,
  resolveTestEventCode,
  readGa4IdsFromCookie,
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
 * SZÁNDÉKOSAN nem a kanonikus `soborbo-tracking` csomag verziószáma: ez a
 * könyvtár a csomag FORKJA (a Serverside `check-vendored-copy` riportja szerint
 * a kiadás 27 fájljából 22 nincs is meg benne). Egy kanonikus-nak látszó
 * verziószám itt HAZUDNA — pont azt a driftet fedné el, amit a
 * `client_lib_version` mérni hivatott.
 *
 * A `0.0.0-` előtag ezért nem kozmetika: a gateway `MIN_CLIENT_LIB_VERSION`-je
 * 6.1.0, tehát ez az érték IGAZ módon vált ki `TRK-910-006`-ot (elavult
 * kliens-lib). Az a megállapítás információs szintű (a napi consent-riport egy
 * sora, nem riasztás) — és pontosan a valóságot mondja: ez a site nem a
 * kanonikus könyvtárat futtatja. Amikor a migráció megtörténik, ez az érték a
 * csomag valódi verziójára vált, és a ledger sorai NULL → `0.0.0-painless-fork`
 * → `6.3.0` úton haladnak. Ez a migráció KÍVÜLRŐL, gépileg igazolható jele.
 */
export const BACKEND_LIB_VERSION = '0.0.0-painless-fork';

/**
 * A CONSENT-FORRÁS TELEMETRIA — kanonikus olvasó, IGAZ verziószámmal.
 *
 * A mag `buildConsentSources`-a a SAJÁT `BACKEND_LIB_VERSION`-jét írja a
 * receiptre (`6.6.1`). Ezen a site-on ez HAZUGSÁG lenne: a payload-építő és a
 * süti-olvasók már a kanonikus magé, de a TRANSZPORT — a `GatewayEnv`, a
 * binding-feloldás és a `sendGatewayConversion` — még a fork. Egy `6.6.1`-es
 * receipt pont azt a maradék driftet fedné el, amit a `client_lib_version`
 * mérni hivatott, ráadásul a legdrágább helyen: a küldő-úton él a néma nulla.
 *
 * Ezért a burkoló visszaírja a site igaz értékét. Ez a szám akkor vált
 * `6.6.1`-re, amikor a transzport is átment — az a lépés deploy-koordinációt
 * igényel (a binding neve `EVENT_GATEWAY` ↔ `GATEWAY`), nem kódcserét.
 */
export function buildConsentSources(
  cookieHeader: string | null | undefined,
  opts: SboCookieReadOptions = {},
): ConsentSourcesPayload {
  return {
    ...canonicalBuildConsentSources(cookieHeader, opts),
    client_lib_version: BACKEND_LIB_VERSION,
  };
}





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
 * A payload-építő a kanonikus magé; ez a burkoló csak a site-specifikus
 * kiegészítést végzi:
 *   · a `clientId`/`sessionId` régi neveket a kanonikus `ga4*` nevekre képezi,
 *   · a `service`-t visszateszi a payloadra (a kanonikus nem ismeri).
 *
 * Az érték/pénznem szabálya ezzel a KANONIKUSÉ lett: `value` csak akkor megy ki,
 * ha van hozzá 3-betűs `currency` is — a korábbi néma `'GBP'`-alapértelmezés
 * megszűnt. Minden élő hívási pont ma is explicit currency-t ad, tehát ez nem
 * változtat kimenő konverziót; a szigorítás célja, hogy egy másik piacra másolt
 * modul ne küldjön csendben rossz pénznemet.
 */
export function buildGatewayPayload(input: GatewayConversionInput): Record<string, unknown> {
  const { service, clientId, sessionId, ...rest } = input;
  const payload = canonicalBuildGatewayPayload({
    ...rest,
    ga4ClientId: rest.ga4ClientId ?? clientId,
    ga4SessionId: rest.ga4SessionId ?? sessionId,
  });
  if (service) payload.service = service;
  return payload;
}

const DEFAULT_RETRY_DELAYS_MS = [1000, 5000];
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function gatewayBaseUrl(env: GatewayEnv): string | undefined {
  const raw = env.TRACKING_GATEWAY_URL || env.SITE_URL;
  return raw ? raw.replace(/\/+$/, '') : undefined;
}

export function isGatewayConfigured(env: GatewayEnv): boolean {
  return Boolean(env.TRACKING_GATEWAY_TOKEN && gatewayBaseUrl(env));
}

/**
 * Splits a single "full name" field into first/last for Meta's `fn`/`ln`.
 * We send RAW values — the gateway is the single normalizer (CLAUDE.md #1), so
 * lowercasing/trimming here would just be a second, drift-prone copy of it.
 */
export function splitFullName(full?: string): { first_name?: string; last_name?: string } {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { first_name: parts[0] };
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
}



export async function sendGatewayConversion(
  env: GatewayEnv,
  input: GatewayConversionInput,
  opts: {
    fetchImpl?: FetchLike;
    sleepImpl?: (ms: number) => Promise<void>;
    retryDelaysMs?: number[];
  } = {},
): Promise<GatewayResult> {
  const base = gatewayBaseUrl(env);
  if (!env.TRACKING_GATEWAY_TOKEN || !base) {
    return { ok: false, error: 'gateway_not_configured', retriable: false, attempts: 0 };
  }

  // Service binding first — see GatewayEnv.EVENT_GATEWAY. The global-fetch fallback
  // only works from OFF-zone callers; on-zone it silently never reaches the gateway.
  const fetchImpl =
    opts.fetchImpl ??
    (env.EVENT_GATEWAY
      ? (((url, init) => env.EVENT_GATEWAY!.fetch(url, init as RequestInit)) as FetchLike)
      : ((globalThis.fetch as unknown) as FetchLike));
  const sleepImpl = opts.sleepImpl ?? defaultSleep;
  const delays = opts.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;

  // NOT `/api/event/conversion` — that is the BROWSER path, and it is the one the
  // zone's WAF rate-limiting rule matches (on the Free plan a rule can only match
  // on Path, so this separate route is the only way to exempt us). Server-side
  // conversions all leave from a single Worker egress IP, so an IP-keyed limit
  // would throttle exactly the conversions that carry money.
  //
  // The gateway refuses this route without a valid per-site token — no browser
  // fallback — so the exemption cannot be abused as a rate-limit bypass.
  const url = `${base}/api/event/conversion-server`;
  const body = JSON.stringify(
    buildGatewayPayload({
      ...input,
      testEventCode: input.testEventCode ?? resolveTestEventCode(env, input.userData?.email),
    }),
  );
  const headers = {
    'content-type': 'application/json',
    'x-admin-token': env.TRACKING_GATEWAY_TOKEN,
  };

  let attempts = 0;
  let lastError = 'unknown';
  let lastStatus: number | undefined;

  for (let i = 0; i <= delays.length; i++) {
    attempts++;
    try {
      const res = await fetchImpl(url, { method: 'POST', headers, body });
      lastStatus = res.status;

      // The gateway answers 204 on every accepted event (CLAUDE.md #12).
      if (res.status === 204 || (res.status >= 200 && res.status < 300)) {
        return { ok: true, status: res.status, attempts };
      }

      // 400/401/403/404 are OUR misconfiguration (invalid payload since the
      // gateway Run 6 returns 400 to authenticated callers, bad token, no KV
      // site-config), not a transient fault. Retrying cannot fix them — fail
      // loud instead, so the failure is visible rather than silently swallowed
      // like the browser leg used to do.
      if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) {
        return {
          ok: false,
          status: res.status,
          error: `gateway_rejected_${res.status}`,
          retriable: false,
          attempts,
        };
      }

      lastError = `gateway_status_${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    if (i < delays.length) await sleepImpl(delays[i]);
  }

  return { ok: false, status: lastStatus, error: lastError, retriable: true, attempts };
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
