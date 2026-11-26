import { describe, expect, it } from 'vitest';
import { parseAdminDateJump } from './adminSearchIndex';

describe('parseAdminDateJump', () => {
  const todayKey = '2026-11-26';
  const tz = 'America/Mexico_City';

  it('resolves natural Spanish date keywords', () => {
    expect(parseAdminDateJump('hoy', todayKey, tz)?.dateKey).toBe('2026-11-26');
    expect(parseAdminDateJump('mañana', todayKey, tz)?.dateKey).toBe('2026-11-27');
    expect(parseAdminDateJump('manana', todayKey, tz)?.dateKey).toBe('2026-11-27');
    expect(parseAdminDateJump('pasado mañana', todayKey, tz)?.dateKey).toBe('2026-11-28');
    expect(parseAdminDateJump('ayer', todayKey, tz)?.dateKey).toBe('2026-11-25');
  });

  it('resolves Spanish weekday names to the next upcoming day', () => {
    expect(parseAdminDateJump('viernes', todayKey, tz)?.dateKey).toBe('2026-11-27');
    expect(parseAdminDateJump('lunes', todayKey, tz)?.dateKey).toBe('2026-11-30');
    expect(parseAdminDateJump('miércoles', todayKey, tz)?.dateKey).toBe('2026-12-02');
  });

  it('resolves ISO, slash, and Spanish day-month dates', () => {
    expect(parseAdminDateJump('2026-12-05', todayKey, tz)?.dateKey).toBe('2026-12-05');
    expect(parseAdminDateJump('15 dic', todayKey, tz)?.dateKey).toBe('2026-12-15');
    expect(parseAdminDateJump('3 de diciembre', todayKey, tz)?.dateKey).toBe('2026-12-03');
    expect(parseAdminDateJump('04/12', todayKey, tz)?.dateKey).toBe('2026-12-04');
    expect(parseAdminDateJump('15/01', todayKey, tz)?.dateKey).toBe('2027-01-15');
  });

  it('rejects invalid calendar dates and non-date queries', () => {
    expect(parseAdminDateJump('31/02', todayKey, tz)).toBeNull();
    expect(parseAdminDateJump('Sofía', todayKey, tz)).toBeNull();
    expect(parseAdminDateJump('NL-X7X475', todayKey, tz)).toBeNull();
  });
});
