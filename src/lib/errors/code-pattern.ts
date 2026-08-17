/**
 * Shape gate for the `code` field accepted by `/api/error-report`.
 *
 * It MUST admit every key in `ALL_CODES`. The previous
 * `/^[A-Z]{2,6}-[A-Z]{2,8}-\d{3}$/` did not: `JS-UNHANDLED-001` has a
 * 9-letter middle segment and `CFG-I18N-001` has a digit in it, so both were
 * rejected with a 400 and never reached the sheet. That blinded the error log
 * to every uncaught JS exception — precisely the class of bug it exists to
 * catch, and why the Turnstile `size: 'invisible'` breakage went unnoticed.
 *
 * Lives in its own module (not in the route) so it can be unit-tested without
 * pulling `cloudflare:workers` into the test environment.
 * `code-pattern.test.ts` asserts it stays in sync with `ALL_CODES`.
 */
export const CODE_PATTERN = /^[A-Z]{2,8}-[A-Z0-9]{2,12}-\d{3}$/;
