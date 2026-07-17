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

/** Minimal shape of a Cloudflare service binding (Fetcher). */
export interface GatewayFetcher {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
}

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
 * Returns the Meta test-event code iff this lead is the designated synthetic one.
 * Case/whitespace-insensitive: the address is typed into a real form by hand.
 */
export function resolveTestEventCode(env: GatewayEnv, email?: string): string | undefined {
  const marker = env.TRACKING_TEST_LEAD_EMAIL?.trim().toLowerCase();
  const code = env.TRACKING_TEST_EVENT_CODE?.trim();
  if (!marker || !code || !email) return undefined;
  return email.trim().toLowerCase() === marker ? code : undefined;
}

/**
 * Consent Mode v2 state from the CookieYes cookie — the SAME source, and the same
 * mapping, the browser lib uses (`worker-tracking.ts` `getConsentState`). Reading
 * it server-side means the two legs always agree about the user's choice.
 *
 * CookieYes format:
 *   consentid:..,consent:yes,necessary:yes,analytics:yes,advertisement:yes,...
 * Mapping (CookieYes official):
 *   advertisement → ad_storage + ad_user_data + ad_personalization
 *   analytics     → analytics_storage
 *
 * Returns undefined when the cookie is absent or is not a CookieYes cookie — we do
 * NOT guess. The gateway then applies `require_consent`, and the consent-receipt it
 * writes carries no explicit signal, which downstream (offline lead-status upload)
 * is never treated as consent evidence.
 */
export function readConsentFromCookie(cookieHeader: string | null): ConsentState | undefined {
  if (!cookieHeader) return undefined;

  let raw: string | undefined;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === 'cookieyes-consent') {
      try {
        raw = decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        // Malformed percent-encoding (e.g. a truncated `%` sequence) throws
        // URIError — a bad cookie must degrade to "no explicit signal", never
        // 500 the lead endpoint that carries it.
        return undefined;
      }
      break;
    }
  }
  if (!raw) return undefined;

  const map: Record<string, string> = {};
  for (const part of raw.split(',')) {
    const idx = part.indexOf(':');
    if (idx > 0) map[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  if (map.advertisement === undefined && map.analytics === undefined) return undefined;

  const sig = (yes: boolean): ConsentSignal => (yes ? 'GRANTED' : 'DENIED');
  const adGranted = map.advertisement === 'yes';
  return {
    ad_user_data: sig(adGranted),
    ad_personalization: sig(adGranted),
    ad_storage: sig(adGranted),
    analytics_storage: sig(map.analytics === 'yes'),
  };
}

/** Loose fetch shape so test mocks and Node's fetch both assign. */
export type FetchLike = (
  input: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<Response>;

/** Canonical gateway event names (see Serverside `src/events.json`). */
export type GatewayEventName =
  | 'quote_calculator_submitted'
  | 'callback_request_submitted'
  | 'contact_form_submitted';

export type ConsentSignal = 'GRANTED' | 'DENIED';

export interface ConsentState {
  ad_user_data: ConsentSignal;
  ad_personalization: ConsentSignal;
  ad_storage: ConsentSignal;
  analytics_storage: ConsentSignal;
}

export interface GatewayUserData {
  email?: string;
  phone_number?: string;
  first_name?: string;
  last_name?: string;
  city?: string;
  postal_code?: string;
  country?: string;
}

export interface GatewayConversionInput {
  eventName: GatewayEventName;
  /**
   * MUST be the same id the browser used for this conversion (the one that goes
   * to the Meta Pixel via the dataLayer). A different id here does not "add" a
   * conversion — it DOUBLE-COUNTS the Lead, because Meta dedupes on the
   * (event_name, event_id) pair.
   */
  eventId: string;
  /** Stable CRM-side lead key, so the gateway ledger row joins the CRM lead. */
  leadId?: string;
  value?: number;
  currency?: string;
  service?: string;
  source?: string;
  userData?: GatewayUserData;
  /** Click IDs + UTMs already lifted out of the calculator state. */
  attribution?: Record<string, string | undefined>;
  /**
   * Consent Mode v2 state read from the CookieYes cookie on the inbound request
   * (`readConsentFromCookie`). Without it the gateway falls back to the site's
   * `require_consent` default, and the consent-receipt it writes for the lead
   * carries NO explicit signal — which the offline lead-status loop refuses to
   * treat as consent evidence. Sending the real signal is what makes the later
   * Enhanced-Conversions upload provably lawful.
   */
  consent?: ConsentState;
  clientId?: string;
  sessionId?: string;
  eventSourceUrl?: string;
  /**
   * The REAL end-user's IP/UA, read from the inbound request headers. Without
   * these the gateway would attribute the conversion to our own Worker's egress
   * IP/UA — wrong geo and a measurably worse Meta EMQ.
   */
  clientIpAddress?: string;
  clientUserAgent?: string;
  /**
   * Meta Test-stream override, honoured by the gateway only on the authenticated
   * server ingress. Resolved from the lead's email — see `resolveTestEventCode`.
   */
  testEventCode?: string;
}

export interface GatewayResult {
  ok: boolean;
  status?: number;
  error?: string;
  retriable?: boolean;
  attempts: number;
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

/** Drops undefined/empty entries so we never ship empty strings as PII. */
function compact(obj: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  return out;
}

export function buildGatewayPayload(input: GatewayConversionInput): Record<string, unknown> {
  // CLAUDE.md #3: never send `value: 0` — Meta logs it as a real value and it
  // skews ROAS. Omit value AND currency together when there is no money value.
  const hasValue = typeof input.value === 'number' && Number.isFinite(input.value) && input.value > 0;

  const userData = input.userData ? compact(input.userData) : undefined;
  const attribution = input.attribution ? compact(input.attribution) : undefined;

  return compact({
    event_name: input.eventName,
    event_id: input.eventId,
    event_time: Math.floor(Date.now() / 1000),
    lead_id: input.leadId,
    ...(hasValue ? { value: input.value, currency: input.currency || 'GBP' } : {}),
    service: input.service,
    source: input.source,
    user_data: userData && Object.keys(userData).length > 0 ? userData : undefined,
    attribution: attribution && Object.keys(attribution).length > 0 ? attribution : undefined,
    consent: input.consent,
    client_id: input.clientId,
    session_id: input.sessionId,
    event_source_url: input.eventSourceUrl,
    client_ip_address: input.clientIpAddress,
    client_user_agent: input.clientUserAgent,
    test_event_code: input.testEventCode,
    // NOTE: no `turnstile_token`. There is no browser in this call path; the
    // per-site X-Admin-Token is what authorises us past the Turnstile gate.
  });
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
