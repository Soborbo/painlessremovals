import { describe, it, expect } from 'vitest';
import {
  contactDetailsSchema,
  quoteWebhookSchema,
  contactWebhookSchema,
  callbackWebhookSchema,
  affiliateWebhookSchema,
  partnerRegisterWebhookSchema,
  webhookEnvelopeSchema,
} from './schemas';

const goodCustomer = {
  full_name: 'Jane Doe',
  email: 'jane@example.com',
  phone: '+44 7700 900123',
  postcode: 'BS1 4ST',
};

describe('contactDetailsSchema', () => {
  it('accepts a valid customer', () => {
    expect(contactDetailsSchema.safeParse(goodCustomer).success).toBe(true);
  });

  it('rejects a bad email', () => {
    const r = contactDetailsSchema.safeParse({ ...goodCustomer, email: 'not-an-email' });
    expect(r.success).toBe(false);
  });

  it('rejects a phone with illegal characters', () => {
    const r = contactDetailsSchema.safeParse({ ...goodCustomer, phone: '0117 ABC 1234' });
    expect(r.success).toBe(false);
  });

  it('rejects a too-short phone', () => {
    const r = contactDetailsSchema.safeParse({ ...goodCustomer, phone: '12345' });
    expect(r.success).toBe(false);
  });

  it('rejects a too-short postcode', () => {
    const r = contactDetailsSchema.safeParse({ ...goodCustomer, postcode: 'B' });
    expect(r.success).toBe(false);
  });

  it('allows omitting postcode (optional here)', () => {
    const { postcode, ...rest } = goodCustomer;
    void postcode;
    expect(contactDetailsSchema.safeParse(rest).success).toBe(true);
  });
});

describe('quoteWebhookSchema', () => {
  it('REQUIRES a customer postcode', () => {
    const { postcode, ...noPostcode } = goodCustomer;
    void postcode;
    const r = quoteWebhookSchema.safeParse({ customer: noPostcode });
    expect(r.success).toBe(false);
  });

  it('accepts a customer with postcode and no quote block', () => {
    const r = quoteWebhookSchema.safeParse({ customer: goodCustomer });
    expect(r.success).toBe(true);
  });

  it('requires a uuid pricing_version_id inside the quote block', () => {
    const r = quoteWebhookSchema.safeParse({
      customer: goodCustomer,
      quote: { pricing_version_id: 'not-a-uuid', size_code: '3bed', distance_miles: 12, total_pence: 120000 },
    });
    expect(r.success).toBe(false);
  });

  it('accepts a full valid quote and defaults complications to []', () => {
    const r = quoteWebhookSchema.safeParse({
      customer: goodCustomer,
      quote: {
        pricing_version_id: '22222222-2222-2222-2222-222222222222',
        size_code: '3bed',
        distance_miles: 12.5,
        total_pence: 120000,
      },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.quote?.complications).toEqual([]);
  });

  it('rejects a negative total_pence', () => {
    const r = quoteWebhookSchema.safeParse({
      customer: goodCustomer,
      quote: {
        pricing_version_id: '22222222-2222-2222-2222-222222222222',
        size_code: '3bed',
        distance_miles: 12,
        total_pence: -1,
      },
    });
    expect(r.success).toBe(false);
  });
});

describe('contactWebhookSchema', () => {
  it('accepts an optional message + preferred_contact', () => {
    const r = contactWebhookSchema.safeParse({
      customer: { full_name: 'A B', email: 'a@b.com', phone: '07700900123' },
      message: 'hello',
      preferred_contact: 'whatsapp',
    });
    expect(r.success).toBe(true);
  });

  it('rejects an unknown preferred_contact', () => {
    const r = contactWebhookSchema.safeParse({
      customer: { full_name: 'A B', email: 'a@b.com', phone: '07700900123' },
      preferred_contact: 'carrier-pigeon',
    });
    expect(r.success).toBe(false);
  });
});

describe('callbackWebhookSchema', () => {
  it('accepts optional window/postcode/message', () => {
    const r = callbackWebhookSchema.safeParse({
      customer: { full_name: 'A B', email: 'a@b.com', phone: '07700900123' },
      preferred_window: 'weekday mornings',
      property_postcode: 'BS1',
    });
    expect(r.success).toBe(true);
  });

  it('carries marketing attribution (gclid/utm)', () => {
    const r = callbackWebhookSchema.safeParse({
      customer: { full_name: 'A B', email: 'a@b.com', phone: '07700900123' },
      attribution: { utm_source: 'google', utm_medium: 'cpc', gclid: 'abc123' },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.attribution?.gclid).toBe('abc123');
  });
});

describe('affiliateWebhookSchema', () => {
  it('REQUIRES affiliate_code', () => {
    const r = affiliateWebhookSchema.safeParse({
      customer: { full_name: 'A B', email: 'a@b.com', phone: '07700900123' },
    });
    expect(r.success).toBe(false);
  });

  it('accepts a valid affiliate lead with attribution', () => {
    const r = affiliateWebhookSchema.safeParse({
      affiliate_code: 'agent-smith',
      customer: { full_name: 'A B', email: 'a@b.com', phone: '07700900123' },
      attribution: { utm_source: 'google', gclid: 'abc123', landing_page: '/partners/' },
    });
    expect(r.success).toBe(true);
  });
});

describe('partnerRegisterWebhookSchema', () => {
  it('defaults partner.type to B2B_partner and commission currency to GBP', () => {
    const r = partnerRegisterWebhookSchema.safeParse({
      partner: {
        name: 'Acme Estates',
        contact_name: 'Pat Agent',
        contact_email: 'pat@acme.com',
        contact_phone: '01179000000',
      },
      proposed_commission: { type: 'percent_revenue', value: 10 },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.partner.type).toBe('B2B_partner');
      expect(r.data.proposed_commission?.currency).toBe('GBP');
    }
  });

  it('rejects an invalid website url', () => {
    const r = partnerRegisterWebhookSchema.safeParse({
      partner: {
        name: 'Acme',
        contact_name: 'Pat',
        contact_email: 'pat@acme.com',
        contact_phone: '01179000000',
        website: 'not a url',
      },
    });
    expect(r.success).toBe(false);
  });
});

describe('webhookEnvelopeSchema.tracking_event_id', () => {
  const envelope = {
    event_id: 'cb-bb15625ea0573d68ca7797911ac201152297250',
    source: 'website',
    company_id: '11111111-1111-1111-1111-111111111111',
  };

  it('is optional (older callers keep working)', () => {
    expect(webhookEnvelopeSchema.safeParse(envelope).success).toBe(true);
  });

  it('accepts the browser UUID (36 chars, gateway charset)', () => {
    const r = webhookEnvelopeSchema.safeParse({
      ...envelope,
      tracking_event_id: '3f1c2b7a-1111-4222-8333-444455556666',
    });
    expect(r.success).toBe(true);
  });

  it('rejects an id the gateway would 400 (over 40 chars / bad charset)', () => {
    expect(
      webhookEnvelopeSchema.safeParse({ ...envelope, tracking_event_id: 'cb-bb15625ea0573d68ca7797911ac201152297250d' })
        .success,
    ).toBe(false);
    expect(webhookEnvelopeSchema.safeParse({ ...envelope, tracking_event_id: 'x:y' }).success).toBe(false);
  });
});
