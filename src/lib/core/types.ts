/**
 * CORE TYPES
 *
 * Shared type definitions used across email templates, API endpoints, etc.
 */

export interface Quote {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  totalPrice: number;
  currency: string;
  language: string | null;
  country: string | null;
  device: string | null;
  calculatorData: unknown;
  breakdown: unknown;
  quoteUrl?: string | null;
  men?: number;
  vans?: number;
  serviceDuration?: string;
  createdAt: string;
}
