// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';

import { captureUTMs, readAttribution, buildAttribution } from './utm-capture';

/**
 * gbraid/wbraid arrive INSTEAD of gclid on iOS / in-app Google traffic. Before
 * they were captured, a mobile-heavy paid click reached save-quote → CRM →
 * gateway with no Google click ID at all.
 *
 * The second invariant is the one that makes adding them safe: a Google click
 * yields exactly ONE of the three, so a fresh one must evict the siblings a
 * previous click left in the session store — otherwise the outgoing payload
 * carries two different clicks' identifiers.
 */
function land(search: string): void {
  window.history.replaceState({}, '', `/${search}`);
  captureUTMs();
}

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('captureUTMs — Google click IDs', () => {
  it('captures gbraid and wbraid alongside the existing keys', () => {
    land('?gbraid=GB123&utm_source=google&utm_medium=cpc');
    expect(readAttribution().gbraid).toBe('GB123');

    sessionStorage.clear();
    land('?wbraid=WB456');
    expect(readAttribution().wbraid).toBe('WB456');
  });

  it('a fresh gbraid evicts a gclid stored earlier in the session', () => {
    land('?gclid=OLD');
    expect(readAttribution().gclid).toBe('OLD');

    land('?gbraid=NEW');
    const a = readAttribution();
    expect(a.gbraid).toBe('NEW');
    expect(a.gclid).toBeUndefined();
  });

  it('a fresh gclid evicts a stored gbraid (both directions)', () => {
    land('?gbraid=OLD');
    land('?gclid=NEW');
    const a = readAttribution();
    expect(a.gclid).toBe('NEW');
    expect(a.gbraid).toBeUndefined();
  });

  it('keeps the stored click ID when the new URL carries no Google click ID', () => {
    land('?gclid=KEPT');
    land('?utm_source=newsletter');
    expect(readAttribution().gclid).toBe('KEPT');
  });

  it('never folds gbraid into the gclid field — they are distinct Google Ads identifiers', () => {
    land('?gbraid=GB789');
    const out = buildAttribution();
    expect(out.gbraid).toBe('GB789');
    expect(out.gclid).toBeUndefined();
  });
});
