# Tracking rebuild — Soborbo event-gateway Worker (Model 2)

A konverziók szerver-oldali fele átállt a saját Astro Meta CAPI route-ról
(`/api/meta/capi`, kivezetve) a Soborbo event-gateway Workerre. Forrás:
`D:/Serverside/docs/painless-website-tracking-onboarding.md`.

## Mi változott a kódban

- **Új kanonikus client-lib** (változtatás nélkül a `Serverside/client-lib`-ből):
  `src/lib/worker-tracking.ts` + `src/lib/uuid.ts`. (A `worker-tracking.ts`
  `declare global` Window-blokkjából a `dataLayer`/`fbq` deklarációt kivettük,
  mert azt a meglévő `src/lib/tracking/tracking.ts` deklarálja — egyébként
  TS-duplikáció. A futási logika változatlan.)
- **Új híd:** `src/lib/tracking/worker-dispatch.ts` →
  `dispatchWorkerConversion(internalName, eventId, opts)`. Leképezi a site belső
  event-szótárát a Worker kanonikus event-neveire, és a `sendToWorker`-rel
  POST-ol a `/api/event/conversion`-ra. Inline (`is:inline`) form-scriptekből a
  `window.PR_trackWorkerConversion` globálon át hívható (boot.ts exponálja).
- **Turnstile mindig betöltődik** (Layout): a `<script>` + a
  `<div id="cf-turnstile-invisible">` már nincs `PUBLIC_GATEWAY_ENABLED` mögé
  zárva — a Worker-leg Turnstile-tokent kér.
- **GA4/GTM böngésző-analytics ÉRINTETLEN.** A `trackEvent(...)` dataLayer
  pushok (scroll, form-step, abandonment, ViewContent és a konverziók belső
  event-nevei) ugyanúgy mennek. Ez a rebuild csak a **szerver-leget** cserélte.
- **Kivezetve:** `src/pages/api/meta/capi.ts` (böngésző-mirror route),
  `meta-mirror.ts`, a régi shadow `worker-tracking.ts` + `gateway.ts` (+ tesztek),
  és a holt `src/lib/soborbo/` + `src/components/soborbo/` scaffolding. A
  `api/contact.ts` és `api/clearance-callback.ts` szerver-oldali `sendMetaCapi`
  ága törölve (a Worker küldi a Metát) — a **GA4 MP** szerver-backstop maradt.

## event_id dedup — egy közös kulcs

Minden konverziónál UGYANAZ az `event_id` megy:
1. a `trackEvent(...)` dataLayer pushba (innen a böngésző Meta Pixel az
   `eventID`-t veszi), **és**
2. a `dispatchWorkerConversion(...)`-on át a Workernek (CAPI).

Ezért a Meta a böngésző + szerver eventet **egy** konverziónak látja.

## Belső event-név → Worker kanonikus név → Meta event

| Konverziós pont | dataLayer event (GTM trigger) | Worker kanonikus név | Meta |
|---|---|---|---|
| Tel: kattintás | `phone_conversion` | `phone_number_clicked` | Contact |
| Mailto: kattintás | `email_conversion` | `email_address_clicked` | Contact |
| WhatsApp kattintás | `whatsapp_conversion` | `whatsapp_button_clicked` | Contact |
| Kapcsolat-űrlap | `contact_form_submit` | `contact_form_submitted` | Contact |
| Visszahívás-kérés | `callback_conversion` | `callback_request_submitted` | Lead |
| House-clearance callback | `clearance_callback_conversion` | `callback_request_submitted` | Lead |
| Kalkulátor (upgrade-ablak Lead) | `quote_calculator_conversion` | `quote_calculator_submitted` | Lead |

A **dataLayer event-nevek NEM változtak** → a meglévő GTM triggerek tovább
működnek. A kalkulátor `quote_calculator_complete` és
`quote_calculator_first_view` (ViewContent) **böngésző-only** maradt — ezek nem
kanonikus konverziók, nem mennek a Workerhez.

## Amit a GTM-ben ELLENŐRIZNI kell (kód nem érinti)

A böngésző+szerver dedup már korábban is `event_id`-vel ment (a régi
`/api/meta/capi` ellen), úgyhogy elvileg **nincs GTM-változtatás** — csak verifikáld:

