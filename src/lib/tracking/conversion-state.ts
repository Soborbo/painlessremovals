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

import { trackEvent } from './tracking';
import { mirrorMetaCapi } from './meta-mirror';
import { generateUUID } from './uuid';
import {
  CURRENCY,
  QUOTE_LATE_CATCHUP_MS,
  QUOTE_STATE_CHANNEL,
  QUOTE_STATE_KEY,
  QUOTE_UPGRADE_WINDOW_MS,
} from './config';

export interface QuoteState {
  value: number;
  currency: string;
  service: string;
  completedAt: number;
  eventId: string;
  upgraded: boolean;
  /** Whether `quote_calculator_first_view` has already fired in this
   *  browser. Survives across re-completions so re-runs don't double-fire
   *  the Meta `ViewContent` engagement signal. */
  viewContentFired: boolean;
}

let pendingTimerId: ReturnType<typeof setTimeout> | null = null;
let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!channel) {
    try {
      channel = new BroadcastChannel(QUOTE_STATE_CHANNEL);
      channel.addEventListener('message', (e) => {
        if (e.data === 'upgraded') clearPendingTimer();
      });
    } catch {
      channel = null;
    }
  }
  return channel;
}

function broadcast(message: 'upgraded'): void {
  getChannel()?.postMessage(message);
}

function clearPendingTimer(): void {
  if (pendingTimerId !== null) {
    clearTimeout(pendingTimerId);
    pendingTimerId = null;
  }
}

function readState(): QuoteState | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(QUOTE_STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as QuoteState;
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
 * window. Resets the timer and event_id; preserves `viewContentFired` so
 * Meta ViewContent only fires once per browser even across re-runs.
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
  const previous = readState();

  const state: QuoteState = {
    value: input.value,
    currency: input.currency || CURRENCY,
    service: input.service,
    completedAt: Date.now(),
    eventId: input.eventId || generateUUID(),
    upgraded: false,
    viewContentFired: previous?.viewContentFired ?? false,
  };
  writeState(state);
  pendingTimerId = setTimeout(
    () => fireQuoteConversionIfStillActive(false),
    QUOTE_UPGRADE_WINDOW_MS,
  );
  return state;
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
 * Marks the active quote as upgraded — i.e. its conversion has been
 * counted by a higher-intent event already, so the late-fire timer
 * should not fire `quote_calculator_conversion` for it.
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
  const state = readState();
  if (!state) return;
  state.viewContentFired = true;
  writeState(state);
}

function fireQuoteConversionIfStillActive(isLate: boolean): void {
  const state = readState();
  if (!state || state.upgraded) return;

  trackEvent('quote_calculator_conversion', {
    value: state.value,
    currency: state.currency,
    service: state.service,
    event_id: state.eventId,
    ...(isLate ? { late_conversion: true } : {}),
  });
  void mirrorMetaCapi('quote_calculator_conversion', state.eventId, {
    value: state.value,
    currency: state.currency,
  });

  deleteState();
  clearPendingTimer();
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
