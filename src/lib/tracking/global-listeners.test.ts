// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

vi.mock('./worker-dispatch', () => ({ dispatchWorkerConversion: vi.fn() }));
vi.mock('./conversion-state', () => ({ getRecentQuoteDetails: vi.fn() }));

import { dispatchWorkerConversion } from './worker-dispatch';
import { getRecentQuoteDetails } from './conversion-state';
import { initGlobalListeners } from './global-listeners';

/**
 * Regression net for a bug a PR review caught: the global tel:/mailto:/
 * wa.me click handler has no React state, so post-quote clicks must pull
 * the completed quote's value/currency/service from getRecentQuoteDetails
 * rather than dropping the monetary signal entirely.
 */

function dl(): Array<Record<string, unknown>> {
  return (window as unknown as { dataLayer: Array<Record<string, unknown>> }).dataLayer;
}

function click(href: string): void {
  const a = document.createElement('a');
  a.setAttribute('href', href);
  document.body.appendChild(a);
  a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  a.remove();
}

// A7: contact clicks are session-deduped per kind, and several cases below
// click `tel:` — give every case a fresh session (Date past the 30-min
// canonical session timeout) so the dedup starts clean.
let clock = Date.UTC(2026, 7, 26, 12, 0, 0);
vi.useFakeTimers({ toFake: ['Date'] });
afterAll(() => vi.useRealTimers());

beforeEach(() => {
  clock += 24 * 60 * 60 * 1000;
  vi.setSystemTime(clock);
  (window as any).dataLayer = [];
  vi.mocked(dispatchWorkerConversion).mockClear();
  vi.mocked(getRecentQuoteDetails).mockReset();
  document.body.innerHTML = '';
  // The `installed` guard is module-scoped and never resets — calling this
  // repeatedly across tests in this file is a harmless no-op after the
  // first, and the listener it installed the first time stays live.
  initGlobalListeners();
});

describe('tel: click — post-quote monetary signal', () => {
  it('attaches the recent quote value/currency/service when one exists', () => {
    vi.mocked(getRecentQuoteDetails).mockReturnValue({ value: 850, currency: 'GBP', service: 'packing' });
    click('tel:01172870082');

    const last = dl().at(-1)!;
    // The dataLayer carries the label under `cta_context` — a literal
    // `source` key is a GA4-reserved manual-campaign param that would
    // overwrite the session source (audit 2026-08, P0-A).
    expect(last).toMatchObject({
      event: 'phone_conversion',
      cta_context: 'after_calculator',
      value: 850,
      currency: 'GBP',
      service: 'packing',
      tel_target: '01172870082',
    });
    expect('source' in last).toBe(false);
    // The gateway leg carries NO label at all: it bypasses `buildSafePush`,
    // and the gateway forwarded a literal `source` to GA4 MP (audit 2026-08,
    // P0-A). The label lives on the dataLayer as `cta_context` only.
    expect(dispatchWorkerConversion).toHaveBeenCalledWith(
      'phone_conversion',
      expect.any(String),
      expect.objectContaining({ value: 850, currency: 'GBP', service: 'packing' }),
    );
    expect(vi.mocked(dispatchWorkerConversion).mock.calls.at(-1)![2]).not.toHaveProperty('source');
  });

  it('omits value/currency/service (never value:0) when no recent quote exists', () => {
    vi.mocked(getRecentQuoteDetails).mockReturnValue(null);
    click('tel:01172870082');

    const last = dl().at(-1)!;
    expect(last.cta_context).toBe('standalone');
    expect('source' in last).toBe(false);
    expect('value' in last).toBe(false);
    expect('currency' in last).toBe(false);
    const dispatchArgs = vi.mocked(dispatchWorkerConversion).mock.calls.at(-1)![2];
    expect(dispatchArgs).not.toHaveProperty('value');
  });

  it('mailto: and wa.me clicks get the same treatment', () => {
    vi.mocked(getRecentQuoteDetails).mockReturnValue({ value: 300, currency: 'GBP', service: 'home' });
    click('mailto:hello@painlessremovals.com');
    expect(dl().at(-1)).toMatchObject({ event: 'email_conversion', value: 300, cta_context: 'after_calculator' });

    click('https://wa.me/447700900123');
    expect(dl().at(-1)).toMatchObject({ event: 'whatsapp_conversion', value: 300, cta_context: 'after_calculator' });
  });
});

describe('instant_quote_cta_click — analytics only, not gated by recent quote', () => {
  it('fires for a relative /instantquote/ link without touching value/source', () => {
    vi.mocked(getRecentQuoteDetails).mockReturnValue(null);
    click('/instantquote/');
    expect(dl().at(-1)).toMatchObject({ event: 'instant_quote_cta_click' });
    expect(dispatchWorkerConversion).not.toHaveBeenCalled();
  });

  it('fires for an absolute same-site /instantquote link', () => {
    click(`${window.location.origin}/instantquote`);
    expect(dl().at(-1)).toMatchObject({ event: 'instant_quote_cta_click' });
  });
});
