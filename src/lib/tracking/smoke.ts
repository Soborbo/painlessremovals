/**
 * Napi synthetic-lead füstteszt — a TELJES szerver-láncot bizonyítja emberi kéz
 * nélkül: site worker → EVENT_GATEWAY service binding → gateway hitelesített
 * ingress (/api/event/conversion-server) → hash → Meta CAPI (TEST stream) →
 * D1 ledger.
 *
 * Biztonsági garanciák:
 *  - CSAK akkor fut, ha a TRACKING_TEST_LEAD_EMAIL + TRACKING_TEST_EVENT_CODE
 *    feloldható — enélkül a szintetikus event a PRODUCTION Meta-streambe menne
 *    (a 2 korábbi éles Meta-leak osztálya). Kód nélkül HANGOSAN kimarad.
 *  - Determinisztikus napi event_id (`smoke-painless-YYYYMMDD`): a cron dupla
 *    tüzelését a gateway idempotenciája nyeli el.
 *  - A lead_id ugyanez a smoke-kulcs → a ledger lead-trail útja is gyakorlódik,
 *    és a smoke-sorok `smoke-` prefixszel kiszűrhetők minden auditból.
 *
 * A másnapi ellenőrzés a gateway napi digestjében fut (SMOKE_SITES).
 */
import {
  sendGatewayConversion,
  resolveTestEventCode,
  type GatewayEnv,
} from './gateway-dispatch';
import { logger } from '@/lib/utils/logger';

const SITE = 'painless';

export async function runDailySmokeLead(env: GatewayEnv): Promise<void> {
  const email = env.TRACKING_TEST_LEAD_EMAIL;
  const testEventCode = resolveTestEventCode(env, email);
  if (!email || !testEventCode) {
    logger.error('SMOKE', 'skipped — TRACKING_TEST_LEAD_EMAIL / TRACKING_TEST_EVENT_CODE not configured; refusing to send a synthetic event that would land in the PRODUCTION Meta stream');
    return;
  }

  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const eventId = `smoke-${SITE}-${day}`;

  const res = await sendGatewayConversion(env, {
    eventName: 'contact_form_submitted',
    eventId,
    leadId: eventId,
    source: 'daily_smoke',
    // Szintetikus tesztszemély (a kulcsolt teszt-email) — nem valós PII.
    userData: { email, country: 'GB' },
    eventSourceUrl: 'https://painlessremovals.com/__smoke',
    testEventCode,
  });

  if (res.ok) {
    logger.info('SMOKE', 'daily synthetic lead dispatched', { eventId, status: res.status });
  } else {
    logger.error('SMOKE', 'daily synthetic lead FAILED', { eventId, status: res.status, error: res.error, attempts: res.attempts });
  }
}
