import { describe, expect, it } from 'vitest';
import { isValidUkPhone } from './phone';

/**
 * Regression cover for the 2026-08-17 job-application outage: the previous
 * check only stripped SPACES, so bracketed/hyphenated/`0044` numbers came back
 * as an unactionable 400 and the applicant had to phone in instead.
 */
describe('isValidUkPhone', () => {
  it.each([
    '07880 354 697',
    '07880354697',
    '+44 7880 354697',
    '+447880354697',
    '0117 287 0082',
    // Formats the old space-only strip rejected:
    '+44 (0)7880 354697',
    '+44 07880 354697',
    '0044 7880 354697',
    '07880-354-697',
    '(07880) 354697',
    '(0117) 287-0082',
    // Bare national number, no trunk 0 — what `normalizePhoneE164` also accepts.
    '7880354697',
    // 9-digit national significant number (e.g. the 016977 range).
    '016977 3456',
  ])('accepts %s', (input) => expect(isValidUkPhone(input)).toBe(true));

  it.each([
    '',
    '12345',
    'not a number',
    '07880abc697',
    '078803546970000',
    // Non-UK international — these forms ask for a UK number.
    '+353 87 1234567',
    '+1 415 555 2671',
  ])('rejects %s', (input) => expect(isValidUkPhone(input)).toBe(false));
});
