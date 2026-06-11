/**
 * POST /api/leads/contact — contact form lead → CRM.
 */

import { createLeadHandler } from '@/lib/crm/endpoint';
import { contactWebhookSchema } from '@/lib/crm/schemas';

export const prerender = false;

export const POST = createLeadHandler({
  surface: 'contact',
  schema: contactWebhookSchema,
});
