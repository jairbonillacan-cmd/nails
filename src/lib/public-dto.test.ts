import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createInitialDemoDatabase } from './demo-seed';
import {
  PublicServiceDTOSchema,
  PublicSettingsDTOSchema,
  PublicStaffDTOSchema,
  toPublicServiceDTO,
  toPublicSettingsDTO,
  toPublicStaffDTO,
} from './public-dto';
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
      name: 'Valeria',
      roleTitle: 'Master',
      bio: 'Bio',
      avatarUrl: null,
      bookingSlug: 'valeria',
      displayOrder: 0,
      serviceIds: ['srv-1'],
      commissionPercent: 45,
      isActive: true,
      internalSecret: 'leaked',
    });

    expect('commissionPercent' in parsed).toBe(false);
    expect('isActive' in parsed).toBe(false);
    expect('internalSecret' in parsed).toBe(false);
  });

  it('toPublicServiceDTO omits internal scheduling buffers and isActive', () => {
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
    }
  });

  it('toPublicSettingsDTO omits defaultCommissionPercent, defaultAdminMode, and smsRemindersEnabled', () => {
    const db = createInitialDemoDatabase();
    const dto = toPublicSettingsDTO(db.settings);

    expect(PublicSettingsDTOSchema.safeParse(dto).success).toBe(true);
    expect('defaultCommissionPercent' in dto).toBe(false);
    expect('defaultAdminMode' in dto).toBe(false);
    expect('smsRemindersEnabled' in dto).toBe(false);
    expect(JSON.stringify(dto)).not.toContain('defaultCommissionPercent');

    expect(dto.name).toBe(db.settings.name);
    expect(dto.timezone).toBe(db.settings.timezone);
    expect(dto.landingContent).toEqual(db.settings.landingContent);
    expect(dto.enabledBookingLayouts).toEqual(db.settings.enabledBookingLayouts);

    dto.enabledBookingLayouts.push('column');
    expect(db.settings.enabledBookingLayouts).toHaveLength(3);
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
});
