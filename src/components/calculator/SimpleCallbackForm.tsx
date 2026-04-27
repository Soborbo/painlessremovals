/**
 * SIMPLE CALLBACK FORM
 *
 * Two-step standalone form for customers who want a callback:
 *   Step 1 — Route (from / to addresses with Google PlaceAutocomplete + Map)
 *   Step 2 — Contact details (name, phone, email)
 *
 * Uses new Google Maps APIs:
 *   - PlaceAutocompleteElement (replaces Autocomplete widget)
 *   - Route.computeRoutes (replaces DirectionsService)
 *   - route.createPolylines (replaces DirectionsRenderer)
 */

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { trackError } from '@/lib/errors/tracker';
import {
  trackEvent,
  setUserDataOnDOM,
  normalizeUserData,
  mirrorMetaCapi,
  generateUUID,
  getActiveQuoteState,
  markQuoteUpgraded,
  trackFormStart,
  trackFormStep,
  trackFormSubmitted,
} from '@/lib/tracking';

declare const google: any;

interface AddressInfo {
  formatted: string;
  lat?: number;
  lng?: number;
}

interface ContactState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

const FORM_ID = 'simple_callback_form';
const FORM_NAME = 'simple_callback';

export function SimpleCallbackForm() {
  // Mark form as started on first mount — every other field-focus push
  // gets de-duplicated by trackFormStart's internal map.
  useEffect(() => {
    trackFormStart(FORM_ID, FORM_NAME);
  }, []);

  const [step, setStep] = useState<1 | 2>(1);
  const [fromAddress, setFromAddress] = useState<AddressInfo | null>(null);
  const [toAddress, setToAddress] = useState<AddressInfo | null>(null);
  const [contact, setContact] = useState<ContactState>({ firstName: '', lastName: '', email: '', phone: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [googleLoaded, setGoogleLoaded] = useState(false);

  const fromContainerRef = useRef<HTMLDivElement>(null);
  const toContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const polylinesRef = useRef<any[]>([]);
  const fromAutoElRef = useRef<any>(null);
  const toAutoElRef = useRef<any>(null);
  const fromAddressRef = useRef<AddressInfo | null>(null);
  const toAddressRef = useRef<AddressInfo | null>(null);

  // Keep refs in sync
  useEffect(() => { fromAddressRef.current = fromAddress; }, [fromAddress]);
  useEffect(() => { toAddressRef.current = toAddress; }, [toAddress]);

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

    const interval = setInterval(() => {
      if (checkGoogle()) clearInterval(interval);
    }, 100);

    const timeout = setTimeout(() => clearInterval(interval), 5000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || !googleLoaded || mapInstanceRef.current) return;

    mapInstanceRef.current = new google.maps.Map(mapRef.current, {
      zoom: 8,
      center: { lat: 51.4545, lng: -2.5879 }, // Bristol
      disableDefaultUI: true,
      zoomControl: true,
      mapId: 'DEMO_MAP_ID',
    });
  }, [googleLoaded]);

  // Show route on map using Routes API + manual polylines
  const showRoute = async (from: AddressInfo, to: AddressInfo) => {
    if (!googleLoaded || !mapInstanceRef.current) return;

    try {
      // Clean up previous polylines
      polylinesRef.current.forEach(p => p.setMap(null));
      polylinesRef.current = [];

      const { Route } = await google.maps.importLibrary('routes');
      const origin = from.lat && from.lng ? { lat: from.lat, lng: from.lng } : from.formatted;
      const destination = to.lat && to.lng ? { lat: to.lat, lng: to.lng } : to.formatted;

      const { routes } = await Route.computeRoutes({
        origin,
        destination,
        travelMode: 'DRIVE',
        fields: ['path'],
      });

      if (routes?.[0]) {
        const polylines = routes[0].createPolylines();
        polylines.forEach((p: any) => {
          p.setOptions({ strokeColor: '#3b82f6', strokeWeight: 4 });
          p.setMap(mapInstanceRef.current);
        });
        polylinesRef.current = polylines;

        // Fit map to route bounds
        const bounds = new google.maps.LatLngBounds();
        polylines.forEach((p: any) => {
          const path = p.getPath();
          for (let i = 0; i < path.getLength(); i++) {
            bounds.extend(path.getAt(i));
          }
        });
        mapInstanceRef.current.fitBounds(bounds);
      }
    } catch (err) {
      trackError('MOVE-ADDR-003', err, { phase: 'route-display' }, 'SimpleCallbackForm');
    }
  };

  // Initialize From autocomplete (PlaceAutocompleteElement)
  useEffect(() => {
    if (!fromContainerRef.current || !googleLoaded || fromAutoElRef.current) return;

    const el = new google.maps.places.PlaceAutocompleteElement({
      includedRegionCodes: ['gb'],
      includedPrimaryTypes: ['geocode'],
    });
    el.placeholder = 'e.g. 12 High Street, Bristol';
    fromContainerRef.current.appendChild(el);
    fromAutoElRef.current = el;

    el.addEventListener('gmp-select', async (e: any) => {
      const place = e.placePrediction.toPlace();
      await place.fetchFields({ fields: ['formattedAddress', 'location'] });

      const info: AddressInfo = {
        formatted: place.formattedAddress || '',
        lat: place.location?.lat(),
        lng: place.location?.lng(),
      };
      setFromAddress(info);

      if (toAddressRef.current) {
        showRoute(info, toAddressRef.current);
      }
    });

    return () => {
      el.remove();
      fromAutoElRef.current = null;
    };
  }, [googleLoaded]);

  // Initialize To autocomplete (PlaceAutocompleteElement)
  useEffect(() => {
    if (!toContainerRef.current || !googleLoaded || toAutoElRef.current) return;

    const el = new google.maps.places.PlaceAutocompleteElement({
      includedRegionCodes: ['gb'],
      includedPrimaryTypes: ['geocode'],
    });
    el.placeholder = 'e.g. 45 Park Road, Bath';
    toContainerRef.current.appendChild(el);
    toAutoElRef.current = el;

    el.addEventListener('gmp-select', async (e: any) => {
      const place = e.placePrediction.toPlace();
      await place.fetchFields({ fields: ['formattedAddress', 'location'] });

      const info: AddressInfo = {
        formatted: place.formattedAddress || '',
        lat: place.location?.lat(),
        lng: place.location?.lng(),
      };
      setToAddress(info);

      if (fromAddressRef.current) {
        showRoute(fromAddressRef.current, info);
      }
    });

    return () => {
      el.remove();
      toAutoElRef.current = null;
    };
  }, [googleLoaded]);

  const setField = (field: keyof ContactState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setContact(c => ({ ...c, [field]: e.target.value }));

  const handleAddressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromAddress || !toAddress) return;
    trackFormStep(FORM_ID, 'route', 1, 2);
    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/callbacks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${contact.firstName} ${contact.lastName}`.trim(),
          email: contact.email,
          phone: contact.phone,
          callbackReason: 'Direct callback request — skipped instant quote',
          data: {
            'Moving from': fromAddress?.formatted || '',
            'Moving to': toAddress?.formatted || '',
          },
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) throw new Error();

      trackFormSubmitted(FORM_ID);

      // PII goes to a hidden DOM side-channel, never to dataLayer.
      const userData = normalizeUserData({
        email: contact.email,
        phone_number: contact.phone,
        first_name: contact.firstName,
        last_name: contact.lastName,
      });
      setUserDataOnDOM(userData);

      // If there's an active quote in the upgrade window, this callback
      // becomes the upgrade and consumes that quote's event_id so Google
      // Ads / Meta dedup against the same conversion.
      const active = getActiveQuoteState();
      const eventId = active ? active.eventId : generateUUID();
      const value = active ? active.value : 0;
      const service = active ? active.service : 'callback_only';

      if (active) markQuoteUpgraded();

      trackEvent('callback_conversion', {
        event_id: eventId,
        value,
        currency: 'GBP',
        service,
        source: active ? 'after_calculator' : 'standalone',
      });
      void mirrorMetaCapi('callback_conversion', eventId, {
        value,
        currency: 'GBP',
      });

      window.location.href = '/instantquote/thank-you-callback/';
    } catch {
      setError('Something went wrong. Please try again or call us directly on 0117 28 700 82.');
      setLoading(false);
    }
  };

  // Step indicator
  const stepIndicator = (
    <div className="flex items-center gap-2 mb-6">
      {[1, 2].map((n) => (
        <div key={n} className="flex items-center gap-2">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
              n === step
                ? 'bg-primary text-primary-foreground'
                : n < step
                ? 'bg-emerald-500 text-white'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {n < step ? '✓' : n}
          </div>
          <span className={`text-sm ${n === step ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
            {n === 1 ? 'Route' : 'Your details'}
          </span>
          {n < 2 && <div className="h-px w-6 bg-border" />}
        </div>
      ))}
    </div>
  );

  const canContinue = fromAddress && toAddress;

  return (
    <Card>
      <CardContent className="pt-6">
        {stepIndicator}

        {/* -- Step 1: Route -- */}
        <div className={step === 1 ? '' : 'hidden'}>
          {/* Map */}
          <div className="relative w-full h-[200px] rounded-lg overflow-hidden mb-5 bg-muted">
            <div ref={mapRef} className="absolute inset-0 w-full h-full" style={{ minHeight: '200px' }} />
            {!googleLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted">
                <Spinner className="h-6 w-6" />
                <span className="ml-2 text-sm text-muted-foreground">Loading map...</span>
              </div>
            )}
          </div>

          <form onSubmit={handleAddressSubmit} className="space-y-5">
            <div className="grid sm:grid-cols-2 gap-4">
              {/* From */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-sm font-semibold shrink-0">
                    A
                  </div>
                  <Label className="font-medium">Moving from</Label>
                </div>
                <div ref={fromContainerRef} />
                {fromAddress && (
                  <div className="flex items-center gap-1 text-sm text-emerald-600">
                    <span>✓</span> Address selected
                  </div>
                )}
              </div>

              {/* To */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-primary text-sm font-semibold shrink-0">
                    B
                  </div>
                  <Label className="font-medium">Moving to</Label>
                </div>
                <div ref={toContainerRef} />
                {toAddress && (
                  <div className="flex items-center gap-1 text-sm text-emerald-600">
                    <span>✓</span> Address selected
                  </div>
                )}
              </div>
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={!canContinue}>
              Continue
            </Button>

            {!canContinue && (
              <p className="text-xs text-muted-foreground text-center">
                Please select addresses from the dropdown suggestions
              </p>
            )}
          </form>
        </div>

        {/* -- Step 2: Contact details -- */}
        <div className={step === 2 ? '' : 'hidden'}>
          {/* Route summary */}
          <div className="mb-4 p-3 rounded-lg bg-muted/50 text-sm space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-xs font-semibold">A</span>
              <span className="truncate">{fromAddress?.formatted}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-semibold">B</span>
              <span className="truncate">{toAddress?.formatted}</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cb-firstName">First name *</Label>
                <Input
                  id="cb-firstName"
                  required
                  autoComplete="given-name"
                  placeholder="e.g. John"
                  value={contact.firstName}
                  onChange={setField('firstName')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cb-lastName">Last name *</Label>
                <Input
                  id="cb-lastName"
                  required
                  autoComplete="family-name"
                  placeholder="e.g. Smith"
                  value={contact.lastName}
                  onChange={setField('lastName')}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cb-phone">Phone number *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">📱</span>
                <Input
                  id="cb-phone"
                  type="tel"
                  required
                  autoComplete="tel"
                  placeholder="e.g. 07700 900123"
                  value={contact.phone}
                  onChange={setField('phone')}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cb-email">Email address *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">✉️</span>
                <Input
                  id="cb-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="e.g. john@example.com"
                  value={contact.email}
                  onChange={setField('email')}
                  className="pl-10"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setStep(1)}
                disabled={loading}
              >
                ← Back
              </Button>
              <Button type="submit" className="flex-1" size="lg" disabled={loading}>
                {loading ? 'Sending...' : 'Request a Callback'}
              </Button>
            </div>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}

export default SimpleCallbackForm;
