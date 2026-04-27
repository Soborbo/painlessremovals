// src/lib/errors/web-vitals.ts
// Core Web Vitals mérés — natív PerformanceObserver, 0 dependency
// Csak akkor küld reportot, ha a threshold BUKIK.

import { trackError } from './tracker';

/** Thresholds — Google "good" határértékek */
const THRESHOLDS = {
  LCP:  2500,   // ms — Largest Contentful Paint
  CLS:  0.1,    // score — Cumulative Layout Shift
  INP:  200,    // ms — Interaction to Next Paint
  TTFB: 800,    // ms — Time to First Byte
} as const;

let lcpReported = false;
let clsReported = false;
let inpReported = false;

/**
 * Inicializáld a layout-ban, az initGlobalCatcher() UTÁN.
 * Csak production-ben mér — dev-ben kikapcsol, hogy ne zavarjon.
 */
export function initWebVitals(): void {
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) return;
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;

  observeLCP();
  observeCLS();
  observeINP();
  measureTTFB();
}

// ============================================================
// LCP — Largest Contentful Paint
// ============================================================

function observeLCP(): void {
  try {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1] as any;
      if (!last || lcpReported) return;

      const lcp = Math.round(last.startTime);

      const reportLCP = () => {
        if (lcpReported) return;
        lcpReported = true;
        observer.disconnect();

        if (lcp > THRESHOLDS.LCP) {
          trackError('SEO-PERF-001', null, {
            lcpMs: lcp,
            threshold: THRESHOLDS.LCP,
            element: (last.element?.tagName || 'unknown').toLowerCase(),
            url: last.url || '',
            page: location.pathname,
          }, 'web-vitals');
        }
      };

      addEventListener('visibilitychange', reportLCP, { once: true });
      addEventListener('keydown', reportLCP, { once: true });
      addEventListener('pointerdown', reportLCP, { once: true });
    });
    observer.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch { /* Browser nem támogatja */ }
}

// ============================================================
// CLS — Cumulative Layout Shift
// ============================================================

function observeCLS(): void {
  try {
    let clsScore = 0;
    let sessionEntries: any[] = [];
    let sessionValue = 0;

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as any[]) {
        if (entry.hadRecentInput) continue;

        if (sessionEntries.length &&
            entry.startTime - sessionEntries[sessionEntries.length - 1].startTime > 1000) {
          if (sessionValue > clsScore) clsScore = sessionValue;
          sessionEntries = [];
          sessionValue = 0;
        }

        sessionEntries.push(entry);
        sessionValue += entry.value;
      }
    });

    observer.observe({ type: 'layout-shift', buffered: true });

    addEventListener('visibilitychange', () => {
      if (clsReported) return;
      if (sessionValue > clsScore) clsScore = sessionValue;

      if (clsScore > THRESHOLDS.CLS) {
        clsReported = true;
        trackError('SEO-PERF-002', null, {
          clsScore: Math.round(clsScore * 1000) / 1000,
          threshold: THRESHOLDS.CLS,
          page: location.pathname,
        }, 'web-vitals');
      }
    }, { once: true });
  } catch { /* Browser nem támogatja */ }
}

// ============================================================
// INP — Interaction to Next Paint
// ============================================================

function observeINP(): void {
  try {
    let worstINP = 0;

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as any[]) {
        const duration = entry.duration || 0;
        if (duration > worstINP) worstINP = duration;
      }
    });

    observer.observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit);

    addEventListener('visibilitychange', () => {
      if (inpReported) return;
      if (worstINP > THRESHOLDS.INP) {
        inpReported = true;
        trackError('SEO-PERF-003', null, {
          inpMs: Math.round(worstINP),
          threshold: THRESHOLDS.INP,
          page: location.pathname,
        }, 'web-vitals');
      }
    }, { once: true });
  } catch { /* Browser nem támogatja */ }
}

// ============================================================
// TTFB — Time to First Byte
// ============================================================

function measureTTFB(): void {
  try {
    const observer = new PerformanceObserver((list) => {
      const nav = list.getEntries()[0] as PerformanceNavigationTiming;
      if (!nav) return;

      const ttfb = Math.round(nav.responseStart - nav.requestStart);

      if (ttfb > THRESHOLDS.TTFB) {
        trackError('SEO-PERF-004', null, {
          ttfbMs: ttfb,
          threshold: THRESHOLDS.TTFB,
          page: location.pathname,
          protocol: nav.nextHopProtocol || 'unknown',
        }, 'web-vitals');
      }

      observer.disconnect();
    });

    observer.observe({ type: 'navigation', buffered: true });
  } catch { /* Browser nem támogatja */ }
}
