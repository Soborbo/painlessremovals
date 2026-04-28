/**
 * STEP 11: CONTACT DETAILS
 *
 * Form fields:
 * - First name (required)
 * - Last name (required)
 * - Phone (required, UK format)
 * - Email (required, valid format)
 *
 * Consents:
 * - Marketing opt-in (optional)
 * - Terms & Privacy acceptance (required)
 */

import { useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  calculatorStore,
  setContact,
  nextStep,
  prevStep,
  type ContactData,
} from '@/lib/calculator-store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';


// Validation patterns
const PHONE_REGEX = /^(?:(?:\+44)|(?:0))(?:\d\s?){9,10}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FormErrors {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  gdpr?: string;
}

export function Step11Contact() {
  const state = useStore(calculatorStore);

  // Form state
  const [firstName, setFirstName] = useState(state.contact?.firstName || '');
  const [lastName, setLastName] = useState(state.contact?.lastName || '');
  const [phone, setPhone] = useState(state.contact?.phone || '');
  const [email, setEmail] = useState(state.contact?.email || '');
  const [marketingConsent, setMarketingConsent] = useState(
    state.contact?.marketingConsent || false
  );
  const [gdprConsent, setGdprConsent] = useState(
    state.contact?.gdprConsent || false
  );

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Format phone number as user types
  const handlePhoneChange = (value: string) => {
    // Remove non-digits except +
    const cleaned = value.replace(/[^\d+]/g, '');
    setPhone(cleaned);
  };

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // First name
    if (!firstName.trim()) {
      newErrors.firstName = 'Please enter your first name';
    }

    // Last name
    if (!lastName.trim()) {
      newErrors.lastName = 'Please enter your last name';
    }

    // Phone
    if (!phone.trim()) {
      newErrors.phone = 'Please enter your phone number';
    } else if (!PHONE_REGEX.test(phone.replace(/\s/g, ''))) {
      newErrors.phone = 'Please enter a valid UK phone number';
    }

    // Email
    if (!email.trim()) {
      newErrors.email = 'Please enter your email address';
    } else if (!EMAIL_REGEX.test(email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    // GDPR/Terms
    if (!gdprConsent) {
      newErrors.gdpr = 'Please accept the terms and privacy policy';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);

    const contactData: ContactData = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      email: email.trim().toLowerCase(),
      marketingConsent,
      gdprConsent,
    };

    setContact(contactData);

    // Small delay for UX
    await new Promise((resolve) => setTimeout(resolve, 300));

    setIsSubmitting(false);
    nextStep(); // Go to final quote
  };

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-foreground">
          Almost there! Your details
        </h2>
        <p className="text-muted-foreground mt-2">
          We'll send your quote to this email
        </p>
      </div>

      {/* Form */}
      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name Row */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* First Name */}
            <div className="space-y-2">
              <Label htmlFor="firstName">
                First name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="firstName"
                name="firstName"
                type="text"
                placeholder="John"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={cn(errors.firstName && 'border-destructive')}
                autoComplete="given-name"
              />
              {errors.firstName && (
                <p className="text-xs text-destructive">{errors.firstName}</p>
              )}
            </div>

            {/* Last Name */}
            <div className="space-y-2">
              <Label htmlFor="lastName">
                Last name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lastName"
                name="lastName"
                type="text"
                placeholder="Smith"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={cn(errors.lastName && 'border-destructive')}
                autoComplete="family-name"
              />
              {errors.lastName && (
                <p className="text-xs text-destructive">{errors.lastName}</p>
              )}
            </div>
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label htmlFor="phone">
              Phone number <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                📱
              </span>
              <Input
                id="phone"
                name="phone"
                type="tel"
                placeholder="07700 900123"
                value={phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                className={cn('pl-10', errors.phone && 'border-destructive')}
                autoComplete="tel"
              />
            </div>
            {errors.phone && (
              <p className="text-xs text-destructive">{errors.phone}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">
              Email address <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                ✉️
              </span>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="john@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={cn('pl-10', errors.email && 'border-destructive')}
                autoComplete="email"
              />
            </div>
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Your quote will be sent here instantly
            </p>
          </div>

          {/* Divider */}
          <hr className="border-border" />

          {/* Consents */}
          <div className="space-y-4">
            {/* Marketing Consent (Optional) */}
            <div className="flex items-start gap-3">
              <Checkbox
                id="marketing"
                checked={marketingConsent}
                onCheckedChange={(checked) =>
                  setMarketingConsent(checked === true)
                }
              />
              <div>
                <Label
                  htmlFor="marketing"
                  className="text-sm font-normal cursor-pointer"
                >
                  Keep me updated with moving tips and special offers
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  We send 1-2 emails per month. Unsubscribe anytime.
                </p>
              </div>
            </div>

            {/* Terms Acceptance (Required) */}
            <div className="flex items-start gap-3">
              <Checkbox
                id="gdpr"
                checked={gdprConsent}
                onCheckedChange={(checked) => setGdprConsent(checked === true)}
                className={cn(errors.gdpr && 'border-destructive')}
              />
              <div>
                <Label
                  htmlFor="gdpr"
                  className="text-sm font-normal cursor-pointer"
                >
                  I agree to the{' '}
                  <a
                    href="/terms"
                    target="_blank"
                    className="text-primary underline hover:no-underline"
                  >
                    Terms of Service
                  </a>{' '}
                  and{' '}
                  <a
                    href="/privacy"
                    target="_blank"
                    className="text-primary underline hover:no-underline"
                  >
                    Privacy Policy
                  </a>{' '}
                  <span className="text-destructive">*</span>
                </Label>
                {errors.gdpr && (
                  <p className="text-xs text-destructive mt-1">{errors.gdpr}</p>
                )}
              </div>
            </div>
          </div>

          {/* Navigation Buttons */}
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              size="lg"
              onClick={prevStep}
            >
              Back
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white border-0"
              size="lg"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Processing...' : 'Get My Quote →'}
            </Button>
          </div>
        </form>
      </Card>

      {/* Trust Signals */}
      <div className="flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1">🎁 Free quote — no payment required</span>
        <span className="flex items-center gap-1">📧 No spam, ever</span>
        <span className="flex items-center gap-1">✓ GDPR compliant</span>
      </div>
    </div>
  );
}

export default Step11Contact;
