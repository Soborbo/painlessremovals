/**
 * Browser → event-gateway conversion dispatch.
 *
 * Official Sprint-9 design (Serverside/09-sprint-astro-painless.md), adapted
 * to this codebase: it reuses `gateway.ts` for the payload contract (single
 * source of truth) and `uuid.ts` for ids. An invisible Cloudflare Turnstile
 * widget mints a token (cached ~4 min, so there's no per-event latency); the
 * conversion is POSTed to the same-origin `/api/event/conversion` route which
 * Cloudflare routes to the event-gateway Worker. The gateway hashes the raw
 * `user_data` server-side and fans out to GA4 (MP) + Meta (CAPI) + Google Ads
 * (Enhanced Conversions for Leads).
 *
 * Gated by `PUBLIC_GATEWAY_ENABLED` — OFF until the route + KV config + Ads
 * OAuth are provisioned, so this is inert (no network, no Turnstile) in
 * shadow until we flip it on.
 */

import { generateUUID } from './uuid';
import { buildGatewayConversionPayload, isValidGatewayPayload } from './gateway';
import type { UserData } from './tracking';

const GATEWAY_ENDPOINT = '/api/event/conversion';
const TOKEN_TTL_MS = 4 * 60 * 1000;
const TOKEN_TIMEOUT_MS = 10_000;
const TURNSTILE_CONTAINER_ID = 'cf-turnstile-invisible';

interface TurnstileOptions {
  sitekey: string;
  callback?: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
  size?: 'normal' | 'compact' | 'invisible';
  appearance?: 'always' | 'execute' | 'interaction-only';
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: TurnstileOptions) => string;
      reset: (widgetId?: string) => void;
      execute: (container?: string | HTMLElement) => void;
      getResponse: (widgetId?: string) => string | undefined;
    };
  }
}

/**
 * Shadow flag. While false the dispatch is fully inert — no Turnstile
 * execution, no network — so the code can ship and be wired into the
 * conversion fire points without affecting production until provisioned.
 */
