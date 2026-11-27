import { describe, expect, it } from 'vitest';
import {
  PostOverrideRangeSchema,
  PostOverrideSchema,
  PostRecurringBlockSchema,
} from '@/lib/contracts/availability';
import {
  buildBlockTimeOptions,
  buildBlockTimePayload,
  type BlockTimeDraft,
} from './blockTimePayload';

function makeDraft(overrides: Partial<BlockTimeDraft> = {}): BlockTimeDraft {
  return {
    mode: 'closed',
    staffId: 'staff-karla',
    startDate: '2026-11-28',
    endDate: '2026-11-28',
    startTime: '12:30',
    endTime: '13:30',
    repeat: false,
    frequency: 'weekly',
    weekdays: [6],
    dayOfMonth: 28,
    untilDate: '',
    reason: '',
    publicNote: '',
    redirectStaffId: '',
    todayKey: '2026-11-27',
    ...overrides,
  };
}

describe('blockTimePayload', () => {
  it('builds a valid single-day closed DateOverride with publicNote and redirectStaffId', () => {
    const result = buildBlockTimePayload(
      makeDraft({
        mode: 'closed',
        reason: 'Vacaciones',
        publicNote: 'Vuelvo el lunes',
        redirectStaffId: 'staff-paty',
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsed = PostOverrideSchema.parse(result.payload);
    expect(parsed.isUnavailable).toBe(true);
    expect(parsed.startTime).toBeNull();
    expect(parsed.endTime).toBeNull();
    expect(parsed.publicNote).toBe('Vuelvo el lunes');
    expect(parsed.redirectStaffId).toBe('staff-paty');
  });

  it('builds a valid multi-day closed override_range payload', () => {
    const result = buildBlockTimePayload(
      makeDraft({
        mode: 'closed',
        startDate: '2026-12-24',
        endDate: '2026-12-26',
        reason: 'Navidad',
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsed = PostOverrideRangeSchema.parse(result.payload);
    expect(parsed.kind).toBe('override_range');
    expect(parsed.isClosed).toBe(true);
    expect(parsed.startDate).toBe('2026-12-24');
    expect(parsed.endDate).toBe('2026-12-26');
  });

  it('builds a valid special_hours override and rejects inverted hours', () => {
    const invalid = buildBlockTimePayload(
      makeDraft({
        mode: 'special_hours',
        startTime: '16:00',
        endTime: '14:00',
      }),
    );
    expect(invalid.ok).toBe(false);

    const single = buildBlockTimePayload(
      makeDraft({
        mode: 'special_hours',
        startTime: '11:00',
        endTime: '15:00',
        reason: 'Sábado corto',
      }),
    );
    expect(single.ok).toBe(true);
    if (!single.ok) return;
    const parsed = PostOverrideSchema.parse(single.payload);
    expect(parsed.isUnavailable).toBe(false);
    expect(parsed.startTime).toBe('11:00');
    expect(parsed.endTime).toBe('15:00');
  });

  it('builds valid one-off and repeating partial blocks matching PostRecurringBlockSchema', () => {
    const oneOff = buildBlockTimePayload(
      makeDraft({
        mode: 'partial',
        startDate: '2026-11-28',
        endDate: '2026-11-28',
        startTime: '14:00',
        endTime: '15:00',
        repeat: false,
        reason: 'Curso',
      }),
    );
    expect(oneOff.ok).toBe(true);
    if (oneOff.ok) {
      const parsed = PostRecurringBlockSchema.parse(oneOff.payload);
      expect(parsed.untilDate).toBe('2026-11-28');
      expect(parsed.weekdays).toEqual([6]);
    }

    const recurring = buildBlockTimePayload(
      makeDraft({
        mode: 'partial',
        repeat: true,
        frequency: 'weekly',
        weekdays: [1, 2, 3, 4, 5],
        startTime: '12:30',
        endTime: '13:15',
        reason: 'Comida',
      }),
    );
    expect(recurring.ok).toBe(true);
    if (recurring.ok) {
      const parsed = PostRecurringBlockSchema.parse(recurring.payload);
      expect(parsed.frequency).toBe('weekly');
      expect(parsed.weekdays).toEqual([1, 2, 3, 4, 5]);
      expect(parsed.untilDate).toBeNull();
    }

    const emptyWeekdays = buildBlockTimePayload(
      makeDraft({
        mode: 'partial',
        repeat: true,
        frequency: 'weekly',
        weekdays: [],
      }),
    );
    expect(emptyWeekdays.ok).toBe(false);
  });

  it('expands 15-minute time options when schedule starts before 08:00 or ends after 22:00', () => {
    const expanded = buildBlockTimeOptions('07:00', '22:30');
    expect(expanded[0]?.value).toBe('07:00');
    expect(expanded[expanded.length - 1]?.value).toBe('22:30');
  });
});
