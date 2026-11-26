import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createInitialDemoDatabase } from './demo-seed';
import {
  ClientPortalSnapshotDTOSchema,
  PublicClientPackageDTOSchema,
  PublicLoyaltySummarySchema,
  PublicReviewDTOSchema,
  PublicServiceDTOSchema,
  PublicSettingsDTOSchema,
  PublicStaffDTOSchema,
  toAdminCalendarConnectionDTO,
  toAdminSettingsDTO,
  toPublicBookingDTO,
  toPublicClientPackageDTO,
  toPublicReviewDTO,
  toPublicServiceDTO,
  toPublicSettingsDTO,
  toPublicStaffDTO,
  type PublicLoyaltySummaryDTO,
  type PublicReviewDTO,
} from './public-dto';
import { computeClientLoyaltySummary } from './loyalty/stamps';
import type { StaffMember } from './types';

describe('Public DTO schemas and mappers (S3)', () => {
  it('toPublicStaffDTO omits commissionPercent and isActive and validates with schema', () => {
    const db = createInitialDemoDatabase();
    for (const member of db.staff) {
      const dto = toPublicStaffDTO(member);

      expect(PublicStaffDTOSchema.safeParse(dto).success).toBe(true);
      expect('commissionPercent' in dto).toBe(false);
      expect('isActive' in dto).toBe(false);
      expect(Object.keys(dto)).not.toContain('commissionPercent');
      expect(Object.keys(dto)).not.toContain('isActive');
      expect(JSON.stringify(dto)).not.toContain('commissionPercent');

      expect(dto.id).toBe(member.id);
      expect(dto.name).toBe(member.name);
      expect(dto.bookingSlug).toBe(member.bookingSlug);
      expect(dto.serviceIds).toEqual(member.serviceIds);

      dto.serviceIds.push('mutated-id');
      expect(member.serviceIds).not.toContain('mutated-id');
    }
  });

  it('PublicStaffDTOSchema strips unknown internal properties on parse', () => {
    const parsed = PublicStaffDTOSchema.parse({
      id: 'staff-1',
      name: 'Karla',
      roleTitle: 'Master',
      bio: 'Bio',
      avatarUrl: null,
      bookingSlug: 'karla',
      displayOrder: 0,
      serviceIds: ['srv-rubber'],
      commissionPercent: 40,
      isActive: true,
      internalSecret: 'leaked',
    });

    expect('commissionPercent' in parsed).toBe(false);
    expect('isActive' in parsed).toBe(false);
    expect('internalSecret' in parsed).toBe(false);
  });

  it('toPublicServiceDTO exposes isStartingPrice while omitting internal buffers and isActive', () => {
    const db = createInitialDemoDatabase();
    for (const service of db.services) {
      const dto = toPublicServiceDTO(service);

      expect(PublicServiceDTOSchema.safeParse(dto).success).toBe(true);
      expect('bufferBeforeMinutes' in dto).toBe(false);
      expect('bufferAfterMinutes' in dto).toBe(false);
      expect('isActive' in dto).toBe(false);

      expect(dto.id).toBe(service.id);
      expect(dto.name).toBe(service.name);
      expect(dto.slug).toBe(service.slug);
      expect(dto.priceCents).toBe(service.priceCents);
      expect(dto.durationMinutes).toBe(service.durationMinutes);
      expect(dto.isStartingPrice).toBe(service.isStartingPrice);
    }

    const rubber = db.services.find((s) => s.slug === 'rubber');
    const pediGel = db.services.find((s) => s.slug === 'pedispa-gel');
    if (!rubber || !pediGel) {
      throw new Error('Expected LAIKONA services in seed');
    }
    expect(toPublicServiceDTO(rubber).isStartingPrice).toBe(true);
    expect(toPublicServiceDTO(pediGel).isStartingPrice).toBe(false);
    expect(toPublicServiceDTO({ ...rubber, isPrivate: true }).isPrivate).toBe(true);
  });

  it('toPublicSettingsDTO exposes LAIKONA public deposit/social fields while omitting internal admin fields', () => {
    const db = createInitialDemoDatabase();
    const dto = toPublicSettingsDTO(db.settings);

    expect(PublicSettingsDTOSchema.safeParse(dto).success).toBe(true);
    for (const privateKey of [
      'defaultCommissionPercent',
      'defaultAdminMode',
      'smsRemindersEnabled',
      'businessType',
      'teamSizeTier',
      'onboardingCompleted',
      'soundAlertsEnabled',
      'lockPastBookings',
      'maxActiveBookingsPerClient',
      'noShowDepositThreshold',
      'ownerPinHash',
      'ownerPinEnabled',
      'hasOwnerPin',
    ]) {
      expect(privateKey in dto).toBe(false);
      expect(JSON.stringify(dto)).not.toContain(privateKey);
    }

    expect(dto.name).toBe('LAIKONA NAILS');
    expect(dto.privacyPolicyVersion).toBe('2026-11');
    expect(dto.optimizeContinuousSlots).toBe(false);
    expect(dto.city).toBe('Puebla, México');
    expect(dto.instagramHandle).toBe('@laikona.nailsss');
    expect(dto.instagramUrl).toBe('https://www.instagram.com/laikona.nailsss/');
    expect(dto.sisterStudioHandle).toBeUndefined();
    expect(
      toPublicSettingsDTO({ ...db.settings, sisterStudioHandle: '@estudio.aliado' })
        .sisterStudioHandle,
    ).toBe('@estudio.aliado');
    expect(dto.depositBankName).toBe('Mercado Pago');
    expect(dto.depositBeneficiary).toBe('Karla Patricia Carrillo Rodríguez');
    expect(dto.depositClabe).toBe('7229 6901 3959 779869');
    expect(dto.depositAmountCents).toBe(20000);
    expect(dto.serviceMode).toBe('studio');
    expect(dto.timezone).toBe(db.settings.timezone);
    expect(dto.landingContent).toEqual(db.settings.landingContent);
    expect(dto.enabledBookingLayouts).toEqual(db.settings.enabledBookingLayouts);

    dto.enabledBookingLayouts.push('column');
    expect(db.settings.enabledBookingLayouts).toHaveLength(3);

    const parsed = PublicSettingsDTOSchema.parse({
      ...db.settings,
      internalOnlyFlag: true,
    });
    expect('defaultCommissionPercent' in parsed).toBe(false);
    expect('onboardingCompleted' in parsed).toBe(false);
    expect('soundAlertsEnabled' in parsed).toBe(false);
    expect('internalOnlyFlag' in parsed).toBe(false);
  });

  it('Property (S3): toPublicStaffDTO never leaks commissionPercent for any staff input', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 20 }),
          name: fc.string({ minLength: 1, maxLength: 40 }),
          roleTitle: fc.string({ maxLength: 40 }),
          bio: fc.string({ maxLength: 120 }),
          avatarUrl: fc.option(fc.webUrl(), { nil: null }),
          bookingSlug: fc.string({ minLength: 1, maxLength: 20 }),
          commissionPercent: fc.integer({ min: 0, max: 100 }),
          isActive: fc.boolean(),
          displayOrder: fc.integer({ min: 0, max: 50 }),
          serviceIds: fc.array(fc.string({ minLength: 1, maxLength: 15 }), { maxLength: 8 }),
        }),
        (staff: StaffMember) => {
          const dto = toPublicStaffDTO(staff);
          expect('commissionPercent' in dto).toBe(false);
          expect('isActive' in dto).toBe(false);
          expect(PublicStaffDTOSchema.safeParse(dto).success).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('toPublicReviewDTO exposes only client first name and strips internal IDs and PII', () => {
    const db = createInitialDemoDatabase();
    const review = db.reviews[0];
    if (!review) throw new Error('Expected seeded review');

    const dto: PublicReviewDTO = toPublicReviewDTO(review, {
      serviceId: 'srv-rubber',
      clientFullName: 'Sofía Ramírez Pérez',
    });
    expect(PublicReviewDTOSchema.safeParse(dto).success).toBe(true);
    expect(dto.clientFirstName).toBe('Sofía');
    expect(JSON.stringify(dto)).not.toContain('Ramírez');
    expect('clientId' in dto).toBe(false);
    expect('bookingId' in dto).toBe(false);
    expect('staffId' in dto).toBe(false);
    expect('clickedGoogleReview' in dto).toBe(false);

    const anonymousDto = toPublicReviewDTO(review, {
      serviceId: 'srv-rubber',
      clientFullName: '   ',
    });
    expect(anonymousDto.clientFirstName).toBe('Clienta verificada');

    const program = db.loyaltyPrograms?.[0];
    if (!program) throw new Error('Expected seeded loyalty program');
    const summary: PublicLoyaltySummaryDTO = PublicLoyaltySummarySchema.parse(
      computeClientLoyaltySummary(program, db.loyaltyStamps ?? [], 'client-sofia'),
    );
    expect(summary.currentStamps).toBe(6);
    expect(summary.isNearReward).toBe(true);

    const seededPkg = db.clientPackages?.[0];
    if (!seededPkg) throw new Error('Expected seeded client package');
    const pkgDto = toPublicClientPackageDTO(seededPkg, {
      serviceName: 'Rubber',
      remainingSessions: 3,
      effectiveStatus: 'active',
    });
    expect(PublicClientPackageDTOSchema.safeParse(pkgDto).success).toBe(true);
    expect('notes' in pkgDto).toBe(false);
    expect('redeemedBookingIds' in pkgDto).toBe(false);

    const portalParsed = ClientPortalSnapshotDTOSchema.parse({
      phoneE164: '+522224123987',
      clientId: 'client-sofia',
      clientName: 'Sofía Ramírez',
      bookings: [],
      loyaltySummary: summary,
      packages: [pkgDto],
      internalNotes: 'should-be-stripped',
      commissionPercent: 40,
    });
    expect('internalNotes' in portalParsed).toBe(false);
    expect('commissionPercent' in portalParsed).toBe(false);
  });

  it('toAdminSettingsDTO, toAdminCalendarConnectionDTO, and toPublicBookingDTO strip sensitive fields', () => {
    const db = createInitialDemoDatabase();
    const adminSettings = toAdminSettingsDTO({
      ...db.settings,
      ownerPinHash: 'scrypt$16384$8$1$salt$hash',
      ownerPinEnabled: true,
    });
    expect('ownerPinHash' in adminSettings).toBe(false);
    expect(JSON.stringify(adminSettings)).not.toContain('scrypt$');
    expect(adminSettings.hasOwnerPin).toBe(true);
    expect(adminSettings.ownerPinEnabled).toBe(true);

    const conn = db.calendarConnections[0];
    if (!conn) throw new Error('Expected calendar connection');
    const adminConn = toAdminCalendarConnectionDTO({
      ...conn,
      accessTokenEncrypted: 'v1.enc-access',
      refreshTokenEncrypted: 'v1.enc-refresh',
    });
    expect('accessTokenEncrypted' in adminConn).toBe(false);
    expect('refreshTokenEncrypted' in adminConn).toBe(false);
    expect(JSON.stringify(adminConn)).not.toContain('v1.enc-');

    const booking = db.bookings[0];
    const staff = db.staff.find((s) => s.id === booking?.staffId);
    const service = db.services.find((s) => s.id === booking?.serviceId);
    const client = db.clients.find((c) => c.id === booking?.clientId);
    if (!booking || !staff || !service || !client) {
      throw new Error('Expected seeded booking relations');
    }
    const pubBooking = toPublicBookingDTO(
      {
        ...booking,
        internalNotes: 'Solo personal interno',
        staff,
        service,
        client: { ...client, notes: 'Nota CRM privada' },
      },
      db.services,
    );
    expect(pubBooking.internalNotes).toBe('');
    expect(pubBooking.client.notes).toBe('');
    expect('commissionPercent' in pubBooking.staff).toBe(false);
    expect('bufferBeforeMinutes' in pubBooking.service).toBe(false);
  });
});
