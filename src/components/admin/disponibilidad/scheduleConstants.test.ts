import { describe, expect, it } from 'vitest';
import { formatDayScheduleSummary } from './scheduleConstants';

describe('formatDayScheduleSummary', () => {
  it('returns Descanso when a day has no active rules', () => {
    expect(formatDayScheduleSummary([])).toBe('Descanso');
  });

  it('lists fixed start times in ascending order without duplicates', () => {
    expect(
      formatDayScheduleSummary([
        {
          id: 'r-1',
          dayOfWeek: 1,
          startTime: '10:00',
          endTime: '19:30',
          fixedStartTimes: ['16:30', '10:00', '13:30', '10:00'],
        },
      ]),
    ).toBe('10:00, 13:30, 16:30');
  });

  it('formats continuous single and split shifts ordered by startTime', () => {
    expect(
      formatDayScheduleSummary([
        { id: 'r-2', dayOfWeek: 2, startTime: '15:00', endTime: '19:00' },
        { id: 'r-1', dayOfWeek: 2, startTime: '10:00', endTime: '13:30' },
      ]),
    ).toBe('10:00 – 13:30, 15:00 – 19:00');
  });
});
