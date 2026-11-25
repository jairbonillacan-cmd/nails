import { describe, expect, it } from 'vitest';
import {
  expandPlainDateRange,
  getMexicoOfficialHolidays,
  type MexicoHoliday,
} from './holidays-mx';

describe('Mexico Official Holidays & Plain-Date Range Expansion (C7)', () => {
  it('computes all 7 Mexican federal official holidays accurately for 2026 and 2027', () => {
    const h2026: MexicoHoliday[] = getMexicoOfficialHolidays(2026);
    expect(h2026).toEqual([
      { date: '2026-01-01', name: 'Año Nuevo' },
      { date: '2026-02-02', name: 'Día de la Constitución' },
      { date: '2026-03-16', name: 'Natalicio de Benito Juárez' },
      { date: '2026-05-01', name: 'Día del Trabajo' },
      { date: '2026-09-16', name: 'Día de la Independencia' },
      { date: '2026-11-16', name: 'Revolución Mexicana' },
      { date: '2026-12-25', name: 'Navidad' },
    ]);

    const h2027 = getMexicoOfficialHolidays(2027);
    expect(h2027).toEqual([
      { date: '2027-01-01', name: 'Año Nuevo' },
      { date: '2027-02-01', name: 'Día de la Constitución' },
      { date: '2027-03-15', name: 'Natalicio de Benito Juárez' },
      { date: '2027-05-01', name: 'Día del Trabajo' },
      { date: '2027-09-16', name: 'Día de la Independencia' },
      { date: '2027-11-15', name: 'Revolución Mexicana' },
      { date: '2027-12-25', name: 'Navidad' },
    ]);

    expect(() => getMexicoOfficialHolidays(1800)).toThrow();
  });

  it('expands plain YYYY-MM-DD ranges across month, leap-year, and DST boundaries without TZ shift', () => {
    expect(expandPlainDateRange('2026-12-24', '2026-12-26')).toEqual([
      '2026-12-24',
      '2026-12-25',
      '2026-12-26',
    ]);

    expect(expandPlainDateRange('2028-02-28', '2028-03-01')).toEqual([
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ]);

    expect(expandPlainDateRange('2026-03-07', '2026-03-09')).toEqual([
      '2026-03-07',
      '2026-03-08',
      '2026-03-09',
    ]);

    expect(expandPlainDateRange('2026-12-01', '2026-12-01')).toEqual(['2026-12-01']);
  });

  it('rejects invalid dates, inverted ranges, and ranges exceeding maxDays', () => {
    expect(() => expandPlainDateRange('2026-02-30', '2026-03-01')).toThrow();
    expect(() => expandPlainDateRange('bad-date', '2026-03-01')).toThrow();
    expect(() => expandPlainDateRange('2026-12-10', '2026-12-05')).toThrow();
    expect(() => expandPlainDateRange('2026-01-01', '2026-02-15', 31)).toThrow();
  });
});
