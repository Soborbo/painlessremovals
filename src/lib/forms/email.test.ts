import { describe, it, expect } from 'vitest';
import { validateEmailField } from './email';
import { emailSchema } from '@/lib/core/validations/schemas';
import { normalizeEmailIdentity } from '@/lib/soborbo-tracking/email-identity';

/**
 * A KLIENS-KAPU ÉS A SZERVER-KAPU HATÁRA NEM CSÚSZHAT SZÉT.
 *
 * A Step11 eddig csak alakra ellenőrzött, a `/api/save-quote` viszont a
 * kanonikus identity-szabályt is futtatja. A rés valós volt: egy 254
 * KARAKTERES, de 500+ OKTETES multibyte cím végigment a kalkulátoron, és csak
 * a submitnál bukott el — a felhasználó a legvégén kapott hibát olyasmiről,
 * amit a második lépésben meg lehetett volna mondani neki.
 */

function emailOfOctets(n: number): string {
  const suffix = '@example.com';
  return 'a'.repeat(n - suffix.length) + suffix;
}

const octets = (s: string) => new TextEncoder().encode(s).length;

describe('validateEmailField — a normal esetek valtozatlanok', () => {
  it('ures mezo', () => {
    expect(validateEmailField('')).toBe('Please enter your email address');
    expect(validateEmailField('   ')).toBe('Please enter your email address');
  });

  it('nem e-mail alaku', () => {
    expect(validateEmailField('not-an-email')).toBe('Please enter a valid email address');
    expect(validateEmailField('foo@bar')).toBe('Please enter a valid email address');
  });

  it('szokasos cim atmegy', () => {
    expect(validateEmailField('user@example.com')).toBeUndefined();
    expect(validateEmailField('  User@Example.COM  ')).toBeUndefined();
    expect(validateEmailField('john+spam@gmail.com')).toBeUndefined();
  });
});

describe('validateEmailField — a hosszkorlat OKTETBEN', () => {
  it('254 oktetes ASCII: TOVABBENGED', () => {
    const at = emailOfOctets(254);
    expect(octets(at)).toBe(254);
    expect(validateEmailField(at)).toBeUndefined();
  });

  it('255 oktetes ASCII: NEM enged tovabb', () => {
    expect(validateEmailField(emailOfOctets(255))).toBe('Email address is too long');
  });

  /**
   * A multibyte helyi részt a SZERVER `z.email()`-je alakilag utasítja el
   * (a Zod e-mail-regexe ASCII-only), nem hosszra. A kliens-kapunak ezért
   * UGYANÍGY kell elutasítania — enélkül a felhasználó végigmenne a
   * kalkulátoron, hogy a submitnál bukjon el.
   */
  it('254 oktetes MULTIBYTE: elbukik — de ALAKRA, nem hosszra', () => {
    const at254 = 'á'.repeat(121) + '@example.com';
    expect(octets(at254)).toBe(254);
    expect(normalizeEmailIdentity(at254), 'a hossz onmagaban rendben van').toBe(at254);
    expect(validateEmailField(at254)).toBe('Please enter a valid email address');
  });

  it('500+ oktetes MULTIBYTE: a hossz-uzenet nyer', () => {
    const over = 'á'.repeat(242) + '@example.com';
    expect(octets(over)).toBeGreaterThan(490);
    expect(validateEmailField(over)).toBe('Email address is too long');
  });

  it('A RES MASIK IRANYA: vagolaprol beillesztett, szokozokkel korulvett cim ATMEGY', () => {
    // A regi Step11-regex a NYERS stringre futott, ezert visszadobott egy
    // tokeletesen ervenyes cimet, amit az API elfogadott volna.
    expect(validateEmailField('  User@Example.COM  ')).toBeUndefined();
    expect(emailSchema.safeParse('  User@Example.COM  ').success).toBe(true);
  });
});

describe('PARITAS — kliens-kapu === szerver-kapu === identity', () => {
  const inputs = [
    'user@example.com',
    '  User@Example.COM  ',
    'john+spam@gmail.com',
    emailOfOctets(253),
    emailOfOctets(254),
    emailOfOctets(255),
    'á'.repeat(121) + '@example.com',
    'á'.repeat(122) + '@example.com',
    'á'.repeat(242) + '@example.com',
    'not-an-email',
    'foo@bar',
    ''
  ];

  for (const input of inputs) {
    const label = `"${input.slice(0, 24)}${input.length > 24 ? `…(${input.length}ch/${octets(input)}b)` : ''}"`;
    it(`ugyanaz a dontes: ${label}`, () => {
      const clientAccepts = validateEmailField(input) === undefined;
      const serverAccepts = emailSchema.safeParse(input).success;
      const identityAccepts = normalizeEmailIdentity(input) !== undefined;

      // A KLIENS-KAPU ES A SZERVER-KAPU MINDIG EGYEZIK — ez konstrukciobol
      // kovetkezik, mert a kliens magat az `emailSchema`-t futtatja.
      expect(clientAccepts, 'a kliens-kapu es a szerver-kapu mast dontott').toBe(serverAccepts);
      // Az identity ENGEDEKENYEBB lehet (nem nez alakot), de SOSEM szigorubb:
      // amit a kapuk atengednek, arra kell hogy legyen identitas.
      if (clientAccepts) expect(identityAccepts, 'atengedett cim, amire nincs identitas').toBe(true);
    });
  }
});
