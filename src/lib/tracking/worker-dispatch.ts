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
 * Megvárja, hogy a Turnstile script (async defer a Layout <head>-ből)
 * betöltődjön. A boot.ts-ből azonnal tüzelő kései quote-konverzió tipikusan
 * MEGELŐZI a script betöltését — várakozás nélkül a `sendToWorker` token
 * híján némán eldobta a szerver-leget minden late conversionnél.
 */
function waitForTurnstile(timeoutMs = 10_000): Promise<boolean> {
  if (window.turnstile) return Promise.resolve(true);
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const iv = setInterval(() => {
      if (window.turnstile) {
        clearInterval(iv);
        resolve(true);
      } else if (Date.now() > deadline) {
        clearInterval(iv);
        resolve(false);
      }
    }, 200);
  });
}

/**
 * Egy konverzió szerver-oldali elküldése a Workerhez. Tipikusan
 * tűzz-és-felejts — a `sendToWorker` `sendBeacon`-t használ, ami túléli a
 * navigációt —, DE a beacon csak a Turnstile-token megszerzése UTÁN áll
 * sorba. Ha a hívó a dispatch után navigál (callback-flow), várja meg a
 * visszaadott Promise-t (pl. `trackEventBeforeNavigate` `alsoWaitFor`
 * opciójával), különben a kemény navigáció megöli a folyamatban lévő
 * token-mintet és a CAPI-leg elveszik. Ismeretlen `internalEventName`
 * esetén némán kihagyja.
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

  return (async () => {
    if (!(await waitForTurnstile())) {
      console.warn('[tracking] Turnstile never loaded, dropping server-side dispatch', event_name);
      return false;
    }
    return sendToWorker(payload);
  })();
}
