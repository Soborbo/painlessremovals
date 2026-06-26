/**
 * event-gateway client contract.
 *
 * Builds the request payload for the first-party server-side tagging
 * gateway (the `event-gateway` Worker, `POST /api/event/conversion`).
 * The gateway fans a single conversion out to GA4 (Measurement Protocol),
 * Meta (CAPI) and Google Ads (Enhanced Conversions for Leads — matched on
 * hashed email/phone, NOT gclid). It hashes `user_data` server-side, so we
 * send RAW PII over HTTPS to our own first-party endpoint and never hash
 * on the client.
 *
 * The shape + validation here MIRROR event-gateway/src/types.ts
 * (`isValidConversionPayload` + `ALLOWED_EVENT_NAMES`). The contract test
 * locks them in lockstep — if the gateway's rules change, update BOTH.
 */

import { generateUUID } from './uuid';
import type { UserData } from './tracking';

/** Mirror of the gateway's ALLOWED_EVENT_NAMES. */
export const GATEWAY_EVENT_NAMES = new Set<string>([
  'quote_calculator_conversion',
  'callback_conversion',
  'contact_form_submit',
  'phone_conversion',
  'email_conversion',
  'whatsapp_conversion',
  'quote_calculator_first_view',
  'video_play',
]);

/**
 * The website's internal conversion event names don't all match the
 * gateway's vocabulary:
 *   - the gateway calls the contact event `contact_form_submit`, not
 *     `contact_form_conversion`;
 *   - the gateway has no clearance-specific event — a clearance callback
 *     is just a `callback_conversion` (maps to the same "Callback
 *     requested" Ads action).
 */
export const WEBSITE_TO_GATEWAY_EVENT: Record<string, string> = {
  contact_form_conversion: 'contact_form_submit',
  clearance_callback_conversion: 'callback_conversion',
};

export function toGatewayEventName(name: string): string {
  return WEBSITE_TO_GATEWAY_EVENT[name] ?? name;
}

// Mirrors of the gateway constants (event-gateway/src/types.ts).
const MAX_EVENT_ID_LENGTH = 60;
const MIN_EVENT_TIME = 1_500_000_000; // unix seconds
const MAX_VALUE = 1_000_000_000;
const EVENT_ID_RE = /^[a-zA-Z0-9_-]+$/;

export interface GatewayConversionInput {
  /** Website-side event name; mapped to the gateway vocabulary. */
  eventName: string;
  /** Dedup key shared with the client pixel. Generated if absent/invalid. */
  eventId?: string;
  /** Event time in MILLISECONDS (Date.now()). Converted to seconds. */
  eventTimeMs?: number;
  /** Cloudflare Turnstile token — REQUIRED by the gateway. */
  turnstileToken: string;
  value?: number;
  currency?: string;
  service?: string;
  source?: string;
  eventSourceUrl?: string;
  /** GA4 client_id (from the _ga cookie) so server hits attribute correctly. */
  clientId?: string;
  /** Meta browser cookies. */
  fbp?: string;
  fbc?: string;
  /** RAW PII — the gateway hashes it server-side for Meta + Google Ads EC. */
  userData?: UserData;
}

export interface GatewayConversionPayload {
  event_name: string;
  event_id: string;
  event_time: number; // unix seconds
  turnstile_token: string;
  value?: number;
  currency?: string;
  service?: string;
  source?: string;
  event_source_url?: string;
  client_id?: string;
  fbp?: string;
  fbc?: string;
  user_data?: UserData;
}

/**
 * Assembles a payload guaranteed to satisfy the gateway's
 * `isValidConversionPayload`. event_time is floored to seconds; value is
 * clamped to the gateway's [0, MAX_VALUE] range; a fresh event_id is minted
 * if the caller's is missing or fails the gateway's character/length rule.
 */
export function buildGatewayConversionPayload(
  input: GatewayConversionInput,
): GatewayConversionPayload {
  const event_id =
    typeof input.eventId === 'string' &&
    input.eventId.length > 0 &&
    input.eventId.length <= MAX_EVENT_ID_LENGTH &&
    EVENT_ID_RE.test(input.eventId)
      ? input.eventId
      : generateUUID();

  const event_time = Math.floor((input.eventTimeMs ?? Date.now()) / 1000);

  const payload: GatewayConversionPayload = {
    event_name: toGatewayEventName(input.eventName),
    event_id,
    event_time,
    turnstile_token: input.turnstileToken,
  };

  if (typeof input.value === 'number' && Number.isFinite(input.value)) {
    payload.value = Math.min(Math.max(input.value, 0), MAX_VALUE);
  }
  if (input.currency) payload.currency = input.currency;
  if (input.service) payload.service = input.service;
  if (input.source) payload.source = input.source;
  if (input.eventSourceUrl) payload.event_source_url = input.eventSourceUrl;
  if (input.clientId) payload.client_id = input.clientId;
  if (input.fbp) payload.fbp = input.fbp;
  if (input.fbc) payload.fbc = input.fbc;
  if (input.userData && Object.keys(input.userData).length > 0) {
    payload.user_data = input.userData;
  }

  return payload;
}

/**
 * Local re-implementation of the gateway's `isValidConversionPayload`.
 * Used by the contract test to prove the website never builds a payload the
 * gateway would 4xx. Keep in lockstep with event-gateway/src/types.ts.
 */
export function isValidGatewayPayload(p: unknown): boolean {
  if (typeof p !== 'object' || p === null) return false;
  const o = p as Record<string, unknown>;
  if (typeof o.event_name !== 'string' || !GATEWAY_EVENT_NAMES.has(o.event_name)) return false;
  if (
    typeof o.event_id !== 'string' ||
    o.event_id.length === 0 ||
    o.event_id.length > MAX_EVENT_ID_LENGTH ||
    !EVENT_ID_RE.test(o.event_id)
  ) {
    return false;
  }
  if (
    typeof o.event_time !== 'number' ||
    !Number.isFinite(o.event_time) ||
    o.event_time < MIN_EVENT_TIME ||
    o.event_time > Math.floor(Date.now() / 1000) + 600
  ) {
    return false;
  }
  if (typeof o.turnstile_token !== 'string') return false;
  if (
    o.value !== undefined &&
    (typeof o.value !== 'number' || !Number.isFinite(o.value) || o.value < 0 || o.value > MAX_VALUE)
  ) {
    return false;
  }
  return true;
}
