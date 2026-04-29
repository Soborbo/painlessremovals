/**
 * MASTER CONFIGURATION
 *
 * Feature flags - Everything can be toggled here
 * Core NEVER changes, only this file!
 *
 * IMPORTANT: This file runs at BUILD-TIME (Astro config)
 * For runtime env vars, use getRuntimeConfig() in API routes
 */

// Build-time environment check
const isProduction = import.meta.env.MODE === 'production';
const isDevelopment = import.meta.env.MODE === 'development';

export const CONFIG = {
  // Site info (runtime-derived)
  site: {
    name: 'Painless Removals Bristol',
    // URL is derived at runtime from request.url
    url: (isProduction ? 'https://painlessremovals.com' : 'http://localhost:4321') as string | undefined,
    // Base URL for static assets. Now that the calculator lives under
    // painlessremovals.com/instantquote/, relative paths resolve correctly,
    // so we leave this empty in both prod and dev.
    assetBaseUrl: '' as string,
    defaultLocale: 'en' as const,
  },

  // Calculator settings
  calculator: {
    currency: 'GBP',
    phoneNumber: '0117 28 700 82',
    idleTimeSeconds: 20,
    emailFrom: 'Painless Removals <quotes@painlessremovals.com>',
    emailSupport: 'hello@painlessremovals.com',
    schemaVersion: 1,
  },

  // FEATURE FLAGS - Everything is controllable
  features: {
    // Auth system
    auth: false,
    authMagicLinkFallback: true,

    // Multi-language support
    multiLanguage: false,

    // Analytics tracking
    analytics: false,

    // CRM webhook sync
    crmSync: false,
    crmQueue: true,

    // Idle popup
    idlePopup: false,

    // Security features (FORCED in production)
    rateLimiting: true, // Always true
    botProtection: false,
    payloadLimit: true,
    ipLogging: isDevelopment,
    ipAnonymization: isProduction,

    // UI features
    testimonials: true,

    // Marketing tracking
    gclid: true,
    utmTracking: true,

    // Monitoring
    sentry: false,
    errorTracking: true,
    errorAlerts: true,
    webVitals: true,
    slowResponseMonitor: isDevelopment,

    // Enrichment
    ipEnrichment: true,
    deviceDetection: true,

    // Images
    cloudflareImages: false,

    // i-mve CRM sync
    imveSync: true,

    // Maintenance
    dataRetention: true,
    healthCheck: true,
    webhookSignature: true,
  },

  // Auth config
  auth: {
    providers: {
      google: {
        enabled: true,
      },
      magicLink: {
        enabled: true,
        tokenExpiry: 900, // 15 minutes
      },
    },
  },

  // Languages
  languages: {
    default: 'en' as const,
    available: ['en', 'es', 'fr'] as const,
  },

  // Security
  security: {
    rateLimitRequests: 10, // per minute
    rateLimitWindowMs: 60000, // 1 minute
    maxPayloadSize: 1048576, // 1MB
    allowedOrigins: [
      'https://painlessremovals.com',
      'https://www.painlessremovals.com',
      isDevelopment ? 'http://localhost:4321' : null,
      isDevelopment ? 'http://localhost:4322' : null,
    ].filter(Boolean) as string[],
  },

  // Data retention (GDPR)
  dataRetention: {
    quotesMaxAgeDays: 180,
    sessionsMaxAgeDays: 30,
    logsMaxAgeDays: 90,
  },

  // Monitoring
  monitoring: {
    slowResponseThresholdMs: 2000,
    errorAlertThreshold: 20,
  },

  // Debug
  debug: isDevelopment,
} as const;

/**
 * Get runtime config with environment variables
 * Use this in API routes to access runtime env vars
 *
 * CRITICAL: Always use this function, never import.meta.env in API routes
 */
export function getRuntimeConfig(env: Cloudflare.Env) {
  return {
    ...CONFIG,
    site: {
      ...CONFIG.site,
      // URL will be set dynamically in middleware
    },
    analytics: {
      gtmId: env.GTM_ID || '',
      ga4Id: env.GA4_MEASUREMENT_ID || '',
    },
    monitoring: {
      environment: env.ENVIRONMENT || 'development',
    },
    errorTracking: {
      sheetsId: env.ERROR_SHEETS_ID || '',
      serviceAccountEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
      alertEmailTo: env.ERROR_EMAIL_TO || CONFIG.calculator.emailSupport,
      alertEmailFrom: env.ERROR_ALERT_FROM || '',
      enabled: CONFIG.features.errorTracking,
    },
    externalApis: {
      googleMaps: {
        enabled: !!env.GOOGLE_MAPS_API_KEY,
        apiKey: env.GOOGLE_MAPS_API_KEY || '',
        timeoutMs: 5000,
      },
    },
    auth: {
      ...CONFIG.auth,
      providers: {
        // Google OAuth was scaffolded but `features.auth = false` keeps
        // the entire auth subsystem off. The env vars
        // (GOOGLE_CLIENT_ID/SECRET) are not provisioned in the dashboard.
        google: {
          enabled: CONFIG.auth.providers.google.enabled,
        },
        magicLink: {
          enabled: CONFIG.auth.providers.magicLink.enabled,
          tokenExpiry: CONFIG.auth.providers.magicLink.tokenExpiry,
        },
      },
    },
    email: {
      resendApiKey: env.RESEND_API_KEY || '',
      from: CONFIG.calculator.emailFrom,
      timeoutMs: 5000,
    },
    imve: {
      enabled: !!env.IMVE_API_URL,
      apiUrl: env.IMVE_API_URL || '',
      apiKey: env.IMVE_API_KEY || '',
      timeoutMs: 10000,
    },
  };
}

// Type exports
export type Locale = (typeof CONFIG.languages.available)[number];
export type Feature = keyof typeof CONFIG.features;
export type RuntimeConfig = ReturnType<typeof getRuntimeConfig>;
