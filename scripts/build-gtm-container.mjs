#!/usr/bin/env node
/**
 * Generates the v2 GTM container JSON for the painlessremovals.com site.
 *
 * The existing container `GTM-PXTH5JJK` had broken event-name triggers
 * and missing DLV variables (see commit history for details). This v2
 * is a clean rewrite that aligns with the dataLayer events fired by
 * `src/lib/tracking/`.
 *
 * Run:
 *   node scripts/build-gtm-container.mjs
 *
 * Output:
 *   GTM-PXTH5JJK_workspace_v2.json
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'GTM-PXTH5JJK_workspace_v2.json');

const ACCOUNT_ID = '6202585123';
const CONTAINER_ID = '169431610';
const PUBLIC_ID = 'GTM-PXTH5JJK';
const GA4_MEASUREMENT_ID = 'G-05GFQ1XQFH';
const ADS_CONVERSION_ID = '11462492788';
const META_PIXEL_ID = '292656820246446';
const COOKIEYES_KEY = '18c97560910f85eb03355b1c';

// Custom Templates (CookieYes CMP) — preserved verbatim from the
// previous container so it doesn't have to be re-installed from the
// gallery.
const customTemplates = JSON.parse(readFileSync(join(__dirname, 'gtm-templates.json'), 'utf-8'));

// Existing Google Ads conversion labels (kept to preserve attribution history)
const ADS_LABEL_QUOTE_CONVERSION = '_hSkCPT1iYUZEPSE39kq'; // was "Instant Quote Submitted"
const ADS_LABEL_PHONE = '4C2oCIe9ioUZEPSE39kq'; // was "Phone number click"
const ADS_LABEL_CALLBACK = 'tmiYCKzk2MwaEPSE39kq'; // was "Call Back Requested"

const fp = (n) => String(1714200000000 + n);

// ---------------------------------------------------------------------------
// IDs
// ---------------------------------------------------------------------------

const trigId = {
  pageview: '2147479553',
  windowLoaded: '2147479573',
  consent_init: '2147479572',
  pricing_view: '101',
  form_start: '102',
  form_step_complete: '103',
  form_abandonment: '104',
  quote_calculator_complete: '105',
  quote_calculator_first_view: '106',
  quote_calculator_conversion: '107',
  callback_conversion: '108',
  contact_form_submit: '109',
  phone_conversion: '110',
  email_conversion: '111',
  whatsapp_conversion: '112',
  attribution_selected: '113',
  attribution_skipped: '114',
  scroll_50: '115',
  scroll_90: '116',
};

const varId = {
  dlv_event_id: '201',
  dlv_value: '202',
  dlv_currency: '203',
  dlv_service: '204',
  dlv_quote_id: '205',
  dlv_source: '206',
  dlv_form_name: '207',
  dlv_step_name: '208',
  dlv_attribution_source: '209',
  dlv_late_conversion: '210',
  dlv_tel_target: '211',
  js_email_dom: '220',
  js_phone_dom: '221',
  js_first_name_dom: '222',
  js_last_name_dom: '223',
  js_city_dom: '224',
  js_postcode_dom: '225',
  js_country_dom: '226',
  js_user_data_object: '227',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function customEventTrigger(triggerId, eventName, name) {
  return {
    accountId: ACCOUNT_ID,
    containerId: CONTAINER_ID,
    triggerId,
    name: name || eventName,
    type: 'CUSTOM_EVENT',
    customEventFilter: [
      {
        type: 'EQUALS',
        parameter: [
          { type: 'TEMPLATE', key: 'arg0', value: '{{_event}}' },
          { type: 'TEMPLATE', key: 'arg1', value: eventName },
        ],
      },
    ],
    fingerprint: fp(parseInt(triggerId, 10)),
  };
}

function dlv(variableId, name, dlKey) {
  return {
    accountId: ACCOUNT_ID,
    containerId: CONTAINER_ID,
    variableId,
    name,
    type: 'v',
    parameter: [
      { type: 'INTEGER', key: 'dataLayerVersion', value: '2' },
      { type: 'BOOLEAN', key: 'setDefaultValue', value: 'false' },
      { type: 'TEMPLATE', key: 'name', value: dlKey },
    ],
    fingerprint: fp(parseInt(variableId, 10)),
    formatValue: {},
  };
}

function jsVar(variableId, name, datasetKey) {
  const code = `function() {\n  var el = document.getElementById('__pl_user_data__');\n  if (!el) return undefined;\n  return el.dataset.${datasetKey} || undefined;\n}`;
  return {
    accountId: ACCOUNT_ID,
    containerId: CONTAINER_ID,
    variableId,
    name,
    type: 'jsm',
    parameter: [{ type: 'TEMPLATE', key: 'javascript', value: code }],
    fingerprint: fp(parseInt(variableId, 10)),
    formatValue: {},
  };
}

function consentSettings(adStorageRequired) {
  // Google tags use built-in consent handling; HTML/Meta tags need explicit ad_storage gating.
  if (adStorageRequired) {
    return { consentStatus: 'NEEDED', consentType: { type: 'LIST', list: [{ type: 'TEMPLATE', value: 'ad_storage' }] } };
  }
  return { consentStatus: 'NOT_SET' };
}

// ---------------------------------------------------------------------------
// Variables
// ---------------------------------------------------------------------------

const variables = [
  dlv(varId.dlv_event_id, 'DLV - event_id', 'event_id'),
  dlv(varId.dlv_value, 'DLV - value', 'value'),
  dlv(varId.dlv_currency, 'DLV - currency', 'currency'),
  dlv(varId.dlv_service, 'DLV - service', 'service'),
  dlv(varId.dlv_quote_id, 'DLV - quote_id', 'quote_id'),
  dlv(varId.dlv_source, 'DLV - source', 'source'),
  dlv(varId.dlv_form_name, 'DLV - form_name', 'form_name'),
  dlv(varId.dlv_step_name, 'DLV - step_name', 'step_name'),
  dlv(varId.dlv_attribution_source, 'DLV - attribution_source', 'attribution_source'),
  dlv(varId.dlv_late_conversion, 'DLV - late_conversion', 'late_conversion'),
  dlv(varId.dlv_tel_target, 'DLV - tel_target', 'tel_target'),
  jsVar(varId.js_email_dom, 'JS - email from DOM', 'email'),
  jsVar(varId.js_phone_dom, 'JS - phone from DOM', 'phone'),
  jsVar(varId.js_first_name_dom, 'JS - first_name from DOM', 'firstName'),
  jsVar(varId.js_last_name_dom, 'JS - last_name from DOM', 'lastName'),
  jsVar(varId.js_city_dom, 'JS - city from DOM', 'city'),
  jsVar(varId.js_postcode_dom, 'JS - postcode from DOM', 'postalCode'),
  jsVar(varId.js_country_dom, 'JS - country from DOM', 'country'),

  // Composite user_data variable for Google Ads Enhanced Conversions.
  // The Google Tag picks this up via its `user_data` config parameter
  // and propagates it to every gtag conversion event automatically.
  // Returns undefined when the hidden DOM element doesn't exist yet
  // (e.g. on initial page-load before any form is submitted), which
  // makes gtag silently skip the user_data field for that event.
  {
    accountId: ACCOUNT_ID,
    containerId: CONTAINER_ID,
    variableId: varId.js_user_data_object,
    name: 'JS - User Data Object',
    type: 'jsm',
    parameter: [
      {
        type: 'TEMPLATE',
        key: 'javascript',
        value:
          "function() {\n" +
          "  var el = document.getElementById('__pl_user_data__');\n" +
          "  if (!el) return undefined;\n" +
          "  var d = el.dataset;\n" +
          "  var hasAny = d.email || d.phone || d.firstName || d.lastName ||\n" +
          "               d.city || d.postalCode || d.country;\n" +
          "  if (!hasAny) return undefined;\n" +
          "  var data = {};\n" +
          "  if (d.email)     data.email        = d.email;\n" +
          "  if (d.phone)     data.phone_number = d.phone;\n" +
          "  var addr = {};\n" +
          "  if (d.firstName)  addr.first_name  = d.firstName;\n" +
          "  if (d.lastName)   addr.last_name   = d.lastName;\n" +
          "  if (d.city)       addr.city        = d.city;\n" +
          "  if (d.postalCode) addr.postal_code = d.postalCode;\n" +
          "  if (d.country)    addr.country     = d.country;\n" +
          "  if (Object.keys(addr).length) data.address = addr;\n" +
          "  return data;\n" +
          "}",
      },
    ],
    fingerprint: fp(parseInt(varId.js_user_data_object, 10)),
    formatValue: {},
  },
];

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

const triggers = [
  customEventTrigger(trigId.pricing_view, 'pricing_view'),
  customEventTrigger(trigId.form_start, 'form_start'),
  customEventTrigger(trigId.form_step_complete, 'form_step_complete'),
  customEventTrigger(trigId.form_abandonment, 'form_abandonment'),
  customEventTrigger(trigId.quote_calculator_complete, 'quote_calculator_complete'),
  customEventTrigger(trigId.quote_calculator_first_view, 'quote_calculator_first_view'),
  customEventTrigger(trigId.quote_calculator_conversion, 'quote_calculator_conversion'),
  customEventTrigger(trigId.callback_conversion, 'callback_conversion'),
  customEventTrigger(trigId.contact_form_submit, 'contact_form_submit'),
  customEventTrigger(trigId.phone_conversion, 'phone_conversion'),
  customEventTrigger(trigId.email_conversion, 'email_conversion'),
  customEventTrigger(trigId.whatsapp_conversion, 'whatsapp_conversion'),
  customEventTrigger(trigId.attribution_selected, 'attribution_selected'),
  customEventTrigger(trigId.attribution_skipped, 'attribution_skipped'),
  customEventTrigger(trigId.scroll_50, 'scroll_50'),
  customEventTrigger(trigId.scroll_90, 'scroll_90'),
];

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

const tags = [];
let nextTagId = 300;
function pushTag(tag) {
  tags.push({ ...tag, accountId: ACCOUNT_ID, containerId: CONTAINER_ID, tagId: String(nextTagId), fingerprint: fp(nextTagId), tagFiringOption: 'ONCE_PER_EVENT', monitoringMetadata: { type: 'MAP' } });
  nextTagId++;
}

// 0. CookieYes CMP — fires on Consent Initialization (built-in trigger
//    `2147479572`), so it loads BEFORE any other tag. Sets the consent
//    banner up; user choice triggers `gtag('consent','update',...)`.
pushTag({
  name: 'CookieYes CMP',
  type: 'cvt_KDQSW',
  parameter: [
    { type: 'BOOLEAN', key: 'urlPassThrough', value: 'false' },
    { type: 'BOOLEAN', key: 'adsRedaction', value: 'false' },
    { type: 'TEMPLATE', key: 'websiteKey', value: COOKIEYES_KEY },
    { type: 'TEMPLATE', key: 'waitForTime', value: '2000' },
    {
      type: 'LIST',
      key: 'regionSettings',
      list: [
        {
          type: 'MAP',
          map: [
            { type: 'TEMPLATE', key: 'analytics', value: 'denied' },
            { type: 'TEMPLATE', key: 'advertisement', value: 'denied' },
            { type: 'TEMPLATE', key: 'functional', value: 'denied' },
            { type: 'TEMPLATE', key: 'security', value: 'granted' },
            { type: 'TEMPLATE', key: 'adUserData', value: 'denied' },
            { type: 'TEMPLATE', key: 'adPersonal', value: 'denied' },
            { type: 'TEMPLATE', key: 'regions', value: 'All' },
          ],
        },
      ],
    },
  ],
  firingTriggerId: ['2147479572'],
  consentSettings: consentSettings(false),
});

// 1. Google Tag (GA4 + Ads loader). `user_data` is set as a Shared
//    event setting so every gtag conversion event automatically picks
//    up the User-Provided Data — no per-conversion-tag wiring needed.
//    The variable returns undefined when the hidden DOM element isn't
//    populated, which makes gtag skip the user_data field cleanly.
pushTag({
  name: 'Google Tag — GA4',
  type: 'googtag',
  parameter: [
    { type: 'TEMPLATE', key: 'tagId', value: GA4_MEASUREMENT_ID },
    {
      type: 'LIST',
      key: 'eventSettingsTable',
      list: [
        {
          type: 'MAP',
          map: [
            { type: 'TEMPLATE', key: 'parameter', value: 'user_data' },
            { type: 'TEMPLATE', key: 'parameterValue', value: '{{JS - User Data Object}}' },
          ],
        },
      ],
    },
  ],
  firingTriggerId: [trigId.pageview],
  consentSettings: consentSettings(false),
});

// 2. Conversion Linker
pushTag({
  name: 'Conversion Linker',
  type: 'gclidw',
  parameter: [
    { type: 'BOOLEAN', key: 'enableCrossDomain', value: 'false' },
    { type: 'TEMPLATE', key: 'path', value: '/' },
    { type: 'BOOLEAN', key: 'enableUrlPassthrough', value: 'true' },
    { type: 'BOOLEAN', key: 'enableCookieOverrides', value: 'true' },
  ],
  firingTriggerId: [trigId.pageview],
  consentSettings: consentSettings(false),
});

// 3. Meta Pixel base — loads fbq, fires PageView. Consent-gated on ad_storage.
pushTag({
  name: 'Meta Pixel — base loader',
  type: 'html',
  parameter: [
    {
      type: 'TEMPLATE',
      key: 'html',
      value: `<!-- Meta Pixel base -->\n<script>\n(function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js'));\n/* Disable Meta's automatic event detection (SubscribedButtonClick,\n   FormSubmit etc.). We fire conversions explicitly via GTM with\n   correct event_id for browser+CAPI dedup; auto-detection adds noise\n   and can't be deduped. Must be set BEFORE fbq('init'). */\nfbq('set', 'autoConfig', false, '${META_PIXEL_ID}');\nfbq('init', '${META_PIXEL_ID}');\nfbq('track', 'PageView');\n</script>\n<noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1" /></noscript>`,
    },
    { type: 'BOOLEAN', key: 'supportDocumentWrite', value: 'false' },
  ],
  firingTriggerId: [trigId.pageview],
  consentSettings: consentSettings(true),
});

