import { describe, it, expect } from 'vitest';
import { mapSubmissionToQuotePayload } from './quote-mapper';
import { quoteWebhookSchema } from './schemas';

const PRICING_VERSION = '11111111-1111-4111-8111-111111111111';

/** A full calculator submission as produced by getSubmissionData(). */
const fullData = {
  serviceType: 'home',
  propertySize: 'two_bed',
  officeSize: null,
  sliderPosition: 'average',
  complications: ['narrow_access', 'long_carry'],
  propertyChain: true,
  keyWaitWaiver: false,
  fromAddress: { formatted: '1 High St, Bristol', postcode: 'BS1 4QD', floorLevel: 2 },
  toAddress: { formatted: '9 Park Rd, Bath', postcode: 'BA1 1AA', floorLevel: 0 },
  distances: { customerDistance: 18, fromToTo: 18 },
  dateFlexibility: 'flexible',
  selectedDate: '2026-07-01T00:00:00.000Z',
  extras: { packingTier: 'fullService', disassemblyItems: [{ category: 'bed', quantity: 2 }] },
  contact: { firstName: 'Jane', lastName: 'Doe', gdprConsent: true, marketingConsent: false },
  quote: { totalPrice: 650, men: 3, vans: 1, cubes: 650, serviceDuration: 6 },
  landingPage: '/removal-cost-calculator',
  sessionId: 'sess-123',
  attribution: 'google/cpc',
};

const baseInput = {
  fullName: 'Jane Doe',
  email: 'jane@example.com',
  phone: '07700900123',
  postcode: 'BS1 4QD',
  totalPence: 65000,
  pricingVersionId: PRICING_VERSION,
  data: fullData,
  breakdown: { labour: 30000, mileage: 5000, packing: 30000 },
  utmSource: 'google',
  utmMedium: 'cpc',
  gclid: 'abc123',
};

describe('mapSubmissionToQuotePayload', () => {
  it('returns null when contact details are incomplete', () => {
    expect(mapSubmissionToQuotePayload({ ...baseInput, email: undefined })).toBeNull();
    expect(mapSubmissionToQuotePayload({ ...baseInput, postcode: undefined })).toBeNull();
  });

  it('maps every entered item and passes its own schema', () => {
    const payload = mapSubmissionToQuotePayload(baseInput);
    expect(payload).not.toBeNull();
    // The whole payload must satisfy the wire schema we send to the CRM.
    expect(() => quoteWebhookSchema.parse(payload)).not.toThrow();

    expect(payload?.addresses?.from.postcode).toBe('BS1 4QD');
    expect(payload?.addresses?.from.floor).toBe(2);
    expect(payload?.move).toEqual({ date: '2026-07-01T00:00:00.000Z', flexibility: 'flexible' });
    expect(payload?.service?.type).toBe('home');
    expect(payload?.service?.property_size).toBe('two_bed');
    expect(payload?.resources).toEqual({
      men: 3,
      vans: 1,
      cubic_ft: 650,
      service_duration_hours: 6,
    });
    expect(payload?.flags).toEqual({ property_chain: true, key_wait_waiver: false });
    expect(payload?.consent).toEqual({ gdpr: true, marketing: false });
    expect(payload?.breakdown?.labour).toBe(30000);
    expect(payload?.extras?.packingTier).toBe('fullService');
    expect(payload?.attribution?.heard_about).toBe('google/cpc');
    expect(payload?.attribution?.gclid).toBe('abc123');
    expect(payload?.attribution?.session_id).toBe('sess-123');
    expect(payload?.quote?.total_pence).toBe(65000);
  });

  it('omits the addresses block when only one leg has a postcode', () => {
    const payload = mapSubmissionToQuotePayload({
      ...baseInput,
      data: { ...fullData, toAddress: { formatted: 'somewhere' } },
    });
    expect(payload?.addresses).toBeUndefined();
  });

  it('drops the quote block when no pricing version is available', () => {
    const payload = mapSubmissionToQuotePayload({ ...baseInput, pricingVersionId: undefined });
    expect(payload?.quote).toBeUndefined();
    // …but the rest of the rich data still maps and validates.
    expect(() => quoteWebhookSchema.parse(payload)).not.toThrow();
    expect(payload?.service?.type).toBe('home');
  });

  it('produces a valid minimal payload from a sparse session', () => {
    const payload = mapSubmissionToQuotePayload({
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      phone: '07700900123',
      postcode: 'BS1 4QD',
      data: {},
    });
    expect(() => quoteWebhookSchema.parse(payload)).not.toThrow();
    expect(payload?.move).toBeUndefined();
    expect(payload?.extras).toBeUndefined();
  });
});
