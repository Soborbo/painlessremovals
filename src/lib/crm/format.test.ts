import { describe, it, expect } from 'vitest';
import { GATEWAY_EVENT_ID_MAX, GATEWAY_EVENT_ID_RE, callbackCrmEventId } from './format';

/**
 * RED proof for the 2026-07/08 callback loss: `cb-` + a full 40-hex sha1 is 43 chars,
 * the gateway's contract is 40 — the CRM's forwarded conversion got a hard 400 and
 * booked `failed_permanent`. The key must fit the contract at the source.
 */
describe('callbackCrmEventId', () => {
  const sha1 = 'bb15625ea0573d68ca7797911ac201152297250d';

  it('fits the gateway event_id contract for a full sha1 fingerprint', () => {
    const id = callbackCrmEventId(sha1);
    expect(id.length).toBeLessThanOrEqual(GATEWAY_EVENT_ID_MAX);
    expect(id).toMatch(GATEWAY_EVENT_ID_RE);
    expect(id.startsWith('cb-')).toBe(true);
  });

  it('is deterministic (same content → same key, the CRM dedup relies on it)', () => {
    expect(callbackCrmEventId(sha1)).toBe(callbackCrmEventId(sha1));
    expect(callbackCrmEventId(sha1)).not.toBe(callbackCrmEventId(`e${sha1.slice(1)}`));
  });
});