// 4. GA4 Event tags — one per dataLayer event.
const ga4Events = [
  { name: 'pricing_view', trigger: trigId.pricing_view },
  { name: 'form_start', trigger: trigId.form_start, params: [['form_name', '{{DLV - form_name}}']] },
  { name: 'form_step_complete', trigger: trigId.form_step_complete, params: [['form_name', '{{DLV - form_name}}'], ['step_name', '{{DLV - step_name}}']] },
  { name: 'form_abandonment', trigger: trigId.form_abandonment, params: [['form_name', '{{DLV - form_name}}']] },
  { name: 'quote_calculator_complete', trigger: trigId.quote_calculator_complete, params: [['service', '{{DLV - service}}'], ['quote_id', '{{DLV - quote_id}}'], ['value', '{{DLV - value}}'], ['currency', '{{DLV - currency}}']] },
  { name: 'quote_calculator_first_view', trigger: trigId.quote_calculator_first_view, params: [['service', '{{DLV - service}}']] },
  { name: 'quote_calculator_conversion', trigger: trigId.quote_calculator_conversion, params: [['value', '{{DLV - value}}'], ['currency', '{{DLV - currency}}'], ['service', '{{DLV - service}}'], ['late_conversion', '{{DLV - late_conversion}}']] },
  { name: 'callback_conversion', trigger: trigId.callback_conversion, params: [['value', '{{DLV - value}}'], ['currency', '{{DLV - currency}}'], ['source', '{{DLV - source}}']] },
  { name: 'contact_form_submit', trigger: trigId.contact_form_submit },
  { name: 'phone_conversion', trigger: trigId.phone_conversion, params: [['value', '{{DLV - value}}'], ['source', '{{DLV - source}}']] },
  { name: 'email_conversion', trigger: trigId.email_conversion, params: [['source', '{{DLV - source}}']] },
  { name: 'whatsapp_conversion', trigger: trigId.whatsapp_conversion, params: [['source', '{{DLV - source}}']] },
  { name: 'attribution_selected', trigger: trigId.attribution_selected, params: [['attribution_source', '{{DLV - attribution_source}}']] },
  { name: 'attribution_skipped', trigger: trigId.attribution_skipped },
  { name: 'scroll_50', trigger: trigId.scroll_50 },
  { name: 'scroll_90', trigger: trigId.scroll_90 },
];

