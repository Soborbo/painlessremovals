/**
 * STEP 01 - EXAMPLE
 * 
 * Example first step component
 */

import * as React from 'react';
import { useStore } from '@nanostores/react';
import { $calculatorData, updateData } from '@/lib/core/calculator/store';
import { StepContainer } from '../step-container';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { NavigationButtons } from '../navigation-buttons';

interface Step01Props {
  onNext: () => void;
}

export const Step01Example: React.FC<Step01Props> = ({ onNext }) => {
  const data = useStore($calculatorData);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const handleChange = (field: string, value: unknown) => {
    updateData({ [field]: value });
    // Clear error for this field
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!data.projectType) {
      newErrors.projectType = 'Project type is required';
    }

    if (!data.quantity || (typeof data.quantity === 'number' && data.quantity < 1)) {
      newErrors.quantity = 'Quantity must be at least 1';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validate()) {
      onNext();
    }
  };

  return (
    <StepContainer title="Basic Information" description="Tell us about your project">
      <div className="space-y-6">
        {/* Project Type */}
        <FormField label="Project Type" required {...(errors.projectType !== undefined && { error: errors.projectType })}>
          <Select
            value={(data.projectType as string) || ''}
            onChange={(e) => handleChange('projectType', e.target.value)}
            error={!!errors.projectType}
          >
            <option value="">Select project type...</option>
            <option value="web">Web Application</option>
            <option value="mobile">Mobile Application</option>
            <option value="desktop">Desktop Application</option>
            <option value="other">Other</option>
          </Select>
        </FormField>

        {/* Quantity */}
        <FormField
          label="Quantity"
          required
          {...(errors.quantity !== undefined && { error: errors.quantity })}
          hint="How many units do you need?"
        >
          <Input
            type="number"
            min="1"
            value={(data.quantity as number) || ''}
            onChange={(e) => handleChange('quantity', Number.parseInt(e.target.value, 10))}
            error={!!errors.quantity}
            placeholder="Enter quantity"
          />
        </FormField>

        {/* Premium Option */}
        <FormField label="Add premium features?">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={(data.premium as boolean) || false}
              onChange={(e) => handleChange('premium', e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm">Yes, include premium features (+5,000 HUF)</span>
          </label>
        </FormField>
      </div>

      {/* Navigation */}
      <NavigationButtons onNext={handleNext} canGoNext={true} className="mt-8" />
    </StepContainer>
  );
};
