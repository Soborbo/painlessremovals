import { describe, expect, it } from 'vitest';
import { getExtrasBreakdown, getExtrasCost } from './calculator-logic';

// getExtrasBreakdown must itemise EXACTLY what getExtrasCost sums — the CRM cost
// sheet relies on the per-extra lines reconciling to the lumped extras total.
describe('getExtrasBreakdown', () => {
  const cases: Array<{ name: string; extras: Parameters<typeof getExtrasCost>[0]; cubes: number }> = [
    { name: 'storage (4 weeks, discounted)', extras: { storageSize: 'smallWardrobe', storageWeeks: 4 } as never, cubes: 0 },
    { name: 'storage (12 weeks, mixed)', extras: { storageSize: 'gardenShed', storageWeeks: 12 } as never, cubes: 0 },
    { name: 'disassembly items', extras: { disassemblyItems: [{ category: 'general', quantity: 2 }] } as never, cubes: 0 },
    { name: 'legacy assembly', extras: { assembly: [{ type: 'simple', quantity: 1 }] } as never, cubes: 0 },
    { name: 'cleaning (deep, 3 rooms)', extras: { cleaningRooms: 3, cleaningType: 'deep' } as never, cubes: 0 },
    { name: 'packing tier', extras: { packingTier: 'materials' } as never, cubes: 600 },
    {
      name: 'combined',
      extras: {
        packingTier: 'materials',
        cleaningRooms: 2,
        storageSize: 'smallWardrobe',
        storageWeeks: 4,
        disassemblyItems: [{ category: 'general', quantity: 2 }],
      } as never,
      cubes: 600,
    },
  ];

  for (const c of cases) {
    it(`reconciles to getExtrasCost: ${c.name}`, () => {
      const parts = getExtrasBreakdown(c.extras, c.cubes);
      const sum = Object.values(parts).reduce((s, n) => s + n, 0);
      expect(sum).toBe(getExtrasCost(c.extras, c.cubes));
    });
  }

  it('returns the expected per-line amounts', () => {
    const parts = getExtrasBreakdown(
      { storageSize: 'smallWardrobe', storageWeeks: 4, disassemblyItems: [{ category: 'general', quantity: 2 }] } as never,
      0,
    );
    expect(parts.storage).toBe(82); // 4 weeks × £41 × 0.5
    expect(parts.assembly).toBe(120); // general £60 × 2
  });

  it('omits categories that were not requested and never crashes on unknown keys', () => {
    expect(getExtrasBreakdown({} as never, 0)).toEqual({});
    expect(getExtrasBreakdown({ disassemblyItems: [{ category: 'unknown', quantity: 9 }] } as never, 0)).toEqual({});
  });
});
