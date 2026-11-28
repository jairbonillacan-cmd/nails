import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { resolveHeroScrollState } from '@/lib/hooks/useHeroScrollState';
import {
  buildMonthGrid,
  buildWeekStrip,
  canNavigatePreviousWeek,
  getWeekRangeStart,
  monthStartKey,
  previousMonthStartKey,
  shiftCalendarDateKey,
} from './ScheduleCalendarView';

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

describe('buildWeekStrip', () => {
  it('starts from today with zero past days and marks month transitions', () => {
    const strip = buildWeekStrip({ anchorDate: '2026-11-27', todayKey: '2026-11-27' });
    expect(strip).toHaveLength(7);
    expect(strip[0]?.date).toBe('2026-11-27');
    expect(strip[6]?.date).toBe('2026-12-03');
    expect(strip.every((day) => day.date >= '2026-11-27')).toBe(true);
    expect(strip.find((day) => day.date === '2026-12-01')?.isMonthStart).toBe(true);
    expect(canNavigatePreviousWeek(strip[0]?.date ?? '2026-11-27', '2026-11-27')).toBe(false);
  });

  it('keeps the 7-day window stable when selecting days within the same week and advances cleanly on week 2', () => {
    const todayKey = '2026-11-27';
    expect(getWeekRangeStart('2026-11-25', todayKey)).toBe(todayKey);
    expect(getWeekRangeStart('2026-11-29', todayKey)).toBe(todayKey);
    expect(getWeekRangeStart('2026-12-03', todayKey)).toBe(todayKey);

    const week2Start = getWeekRangeStart('2026-12-04', todayKey);
    expect(week2Start).toBe('2026-12-04');
    expect(canNavigatePreviousWeek(week2Start, todayKey)).toBe(true);

    const prevClamped = shiftCalendarDateKey(week2Start, -7);
    expect(prevClamped).toBe(todayKey);
    expect(canNavigatePreviousWeek(prevClamped, todayKey)).toBe(false);
  });

  it('always produces 7 contiguous unique dates >= todayKey containing anchorDate when anchorDate >= todayKey', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2025, max: 2028 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        fc.integer({ min: -5, max: 45 }),
        (year, month, day, offset) => {
          const todayKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const anchorDate = shiftCalendarDateKey(todayKey, offset);
          const strip = buildWeekStrip({ anchorDate, todayKey });
          const unique = new Set(strip.map((item) => item.date));
          const contiguous = strip.every(
            (item, idx) => idx === 0 || item.date === shiftCalendarDateKey(strip[idx - 1]!.date, 1),
          );
          const containsAnchor = offset < 0 ? strip[0]?.date === todayKey : unique.has(anchorDate);
          return (
            strip.length === 7 &&
            unique.size === 7 &&
            contiguous &&
            strip.every((item) => item.date >= todayKey) &&
            containsAnchor
          );
        },
      ),
    );
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
