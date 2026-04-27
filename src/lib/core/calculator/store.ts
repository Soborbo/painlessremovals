/**
 * CALCULATOR STATE MANAGEMENT
 *
 * Nanostores for reactive state
 */

import { logger } from '@/lib/utils/logger';
import { atom, computed } from 'nanostores';
import { calculateTotal, validateCalculatorData } from './calculations';
import { calculateProgress, getNextStep, getPreviousStep, getStepById } from './config';
import type { CalculatorData, CalculatorResult, CalculatorState } from './types';

/**
 * Current step ID
 */
export const $currentStepId = atom<string>('step-01');

/**
 * Calculator data
 */
export const $calculatorData = atom<CalculatorData>({});

/**
 * Calculator result
 */
export const $calculatorResult = atom<CalculatorResult | null>(null);

/**
 * Validation errors
 */
export const $validationErrors = atom<Record<string, string>>({});

/**
 * Loading state
 */
export const $isCalculating = atom<boolean>(false);

/**
 * Complete calculator state (computed)
 */
export const $calculatorState = computed(
  [$currentStepId, $calculatorData, $calculatorResult, $validationErrors],
  (stepId, data, result, errors): CalculatorState => {
    const step = getStepById(stepId);
    const validation = validateCalculatorData(data);

    return {
      currentStep: step?.order || 1,
      data,
      result,
      isValid: validation.isValid && Object.keys(errors).length === 0,
      errors: { ...validation.errors, ...errors },
    };
  }
);

/**
 * Progress percentage (computed)
 */
export const $progress = computed($currentStepId, (stepId) => {
  return calculateProgress(stepId);
});

/**
 * Update calculator data
 */
export function updateData(updates: Partial<CalculatorData>): void {
  const current = $calculatorData.get();
  $calculatorData.set({ ...current, ...updates });

  logger.debug('Calculator', 'Data updated', { updates });

  // Clear result when data changes
  $calculatorResult.set(null);
}

/**
 * Set step
 */
export function setStep(stepId: string): void {
  const step = getStepById(stepId);
  if (!step) {
    logger.warn('Calculator', `Invalid step ID: ${stepId}`);
    return;
  }

  $currentStepId.set(stepId);
  logger.debug('Calculator', 'Step changed', { stepId, order: step.order });
}

/**
 * Go to next step
 */
export function nextStep(): void {
  const currentId = $currentStepId.get();
  const next = getNextStep(currentId);
  if (next) {
    setStep(next.id);
  }
}

/**
 * Go to previous step
 */
export function previousStep(): void {
  const currentId = $currentStepId.get();
  const prev = getPreviousStep(currentId);
  if (prev) {
    setStep(prev.id);
  }
}

/**
 * Calculate result
 */
export function calculate(): void {
  $isCalculating.set(true);

  try {
    const data = $calculatorData.get();
    const validation = validateCalculatorData(data);

    if (!validation.isValid) {
      $validationErrors.set(validation.errors);
      logger.warn('Calculator', 'Validation failed', { errors: validation.errors });
      return;
    }

    const result = calculateTotal(data);
    $calculatorResult.set(result);
    $validationErrors.set({});

    logger.info('Calculator', 'Calculation successful', {
      total: result.totalPrice,
    });
  } catch (error) {
    logger.error('Calculator', 'Calculation error', { error });
    $validationErrors.set({ general: 'Calculation failed' });
  } finally {
    $isCalculating.set(false);
  }
}

/**
 * Reset calculator
 */
export function resetCalculator(): void {
  $currentStepId.set('step-01');
  $calculatorData.set({});
  $calculatorResult.set(null);
  $validationErrors.set({});
  $isCalculating.set(false);

  logger.info('Calculator', 'Reset complete');
}

/**
 * Load saved data (from localStorage, etc.)
 */
export function loadSavedData(data: CalculatorData): void {
  $calculatorData.set(data);
  logger.info('Calculator', 'Loaded saved data');
}
