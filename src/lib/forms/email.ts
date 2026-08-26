/**
 * AZ E-MAIL KLIENS-OLDALI KAPUJA — ugyanaz az AUTHORITY, mint a szerveré.
 *
 * ── A rés, amit lezár ────────────────────────────────────────────────────────
 * A kalkulátor Step11 saját regexszel ellenőrzött, a `/api/save-quote` viszont
 * az `emailSchema`-val. Két szabály, két helyen — és mindkét irányban rés volt:
 *
 *   254 KARAKTERES, de 500+ OKTETES multibyte cím
 *     Step11 → elfogad · state → elment · Step12 → submitál · API → ELUTASÍT
 *     A felhasználó a legvégén kap hibát arról, amit a második lépésben meg
 *     lehetett volna mondani neki.
 *
 *   "  User@Example.COM  " (vágólapról, körülötte szóköz)
 *     Step11 → ELUTASÍT (a regex a NYERS stringre futott) · API → elfogadta
 *     Vagyis a kalkulátor visszadobott egy tökéletesen érvényes címet.
 *
 * ── Miért nem külön szabály, hanem ugyanaz ───────────────────────────────────
 * Ez a függvény nem re-implementálja a szabályt: magát az `emailSchema`-t
 * futtatja, ami a szerver-határon is dönt. A kliens így definíció szerint
 * ugyanazt fogadja el — nem „hasonlót". Egyetlen dolga a HIBAÜZENET
 * megválasztása, mert a felhasználónak a „túl hosszú" és a „nem érvényes cím"
 * két különböző teendő.
 *
 * A `phone.ts` `isValidUkPhone`-ja ugyanezt a mintát követi.
 */

import { emailSchema } from '@/lib/core/validations/schemas';
import {
  EMAIL_IDENTITY_MAX_OCTETS,
  utf8OctetLength
} from '@/lib/soborbo-tracking/email-identity';

/**
 * A Step11 e-mail-mezőjének hibaüzenete, vagy `undefined`, ha érvényes.
 *
 * A döntés az `emailSchema`-é; itt csak az üzenetet választjuk ki. A
 * hosszkorlát OKTETBEN mér (RFC 5321), nem karakterben — egy ékezetes helyi
 * rész UTF-8-ban két oktet karakterenként.
 */
export function validateEmailField(email: string): string | undefined {
  if (!email.trim()) return 'Please enter your email address';
  if (emailSchema.safeParse(email).success) return undefined;
  // A hossz KÜLÖN üzenetet érdemel, mert más a teendő: rövidíteni kell, nem
  // javítani. Ehhez magát a kanonikus oktetszámlálót kérdezzük — a
  // `normalizeEmailIdentity` összevont verdiktje itt nem használható, mert az
  // egy `@` nélküli stringre is `undefined`-ot ad, és abból „túl hosszú"
  // üzenet lenne egy elgépelt címre.
  if (utf8OctetLength(email.trim()) > EMAIL_IDENTITY_MAX_OCTETS) {
    return 'Email address is too long';
  }
  return 'Please enter a valid email address';
}
