/**
 * CALCULATOR TYPES
 *
 * TypeScript types for calculator functionality
 */

import type { Locale } from '@/lib/config';

/**
 * Step definition
 */
export interface Step {
  id: string;
  order: number;
  title: Record<Locale, string>;
  description?: Record<Locale, string>;
  component: string;
  validation?: (data: CalculatorData) => boolean;
  calculate?: (data: CalculatorData) => Partial<CalculatorResult>;
}

/**
 * Calculator data (user inputs)
 */
export interface CalculatorData {
  [key: string]: unknown;
}

/**
 * Calculator result
 */
export interface CalculatorResult {
  totalPrice: number;
  currency: string;
  breakdown: Record<string, number>;
  details?: Record<string, unknown>;
}

/**
 * Calculator state
 */
export interface CalculatorState {
  currentStep: number;
  data: CalculatorData;
  result: CalculatorResult | null;
  isValid: boolean;
  errors: Record<string, string>;
}

/**
 * Step navigation
 */
export interface StepNavigation {
  canGoNext: boolean;
  canGoPrevious: boolean;
  isFirstStep: boolean;
  isLastStep: boolean;
  progress: number; // 0-100
}

/**
 * Calculation options
 */
export interface CalculationOptions {
  currency?: string;
  locale?: Locale;
  roundTo?: number;
}

/**
 * Price item
 */
export interface PriceItem {
  id: string;
  label: string;
  amount: number;
  quantity?: number;
  unit?: string;
}

/**
 * Quote summary
 */
export interface QuoteSummary {
  id?: number;
  result: CalculatorResult;
  items: PriceItem[];
  createdAt?: Date;
  language: Locale;
}
