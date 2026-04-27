/**
 * Pre-build script: fetches live review stats and writes to src/lib/review-config.ts
 * Runs before `astro build` so the values are baked into the static output.
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT_FILE = resolve(import.meta.dirname, '../src/lib/review-config.ts');
const SOURCE_URL = 'https://painlessremovals.com/data/reviews.json';

const FALLBACK = {
  rating: 4.98,
  count: 123,
  source: 'google',
  lastUpdated: '2026-03-01',
};

async function run() {
  let stats = FALLBACK;

  try {
    const res = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      stats = await res.json() as typeof FALLBACK;
      console.log(`[fetch-reviews] Fetched: rating=${stats.rating}, count=${stats.count}`);
    } else {
      console.warn(`[fetch-reviews] HTTP ${res.status} — using fallback values`);
    }
  } catch (err) {
    console.warn(`[fetch-reviews] Fetch failed — using fallback values:`, err);
  }

  const content = `/**
 * REVIEW STATS CONFIG
 *
 * AUTO-UPDATED at build time by scripts/fetch-reviews.ts
 * Source: ${SOURCE_URL}
 *
 * Do not edit manually — values are overwritten on every build.
 */
export const REVIEW_STATS = {
  rating: ${stats.rating},
  count: ${stats.count},
  source: '${stats.source}',
  lastUpdated: '${stats.lastUpdated}',
} as const;
`;

  writeFileSync(OUT_FILE, content, 'utf-8');
  console.log(`[fetch-reviews] Written to src/lib/review-config.ts`);
}

run();
