import type { APIRoute } from 'astro';
import { siteConfig } from '@/config/site.config';

export const prerender = true;

export const GET: APIRoute = () => {
  const { rating } = siteConfig.company;

  const body = JSON.stringify({
    rating: rating.value,
    count: rating.count,
    source: 'Google',
    lastUpdated: new Date().toISOString().slice(0, 10),
  });

  return new Response(body, {
    headers: { 'Content-Type': 'application/json' },
  });
};
