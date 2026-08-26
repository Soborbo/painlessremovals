// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  captureUTMs,
  readAttribution,
  readAffiliateCode,
  syncAttributionOnConsentChange,
  resolveClickIdFields,
  buildAttribution
} from './utm-capture';

/**
 * PRE-CONSENT STORAGE — a `pr_tracking` store és a `pr_ref` süti.
 *
 * ── A hiba, amit ez a fájl zár le ────────────────────────────────────────────
 * A `captureUTMs()` a bootban FELTÉTEL NÉLKÜL futott, az első hívások egyikeként,
 * és a `gclid`/`gbraid`/`wbraid`/`fbclid`/`utm_*` értékeket azonnal
 * `sessionStorage`-ba írta, a `?ref=`-et pedig egy first-party sütibe. Consent
 * előtt. A szomszédjában, UGYANABBAN a boot-fájlban a `restoreUserDataFromStorage()`
 * ezzel szemben explicit consent-kapuzott — két szabály, egy fájl.
 *
 * A PECR/ICO szabály szempontjából nem az számít, hogy az érték PII-e, hanem hogy
 * INFORMÁCIÓT TÁROLUNK-E a felhasználó eszközén; a web storage is ide tartozik.
 * Ezért a döntés: a `pr_tracking` EGÉSZE marketing-scoped. Egy store → egy
 * consent-osztály; nem mezőnként találgatunk (`utm_source` analytics?
 * `utm_campaign` marketing?).
 *
 * ── Miért háromállapotú, és miért nem elég a bootkori `return` ───────────────
 * Ha UNKNOWN alatt csak kilépnénk, ez történne:
 *     landing ?gclid=ABC → banner → a user ELFOGADJA → a gclid ELVESZETT.
 * Ez új attribúció-vesztés lenne, vagyis a javítás egy másik hibát szülne.
 * Ezért UNKNOWN alatt a friss URL-jel EFEMER MEMÓRIÁBAN vár, és a grant
 * pillanatában íródik ki.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

type Signal = 'GRANTED' | 'DENIED';

function setConsent(ad: Signal | undefined): void {
  const w = window as unknown as Record<string, unknown>;
  if (!ad) {
    delete w.__trackingConsent;
    return;
  }
  w.__trackingConsent = {
    ad_user_data: ad,
    ad_personalization: ad,
    ad_storage: ad,
    analytics_storage: ad
  };
}

function land(search: string): void {
  window.history.replaceState({}, '', `/${search}`);
  captureUTMs();
}

function rawStore(): string | null {
  return sessionStorage.getItem('pr_tracking');
}

beforeEach(() => {
  sessionStorage.clear();
  document.cookie.split(';').forEach((c) => {
    document.cookie = `${c.split('=')[0]!.trim()}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  });
  window.history.replaceState({}, '', '/');
  setConsent(undefined);
});

describe('UNKNOWN consent — semmi nem íródik az eszközre', () => {
  it('?gclid=A → nincs pr_tracking', () => {
    land('?gclid=A');
    expect(rawStore(), 'consent előtt hirdetési azonosító került sessionStorage-ba').toBeNull();
  });

  it('?gbraid=B → nincs pr_tracking', () => {
    land('?gbraid=B');
    expect(rawStore()).toBeNull();
  });

  it('?utm_source=google → nincs pr_tracking (az EGÉSZ store marketing-scoped)', () => {
    land('?utm_source=google');
    expect(rawStore()).toBeNull();
  });

  it('?ref=partner → nincs pr_ref süti', () => {
    land('?ref=partner');
    expect(document.cookie).not.toContain('pr_ref');
    expect(rawStore()).toBeNull();
  });
});

describe('UNKNOWN → GRANTED ugyanazon az oldalon', () => {
  it('a klikk-ID NEM vész el: a grant pillanatában íródik ki', () => {
    land('?gclid=ABC&utm_source=google');
    expect(rawStore()).toBeNull();

    setConsent('GRANTED');
    syncAttributionOnConsentChange();

    expect(readAttribution().gclid).toBe('ABC');
    expect(readAttribution().utm_source).toBe('google');
    expect(rawStore()).not.toBeNull();
  });

  it('az affiliate ref is a grantkor kerül ki, nem előtte', () => {
    land('?ref=partner');
    expect(readAffiliateCode()).toBeUndefined();

    setConsent('GRANTED');
    syncAttributionOnConsentChange();

    expect(readAffiliateCode()).toBe('partner');
    expect(document.cookie).toContain('pr_ref=partner');
  });
});

describe('UNKNOWN → DENIED', () => {
  it('semmilyen hirdetési azonosító nem persistál', () => {
    land('?gclid=ABC&ref=partner');
    setConsent('DENIED');
    syncAttributionOnConsentChange();

    expect(rawStore()).toBeNull();
    expect(document.cookie).not.toContain('pr_ref');
    expect(readAttribution().gclid).toBeUndefined();
  });
});

describe('GRANTED → DENIED — a visszavonás nyugalmi állapotban is érvényes', () => {
  it('a már kiírt pr_tracking és pr_ref is törlődik', () => {
    setConsent('GRANTED');
    land('?gclid=ABC&ref=partner');
    expect(rawStore()).not.toBeNull();
    expect(document.cookie).toContain('pr_ref');

    setConsent('DENIED');
    syncAttributionOnConsentChange();

    expect(rawStore(), 'a visszavonás után is ott maradt a tárolt attribúció').toBeNull();
    expect(document.cookie).not.toContain('pr_ref');
  });
});

describe('GRANTED — a klikk-ID szabály a KANONIKUS primitívé', () => {
  it('friss gbraid kiüti a tárolt gclid-et', () => {
    setConsent('GRANTED');
    land('?gclid=REGI');
    land('?gbraid=UJ');

    const a = readAttribution();
    expect(a.gbraid).toBe('UJ');
    expect(a.gclid).toBeUndefined();
  });

  it('friss gbraid mellé a `_gcl_aw` süti gclid-je NEM szivárog be', () => {
    // A `pr_tracking`-nek SZÁNDÉKOSAN nincs cookie-rétege — az a gateway saját
    // store-jának a dolga. Ez a teszt őr: ha valaki később mégis bevezetné, a
    // sorrendet a közös primitív rögzíti, és a friss URL-jel akkor is nyer.
    document.cookie = '_gcl_aw=GCL.1690000000.COOKIE-REGI;path=/';
    setConsent('GRANTED');
    land('?gbraid=UJ');

    const a = readAttribution();
    expect(a.gbraid).toBe('UJ');
    expect(a.gclid).toBeUndefined();
  });

  it('az affiliate ref független a Google-ID döntéstől', () => {
    setConsent('GRANTED');
    land('?ref=partner&gbraid=UJ');
    land('?gclid=UJABB');

    const a = readAttribution();
    expect(a.ref, 'a Google-ID csere elvitte az affiliate kódot').toBe('partner');
    expect(a.gclid).toBe('UJABB');
    expect(a.gbraid).toBeUndefined();
  });
});

describe('strukturális őr — egy authority', () => {
  const source = readFileSync(join(HERE, 'utm-capture.ts'), 'utf8');

  it('nem deklarál saját GOOGLE_CLICK_KEYS listát', () => {
    expect(
      /(?:const|let|var)\s+GOOGLE_CLICK_KEYS/.test(source),
      'a klikk-ID kulcslista újra site-oldali másolatot kapott'
    ).toBe(false);
  });

  it('nem ír saját kizárási algoritmust — a kanonikus primitívre delegál', () => {
    expect(source).toContain('soborbo-tracking/google-click-id');
    expect(
      /gbraid[\s\S]{0,200}?wbraid[\s\S]{0,200}?(?:delete|find\()/.test(source),
      'saját gclid/gbraid/wbraid döntési logika került vissza a fájlba'
    ).toBe(false);
  });
});

/**
 * A HARMADIK AUTHORITY — a kalkulátor állapotába menő klikk-ID mezők.
 *
 * A `calculator-store` korábban MEZŐNKÉNT, egymástól függetlenül választott
 * (`params.get('gclid') || stored.gclid`, aztán ugyanez gbraid-re), és egy
 * kommentre támaszkodott: „a `captureUTMs` már eldobta az elavult testvéreket".
 * A feltevés csak akkor állt, ha a capture MÁR LEFUTOTT ÉS volt
 * marketing-consent — vagyis pont a hibás állapotokban nem.
 */
