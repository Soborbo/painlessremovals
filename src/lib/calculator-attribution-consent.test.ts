// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * A KALKULÁTOR-STATE MÁSODIK PRE-CONSENT ÚTJA.
 *
 * A `pr_tracking` store consent-kapuja (utm-capture) önmagában NEM elég: a
 * kalkulátornak SAJÁT `sessionStorage` snapshotja van (`painless_calc_state`),
 * amit a `saveState()` minden lépésváltásnál kiír — és az `initializeStore()`
 * consent-ellenőrzés nélkül töltötte bele a klikk-ID-ket az URL-ből.
 *
 *   landing /instantquote/?gclid=ABC   consent = UNKNOWN
 *     pr_tracking          → nincs írás            ✅
 *     painless_calc_state  → gclid = ABC           ❌  ← ez a fájl zárja le
 *
 * És nem áll meg a tárolásnál: a Step12 / ResultPage a KALKULÁTOR STATE-ből
 * építette a `/api/save-quote` payloadot, ami a CRM-be és a gateway
 * attribution-jébe is továbbmegy. Vagyis a „consent nélkül klikk-ID nem megy a
 * drótra" invariáns ezen az úton nem állt.
 *
 * A javítás iránya nem újabb consent-másolat, hanem AUTHORITY-ELVÉTEL: a
 * kalkulátor state nem attribúció-forrás. Az attribúciót submitkor a
 * consent-aware `buildAttribution()` adja.
 */

const CALC_KEY = 'painless_calc_state';
const AD_KEYS = ['gclid', 'gbraid', 'wbraid', 'fbclid'] as const;

function setConsent(ad: 'GRANTED' | 'DENIED' | undefined): void {
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

function persisted(): Record<string, unknown> {
  const raw = sessionStorage.getItem(CALC_KEY);
  return raw ? JSON.parse(raw) : {};
}

async function freshStore() {
  // A store modul-szintű `map`-et tart; minden esethez tiszta példány kell.
  vi.resetModules();
  return await import('./calculator-store');
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  document.cookie.split(';').forEach((c) => {
    document.cookie = `${c.split('=')[0]!.trim()}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  });
  setConsent(undefined);
  window.history.replaceState({}, '', '/instantquote/');
});

describe('UNKNOWN consent — a kalkulátor snapshotja nem hordozhat klikk-ID-t', () => {
  it('?gclid=A landolás után a persistált state-ben nincs gclid', async () => {
    window.history.replaceState({}, '', '/instantquote/?gclid=A');
    const store = await freshStore();
    store.initializeStore();
    store.saveState();

    const snap = persisted();
    for (const k of AD_KEYS) {
      expect(snap[k], `${k} consent-döntés nélkül a kalkulátor snapshotjába került`).toBeFalsy();
    }
  });

  it('lépésváltás (goToStep → saveState) sem szivárogtat', async () => {
    window.history.replaceState({}, '', '/instantquote/?gbraid=B&fbclid=F');
    const store = await freshStore();
    store.initializeStore();
    store.goToStep(2, false);

    const snap = persisted();
    expect(snap.gbraid).toBeFalsy();
    expect(snap.fbclid).toBeFalsy();
  });

  it('a submit-payloadban sincs klikk-ID (a drót ugyanaz a szabály)', async () => {
    window.history.replaceState({}, '', '/instantquote/?gclid=A&fbclid=F&utm_source=google');
    const store = await freshStore();
    store.initializeStore();

    const data = store.getSubmissionData() as Record<string, unknown>;
    expect(data.gclid, 'consent nélkül klikk-ID ment a /api/save-quote payloadba').toBeFalsy();
    expect(data.fbclid).toBeFalsy();
    // Az UTM a jóváhagyott policy szerint mehet döntés nélkül is.
    expect(data.utmSource).toBe('google');
  });
});

describe('GRANTED consent', () => {
  it('a klikk-ID bekerül a submit-payloadba', async () => {
    setConsent('GRANTED');
    window.history.replaceState({}, '', '/instantquote/?gclid=A&utm_source=google');
    const store = await freshStore();
    store.initializeStore();

    const data = store.getSubmissionData() as Record<string, unknown>;
    expect(data.gclid).toBe('A');
    expect(data.utmSource).toBe('google');
  });

  it('a kizárás a kanonikus primitívé: friss gbraid mellett nincs gclid', async () => {
    setConsent('GRANTED');
    window.history.replaceState({}, '', '/instantquote/?gbraid=NEW');
    const store = await freshStore();
    store.initializeStore();

    const data = store.getSubmissionData() as Record<string, unknown>;
    expect(data.gbraid).toBe('NEW');
    expect(data.gclid).toBeFalsy();
  });

  it('a kalkulátor snapshotja AKKOR SEM tárol klikk-ID-t — nem ő az authority', async () => {
    setConsent('GRANTED');
    window.history.replaceState({}, '', '/instantquote/?gclid=A');
    const store = await freshStore();
    store.initializeStore();
    store.saveState();

    expect(persisted().gclid, 'a kalkulátor state újra attribúció-forrás lett').toBeFalsy();
  });
});

describe('GRANTED → DENIED', () => {
  it('a submit-payloadból eltűnik a klikk-ID', async () => {
    setConsent('GRANTED');
    window.history.replaceState({}, '', '/instantquote/?gclid=A');
    const store = await freshStore();
    store.initializeStore();
    expect((store.getSubmissionData() as Record<string, unknown>).gclid).toBe('A');

    setConsent('DENIED');
    const data = store.getSubmissionData() as Record<string, unknown>;
    expect(data.gclid, 'a visszavonás után is ment klikk-ID a drótra').toBeFalsy();
    expect(data.utmSource, 'DENIED alatt marketing-attribúció nem mehet').toBeFalsy();
  });
});

describe('örökölt snapshot — a deploy előtt kiírt state', () => {
  it('a visszatöltéskor a klikk-ID nem éled újra', async () => {
    sessionStorage.setItem(
      CALC_KEY,
      JSON.stringify({ currentStep: 3, sessionId: 'sess-1', gclid: 'REGI', fbclid: 'REGI-FB' })
    );
    const store = await freshStore();
    store.initializeStore();
    store.saveState();

    expect(persisted().gclid, 'egy régi snapshot visszahozta a pre-consent klikk-ID-t').toBeFalsy();
    expect(persisted().fbclid).toBeFalsy();
    expect((store.getSubmissionData() as Record<string, unknown>).gclid).toBeFalsy();
  });
});
