import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { resolveHeroScrollState } from '@/lib/hooks/useHeroScrollState';
import { buildMonthGrid, monthStartKey, previousMonthStartKey } from './ScheduleCalendarView';

describe('buildMonthGrid', () => {
  it('starts on Sunday and fills November 2026 into complete weeks', () => {
    const cells = buildMonthGrid('2026-11-26');
    expect(cells[0]?.date).toBe('2026-11-01');
    expect(cells.length % 7).toBe(0);
    expect(cells.filter((c) => c.isInMonth)).toHaveLength(30);
    expect(cells.at(-1)?.date).toBe('2026-12-05');
    expect(cells.find((c) => c.date === '2026-12-01')?.isMonthStart).toBe(true);
  });

  it('always yields whole weeks containing every day of the month exactly once', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2024, max: 2030 }), fc.integer({ min: 1, max: 12 }), (year, month) => {
        const key = `${year}-${String(month).padStart(2, '0')}-15`;
        const cells = buildMonthGrid(key);
        const inMonth = cells.filter((c) => c.isInMonth);
        const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
        return (
          cells.length % 7 === 0 &&
          inMonth.length === daysInMonth &&
          new Set(cells.map((c) => c.date)).size === cells.length &&
          new Date(`${cells[0]?.date}T12:00:00Z`).getUTCDay() === 0
        );
      }),
    );
  });

  it('computes month boundaries across years', () => {
    expect(monthStartKey('2026-11-26')).toBe('2026-11-01');
    expect(previousMonthStartKey('2027-01-10')).toBe('2026-12-01');
  });
});

describe('resolveHeroScrollState', () => {
  it('is top near the start, inside while the hero is visible, and past after it leaves', () => {
    expect(resolveHeroScrollState({ scrollY: 0, heroBottom: 800, topThreshold: 24, navHeight: 96 })).toBe('top');
    expect(resolveHeroScrollState({ scrollY: 300, heroBottom: 500, topThreshold: 24, navHeight: 96 })).toBe('inside');
    expect(resolveHeroScrollState({ scrollY: 900, heroBottom: 40, topThreshold: 24, navHeight: 96 })).toBe('past');
    expect(resolveHeroScrollState({ scrollY: 900, heroBottom: null, topThreshold: 24, navHeight: 96 })).toBe('past');
  });
});
