/**
 * UUID v4 generator.
 *
 * Order of preference:
 *   1. `crypto.randomUUID()` — first choice; fastest and cleanest.
 *   2. `crypto.getRandomValues()` — secure-context fallback for older
 *      Safari builds and edge runtimes that haven't shipped randomUUID
 *      yet but DO have getRandomValues.
 *   3. `Math.random()` — last-resort, only if both crypto APIs are
 *      missing (very old browsers or hostile sandbox). Predictable
 *      enough that we'd rather not, but better than crashing.
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // fall through
    }
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    try {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      // RFC 4122 v4 fixups
      bytes[6] = (bytes[6]! & 0x0f) | 0x40;
      bytes[8] = (bytes[8]! & 0x3f) | 0x80;
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    } catch {
      // fall through
    }
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
