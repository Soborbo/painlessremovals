/**
 * Quote conversion state machine.
 *
 * The "upgrade window" model: when a user finishes the calculator we don't
 * fire `quote_calculator_conversion` immediately. Instead we record the
 * quote in localStorage with a timer. If the user takes a higher-intent
 * action (phone/email/whatsapp click, callback form submit) within the
 * window, that action becomes the conversion and the quote state is
 * marked as upgraded — so we never count both. If the window elapses
 * without an upgrade, we fire `quote_calculator_conversion` as a late
 * conversion the next time the user is on a page (or in-tab if the timer
 * is still alive).
 *
 * Why localStorage and not sessionStorage: sessionStorage dies when the
 * tab closes, and a non-trivial fraction of users complete the calculator
 * and close the tab before either upgrading or hitting the 60-min mark.
 * localStorage survives that. Cross-tab races are handled with
 * BroadcastChannel.
 */

import { clearUserDataOnDOM, readUserDataFromDOM, trackEvent } from './tracking';
import { dispatchWorkerConversion } from './worker-dispatch';
import { generateUUID } from './uuid';
import {
  CURRENCY,
  QUOTE_LATE_CATCHUP_MS,
  QUOTE_STATE_CHANNEL,
  QUOTE_STATE_KEY,
  QUOTE_UPGRADE_WINDOW_MS,
  VIEW_CONTENT_FIRED_KEY,
} from './config';

export interface QuoteState {
  value: number;
  currency: string;
  service: string;
  completedAt: number;
  eventId: string;
  upgraded: boolean;
}

let pendingTimerId: ReturnType<typeof setTimeout> | null = null;
let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!channel) {
    try {
      channel = new BroadcastChannel(QUOTE_STATE_CHANNEL);
      channel.addEventListener('message', (e) => {
        // Either another tab consumed the quote (upgrade) or already fired the
        // late conversion — in both cases this tab must NOT also fire.
        if (e.data === 'upgraded' || e.data === 'fired') clearPendingTimer();
      });
    } catch {
      channel = null;
    }
  }
  return channel;
}

function broadcast(message: 'upgraded' | 'fired'): void {
  getChannel()?.postMessage(message);
}

// Records the event_id of the quote conversion that has already fired, so a
// concurrent tab / timer / catch-up reload can't fire a second
// `quote_calculator_conversion` for the same quote (GA4 + Google Ads dedup on
// the dataLayer push far more weakly than Meta's event_id-based CAPI dedup).
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

function clearPendingTimer(): void {
  if (pendingTimerId !== null) {
    clearTimeout(pendingTimerId);
    pendingTimerId = null;
  }
}

function isValidState(v: unknown): v is QuoteState {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.value === 'number' && Number.isFinite(s.value) &&
    typeof s.currency === 'string' && s.currency.length > 0 &&
    typeof s.service === 'string' && s.service.length > 0 &&
    typeof s.completedAt === 'number' && Number.isFinite(s.completedAt) &&
    typeof s.eventId === 'string' && s.eventId.length > 0 &&
    typeof s.upgraded === 'boolean'
  );
}

function readState(): QuoteState | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(QUOTE_STATE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidState(parsed)) {
      // Schema drift (e.g. older calc deployed an extra field, or a hostile
      // extension wrote junk). Drop instead of crashing.
      try { localStorage.removeItem(QUOTE_STATE_KEY); } catch { /* ignore */ }
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeState(state: QuoteState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(QUOTE_STATE_KEY, JSON.stringify(state));
  } catch {
    // localStorage full or disabled — silently degrade
  }
}