1. **Minden Meta Pixel tag `eventID` mezője = `{{DLV - event_id}}`** (a dataLayer
   `event_id`). Ha valamelyik tagről hiányzik, a böngésző+szerver páros két külön
   konverzió lesz (dupla Lead/Contact → torz ROAS).
2. **A Pixel-tagek Meta event-neve egyezzen a fenti tábla „Meta" oszlopával**
   (Contact a kattintás/contact, Lead a callback/quote). A Worker SITE_CONFIG
   ugyanezt a leképezést használja → így dedupál a `(event_name, event_id)` páron.
3. **GA4/Google Ads tagek érintetlenek** — Model 2: a Worker on-site GA4-et és
   Ads-et NEM küld, csak Meta CAPI-t. Nincs szerver-oldali dupla GA4/Ads.

## Előfeltételek (state: 2026-06-28)

- `PUBLIC_TURNSTILE_SITE_KEY` beállítva (megerősítve). A site key párja a Worker
  `TURNSTILE_SECRET_KEY`-e — egy összetartozó Turnstile widget.
- `painlessremovals.com/api/event/conversion` route a Workerhez él (onboarding §1).

## Verifikáció élesítés után

1. **Network:** egy konverzió után `POST /api/event/conversion` → **204**.
2. **Meta Events Manager → Test Events / Activity** (pixel 292656820246446):
   a böngésző + szerver event AZONOS `event_id`-vel → „Deduplicated". Ez a
   legfontosabb.
3. **GA4 DebugView:** a konverzió a böngésző tagből látszik (változatlan).
4. **Worker `events_raw`:** megjelennek-e a valós eventek (eddig 0).

## GTM audit (MCP-vel ellenőrizve 2026-06-28 — GTM-PXTH5JJK)

A teljes konténert átnéztem: a `DLV - event_id` változó él, és **minden Meta Pixel
tag már `eventID: '{{DLV - event_id}}'`-t használ** a helyes Contact/Lead event-tel.
A 16 trigger a belső dataLayer event-nevekre kulcsol (`phone_conversion`,
`callback_conversion`, `quote_calculator_conversion`, stb.) — ezeket a kód
változatlanul pusholja. **A cutoverhez nem kellett GTM-változtatás.**

## House-clearance = árkalkulátor-konverzió (élesítve 2026-06-28, GTM v51)

A clearance callback mostantól **ugyanúgy számít, mint egy kitöltött árkalkulátor**:
érték-hordozó Lead, böngésző+szerver Meta dedup párral.

- **Kód** ([ClearanceCalculator.astro](../src/components/ClearanceCalculator.astro)): a
  `clearance_callback_conversion` dataLayer push (és a worker-dispatch) `value`
  (£ becslés) + `currency: 'GBP'` + `service: 'house_clearance'`-t hordoz.
- **GTM** (publikált v51 — MCP-vel létrehozva):
  - trigger `clearance_callback_conversion` (id 109)
  - „Meta Pixel — Lead (clearance)" (110) — Lead, value/currency, `eventID = {{DLV - event_id}}`
  - „Google Ads — Quote Calc Conversion (clearance)" (111) — a quote-calc akció (label `qC8BCIeJ16scEPSE39kq`), value/currency, `orderId = {{DLV - event_id}}`
  - „GA4 Event — quote_calculator_conversion (clearance)" (112) — value/currency/service
- **Deploy-sorrend:** a GTM már él, de a `{{DLV - value}}` csak a **site-deploy** után
  lesz kitöltve (a value-t a kód pusholja a dataLayerbe). Addig a clearance Lead érték
  nélkül menne — vidd ki mielőbb a site-deployt.
- **GA4 dupla event (tudatos):** a clearance szerver-oldalon továbbra is küld egy
  `clearance_callback_conversion` GA4 MP eventet, a böngésző pedig az új
  `quote_calculator_conversion` GA4 eventet → egy clearance beküldésre két GA4 event.

## Ismert korlát

Az upgrade-ablak **kései** quote-konverziója (a user lezárta a tabot, 1–24h múlva
visszatér, és nem upgrade-el) a `resumeQuoteTimer` során nagyon korán tüzelhet —
ha a Turnstile script még nem töltött be, a Worker-leg azt az egy esetet
kihagyhatja (a böngésző Pixel/GA4 dataLayer push viszont megy). Ritka edge; a
kanonikus libet szándékosan nem módosítottuk miatta.
