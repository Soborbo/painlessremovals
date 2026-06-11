/**
 * POST /api/leads/quote — calculator "get/save quote" lead → CRM.
 *
 * The client cannot know the CRM pricing-version uuid, so the server injects
 * `quote.pricing_version_id` from `CRM_PRICING_VERSION_ID`. If that env var
 * is unset and the client didn't supply one, the optional `quote` block is
 * dropped (the CRM requires a uuid there or nothing).
 */

import { createLeadHandler } from '@/lib/crm/endpoint';
import { quoteWebhookSchema } from '@/lib/crm/schemas';

export const prerender = false;

export const POST = createLeadHandler({
  surface: 'quote',
  schema: quoteWebhookSchema,
  transform: (input, env) => {
    const quote = input.quote as Record<string, unknown> | undefined;
    if (quote) {
      if (!quote.pricing_version_id && env.CRM_PRICING_VERSION_ID) {
        quote.pricing_version_id = env.CRM_PRICING_VERSION_ID;
      }
      // Without a uuid the CRM rejects the quote block — drop it rather than
      // fail the whole lead (customer + addresses still deliver).
      if (!quote.pricing_version_id) {
        delete input.quote;
      }
    }
    return input;
  },
});
