// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { normalizeEmailIdentity } from '@/lib/soborbo-tracking/email-identity';

/**
 * A RESTORE-HATÁR ELFOGADÁSI SZABÁLYA UGYANAZ, MINT A BEVITELI KAPUÉ.
 *
 * A `LocalStorageStateSchema` nem kényelmi validáció: ez a MANIPULÁLT
 * `sessionStorage` bizalmi határa (XSS-mitigációként került be). Az e-mail
 * mezője viszont `z.string().max(255)` volt — UTF-16 kódegységben mérve —,
 * miközben az EGYETLEN író (`Step11Contact` → `validateEmailField`) és a
 * szerver (`/api/save-quote`, `/api/callbacks`) egyaránt az `emailSchema`-t
 * futtatja: trim → lowercase → `z.email()` → 254 OKTET → identity-őr.
 *
 *   Step11 ───────┐
 *   API ──────────┼── emailSchema = EGY elfogadási authority
 *   restore ──────┘
 *                        │
 *                 normalizeEmailIdentity
 *                   identity-authority
 *
 * MIÉRT NEM ELÉG EGY `normalizeEmailIdentity`-refine: az szándékosan CSAK
 * identitás-normalizáló (nem üres, van `@`, ≤254 oktet). Egy rövid, hibás alakú
 * `a@b` átmegy rajta, az `emailSchema`-n nem — a 6. eset ezt bizonyítja is,
 * nem csak állítja.
 *
 * SÉRÜLÉS ESETÉN AZ EGÉSZ BLOB ELVÉSZ (7. eset). Egy bizalmi határon a részleges
 * mentés második helyreállítási politikát nyitna, aminek megint saját
 * invariánsai és tesztjei kellenének.
 */

const CALC_KEY = 'painless_calc_state';

/** Érvényes snapshot; a `contact` minden mezője kötelező (a `.partial()` csak
 *  a legfelső szintet lazítja). A `propertySize` a nem-e-mail állapot próbája. */
function snapshot(email: string): Record<string, unknown> {
  return {
    currentStep: 11,
    startedAt: '2026-08-26T10:00:00.000Z',
    lastUpdatedAt: '2026-08-26T10:05:00.000Z',
    serviceType: 'home',
    propertySize: '3-bed',
    contact: {
      firstName: 'Jane',
      lastName: 'Doe',
      phone: '07123456789',
      email,
      gdprConsent: true,
      marketingConsent: false,
    },
  };
}

async function restore(email: string) {
  sessionStorage.setItem(CALC_KEY, JSON.stringify(snapshot(email)));
  // A store modul-szintű `map`-et tart; minden esethez tiszta példány kell.
  vi.resetModules();
  const store = await import('./calculator-store');
  store.initializeStore();
  return store.calculatorStore.get();
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({}, '', '/instantquote/');
});

describe('restore-határ — elfogadott e-mailek', () => {
  it('1. érvényes cím → visszaáll', async () => {
    const state = await restore('jane@example.com');
    expect(state.contact.email).toBe('jane@example.com');
  });

  it('2. üres string → visszaáll (a Step11 ELŐTTI legitim állapot)', async () => {
    const state = await restore('');
    expect(state.contact.email).toBe('');
    expect(state.propertySize).toBe('3-bed');
  });

  it('3. "  User@Example.COM  " → elfogadva ÉS KANONIZÁLVA áll vissza', async () => {
    // Az `emailSchema` transzformál is (trim + lowercase), nem csak ítél. A
    // restore így nem hagyhat nem-kanonikus alakot a store-ban, amit aztán a
    // PII side-channel és a submit is örökölne.
    const state = await restore('  User@Example.COM  ');
    expect(state.contact.email).toBe('user@example.com');
  });

  it('8. az érvényes snapshot NEM e-mail állapota érintetlen', async () => {
    const state = await restore('jane@example.com');
    expect(state.currentStep).toBe(11);
    expect(state.serviceType).toBe('home');
    expect(state.propertySize).toBe('3-bed');
    expect(state.contact.firstName).toBe('Jane');
    expect(state.contact.gdprConsent).toBe(true);
  });
});

describe('restore-határ — elutasított e-mailek (a beviteli kapuval azonos szabály)', () => {
  it('4. 255 BÁJTOS, érvényes alakú ASCII cím → elutasítva (a kapu 254 oktetnél húz)', async () => {
    const long = `${'a'.repeat(243)}@example.com`;
    expect(long).toHaveLength(255);
    const state = await restore(long);
    expect(state.contact.email).toBe('');
  });

  it('5. >254 oktetes multibyte cím → elutasítva', async () => {
    // 200 × `é` = 400 oktet. A `z.email()` regexe ráadásul ASCII-only, tehát a
    // kapu alakilag is elutasítja — a lényeg, hogy a restore UGYANOTT húz, ahol
    // a Step11: egy ilyen címet a felhasználó be sem tudott volna vinni.
    const multibyte = `${'é'.repeat(200)}@example.com`;
    expect(multibyte.length).toBeLessThanOrEqual(255);
    const state = await restore(multibyte);
    expect(state.contact.email).toBe('');
  });

  it('6. rövid, hibás alakú `a@b` → elutasítva (az identity-őr ITT ÁTENGEDNÉ)', async () => {
    // Ez a különbség a két authority között, mérve: a `normalizeEmailIdentity`
    // elfogadja (nem üres, van `@`, ≤254 oktet), tehát egy identity-refine-os
    // restore-séma is elfogadta volna. Az `emailSchema` (min 5 + `z.email()`)
    // nem — és a beviteli kapu is ezt futtatja.
    expect(normalizeEmailIdentity('a@b')).toBe('a@b');
    const state = await restore('a@b');
    expect(state.contact.email).toBe('');
  });

  it('7. sérülés esetén az EGÉSZ blob elvész: a nem-e-mail állapot sem áll vissza, a snapshot törlődik', async () => {
    const state = await restore('a@b');
    expect(state.propertySize).toBeNull();
    expect(state.serviceType).toBeNull();
    expect(state.contact.firstName).toBe('');
    expect(state.currentStep).toBe(1);
    expect(sessionStorage.getItem(CALC_KEY)).toBeNull();
  });
});
