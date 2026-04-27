/**
 * STEP 8: FROM ADDRESS
 *
 * Google Places autocomplete for origin address.
 * Also offers "Use my current location" option.
 *
 * Uses new Google Maps APIs:
 *   - PlaceAutocompleteElement (replaces Autocomplete widget)
 */

import { useState, useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import {
  calculatorStore,
  setFromAddress,
  nextStep,
  prevStep,
  type AddressData,
} from '@/lib/calculator-store';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { NavigationButtons } from '@/components/calculator/navigation-buttons';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';

declare const google: any;

export function Step8FromAddress() {
  const state = useStore(calculatorStore);

  const [address, setAddress] = useState<AddressData | null>(state.fromAddress);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useManualEntry, setUseManualEntry] = useState(false);
  const [googleLoaded, setGoogleLoaded] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const autoElRef = useRef<any>(null);
  const googleLoadedRef = useRef(googleLoaded);

  // Keep ref in sync
  useEffect(() => { googleLoadedRef.current = googleLoaded; }, [googleLoaded]);

  // Check if Google Maps is loaded
  useEffect(() => {
    const checkGoogle = () => {
      if (typeof google !== 'undefined' && google.maps?.places) {
        setGoogleLoaded(true);
        return true;
      }
      return false;
    };

    if (checkGoogle()) return;

    // Poll for Google Maps to load
    const interval = setInterval(() => {
      if (checkGoogle()) {
        clearInterval(interval);
      }
    }, 100);

    // Timeout after 5 seconds
    const timeout = setTimeout(() => {
      clearInterval(interval);
      if (!googleLoadedRef.current) {
        console.warn('Google Maps not loaded after timeout');
      }
    }, 5000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  // Initialize Google Places Autocomplete (PlaceAutocompleteElement)
  useEffect(() => {
    if (!containerRef.current || useManualEntry || !googleLoaded || autoElRef.current) return;

    const el = new google.maps.places.PlaceAutocompleteElement({
      includedRegionCodes: ['gb'],
      includedPrimaryTypes: ['geocode'],
    });
    el.placeholder = "e.g., 42 Queen's Road, Bristol";
    if (state.fromAddress?.formatted) el.value = state.fromAddress.formatted;
    containerRef.current.appendChild(el);
    autoElRef.current = el;

    el.addEventListener('gmp-select', async (e: any) => {
      const place = e.placePrediction.toPlace();
      await place.fetchFields({ fields: ['formattedAddress', 'location', 'addressComponents'] });

      const postcodeComponent = place.addressComponents?.find(
        (c: any) => c.types.includes('postal_code')
      );

      const lat = place.location?.lat();
      const lng = place.location?.lng();
      const addressData: AddressData = {
        formatted: place.formattedAddress || '',
        postcode: postcodeComponent?.longText || '',
        ...(lat !== undefined && { lat }),
        ...(lng !== undefined && { lng }),
      };

      setAddress(addressData);
      setError(null);
    });

    return () => {
      el.remove();
      autoElRef.current = null;
    };
  }, [useManualEntry, googleLoaded]);

  // Handle "Use my current location"
  const handleUseCurrentLocation = async () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    if (!googleLoaded) {
      setError('Maps service not available. Please enter your address manually.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });

      const { latitude, longitude } = position.coords;

      // Reverse geocode to get address
      const geocoder = new google.maps.Geocoder();
      const response = await geocoder.geocode({
        location: { lat: latitude, lng: longitude },
      });

      if (response.results[0]) {
        const result = response.results[0];
        const postcodeComponent = result.address_components?.find(
          (c: any) => c.types.includes('postal_code')
        );

        const addressData: AddressData = {
          formatted: result.formatted_address,
          postcode: postcodeComponent?.long_name || '',
          lat: latitude,
          lng: longitude,
        };

        setAddress(addressData);
        // Update the autocomplete element display
        if (autoElRef.current) {
          autoElRef.current.value = result.formatted_address;
        }
      } else {
        setError('Could not determine your address');
      }
    } catch (err) {
      if (err instanceof GeolocationPositionError) {
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setError('Location permission denied. Please enter your address manually.');
            break;
          case err.POSITION_UNAVAILABLE:
            setError('Location unavailable. Please enter your address manually.');
            break;
          case err.TIMEOUT:
            setError('Location request timed out. Please enter your address manually.');
            break;
        }
      } else {
        setError('Could not get your location. Please enter your address manually.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Handle manual entry toggle
  const handleManualEntryToggle = () => {
    setUseManualEntry(!useManualEntry);
    setError(null);
    // Clean up autocomplete element when switching to manual
    if (autoElRef.current) {
      autoElRef.current.remove();
      autoElRef.current = null;
    }
  };

  // Handle continue
  const handleContinue = () => {
    if (!address) {
      setError('Please enter your address');
      return;
    }

    setFromAddress(address);
    nextStep();
  };

  // Handle manual postcode entry
  const handleManualSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const line1 = formData.get('line1') as string;
    const line2 = formData.get('line2') as string;
    const city = formData.get('city') as string;
    const postcode = formData.get('postcode') as string;

    if (!line1 || !city) {
      setError('Please fill in all required fields');
      return;
    }

    const formatted = [line1, line2, city, postcode].filter(Boolean).join(', ');

    const addressData: AddressData = {
      formatted,
      postcode: postcode.toUpperCase(),
    };

    setAddress(addressData);
    setUseManualEntry(false);
    setError(null);
  };

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-foreground">
          Where are you moving from?
        </h2>
        <p className="text-muted-foreground mt-2">
          Enter your current address
        </p>
      </div>

      {/* Address Input */}
      {!useManualEntry ? (
        <Card className="p-6 space-y-4">
          {/* Autocomplete Input */}
          <div className="space-y-2">
            <Label>Start typing your address</Label>
            <div ref={containerRef} />
            {!googleLoaded && (
              <p className="text-xs text-muted-foreground">
                Loading address search...
              </p>
            )}
          </div>

          {/* Selected Address Display */}
          {address && (
            <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <span className="text-emerald-600">✓</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-emerald-800">
                  {address.formatted}
                </p>
                {address.postcode && (
                  <p className="text-xs text-emerald-600">
                    Postcode: {address.postcode}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Current Location Button */}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleUseCurrentLocation}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                Getting location...
              </>
            ) : (
              <>
                📍 Use my current location
              </>
            )}
          </Button>

          {/* Manual Entry Link */}
          <div className="text-center">
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-foreground underline"
              onClick={handleManualEntryToggle}
            >
              Can't find your address? Enter manually
            </button>
          </div>
        </Card>
      ) : (
        /* Manual Entry Form */
        <Card className="p-6">
          <form onSubmit={handleManualSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="line1">Address Line 1 *</Label>
              <Input
                id="line1"
                name="line1"
                placeholder="House number and street"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="line2">Address Line 2</Label>
              <Input
                id="line2"
                name="line2"
                placeholder="Apartment, unit, etc. (optional)"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="city">City/Town *</Label>
                <Input
                  id="city"
                  name="city"
                  placeholder="Bristol"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="postcode">Postcode *</Label>
                <Input
                  id="postcode"
                  name="postcode"
                  placeholder="BS8 1RE"
                  required
                  className="uppercase"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={handleManualEntryToggle}
              >
                Back to search
              </Button>
              <Button type="submit" className="flex-1">
                Use this address
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Error Message */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Navigation Buttons */}
      <NavigationButtons
        onPrevious={prevStep}
        onNext={handleContinue}
        canGoNext={!!address}
        nextLabel="Continue"
      />
    </div>
  );
}

export default Step8FromAddress;
