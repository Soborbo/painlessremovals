/**
 * Video Sitemap — Auto-generated from packing-guide content collection
 *
 * Lists all lesson pages with YouTube player_loc, thumbnail, and duration.
 * Referenced in robots.txt.
 */

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { siteConfig } from '@/config/site.config';

export const GET: APIRoute = async () => {
  const lessons = await getCollection('packing-guide');
  const domain = siteConfig.brand.domain;

  const urls = lessons
    .sort((a, b) => a.data.order - b.data.order)
    .map((lesson) => {
      const id = lesson.data.youtubeId;
      const slug = lesson.id.replace(/\.md$/, '');
      return `
  <url>
    <loc>${domain}/packing-guide/${slug}/</loc>
    <video:video>
      <video:thumbnail_loc>https://img.youtube.com/vi/${id}/maxresdefault.jpg</video:thumbnail_loc>
      <video:title><![CDATA[${lesson.data.title}]]></video:title>
      <video:description><![CDATA[${lesson.data.description}]]></video:description>
      <video:player_loc>https://www.youtube.com/embed/${id}</video:player_loc>
      <video:duration>${lesson.data.durationMinutes * 60}</video:duration>
    </video:video>
  </url>`;
    })
    .join('');

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${urls}
</urlset>`,
    { headers: { 'Content-Type': 'application/xml' } },
  );
};
