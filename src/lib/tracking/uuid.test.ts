import { describe, it, expect } from 'vitest';
import { generateUUID } from './uuid';

/** event_id / dedup-key generator. Must be a well-formed, unique v4 UUID. */

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('generateUUID', () => {
  it('returns a syntactically valid v4 UUID', () => {
    expect(generateUUID()).toMatch(V4);
  });

  it('returns a different value on consecutive calls', () => {
    expect(generateUUID()).not.toBe(generateUUID());
  });

  it('produces 1000 unique, well-formed ids (collision/format guard)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const id = generateUUID();
      expect(id).toMatch(V4);
      seen.add(id);
    }
    expect(seen.size).toBe(1000);
  });

  it('always sets the version nibble to 4', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateUUID()[14]).toBe('4');
    }
  });

  it('always sets the variant nibble to 8/9/a/b', () => {
    for (let i = 0; i < 50; i++) {
      expect('89ab').toContain(generateUUID()[19].toLowerCase());
    }
  });
});
