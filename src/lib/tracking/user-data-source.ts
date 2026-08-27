/**
 * A BÖNGÉSZŐ-LÁB `user_data` TERMELŐJE — egy authority.
 *
 * ── Miért létezik ────────────────────────────────────────────────────────────
 * A leképezés eddig HÁROM React-komponensben élt, egymástól függetlenül
 * bemásolva (`Step12Quote`, `ResultPage` kétszer, `SimpleCallbackForm`) — és
 * mindegyik ugyanazt hagyta ki: az irányítószámot. Ugyanarra a submitre a
 * szerver-láb (`save-quote.ts`) hat mezőt küldött, a böngésző-láb ötöt, a
 * GTM-fogyasztó pedig a `postal_code`-ot le is képezte, csak sosem kapta meg.
 *
 * Ez nem hiányzó ADAT volt — a `postcode` az `AddressData` sémában kötelező, a
 * kalkulátor a submit pillanatában birtokolja. Hiányzó SZERZŐDÉS volt.
 *
 * ── A mezőkészlet (D1) ───────────────────────────────────────────────────────
 *   em + ph + fn + ln + zp + country
 *
 * A `city` szándékosan NINCS: az `AddressData` csak `formatted` + `postcode`
 * párost tart, és formázott címből várost parse-olni tilos — a téves `ct` a
 * Meta match-et rontja, nem javítja. A `street` a 6.6.3-ban a kanonikus
 * szerződésből is kikerült: a Worker sosem fogadta.
 */

import { normalizeUserData, type UserData } from './tracking';

/** Amit a kalkulátor kapcsolati lépése tart. */
export interface ContactLike {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
}

/** Az `AddressData`-ból CSAK ez az egy mező kell ide. */
export interface PostcodeSource {
  postcode?: string;
}

export interface QuoteAddresses {
  from?: PostcodeSource | null;
  to?: PostcodeSource | null;
}

/**
 * A `postal_code` kiválasztásának szabálya SZÁNDÉKOSAN azonos a szerver-lábéval
 * (`save-quote.ts`: `fromAddr?.postcode || toAddr?.postcode`). Ha a két láb más
 * irányítószámot küldene ugyanarra a submitre, az két külön identitás lenne a
 * Meta szemében — pont az ellenkezője annak, amiért a mezőt bekötjük.
 */
function pickPostcode(addresses?: QuoteAddresses): string | undefined {
  const candidate = addresses?.from?.postcode?.trim() || addresses?.to?.postcode?.trim();
  return candidate || undefined;
}

/**
 * A kalkulátor-utak `user_data`-ja. Cím nélkül (önálló visszahívás) az ötös
 * készletet adja — üres `postal_code` kulcsot SOHA nem hozunk létre.
 */
export function buildQuoteUserData(contact: ContactLike, addresses?: QuoteAddresses): UserData {
  const postal_code = pickPostcode(addresses);
  return normalizeUserData({
    email: contact.email,
    phone_number: contact.phone,
    first_name: contact.firstName,
    last_name: contact.lastName,
    ...(postal_code ? { postal_code } : {}),
  });
}
