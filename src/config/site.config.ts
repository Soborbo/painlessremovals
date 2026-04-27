/**
 * Site Configuration
 *
 * Central configuration for Painless Removals website.
 */

export const siteConfig = {
  // ==========================================================================
  // Brand
  // ==========================================================================
  brand: {
    name: 'Painless Removals',
    tagline: 'Just be excited for your move. We\'ll handle everything else.',
    domain: 'https://painlessremovals.com',
    primaryColor: '#3b6587', // Steel Blue
    secondaryColor: '#C65D3B', // Terracotta
    logo: '/images/logo.svg',
    logoAlt: 'Painless Removals logo',
    favicon: '/favicon.ico',
    ogImageFallback: '/images/og-default.png',
  },

  // ==========================================================================
  // Locale & Formatting
  // ==========================================================================
  locale: {
    default: 'en-GB',
    supported: ['en-GB'],
    currency: 'GBP',
    dateFormat: 'en-GB',
  },

  // ==========================================================================
  // Company Information
  // ==========================================================================
  company: {
    name: 'Painless Removals Ltd',
    legalName: 'Painless Removals Ltd',
    shortName: 'Painless Removals',
    foundingDate: '1978',

    address: {
      streetAddress: '290-294 Southmead Rd',
      addressLocality: 'Bristol',
      addressRegion: 'Bristol',
      postalCode: 'BS10 5EN',
      addressCountry: 'GB',
    },

    geo: {
      latitude: 51.4977,
      longitude: -2.5959,
    },

    contact: {
      phone: '0117 287 0082',
      phoneInternational: '+44-117-287-0082',
      whatsapp: '447565772430',
      whatsappDisplay: '07565 772430',
      email: 'hello@painlessremovals.com',
      // Social links
      facebook: 'https://www.facebook.com/painlessremovals',
      instagram: 'https://www.instagram.com/painlessremovals',
      linkedin: 'https://www.linkedin.com/company/painless-removals',
      googleBusiness: 'https://www.google.com/maps?cid=10222747834737099273',
    },

    openingHours: [
      {
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        opens: '09:00',
        closes: '17:00',
      },
    ],

    // Founder
    founder: {
      name: 'Steve',
      description: 'Bristol musician who founded Painless Removals in 1978',
    },

    // Director
    director: {
      name: 'Jay Newton',
      title: 'Director',
      description: 'Director of Painless Removals since 2019. Has personally overseen 2,000+ home and office relocations across the UK, specialising in long-distance moves, property chain coordination, and complex multi-storey access jobs from Bristol.',
      linkedin: 'https://www.linkedin.com/in/jay-newton-72632223/',
      image: '/img/about/team/Jay-Newton-800w.jpg',
    },

    // Trust signals
    rating: {
      value: '4.9',
      count: 122,
    },
    insurance: '£15,000',
    serviceTypes: ['Home Removals', 'Long Distance Removals', 'Packing Services', 'Storage'],
    priceRange: '££-£££',
  },

  // ==========================================================================
  // SEO Defaults
  // ==========================================================================
  seo: {
    titleTemplate: '%s | Painless Removals',
    defaultTitle: 'Painless Removals - Bristol Removals Since 1978',
    defaultDescription: 'Bristol-based removal company since 1978. Long-distance and chain move specialists. Nationwide coverage with top-rated service.',
  },

  // ==========================================================================
  // Legal
  // ==========================================================================
  legal: {
    companyName: 'Painless Removals Ltd',
    companyAddress: '290-294 Southmead Rd, Bristol BS10 5EN',
    privacyPolicyUrl: '/privacy-policy/',
    cookiePolicyUrl: '/privacy-policy/',
    termsUrl: '/terms-conditions/',
  },
};

export default siteConfig;
