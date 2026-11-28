import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { DayAvailabilitySummary } from '@/lib/availability/engine';
import { OptionalEmailSchema } from '@/lib/contracts/primitives';
import { createInitialDemoDatabase } from '@/lib/demo-seed';
import { normalizePhoneE164 } from '@/lib/format';
import { toPublicServiceDTO, toPublicSettingsDTO, toPublicStaffDTO } from '@/lib/public-dto';
import { resolveInitialBookingSelections } from './bookingViewHelpers';
import {
  birthdayInputToIso,
  buildAvailabilityCacheKey,
  extractMxPhoneDigits,
  findAlternativeSlotsForDate,
  findMatchingSlotInAvailability,
  fitWithinEdge,
  formatBirthdayInput,
  formatMxPhoneDisplay,
  isAcceptableClientEmail,
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

    expect(
      validateClientBookingFields(
        { name: 'Sofía Ramírez', phone: '222 123 4567', email: '', birthday: '' },
        '2026-11-26',
      ),
    ).toEqual({
      name: null,
      phone: null,
      email: null,
      birthday: null,
    });
    expect(
      validateClientBookingFields(
        { name: 'Sofía', phone: '222 123', email: 'sofia@correo', birthday: '31/02/1998' },
        '2026-11-26',
      ),
    ).toEqual({
      name: 'Escribe tu nombre y apellido.',
      phone: 'Tu WhatsApp debe tener 10 dígitos.',
      email: 'Revisa tu correo, parece incompleto.',
      birthday: 'Escribe tu cumpleaños como día/mes/año, por ejemplo 15/08/1997.',
    });
  });
});

