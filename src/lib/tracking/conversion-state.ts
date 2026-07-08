/**
 * Quote conversion — fires once, immediately on completion.
 *
 * This used to be a 60-minute "upgrade window" state machine
 * (localStorage blob + BroadcastChannel + resumable timers): the quote
 * conversion fired late, or was consumed by a higher-intent action.
 * In practice most visitors closed the tab before the window elapsed
 * and no client-side timer survives a closed browser, so the conversion
 * almost never fired — Google Ads recorded ONE "Quote calculator
 * finished" conversion in 14 weeks against ~20 real completions a week.
 *
 * The model now: completing the calculator IS the conversion.
 * `fireQuoteConversion` fires inline on the results page (while the GTM
 * tags still have a live page under them), and phone / email / whatsapp
 * / callback remain their own conversion events — GA4 and Google Ads
 * treat them as distinct actions, so no upgrade bookkeeping is needed.
 * The only state kept is a fired-guard (so a refresh / retry / second
 * tab can't fire the same quote twice) and a completion timestamp used
 * purely as a reporting label (`source: after_calculator`) on
 * subsequent clicks.
 */

import { readUserDataFromDOM, trackEvent } from './tracking';
import { dispatchWorkerConversion } from './worker-dispatch';
import {
  CURRENCY,
  QUOTE_COMPLETED_AT_KEY,
  QUOTE_SOURCE_LABEL_WINDOW_MS,
  QUOTE_STATE_KEY,
  VIEW_CONTENT_FIRED_KEY,
} from './config';

// Records the event_id of the quote conversion that already fired, so a
// results-page refresh, the save-quote retry path, or a second tab can't
// fire a second `quote_calculator_conversion` for the same quote (GA4 +
// Google Ads dedup on the dataLayer push far more weakly than Meta's
// event_id-based CAPI dedup). Key format predates the simplification —
// keep it so quotes fired under the old state machine stay deduped.
const QUOTE_FIRED_KEY = `${QUOTE_STATE_KEY}:fired`;

function hasFired(eventId: string): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(QUOTE_FIRED_KEY) === eventId;
  } catch {
    return false;
  }
}

function markFired(eventId: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(QUOTE_FIRED_KEY, eventId);
  } catch {
    // ignore
  }
}

/**
 * Fires `quote_calculator_conversion` for a completed quote — browser
 * dataLayer push (GTM → GA4 + Google Ads + Meta Pixel) and the
 * server-side Meta CAPI leg via the event-gateway Worker, sharing one
 * `event_id` so Meta dedupes browser + server.
 *
 * Pass the SAME `eventId` that went to save-quote so every hit for this
 * completion (server GA4 MP mirror, browser engagement event, this
 * conversion, CAPI mirror) shares one dedup/join key.
 *
 * Idempotent per eventId: refreshes and retries no-op.
 */
export function fireQuoteConversion(input: {
  value: number;
  currency?: string;
  service: string;
  eventId: string;
}): void {
  if (hasFired(input.eventId)) return;
  markFired(input.eventId);

  const currency = input.currency || CURRENCY;

  trackEvent('quote_calculator_conversion', {
    event_id: input.eventId,
    value: input.value,
    currency,
    service: input.service,
  });

  // Server-side leg: the Soborbo Worker (Meta CAPI), same event_id as the
  // dataLayer push above for dedup. user_data comes from the hidden DOM
  // side-channel the caller populated just before this.
  dispatchWorkerConversion('quote_calculator_conversion', input.eventId, {
    value: input.value,
    currency,
    service: input.service,
    userData: readUserDataFromDOM(),
  });

  // Reporting breadcrumb for subsequent phone/email/whatsapp/callback
  // clicks (`source: after_calculator`). Label only — no dedup logic
  // hangs off this.
  try {
    localStorage.setItem(QUOTE_COMPLETED_AT_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

/**
 * True when a quote was completed in this browser recently. Used ONLY to
 * label subsequent conversions (`source: after_calculator` vs
 * `standalone`) for reporting — it gates no firing decisions.
 */
export function wasQuoteCompletedRecently(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(QUOTE_COMPLETED_AT_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    return Number.isFinite(ts) && Date.now() - ts <= QUOTE_SOURCE_LABEL_WINDOW_MS;
  } catch {
    return false;
  }
}

/**
 * Removes the retired upgrade-window state blob left behind by the old
 * state machine. Called once per page-load from boot. Safe to remove
 * after a few weeks in production.
 */
export function cleanupLegacyQuoteState(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(QUOTE_STATE_KEY);
  } catch {
    // ignore
  }
}

export function hasViewContentFired(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(VIEW_CONTENT_FIRED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markViewContentFired(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(VIEW_CONTENT_FIRED_KEY, '1');
  } catch {
    // ignore
  }
}
