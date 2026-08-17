import { describe, expect, it } from 'vitest';
import { CODE_PATTERN } from './code-pattern';
import { ALL_CODES } from './codes';

/**
 * `/api/error-report` rejects any report whose `code` fails CODE_PATTERN. If a
 * code we actually emit falls outside it, that whole error class goes
 * invisible — which is exactly what happened to `JS-UNHANDLED-001` and
 * `CFG-I18N-001`.
 */
describe('error-report CODE_PATTERN', () => {
  it('admits every code in ALL_CODES', () => {
    const rejected = Object.keys(ALL_CODES).filter((code) => !CODE_PATTERN.test(code));
    expect(rejected).toEqual([]);
  });

  it('admits the two codes the old pattern rejected', () => {
    expect(CODE_PATTERN.test('JS-UNHANDLED-001')).toBe(true);
    expect(CODE_PATTERN.test('CFG-I18N-001')).toBe(true);
  });

  it('still rejects malformed codes', () => {
    for (const bad of ['', 'lowercase-code-001', 'NOSEGMENTS', 'A-B-001', 'AB-CD-1', 'AB-CD-0001']) {
      expect(CODE_PATTERN.test(bad)).toBe(false);
    }
  });
});
