/**
 * Responsive image patterns from astro-images skill.
 * Pattern = rendered width. Aspect ratio is independent.
 * Browser downloads: sizes CSS px × device DPR.
 */

// Union of all widths the optimize-images script generates. Must stay in sync with scripts/optimize-images.mjs.
export const ALL_WIDTHS = [
  80, 128, 160, 192, 256, 320, 384, 427, 480, 512, 640, 750, 768,
  828, 853, 960, 1024, 1080, 1200, 1280, 1536, 1600, 1706,
  1920, 2048, 2560,
] as const;

export const patterns = {
  FULL:        { widths: [640, 750, 828, 1080, 1200, 1920, 2048, 2560], sizes: '100vw' },
  TWO_THIRDS:  { widths: [384, 640, 768, 1024, 1280, 1706, 2048],      sizes: '(min-width:1024px) 66vw, 100vw' },
  LARGE:       { widths: [384, 640, 768, 1024, 1280, 1536, 1920],      sizes: '(min-width:1024px) 60vw, 100vw' },
  HALF:        { widths: [320, 640, 960, 1280, 1600],                   sizes: '(min-width:1024px) 50vw, 100vw' },
  HALF_CARD:   { widths: [480, 640, 828, 960, 1280],                    sizes: '(max-width:768px) 100vw, 464px' },
  SMALL:       { widths: [256, 512, 640, 1024, 1280],                   sizes: '(min-width:1024px) 40vw, 100vw' },
  THIRD:       { widths: [256, 512, 640, 853, 1280],                    sizes: '(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw' },
  QUARTER:     { widths: [192, 384, 512, 640, 960],                     sizes: '(min-width:1024px) 25vw, (min-width:640px) 50vw, 100vw' },
  FIFTH:       { widths: [160, 320, 512, 640, 768],                     sizes: '(min-width:1024px) 20vw, (min-width:640px) 33vw, 50vw' },
  SIXTH:       { widths: [128, 256, 427, 512, 640],                     sizes: '(min-width:1024px) 16vw, (min-width:640px) 33vw, 50vw' },
  LOGO:        { widths: [128, 160, 256, 320],                          sizes: '(min-width:640px) 180px, 140px' },
  ICON:        { widths: [80, 160, 256],                                sizes: '100px' },
} as const;

export type PatternName = keyof typeof patterns;
