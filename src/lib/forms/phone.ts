/**
 * UK phone validation for the public forms.
 *
 * The previous check was `/^(?:\+44|0)\d{9,10}$/` against a string with only
 * SPACES removed, which rejected formats people genuinely type on a phone
 * keypad or paste from a contacts app: `+44 (0)7880 354697`, `+44 07880
 * 354697`, `0044 7880 354697`, `07880-354-697`, `(07880) 354697`. Those came
 * back as a 400 the applicant could not act on — a real job applicant hit this
 * on 2026-08-17 and had to ring in instead.
 *
 * Normalize first, then validate the national significant number (9–10 digits,
 * not starting with 0) — the same accepted set as before, minus the accidental
 * strictness about punctuation. Non-UK international numbers are still
 * rejected: the surrounding copy asks for a UK number.
 */
function ukNationalNumber(input: string): string | null {
  // Strip the separators a human (or a contacts app) puts in a phone number:
  // whitespace incl. NBSP, brackets, dots, and the hyphen/dash family.
  let s = String(input).replace(/[\s().\-‐-―]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (s.startsWith('+')) {
    if (!s.startsWith('+44')) return null;
    s = s.slice(3);
  } else if (s.startsWith('44') && s.length > 11) {
    // Bare country code, no `+` — only when what follows is long enough to be
    // a full national number, so a `44…` local number isn't mangled.
    s = s.slice(2);
  }
  // Trunk prefix, including the `+44 (0)7…` hybrid people paste from letterheads.
  if (s.startsWith('0')) s = s.slice(1);
  return /^[1-9]\d{8,9}$/.test(s) ? s : null;
}

export function isValidUkPhone(input: string): boolean {
  return ukNationalNumber(input) !== null;
}
