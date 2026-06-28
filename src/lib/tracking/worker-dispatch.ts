/**
 * Server-side conversion dispatch a Soborbo event-gateway Workerhez.
 *
 * Ez a SZERVER-leg. A böngésző Meta Pixel / GA4 / Google Ads továbbra is a
 * GTM-ből tüzel a meglévő `trackEvent(...)` dataLayer push-ra — azt nem
 * bántjuk. Ez csak a `sendToWorker`-en keresztül POST-ol a
 * `/api/event/conversion` route-ra (Worker → Meta CAPI), UGYANAZZAL az
 * `event_id`-vel, ami a Meta böngésző+szerver dedup kulcsa.
 *
 * Model 2: a Worker on-site CSAK Meta CAPI-t küld — GA4-et és Google Ads-et
 * NEM (azt a böngésző birtokolja). Ezért ez sosem duplikál GA4/Ads-et.
 *
 * A site belső event-szótárát (pl. `phone_conversion`) leképezi a Worker
 * kanonikus event-neveire (`phone_number_clicked`, …) — lásd a
 * `painless-website-tracking-onboarding.md` 4. szakaszának tábláját.
 */

import { sendToWorker } from '@/lib/worker-tracking';
import { readUserDataFromDOM, type UserData } from './tracking';

/** Belső event-név → Worker kanonikus event-név. */
const CANONICAL_EVENT: Record<string, string> = {
  phone_conversion: 'phone_number_clicked',
  email_conversion: 'email_address_clicked',
  whatsapp_conversion: 'whatsapp_button_clicked',
  quote_calculator_conversion: 'quote_calculator_submitted',
  callback_conversion: 'callback_request_submitted',
  clearance_callback_conversion: 'callback_request_submitted',
  contact_form_submit: 'contact_form_submitted',
};

export interface WorkerConversionOptions {
  value?: number;
  currency?: string;
  service?: string;
  source?: string;
  /** Nyers PII; alapból a rejtett DOM side-channelből olvas. A Worker hash-eli. */
  userData?: UserData;
}

/**
 * Egy konverzió szerver-oldali elküldése a Workerhez. Tűzz-és-felejts
 * (nem await-elendő) — a `sendToWorker` `sendBeacon`-t használ, ami túléli a
 * navigációt. Ismeretlen `internalEventName` esetén némán kihagyja.
 */
export function dispatchWorkerConversion(
  internalEventName: string,
  eventId: string,
  opts: WorkerConversionOptions = {},
): void {
  if (typeof window === 'undefined') return;
  const event_name = CANONICAL_EVENT[internalEventName];
  if (!event_name) return;

  // Onboarding #4: SOHA ne küldj value:0-t — hagyd ki a value-t (és a hozzá
  // tartozó currency-t), ha nincs valós pénzérték.
  const hasValue = typeof opts.value === 'number' && opts.value > 0;

  void sendToWorker({
    event_name,
    event_id: eventId,
    event_time: Math.floor(Date.now() / 1000),
    ...(hasValue ? { value: opts.value, currency: opts.currency || 'GBP' } : {}),
    ...(opts.service ? { service: opts.service } : {}),
    ...(opts.source ? { source: opts.source } : {}),
    user_data: opts.userData ?? readUserDataFromDOM(),
  });
}
