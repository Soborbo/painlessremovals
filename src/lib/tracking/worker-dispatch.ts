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

/**
 * A gateway Run 6 óta a high-value (form/lead/purchase) konverziókat CSAK a
 * hitelesített szerver-ingressen fogadja — a böngésző-útról 403-mal dobja
 * (TRK-400-017). Ezeket a SITE BACKENDJE dispatcheli (deliverGatewayConversion
 * az api/contact, api/callbacks, api/save-quote, api/clearance-callback és a
 * simple-callback flow-ban) UGYANAZZAL az event_id-vel → a Pixel↔CAPI dedup ép.
 * Itt központilag kihagyjuk őket, hogy egyetlen call site se termeljen
 * garantált-403 zajt.
 */
const SERVER_ONLY_CANONICAL = new Set([
  'quote_calculator_submitted',
  'callback_request_submitted',
  'contact_form_submitted',
  'order_request_submitted',
  'purchase',
]);

export interface WorkerConversionOptions {
  value?: number;
  currency?: string;
  service?: string;
  source?: string;
  /** Nyers PII; alapból a rejtett DOM side-channelből olvas. A Worker hash-eli. */
  userData?: UserData;
}

/**
 * Egy konverzió szerver-oldali elküldése a Workerhez. Tűzz-és-felejts — a
 * `sendToWorker` `sendBeacon`-t használ, ami túléli a navigációt. Ismeretlen
 * `internalEventName` és server-only (gated) event esetén némán kihagyja.
 *
 * @returns true, ha a beacon/fetch ténylegesen sorba állt.
 */
export function dispatchWorkerConversion(
  internalEventName: string,
  eventId: string,
  opts: WorkerConversionOptions = {},
): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  const event_name = CANONICAL_EVENT[internalEventName];
  if (!event_name) return Promise.resolve(false);
  if (SERVER_ONLY_CANONICAL.has(event_name)) {
    // Szándékos no-op: a szerver-leg a backendé (lásd fent). A hívó dataLayer
    // push-a (Pixel/GA4/Ads) érintetlen.
    return Promise.resolve(false);
  }

  // Onboarding #4: SOHA ne küldj value:0-t — hagyd ki a value-t (és a hozzá
  // tartozó currency-t), ha nincs valós pénzérték.
  const hasValue = typeof opts.value === 'number' && opts.value > 0;

  // A user_data-t SZINKRON olvassuk (a hívó a dispatch után azonnal
  // törölheti a rejtett DOM side-channelt), a küldés maga aszinkron.
  const payload = {
    event_name,
    event_id: eventId,
    event_time: Math.floor(Date.now() / 1000),
    ...(hasValue ? { value: opts.value, currency: opts.currency || 'GBP' } : {}),
    ...(opts.service ? { service: opts.service } : {}),
    ...(opts.source ? { source: opts.source } : {}),
    user_data: opts.userData ?? readUserDataFromDOM(),
  };

  // A Turnstile-várakozás megszűnt: a gateway nem validál Turnstile-t, a
  // token-mint csak latency + néma kiesés-kockázat volt (2026-06→07 outage).
  return sendToWorker(payload);
}
