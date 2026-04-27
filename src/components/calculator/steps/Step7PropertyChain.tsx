/**
 * STEP 7: PROPERTY CHAIN
 *
 * Simple yes/no question with auto-next.
 * If yes, shows info page before continuing.
 * Property chain = minimum full day booking.
 */

import { useState, useRef, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import {
  calculatorStore,
  setPropertyChain,
  nextStep,
  prevStep,
} from '@/lib/calculator-store';
import { Card } from '@/components/ui/card';
import { SelectionCard, SelectionCardGrid } from '@/components/ui/selection-card';
import { NavigationButtons } from '@/components/calculator/navigation-buttons';
import { getImageSources } from '@/lib/calculator-images';

export function Step7PropertyChain() {
  const state = useStore(calculatorStore);
  const navigationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [isChain, setIsChain] = useState<boolean | null>(
    state.propertyChain
  );
  const [showExplanation, setShowExplanation] = useState(false);
  // Internal page: 1 = question, 2 = chain info (only if yes)
  const [internalPage, setInternalPage] = useState(1);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
    };
  }, []);

  const handleSelect = (value: boolean) => {
    // Clear any pending navigation
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }

    setIsChain(value);

    // Auto-navigate after short delay
    navigationTimeoutRef.current = setTimeout(() => {
      navigationTimeoutRef.current = null;
      setPropertyChain(value);

      if (value) {
        // If yes, show info page
        setInternalPage(2);
      } else {
        // If no, go to next step
        nextStep();
      }
    }, 400);
  };

  const handleContinueFromInfo = () => {
    nextStep();
  };

  const handleBackFromInfo = () => {
    setInternalPage(1);
    setIsChain(null);
  };

  // Page 2: Chain info
  if (internalPage === 2) {
    return (
      <div className="space-y-6">
        {/* Heading */}
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-foreground">
            Property chain moves
          </h2>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">
            We handle chain completions every week — here's how we'll look after yours.
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid gap-3 max-w-lg mx-auto">
          {/* Full day reservation */}
          <div className="flex items-start gap-4 rounded-xl border border-border bg-card p-4 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#035349]/10">
              <svg viewBox="0 0 24 24" fill="none" stroke="#035349" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
                <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Full day reservation</h3>
              <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
                We'll block out the entire day for your move, so delays in the chain won't leave you stranded.
              </p>
            </div>
          </div>

          {/* Experienced team */}
          <div className="flex items-start gap-4 rounded-xl border border-border bg-card p-4 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#035349]/10">
              <svg viewBox="0 0 24 24" fill="none" stroke="#035349" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4-4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Experienced team</h3>
              <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
                Our crew handles chain completions regularly and knows how to stay calm under pressure.
              </p>
            </div>
          </div>

          {/* Close communication */}
          <div className="flex items-start gap-4 rounded-xl border border-border bg-card p-4 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#035349]/10">
              <svg viewBox="0 0 24 24" fill="none" stroke="#035349" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Close communication</h3>
              <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
                We'll coordinate timing with your solicitor and estate agent throughout the day.
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Buttons */}
        <NavigationButtons
          onPrevious={handleBackFromInfo}
          onNext={handleContinueFromInfo}
          nextLabel="Continue"
        />
      </div>
    );
  }

  // Page 1: Question
  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-foreground">
          Are you part of a property chain?
        </h2>
      </div>

      {/* Options - 2 cols, matching Step 2 card style */}
      <SelectionCardGrid columns={{ default: 2, sm: 2, md: 2 }} className="max-w-xl mx-auto">
        <SelectionCard
          value="yes"
          title="Yes, I'm in a chain"
          imageConfig={getImageSources('step7-chain-yes')}
          isSelected={isChain === true}
          onSelect={() => handleSelect(true)}
        />
        <SelectionCard
          value="no"
          title="No, independent"
          imageConfig={getImageSources('step7-chain-no')}
          isSelected={isChain === false}
          onSelect={() => handleSelect(false)}
        />
      </SelectionCardGrid>

      {/* Not sure helper */}
      <div className="text-center">
        <button
          type="button"
          className="text-sm text-muted-foreground hover:text-foreground underline"
          onClick={() => setShowExplanation(!showExplanation)}
        >
          What's a property chain?
        </button>
      </div>

      {/* Explanation */}
      {showExplanation && (
        <Card className="p-4 bg-muted/50">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">A property chain</strong> is when multiple house sales depend on each other. For example: you're buying a house from someone who is also buying another house on the same day. All transactions must complete together.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            If any part of the chain is delayed, it affects everyone. That's why we reserve a full day for chain moves - to ensure flexibility if completion times shift.
          </p>
        </Card>
      )}

      {/* Navigation Buttons */}
      <NavigationButtons
        onPrevious={prevStep}
        showNext={false}
      />
    </div>
  );
}

export default Step7PropertyChain;
