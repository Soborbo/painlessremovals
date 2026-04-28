/**
 * i-mve CRM HTTP CLIENT
 *
 * Sends quote data to the i-mve API endpoint.
 */

import { logger } from '@/lib/utils/logger';
import type { ImvePayload } from './mapper';

export interface ImveConfig {
  enabled: boolean;
  apiUrl: string;
  apiKey?: string;
  timeoutMs: number;
}

export interface ImveResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

/**
 * Send a payload to the i-mve API.
 */
export async function sendToImve(payload: ImvePayload, config: ImveConfig): Promise<ImveResult> {
  if (!config.enabled || !config.apiUrl) {
    return { success: false, error: 'i-mve integration not configured' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add authentication if API key is configured
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const statusCode = response.status;

    if (response.ok) {
      logger.info('i-mve', 'API call successful', { statusCode });
      return { success: true, statusCode };
    }

    const errorBody = await response.text().catch(() => 'Unable to read response');
    logger.warn('i-mve', 'API returned non-OK status', { statusCode, errorBody });
    return { success: false, statusCode, error: `HTTP ${statusCode}: ${errorBody}` };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      logger.error('i-mve', 'API call timed out', { timeoutMs: config.timeoutMs });
      return { success: false, error: `Timeout after ${config.timeoutMs}ms` };
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('i-mve', 'API call failed', { error: message });
    return { success: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}
