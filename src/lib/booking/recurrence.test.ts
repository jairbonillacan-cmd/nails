import { describe, expect, it } from 'vitest';
import {
  buildTouchUpBookingUrl,
  computeSuggestedTouchUpDateKey,
  generateRecurrenceDates,
} from './recurrence';
import { zonedDateTimeToUtc } from '../availability/engine';

describe('Recurring Booking Series & Touch-Up URLs (U1)', () => {
  it('generates 2..6 occurrences at 2, 3, or 4 week intervals preserving wall-clock time across DST', () => {
    const startUtc = zonedDateTimeToUtc(
      '2026-03-01',
      '10:00',
      'America/New_York',
    ).toISOString();

    const series = generateRecurrenceDates({
      startAt: startUtc,
      intervalWeeks: 2,
      count: 3,
      timezone: 'America/New_York',
    });

    expect(series).toHaveLength(3);
    expect(series.map((o) => o.dateKey)).toEqual([
      '2026-03-01',
      '2026-03-15',
      '2026-03-29',
    ]);

    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    for (const occ of series) {
      expect(fmt.format(new Date(occ.startAt))).toBe('10:00');
    }

    const fallStart = zonedDateTimeToUtc(
      '2026-10-25',
      '13:30',
      'America/New_York',
    ).toISOString();
    const fallSeries = generateRecurrenceDates({
      startAt: fallStart,
      intervalWeeks: 3,
      count: 2,
      timezone: 'America/New_York',
    });
    expect(fallSeries.map((o) => o.dateKey)).toEqual(['2026-10-25', '2026-11-15']);
    for (const occ of fallSeries) {
      expect(fmt.format(new Date(occ.startAt))).toBe('13:30');
    }
  });

  it('rejects out-of-range counts and invalid dates', () => {
    expect(() =>
      generateRecurrenceDates({
        startAt: '2026-12-01T16:00:00.000Z',
        intervalWeeks: 3,
        count: 1,
        timezone: 'America/Mexico_City',
      }),
    ).toThrow();
    expect(() =>
      generateRecurrenceDates({
        startAt: '2026-12-01T16:00:00.000Z',
        intervalWeeks: 3,
        count: 7,
        timezone: 'America/Mexico_City',
      }),
    ).toThrow();
    expect(() =>
      generateRecurrenceDates({
        startAt: 'not-a-date',
        intervalWeeks: 2,
        count: 2,
        timezone: 'America/Mexico_City',
      }),
    ).toThrow();
  });

  it('computes +21 day touch-up date key and builds clean booking URLs', () => {
    const suggested = computeSuggestedTouchUpDateKey({
      startAt: '2026-11-25T16:00:00.000Z',
      daysAhead: 21,
      timezone: 'America/Mexico_City',
    });
    expect(suggested).toBe('2026-12-16');

    expect(
      buildTouchUpBookingUrl({
        serviceSlug: 'rubber',
        staffSlug: 'karla',
        suggestedDateKey: suggested,
      }),
    ).toBe('/reservar/rubber?staff=karla&date=2026-12-16');

    expect(
      buildTouchUpBookingUrl({
        serviceSlug: 'retoque',
      }),
    ).toBe('/reservar/retoque');
  });
});