for (const ev of ga4Events) {
  pushTag({
    name: `GA4 Event — ${ev.name}`,
    type: 'gaawe',
    parameter: [
      { type: 'BOOLEAN', key: 'sendEcommerceData', value: 'false' },
      { type: 'TEMPLATE', key: 'eventName', value: ev.name },
      ...(ev.params
        ? [{
            type: 'LIST',
            key: 'eventSettingsTable',
            list: ev.params.map(([k, v]) => ({
              type: 'MAP',
              map: [
                { type: 'TEMPLATE', key: 'parameter', value: k },
                { type: 'TEMPLATE', key: 'parameterValue', value: v },
              ],
            })),
          }]
        : []),
      { type: 'TEMPLATE', key: 'measurementIdOverride', value: GA4_MEASUREMENT_ID },
    ],
    firingTriggerId: [ev.trigger],
    consentSettings: consentSettings(false),
  });
}

// 5. Google Ads conversion tags — three existing labels (Quote, Phone, Callback).
const adsConversions = [
  { name: 'Google Ads — Quote Calculator Conversion', label: ADS_LABEL_QUOTE_CONVERSION, trigger: trigId.quote_calculator_conversion, useValue: true },
  { name: 'Google Ads — Phone Click', label: ADS_LABEL_PHONE, trigger: trigId.phone_conversion, useValue: true },
  { name: 'Google Ads — Callback Conversion', label: ADS_LABEL_CALLBACK, trigger: trigId.callback_conversion, useValue: true },
];

