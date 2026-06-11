/**
 * POST /api/leads/clearance-callback — house/garden clearance callback → CRM.
 *
 * Same body as /callback; the CRM stamps kind=clearance_callback server-side.
 */

import { createLeadHandler } from '@/lib/crm/endpoint';
import { callbackWebhookSchema } from '@/lib/crm/schemas';

export const prerender = false;

export const POST = createLeadHandler({
  surface: 'clearance-callback',
  schema: callbackWebhookSchema,
});
