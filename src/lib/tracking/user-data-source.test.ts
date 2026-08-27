// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildQuoteUserData } from './user-data-source';

/**
 * A BÖNGÉSZŐ-LÁB MEZŐKÉSZLET-SZERZŐDÉSE (D1).
 *
 * A hiba, ami ezt kikényszerítette: ugyanarra a submitre a SZERVER-láb hat
 * mezőt küldött (`save-quote.ts` → em, ph, fn, ln, **zp**, country), a
 * BÖNGÉSZŐ-láb pedig ötöt — az irányítószám nélkül. Közben a GTM-fogyasztó
 * (`JS - User Data Object`) a `postal_code`-ot LE IS KÉPEZI, tehát a fogadó
 * oldal készen állt; a termelő nem küldte.
 *
 * A kalkulátor a submit pillanatában BIZONYÍTOTTAN birtokolja az irányítószámot:
 * a `postcode` az `AddressData` sémában kötelező. Ez tehát nem hiányzó adat volt,
 * hanem hiányzó szerződés — és a leképezés három React-komponensben, egymástól
 * függetlenül, ugyanúgy elrontva élt. Ez a modul az EGYETLEN termelő.
 */

const CONTACT = { firstName: 'John', lastName: 'Smith', email: 'a@b.com', phone: '07700900123' };

describe('buildQuoteUserData — a D1 mezőkészlet', () => {
  it('a quote-úton a hatos készletet adja, irányítószámmal', () => {
    const ud = buildQuoteUserData(CONTACT, { from: { postcode: 'BS1 2AB' }, to: { postcode: 'BA1 1AA' } });
    expect(Object.keys(ud).sort()).toEqual(
      ['country', 'email', 'first_name', 'last_name', 'phone_number', 'postal_code'].sort(),
    );
  });

  it('ugyanaz a szabály, mint a szerver-lábon: a FELADÁSI cím nyer', () => {
    // `save-quote.ts`: `fromAddr?.postcode || toAddr?.postcode`. Ha a két láb
    // MÁS irányítószámot küld ugyanarra a submitre, az két külön identitás a
    // Meta szemében — pont az ellenkezője annak, amiért a mezőt bekötjük.
    const ud = buildQuoteUserData(CONTACT, { from: { postcode: 'BS1 2AB' }, to: { postcode: 'BA1 1AA' } });
    expect(ud.postal_code).toBe('BS12AB');
  });

  it('feladási cím nélkül a célcím irányítószáma megy', () => {
    const ud = buildQuoteUserData(CONTACT, { from: null, to: { postcode: 'BA1 1AA' } });
    expect(ud.postal_code).toBe('BA11AA');
  });

  it('a normalizálás a kanonikus szabály: uppercase, MINDEN whitespace ki', () => {
    const ud = buildQuoteUserData(CONTACT, { from: { postcode: 'sw1a 1aa' } });
    expect(ud.postal_code).toBe('SW1A1AA');
  });

  it('cím nélkül (önálló visszahívás) NINCS postal_code kulcs — üreset nem küldünk', () => {
    const ud = buildQuoteUserData(CONTACT);
    expect(ud).not.toHaveProperty('postal_code');
    expect(Object.keys(ud).sort()).toEqual(
      ['country', 'email', 'first_name', 'last_name', 'phone_number'].sort(),
    );
  });

  it('üres postcode-string sem hoz létre kulcsot', () => {
    const ud = buildQuoteUserData(CONTACT, { from: { postcode: '   ' }, to: { postcode: '' } });
    expect(ud).not.toHaveProperty('postal_code');
  });

  it('SOHA nem ad `street`-et — a Worker nem is fogadja (6.6.3-ban a szerződésből is kikerült)', () => {
    const ud = buildQuoteUserData(CONTACT, { from: { postcode: 'BS1 2AB' } });
    expect(ud).not.toHaveProperty('street');
  });

  it('a `city`-t sem találja ki: az AddressData-ban nincs strukturált város (D1 — formázott címből TILOS parse-olni)', () => {
    const ud = buildQuoteUserData(CONTACT, { from: { postcode: 'BS1 2AB' } });
    expect(ud).not.toHaveProperty('city');
  });
});
