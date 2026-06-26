// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Isolate the state machine from the network mirror — we assert on the
// dataLayer push + localStorage state, not on Meta egress.
vi.mock('./meta-mirror', () => ({ mirrorMetaCapi: vi.fn().mockResolvedValue(undefined) }));

import {
  resetQuoteState,
  getActiveQuoteState,
  markQuoteUpgraded,
  resumeQuoteTimer,
  hasViewContentFired,
  markViewContentFired,
} from './conversion-state';
import { CURRENCY, QUOTE_STATE_KEY, QUOTE_UPGRADE_WINDOW_MS, QUOTE_LATE_CATCHUP_MS } from './config';

/**
 * Regression net for the quote conversion state machine (rule #3):
 * fire once, on upgrade OR after the window — never both.
 */

function dl(): Array<Record<string, unknown>> {
  return (window as unknown as { dataLayer: Array<Record<string, unknown>> }).dataLayer;
}
const fired = () => dl().filter((e) => e.event === 'quote_calculator_conversion');
const stored = () => {
  const raw = localStorage.getItem(QUOTE_STATE_KEY);
  return raw ? JSON.parse(raw) : null;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-25T12:00:00Z'));
  localStorage.clear();
  (window as any).dataLayer = [];
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('resetQuoteState', () => {
  it('writes a valid, non-upgraded state with defaults', () => {
    const st = resetQuoteState({ value: 1200, service: 'home' });
    const s = stored();
    expect(s.value).toBe(1200);
    expect(s.service).toBe('home');
    expect(s.currency).toBe(CURRENCY);
    expect(s.upgraded).toBe(false);
    expect(typeof s.eventId).toBe('string');
    expect(s.eventId.length).toBeGreaterThan(0);
    expect(s.completedAt).toBe(Date.now());
    expect(st).toEqual(s);
  });

  it('honours a provided currency and eventId', () => {
    resetQuoteState({ value: 1, service: 'x', currency: 'EUR', eventId: 'evt_seed01' });
    const s = stored();
    expect(s.currency).toBe('EUR');
    expect(s.eventId).toBe('evt_seed01');
  });
});

describe('getActiveQuoteState', () => {
  it('returns the state immediately after reset', () => {
    resetQuoteState({ value: 100, service: 'home' });
    expect(getActiveQuoteState()?.value).toBe(100);
  });

  it('stays active inside the upgrade window', () => {
    resetQuoteState({ value: 100, service: 'home' });
    vi.setSystemTime(Date.now() + QUOTE_UPGRADE_WINDOW_MS - 1000);
    expect(getActiveQuoteState()).not.toBeNull();
  });

  it('returns null once the window has elapsed', () => {
    resetQuoteState({ value: 100, service: 'home' });
    vi.setSystemTime(Date.now() + QUOTE_UPGRADE_WINDOW_MS + 1000);
    expect(getActiveQuoteState()).toBeNull();
  });

  it('returns null after the quote is upgraded', () => {
    resetQuoteState({ value: 100, service: 'home' });
    markQuoteUpgraded();
    expect(getActiveQuoteState()).toBeNull();
  });
});

describe('markQuoteUpgraded', () => {
  it('flags the stored state as upgraded', () => {
    resetQuoteState({ value: 100, service: 'home' });
    markQuoteUpgraded();
    expect(stored().upgraded).toBe(true);
  });

  it('is a no-op when there is no state', () => {
    expect(() => markQuoteUpgraded()).not.toThrow();
    expect(stored()).toBeNull();
  });
});

describe('late timer fire (window elapses without upgrade)', () => {
  it('fires the conversion exactly once and then deletes the state', () => {
    resetQuoteState({ value: 1200, service: 'home', eventId: 'evt_q1' });
    vi.advanceTimersByTime(QUOTE_UPGRADE_WINDOW_MS);
    const ev = fired();
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ value: 1200, currency: 'GBP', service: 'home', event_id: 'evt_q1' });
    expect(ev[0].late_conversion).toBeUndefined();
    expect(stored()).toBeNull();
  });

  it('does NOT fire if the quote was upgraded first', () => {
    resetQuoteState({ value: 1200, service: 'home' });
    markQuoteUpgraded();
    vi.advanceTimersByTime(QUOTE_UPGRADE_WINDOW_MS);
    expect(fired()).toHaveLength(0);
  });
});