describe('optional contact fields stay within the server booking contract', () => {
  it('never lets the client accept an email that the booking API would reject, and vice versa', () => {
    const emailLike = fc.oneof(
      fc.emailAddress(),
      fc.string({ maxLength: 40 }),
      fc
        .tuple(fc.stringMatching(/^[a-z0-9._+-]{0,12}$/), fc.stringMatching(/^[a-z0-9.-]{0,12}$/))
        .map(([local, domain]) => `${local}@${domain}`),
    );
    fc.assert(
      fc.property(emailLike, (raw) => {
        expect(isAcceptableClientEmail(raw)).toBe(OptionalEmailSchema.safeParse(raw).success);
      }),
      { numRuns: 500 },
    );
  });

  it('only sends birthdays as real past YYYY-MM-DD dates that retention campaigns can parse', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 14 }), (raw) => {
        const iso = birthdayInputToIso(formatBirthdayInput(raw), '2026-11-26');
        if (iso === null) return;
        expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(iso <= '2026-11-26').toBe(true);
        expect(new Date(`${iso}T12:00:00Z`).toISOString().slice(0, 10)).toBe(iso);
      }),
      { numRuns: 500 },
    );
    fc.assert(
      fc.property(fc.date({ min: new Date('1900-01-01T12:00:00Z'), max: new Date('2026-11-26T12:00:00Z'), noInvalidDate: true }), (date) => {
        const iso = date.toISOString().slice(0, 10);
        expect(birthdayInputToIso(formatBirthdayInput(iso), '2026-11-26')).toBe(iso);
      }),
      { numRuns: 300 },
    );
  });

  it('formats typed digits as DD/MM/AAAA and rejects future or impossible dates', () => {
    expect(formatBirthdayInput('1508')).toBe('15/08');
    expect(formatBirthdayInput('15081997')).toBe('15/08/1997');
    expect(formatBirthdayInput('1997-08-15')).toBe('15/08/1997');
    expect(birthdayInputToIso('15/08/1997', '2026-11-26')).toBe('1997-08-15');
    expect(birthdayInputToIso('29/02/2023', '2026-11-26')).toBeNull();
    expect(birthdayInputToIso('01/01/2030', '2026-11-26')).toBeNull();
    expect(birthdayInputToIso('15/08', '2026-11-26')).toBeNull();
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

  it('matches initial ?slot= across ISO instant, composite key, and local HH:MM, and collects nearby alternatives', () => {
    const slotA = {
      startAt: '2026-12-14T16:00:00.000Z',
      endAt: '2026-12-14T18:00:00.000Z',
      occupiedStartAt: '2026-12-14T16:00:00.000Z',
      occupiedEndAt: '2026-12-14T18:00:00.000Z',
      staffId: 'staff-karla',
      staffName: 'Karla',
      localTime24: '10:00',
      localTime12: '10:00 a.m.',
      period: 'morning' as const,
      availableStaffIds: ['staff-karla', 'staff-paty'],
    };
    const slotB = {
      startAt: '2026-12-14T19:30:00.000Z',
      endAt: '2026-12-14T21:30:00.000Z',
      occupiedStartAt: '2026-12-14T19:30:00.000Z',
      occupiedEndAt: '2026-12-14T21:30:00.000Z',
      staffId: 'staff-paty',
      staffName: 'Paty',
      localTime24: '13:30',
      localTime12: '1:30 p.m.',
      period: 'afternoon' as const,
      availableStaffIds: ['staff-paty'],
    };
    const slotC = {
      startAt: '2026-12-15T16:00:00.000Z',
      endAt: '2026-12-15T18:00:00.000Z',
      occupiedStartAt: '2026-12-15T16:00:00.000Z',
      occupiedEndAt: '2026-12-15T18:00:00.000Z',
      staffId: 'staff-tere',
      staffName: 'Tere',
      localTime24: '10:00',
      localTime12: '10:00 a.m.',
      period: 'morning' as const,
      availableStaffIds: ['staff-tere'],
    };
    const days: DayAvailabilitySummary[] = [
      { date: '2026-12-14', hasSlots: true, slotCount: 2, slots: [slotA, slotB] },
      { date: '2026-12-15', hasSlots: true, slotCount: 1, slots: [slotC] },
    ];

    expect(
      findMatchingSlotInAvailability({
        days,
        targetSlot: '2026-12-14T16:00:00Z',
        preferredDate: '2026-12-14',
      }),
    ).toEqual({ slot: slotA, date: '2026-12-14' });

    expect(
      findMatchingSlotInAvailability({
        days,
        targetSlot: 'staff-paty-2026-12-14T19:30:00.000Z',
      }),
    ).toEqual({ slot: slotB, date: '2026-12-14' });

    expect(
      findMatchingSlotInAvailability({
        days,
        targetSlot: '13:30',
        preferredDate: '2026-12-14',
      }),
    ).toEqual({ slot: slotB, date: '2026-12-14' });

    expect(
      findMatchingSlotInAvailability({
        days,
        targetSlot: '2026-12-14T22:00:00.000Z',
        preferredDate: '2026-12-14',
      }),
    ).toBeNull();

    expect(findAlternativeSlotsForDate(days, '2026-12-14', 3)).toEqual([slotA, slotB, slotC]);
    expect(findAlternativeSlotsForDate(days, '2026-12-15', 2)).toEqual([slotC, slotA]);
  });

  it('leaves bare /reservar unselected while preselecting explicit slug and resolving enabled booking layouts', () => {
    const db = createInitialDemoDatabase();
    const settings = toPublicSettingsDTO(db.settings);
    const services = db.services.map(toPublicServiceDTO);
    const staff = db.staff.map(toPublicStaffDTO);

    const bare = resolveInitialBookingSelections({
      settings,
      services,
      addons: db.addons,
      staff,
      initialTodayKey: '2026-11-27',
    });
    expect(bare.initialServiceId).toBe('');
    expect(bare.defaultScheduleLayout).toBe('month');
    expect(bare.enabledScheduleLayouts).toEqual(['month', 'week']);
    expect(bare.initialLayoutOverride).toBeNull();

    const withSlugAndLayout = resolveInitialBookingSelections({
      settings,
      services,
      addons: db.addons,
      staff,
      initialTodayKey: '2026-11-27',
      initialServiceSlug: services[0]?.slug,
      initialLayout: 'week',
    });
    expect(withSlugAndLayout.initialServiceId).toBe(services[0]?.id);
    expect(withSlugAndLayout.initialLayoutOverride).toBe('week');
  });
});

describe('fitWithinEdge', () => {
  it('never exceeds the max edge, keeps aspect ratio and never upscales', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 12_000 }),
        fc.integer({ min: 1, max: 12_000 }),
        fc.integer({ min: 64, max: 4_096 }),
        (w, h, maxEdge) => {
          const out = fitWithinEdge(w, h, maxEdge);
          expect(out.width).toBeGreaterThanOrEqual(1);
          expect(out.height).toBeGreaterThanOrEqual(1);
          expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(maxEdge);
          expect(out.width).toBeLessThanOrEqual(w);
          expect(out.height).toBeLessThanOrEqual(h);
          const scale = Math.min(1, maxEdge / Math.max(w, h));
          expect(Math.abs(out.width - Math.max(1, w * scale))).toBeLessThanOrEqual(1);
          expect(Math.abs(out.height - Math.max(1, h * scale))).toBeLessThanOrEqual(1);
        },
      ),
    );
  });
});
