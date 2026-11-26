import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { nextSlideIndex } from './useAutoAdvance';

describe('nextSlideIndex', () => {
  it('always stays inside the slide range and cycles back to zero', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50 }), fc.nat(200), (count, raw) => {
        const current = raw % count;
        const next = nextSlideIndex(current, count);
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThan(count);
        expect(next).toBe(current === count - 1 ? 0 : current + 1);
      }),
    );
  });

  it('returns zero when there are no slides', () => {
    expect(nextSlideIndex(3, 0)).toBe(0);
  });
});
