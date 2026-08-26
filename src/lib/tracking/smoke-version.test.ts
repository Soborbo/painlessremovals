import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BACKEND_LIB_VERSION } from './gateway-dispatch';

/**
 * A NAPI VERZIÓ-SZÍVHANG.
 *
 * A smoke az egyetlen esemény, ami determinisztikusan, naponta végigmegy a
 * szerver-ingressen. Ezért ez tudja bizonyítani, hogy ez a site MELYIK
 * könyvtárat futtatja — anélkül, hogy szerves konverzióra kellene várni.
 *
 * A migráció kimeneti jele a gateway ledgerében:
 *   NULL → `0.0.0-painless-fork` → a kanonikus csomag verziója
 * Ez a teszt a középső állapotot rögzíti. Ha valaki elveszi a smoke-ról a
 * `consentSources`-t, a szívhang megszűnik — és a migrációnak megint nem lenne
 * kívülről igazolható jele.
 */

const sent: Array<Record<string, unknown>> = [];

vi.mock('./gateway-dispatch', async () => {
  const actual = await vi.importActual<typeof import('./gateway-dispatch')>('./gateway-dispatch');
  return {
    ...actual,
    sendGatewayConversion: async (_env: unknown, input: Record<string, unknown>) => {
      sent.push(input);
      return { ok: true, status: 200, attempts: 1 };
    },
  };
});

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} },
}));

const ENV = {
  GATEWAY: { fetch: async () => new Response('{}', { status: 200 }) },
  TRACKING_GATEWAY_TOKEN: 'tok',
  SITE_URL: 'https://painlessremovals.com',
  TRACKING_TEST_LEAD_EMAIL: 'gateway-smoke-test@soborbo.co.uk',
  TRACKING_TEST_EVENT_CODE: 'TEST12345',
} as never;

beforeEach(() => {
  sent.length = 0;
});

describe('napi smoke — verzió-szívhang', () => {
  it('a smoke jelenti a könyvtár-verziót, tehát a ledger naponta látja, mi fut itt', async () => {
    const { runDailySmokeLead } = await import('./smoke');
    await runDailySmokeLead(ENV);

    expect(sent).toHaveLength(1);
    const sources = sent[0].consentSources as Record<string, unknown> | undefined;
    expect(sources, 'a smoke consentSources nélkül ment — a szívhang megszűnt').toBeDefined();
    // A szívhang lényege nem egy konkrét szám, hanem hogy a ledger AZT lássa,
    // ami itt tényleg fut. Ezért a jelentett értéket a modul saját
    // konstansához kötjük — az pedig a vendorolt magból származik, tehát a
    // lánc végig gépi: vendorolt mag → BACKEND_LIB_VERSION → receipt.
    expect(String(sources!.client_lib_version)).toBe(BACKEND_LIB_VERSION);
    expect(String(sources!.client_lib_version)).not.toMatch(/fork/);
  });

  it('a cron-nak nincs sütije, ezért a források ŐSZINTÉN NULL-ok — nem kitalált „nem"', async () => {
    const { runDailySmokeLead } = await import('./smoke');
    await runDailySmokeLead(ENV);

    const sources = sent[0].consentSources as { cookie: Record<string, unknown>; source_used: string };
    expect(sources.cookie).toEqual({ analytics: null, marketing: null });
    expect(sources.source_used).toBe('none');
    // A `false` azt állítaná, hogy valaki NEMET mondott. Itt senki nem mondott semmit.
    expect(sources.cookie.analytics).not.toBe(false);
  });

  it('a döntési blokk változatlanul explicit GRANTED — a telemetria nem nyúl a kapuhoz', async () => {
    const { runDailySmokeLead } = await import('./smoke');
    await runDailySmokeLead(ENV);

    expect(sent[0].consent).toEqual({
      ad_user_data: 'GRANTED',
      ad_personalization: 'GRANTED',
      ad_storage: 'GRANTED',
      analytics_storage: 'GRANTED',
    });
  });
});
