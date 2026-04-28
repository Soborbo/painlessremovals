/**
 * Responsive LCP preload helper.
 *
 * Builds `imagesrcset` + `imagesizes` attributes for `<link rel="preload" as="image">`
 * so the browser preloads the SAME width it will pick from the rendered <picture>.
 *
 * A bare `href`-only preload preloads ONE specific URL, which usually won't match
 * the responsive choice — wasting the preload and double-downloading the image.
 */

import { patterns, ALL_WIDTHS, type PatternName } from '@/config/image-patterns';
import imageData from '@/data/image-data.json';

export type PreloadFormat = 'avif' | 'webp' | 'jpg';

export interface PreloadAttrs {
  href: string;
  imagesrcset: string;
  imagesizes: string;
  type: string;
}

const MIME_TYPES: Record<PreloadFormat, string> = {
  avif: 'image/avif',
  webp: 'image/webp',
  jpg: 'image/jpeg',
};

interface Options {
  /** Format to preload. Default 'avif' — covers ~95% of mobile browsers. */
  format?: PreloadFormat;
  /** Override the pattern's `sizes`. Use when the LCP image has a different layout per breakpoint. */
  sizes?: string;
}

export function getLcpPreload(
  name: string,
  pattern: PatternName,
  opts: Options = {},
): PreloadAttrs {
  const format = opts.format ?? 'avif';
  const patternDef = patterns[pattern];
  if (!patternDef) {
    throw new Error(`getLcpPreload: unknown pattern "${pattern}"`);
  }

  const meta = (imageData as Record<string, { width: number; height: number; format: string }>)[name];
  if (!meta) {
    throw new Error(`getLcpPreload: no metadata for "${name}". Run "npm run images" first.`);
  }

  // Mirror OptimizedPicture's width-filtering: don't list widths the image isn't large enough for
  let availableWidths = patternDef.widths.filter((w) => w <= meta.width);
  if (availableWidths.length === 0) {
    availableWidths = [patternDef.widths[0]];
  }

  // Fallback href: largest generated width ≤ source width
  const fallbackWidth = [...ALL_WIDTHS].reverse().find((w) => w <= meta.width) ?? ALL_WIDTHS[0];

  return {
    href: `/img/${name}-${fallbackWidth}w.${format}`,
    imagesrcset: availableWidths.map((w) => `/img/${name}-${w}w.${format} ${w}w`).join(', '),
    imagesizes: opts.sizes ?? patternDef.sizes,
    type: MIME_TYPES[format],
  };
}
