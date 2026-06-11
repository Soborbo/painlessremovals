/**
 * POST /api/leads/partner-register — B2B/estate-agent self-registration → CRM.
 */

import { createLeadHandler } from '@/lib/crm/endpoint';
import { partnerRegisterWebhookSchema } from '@/lib/crm/schemas';

export const prerender = false;

export const POST = createLeadHandler({
  surface: 'partner-register',
  schema: partnerRegisterWebhookSchema,
});
