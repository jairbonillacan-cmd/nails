import { describe, expect, it } from 'vitest';
import type { DayAvailabilitySummary } from '@/lib/availability/engine';
import { normalizePhoneE164 } from '@/lib/format';
import {
  buildAvailabilityCacheKey,
  extractMxPhoneDigits,
  formatMxPhoneDisplay,
  isOptimizableLocalRasterImage,
  isValidMxPhone,
  resolveEffectiveSelectedDate,
  validateClientBookingFields,
} from './bookingHelpers';

describe('MX phone assisted formatting and validation', () => {
  it('formats partial and complete 10-digit Mexican numbers progressively', () => {
    expect(formatMxPhoneDisplay('')).toBe('');
    expect(formatMxPhoneDisplay('22')).toBe('22');
    expect(formatMxPhoneDisplay('222')).toBe('222');
    expect(formatMxPhoneDisplay('2221')).toBe('222 1');
    expect(formatMxPhoneDisplay('222123')).toBe('222 123');
    expect(formatMxPhoneDisplay('2221234')).toBe('222 123 4');
    expect(formatMxPhoneDisplay('2221234567')).toBe('222 123 4567');
    expect(formatMxPhoneDisplay('(222) 123-4567')).toBe('222 123 4567');
    expect(formatMxPhoneDisplay('222123456799')).toBe('222 123 4567');
  });

  it('handles pasted +52 and +52 1 prefixes while preserving +52 E.164 normalization', () => {
    expect(formatMxPhoneDisplay('+52 222 123 4567')).toBe('222 123 4567');
    expect(formatMxPhoneDisplay('+52 1 222 123 4567')).toBe('222 123 4567');
    expect(extractMxPhoneDigits('+52 222 123 4567')).toBe('2221234567');
    expect(normalizePhoneE164(formatMxPhoneDisplay('2221234567'))).toBe('+522221234567');
    expect(normalizePhoneE164(formatMxPhoneDisplay('+52 222 123 4567'))).toBe('+522221234567');
  });

  it('enforces exact 10-digit MX phone validation and full-name checks', () => {
    expect(isValidMxPhone('222 123 4567')).toBe(true);
    expect(isValidMxPhone('+52 222 123 4567')).toBe(true);
    expect(isValidMxPhone('+52 1 222 123 4567')).toBe(true);
    expect(isValidMxPhone('222 123 456')).toBe(false);
    expect(isValidMxPhone('22212345678')).toBe(false);

    expect(validateClientBookingFields('Sofía Ramírez', '222 123 4567')).toEqual({
      name: null,
      phone: null,
    });
    expect(validateClientBookingFields('Sofía', '222 123')).toEqual({
      name: 'Escribe tu nombre y apellido.',
      phone: 'Tu WhatsApp debe tener 10 dígitos.',
    });
  });
});

describe('buildAvailabilityCacheKey and media/date helpers', () => {
  it('produces deterministic cache keys independent of extra/addon ordering or duplicates', () => {
    const keyA = buildAvailabilityCacheKey({
      serviceId: 'srv-rubber',
      extraServiceIds: ['srv-retiro', 'srv-pedi', 'srv-rubber', 'srv-retiro'],
      addonIds: ['addon-b', 'addon-a', 'addon-b'],
      staffId: 'any',
      windowStartDate: '2026-11-26',
    });
    const keyB = buildAvailabilityCacheKey({
      serviceId: 'srv-rubber',
      extraServiceIds: ['srv-pedi', 'srv-retiro'],
      addonIds: ['addon-a', 'addon-b'],
      staffId: '',
      windowStartDate: '2026-11-26',
    });

    expect(keyA).toBe(keyB);
    expect(keyA).toBe('srv-rubber|srv-pedi,srv-retiro|addon-a,addon-b|any|2026-11-26');
  });

  it('classifies local raster photos vs svg, data URLs, and dynamic media routes', () => {
    expect(isOptimizableLocalRasterImage('/landing/sets/08-verde-oliva-oscuro-4x5.webp')).toBe(true);
    expect(isOptimizableLocalRasterImage('/landing/avatar-cereza.png')).toBe(true);
    expect(isOptimizableLocalRasterImage('/brand/hero.jpg')).toBe(true);
    expect(isOptimizableLocalRasterImage('/landing/icons/french.svg')).toBe(false);
    expect(isOptimizableLocalRasterImage('data:image/png;base64,abc')).toBe(false);
    expect(isOptimizableLocalRasterImage('/api/media/proofs/123')).toBe(false);
    expect(isOptimizableLocalRasterImage('https://cdn.example.com/photo.webp')).toBe(false);
  });

  it('resolves effective selected date to first open day when requested date is unavailable', () => {
    const days: DayAvailabilitySummary[] = [
      { date: '2026-12-01', hasSlots: false, slotCount: 0, slots: [] },
      { date: '2026-12-02', hasSlots: true, slotCount: 3, slots: [] },
      { date: '2026-12-03', hasSlots: false, slotCount: 0, slots: [], publicNote: 'Solo tarde' },
    ];

    expect(resolveEffectiveSelectedDate('2026-12-01', days)).toBe('2026-12-02');
    expect(resolveEffectiveSelectedDate('2026-12-02', days)).toBe('2026-12-02');
    expect(resolveEffectiveSelectedDate('2026-12-03', days)).toBe('2026-12-03');
    expect(resolveEffectiveSelectedDate('2026-11-26', [])).toBe('2026-11-26');
  });
});
