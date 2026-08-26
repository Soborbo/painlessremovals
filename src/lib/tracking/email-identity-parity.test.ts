// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { normalizeUserData } from './tracking';
import { normalizeEmailIdentity } from '@/lib/soborbo-tracking/email-identity';
import { emailSchema } from '@/lib/core/validations/schemas';

/**
 * A SITE E-MAIL-NORMALIZÁLÁSA A KANONIKUS IDENTITÁSRA DELEGÁL.
 *
 * ── A hiba, amit lezár ───────────────────────────────────────────────────────
 * A `normalizeUserData` saját szabályt vitt (`toLowerCase().trim()`), a
 * kanonikus böngésző-csomag 254 karakternél CSONKÍTOTT, a Worker `hash.ts`
 * pedig `@`-őrt alkalmazott és nem csonkított. Három láb, három szabály.
 *
 * A 6.6.0 óta egy authority van: `normalizeEmailIdentity()` — ugyanaz a modul,
 * amit a Worker is importál. Ez a fájl azt rögzíti, hogy a SITE is rá delegál.
 *
 * ── Miért nem elég a hash-egyezés ────────────────────────────────────────────
 * A `normalizeUserData` kimenete a rejtett DOM side-channelbe kerül, ahonnan a
 * GTM-változók a böngésző-Pixelt töltik; ugyanez az érték megy a gateway
 * payloadjában a CAPI-hoz. Ha a két oldal más stringet lát ugyanarra a címre,
 * az identity matching / EMQ / EC match rate NÉMÁN romlik. (A Meta dedup ettől
 * független: az az `(event_name, event_id)` páron áll.)
 */

const CASES: Array<{ label: string; input: string; expected: string | undefined }> = [
  { label: 'trim + lowercase', input: '  User@Example.COM  ', expected: 'user@example.com' },
  { label: 'mar normalizalt', input: 'user@example.com', expected: 'user@example.com' },
  { label: 'plus-suffix MARAD', input: 'john+spam@gmail.com', expected: 'john+spam@gmail.com' },
  { label: 'Gmail-pont MARAD', input: 'john.smith@gmail.com', expected: 'john.smith@gmail.com' },
  { label: 'nincs @ — nem identitas', input: 'not-an-email', expected: undefined },
  { label: 'domain-szeru, @ nelkul', input: 'foo.example.com', expected: undefined },
  { label: 'csak whitespace', input: '   ', expected: undefined }
];

function emailOfOctets(n: number): string {
  const suffix = '@example.com';
  return 'a'.repeat(n - suffix.length) + suffix;
}

describe('normalizeUserData.email — a kanonikus identitas', () => {
  for (const c of CASES) {
    it(c.label, () => {
      expect(normalizeUserData({ email: c.input }).email).toBe(c.expected);
    });
  }

  it('254 oktetes ASCII cim ATMEGY, valtozatlanul', () => {
    const at = emailOfOctets(254);
    expect(normalizeUserData({ email: at }).email).toBe(at);
  });

  it('255 oktetes ASCII cim ELDOBODIK — SOHA nem csonkitva', () => {
    const over = emailOfOctets(255);
    const out = normalizeUserData({ email: over }).email;
    expect(out, 'a tul hosszu cim csonkolva ment tovabb — mesterseges masik identitas').toBeUndefined();
  });

  it('254 oktetes MULTIBYTE cim atmegy, 256 nem', () => {
    const at254 = 'á'.repeat(121) + '@example.com';
    expect(new TextEncoder().encode(at254).length).toBe(254);
    expect(normalizeUserData({ email: at254 }).email).toBe(at254);

    const over = 'á'.repeat(122) + '@example.com';
    expect(normalizeUserData({ email: over }).email).toBeUndefined();
  });

  it('a tobbi mezot nem erinti (nev/varos/iranyitoszam valtozatlan)', () => {
    const out = normalizeUserData({
      email: ' A@B.COM ',
      first_name: '  János ',
      city: '  Pécs ',
      postal_code: 'sw1a 1aa'
    });
    expect(out.email).toBe('a@b.com');
    expect(out.first_name).toBe('jános');
    expect(out.city, 'ekezet NEM strippelodik — CLAUDE.md 1.').toBe('pécs');
    expect(out.postal_code).toBe('SW1A1AA');
  });
});

describe('PARITAS — a site es a kanonikus identitas ugyanazt adja', () => {
  const inputs = [
    ...CASES.map((c) => c.input),
    emailOfOctets(253),
    emailOfOctets(254),
    emailOfOctets(255),
    'á'.repeat(121) + '@example.com',
    'á'.repeat(122) + '@example.com',
    ' MiXeD@Case.Example.COM '
  ];

  for (const input of inputs) {
    const label = `"${input.slice(0, 28)}${input.length > 28 ? `…(${input.length})` : ''}"`;
    it(`azonos kimenet: ${label}`, () => {
      expect(normalizeUserData({ email: input }).email).toBe(normalizeEmailIdentity(input));
    });
  }
});

/**
 * A FORM-VALIDÁTOR ÉS AZ IDENTITY-RÉTEG HATÁRA NEM CSÚSZHAT SZÉT.
 *
 * Ha a form elfogad egy címet, amit az identity-réteg utána eldob, akkor
 * keletkezik egy lead, aminek SOHA nem lesz `em` azonosítója — némán, mert a
 * felhasználó felé minden sikeresnek látszik.
 */
describe('emailSchema hatara === identity hatara', () => {
  it('254 oktet: a form ELFOGADJA es az identity is', () => {
    const at = emailOfOctets(254);
    expect(emailSchema.safeParse(at).success).toBe(true);
    expect(normalizeEmailIdentity(at)).toBe(at);
  });

  it('255 oktet: a form ELUTASITJA, ahogy az identity is', () => {
    const over = emailOfOctets(255);
    expect(
      emailSchema.safeParse(over).success,
      'a form elfogadott egy cimet, amit az identity-reteg eldob — nema em-vesztes'
    ).toBe(false);
    expect(normalizeEmailIdentity(over)).toBeUndefined();
  });
});
