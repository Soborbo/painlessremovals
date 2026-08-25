#!/usr/bin/env node
/**
 * Lockfile-teljesség őr — a Windows↔Linux csapda ellen.
 *
 * A Windowson futtatott `npm install|update` KIPUCOLJA a lockfile-ból a más
 * platformra való optional ágakat (wasm32/linux), miközben a Linux-builder
 * ideal-tree-je továbbra is hivatkozik rájuk. Az `npm ci` ott EUSAGE-dzsel bukik
 * ("Missing: @emnapi/runtime@… from lock file") — a fejlesztő gépén viszont
 * MINDEN zöld, a `npm ci --dry-run` is. 2026-08-25-én ez két repó CI-ját fogta meg.
 *
 * Amit mérünk: a lockfile-ban minden deklarált függőség (dependencies,
 * optionalDependencies, devDependencies) FELOLDHATÓ-e a lockon belül, a Node
 * felfelé-kereső feloldásával, ÉS a megtalált bejegyzés verziója kielégíti-e a
 * deklarált range-et. Ez pont az a kérdés, amire az `npm ci` is választ vár,
 * csak platform-függetlenül és egy másodperc alatt.
 *
 * A range-ellenőrzés függőségmentes mini-semver: ^, ~, pontos, >=/>/<=/</=,
 * *, x, részleges verziók (^6, ^2.2), szóközzel AND-elt komparátorok, kötőjeles
 * és `||` uniós range-ek. Amit nem értünk (npm:/git/file/http alias, `latest`,
 * `insiders`, üres string, egyéb) MEGENGEDŐEN kielégítettnek veszünk — az őr
 * célja a hiányzó/rossz ág elkapása, nem a teljes semver-implementáció.
 */
import { readFileSync } from 'node:fs';

const lockPath = process.argv[2] ?? 'package-lock.json';
const pkgs = JSON.parse(readFileSync(lockPath, 'utf8')).packages ?? {};

// ---------- mini-semver ----------
const VER_RE = /^v?(\d+|x|X|\*)?(?:\.(\d+|x|X|\*))?(?:\.(\d+|x|X|\*))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

function parseVersion(v) {
  const m = VER_RE.exec(String(v).trim());
  if (!m) return null;
  const num = (x) => (x === undefined || /^[xX*]$/.test(x) ? null : Number(x));
  return { major: num(m[1]), minor: num(m[2]), patch: num(m[3]), pre: m[4] ? m[4].split('.') : [] };
}

