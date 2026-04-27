/**
 * STEP SUMMARY
 * 
 * Final summary and quote submission
 */

import * as React from 'react';
import { useStore } from '@nanostores/react';
import { $calculatorData, $calculatorResult, calculate, updateData } from '@/lib/core/calculator/store';
import { StepContainer } from '../step-container';
import { PriceDisplay } from '../price-display';
import { SummaryCard } from '../summary-card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface StepSummaryProps {
  onPrevious: () => void;
  onSubmit: () => void;
}

export const StepSummary: React.FC<StepSummaryProps> = ({ onPrevious, onSubmit }) => {
  const data = useStore($calculatorData);
  const result = useStore($calculatorResult);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Calculate on mount
  React.useEffect(() => {
    if (!result) {
      calculate();
    }
  }, [result]);

  const summaryItems = [
    { label: 'Project Type', value: String(data.projectType || 'N/A') },
    { label: 'Quantity', value: String(data.quantity || 'N/A') },
    { label: 'Premium Features', value: data.premium ? 'Yes' : 'No' },
  ];

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      // Validate email if provided
      if (data.email && !isValidEmail(data.email as string)) {
        throw new Error('Please enter a valid email address');
      }

      onSubmit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit quote');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <StepContainer
      title="Summary"
      description="Review your quote and provide contact details"
    >
      <div className="space-y-6">
        {/* Price Display */}
        {result && (
          <PriceDisplay
            amount={result.totalPrice}
            currency={result.currency}
            breakdown={result.breakdown}
          />
        )}

        {/* Summary */}
        <SummaryCard title="Your Selection" items={summaryItems} />

        {/* Contact Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Contact Information (Optional)</h3>

          <FormField label="Name">
            <Input
              value={(data.name as string) || ''}
              onChange={(e) => updateData({ name: e.target.value })}
              placeholder="Your name"
            />
          </FormField>

          <FormField label="Email" hint="We'll send your quote to this email">
            <Input
              type="email"
              value={(data.email as string) || ''}
              onChange={(e) => updateData({ email: e.target.value })}
              placeholder="your@email.com"
            />
          </FormField>

          <FormField label="Phone">
            <Input
              type="tel"
              value={(data.phone as string) || ''}
              onChange={(e) => updateData({ phone: e.target.value })}
              placeholder="+36 30 123 4567"
            />
          </FormField>
        </div>

        {/* Error Message */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Navigation */}
        <div className="flex justify-between gap-4 pt-6">
          <Button type="button" variant="outline" onClick={onPrevious} disabled={isSubmitting}>
            ← Previous
          </Button>

          <Button type="button" onClick={handleSubmit} disabled={isSubmitting} size="lg">
            {isSubmitting ? (
              <>
                <span className="inline-block animate-spin mr-2">⏳</span>
                Submitting...
              </>
            ) : (
              <>Get Your Quote</>
            )}
          </Button>
        </div>
      </div>
    </StepContainer>
  );
};

// Helper function
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
