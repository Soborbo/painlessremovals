import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A VENDOROLT KANONIKUS MAG SÉRTETLENSÉGE — a site SAJÁT CI-jában.
 *
 * ── Miért itt, és miért nem elég a másik repó ────────────────────────────────
 * A `src/lib/soborbo-tracking/` a `soborbo-tracking` csomag BEMÁSOLT példánya.
 * A Serverside `check:vendored` meg tudja mondani, hogy eltért-e — de az egy
 * MÁSIK repó CI-ja, ami ezt a könyvtárat sosem látja. Egy „gyorsan belejavítok
 * a vendorolt fájlba" változtatás tehát itt CSENDBEN átmenne, és pontosan azt a
 * forkolódást indítaná újra, amit az F9 felszámol.
 *
 * Ezért a kiadás `dist-manifest.json`-je IS bemásolódik, és ez a teszt a site
 * saját tesztfuttatásában veti össze a tartalmat a hash-ekkel.
 *
 * HA EZ A TESZT BUKIK, a helyes lépés NEM a manifeszt frissítése: vagy vissza
 * kell állítani a vendorolt fájlt, vagy a változást a KANONIKUS csomagban kell
 * elvégezni, új verziót kiadni, és ÚJRA vendorolni.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

interface Manifest {
  name: string;
  version: string;
  files: Record<string, { sha256: string; role: string }>;
}

const manifest = JSON.parse(readFileSync(join(HERE, 'dist-manifest.json'), 'utf8')) as Manifest;

/** A hash sorvég-normalizált — a repót Windowson és Linuxon is szerkesztjük. */
function hashContent(text: string): string {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

/** A `lib/` szerepű fájlok — csak ezeket vendoroljuk (a komponenseket nem). */
const LIB_FILES = Object.entries(manifest.files).filter(([rel]) => rel.startsWith('lib/'));

describe(`vendorolt kanonikus mag — ${manifest.name}@${manifest.version}`, () => {
  it('a manifeszt tartalmaz lib-fájlokat (a mérőműszer maga se legyen üres)', () => {
    expect(LIB_FILES.length).toBeGreaterThan(10);
  });

  for (const [rel, meta] of LIB_FILES) {
    const flat = rel.split('/').pop()!;
    it(`${flat} bitre a kiadásé`, () => {
      const text = readFileSync(join(HERE, flat), 'utf8');
      expect(
        hashContent(text),
        `${flat} ELTÉR a ${manifest.version} kiadástól. Ne a manifesztet írd át: ` +
          'állítsd vissza a fájlt, VAGY végezd el a változást a kanonikus csomagban, ' +
          'adj ki új verziót, és vendorold újra.',
      ).toBe(meta.sha256);
    });
  }

  it('nincs a könyvtárban olyan .ts, ami nem a kiadásból való', () => {
    const expected = new Set(LIB_FILES.map(([rel]) => rel.split('/').pop()!));
    // A saját tesztünk nem a kiadásé — az az egyetlen megengedett kivétel.
    expected.add('vendored-integrity.test.ts');
    const actual = readdirSync(HERE).filter((f) => f.endsWith('.ts'));
    const foreign = actual.filter((f) => !expected.has(f));
    expect(
      foreign,
      'idegen fájl a vendorolt könyvtárban — a site saját kódja NEM ide való',
    ).toEqual([]);
  });
});
