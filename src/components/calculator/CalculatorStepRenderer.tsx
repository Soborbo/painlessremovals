/**
 * CALCULATOR STEP RENDERER
 *
 * Renders the appropriate step component based on the step ID.
 * Used by the Astro page to hydrate the correct React component.
 */

import * as React from 'react';
import { useEffect, useLayoutEffect, useCallback, useState, useRef } from 'react';
import { initializeStore, goToStep, applicableSteps, stepNumberToUrl } from '@/lib/calculator-store';
import { trackFormStart, trackFormStep, registerFormForAbandonment } from '@/lib/tracking/form-tracking';

const CALCULATOR_FORM_ID = 'instantquote_calculator';
const CALCULATOR_FORM_NAME = 'instant_quote_calculator';
const FORM_STARTED_SESSION_KEY = 'pl_calc_form_started';

// Step components
import { Step1ServiceType } from './steps/Step1ServiceType';
import { Step2PropertySize } from './steps/Step2PropertySize';
import { Step3BelongingsSlider } from './steps/Step3BelongingsSlider';
import { Step4Recommendation } from './steps/Step4Recommendation';
import { Step5DateSelection } from './steps/Step5DateSelection';
import { Step5bDatePicker } from './steps/Step5bDatePicker';
import { Step6Complications } from './steps/Step6Complications';
import { Step7PropertyChain } from './steps/Step7PropertyChain';
import { Step8AddressSelection } from './steps/Step8AddressSelection';
import { Step9KeyWait } from './steps/Step9KeyWait';
import { Step10ExtrasGateway } from './steps/Step10ExtrasGateway';
import { Step10aPacking } from './steps/Step10aPacking';
import { Step10bDisassembly } from './steps/Step10bDisassembly';
import { Step10cCleaning } from './steps/Step10cCleaning';
import { Step10dStorage } from './steps/Step10dStorage';
import { Step11Contact } from './steps/Step11Contact';
import { Step12Quote } from './steps/Step12Quote';

interface CalculatorStepRendererProps {
  stepId: string;
}

const stepComponents: Record<string, React.ComponentType> = {
  'step-01': Step1ServiceType,
  'step-02': Step2PropertySize,
  'step-03': Step3BelongingsSlider,
  'step-04': Step4Recommendation,
  'step-05': Step5DateSelection,
  'step-5b': Step5bDatePicker,
  'step-06': Step6Complications,
  'step-07': Step7PropertyChain,
  'step-08': Step8AddressSelection,
  'step-09': Step9KeyWait,
  'step-10': Step10ExtrasGateway,
  'step-10a': Step10aPacking,
  'step-10b': Step10bDisassembly,
  'step-10c': Step10cCleaning,
  'step-10d': Step10dStorage,
  'step-11': Step11Contact,
  'step-12': Step12Quote,
};

/**
 * Parse step number from stepId
 */
function parseStepNumber(stepId: string): number | null {
  // Handle special step IDs
  if (stepId === 'step-5b') return 5.5;

  const subStepMatch = stepId.match(/^step-(\d+)([a-d])$/);
  if (subStepMatch) {
    const base = parseInt(subStepMatch[1]!, 10);
    const subMap: Record<string, number> = { a: 0.1, b: 0.2, c: 0.3, d: 0.4 };
    return base + (subMap[subStepMatch[2]!] || 0);
  }

  const match = stepId.match(/^step-(\d+)$/);
  if (!match) return null;
  return parseInt(match[1]!, 10);
}

