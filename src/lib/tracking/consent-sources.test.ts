import { describe, it, expect } from 'vitest';
import {
  buildConsentSources,
  readConsentFromCookie,
  BACKEND_LIB_VERSION,
} from './gateway-dispatch';

/**
 * A CONSENT-FORRÁS TELEMETRIA — és miért `0.0.0-painless-fork` a verzió.
 *
 * ── A mért kiindulóhelyzet ───────────────────────────────────────────────────
 * A gateway ledgerében (2026-08-25) **1392 consent-receiptből 1391-en NULL** a
 * `client_lib_version`. Ez a site is közöttük van, MINDEN ingress-típuson. A
 * gateway service bindingon érhető el, tehát SOSEM látja a végfelhasználó
 * Cookie headerét — a szerver-lábon a saját olvasata mindig NULL. Márpedig ezen
 * a site-on MINDEN high-value konverzió ezen az úton megy.
 *
 * Következmény, ami eddig néma volt: a `TRK-910-006` (elavult kliens-lib) őr
 * soha nem tüzelhetett, mert nulla adatot látott.
 *
 * ── Miért nem kanonikus verziószámot jelentünk ───────────────────────────────
 * Ez a könyvtár a `soborbo-tracking` csomag FORKJA: a Serverside
 * `check-vendored-copy` riportja szerint a kiadás 27 fájljából 22 nincs is meg
 * benne. Egy `6.3.0`-nak látszó verzió itt HAZUDNA — pont azt a driftet fedné
 * el, amit ez a mező mérni hivatott. A `0.0.0-` előtag miatt a gateway IGAZ
 * módon jelöli elavultnak (MIN = 6.1.0), ami információs megállapítás: a napi
 * consent-riport egy sora, nem riasztás.
 */

const COOKIE = (analytics: string, ads: string) =>
  `cookieyes-consent=${encodeURIComponent(`consent:yes,analytics:${analytics},advertisement:${ads}`)}`;

describe('buildConsentSources', () => {
  it('jelenti a verziót MINDIG — süti nélkül is (a NULL-minta maga a bizonyíték)', () => {
    const s = buildConsentSources(null);
    expect(s.client_lib_version).toBe(BACKEND_LIB_VERSION);
    expect(s.source_used).toBe('none');
    expect(s.cookie).toEqual({ analytics: null, marketing: null });
    // A hiányzó forrás NULL, nem `false`. A `false` azt állítaná, hogy a
    // látogató NEMET mondott — az hazugság volna.
    expect(s.cookie.analytics).not.toBe(false);
  });

  it('a fork-jelölt verzió a gateway minimuma ALATT van — szándékosan', () => {
    // Ha ez valaha kanonikus-nak látszó számra változna anélkül, hogy a
    // könyvtárat tényleg lecseréltük volna, a drift megint láthatatlan lenne.
    expect(BACKEND_LIB_VERSION).toMatch(/^0\.0\.0-/);
    expect(BACKEND_LIB_VERSION).toContain('fork');
  });

  it('kiolvassa a CookieYes kategóriákat, és a hiányzót NULL-on hagyja', () => {
    expect(buildConsentSources(COOKIE('yes', 'no')).cookie).toEqual({ analytics: true, marketing: false });
    expect(buildConsentSources(COOKIE('no', 'yes')).cookie).toEqual({ analytics: false, marketing: true });

    const onlyAnalytics = 'cookieyes-consent=' + encodeURIComponent('consent:yes,analytics:yes');
    expect(buildConsentSources(onlyAnalytics).cookie).toEqual({ analytics: true, marketing: null });
  });

  it('a nyers süti CSONKÍTVA kerül a receiptre, sosem teljes egészében', () => {
    const long = 'cookieyes-consent=' + encodeURIComponent(`analytics:yes,${'x'.repeat(500)}`);
    expect(buildConsentSources(long).raw_cookie!.length).toBeLessThanOrEqual(200);
  });

  it('rossz percent-kódolás nem dobhat — a lead-útvonalon a telemetria sem 500-azhat', () => {
    expect(() => buildConsentSources('cookieyes-consent=%E0%A4%A')).not.toThrow();
  });

  it('NEM tér el attól, amit a döntési ág lát ugyanazon a sütin', () => {
    // A telemetria és a KAPU két külön kódút. Ha széttartanak, a receipt mást
    // állítana, mint ami történt — pont az a hibaosztály, amit mérni akarunk.
    const header = COOKIE('yes', 'no');
    const decision = readConsentFromCookie(header)!;
    const telemetry = buildConsentSources(header);
    expect(telemetry.cookie.analytics).toBe(decision.analytics_storage === 'GRANTED');
    expect(telemetry.cookie.marketing).toBe(decision.ad_storage === 'GRANTED');
  });
});