describe('state validation (drops corrupt blobs)', () => {
  it('returns null for unparseable JSON', () => {
    localStorage.setItem(QUOTE_STATE_KEY, '{not-json');
    expect(getActiveQuoteState()).toBeNull();
  });

  it('purges a well-formed-JSON but wrong-shape blob', () => {
    localStorage.setItem(QUOTE_STATE_KEY, JSON.stringify({ value: 'oops', foo: 1 }));
    expect(getActiveQuoteState()).toBeNull();
    expect(localStorage.getItem(QUOTE_STATE_KEY)).toBeNull();
  });

  it('rejects a state missing eventId', () => {
    localStorage.setItem(QUOTE_STATE_KEY, JSON.stringify({ value: 1, currency: 'GBP', service: 'x', completedAt: Date.now(), upgraded: false }));
    expect(getActiveQuoteState()).toBeNull();
    expect(localStorage.getItem(QUOTE_STATE_KEY)).toBeNull();
  });

  it('rejects a state with a non-boolean upgraded flag', () => {
    localStorage.setItem(QUOTE_STATE_KEY, JSON.stringify({ value: 1, currency: 'GBP', service: 'x', completedAt: Date.now(), eventId: 'e', upgraded: 'yes' }));
    expect(getActiveQuoteState()).toBeNull();
    expect(localStorage.getItem(QUOTE_STATE_KEY)).toBeNull();
  });

  it('rejects a state with a non-finite value', () => {
    localStorage.setItem(QUOTE_STATE_KEY, JSON.stringify({ value: 'NaN', currency: 'GBP', service: 'x', completedAt: Date.now(), eventId: 'e', upgraded: false }));
    expect(getActiveQuoteState()).toBeNull();
    expect(localStorage.getItem(QUOTE_STATE_KEY)).toBeNull();
  });
});

describe('resumeQuoteTimer', () => {
  it('reschedules and still fires once at the original deadline (inside window)', () => {
    resetQuoteState({ value: 500, service: 'home', eventId: 'evt_r1' });
    vi.advanceTimersByTime(30 * 60 * 1000);
    expect(fired()).toHaveLength(0);
    resumeQuoteTimer();
    vi.advanceTimersByTime(30 * 60 * 1000);
    expect(fired()).toHaveLength(1);
  });

  it('fires a LATE conversion when past the window but inside catch-up', () => {
    const past = Date.now() - (QUOTE_UPGRADE_WINDOW_MS + 60_000);
    localStorage.setItem(QUOTE_STATE_KEY, JSON.stringify({ value: 800, currency: 'GBP', service: 'home', completedAt: past, eventId: 'evt_late1', upgraded: false }));
    resumeQuoteTimer();
    const ev = fired();
    expect(ev).toHaveLength(1);
    expect(ev[0].late_conversion).toBe(true);
    expect(ev[0].event_id).toBe('evt_late1');
  });

  it('drops the state (no fire) when past the catch-up grace period', () => {
    const ancient = Date.now() - (QUOTE_UPGRADE_WINDOW_MS + QUOTE_LATE_CATCHUP_MS + 60_000);
    localStorage.setItem(QUOTE_STATE_KEY, JSON.stringify({ value: 1, currency: 'GBP', service: 'x', completedAt: ancient, eventId: 'evt_old1', upgraded: false }));
    resumeQuoteTimer();
    expect(fired()).toHaveLength(0);
    expect(localStorage.getItem(QUOTE_STATE_KEY)).toBeNull();
  });

  it('does nothing for an already-upgraded state', () => {
    resetQuoteState({ value: 1, service: 'x' });
    markQuoteUpgraded();
    resumeQuoteTimer();
    vi.advanceTimersByTime(QUOTE_UPGRADE_WINDOW_MS);
    expect(fired()).toHaveLength(0);
  });
});

describe('view-content flag', () => {
  it('round-trips through localStorage', () => {
    expect(hasViewContentFired()).toBe(false);
    markViewContentFired();
    expect(hasViewContentFired()).toBe(true);
  });
});