for (const c of adsConversions) {
  pushTag({
    name: c.name,
    type: 'awct',
    parameter: [
      { type: 'BOOLEAN', key: 'enableNewCustomerReporting', value: 'false' },
      { type: 'BOOLEAN', key: 'enableConversionLinker', value: 'true' },
      { type: 'TEMPLATE', key: 'conversionId', value: ADS_CONVERSION_ID },
      { type: 'TEMPLATE', key: 'conversionLabel', value: c.label },
      ...(c.useValue
        ? [
            { type: 'TEMPLATE', key: 'conversionValue', value: '{{DLV - value}}' },
            { type: 'TEMPLATE', key: 'currencyCode', value: '{{DLV - currency}}' },
          ]
        : []),
      { type: 'TEMPLATE', key: 'orderId', value: '{{DLV - event_id}}' },
      // Enhanced Conversions (User-Provided Data) is configured
      // manually post-import in the GTM UI — see docs/tracking.md.
      // The JS-from-DOM variables are already set up and ready to be
      // wired into each conversion tag's User-Provided Data block.
      { type: 'BOOLEAN', key: 'rdp', value: 'false' },
    ],
    firingTriggerId: [c.trigger],
    consentSettings: consentSettings(false),
  });
}

// 6. Meta Pixel custom event tags — Lead, Contact, ViewContent.
function metaPixelTag(name, fbqName, triggers, opts = {}) {
  const customDataLines = [];
  if (opts.value) customDataLines.push(`value: ${opts.valueExpr || '{{DLV - value}}'}`);
  if (opts.currency) customDataLines.push(`currency: '{{DLV - currency}}'`);
  if (opts.contentName) customDataLines.push(`content_name: '${opts.contentName}'`);
  const customData = customDataLines.length
    ? `, {\n  ${customDataLines.join(',\n  ')}\n}`
    : `, {}`;
  const html = `<script>\nif (typeof fbq === 'function') {\n  fbq('track', '${fbqName}'${customData}, { eventID: '{{DLV - event_id}}' });\n}\n</script>`;
  pushTag({
    name,
    type: 'html',
    parameter: [
      { type: 'TEMPLATE', key: 'html', value: html },
      { type: 'BOOLEAN', key: 'supportDocumentWrite', value: 'false' },
    ],
    firingTriggerId: triggers,
    consentSettings: consentSettings(true),
  });
}

