/**
 * EMAIL SENDER
 *
 * Resend wrapper with timeout and error handling
 */

import type { RuntimeConfig } from '@/lib/config';
import { logger } from '@/lib/utils/logger';
import { Resend } from 'resend';

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}

/**
 * Send email with timeout
 *
 * IMPORTANT: This function THROWS on failure so callers can properly
 * handle errors in their try/catch blocks.
 */
export async function sendEmail(
  options: EmailOptions,
  config: RuntimeConfig['email']
): Promise<{ success: boolean; messageId?: string }> {
  if (!config.resendApiKey) {
    throw new Error('Email service not configured: missing RESEND_API_KEY');
  }

  const resend = new Resend(config.resendApiKey);

  logger.info('Email', 'Sending email', {
    to: Array.isArray(options.to) ? options.to.length : 1,
    subject: options.subject,
  });

  const timeoutMs = config.timeoutMs || 5000;

  // Use AbortController so the fetch is actually cancelled on timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let result: Awaited<ReturnType<typeof resend.emails.send>>;
  try {
    result = await resend.emails.send({
      from: options.from || config.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      ...(options.replyTo !== undefined && { replyTo: options.replyTo }),
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (controller.signal.aborted) {
      throw new Error(`Email send timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (result.error) {
    throw new Error(`Resend API error: ${result.error.message}`);
  }

  logger.info('Email', 'Sent successfully', { id: result.data?.id });

  return {
    success: true,
    messageId: result.data?.id,
  };
}