describe('resolveClickIdFields — a kalkulátor útja', () => {
  it('URL-gclid + TÁROLT gbraid → csak a friss gclid (előtte MINDKETTŐ ment)', () => {
    const out = resolveClickIdFields(new URLSearchParams('?gclid=A'), { gbraid: 'B' });
    expect(out).toEqual({ gclid: 'A', gbraid: null, wbraid: null });
  });

  it('URL-gbraid + TÁROLT gclid → csak a friss gbraid', () => {
    const out = resolveClickIdFields(new URLSearchParams('?gbraid=NEW'), { gclid: 'OLD' });
    expect(out).toEqual({ gclid: null, gbraid: 'NEW', wbraid: null });
  });

  it('tiszta URL → a tárolt marad (a hirdetés marketing-oldalra érkezik)', () => {
    const out = resolveClickIdFields(new URLSearchParams(''), { gbraid: 'B' });
    expect(out).toEqual({ gclid: null, gbraid: 'B', wbraid: null });
  });

  it('sehol semmi → mind null, nem üres string', () => {
    expect(resolveClickIdFields(new URLSearchParams(''), {})).toEqual({
      gclid: null,
      gbraid: null,
      wbraid: null
    });
  });
});

/**
 * A DRÓT külön szabály a TÁROLÁSTÓL. A tárolás PECR-kérdés (mit írunk az
 * eszközre); ez azt dönti el, mit küldünk a saját CRM-ünknek. A kanonikus
 * `collectAttribution` szabályát követjük, hogy a két láb ne mondjon mást.
 */
describe('buildAttribution — mi megy a CRM-nek', () => {
  it('UNKNOWN: UTM mehet, hirdetési klikk-azonosító NEM', () => {
    land('?gclid=ABC&utm_source=google&utm_campaign=nyar');

    const out = buildAttribution();
    expect(out.utm_source).toBe('google');
    expect(out.utm_campaign).toBe('nyar');
    expect(out.gclid, 'consent-döntés nélkül klikk-ID ment a drótra').toBeUndefined();
  });

  it('GRANTED: minden mehet', () => {
    setConsent('GRANTED');
    land('?gclid=ABC&utm_source=google');

    const out = buildAttribution();
    expect(out.gclid).toBe('ABC');
    expect(out.utm_source).toBe('google');
  });

  it('DENIED: az UTM sem megy — a visszavonás a drótra is áll', () => {
    setConsent('GRANTED');
    land('?gclid=ABC&utm_source=google');
    setConsent('DENIED');
    syncAttributionOnConsentChange();

    const out = buildAttribution();
    expect(out.gclid).toBeUndefined();
    expect(out.utm_source).toBeUndefined();
  });
});