metaPixelTag('Meta Pixel — Lead (quote conversion)', 'Lead', [trigId.quote_calculator_conversion], { value: true, currency: true });
metaPixelTag('Meta Pixel — Lead (callback)', 'Lead', [trigId.callback_conversion], { value: true, currency: true });
metaPixelTag('Meta Pixel — Contact (phone)', 'Contact', [trigId.phone_conversion], { value: true, currency: true });
metaPixelTag('Meta Pixel — Contact (email)', 'Contact', [trigId.email_conversion]);
metaPixelTag('Meta Pixel — Contact (whatsapp)', 'Contact', [trigId.whatsapp_conversion]);
metaPixelTag('Meta Pixel — Contact (form submit)', 'Contact', [trigId.contact_form_submit]);
// ViewContent — first-completion engagement signal, NO value (prevents Advantage+ corruption).
metaPixelTag('Meta Pixel — ViewContent (first quote)', 'ViewContent', [trigId.quote_calculator_first_view]);

// ---------------------------------------------------------------------------
// Build container
// ---------------------------------------------------------------------------

const container = {
  exportFormatVersion: 2,
  exportTime: new Date().toISOString(),
  containerVersion: {
    path: `accounts/${ACCOUNT_ID}/containers/${CONTAINER_ID}/versions/0`,
    accountId: ACCOUNT_ID,
    containerId: CONTAINER_ID,
    containerVersionId: '0',
    name: 'painlessremovals.com — v2 (auto-generated)',
    description: 'Generated from scripts/build-gtm-container.mjs. Do not edit by hand — re-run the script and re-import.',
    container: {
      path: `accounts/${ACCOUNT_ID}/containers/${CONTAINER_ID}`,
      accountId: ACCOUNT_ID,
      containerId: CONTAINER_ID,
      name: 'painlessremovals.com',
      publicId: PUBLIC_ID,
      usageContext: ['WEB'],
      fingerprint: fp(0),
      tagManagerUrl: `https://tagmanager.google.com/#/container/accounts/${ACCOUNT_ID}/containers/${CONTAINER_ID}/workspaces`,
      features: {
        supportUserPermissions: true,
        supportEnvironments: true,
        supportWorkspaces: true,
        supportGtagConfigs: false,
        supportBuiltInVariables: true,
        supportClients: false,
        supportFolders: true,
        supportTags: true,
        supportTemplates: true,
        supportTriggers: true,
        supportVariables: true,
        supportVersions: true,
        supportZones: true,
        supportTransformations: false,
      },
      tagIds: [PUBLIC_ID],
    },
    tag: tags,
    trigger: triggers,
    variable: variables,
    customTemplate: customTemplates,
    builtInVariable: [
      { accountId: ACCOUNT_ID, containerId: CONTAINER_ID, type: 'PAGE_URL', name: 'Page URL' },
      { accountId: ACCOUNT_ID, containerId: CONTAINER_ID, type: 'PAGE_HOSTNAME', name: 'Page Hostname' },
      { accountId: ACCOUNT_ID, containerId: CONTAINER_ID, type: 'PAGE_PATH', name: 'Page Path' },
      { accountId: ACCOUNT_ID, containerId: CONTAINER_ID, type: 'REFERRER', name: 'Referrer' },
      { accountId: ACCOUNT_ID, containerId: CONTAINER_ID, type: 'EVENT', name: 'Event' },
      { accountId: ACCOUNT_ID, containerId: CONTAINER_ID, type: 'CLICK_URL', name: 'Click URL' },
      { accountId: ACCOUNT_ID, containerId: CONTAINER_ID, type: 'CLICK_TEXT', name: 'Click Text' },
    ],
    fingerprint: fp(900),
    tagManagerUrl: `https://tagmanager.google.com/#/versions/accounts/${ACCOUNT_ID}/containers/${CONTAINER_ID}/versions/0`,
  },
};

writeFileSync(OUT, JSON.stringify(container, null, 2));
const stats = {
  tags: tags.length,
  triggers: triggers.length,
  variables: variables.length,
};
// eslint-disable-next-line no-console
console.log(`Wrote ${OUT}`);
// eslint-disable-next-line no-console
console.log(`  ${stats.tags} tags, ${stats.triggers} triggers, ${stats.variables} variables`);
