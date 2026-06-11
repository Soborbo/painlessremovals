/**
 * POST /api/leads/callback — "request a callback" lead → CRM.
 */

import { createLeadHandler } from '@/lib/crm/endpoint';
import { callbackWebhookSchema } from '@/lib/crm/schemas';

export const prerender = false;

export const POST = createLeadHandler({
  surface: 'callback',
  schema: callbackWebhookSchema,
});
