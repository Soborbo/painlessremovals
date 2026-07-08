// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Isolate the conversion module from the network dispatch — we assert on the
// dataLayer push + localStorage state, not on the Worker egress.
vi.mock('./worker-dispatch', () => ({ dispatchWorkerConversion: vi.fn() }));

import { dispatchWorkerConversion } from './worker-dispatch';
import {
  fireQuoteConversion,
  wasQuoteCompletedRecently,
  cleanupLegacyQuoteState,
  hasViewContentFired,
  markViewContentFired,
} from './conversion-state';
import {
  QUOTE_COMPLETED_AT_KEY,
  QUOTE_SOURCE_LABEL_WINDOW_MS,
  QUOTE_STATE_KEY,
} from './config';

/**
 * Regression net for the quote conversion (rule #3): fires once,
 * immediately at completion, idempotent per event_id.
 */

function dl(): Array<Record<string, unknown>> {
  return (window as unknown as { dataLayer: Array<Record<string, unknown>> }).dataLayer;
}
const fired = () => dl().filter((e) => e.event === 'quote_calculator_conversion');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-25T12:00:00Z'));
  localStorage.clear();
  (window as any).dataLayer = [];
  vi.mocked(dispatchWorkerConversion).mockClear();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('fireQuoteConversion', () => {
  it('fires the dataLayer conversion immediately with value/currency/service/event_id', () => {
    fireQuoteConversion({ value: 1200, service: 'home', eventId: 'evt_q1' });
    const ev = fired();
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      value: 1200,
      currency: 'GBP',
      service: 'home',
      event_id: 'evt_q1',
    });
  });

  it('dispatches the Worker CAPI leg with the SAME event_id', () => {
    fireQuoteConversion({ value: 800, service: 'packing', eventId: 'evt_q2' });
    expect(dispatchWorkerConversion).toHaveBeenCalledWith(
      'quote_calculator_conversion',
      'evt_q2',
      expect.objectContaining({ value: 800, currency: 'GBP', service: 'packing' }),
    );
  });

  it('honours a provided currency', () => {
    fireQuoteConversion({ value: 1, service: 'x', currency: 'EUR', eventId: 'evt_q3' });
    expect(fired()[0]!.currency).toBe('EUR');
  });

  it('is idempotent per event_id (refresh / retry cannot double-fire)', () => {
    fireQuoteConversion({ value: 100, service: 'home', eventId: 'evt_same' });
    fireQuoteConversion({ value: 100, service: 'home', eventId: 'evt_same' });
    expect(fired()).toHaveLength(1);
    expect(dispatchWorkerConversion).toHaveBeenCalledTimes(1);
  });

  it('a NEW quote (new event_id) fires again — re-runs are separate conversions', () => {
    fireQuoteConversion({ value: 100, service: 'home', eventId: 'evt_a' });
    fireQuoteConversion({ value: 150, service: 'home', eventId: 'evt_b' });
    expect(fired()).toHaveLength(2);
  });

  it('respects a fired-guard left by the RETIRED upgrade-window model (same key format)', () => {
    localStorage.setItem(`${QUOTE_STATE_KEY}:fired`, 'evt_old');
    fireQuoteConversion({ value: 100, service: 'home', eventId: 'evt_old' });
    expect(fired()).toHaveLength(0);
  });

  it('stamps the completion breadcrumb for the after_calculator label', () => {
    fireQuoteConversion({ value: 100, service: 'home', eventId: 'evt_q4' });
    expect(localStorage.getItem(QUOTE_COMPLETED_AT_KEY)).toBe(String(Date.now()));
  });
});

describe('wasQuoteCompletedRecently — reporting label only', () => {
  it('is false with no completion recorded', () => {
    expect(wasQuoteCompletedRecently()).toBe(false);
  });

  it('is true right after a completion', () => {
    fireQuoteConversion({ value: 100, service: 'home', eventId: 'evt_q5' });
    expect(wasQuoteCompletedRecently()).toBe(true);
  });

  it('stays true inside the label window and expires after it', () => {
    fireQuoteConversion({ value: 100, service: 'home', eventId: 'evt_q6' });
    vi.setSystemTime(Date.now() + QUOTE_SOURCE_LABEL_WINDOW_MS - 1000);
    expect(wasQuoteCompletedRecently()).toBe(true);
    vi.setSystemTime(Date.now() + 2000);
    expect(wasQuoteCompletedRecently()).toBe(false);
  });

  it('tolerates a junk timestamp', () => {
    localStorage.setItem(QUOTE_COMPLETED_AT_KEY, 'garbage');
    expect(wasQuoteCompletedRecently()).toBe(false);
  });
});

describe('cleanupLegacyQuoteState', () => {
  it('removes the retired upgrade-window blob and nothing else', () => {
    localStorage.setItem(QUOTE_STATE_KEY, JSON.stringify({ value: 1, upgraded: false }));
    localStorage.setItem(`${QUOTE_STATE_KEY}:fired`, 'evt_keep');
    cleanupLegacyQuoteState();
    expect(localStorage.getItem(QUOTE_STATE_KEY)).toBeNull();
    expect(localStorage.getItem(`${QUOTE_STATE_KEY}:fired`)).toBe('evt_keep');
  });
});

describe('view-content flag', () => {
  it('round-trips through localStorage', () => {
    expect(hasViewContentFired()).toBe(false);
    markViewContentFired();
    expect(hasViewContentFired()).toBe(true);
  });
});
