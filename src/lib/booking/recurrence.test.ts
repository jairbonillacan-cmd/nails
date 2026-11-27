import { describe, expect, it } from 'vitest';
import {
  buildRetouchPrefill,
  buildTouchUpBookingUrl,
  computeSuggestedTouchUpDateKey,
  DEFAULT_TOUCH_UP_DAYS,
  generateRecurrenceDates,
  MAX_TOUCH_UP_DAYS,
  MIN_TOUCH_UP_DAYS,
  normalizeTouchUpDays,
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

  it('normalizes touchUpDays within 7..60 and supports custom touch-up intervals in date and URL helpers', () => {
    expect(DEFAULT_TOUCH_UP_DAYS).toBe(21);
    expect(MIN_TOUCH_UP_DAYS).toBe(7);
    expect(MAX_TOUCH_UP_DAYS).toBe(60);
    expect(normalizeTouchUpDays(undefined)).toBe(21);
    expect(normalizeTouchUpDays(null)).toBe(21);
    expect(normalizeTouchUpDays(2)).toBe(7);
    expect(normalizeTouchUpDays(90)).toBe(60);
    expect(normalizeTouchUpDays(28)).toBe(28);

    expect(
      computeSuggestedTouchUpDateKey({
        startAt: '2026-11-25T16:00:00.000Z',
        touchUpDays: 28,
        timezone: 'America/Mexico_City',
      }),
    ).toBe('2026-12-23');

    expect(
      computeSuggestedTouchUpDateKey({
        startAt: '2026-11-25T16:00:00.000Z',
        touchUpDays: 3,
        timezone: 'America/Mexico_City',
      }),
    ).toBe('2026-12-02');

    expect(
      buildTouchUpBookingUrl({
        serviceSlug: 'rubber',
        staffSlug: 'karla',
        startAt: '2026-11-25T16:00:00.000Z',
        timezone: 'America/Mexico_City',
        touchUpDays: 28,
      }),
    ).toBe('/reservar/rubber?staff=karla&date=2026-12-23');
  });

  it('builds consistent retouch prefill payloads using configured touchUpDays and timezone fallback', () => {
    const booking = {
      serviceId: 'srv-rubber',
      extraServiceIds: ['srv-retiro'],
      staffId: 'staff-karla',
      startAt: '2026-11-25T16:00:00.000Z',
      bookingCode: 'NL-1042',
      clientInstagram: '@sofia.ramirez.pue',
      client: {
        fullName: 'Sofía Ramírez',
        phoneE164: '+522224123987',
        instagramHandle: '@fallback.ig',
      },
    };

    const custom = buildRetouchPrefill(
      booking,
      { timezone: 'America/Mexico_City', landingContent: { touchUpDays: 28 } },
      'America/Mexico_City',
    );
    expect(custom).toEqual({
      serviceId: 'srv-rubber',
      extraServiceIds: ['srv-retiro'],
      staffId: 'staff-karla',
      startDate: '2026-12-23',
      touchUpDays: 28,
      clientName: 'Sofía Ramírez',
      clientPhone: '+522224123987',
      clientInstagram: '@sofia.ramirez.pue',
      internalNotes: 'Retoque (+28 días · NL-1042)',
    });

    const defaulted = buildRetouchPrefill({
      ...booking,
      extraServiceIds: undefined,
      clientInstagram: undefined,
    });
    expect(defaulted).toEqual({
      serviceId: 'srv-rubber',
      extraServiceIds: [],
      staffId: 'staff-karla',
      startDate: '2026-12-16',
      touchUpDays: 21,
      clientName: 'Sofía Ramírez',
      clientPhone: '+522224123987',
      clientInstagram: '@fallback.ig',
      internalNotes: 'Retoque (+21 días · NL-1042)',
    });
  });
});
