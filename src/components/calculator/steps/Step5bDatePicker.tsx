/**
 * STEP 5b: DATE PICKER
 *
 * Calendar for selecting move date after flexibility is chosen.
 * Only shown if user selected 'fixed' or 'flexible' in Step 5.
 */

import { useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  calculatorStore,
  setDate,
  goToStep,
} from '@/lib/calculator-store';
import { CALCULATOR_CONFIG } from '@/lib/calculator-config';
import { isBankHoliday, isSaturday } from '@/lib/calculator-logic';
import { Card } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { NavigationButtons } from '@/components/calculator/navigation-buttons';


/**
 * Format a Date as a local-calendar YYYY-MM-DD string.
 *
 * We deliberately avoid `toISOString()` here because the calendar picks
 * local midnight, which in BST (UTC+1) converts to the previous day in
 * UTC — the bug that was shifting move_date back by one day on the way
 * to i-mve.
 */
function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse a YYYY-MM-DD stored value back to a local Date (midnight local).
 * Also tolerates legacy full-ISO strings from pre-fix saved state.
 */
function fromStoredDateString(value: string): Date | undefined {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return undefined;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

export function Step5bDatePicker() {
  const state = useStore(calculatorStore);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    state.selectedDate ? fromStoredDateString(state.selectedDate) : undefined
  );

  // Get minimum date (tomorrow)
  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 1);
  minDate.setHours(0, 0, 0, 0);

  // Get maximum date (1 year from now)
  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() + 1);

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
  };

  const handleContinue = () => {
    // Save to store as a local YYYY-MM-DD string so the customer's chosen
    // calendar day survives timezone conversions end-to-end.
    setDate(
      state.dateFlexibility || 'flexible',
      selectedDate ? toLocalDateString(selectedDate) : undefined
    );
    // Navigate to step 6 (Complications) via store flow
    goToStep(6);
  };

  const handlePrevious = () => {
    goToStep(5);
  };

  // Format selected date for display
  const formattedDate = selectedDate
    ? selectedDate.toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  const isFixed = state.dateFlexibility === 'fixed';

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-foreground">
          {isFixed ? 'Select your moving date' : 'When would you prefer to move?'}
        </h2>
        {!isFixed && (
          <p className="text-muted-foreground mt-2">
            We'll try to accommodate this date or suggest alternatives
          </p>
        )}
      </div>

      {/* Calendar with side info */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-4 md:gap-6 items-start">
          {/* Calendar */}
          <div className="flex justify-center">
            <Calendar
              mode="single"
              {...(selectedDate !== undefined && { selected: selectedDate })}
              onSelect={handleDateSelect}
              disabled={(date) => date < minDate || date > maxDate}
              initialFocus
              className="rounded-md border"
            />
          </div>

          {/* Selected date display - beside calendar on desktop */}
          {selectedDate && (
            <div className="flex flex-col items-center md:items-start justify-start space-y-3 md:pt-2">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-full">
                <span>📅</span>
                <span className="font-medium">{formattedDate}</span>
              </div>
              {/* Non-binding notice */}
              <p className="text-sm text-muted-foreground text-center md:text-left">
                Don't worry, this isn't set in stone. It just helps us plan your move better.
              </p>
              {/* Surcharge note — v4.2 */}
              {(() => {
                const dateStr = toLocalDateString(selectedDate);
                const isBH = isBankHoliday(dateStr);
                const isSat = isSaturday(dateStr);

                if (isBH) {
                  return (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                      <strong>Bank holiday:</strong> A +{CALCULATOR_CONFIG.surcharges.bankHoliday * 100}% surcharge applies to crew costs on bank holidays.
                    </div>
                  );
                }
                if (isSat) {
                  return (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                      <strong>Saturday move:</strong> A +{CALCULATOR_CONFIG.surcharges.saturday * 100}% surcharge applies to crew costs. Saturdays are our busiest days - book early!
                    </div>
                  );
                }
                if (selectedDate.getDay() === 0) {
                  return (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                      <strong>Sunday:</strong> We don't typically operate on Sundays. Please select another date or contact us to discuss.
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          )}
        </div>
      </Card>

      {/* Navigation Buttons */}
      <NavigationButtons
        onPrevious={handlePrevious}
        onNext={handleContinue}
        canGoNext={!!selectedDate}
        nextLabel="Continue"
      />
    </div>
  );
}

export default Step5bDatePicker;
