/**
 * POST /api/leads/affiliate — affiliate/partner-attributed lead → CRM.
 */

import { createLeadHandler } from '@/lib/crm/endpoint';
import { affiliateWebhookSchema } from '@/lib/crm/schemas';

export const prerender = false;

export const POST = createLeadHandler({
  surface: 'affiliate',
  schema: affiliateWebhookSchema,
});
