import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { KVNamespace } from '@/lib/utils/kv';
import type { ImvePayload } from './mapper';
import type { ImveConfig } from './client';
import {
  enqueueImveLead,
  dequeueImveLead,
  replayImveDeadLetters,
  countImveDeadLetters,
} from './dead-letter';
import { syncQuoteToImve } from './index';

/** In-memory KV double implementing the subset used by the DLQ. */
function memoryKV(): KVNamespace & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    async get(key) {
      return store.get(key) ?? null;
    },
    async put(key, value) {
      store.set(key, value);
    },
    async delete(key) {
      store.delete(key);
    },
    async list(options) {
      const prefix = options?.prefix ?? '';
      const limit = options?.limit ?? 1000;
      const matching = [...store.keys()].filter((k) => k.startsWith(prefix)).sort();
      return {
        keys: matching.slice(0, limit).map((name) => ({ name })),
        list_complete: matching.length <= limit,
      };
    },
  };
}

const PAYLOAD = { first_name: 'Jane', last_name: 'Doe', email: 'jane@example.com' } as ImvePayload;

const CONFIG: ImveConfig = {
  enabled: true,
  apiUrl: 'https://api.app.i-mve.com/job/user/abc',
  timeoutMs: 1000,
};

describe('i-mve dead-letter queue', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('enqueue stores one entry per quote id (overwrite, not stack)', async () => {
    const kv = memoryKV();
    await enqueueImveLead(kv, 'Q1', PAYLOAD, 'timeout');
    await enqueueImveLead(kv, 'Q1', PAYLOAD, 'timeout again');
    expect(kv.store.size).toBe(1);
    expect((await countImveDeadLetters(kv)).count).toBe(1);
  });

  it('dequeue removes the parked entry', async () => {
    const kv = memoryKV();
    await enqueueImveLead(kv, 'Q1', PAYLOAD, 'timeout');
    await dequeueImveLead(kv, 'Q1');
    expect(kv.store.size).toBe(0);
  });

  it('replay re-sends parked payloads and deletes them on success', async () => {
    const kv = memoryKV();
    await enqueueImveLead(kv, 'Q1', PAYLOAD, 'timeout');
    await enqueueImveLead(kv, 'Q2', PAYLOAD, 'timeout');

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('ok', { status: 200 }));

    const summary = await replayImveDeadLetters(kv, CONFIG);
    expect(summary.replayed.sort()).toEqual(['Q1', 'Q2']);
    expect(summary.failed).toEqual([]);
    expect(kv.store.size).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('replay keeps entries that still fail', async () => {
    const kv = memoryKV();
    await enqueueImveLead(kv, 'Q1', PAYLOAD, 'timeout');

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response('nope', { status: 503 }),
    );

    const summary = await replayImveDeadLetters(kv, CONFIG);
    expect(summary.replayed).toEqual([]);
    expect(summary.failed).toHaveLength(1);
    expect(summary.failed[0]?.quoteId).toBe('Q1');
    expect(kv.store.size).toBe(1);
  });

  it('syncQuoteToImve parks the lead on failure and clears it on later success', async () => {
    const kv = memoryKV();
    const quote = { id: 'Q9', name: 'Jane Doe', email: 'jane@example.com', phone: '07700900123' };

    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('connection lost'));
    const failed = await syncQuoteToImve(quote, {}, CONFIG, kv);
    expect(failed.success).toBe(false);
    expect(kv.store.size).toBe(1);

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const succeeded = await syncQuoteToImve(quote, {}, CONFIG, kv);
    expect(succeeded.success).toBe(true);
    expect(kv.store.size).toBe(0);
  });

  it('syncQuoteToImve does NOT park leads that fail local validation', async () => {
    const kv = memoryKV();
    const result = await syncQuoteToImve({ id: 'Q5' }, {}, CONFIG, kv);
    expect(result.success).toBe(false);
    expect(kv.store.size).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });
});
