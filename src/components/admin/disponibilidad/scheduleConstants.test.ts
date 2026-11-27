import { describe, expect, it } from 'vitest';
import { formatDayScheduleSummary } from './scheduleConstants';

describe('formatDayScheduleSummary', () => {
  it('returns Descanso when a day has no active rules', () => {
    expect(formatDayScheduleSummary([])).toBe('Descanso');
  });

  it('lists fixed start times in ascending AM/PM order without duplicates', () => {
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
    ).toBe('10:00 a.m., 1:30 p.m., 4:30 p.m.');
  });

  it('formats continuous single and split shifts ordered by startTime in AM/PM', () => {
    expect(
      formatDayScheduleSummary([
        { id: 'r-2', dayOfWeek: 2, startTime: '15:00', endTime: '19:00' },
        { id: 'r-1', dayOfWeek: 2, startTime: '10:00', endTime: '13:30' },
      ]),
    ).toBe('10:00 a.m. – 1:30 p.m., 3:00 p.m. – 7:00 p.m.');
  });
});