function cmpPre(a, b) {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1; // release > prerelease
  if (b.length === 0) return -1;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    const na = /^\d+$/.test(a[i]);
    const nb = /^\d+$/.test(b[i]);
    if (na && nb) {
      if (+a[i] !== +b[i]) return +a[i] - +b[i];
      continue;
    }
    if (na) return -1;
    if (nb) return 1;
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

function cmp(a, b) {
  for (const k of ['major', 'minor', 'patch']) {
    const x = a[k] ?? 0;
    const y = b[k] ?? 0;
    if (x !== y) return x - y;
  }
  return cmpPre(a.pre, b.pre);
}

/** Egy komparátor (pl. `^1.2`, `>=3.0.0`, `1.x`) → [{op, ver}] lista, vagy null ha nem értjük. */
function parseComparator(c) {
  c = c.trim();
  if (c === '' || c === '*' || /^[xX]$/.test(c)) return [];
  const m = /^(\^|~|>=|<=|>|<|=)?\s*(.+)$/.exec(c);
  if (!m) return null;
  const op = m[1] ?? '';
  const v = parseVersion(m[2]);
  if (!v) return null;
  const { major, minor, patch, pre } = v;
  if (major === null) return [];
  const lo = { major, minor: minor ?? 0, patch: patch ?? 0, pre };
  const below = (maj, min) => ({ op: '<', ver: { major: maj, minor: min, patch: 0, pre: ['0'] } });
  if (op === '>=' || op === '>' || op === '<' || op === '<=') return [{ op, ver: lo }];
  if (op === '' || op === '=') {
    if (minor === null) return [{ op: '>=', ver: lo }, below(major + 1, 0)];
    if (patch === null) return [{ op: '>=', ver: lo }, below(major, minor + 1)];
    return [{ op: '=', ver: lo }];
  }
  if (op === '~') {
    return [{ op: '>=', ver: lo }, minor === null ? below(major + 1, 0) : below(major, minor + 1)];
  }
  // ^
  let hi;
  if (major > 0 || minor === null) hi = below(major + 1, 0);
  else if (minor > 0 || patch === null) hi = below(major, minor + 1);
  else hi = { op: '<', ver: { major, minor, patch: patch + 1, pre: ['0'] } };
  return [{ op: '>=', ver: lo }, hi];
}

function test(op, actual, ver) {
  const d = cmp(actual, ver);
  if (op === '=') return d === 0;
  if (op === '>=') return d >= 0;
  if (op === '>') return d > 0;
  if (op === '<=') return d <= 0;
  return d < 0;
}

/** true = kielégíti VAGY nem tudjuk eldönteni (megengedő). */
function satisfies(version, range) {
  const actual = parseVersion(version);
  if (!actual || actual.major === null) return true; // ismeretlen verzióformátum
  const r = String(range ?? '').trim();
  if (r === '' || r === '*' || r === 'latest') return true;
  if (/^(npm|git|github|file|http|https|git\+\w+):/.test(r) || r.includes('/')) return true; // alias / URL / git
  const alts = r.split('||').map((alt) => {
    const h = /^\s*(\S+)\s+-\s+(\S+)\s*$/.exec(alt); // kötőjeles range: 1.2.3 - 2.3.4
    const parts = h ? [`>=${h[1]}`, `<=${h[2]}`] : alt.trim().split(/\s+/);
    const comps = [];
    for (const p of parts) {
      const c = parseComparator(p);
      if (c === null) return null;
      comps.push(...c);
    }
    return comps;
  });
  if (alts.some((a) => a === null)) return true; // nem értjük → megengedő
  return alts.some((comps) => {
    // Prerelease verzió csak akkor jöhet szóba, ha a komparátor-halmaz VALAMELYIK
    // tagja prerelease-t nevez ugyanazon a major.minor.patch-en (npm-semver szabály).
    if (actual.pre.length) {
      const allowed = comps.some(
        ({ ver }) => ver.pre.length && ver.major === actual.major && ver.minor === actual.minor && ver.patch === actual.patch,
      );
      if (!allowed) return false;
    }
    return comps.every(({ op, ver }) => test(op, actual, ver));
  });
}

// ---------- feloldás ----------
/** Node-feloldás: a fa-útvonalon felfelé keressük a `node_modules/<név>`-et; a talált bejegyzést adjuk vissza. */
function resolve(from, name) {
  let dir = from;
  for (;;) {
    const hit = pkgs[`${dir ? dir + '/' : ''}node_modules/${name}`];
    if (hit) return hit;
    if (!dir) return null;
    const i = dir.lastIndexOf('/node_modules/');
    dir = i === -1 ? '' : dir.slice(0, i);
  }
}

const missing = [];
for (const [key, entry] of Object.entries(pkgs)) {
  if (entry.link) continue; // workspace-link: a célbejegyzés hordozza a függőségeket
  const deps = { ...(entry.dependencies ?? {}), ...(entry.optionalDependencies ?? {}), ...(entry.devDependencies ?? {}) };
  const label = key.replace('node_modules/', '') || '<root>';
  for (const [dep, range] of Object.entries(deps)) {
    const found = resolve(key, dep);
    if (!found) missing.push(`${label} → ${dep} (hiányzik; kért: ${range})`);
    else if (!satisfies(found.version, range)) missing.push(`${label} → ${dep} (talált: ${found.version}, kért: ${range})`);
  }
}

if (missing.length === 0) {
  console.log(`check-lockfile: OK — ${Object.keys(pkgs).length} bejegyzés, minden függőség feloldható és range-helyes.`);
  process.exit(0);
}
console.error(`check-lockfile: ${missing.length} FELOLDHATATLAN függőség a ${lockPath}-ban:`);
for (const m of missing.slice(0, 20)) console.error('  -', m);
console.error('\nEz Linuxon `npm ci` hibát ad (EUSAGE / "Missing … from lock file").');
console.error('Ok: Windowson futtatott npm install/update kipucolta a más-platformos ágakat.');
console.error('Javítás: a hiányzó bejegyzések visszapótlása a main lockfile-jából (resolved+integrity),');
console.error('a lock-írás UTOLSÓ lépéseként — egy újabb `npm install` ismét kiütné őket.');
process.exit(1);
