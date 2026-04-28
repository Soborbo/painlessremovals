/**
 * SAFE KV WRAPPER
 *
 * Handles missing KV namespaces gracefully
 * Returns null instead of throwing
 */

import { logger } from './logger';

export interface KVNamespace {
  get(key: string, options?: { type?: string }): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }>;
}

/**
 * Get KV namespace safely
 * Returns null if not available
 */
export function safeKV(env: any, namespace: string): KVNamespace | null {
  if (!env || !env[namespace]) {
    logger.warn('KV', `Namespace "${namespace}" not available`);
    return null;
  }

  return env[namespace];
}

/**
 * Get value from KV with fallback
 */
export async function kvGet<T = string>(
  kv: KVNamespace | null,
  key: string,
  fallback?: T
): Promise<T | null> {
  if (!kv) return fallback ?? null;

  try {
    const value = await kv.get(key);
    return value !== null ? (value as T) : (fallback ?? null);
  } catch (error) {
    logger.error('KV', `Failed to get key "${key}"`, { error });
    return fallback ?? null;
  }
}

/**
 * Set value in KV with error handling
 */
export async function kvPut(
  kv: KVNamespace | null,
  key: string,
  value: string,
  options?: { expirationTtl?: number }
): Promise<boolean> {
  if (!kv) return false;

  try {
    await kv.put(key, value, options);
    return true;
  } catch (error) {
    logger.error('KV', `Failed to put key "${key}"`, { error });
    return false;
  }
}

/**
 * Delete value from KV
 */
export async function kvDelete(kv: KVNamespace | null, key: string): Promise<boolean> {
  if (!kv) return false;

  try {
    await kv.delete(key);
    return true;
  } catch (error) {
    logger.error('KV', `Failed to delete key "${key}"`, { error });
    return false;
  }
}
