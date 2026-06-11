import { describe, it, expect } from 'vitest';
import { sendToCRM, type CRMClientEnv } from './client';

/**
 * Live round-trip against the CRM staging receiver. Skipped in CI unless
 * RUN_CRM_STAGING_TEST=1 AND the CRM_* env vars are present, so normal test
 * runs never hit the network.
 *
 * Run locally with:
 *   RUN_CRM_STAGING_TEST=1 \
 *   CRM_WEBHOOK_SECRET=... CRM_BASE_URL=https://crm.staging... \
 *   CRM_COMPANY_ID=<uuid> npx vitest run roundtrip.staging
 */
const enabled =
  process.env.RUN_CRM_STAGING_TEST === '1' &&
  !!process.env.CRM_WEBHOOK_SECRET &&
  !!process.env.CRM_BASE_URL &&
  !!process.env.CRM_COMPANY_ID;

describe.runIf(enabled)('CRM staging round-trip', () => {
  const env: CRMClientEnv = {
    CRM_WEBHOOK_SECRET: process.env.CRM_WEBHOOK_SECRET,
    CRM_BASE_URL: process.env.CRM_BASE_URL,
    CRM_COMPANY_ID: process.env.CRM_COMPANY_ID,
  };

  it('delivers a contact lead and dedupes a resend of the same event_id', async () => {
    const eventId = `staging-${Date.now()}`;
    const payload = {
      customer: {
        full_name: 'Staging Test',
        email: `staging+${Date.now()}@example.com`,
        phone: '+447700900123',
      },
      message: 'Automated staging round-trip test',
    };

    const first = await sendToCRM(env, 'contact', payload, { eventId });
    expect(first.ok).toBe(true);

    // Resend with the SAME event_id should be treated as a duplicate.
    const second = await sendToCRM(env, 'contact', payload, { eventId });
    expect(second.ok).toBe(true);
    expect(second.duplicate).toBe(true);
  }, 60000);
});
