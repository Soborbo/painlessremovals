/**
 * Kontakt-kattintás session-dedup — EGY authority a két emissziós útnak.
 *
 * Döntés (A7, 2026-08-26): N azonos kontakt-kattintás egy sessionben NEM N
 * konverzió. `tel → tel → tel` = 1 phone conversion; `tel → mailto` = 1 phone
 * + 1 email. A második kattintás nem új lead, csak ugyanannak a szándéknak az
 * ismétlése — friss event_id-vel N szerver-oldali ad-konverziót könyvelne, ami
 * a Smart Bidding / Meta optimalizáció jelét mérgezi. Ha egyszer a „hányszor
 * nyomta meg" érdekes lesz, az KÜLÖN analytics-only raw-click event, nem N
 * konverzió.
 *
 * A dedup-tár a KANONIKUS csomagé (`hasClickFired` / `markClickFired`): memória
 * mindig, `sessionStorage` csak analytics-consent mellett — vagyis bizonyos
 * consent-helyzetben egy reload után kevésbé tartós. Ez A6 (consent-policy)
 * terület, SZÁNDÉKOSAN nem ez a modul dolga.
 *
 * Amit ez a modul NEM hoz: kanonikus event-neveket, consent-kaput, payloadot,
 * gateway-szemantikát. A hívó (`global-listeners` DOM-út, `Step12Quote.
 * handleBookNow` programozott út) a saját belső nevével és kétlábas
 * dispatchével tüzel — csak azt kérdezi meg itt, hogy tüzelhet-e, és milyen
 * event_id-vel.
 */

import { hasClickFired, markClickFired } from '@/lib/soborbo-tracking/events';
import { generateUUID } from './uuid';

/** A kanonikus dedup-kulcsokkal AZONOS nevek, hogy egy jövőbeli kanonikus
 *  klikk-tracker ugyanabba a tárba lásson. */
export type ContactClickKind = 'phone' | 'email' | 'whatsapp';

/**
 * Lefoglalja a session kontakt-konverziós helyét erre a típusra.
 *
 * @returns friss `event_id` az ELSŐ kattintásra — a hívó ezzel tüzeli MINDKÉT
 *   lábat (dataLayer + Worker, Meta Pixel↔CAPI dedup); `null` ismétlésre — a
 *   hívónak EGYIK lábat sem szabad tüzelnie (a navigáció / tárcsázás persze
 *   megy tovább).
 */
export function claimContactConversion(kind: ContactClickKind): string | null {
  if (typeof window === 'undefined') return null;
  if (hasClickFired(kind)) return null;
  markClickFired(kind);
  return generateUUID();
}