function deleteState(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(QUOTE_STATE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Called from the calculator's success handler to start a fresh upgrade
 * window. Resets the timer and event_id.
 *
 * The `viewContentFired` flag lives in its own localStorage key
 * (`VIEW_CONTENT_FIRED_KEY`) so re-running the calculator (which calls
 * `deleteState()` and then `resetQuoteState()`) doesn't refire Meta's
 * ViewContent.
 *
 * `eventId` is optional — passing it lets the caller share a dedup key
 * with a server-side mirror that was fired earlier (e.g. save-quote.ts
 * receiving event_id in its body). When omitted, a fresh UUID is
 * generated.
 */
export function resetQuoteState(input: {
  value: number;
  currency?: string;
  service: string;
  eventId?: string;
}): QuoteState {
  clearPendingTimer();

  const state: QuoteState = {
    value: input.value,
    currency: input.currency || CURRENCY,
    service: input.service,
    completedAt: Date.now(),
    eventId: input.eventId || generateUUID(),
    upgraded: false,
  };
  writeState(state);
  pendingTimerId = setTimeout(
    () => fireQuoteConversionIfStillActive(false),
    QUOTE_UPGRADE_WINDOW_MS,
  );
  return state;
}

export function hasViewContentFired(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(VIEW_CONTENT_FIRED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Returns the live state if and only if it's within the upgrade window
 * AND has not already been upgraded. Used by global click handlers to
 * decide whether a phone/email/whatsapp click counts as an upgrade vs a
 * standalone conversion.
 */
export function getActiveQuoteState(): QuoteState | null {
  const state = readState();
  if (!state || state.upgraded) return null;
  if (Date.now() - state.completedAt > QUOTE_UPGRADE_WINDOW_MS) return null;
  return state;
}

/**
 * True when a quote conversion is still pending — a saved, non-upgraded
 * state that hasn't fired and is within the upgrade window OR the late
 * catch-up grace period (i.e. `resumeQuoteTimer` might still fire it on this
 * page-load). Used to decide whether the hidden PII side-channel needs
 * rehydrating: if nothing is pending, we don't expose PII on the page at all.
 */
export function hasPendingQuoteConversion(): boolean {
  const state = readState();
  if (!state || state.upgraded || hasFired(state.eventId)) return false;
  const elapsed = Date.now() - state.completedAt;
  return elapsed <= QUOTE_UPGRADE_WINDOW_MS + QUOTE_LATE_CATCHUP_MS;
}

/**
 * Marks the active quote as upgraded — i.e. its conversion has been
 * counted by a higher-intent event already, so the late-fire timer
 * should not fire `quote_calculator_conversion` for it.
 *
 * IMPORTANT: this used to also `clearUserDataOnDOM()` synchronously,
 * but every caller pattern is `markQuoteUpgraded() → dispatchWorkerConversion()`,
 * and the dispatch reads the hidden DOM element synchronously
 * (`readUserDataFromDOM()` is evaluated at the call site before egress).
 * The wipe blew away PII before the dispatch could read it, sending empty
 * `user_data` to the Worker and collapsing match quality. The wipe is now
 * deferred to the natural
 * lifecycle: storage TTL expiry inside `setUserDataOnDOM`, calculator
 * restart, or `fireQuoteConversionIfStillActive` (which fires the
 * mirror first, then wipes inline).
 */
export function markQuoteUpgraded(): void {
  const state = readState();
  if (!state) return;
  state.upgraded = true;
  writeState(state);
  clearPendingTimer();
  broadcast('upgraded');
}

export function markViewContentFired(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(VIEW_CONTENT_FIRED_KEY, '1');
  } catch {
    // ignore
  }
}

function fireQuoteConversionIfStillActive(isLate: boolean): void {
  const state = readState();
  if (!state || state.upgraded) return;

  // Guard against a double-fire: if this quote's event_id was already fired
  // (by this tab's timer racing a catch-up reload, or by another tab), bail.
  if (hasFired(state.eventId)) {
    deleteState();
    clearPendingTimer();
    return;
  }

  // CLAIM FIRST, then fire. Marking fired + deleting the state + broadcasting
  // before the actual push shrinks the cross-tab race window to nothing: a
  // concurrent reader sees either the fired sentinel or an absent state and
  // bails, so the conversion is emitted exactly once.
  markFired(state.eventId);
  deleteState();
  clearPendingTimer();
  broadcast('fired');

  trackEvent('quote_calculator_conversion', {
    value: state.value,
    currency: state.currency,
    service: state.service,
    event_id: state.eventId,
    ...(isLate ? { late_conversion: true } : {}),
  });

  // Server-side leg: the Soborbo Worker (Meta CAPI), same event_id as the
  // dataLayer push above for dedup. Read user_data BEFORE the wipe below.
  dispatchWorkerConversion('quote_calculator_conversion', state.eventId, {
    value: state.value,
    currency: state.currency,
    service: state.service,
    userData: readUserDataFromDOM(),
    ...(isLate ? { source: 'late' } : {}),
  });

  // State + timer were already cleared in the claim step above.
  // dispatchWorkerConversion read user_data from the DOM synchronously above
  // (`readUserDataFromDOM()` is evaluated at the call site before this line),
  // so by now it's already captured. Wiping shrinks at-rest PII exposure for
  // the next page load.
  clearUserDataOnDOM();
}

/**
 * Called on every page-load. If a saved quote state exists, either
 * resume the timer (if we're inside the upgrade window) or fire a late
 * conversion (if we're past the window but still in the catch-up grace
 * period) or drop the state entirely (if it's stale).
 */
export function resumeQuoteTimer(): void {
  const state = readState();
  if (!state || state.upgraded) return;

  const elapsed = Date.now() - state.completedAt;
  clearPendingTimer();

  if (elapsed <= QUOTE_UPGRADE_WINDOW_MS) {
    pendingTimerId = setTimeout(
      () => fireQuoteConversionIfStillActive(false),
      QUOTE_UPGRADE_WINDOW_MS - elapsed,
    );
    return;
  }
  if (elapsed <= QUOTE_UPGRADE_WINDOW_MS + QUOTE_LATE_CATCHUP_MS) {
    fireQuoteConversionIfStillActive(true);
    return;
  }
  deleteState();
}
