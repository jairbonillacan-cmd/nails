import { describe, expect, it } from 'vitest';
import type { AvailabilitySchedule, DateOverride } from '@/lib/types';
import {
  buildStaffOpenSlots,
  buildZonedIsoForDateAndMinutes,
  computeElapsedMinutesForDate,
  computeElapsedPercent,
  computeBlockGeometryPercent,
  computeNowIndicator,
  formatMinutesHHMM,
  getLocalMinutesInTimezone,
  resolveSuggestedBlockWindow,
} from './scheduleGridGeometry';

describe('scheduleGridGeometry', () => {
  const tz = 'America/Mexico_City';

  it('converts Mexico City local date and minutes to accurate UTC ISO and back', () => {
    const iso = buildZonedIsoForDateAndMinutes('2026-11-26', 13 * 60 + 30, tz);
    expect(iso).toBe('2026-11-26T19:30:00.000Z');
    expect(getLocalMinutesInTimezone(iso, tz)).toBe(13 * 60 + 30);
    expect(formatMinutesHHMM(13 * 60 + 30)).toBe('13:30');
  });

  it('computes bounded block percentage geometry for 09:00-20:00 grid', () => {
    const startBlock = computeBlockGeometryPercent(9 * 60, 60);
    expect(startBlock.topPct).toBe(0);
    expect(startBlock.heightPct).toBeCloseTo((60 / 660) * 100, 2);

    const afternoon = computeBlockGeometryPercent(14 * 60 + 30, 90);
    expect(afternoon.topPct).toBeCloseTo((330 / 660) * 100, 2);
    expect(afternoon.heightPct).toBeCloseTo((90 / 660) * 100, 2);
  });

  it('renders live now indicator only on today within business window', () => {
    const middayMs = Date.parse('2026-11-26T20:30:00.000Z');
    const onToday = computeNowIndicator(middayMs, '2026-11-26', '2026-11-26', tz);
    expect(onToday.visible).toBe(true);
    expect(onToday.label).toBe('14:30');
    expect(onToday.topPct).toBeCloseTo(50, 1);

    const onOtherDay = computeNowIndicator(middayMs, '2026-11-27', '2026-11-26', tz);
    expect(onOtherDay.visible).toBe(false);
  });

  it('shades elapsed time and never offers a free turn that already started', () => {
    const middayMs = Date.parse('2026-11-26T20:30:00.000Z');
    const elapsedToday = computeElapsedMinutesForDate(middayMs, '2026-11-26', '2026-11-26', tz);
    expect(elapsedToday).toBe(14 * 60 + 30);
    expect(computeElapsedPercent(elapsedToday)).toBeCloseTo(50, 1);
    expect(computeElapsedPercent(computeElapsedMinutesForDate(middayMs, '2026-11-25', '2026-11-26', tz))).toBe(100);
    expect(computeElapsedPercent(computeElapsedMinutesForDate(middayMs, '2026-11-27', '2026-11-26', tz))).toBe(0);

    const slots = buildStaffOpenSlots({
      fixedTimes: ['10:00', '13:30', '16:30'],
      staffBookings: [],
      staffBlocks: [],
      timezone: tz,
      notBeforeMinutes: elapsedToday,
    });
    expect(slots.map((slot) => slot.timeHHMM)).toEqual(['16:30']);
  });

  it('resolves suggested block window from specialist schedule rules and date overrides', () => {
    const schedules: AvailabilitySchedule[] = [
      {
        id: 'sch-karla',
        staffId: 'karla',
        name: 'Default',
        timezone: tz,
        isDefault: true,
        rules: [
          { id: 'r-k-5', dayOfWeek: 5, startTime: '10:00', endTime: '19:30' },
        ],
      },
      {
        id: 'sch-tere',
        staffId: 'tere',
        name: 'Default',
        timezone: tz,
        isDefault: true,
        rules: [
          { id: 'r-t-5', dayOfWeek: 5, startTime: '14:00', endTime: '20:00' },
        ],
      },
      {
        id: 'sch-early',
        staffId: 'early',
        name: 'Default',
        timezone: tz,
        isDefault: true,
        rules: [
          { id: 'r-e-5', dayOfWeek: 5, startTime: '07:00', endTime: '13:00' },
        ],
      },
    ];
    const dateOverrides: DateOverride[] = [
      {
        id: 'ov-1',
        staffId: 'karla',
        overrideDate: '2026-11-28',
        isUnavailable: false,
        startTime: '11:00',
        endTime: '15:00',
        reason: 'Horario especial sábado',
      },
    ];

    const earlySlotForTere = resolveSuggestedBlockWindow({
      slot: { dateKey: '2026-11-27', startMinutes: 10 * 60 },
      schedules,
      dateOverrides,
      staffId: 'tere',
    });
    expect(earlySlotForTere.startTimeHHMM).toBe('14:00');
    expect(earlySlotForTere.endTimeHHMM).toBe('15:00');

    const lateSlotForKarla = resolveSuggestedBlockWindow({
      slot: { dateKey: '2026-11-27', startMinutes: 19 * 60 },
      schedules,
      dateOverrides,
      staffId: 'karla',
    });
    expect(lateSlotForKarla.startTimeHHMM).toBe('19:00');
    expect(lateSlotForKarla.endTimeHHMM).toBe('19:30');

    const beforeEightSpecialist = resolveSuggestedBlockWindow({
      slot: { dateKey: '2026-11-27', startMinutes: 7 * 60 },
      schedules,
      dateOverrides,
      staffId: 'early',
    });
    expect(beforeEightSpecialist.startTimeHHMM).toBe('07:00');
    expect(beforeEightSpecialist.endTimeHHMM).toBe('08:00');

    const overrideDay = resolveSuggestedBlockWindow({
      slot: { dateKey: '2026-11-28', startMinutes: 14 * 60 + 30 },
      schedules,
      dateOverrides,
      staffId: 'karla',
    });
    expect(overrideDay.startTimeHHMM).toBe('14:30');
    expect(overrideDay.endTimeHHMM).toBe('15:00');

    const closedDayFallback = resolveSuggestedBlockWindow({
      slot: { dateKey: '2026-11-29', startMinutes: 12 * 60 },
      schedules,
      dateOverrides,
      staffId: 'karla',
    });
    expect(closedDayFallback.startTimeHHMM).toBe('12:00');
    expect(closedDayFallback.endTimeHHMM).toBe('13:00');
  });
});
