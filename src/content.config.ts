import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const packingGuide = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/packing-guide' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    metaTitle: z.string(),
    youtubeId: z.string(),
    durationMinutes: z.number(),
    order: z.number(),
    targetKeyword: z.string(),
    relatedLessons: z.array(z.string()).optional(),
    proTip: z.object({
      quote: z.string(),
      context: z.string().optional(),
    }).optional(),
    commonMistakes: z.array(z.object({
      title: z.string(),
      description: z.string(),
    })).optional(),
    checklist: z.object({
      heading: z.string(),
      items: z.array(z.string()),
    }).optional(),
  }),
});

export const collections = { 'packing-guide': packingGuide };
