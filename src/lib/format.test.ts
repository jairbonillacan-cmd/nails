import { describe, expect, it } from 'vitest';
import {
  collapseDoublePeriods,
  formatDateKeyDisplay,
  formatBirthdayDisplay,
  formatDateRangeDisplay,
  formatHour12h,
  formatMinutes12h,
  formatPhoneDisplay,
  formatTimeHHMM12h,
  formatUnitCount,
} from './format';

describe('display formatters', () => {
  it('shows calendar date keys as readable Spanish dates', () => {
    expect(formatDateKeyDisplay('2026-11-27')).toBe('viernes, 27 de noviembre');
    expect(formatDateKeyDisplay('not-a-date')).toBe('not-a-date');
  });

  it('drops the extra period after a.m./p.m. at the end of a sentence', () => {
    expect(collapseDoublePeriods('a las 2:00 p.m.. Link')).toBe('a las 2:00 p.m. Link');
    expect(collapseDoublePeriods('a las 9:30 a. m..')).toBe('a las 9:30 a. m.');
    expect(collapseDoublePeriods('Fin. Otra frase...')).toBe('Fin. Otra frase...');
  });

  it('pluralizes inventory units in Spanish without touching abbreviations', () => {
    expect(formatUnitCount(1, 'frasco')).toBe('1 frasco');
    expect(formatUnitCount(2, 'frasco')).toBe('2 frascos');
    expect(formatUnitCount(3, 'caja')).toBe('3 cajas');
    expect(formatUnitCount(4, 'rol')).toBe('4 roles');
    expect(formatUnitCount(2, 'lápiz')).toBe('2 lápices');
    expect(formatUnitCount(9, 'pzas')).toBe('9 pzas');
    expect(formatUnitCount(5, 'ml')).toBe('5 ml');
  });

  it('groups Mexican mobile numbers and leaves foreign numbers intact', () => {
    expect(formatPhoneDisplay('+522228765112')).toBe('222 876 5112');
    expect(formatPhoneDisplay('+14155550123')).toBe('+14155550123');
  });

  it('shows birthdays as day and month without the year', () => {
    expect(formatBirthdayDisplay('2000-08-03')).toBe('3 de agosto');
    expect(formatBirthdayDisplay('sin fecha')).toBe('sin fecha');
  });

  it('formats report ranges compactly', () => {
    expect(formatDateRangeDisplay('2026-10-28', '2026-11-26')).toBe('28 oct – 26 nov 2026');
    expect(formatDateRangeDisplay('2025-12-28', '2026-01-26')).toBe('28 dic 2025 – 26 ene 2026');
  });

  it('formats HH:MM, minutes, and hours with AM and PM', () => {
    expect(formatTimeHHMM12h('00:00')).toBe('12:00 AM');
    expect(formatTimeHHMM12h('09:30')).toBe('9:30 AM');
    expect(formatTimeHHMM12h('10:00')).toBe('10:00 AM');
    expect(formatTimeHHMM12h('12:00')).toBe('12:00 PM');
    expect(formatTimeHHMM12h('13:30')).toBe('1:30 PM');
    expect(formatTimeHHMM12h('18:00')).toBe('6:00 PM');
    expect(formatTimeHHMM12h('invalid')).toBe('invalid');
    expect(formatMinutes12h(10 * 60)).toBe('10:00 AM');
    expect(formatMinutes12h(16 * 60 + 30)).toBe('4:30 PM');
    expect(formatHour12h(0)).toBe('12 AM');
    expect(formatHour12h(9)).toBe('9 AM');
    expect(formatHour12h(12)).toBe('12 PM');
    expect(formatHour12h(18)).toBe('6 PM');
  });
});
