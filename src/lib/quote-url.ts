/**
 * QUOTE URL ENCODING
 *
 * Encodes/decodes calculator state for shareable URL links.
 * Only includes quote-relevant fields — contact info excluded for privacy.
 *
 * Usage:
 *   const url = buildQuoteUrl(state, window.location.origin);
 *   // → "https://example.com/your-quote?q=eyJzZXJ2aWNlVHlwZSI6..."
 *
 *   const decoded = decodeQuoteState(urlParam);
 *   // → Partial<CalculatorState> ready to load into the store
 */

import type { CalculatorState } from './calculator-store';
import { LocalStorageStateSchema } from './calculator-store';

// All fields needed to recalculate and display the quote.
// Contact info, tracking params, and session metadata are intentionally excluded.
const QUOTE_FIELDS = [
  'serviceType',
  'propertySize',
  'officeSize',
  'furnitureOnly',
  'sliderPosition',
  'useManualOverride',
  'manualMen',
  'manualVans',
  'dateFlexibility',
  'selectedDate',
  'complications',
  'propertyChain',
  'fromAddress',
  'toAddress',
  'distances',
  'keyWaitWaiver',
  'extras',
  'clearance',
] as const satisfies ReadonlyArray<keyof CalculatorState>;

export function encodeQuoteState(state: CalculatorState): string {
  const partial: Record<string, unknown> = {};
  for (const field of QUOTE_FIELDS) {
    const value = state[field];
    if (value !== undefined && value !== null) {
      partial[field] = value;
    }
  }
  const json = JSON.stringify(partial);
  // TextEncoder handles non-ASCII (e.g. accented address chars) before base64
  const bytes = new TextEncoder().encode(json);
  const binary = String.fromCharCode(...bytes);
  // URL-safe base64 (no +, /, or = characters)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function decodeQuoteState(encoded: string): Partial<CalculatorState> | null {
  try {
    // Restore standard base64 from URL-safe variant, add padding
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '=='.slice(0, (4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const result = LocalStorageStateSchema.partial().safeParse(parsed);
    if (!result.success) return null;
    return result.data as Partial<CalculatorState>;
  } catch {
    return null;
  }
}

export function buildQuoteUrl(state: CalculatorState, origin?: string): string {
  const encoded = encodeQuoteState(state);
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/your-quote?q=${encoded}`;
}
