import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEPOSIT_INSTRUCTIONS,
  DEFAULT_TOUCH_UP_DAYS,
  formatTouchUpActionLabel,
  formatTouchUpSubtitle,
  resolveBookingInstructionsText,
  resolveDepositInstructions,
  resolveShowBookingQr,
  resolveTouchUpDays,
} from './cita-settings';
import { computeManagePoliciesAndUrls } from '@/components/cita/citaApi';
import type { PublicManageBooking } from '@/components/cita/types';
import { createInitialDemoDatabase } from '@/lib/demo-seed';
import { toPublicServiceDTO, toPublicSettingsDTO, toPublicStaffDTO } from '@/lib/public-dto';

function makePublicManageBooking(): PublicManageBooking {
  const db = createInitialDemoDatabase();
  const base = db.bookings[0]!;
  const service = db.services.find((srv) => srv.id === base.serviceId) ?? db.services[0]!;
  const staff = db.staff.find((st) => st.id === base.staffId) ?? db.staff[0]!;
  const client = db.clients.find((cl) => cl.id === base.clientId) ?? db.clients[0]!;
  return {
    ...base,
    startAt: '2026-12-01T16:00:00.000Z',
    endAt: '2026-12-01T17:30:00.000Z',
    internalNotes: '',
    client: { ...client, notes: '' },
    service: toPublicServiceDTO(service),
    staff: toPublicStaffDTO(staff),
  };
}

describe('cita brand settings resolution and profile modal layout invariants', () => {
  it('resolves custom depositInstructions and falls back cleanly when empty', () => {
    expect(resolveDepositInstructions('  Envía tu SPEI 24 h antes con tu nombre.  ')).toBe(
      'Envía tu SPEI 24 h antes con tu nombre.',
    );
    expect(resolveDepositInstructions('')).toBe(DEFAULT_DEPOSIT_INSTRUCTIONS);
    expect(resolveDepositInstructions('   ')).toBe(DEFAULT_DEPOSIT_INSTRUCTIONS);
    expect(resolveDepositInstructions(null)).toBe(DEFAULT_DEPOSIT_INSTRUCTIONS);
    expect(resolveDepositInstructions(undefined)).toBe(DEFAULT_DEPOSIT_INSTRUCTIONS);
  });

  it('resolves trimmed arrival bookingInstructionsText or null when blank', () => {
    expect(resolveBookingInstructionsText('  Llega 10 minutos antes. ')).toBe(
      'Llega 10 minutos antes.',
    );
    expect(resolveBookingInstructionsText('   ')).toBeNull();
    expect(resolveBookingInstructionsText(undefined)).toBeNull();
  });

  it('defaults showBookingQr to true and hides QR only when explicitly false', () => {
    expect(resolveShowBookingQr(undefined)).toBe(true);
    expect(resolveShowBookingQr(null)).toBe(true);
    expect(resolveShowBookingQr({})).toBe(true);
    expect(resolveShowBookingQr({ showBookingQr: true })).toBe(true);
    expect(resolveShowBookingQr({ showBookingQr: false })).toBe(false);
  });

  it('resolves touchUpDays with 21 default and 7..60 clamp, and formats touch-up copy', () => {
    expect(resolveTouchUpDays(undefined)).toBe(DEFAULT_TOUCH_UP_DAYS);
    expect(resolveTouchUpDays({})).toBe(21);
    expect(resolveTouchUpDays({ touchUpDays: 28 })).toBe(28);
    expect(resolveTouchUpDays({ touchUpDays: 3 })).toBe(7);
    expect(resolveTouchUpDays({ touchUpDays: 90 })).toBe(60);
    expect(resolveTouchUpDays({ touchUpDays: Number.NaN })).toBe(21);

    expect(formatTouchUpActionLabel(28)).toBe('Agendar siguiente retoque (+28 días)');
    expect(formatTouchUpSubtitle('Rubber', 'Karla', 28)).toBe(
      'Dejamos prellenado Rubber con Karla en 28 días para que apartes en un toque.',
    );
  });

  it('uses custom touchUpDays when computing touchUpUrl in computeManagePoliciesAndUrls', () => {
    const db = createInitialDemoDatabase();
    const baseSettings = toPublicSettingsDTO(db.settings);
    const booking = makePublicManageBooking();
    const nowMs = new Date('2026-11-28T12:00:00.000Z').getTime();

    const defaultResult = computeManagePoliciesAndUrls({
      booking,
      settings: baseSettings,
      nowMs,
      tz: 'America/Mexico_City',
      whatsappUrl: 'https://wa.me/522221112233',
    });
    expect(defaultResult.touchUpDays).toBe(21);
    expect(defaultResult.touchUpUrl).toContain('date=2026-12-22');

    const customSettings = {
      ...baseSettings,
      landingContent: {
        ...baseSettings.landingContent,
        touchUpDays: 28,
      },
    };
    const customResult = computeManagePoliciesAndUrls({
      booking,
      settings: customSettings,
      nowMs,
      tz: 'America/Mexico_City',
      whatsappUrl: 'https://wa.me/522221112233',
    });
    expect(customResult.touchUpDays).toBe(28);
    expect(customResult.touchUpUrl).toContain('date=2026-12-29');
  });

  it('guards SpecialistProfileDialog Servicios CTA buttons against flex-shrink clipping on desktop and mobile', () => {
    const globalsCss = fs.readFileSync(
      path.join(process.cwd(), 'src/app/globals.css'),
      'utf8',
    );
    const dialogSource = fs.readFileSync(
      path.join(process.cwd(), 'src/components/landing/SpecialistProfileDialog.tsx'),
      'utf8',
    );

    expect(dialogSource).toContain('lk-profile-service-item');
    expect(dialogSource).toContain('lk-profile-service-copy');
    expect(dialogSource).toContain('lk-profile-service-cta');
    expect(globalsCss).toMatch(/\.lk-profile-service-cta\s*\{[^}]*flex:\s*0 0 auto\s*!important/);
    expect(globalsCss).toMatch(/\.lk-profile-service-cta\s*\{[^}]*min-width:\s*max-content\s*!important/);
    expect(globalsCss).toMatch(/\.lk-profile-service-copy\s*\{[^}]*min-width:\s*0/);
  });
});
