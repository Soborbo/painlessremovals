// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

/**
 * A7 — kontakt-kattintás session-dedup (harness-first, RED → GREEN).
 *
 * Döntés (2026-08-26): a Painlessben N azonos kontakt-kattintás egy sessionben
 * NEM N konverzió. `tel → tel → tel` = 1 phone conversion; `tel → mailto` =
 * 1 phone + 1 email. A második kattintás nem új lead — legfeljebb ugyanannak a
 * szándéknak az ismétlése. (A kanonikus mag ugyanezt mondja: az N× tap friss
 * event_id-vel N szerver-oldali ad-konverziót könyvel → Smart Bidding / Meta
 * optimalizáció mérgezése.)
 *
 * A dedup-AUTHORITY közös: a DOM-figyelő (`global-listeners`) ÉS a programozott
 * `Step12Quote.handleBookNow` út ugyanazt a `claimContactConversion()`-t hívja.
 * Ami NEM változik: a belső event-nevek (`phone_conversion`…), a kétlábas
 * dispatch, a consent-modell, a PII-út. Csak a dedup-primitív közös.
 *
 * Izoláció: a kanonikus dedup-kulcs a SESSION-id-t hordozza → minden eset új
 * sessiont kap (a Date-et a session-timeout fölé tekerjük). Ez egyben a valódi
 * „új session = tiszta dedup" szemantika tesztje is. (Modul-reset NEM jó: a
 * jsdom `document` közös, és a `global-listeners` once-guardja modul-szintű —
 * resetenként egy újabb listener rakódott volna a dokumentumra.)
 */

vi.mock('./worker-dispatch', () => ({ dispatchWorkerConversion: vi.fn() }));
vi.mock('./conversion-state', () => ({ getRecentQuoteDetails: vi.fn(() => null) }));

type DL = Array<Record<string, unknown>>;
const dl = (): DL => (window as unknown as { dataLayer: DL }).dataLayer;

function click(href: string): void {
  const a = document.createElement('a');
  a.setAttribute('href', href);
  document.body.appendChild(a);
  a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  a.remove();
}

import { dispatchWorkerConversion } from './worker-dispatch';
import { initGlobalListeners } from './global-listeners';
import { claimContactConversion as claim } from './click-dedup';

const dispatch = vi.mocked(dispatchWorkerConversion);
let clock = Date.UTC(2026, 7, 26, 12, 0, 0);
vi.useFakeTimers({ toFake: ['Date'] });
afterAll(() => vi.useRealTimers());

async function fresh() {
  // Új session: a kanonikus session-timeout (30 perc) fölé tekerünk.
  clock += 24 * 60 * 60 * 1000;
  vi.setSystemTime(clock);
  (window as any).dataLayer = [];
  document.body.innerHTML = '';
  dispatch.mockClear();
  initGlobalListeners(); // once-guard: a 2. hívástól no-op
  return { dispatch, claim };
}

const pushes = (name: string) => dl().filter((p) => p.event === name);
const dispatches = (dispatch: ReturnType<typeof vi.fn>, name: string) =>
  dispatch.mock.calls.filter((c) => c[0] === name);

describe('A7 — kontakt-kattintás session-dedup', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('1. első tel: → böngésző + Worker EGYSZER, azonos event_id', async () => {
    const { dispatch } = await fresh();
    click('tel:01172870082');
    expect(pushes('phone_conversion')).toHaveLength(1);
    expect(dispatches(dispatch, 'phone_conversion')).toHaveLength(1);
    expect(dispatches(dispatch, 'phone_conversion')[0]![1]).toBe(pushes('phone_conversion')[0]!.event_id);
  });

  it('2. második tel: ugyanabban a sessionben → EGYIK láb sem tüzel', async () => {
    const { dispatch } = await fresh();
    click('tel:01172870082');
    click('tel:01172870082');
    click('tel:01172870099'); // más szám, ugyanaz a szándék
    expect(pushes('phone_conversion')).toHaveLength(1);
    expect(dispatches(dispatch, 'phone_conversion')).toHaveLength(1);
  });

  it('3. phone után email → az email továbbra is tüzel (típusonkénti dedup)', async () => {
    const { dispatch } = await fresh();
    click('tel:01172870082');
    click('mailto:hello@painlessremovals.com');
    click('https://wa.me/447700900123');
    expect(pushes('phone_conversion')).toHaveLength(1);
    expect(pushes('email_conversion')).toHaveLength(1);
    expect(pushes('whatsapp_conversion')).toHaveLength(1);
    expect(dispatch).toHaveBeenCalledTimes(3);
  });

  it('4. handleBookNow (programozott claim) után normál tel: → a második phone elnyomva', async () => {
    const { dispatch, claim } = await fresh();
    // Step12Quote.handleBookNow ugyanezt az authority-t hívja: első claim = event_id.
    const id = claim('phone');
    expect(typeof id).toBe('string');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    click('tel:01172870082');
    expect(pushes('phone_conversion')).toHaveLength(0);
    expect(dispatches(dispatch, 'phone_conversion')).toHaveLength(0);
  });

  it('5. normál tel: után handleBookNow → a claim null, a programozott út nem tüzel', async () => {
    const { claim } = await fresh();
    click('tel:01172870082');
    expect(pushes('phone_conversion')).toHaveLength(1);
    expect(claim('phone')).toBeNull();
    // Az e-mail szándék független: friss claim.
    expect(claim('email')).toEqual(expect.any(String));
    expect(claim('email')).toBeNull();
  });
});
