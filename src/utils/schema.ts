/**
 * Schema.org JSON-LD Utility
 *
 * Pro-level entity-linked schema architecture.
 * Every schema references canonical @id anchors — no duplicate entities.
 *
 * Entity graph:
 *   /#business        → MovingCompany (defined in Layout.astro)
 *   /#website         → WebSite (defined on homepage)
 *   /#logo            → ImageObject (defined in Layout.astro)
 *   /about/jay-newton#person → Person (defined on profile page)
 */

import { siteConfig } from '@/config/site.config';

const domain = siteConfig.brand.domain;

// ── Canonical @id anchors ─────────────────────────────────────────────────────

export const ENTITY = {
  business: `${domain}/#business`,
  website: `${domain}/#website`,
  logo: `${domain}/#logo`,
  person: `${domain}/about/jay-newton/#person`,
} as const;

// ── Thin @id references (use these in page schemas) ──────────────────────────

export const ref = {
  business: () => ({ "@id": ENTITY.business } as const),
  website: () => ({ "@id": ENTITY.website } as const),
  logo: () => ({ "@id": ENTITY.logo } as const),
  person: () => ({ "@id": ENTITY.person } as const),
};

// ── BreadcrumbList builder ───────────────────────────────────────────────────

export function breadcrumbs(items: Array<{ name: string; path?: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": items.map((item, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "name": item.name,
      ...(item.path ? { "item": `${domain}${item.path}` } : {}),
    })),
  };
}

// ── Service schema builder ──────────────────────────────────────────────────

interface ServiceOpts {
  name: string;
  description: string;
  serviceType: string;
  url: string;
  areaServed?: object | object[];
  offers?: object | object[];
  hasOfferCatalog?: object;
  image?: string;
}

export function service(opts: ServiceOpts) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": `${domain}${opts.url}#service`,
    "name": opts.name,
    "description": opts.description,
    "serviceType": opts.serviceType,
    "url": `${domain}${opts.url}`,
    "provider": ref.business(),
    ...(opts.areaServed ? { "areaServed": opts.areaServed } : {}),
    ...(opts.offers ? { "offers": opts.offers } : {}),
    ...(opts.hasOfferCatalog ? { "hasOfferCatalog": opts.hasOfferCatalog } : {}),
    ...(opts.image ? { "image": `${domain}${opts.image}` } : {}),
  };
}

// ── Offer builder ───────────────────────────────────────────────────────────

export function offer(opts: {
  price: string | number;
  description: string;
  name?: string;
  priceValidUntil?: string;
}) {
  return {
    "@type": "Offer",
    ...(opts.name ? { "name": opts.name } : {}),
    "priceCurrency": "GBP",
    "price": String(opts.price),
    "description": opts.description,
    "availability": "https://schema.org/InStock",
    ...(opts.priceValidUntil ? { "priceValidUntil": opts.priceValidUntil } : {}),
  };
}

// ── FAQPage schema builder ──────────────────────────────────────────────────

export function faqPage(faqs: Array<{ question: string; answer: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(f => ({
      "@type": "Question",
      "name": f.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": f.answer.replace(/<[^>]*>/g, ''),
      },
    })),
  };
}

// ── Article schema builder ──────────────────────────────────────────────────

interface ArticleOpts {
  headline: string;
  description: string;
  url: string;
  datePublished: string;
  dateModified: string;
  image?: string;
}

export function article(opts: ArticleOpts) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": opts.headline,
    "description": opts.description,
    "url": `${domain}${opts.url}`,
    "author": ref.person(),
    "publisher": ref.business(),
    "datePublished": opts.datePublished,
    "dateModified": opts.dateModified,
    ...(opts.image ? { "image": `${domain}${opts.image}` } : {}),
    "inLanguage": "en-GB",
  };
}

// ── HowTo schema builder ───────────────────────────────────────────────────

interface HowToOpts {
  name: string;
  description: string;
  steps: Array<{ name: string; text: string; image?: string; url?: string }>;
  totalTime?: string;
  image?: string;
}

export function howTo(opts: HowToOpts) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": opts.name,
    "description": opts.description,
    ...(opts.totalTime ? { "totalTime": opts.totalTime } : {}),
    ...(opts.image ? { "image": `${domain}${opts.image}` } : {}),
    "step": opts.steps.map((s, i) => ({
      "@type": "HowToStep",
      "position": i + 1,
      "name": s.name,
      "text": s.text,
      ...(s.image ? { "image": `${domain}${s.image}` } : {}),
      ...(s.url ? { "url": `${domain}${s.url}` } : {}),
    })),
  };
}

// ── VideoObject builder ─────────────────────────────────────────────────────

export function video(opts: {
  name: string;
  description: string;
  thumbnailUrl: string;
  uploadDate: string;
  embedUrl?: string;
  duration?: string;
}) {
  return {
    "@type": "VideoObject",
    "name": opts.name,
    "description": opts.description,
    "thumbnailUrl": opts.thumbnailUrl,
    "uploadDate": opts.uploadDate,
    ...(opts.embedUrl ? { "embedUrl": opts.embedUrl } : {}),
    ...(opts.duration ? { "duration": opts.duration } : {}),
  };
}

// ── ServiceArea helpers ─────────────────────────────────────────────────────

export const areas = {
  bristol: { "@type": "City", "name": "Bristol", "sameAs": "https://en.wikipedia.org/wiki/Bristol" } as const,
  bath: { "@type": "City", "name": "Bath", "sameAs": "https://en.wikipedia.org/wiki/Bath,_Somerset" } as const,
  weston: { "@type": "City", "name": "Weston-super-Mare", "sameAs": "https://en.wikipedia.org/wiki/Weston-super-Mare" } as const,
  southWest: { "@type": "AdministrativeArea", "name": "South West England" } as const,
  uk: { "@type": "Country", "name": "United Kingdom", "sameAs": "https://en.wikipedia.org/wiki/United_Kingdom" } as const,

  place: (name: string, postcode: string) => ({
    "@type": "Place",
    "name": name,
    "address": {
      "@type": "PostalAddress",
      "postalCode": postcode,
      "addressLocality": "Bristol",
      "addressCountry": "GB",
    },
  }),

  city: (name: string, sameAs?: string) => ({
    "@type": "City",
    "name": name,
    ...(sameAs ? { sameAs } : {}),
  }),
};