export const CalculatorStepRenderer: React.FC<CalculatorStepRendererProps> = ({ stepId }) => {
  const stepNumber = parseStepNumber(stepId);
  const isValidStep = stepNumber !== null && (
    (!isNaN(stepNumber) && stepNumber >= 1 && stepNumber <= 12) ||
    stepNumber === 5.5 ||
    (stepNumber >= 10.1 && stepNumber <= 10.4)
  );

  // Track whether the store has been hydrated from localStorage.
  // Step components must NOT mount until this is true, otherwise their
  // useState hooks capture stale initial-state values that never re-sync.
  const [storeReady, setStoreReady] = useState(false);

  // Sync step function - used for initial mount and bfcache restore
  const syncStep = useCallback(() => {
    initializeStore();
    if (isValidStep) {
      goToStep(stepNumber, false);
    }
    setStoreReady(true);
  }, [stepNumber, isValidStep]);

  // Use useLayoutEffect to sync BEFORE render (prevents flash of wrong state)
  useLayoutEffect(() => {
    syncStep();
  }, [syncStep]);

  // Handle browser back/forward cache (bfcache)
  // When page is restored from bfcache, useEffect doesn't run again
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      // persisted = true means page was restored from bfcache
      if (event.persisted) {
        syncStep();
      }
    };

    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, [syncStep]);

  // Fire step_view (form_step_complete) once per page load, after the
  // store has hydrated so applicableSteps reflects user choices.
  // Each step is a hard page load (fresh JS context), so we always
  // re-register the form for abandonment tracking. `form_start` only
  // fires the first time the user enters the calculator in a session;
  // a sessionStorage flag dedupes across step navigations.
  useEffect(() => {
    if (!storeReady || !isValidStep) return;
    const steps = applicableSteps.get();
    const currentIndex = steps.indexOf(stepNumber!);
    if (currentIndex === -1) return;
    let alreadyStarted = false;
    try {
      alreadyStarted = sessionStorage.getItem(FORM_STARTED_SESSION_KEY) === '1';
    } catch { /* sessionStorage may be unavailable in private mode */ }
    if (!alreadyStarted) {
      trackFormStart(CALCULATOR_FORM_ID, CALCULATOR_FORM_NAME);
      try { sessionStorage.setItem(FORM_STARTED_SESSION_KEY, '1'); } catch { /* ignore */ }
    } else {
      registerFormForAbandonment(CALCULATOR_FORM_ID, CALCULATOR_FORM_NAME);
    }
    trackFormStep(CALCULATOR_FORM_ID, stepId, currentIndex + 1, steps.length);
  }, [storeReady, isValidStep, stepId, stepNumber]);

  // Prefetch adjacent steps after mount so navigation feels instant
  useEffect(() => {
    const steps = applicableSteps.get();
    const currentIndex = steps.indexOf(stepNumber!);
    if (currentIndex === -1) return;

    const stepsToPrefetch: number[] = [];
    if (currentIndex < steps.length - 1) stepsToPrefetch.push(steps[currentIndex + 1]!);
    if (currentIndex < steps.length - 2) stepsToPrefetch.push(steps[currentIndex + 2]!);
    if (currentIndex > 0) stepsToPrefetch.push(steps[currentIndex - 1]!);

    for (const step of stepsToPrefetch) {
      const url = stepNumberToUrl(step);
      // Use <link rel="prefetch"> for browser-native prefetching
      if (!document.querySelector(`link[href="${url}"]`)) {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = url;
        document.head.appendChild(link);
      }
    }
  }, [stepNumber]);

  const StepComponent = stepComponents[stepId];
  const [isVisible, setIsVisible] = useState(false);
  const prevStepRef = useRef(stepId);

  // Trigger fade-in animation on mount and step change
  useEffect(() => {
    setIsVisible(false);
    const timer = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
    });
    prevStepRef.current = stepId;
    return () => cancelAnimationFrame(timer);
  }, [stepId]);

  if (!StepComponent) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">Step not found: {stepId}</p>
      </div>
    );
  }

  // Don't render the step component until the store is hydrated from
  // localStorage. This ensures useState hooks inside step components
  // capture the restored values, not stale initialState defaults.
  if (!storeReady) {
    return null;
  }

  return (
    <div
      className="transition-all duration-500 ease-out"
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(12px)',
      }}
    >
      <StepComponent />
    </div>
  );
};
