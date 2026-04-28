#!/usr/bin/env node

/**
 * Pre-processes images from src/assets/images/ into public/img/
 * Generates avif + webp variants at all pattern widths.
 * Also outputs src/data/image-data.json with metadata for the OptimizedPicture component.
 *
 * Usage:
 *   node scripts/optimize-images.mjs          # incremental (skips unchanged)
 *   node scripts/optimize-images.mjs --force  # regenerate everything
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src', 'assets', 'images');
const OUT_DIR = path.join(ROOT, 'public', 'img');
const DATA_FILE = path.join(ROOT, 'src', 'data', 'image-data.json');
const CACHE_FILE = path.join(__dirname, '.image-cache.json');

const QUALITY = 60;
const FORCE = process.argv.includes('--force');

// Union of all pattern widths (sorted, deduplicated).
// Every width that appears in any pattern must be here for srcset to work correctly.
// Must stay in sync with `ALL_WIDTHS` in src/config/image-patterns.ts.
const ALL_WIDTHS = [
  80, 128, 160, 192, 256, 320, 384, 427, 480, 512, 640, 750, 768,
  828, 853, 960, 1024, 1080, 1200, 1280, 1536, 1600, 1706,
  1920, 2048, 2560,
];

// Cache-key salt: invalidates the cache automatically whenever ALL_WIDTHS changes
// (adding or removing a width). Without this, adding a width would silently skip
// cached images and never generate the new variant.
const WIDTHS_HASH = crypto
  .createHash('sha1')
  .update(ALL_WIDTHS.join(','))
  .digest('hex')
  .slice(0, 8);

async function main() {
  // Dynamic import sharp (ESM)
  const sharp = (await import('sharp')).default;

  // Load cache
  let cache = {};
  if (!FORCE && fs.existsSync(CACHE_FILE)) {
    try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { cache = {}; }
  }

  // Ensure output dirs exist
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });

  // Load existing image-data.json so entries for images not in src/ are preserved
  let existingData = {};
  if (fs.existsSync(DATA_FILE)) {
    try { existingData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { existingData = {}; }
  }

  // Find all source images
  const sourceFiles = findImages(SRC_DIR);
  console.log(`Found ${sourceFiles.length} source images in src/assets/images/`);

  // Start with existing data so entries whose source is missing are kept
  const imageData = { ...existingData };
  const newCache = {};
  const currentNames = new Set();
  let processed = 0;
  let skipped = 0;

  // Process with concurrency limit
  const concurrency = Math.max(1, os.cpus().length);
  const queue = [...sourceFiles];

  async function worker() {
    while (queue.length > 0) {
      const srcPath = queue.shift();
      if (!srcPath) break;

      const relPath = path.relative(SRC_DIR, srcPath).replace(/\\/g, '/');
      const name = relPath.replace(/\.[^.]+$/, ''); // strip extension
      currentNames.add(name);
      const ext = path.extname(srcPath).toLowerCase();
      const stat = fs.statSync(srcPath);
      const cacheKey = `${relPath}:${stat.mtimeMs}:${stat.size}:w${WIDTHS_HASH}`;

      // Check cache (includes stored metadata to avoid re-reading with sharp)
      if (!FORCE && cache[relPath] && cache[relPath].key === cacheKey) {
        imageData[name] = cache[relPath].meta;
        skipped++;
        newCache[relPath] = cache[relPath];
        continue;
      }

      try {
        const meta = await sharp(srcPath).metadata();
        const fallbackExt = getFallbackExt(ext, meta);
        const isAlpha = fallbackExt === 'png';

        imageData[name] = {
          width: meta.width,
          height: meta.height,
          format: fallbackExt,
        };

        // Only generate pattern widths <= source width (no source-width extras)
        const widths = ALL_WIDTHS.filter(w => w <= meta.width);

        // Ensure output subdirectory exists
        const outSubDir = path.join(OUT_DIR, path.dirname(relPath).replace(/\\/g, '/'));
        fs.mkdirSync(outSubDir, { recursive: true });

        const baseName = path.basename(name);
        const subDir = path.dirname(relPath).replace(/\\/g, '/');

        for (const w of widths) {
          const resized = sharp(srcPath).resize(w, null, { withoutEnlargement: true }).withMetadata(false);

          // AVIF
          const avifPath = path.join(OUT_DIR, subDir, `${baseName}-${w}w.avif`);
          await resized.clone().avif({ quality: QUALITY }).toFile(avifPath);

          // WebP
          const webpPath = path.join(OUT_DIR, subDir, `${baseName}-${w}w.webp`);
          await resized.clone().webp({ quality: QUALITY }).toFile(webpPath);

          // Fallback at largest width only
          if (w === widths[widths.length - 1]) {
            const fallbackPath = path.join(OUT_DIR, subDir, `${baseName}-${w}w.${fallbackExt}`);
            if (fallbackExt === 'webp') {
              // Already generated above, skip duplicate
            } else if (isAlpha) {
              await resized.clone().png({ compressionLevel: 9 }).toFile(fallbackPath);
            } else {
              await resized.clone().jpeg({ quality: QUALITY }).toFile(fallbackPath);
            }
          }
        }

        newCache[relPath] = { key: cacheKey, meta: imageData[name] };
        processed++;
        process.stdout.write(`\r  Processed: ${processed} | Skipped: ${skipped} | Remaining: ${sourceFiles.length - processed - skipped}`);
      } catch (err) {
        console.error(`\nError processing ${relPath}: ${err.message}`);
      }
    }
  }

  // Launch workers
  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  console.log(`\n\nDone! Processed: ${processed} | Skipped: ${skipped} | Total: ${sourceFiles.length}`);

  // Warn about entries kept from previous data but missing from source
  const orphaned = Object.keys(imageData).filter(name => !currentNames.has(name));
  if (orphaned.length > 0) {
    console.log(`\n⚠ ${orphaned.length} image(s) in image-data.json have no source file (kept):`);
    orphaned.forEach(name => console.log(`    ${name}`));
  }

  // Write metadata
  const sortedData = Object.fromEntries(Object.entries(imageData).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(DATA_FILE, JSON.stringify(sortedData, null, 2) + '\n');
  console.log(`Wrote ${Object.keys(sortedData).length} entries to src/data/image-data.json`);

  // Write cache
  fs.writeFileSync(CACHE_FILE, JSON.stringify(newCache, null, 2));
}

function findImages(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findImages(full));
    } else if (/\.(jpe?g|png|webp)$/i.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

function getFallbackExt(ext, meta) {
  if (ext === '.webp') return 'webp';
  if (ext === '.png' || (meta.channels === 4 && meta.hasAlpha)) return 'png';
  return 'jpg';
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
