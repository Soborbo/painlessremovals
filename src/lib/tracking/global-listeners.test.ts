// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

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

beforeEach(() => {
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
    expect(last).toMatchObject({
      event: 'phone_conversion',
      source: 'after_calculator',
      value: 850,
      currency: 'GBP',
      service: 'packing',
      tel_target: '01172870082',
    });
    expect(dispatchWorkerConversion).toHaveBeenCalledWith(
      'phone_conversion',
      expect.any(String),
      expect.objectContaining({ source: 'after_calculator', value: 850, currency: 'GBP', service: 'packing' }),
    );
  });

  it('omits value/currency/service (never value:0) when no recent quote exists', () => {
    vi.mocked(getRecentQuoteDetails).mockReturnValue(null);
    click('tel:01172870082');

    const last = dl().at(-1)!;
    expect(last.source).toBe('standalone');
    expect('value' in last).toBe(false);
    expect('currency' in last).toBe(false);
    const dispatchArgs = vi.mocked(dispatchWorkerConversion).mock.calls.at(-1)![2];
    expect(dispatchArgs).not.toHaveProperty('value');
  });

  it('mailto: and wa.me clicks get the same treatment', () => {
    vi.mocked(getRecentQuoteDetails).mockReturnValue({ value: 300, currency: 'GBP', service: 'home' });
    click('mailto:hello@painlessremovals.com');
    expect(dl().at(-1)).toMatchObject({ event: 'email_conversion', value: 300, source: 'after_calculator' });

    click('https://wa.me/447700900123');
    expect(dl().at(-1)).toMatchObject({ event: 'whatsapp_conversion', value: 300, source: 'after_calculator' });
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
