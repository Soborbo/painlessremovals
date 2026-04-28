import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Walks src/pages/ at build time, extracts dateModified from each .astro file,
 * and returns a pathname → ISO-date map.  No manual maintenance needed — the
 * single source of truth is the dateModified inside each page's JSON-LD schema.
 */

// fileURLToPath handles Windows drive-letter URLs correctly; URL.pathname does not.
const pagesDir = fileURLToPath(new URL('../pages', import.meta.url));

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else if (full.endsWith('.astro')) {
      files.push(full);
    }
  }
  return files;
}

function fileToPathname(file: string): string {
  let rel = relative(pagesDir, file).replace(/\.astro$/, '');
  // index files map to the directory itself
  rel = rel.replace(/(^|\/|\/)index$/, '$1');
  // normalise separators and ensure leading + trailing slash
  let pathname = '/' + rel.split(sep).join('/');
  if (!pathname.endsWith('/')) pathname += '/';
  return pathname;
}

const dateModifiedRe = /["']?dateModified["']?\s*[:=]\s*["'](\d{4}-\d{2}-\d{2})["']/;

export const lastmod: Record<string, string> = {};

for (const file of walk(pagesDir)) {
  const src = readFileSync(file, 'utf-8');
  const match = dateModifiedRe.exec(src);
  if (match) {
    lastmod[fileToPathname(file)] = match[1];
  }
}