export function isGatewayEnabled(): boolean {
  try {
    return import.meta.env.PUBLIC_GATEWAY_ENABLED === 'true';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Turnstile token (invisible widget, cached)
// ---------------------------------------------------------------------------

let cachedToken: string | undefined;
let cachedTokenExpiresAt = 0;
let widgetId: string | undefined;
let pendingResolver:
  | { resolve: (v: string | undefined) => void; timeout: ReturnType<typeof setTimeout> }
  | undefined;

export function __resetTurnstileCacheForTests(): void {
  cachedToken = undefined;
  cachedTokenExpiresAt = 0;
  widgetId = undefined;
  if (pendingResolver) {
    clearTimeout(pendingResolver.timeout);
    pendingResolver = undefined;
  }
}

export async function getTurnstileToken(): Promise<string | undefined> {
  if (cachedToken && Date.now() < cachedTokenExpiresAt) return cachedToken;
  if (typeof window === 'undefined' || !window.turnstile) {
    console.warn('[tracking] Turnstile not loaded');
    return undefined;
  }

  return new Promise((resolve) => {
    const container = document.getElementById(TURNSTILE_CONTAINER_ID);
    if (!container) {
      console.warn('[tracking] Turnstile container not found');
      resolve(undefined);
      return;
    }

    // Supersede any in-flight challenge.
    if (pendingResolver) {
      clearTimeout(pendingResolver.timeout);
      pendingResolver.resolve(undefined);
    }
    const timeout = setTimeout(() => {
      if (pendingResolver) {
        const r = pendingResolver;
        pendingResolver = undefined;
        console.warn('[tracking] Turnstile timeout');
        r.resolve(undefined);
      }
    }, TOKEN_TIMEOUT_MS);
    pendingResolver = { resolve, timeout };

    const onToken = (token: string) => {
      if (!pendingResolver) return;
      const r = pendingResolver;
      pendingResolver = undefined;
      clearTimeout(r.timeout);
      cachedToken = token;
      cachedTokenExpiresAt = Date.now() + TOKEN_TTL_MS;
      r.resolve(token);
    };
    const onError = () => {
      if (!pendingResolver) return;
      const r = pendingResolver;
      pendingResolver = undefined;
      clearTimeout(r.timeout);
      r.resolve(undefined);
    };

    if (widgetId !== undefined) {
      window.turnstile!.reset(widgetId);
      window.turnstile!.execute(container);
    } else {
      widgetId = window.turnstile!.render(container, {
        sitekey: import.meta.env.PUBLIC_TURNSTILE_SITE_KEY,
        size: 'invisible',
        callback: onToken,
        'error-callback': onError,
      });
      window.turnstile!.execute(container);
    }
  });
}

// ---------------------------------------------------------------------------
// Browser signal extraction
// ---------------------------------------------------------------------------

function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : undefined;
}

/** GA4 `_ga` cookie is `GA1.1.<clientId1>.<clientId2>` → `clientId1.clientId2`. */
export function extractGAClientId(gaCookie: string | undefined): string | undefined {
  if (!gaCookie) return undefined;
  const parts = gaCookie.split('.');
  return parts.length >= 4 ? `${parts[2]}.${parts[3]}` : undefined;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export interface GatewayDispatchInput {
  /** Website event name (mapped to the gateway vocabulary by gateway.ts). */
  eventName: string;
  /** Dedup key — share the SAME id with the existing client pixel / dataLayer. */
  eventId?: string;
  value?: number;
  currency?: string;
  service?: string;
  source?: string;
  eventSourceUrl?: string;
  /** RAW PII (from the DOM side-channel). Hashed server-side by the gateway. */
  userData?: UserData;
}

/**
 * Transport only — assembles the gateway payload (adding Turnstile token +
 * fbp/fbc/client_id from cookies) and beacons it. Does NOT touch the
 * dataLayer, so it can run alongside the existing client tracking in shadow
 * without double-pushing. Returns true if the beacon was queued/sent.
 */
export async function sendToGateway(input: GatewayDispatchInput): Promise<boolean> {
  if (!isGatewayEnabled()) return false;

  const turnstileToken = await getTurnstileToken();
  if (!turnstileToken) {
    console.warn('[tracking] No Turnstile token — skipping gateway dispatch:', input.eventName);
    return false;
  }

  const payload = buildGatewayConversionPayload({
    eventName: input.eventName,
    eventId: input.eventId,
    value: input.value,
    currency: input.currency,
    service: input.service,
    source: input.source,
    eventSourceUrl: input.eventSourceUrl || (typeof location !== 'undefined' ? location.href : undefined),
    turnstileToken,
    fbp: getCookie('_fbp'),
    fbc: getCookie('_fbc'),
    clientId: extractGAClientId(getCookie('_ga')),
    userData: input.userData,
  });

  // Belt-and-braces: never POST something the gateway would 4xx.
  if (!isValidGatewayPayload(payload)) {
    console.warn('[tracking] Built an invalid gateway payload — skipping:', input.eventName);
    return false;
  }

  const body = JSON.stringify(payload);

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon(GATEWAY_ENDPOINT, blob)) return true;
    } catch {
      // fall through to fetch
    }
  }

  try {
    await fetch(GATEWAY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    });
    return true;
  } catch (err) {
    console.warn('[tracking] gateway fetch failed', err);
    return false;
  }
}

/**
 * Full fire: pushes the (PII-free) event to the dataLayer for Meta browser-
 * side dedup AND dispatches to the gateway. Use this at CUTOVER, when this
 * replaces the existing client push. During shadow, call `sendToGateway`
 * directly with the existing `event_id` so the dataLayer isn't double-pushed.
 * Returns the event_id used.
 */
export async function trackConversion(
  eventName: string,
  params: GatewayDispatchInput = { eventName: '' },
): Promise<string> {
  const eventId = params.eventId || generateUUID();

  if (typeof window !== 'undefined') {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: eventName,
      event_id: eventId,
      ...(params.value !== undefined && { value: params.value }),
      ...(params.currency && { currency: params.currency }),
      ...(params.source && { source: params.source }),
      ...(params.service && { service: params.service }),
    });
  }

  await sendToGateway({ ...params, eventName, eventId });
  return eventId;
}
