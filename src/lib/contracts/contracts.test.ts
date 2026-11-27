import { describe, expect, it } from 'vitest';
import { AdminOperationsDeleteQuerySchema } from './operations';
import {
  AdminCreateBookingSchema,
  AdminOperationsPostSchema,
  AdminTeamPostSchema,
  BrandPatchSchema,
  CatalogMutationSchema,
  ClientPortalOtpActionSchema,
  CreateClientSchema,
  CreateSlotHoldSchema,
  CreateWaitlistSchema,
  DispatchCampaignSchema,
  isSafeInternalBookingMediaPath,
  ManageBookingPatchSchema,
  PostOverrideRangeSchema,
  PostRecurringBlockSchema,
  PublicAvailabilityQuerySchema,
  PublicCreateBookingSchema,
  PutScheduleSchema,
  ReportPeriodSchema,
  ValidateCouponSchema,
} from './index';

const VALID_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('Pure-domain shared Zod contracts', () => {
  it('PublicCreateBookingSchema strips privileged fields and rejects external media URLs', () => {
    const parsed = PublicCreateBookingSchema.parse({
      serviceId: 'srv-rubber',
      startAt: '2026-12-01T16:00:00.000Z',
      clientName: 'Sofía Ramírez',
      clientPhone: '2224123987',
      privacyConsentAccepted: true,
      inspoPhotoUrl: VALID_PNG_DATA_URL,
      paymentProofUrl: '/api/media/proofs/abc-123.png',
      forceConfirmed: true,
      source: 'manual',
      role: 'owner',
    });

    expect('forceConfirmed' in parsed).toBe(false);
    expect('source' in parsed).toBe(false);
    expect('role' in parsed).toBe(false);
    expect(parsed.marketingOptIn).toBe(false);

    const externalHttps = PublicCreateBookingSchema.safeParse({
      serviceId: 'srv-rubber',
      startAt: '2026-12-01T16:00:00.000Z',
      clientName: 'Sofía Ramírez',
      clientPhone: '2224123987',
      privacyConsentAccepted: true,
      inspoPhotoUrl: 'https://evil.example/pixel.png',
    });
    expect(externalHttps.success).toBe(false);

    const externalHttp = PublicCreateBookingSchema.safeParse({
      serviceId: 'srv-rubber',
      startAt: '2026-12-01T16:00:00.000Z',
      clientName: 'Sofía Ramírez',
      clientPhone: '2224123987',
      privacyConsentAccepted: true,
      paymentProofUrl: 'http://tracker.evil/beacon.jpg',
    });
    expect(externalHttp.success).toBe(false);

    const svgPayload = PublicCreateBookingSchema.safeParse({
      serviceId: 'srv-rubber',
      startAt: '2026-12-01T16:00:00.000Z',
      clientName: 'Sofía Ramírez',
      clientPhone: '2224123987',
      privacyConsentAccepted: true,
      inspoPhotoUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
    });
    expect(svgPayload.success).toBe(false);
  });

  it('AdminCreateBookingSchema supports manual/walk_in source and recurrence bounds', () => {
    const valid = AdminCreateBookingSchema.parse({
      serviceId: 'srv-rubber',
      startAt: '2026-12-01T16:00:00.000Z',
      clientName: 'Sofía Ramírez',
      clientPhone: '2224123987',
      recurrence: { intervalWeeks: 3, count: 4 },
    });
    expect(valid.source).toBe('manual');
    expect(valid.forceConfirmed).toBe(true);
    expect(valid.recurrence?.count).toBe(4);

    expect(
      AdminCreateBookingSchema.safeParse({
        serviceId: 'srv-rubber',
        startAt: '2026-12-01T16:00:00.000Z',
        clientName: 'Sofía Ramírez',
        clientPhone: '2224123987',
        source: 'web',
      }).success,
    ).toBe(false);
  });

  it('ManageBookingPatchSchema blocks external URLs on upload_proof and allows data URLs', () => {
    expect(
      ManageBookingPatchSchema.safeParse({
        action: 'upload_proof',
        paymentProofUrl: VALID_PNG_DATA_URL,
      }).success,
    ).toBe(true);

    expect(
      ManageBookingPatchSchema.safeParse({
        action: 'upload_proof',
        paymentProofUrl: 'https://evil.example/receipt.png',
      }).success,
    ).toBe(false);
  });

  it('isSafeInternalBookingMediaPath validates folder scope and rejects traversal or external schemes', () => {
    expect(isSafeInternalBookingMediaPath('/api/media/proofs/file-123.png', 'proofs')).toBe(
      true,
    );
    expect(isSafeInternalBookingMediaPath('inspo/img_01.webp', 'inspo')).toBe(true);
    expect(isSafeInternalBookingMediaPath('/api/media/inspo/img_01.webp', 'proofs')).toBe(
      false,
    );
    expect(isSafeInternalBookingMediaPath('/api/media/proofs/../secret.png', 'proofs')).toBe(
      false,
    );
    expect(isSafeInternalBookingMediaPath('https://cdn.example.com/a.png', 'proofs')).toBe(
      false,
    );
    expect(isSafeInternalBookingMediaPath('demo-comprobante-spei', 'proofs')).toBe(false);
  });

  it('AdminTeamPostSchema enforces discriminated union and rejects mass-assignment fields', () => {
    expect(
      AdminTeamPostSchema.safeParse({
        kind: 'admin_user',
        data: {
          email: 'nueva@nails.studio',
          fullName: 'Valeria Gómez',
          role: 'admin',
          staffMemberId: null,
          isActive: true,
        },
      }).success,
    ).toBe(true);

    expect(
      AdminTeamPostSchema.safeParse({
        kind: 'staff',
        data: {
          name: 'Valeria',
          commissionPercent: 45,
          role: 'owner',
        },
      }).success,
    ).toBe(false);

    expect(
      AdminTeamPostSchema.safeParse({
        kind: 'staff',
        data: {
          name: 'Valeria',
          commissionPercent: 150,
        },
      }).success,
    ).toBe(false);
  });

  it('AdminOperationsPostSchema validates all kinds and blocks OAuth token injection', () => {
    expect(
      AdminOperationsPostSchema.safeParse({
        kind: 'calendar',
        staffId: 'staff-karla',
        patch: { destinationCalendarId: 'primary', isConnected: true },
      }).success,
    ).toBe(true);

    expect(
      AdminOperationsPostSchema.safeParse({
        kind: 'calendar',
        staffId: 'staff-karla',
        patch: {
          isConnected: true,
          accessTokenEncrypted: 'v1.forged-token',
        },
      }).success,
    ).toBe(false);

    expect(
      AdminOperationsPostSchema.safeParse({
        kind: 'workflow',
        id: 'wf-1',
        patch: { isEnabled: false, triggerEvent: 'booking_canceled' },
      }).success,
    ).toBe(false);

    expect(
      AdminOperationsPostSchema.safeParse({
        kind: 'cash',
        data: {
          entryType: 'expense',
          description: 'Limas y acetona',
          amountCents: 18500,
          paymentMethod: 'cash',
        },
      }).success,
    ).toBe(true);

    expect(
      AdminOperationsPostSchema.safeParse({
        kind: 'unknown_kind',
        data: {},
      }).success,
    ).toBe(false);
  });

  it('validates availability, catalog, clients, brand, holds, waitlist, and coupon contracts', () => {
    expect(
      PutScheduleSchema.safeParse({
        staffId: 'staff-karla',
        rules: [
          {
            id: 'r-1',
            dayOfWeek: 1,
            startTime: '10:00',
            endTime: '18:00',
            fixedStartTimes: ['10:00', '13:30'],
          },
        ],
      }).success,
    ).toBe(true);

    expect(
      PutScheduleSchema.safeParse({
        staffId: 'staff-karla',
        rules: [
          {
            id: 'r-1',
            dayOfWeek: 1,
            startTime: '18:00',
            endTime: '10:00',
          },
        ],
      }).success,
    ).toBe(false);

    expect(
      PostOverrideRangeSchema.safeParse({
        kind: 'override_range',
        staffId: 'staff-karla',
        startDate: '2026-12-20',
        endDate: '2026-12-25',
        isClosed: true,
      }).success,
    ).toBe(true);

    expect(
      PostRecurringBlockSchema.safeParse({
        kind: 'recurring_block',
        staffId: 'staff-karla',
        reason: 'Comida',
        frequency: 'weekly',
        weekdays: [1, 2, 3],
        startTime: '14:00',
        endTime: '15:00',
      }).success,
    ).toBe(true);

    expect(
      PublicAvailabilityQuerySchema.safeParse({
        mode: 'range',
        startDate: '2026-12-01',
        days: 14,
      }).success,
    ).toBe(true);

    expect(
      CatalogMutationSchema.safeParse({
        kind: 'service',
        data: { name: 'Rubber Pro', durationMinutes: 90, priceCents: 42000 },
      }).success,
    ).toBe(true);

    const parsedCategory = CatalogMutationSchema.parse({
      kind: 'category',
      data: { name: '  Pestañas  ', displayOrder: 3 },
    });
    expect(parsedCategory).toEqual({
      kind: 'category',
      data: { name: 'Pestañas', displayOrder: 3 },
    });

    expect(
      CatalogMutationSchema.safeParse({
        kind: 'category',
        data: { id: 'cat-esculturales', name: 'Uñas & Acrílico' },
      }).success,
    ).toBe(true);

    const shortCategory = CatalogMutationSchema.safeParse({
      kind: 'category',
      data: { name: '  A  ' },
    });
    expect(shortCategory.success).toBe(false);
    if (!shortCategory.success) {
      expect(shortCategory.error.issues[0]?.message).toBe('Escribe el nombre de la categoría');
    }

    expect(
      CatalogMutationSchema.safeParse({
        kind: 'category',
        data: { name: 'Pestañas', displayOrder: -1 },
      }).success,
    ).toBe(false);

    expect(
      CreateClientSchema.safeParse({
        fullName: 'Ana Torres',
        phone: '2223334455',
      }).success,
    ).toBe(true);

    expect(
      ClientPortalOtpActionSchema.safeParse({
        action: 'verify',
        phone: '2223334455',
        code: '123456',
      }).success,
    ).toBe(true);

    expect(
      DispatchCampaignSchema.safeParse({
        kind: 'birthday',
        clientId: 'client-sofia',
      }).success,
    ).toBe(true);

    expect(
      BrandPatchSchema.safeParse({
        name: 'LAIKONA NAILS',
        currency: 'MXN',
        landingContent: {
          showBookingQr: false,
          touchUpDays: 28,
        },
      }).success,
    ).toBe(true);

    expect(
      BrandPatchSchema.safeParse({
        landingContent: { touchUpDays: 7 },
      }).success,
    ).toBe(true);
    expect(
      BrandPatchSchema.safeParse({
        landingContent: { touchUpDays: 60 },
      }).success,
    ).toBe(true);
    expect(
      BrandPatchSchema.safeParse({
        landingContent: { touchUpDays: 6 },
      }).success,
    ).toBe(false);
    expect(
      BrandPatchSchema.safeParse({
        landingContent: { touchUpDays: 61 },
      }).success,
    ).toBe(false);
    expect(
      BrandPatchSchema.safeParse({
        landingContent: { touchUpDays: 21.5 },
      }).success,
    ).toBe(false);
    expect(
      BrandPatchSchema.safeParse({
        landingContent: { showBookingQr: 'yes' },
      }).success,
    ).toBe(false);

    expect(
      AdminOperationsPostSchema.safeParse({
        kind: 'coupon_delete',
        id: 'cp-123',
      }).success,
    ).toBe(true);
    expect(
      AdminOperationsPostSchema.safeParse({
        kind: 'coupon_delete',
        id: '',
      }).success,
    ).toBe(false);
    expect(
      AdminOperationsPostSchema.safeParse({
        kind: 'inventory',
        data: {
          itemId: 'inv-1',
          delta: -1,
          reason: 'retail_sale',
          paymentMethod: 'card',
          notes: 'Venta mostrador',
        },
      }).success,
    ).toBe(true);
    expect(
      AdminOperationsDeleteQuerySchema.safeParse({
        kind: 'coupon',
        id: 'cp-123',
      }).success,
    ).toBe(true);
    expect(
      AdminOperationsDeleteQuerySchema.safeParse({
        kind: 'cash',
        id: 'cash-1',
      }).success,
    ).toBe(false);

    expect(ReportPeriodSchema.safeParse('30d').success).toBe(true);
    expect(ReportPeriodSchema.safeParse('365d').success).toBe(false);

    expect(
      CreateSlotHoldSchema.safeParse({
        serviceId: 'srv-rubber',
        staffId: 'staff-karla',
        startAt: '2026-12-01T16:00:00.000Z',
      }).success,
    ).toBe(true);

    expect(
      CreateWaitlistSchema.safeParse({
        serviceId: 'srv-rubber',
        desiredDate: '2026-12-05',
        clientName: 'Elena Ruiz',
        clientPhoneE164: '+522229998877',
      }).success,
    ).toBe(true);

    expect(
      ValidateCouponSchema.safeParse({
        code: 'GIFT500',
        subtotalCents: 45000,
      }).success,
    ).toBe(true);
  });
});
