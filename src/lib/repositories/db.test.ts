import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import fc from 'fast-check';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addDateOverride,
  addDateOverrideRange,
  addWaitlistEntry,
  assignClientPackage,
  claimWebhookEventIdempotent,
  cleanupExpiredSlotHolds,
  confirmBookingDepositFromWebhook,
  createBookingAtomic,
  createClientProfile,
  createOrRefreshSlotHold,
  createRecurringBookingSeries,
  deleteRecurringBlock,
  getBookingByToken,
  getClientArcoExport,
  getClientLoyaltySummary,
  getClientNoShowPolicyStatus,
  getClientPortalSnapshotByPhone,
  getInactiveClients,
  getMediaAccessOwner,
  getNearRewardClients,
  getRepository,
  getSnapshot,
  getWhatsAppMonthlyUsage,
  getWhatsAppTemplates,
  incrementWhatsAppMonthlyUsage,
  listClientPackages,
  listMediaAssetsForRetention,
  listServicePackages,
  manageClientBookingAction,
  markMediaAssetPurged,
  markMediaRetentionWarned,
  MaxActiveBookingsError,
  persistBookingMediaField,
  PolicyError,
  preloadMexicoHolidays,
  processDueScheduledNotifications,
  queryAvailability,
  quickSearchAvailability,
  recordBookingCheckoutAtomic,
  redeemClientPackageSession,
  registerMediaAsset,
  releaseSlotHold,
  requestBookingReschedule,
  saveOnboardingSetup,
  sendManualBookingReminder,
  SlotConflictError,
  toggleRecurringBlock,
  updateBookingStatus,
  updateClientNotes,
  updateSalonSettings,
  upsertLoyaltyProgram,
  upsertRecurringBlock,
  upsertService,
  upsertServicePackage,
  validateCouponCode,
  verifyStoredOwnerPin,
} from './db';
import { hashOwnerPin } from '../security/auth-pin';
import { resetRateLimiterForTests } from '../security/rate-limit';
import { NextRequest } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
} from '../auth/admin-session';
import { PATCH as patchAdminBrand } from '@/app/api/admin/brand/route';
import {
  PATCH as patchAdminBookings,
  POST as postAdminBookings,
} from '@/app/api/admin/bookings/route';
import { GET as getAdminOperations } from '@/app/api/admin/operations/route';
import {
  GET as getAdminPackages,
  PATCH as patchAdminPackages,
  POST as postAdminPackages,
} from '@/app/api/admin/packages/route';
import {
  GET as getAdminCampaigns,
  POST as postAdminCampaigns,
} from '@/app/api/admin/campaigns/route';
import { POST as postValidateCoupon } from '@/app/api/coupons/validate/route';
import { zonedDateTimeToUtc } from '../availability/engine';
import { getDateKeyInTimezone } from '../format';

const TEMP_DB_PATH = path.join(
  os.tmpdir(),
  `nails-db-test-${process.pid}-${crypto.randomUUID()}.json`,
);

let originalDbPathEnv: string | undefined;

function resetIsolatedDb(): void {
  globalThis.nailsDbCache = undefined;
  globalThis.nailsDbCachePath = undefined;
  globalThis.nailsDbPersistedToDisk = undefined;
  if (fs.existsSync(TEMP_DB_PATH)) {
    fs.unlinkSync(TEMP_DB_PATH);
  }
}

beforeAll(() => {
  originalDbPathEnv = process.env.NAILS_DEMO_DB_PATH;
  process.env.NAILS_DEMO_DB_PATH = TEMP_DB_PATH;
  resetIsolatedDb();
});

beforeEach(() => {
  resetIsolatedDb();
});

afterEach(() => {
  resetIsolatedDb();
});

afterAll(() => {
  resetIsolatedDb();
  if (originalDbPathEnv === undefined) {
    delete process.env.NAILS_DEMO_DB_PATH;
  } else {
    process.env.NAILS_DEMO_DB_PATH = originalDbPathEnv;
  }
});

describe('Atomic Booking Concurrency, Slot Holds & Domain Guards (D1/D2/D3)', () => {
  it('prevents double-booking when two clients race for the exact same slot and returns 3 alternatives', async () => {
    const db = getSnapshot();
    const service = db.services.find((s) => s.id === 'srv-gel-semipermanente-manos');
    if (!service) throw new Error('Expected seed service');
    const today = getDateKeyInTimezone(new Date(), db.settings.timezone);

    const avail = queryAvailability({
      serviceId: service.id,
      addonIds: [],
      staffId: 'staff-karla',
      startDate: today,
      days: 14,
    });
    const openSlot = avail.days.flatMap((d) => d.slots)[0];
    expect(openSlot).toBeDefined();
    if (!openSlot) throw new Error('Expected open slot');

    const [r1, r2] = await Promise.allSettled([
      createBookingAtomic({
        serviceId: service.id,
        addonIds: [],
        staffId: openSlot.staffId,
        startAt: openSlot.startAt,
        clientName: 'Clienta Carrera A',
        clientPhone: '+525511002201',
        source: 'web',
        idempotencyKey: `race-a-${Date.now()}`,
      }),
      createBookingAtomic({
        serviceId: service.id,
        addonIds: [],
        staffId: openSlot.staffId,
        startAt: openSlot.startAt,
        clientName: 'Clienta Carrera B',
        clientPhone: '+525511002202',
        source: 'whatsapp',
        idempotencyKey: `race-b-${Date.now()}`,
      }),
    ]);

    const fulfilled = [r1, r2].filter((r) => r.status === 'fulfilled');
    const rejected = [r1, r2].filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const firstRejected = rejected[0];
    if (!firstRejected || firstRejected.status !== 'rejected') {
      throw new Error('Expected rejected promise');
    }
    const err = firstRejected.reason;
    expect(err).toBeInstanceOf(SlotConflictError);
    expect(err.code).toBe('SLOT_TAKEN');
    expect(Array.isArray(err.suggestedSlots)).toBe(true);
    expect(err.suggestedSlots.length).toBeGreaterThan(0);
  });

  it('deduplicates double submissions via Idempotency-Key and enforces 3-minute slot holds', async () => {
    const db = getSnapshot();
    const service = db.services.find((s) => s.id === 'srv-gel-semipermanente-manos');
    if (!service) throw new Error('Expected seed service');
    const today = getDateKeyInTimezone(new Date(), db.settings.timezone);

    const avail = queryAvailability({
      serviceId: service.id,
      addonIds: [],
      staffId: 'staff-tere',
      startDate: today,
      days: 14,
    });
    const openSlot = avail.days.flatMap((d) => d.slots)[0];
    expect(openSlot).toBeDefined();
    if (!openSlot) throw new Error('Expected open slot');

    const hold = await createOrRefreshSlotHold({
      serviceId: service.id,
      addonIds: [],
      staffId: openSlot.staffId,
      startAt: openSlot.startAt,
      sessionToken: 'sess-hold-owner',
    });
    expect(new Date(hold.expiresAt).getTime()).toBeGreaterThan(Date.now());

    await expect(
      createBookingAtomic({
        serviceId: service.id,
        addonIds: [],
        staffId: openSlot.staffId,
        startAt: openSlot.startAt,
        clientName: 'Intrusa B',
        clientPhone: '+525511009999',
        sessionToken: 'sess-other-user',
      }),
    ).rejects.toBeInstanceOf(SlotConflictError);

    const idemKey = `idem-dedup-${Date.now()}`;
    const first = await createBookingAtomic({
      serviceId: service.id,
      addonIds: [],
      staffId: openSlot.staffId,
      startAt: openSlot.startAt,
      clientName: 'Clienta Hold A',
      clientPhone: '+525511008888',
      sessionToken: 'sess-hold-owner',
      idempotencyKey: idemKey,
    });
    const second = await createBookingAtomic({
      serviceId: service.id,
      addonIds: [],
      staffId: openSlot.staffId,
      startAt: openSlot.startAt,
      clientName: 'Clienta Hold A',
      clientPhone: '+525511008888',
      sessionToken: 'sess-hold-owner',
      idempotencyKey: idemKey,
    });
    expect(second.id).toBe(first.id);
    await releaseSlotHold('sess-hold-owner');
  });

  it('A7: enforces holdId + sessionToken ownership and range match on booking confirmation', async () => {
    const db = getSnapshot();
    const today = getDateKeyInTimezone(new Date(), db.settings.timezone);
    const avail = queryAvailability({
      serviceId: 'srv-gel-semipermanente-manos',
      addonIds: [],
      staffId: 'staff-tere',
      startDate: today,
      days: 14,
    });
    const slots = avail.days.flatMap((d) => d.slots);
    const slotA = slots[0];
    const slotB = slots[slots.length - 1];
    if (!slotA || !slotB || slotA.startAt === slotB.startAt) {
      throw new Error('Expected two distinct open slots');
    }

    const hold = await createOrRefreshSlotHold({
      serviceId: 'srv-gel-semipermanente-manos',
      addonIds: [],
      staffId: slotA.staffId,
      startAt: slotA.startAt,
      sessionToken: 'sess-a7-owner',
    });
    expect(hold.holdId).toBe(hold.id);

    await expect(
      createBookingAtomic({
        serviceId: 'srv-gel-semipermanente-manos',
        addonIds: [],
        staffId: slotA.staffId,
        startAt: slotA.startAt,
        clientName: 'Otra Sesion',
        clientPhone: '+525511007701',
        sessionToken: 'sess-a7-intruder',
        holdId: hold.holdId,
      }),
    ).rejects.toBeInstanceOf(SlotConflictError);

    await expect(
      createBookingAtomic({
        serviceId: 'srv-gel-semipermanente-manos',
        addonIds: [],
        staffId: slotB.staffId,
        startAt: slotB.startAt,
        clientName: 'Otro Horario',
        clientPhone: '+525511007702',
        sessionToken: 'sess-a7-owner',
        holdId: hold.holdId,
      }),
    ).rejects.toBeInstanceOf(SlotConflictError);

    const confirmed = await createBookingAtomic({
      serviceId: 'srv-gel-semipermanente-manos',
      addonIds: [],
      staffId: slotA.staffId,
      startAt: slotA.startAt,
      clientName: 'Duena Hold',
      clientPhone: '+525511007703',
      sessionToken: 'sess-a7-owner',
      holdId: hold.holdId,
    });
    expect(confirmed.bookingCode).toMatch(/^NL-[A-Z2-9]{6}$/);
    expect(getSnapshot().slotHolds.some((h) => h.id === hold.holdId)).toBe(false);
  });

  it('D1: rejects 3am, past, beyond-max-days, override-closed, and unaligned slots on booking, hold, and reschedule', async () => {
    const db = getSnapshot();
    const tz = db.settings.timezone;
    const today = getDateKeyInTimezone(new Date(), tz);
    const avail = queryAvailability({
      serviceId: 'srv-gel-semipermanente-manos',
      addonIds: [],
      staffId: 'staff-karla',
      startDate: today,
      days: 14,
    });
    const validDay = avail.days.find((d) => d.date > today && d.slots.length > 0);
    if (!validDay || !validDay.slots[0]) throw new Error('Expected future open day');
    const validSlot = validDay.slots[0];

    const threeAmIso = zonedDateTimeToUtc(validDay.date, '03:00', tz).toISOString();
    let caughtThreeAm: unknown = null;
    try {
      await createBookingAtomic({
        serviceId: 'srv-gel-semipermanente-manos',
        addonIds: [],
        staffId: 'staff-karla',
        startAt: threeAmIso,
        clientName: 'Nocturna',
        clientPhone: '+525511223344',
      });
    } catch (err) {
      caughtThreeAm = err;
    }
    expect(caughtThreeAm).toBeInstanceOf(PolicyError);
    expect((caughtThreeAm as PolicyError).code).toBe('OUTSIDE_HOURS');
    expect((caughtThreeAm as PolicyError).suggestedSlots?.length).toBeGreaterThan(0);

    await expect(
      createOrRefreshSlotHold({
        serviceId: 'srv-gel-semipermanente-manos',
        addonIds: [],
        staffId: 'staff-karla',
        startAt: threeAmIso,
        sessionToken: 'sess-3am',
      }),
    ).rejects.toMatchObject({ code: 'OUTSIDE_HOURS' });

    const pastIso = new Date(Date.now() - 3_600_000).toISOString();
    await expect(
      createBookingAtomic({
        serviceId: 'srv-gel-semipermanente-manos',
        addonIds: [],
        staffId: 'staff-karla',
        startAt: pastIso,
        clientName: 'Pasado',
        clientPhone: '+525511223345',
      }),
    ).rejects.toMatchObject({ code: 'PAST_OR_NOTICE' });

    const beyondMaxIso = new Date(
      Date.now() + (db.settings.maxBookingDaysAhead + 10) * 86_400_000,
    ).toISOString();
    await expect(
      createBookingAtomic({
        serviceId: 'srv-gel-semipermanente-manos',
        addonIds: [],
        staffId: 'staff-karla',
        startAt: beyondMaxIso,
        clientName: 'Futuro Lejano',
        clientPhone: '+525511223346',
      }),
    ).rejects.toMatchObject({ code: 'BEYOND_MAX_DAYS' });

    const unalignedIso = new Date(
      new Date(validSlot.startAt).getTime() + 7 * 60_000,
    ).toISOString();
    await expect(
      createBookingAtomic({
        serviceId: 'srv-gel-semipermanente-manos',
        addonIds: [],
        staffId: 'staff-karla',
        startAt: unalignedIso,
        clientName: 'Desalineada',
        clientPhone: '+525511223347',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_ALIGNMENT' });

    await addDateOverride({
      staffId: 'staff-karla',
      overrideDate: validDay.date,
      isUnavailable: true,
      startTime: null,
      endTime: null,
      reason: 'Vacaciones test D1',
    });
    await expect(
      createBookingAtomic({
        serviceId: 'srv-gel-semipermanente-manos',
        addonIds: [],
        staffId: 'staff-karla',
        startAt: validSlot.startAt,
        clientName: 'Dia Cerrado',
        clientPhone: '+525511223348',
      }),
    ).rejects.toMatchObject({ code: 'OUTSIDE_HOURS' });

    const farAvail = queryAvailability({
      serviceId: 'srv-gel-semipermanente-manos',
      addonIds: [],
      staffId: 'staff-tere',
      startDate: today,
      days: 14,
    });
    const farDay = farAvail.days.find(
      (d) =>
        d.slots.length > 0 &&
        new Date(d.slots[0]?.startAt ?? 0).getTime() - Date.now() > 48 * 3_600_000,
    );
    if (!farDay || !farDay.slots[0]) throw new Error('Expected future slot >48h');
    const created = await createBookingAtomic({
      serviceId: 'srv-gel-semipermanente-manos',
      addonIds: [],
      staffId: 'staff-tere',
      startAt: farDay.slots[0].startAt,
      clientName: 'Reagendar D1',
      clientPhone: '+525511223349',
    });

    await expect(
      manageClientBookingAction({
        token: created.manageToken,
        action: 'reschedule',
        newStartAt: threeAmIso,
        newStaffId: 'staff-tere',
      }),
    ).rejects.toMatchObject({ code: 'OUTSIDE_HOURS' });

    const unchanged = getBookingByToken(created.manageToken);
    expect(unchanged?.startAt).toBe(created.startAt);
  });

  it('D2: enforces state machine transitions and restores coupon/gift card on cancel', async () => {
    const db = getSnapshot();
    const today = getDateKeyInTimezone(new Date(), db.settings.timezone);
    const avail = queryAvailability({
      serviceId: 'srv-rubber',
      addonIds: [],
      staffId: 'staff-tere',
      startDate: today,
      days: 14,
    });
    const futureSlots = avail.days
      .flatMap((d) => d.slots)
      .filter((s) => new Date(s.startAt).getTime() - Date.now() > 48 * 3_600_000);
    const slot1 = futureSlots[0];
    const slot2 = futureSlots[futureSlots.length - 1];
    if (!slot1 || !slot2 || slot1.startAt === slot2.startAt) {
      throw new Error('Expected two distinct future slots');
    }

    const initialCouponUses =
      getSnapshot().coupons.find((c) => c.code === 'BIENVENIDA10')?.usedCount ?? 0;
    const withCoupon = await createBookingAtomic({
      serviceId: 'srv-rubber',
      addonIds: [],
      staffId: slot1.staffId,
      startAt: slot1.startAt,
      clientName: 'Clienta Cupon',
      clientPhone: '+525533445501',
      couponCode: 'BIENVENIDA10',
    });
    expect(
      getSnapshot().coupons.find((c) => c.code === 'BIENVENIDA10')?.usedCount,
    ).toBe(initialCouponUses + 1);

    await updateBookingStatus({
      bookingId: withCoupon.id,
      status: 'canceled',
      cancellationReason: 'Cancelada en test D2',
    });
    expect(
      getSnapshot().coupons.find((c) => c.code === 'BIENVENIDA10')?.usedCount,
    ).toBe(initialCouponUses);

    await expect(
      updateBookingStatus({
        bookingId: withCoupon.id,
        status: 'confirmed',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });

    const cashCountBefore = getSnapshot().cashEntries.length;
    await expect(
      updateBookingStatus({
        bookingId: 'bk-1000',
        status: 'canceled',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    expect(getSnapshot().bookings.find((b) => b.id === 'bk-1000')?.status).toBe('completed');
    expect(getSnapshot().cashEntries.length).toBe(cashCountBefore);

    const initialGiftBal =
      getSnapshot().coupons.find((c) => c.code === 'GIFT500')?.remainingBalanceCents ?? 0;
    const withGift = await createBookingAtomic({
      serviceId: 'srv-rubber',
      addonIds: [],
      staffId: slot2.staffId,
      startAt: slot2.startAt,
      clientName: 'Clienta Gift',
      clientPhone: '+525533445502',
      couponCode: 'GIFT500',
    });
    expect(
      getSnapshot().coupons.find((c) => c.code === 'GIFT500')?.remainingBalanceCents,
    ).toBeLessThan(initialGiftBal);

    await manageClientBookingAction({
      token: withGift.manageToken,
      action: 'cancel',
      reason: 'Cancelada por clienta',
    });
    expect(
      getSnapshot().coupons.find((c) => c.code === 'GIFT500')?.remainingBalanceCents,
    ).toBe(initialGiftBal);
    expect(getSnapshot().coupons.find((c) => c.code === 'GIFT500')?.usedCount).toBe(0);
  });

  it('D3: selects an actually free eligible specialist (and prefers least busy) when staffId is null', async () => {
    const db = getSnapshot();
    const today = getDateKeyInTimezone(new Date(), db.settings.timezone);

    const karlaAvail = queryAvailability({
      serviceId: 'srv-gel-semipermanente-manos',
      addonIds: [],
      staffId: 'staff-karla',
      startDate: today,
      days: 14,
    });
    const patyAvail = queryAvailability({
      serviceId: 'srv-gel-semipermanente-manos',
      addonIds: [],
      staffId: 'staff-paty',
      startDate: today,
      days: 14,
    });

    const patyDayMap = new Map(patyAvail.days.map((d) => [d.date, d]));
    const cleanSharedDay = karlaAvail.days.find((kd) => {
      const pd = patyDayMap.get(kd.date);
      return kd.date > today && kd.slots.length >= 3 && pd && pd.slots.length >= 3;
    });
    if (!cleanSharedDay || cleanSharedDay.slots.length < 3) {
      throw new Error('Expected clean shared day with 3 fixed blocks for Karla and Paty');
    }

    const slotMorning = cleanSharedDay.slots[0];
    const slotMidday = cleanSharedDay.slots[1];
    const slotEvening = cleanSharedDay.slots[2];
    if (!slotMorning || !slotMidday || !slotEvening) {
      throw new Error('Expected three fixed slots on clean shared day');
    }

    await createBookingAtomic({
      serviceId: 'srv-gel-semipermanente-manos',
      addonIds: [],
      staffId: 'staff-karla',
      startAt: slotMorning.startAt,
      clientName: 'Ocupa Karla',
      clientPhone: '+525544556601',
    });

    const autoFree = await createBookingAtomic({
      serviceId: 'srv-gel-semipermanente-manos',
      addonIds: [],
      staffId: null,
      startAt: slotMorning.startAt,
      clientName: 'Cualquiera Libre',
      clientPhone: '+525544556602',
    });
    expect(autoFree.staffId).toBe('staff-paty');

    await createBookingAtomic({
      serviceId: 'srv-gel-semipermanente-manos',
      addonIds: [],
      staffId: 'staff-karla',
      startAt: slotMidday.startAt,
      clientName: 'Extra Karla',
      clientPhone: '+525544556603',
    });

    const leastBusyPick = await createBookingAtomic({
      serviceId: 'srv-gel-semipermanente-manos',
      addonIds: [],
      staffId: null,
      startAt: slotEvening.startAt,
      clientName: 'Menor Carga',
      clientPhone: '+525544556604',
    });
    expect(leastBusyPick.staffId).toBe('staff-paty');
  });

  it('Phase 2: supports multi-service booking, @instagram persistence, custom overrides, manual reminders, clients & onboarding', async () => {
    const db = getSnapshot();
    const today = getDateKeyInTimezone(new Date(), db.settings.timezone);

    const multiAvail = queryAvailability({
      serviceId: 'srv-unas-acrilicas',
      extraServiceIds: ['srv-retiro'],
      addonIds: [],
      staffId: 'staff-karla',
      startDate: today,
      days: 14,
    });
    expect(multiAvail.totals.totalDurationMinutes).toBe(180);
    expect(multiAvail.totals.subtotalCents).toBe(53000);
    expect(multiAvail.extraServices.map((s) => s.id)).toEqual(['srv-retiro']);

    const openSlot = multiAvail.days.find((d) => d.date > today && d.slots.length > 0)?.slots[0];
    if (!openSlot) throw new Error('Expected multi-service slot for Karla');

    const created = await createBookingAtomic({
      serviceId: 'srv-unas-acrilicas',
      extraServiceIds: ['srv-retiro'],
      addonIds: [],
      staffId: openSlot.staffId,
      startAt: openSlot.startAt,
      clientName: 'Valeria Puebla',
      clientPhone: '+522229998877',
      clientEmail: 'valeria.puebla@ejemplo.mx',
      clientInstagram: 'https://instagram.com/Valeria.Nails_Pue/',
      proofDeliveryMethod: 'instagram_dm',
    });

    expect(created.extraServiceIds).toEqual(['srv-retiro']);
    expect(created.totalDurationMinutes).toBe(180);
    expect(created.subtotalCents).toBe(53000);
    expect(created.depositAmountCents).toBe(20000);
    expect(created.clientInstagram).toBe('@valeria.nails_pue');
    expect(created.client.instagramHandle).toBe('@valeria.nails_pue');
    expect(created.proofDeliveryMethod).toBe('instagram_dm');

    const reminder = await sendManualBookingReminder({
      bookingId: created.id,
      channel: 'both',
    });
    expect(reminder.ok).toBe(true);
    expect(reminder.waMeUrl).toContain('https://wa.me/522229998877');
    expect(reminder.messagePreview).toContain('LAIKONA NAILS');
    expect(reminder.logs).toHaveLength(2);

    const clientCreated = await createClientProfile({
      fullName: 'Daniela Ortiz',
      phone: '2223334455',
      email: 'daniela@ejemplo.mx',
      instagramHandle: 'daniela.pue',
      notes: 'Cutícula seca',
    });
    expect(clientCreated.instagramHandle).toBe('@daniela.pue');
    expect(clientCreated.notes).toBe('Cutícula seca');

    await expect(
      createClientProfile({
        fullName: 'Duplicada',
        phone: '+522223334455',
      }),
    ).rejects.toMatchObject({ code: 'CLIENT_EXISTS' });

    const updatedClient = await updateClientNotes({
      clientId: clientCreated.id,
      instagramHandle: '@daniela.nails.mx',
      notes: 'Prefiere Cherry Red',
    });
    expect(updatedClient.instagramHandle).toBe('@daniela.nails.mx');

    const onboarding = await saveOnboardingSetup({
      businessType: 'Salón de Manicure y Uñas',
      teamSizeTier: '3 a 5',
      salonName: 'LAIKONA NAILS Puebla',
      serviceMode: 'studio',
      address: 'Puebla Centro',
      soundAlertsEnabled: true,
      onboardingCompleted: true,
      starterService: {
        name: 'Diseño Editorial Cherry',
        priceCents: 48000,
        durationMinutes: 120,
        isStartingPrice: true,
      },
    });
    expect(onboarding.settings.onboardingCompleted).toBe(true);
    expect(onboarding.settings.name).toBe('LAIKONA NAILS Puebla');
    expect(onboarding.starterService?.isStartingPrice).toBe(true);
  });

  it('invalidates in-memory cache and re-seeds cleanly when the demo DB file is deleted from disk', async () => {
    const initial = getSnapshot();
    expect(initial.settings.name).toBe('LAIKONA NAILS');
    expect(fs.existsSync(TEMP_DB_PATH)).toBe(true);

    await saveOnboardingSetup({
      salonName: 'Temporarily Mutated Salon',
      onboardingCompleted: true,
    });
    expect(getSnapshot().settings.name).toBe('Temporarily Mutated Salon');

    fs.unlinkSync(TEMP_DB_PATH);
    expect(fs.existsSync(TEMP_DB_PATH)).toBe(false);

    const reseeded = getSnapshot();
    expect(reseeded.settings.name).toBe('LAIKONA NAILS');
    expect(reseeded.settings.onboardingCompleted).toBe(false);
    expect(reseeded.staff.some((s) => s.id === 'staff-karla')).toBe(true);
    expect(reseeded.services.some((s) => s.id === 'srv-rubber')).toBe(true);
    expect(fs.existsSync(TEMP_DB_PATH)).toBe(true);
  });

  it('Property: /cita/[token] cancel/reschedule inside minimum notice window throws PolicyError without mutating booking', async () => {
    const db = getSnapshot();
    const minWindowHours = Math.min(
      db.settings.minCancelHours,
      db.settings.minRescheduleHours,
    );
    const service = db.services[0];
    const staff = db.staff[0];
    const client = db.clients[0];
    if (!service || !staff || !client) throw new Error('Missing seed data');

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 5, max: Math.max(10, minWindowHours * 60 - 15) }),
        fc.constantFrom<'cancel' | 'reschedule'>('cancel', 'reschedule'),
        async (minutesFromNow, action) => {
          const token = `prop-policy-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
          const startAt = new Date(Date.now() + minutesFromNow * 60_000).toISOString();
          const endAt = new Date(Date.now() + (minutesFromNow + 60) * 60_000).toISOString();
          const updatedAt = new Date().toISOString();

          const liveDb = getSnapshot();
          liveDb.bookings.push({
            id: `bk-${token}`,
            bookingCode: `NL-${token.slice(-4).toUpperCase()}`,
            manageToken: token,
            idempotencyKey: null,
            serviceId: service.id,
            staffId: staff.id,
            clientId: client.id,
            startAt,
            endAt,
            occupiedStartAt: startAt,
            occupiedEndAt: endAt,
            totalDurationMinutes: 60,
            subtotalCents: service.priceCents,
            discountCents: 0,
            totalPriceCents: service.priceCents,
            depositAmountCents: 0,
            couponCode: null,
            status: 'confirmed',
            source: 'web',
            clientNotes: '',
            internalNotes: '',
            inspoPhotoUrl: null,
            paymentProofUrl: null,
            googleEventId: null,
            cancellationReason: null,
            rescheduledFromId: null,
            addons: [],
            createdAt: updatedAt,
            updatedAt,
          });

          try {
            let caught: unknown = null;
            try {
              await manageClientBookingAction({
                token,
                action,
                newStartAt: new Date(Date.now() + 72 * 3_600_000).toISOString(),
                reason: 'Cambio de último minuto',
              });
            } catch (err) {
              caught = err;
            }

            expect(caught).toBeInstanceOf(PolicyError);
            expect((caught as PolicyError).code).toBe('POLICY_WINDOW');

            const after = getBookingByToken(token);
            expect(after?.status).toBe('confirmed');
            expect(after?.startAt).toBe(startAt);
            expect(after?.endAt).toBe(endAt);
            expect(after?.updatedAt).toBe(updatedAt);
          } finally {
            liveDb.bookings = liveDb.bookings.filter((b) => b.manageToken !== token);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  it('Phase 3A (D4/D5): enforces single-use coupon per client, gift card redemption balance, recurring block reschedule guard, and salon alerts', async () => {
    const db = getSnapshot();
    const tz = db.settings.timezone;
    const today = getDateKeyInTimezone(new Date(), tz);
    const avail = queryAvailability({
      serviceId: 'srv-rubber',
      addonIds: [],
      staffId: 'staff-tere',
      startDate: today,
      days: 14,
    });
    const farSlots = avail.days
      .flatMap((d) => d.slots)
      .filter((s) => new Date(s.startAt).getTime() - Date.now() > 48 * 3_600_000);
    const slot1 = farSlots[0];
    const slot2 = farSlots[1];
    const slot3 = farSlots[farSlots.length - 1];
    if (!slot1 || !slot2 || !slot3) {
      throw new Error('Expected three far future slots for Tere');
    }

    const firstBooking = await createBookingAtomic({
      serviceId: 'srv-rubber',
      addonIds: [],
      staffId: slot1.staffId,
      startAt: slot1.startAt,
      clientName: 'Clienta Cupon Unico',
      clientPhone: '+522229010001',
      couponCode: 'BIENVENIDA10',
      privacyConsentAccepted: true,
      marketingOptIn: true,
    });

    const dupCheck = validateCouponCode('BIENVENIDA10', 35000, firstBooking.clientId);
    expect(dupCheck.valid).toBe(false);

    await expect(
      createBookingAtomic({
        serviceId: 'srv-rubber',
        addonIds: [],
        staffId: slot2.staffId,
        startAt: slot2.startAt,
        clientName: 'Clienta Cupon Unico',
        clientPhone: '+522229010001',
        couponCode: 'BIENVENIDA10',
      }),
    ).rejects.toMatchObject({ code: 'COUPON_INVALID' });

    const blockDateKey = getDateKeyInTimezone(new Date(slot2.startAt), tz);
    const blockWeekday = new Date(`${blockDateKey}T12:00:00Z`).getUTCDay();
    const createdBlock = await upsertRecurringBlock({
      staffId: slot2.staffId,
      reason: 'Bloqueo test D4',
      frequency: 'weekly',
      weekdays: [blockWeekday],
      dayOfMonth: null,
      startTime: '08:00',
      endTime: '22:00',
      untilDate: null,
      isActive: true,
    });

    await expect(
      manageClientBookingAction({
        token: firstBooking.manageToken,
        action: 'reschedule',
        newStartAt: slot2.startAt,
        newStaffId: slot2.staffId,
      }),
    ).rejects.toBeInstanceOf(SlotConflictError);

    await expect(
      manageClientBookingAction({
        token: firstBooking.manageToken,
        action: 'reschedule',
        newStartAt: slot2.startAt,
        newStaffId: 'staff-nonexistent',
      }),
    ).rejects.toMatchObject({ code: 'STAFF_INELIGIBLE' });

    await toggleRecurringBlock(createdBlock.id, false);
    const notifsBeforeResched = getSnapshot().notifications.length;
    const rescheduled = await manageClientBookingAction({
      token: firstBooking.manageToken,
      action: 'reschedule',
      newStartAt: slot2.startAt,
      newStaffId: slot2.staffId,
    });
    expect(rescheduled.startAt).toBe(slot2.startAt);
    const reschedNotifs = getSnapshot().notifications.slice(
      0,
      getSnapshot().notifications.length - notifsBeforeResched,
    );
    expect(
      reschedNotifs.some((n) => n.subject.includes('Aviso al estudio: cita reagendada')),
    ).toBe(true);

    await deleteRecurringBlock(createdBlock.id);

    const notifsBeforeCancel = getSnapshot().notifications.length;
    await manageClientBookingAction({
      token: firstBooking.manageToken,
      action: 'cancel',
      reason: 'Cambio de planes',
    });
    const cancelNotifs = getSnapshot().notifications.slice(
      0,
      getSnapshot().notifications.length - notifsBeforeCancel,
    );
    expect(
      cancelNotifs.some((n) => n.subject.includes('Aviso al estudio: cita cancelada')),
    ).toBe(true);

    const releasedRedemption = (getSnapshot().couponRedemptions ?? []).find(
      (r) => r.bookingId === firstBooking.id,
    );
    expect(releasedRedemption?.status).toBe('released');
    expect(releasedRedemption?.releasedAt).toBeTruthy();

    const reusedBooking = await createBookingAtomic({
      serviceId: 'srv-rubber',
      addonIds: [],
      staffId: slot3.staffId,
      startAt: slot3.startAt,
      clientName: 'Clienta Cupon Unico',
      clientPhone: '+522229010001',
      couponCode: 'BIENVENIDA10',
    });
    expect(reusedBooking.couponCode).toBe('BIENVENIDA10');
    expect(reusedBooking.discountCents).toBe(3500);
  });

  it('Phase 3A (N1/N3/N4/S8/N6/N7): quickSearch, split checkout + retail, loyalty stamp max 1/day, ARCO export, inactive filter, and past lock', async () => {
    const db = getSnapshot();
    const tz = db.settings.timezone;
    const today = getDateKeyInTimezone(new Date(), tz);

    const quick = quickSearchAvailability({
      serviceId: 'srv-rubber',
      extraServiceIds: ['srv-retiro'],
      addonIds: [],
      startDate: today,
      days: 14,
      limit: 6,
    });
    expect(quick.slots.length).toBeGreaterThan(0);
    expect(quick.slots.length).toBeLessThanOrEqual(6);
    expect(quick.totals.totalDurationMinutes).toBe(150);

    const ownerActor = {
      id: 'adm-owner',
      email: 'duena@nails.studio',
      role: 'owner' as const,
      fullName: 'Karla Rodríguez (Dueña)',
    };
    const adminActor = {
      id: 'adm-frontdesk',
      email: 'recepcion@nails.studio',
      role: 'admin' as const,
      fullName: 'Recepción',
    };

    await expect(
      recordBookingCheckoutAtomic({
        bookingId: 'bk-1005',
        splits: [{ method: 'cash', amountCents: 45000 }],
        actor: adminActor,
      }),
    ).rejects.toMatchObject({ code: 'PAST_BOOKING_LOCKED' });

    const invBefore = getSnapshot().inventory.find((i) => i.id === 'inv-3')?.stockQuantity ?? 0;
    const checkout = await recordBookingCheckoutAtomic({
      bookingId: 'bk-1005',
      splits: [
        { method: 'cash', amountCents: 39000, tipCents: 3000, tipStaffId: 'staff-tere' },
        { method: 'card', amountCents: 30000, reference: 'TERM-P3A' },
      ],
      extraItem: { inventoryItemId: 'inv-3', quantity: 1 },
      markCompleted: true,
      actor: ownerActor,
    });
    expect(checkout.summary.totalPriceCents).toBe(69000);
    expect(checkout.summary.paidCents).toBe(69000);
    expect(checkout.summary.isFullyPaid).toBe(true);
    expect(checkout.summary.isUncollected).toBe(false);
    expect(checkout.summary.totalTipsCents).toBe(3000);
    expect(checkout.splits).toHaveLength(2);
    expect(checkout.stampAwarded?.clientId).toBe('client-andrea');
    expect(getSnapshot().inventory.find((i) => i.id === 'inv-3')?.stockQuantity).toBe(
      invBefore - 1,
    );
    const bk1005CashEntries = getSnapshot().cashEntries.filter((c) => c.bookingId === 'bk-1005');
    const patyCashEntries = bk1005CashEntries.filter((c) => c.staffId === 'staff-paty');
    const tereTipEntry = bk1005CashEntries.find((c) => c.staffId === 'staff-tere');
    expect(patyCashEntries.reduce((sum, e) => sum + e.amountCents, 0)).toBe(69000);
    expect(patyCashEntries.every((e) => e.commissionCents > 0 && e.tipCents === 0)).toBe(true);
    expect(tereTipEntry?.amountCents).toBe(0);
    expect(tereTipEntry?.tipCents).toBe(3000);
    expect(tereTipEntry?.commissionCents).toBe(0);
    expect(
      (getSnapshot().auditLogs ?? []).some(
        (a) => a.action === 'past_booking_override' && a.entityId === 'bk-1005',
      ),
    ).toBe(true);

    const stampsCountAfterFirst = (getSnapshot().loyaltyStamps ?? []).filter(
      (s) => s.clientId === 'client-andrea',
    ).length;
    await updateBookingStatus({
      bookingId: 'bk-1003',
      status: 'confirmed',
      actor: ownerActor,
    });
    await updateBookingStatus({
      bookingId: 'bk-1003',
      status: 'completed',
      actor: ownerActor,
    });
    const stampsCountAfterSecondSameDay = (getSnapshot().loyaltyStamps ?? []).filter(
      (s) => s.clientId === 'client-andrea',
    ).length;
    expect(stampsCountAfterSecondSameDay).toBe(stampsCountAfterFirst);

    const sofiaSummary = getClientLoyaltySummary('client-sofia');
    expect(sofiaSummary?.currentStamps).toBe(6);
    expect(sofiaSummary?.isNearReward).toBe(true);
    expect(getNearRewardClients().some((c) => c.clientId === 'client-sofia')).toBe(true);

    const updatedProgram = await upsertLoyaltyProgram({
      name: 'Club LAIKONA VIP',
      stampsRequired: 6,
    });
    expect(updatedProgram.stampsRequired).toBe(6);
    expect(getClientLoyaltySummary('client-sofia')?.isRewardReady).toBe(true);

    await recordBookingCheckoutAtomic({
      bookingId: 'bk-1001',
      splits: [{ method: 'card', amountCents: 23000 }],
      markCompleted: false,
      redeemLoyaltyReward: true,
      actor: ownerActor,
    });
    const sofiaAfterRedeem = getClientLoyaltySummary('client-sofia');
    expect(sofiaAfterRedeem?.totalStamps).toBe(0);
    expect(sofiaAfterRedeem?.isRewardReady).toBe(false);
    const redeemAudit = (getSnapshot().auditLogs ?? []).find(
      (a) => a.action === 'loyalty_redeemed' && a.entityId === 'client-sofia',
    );
    expect(redeemAudit?.metadata.stampsConsumed).toBe(6);

    await expect(
      recordBookingCheckoutAtomic({
        bookingId: 'bk-1001',
        splits: [{ method: 'cash', amountCents: 23000 }],
        markCompleted: false,
        redeemLoyaltyReward: true,
        actor: ownerActor,
      }),
    ).rejects.toMatchObject({ code: 'LOYALTY_NOT_READY' });

    const arco = getClientArcoExport('client-sofia');
    expect(arco?.client.id).toBe('client-sofia');
    expect(arco?.bookings.length).toBeGreaterThan(0);
    expect(arco?.consents.length).toBeGreaterThan(0);
    expect(arco?.loyaltySummary?.programName).toBe('Club LAIKONA VIP');

    const liveDb = getSnapshot();
    const oldBooking = liveDb.bookings.find((b) => b.id === 'bk-1000');
    if (oldBooking) {
      const oldIso = new Date(Date.now() - 60 * 86_400_000).toISOString();
      oldBooking.startAt = oldIso;
      oldBooking.endAt = oldIso;
    }
    const inactive = getInactiveClients(30);
    expect(inactive.some((c) => c.clientId === 'client-paula')).toBe(true);
    expect(inactive.some((c) => c.clientId === 'client-sofia')).toBe(false);
  });

  it('Phase 3A+ (C1/C6/C7/C9): MAX_ACTIVE_BOOKINGS recovery scoped to phone, request_reschedule, override ranges + MX holidays idempotency, and private VIP services', async () => {
    const db = getSnapshot();
    const tz = db.settings.timezone;
    const today = getDateKeyInTimezone(new Date(), tz);
    await updateSalonSettings({ maxActiveBookingsPerClient: 1, optimizeContinuousSlots: true });
    expect(getSnapshot().settings.optimizeContinuousSlots).toBe(true);

    const slots = queryAvailability({
      serviceId: 'srv-rubber',
      addonIds: [],
      staffId: 'staff-tere',
      startDate: today,
      days: 14,
    }).days.flatMap((d) => d.slots);
    const slot1 = slots[0];
    const slot2 = slots[1];
    const slot3 = slots[2];
    if (!slot1 || !slot2 || !slot3) throw new Error('Expected three open slots');

    const ownActive = await createBookingAtomic({
      serviceId: 'srv-rubber',
      addonIds: [],
      staffId: slot1.staffId,
      startAt: slot1.startAt,
      clientName: 'Clienta C6',
      clientPhone: '+522229330001',
      privacyConsentAccepted: true,
      enforceMaxActiveBookings: true,
    });

    await createBookingAtomic({
      serviceId: 'srv-rubber',
      addonIds: [],
      staffId: slot2.staffId,
      startAt: slot2.startAt,
      clientName: 'Otra Clienta C6',
      clientPhone: '+522229330002',
      privacyConsentAccepted: true,
      enforceMaxActiveBookings: true,
    });

    let caughtMax: unknown = null;
    try {
      await createBookingAtomic({
        serviceId: 'srv-rubber',
        addonIds: [],
        staffId: slot3.staffId,
        startAt: slot3.startAt,
        clientName: 'Clienta C6',
        clientPhone: '+522229330001',
        privacyConsentAccepted: true,
        enforceMaxActiveBookings: true,
      });
    } catch (err) {
      caughtMax = err;
    }
    expect(caughtMax).toBeInstanceOf(MaxActiveBookingsError);
    expect(caughtMax).toBeInstanceOf(PolicyError);
    const recoveryErr = caughtMax as MaxActiveBookingsError;
    expect(recoveryErr.code).toBe('MAX_ACTIVE_BOOKINGS');
    expect(recoveryErr.activeBookings).toHaveLength(1);
    expect(recoveryErr.activeBookings[0]?.bookingCode).toBe(ownActive.bookingCode);
    expect(recoveryErr.activeBookings[0]?.manageUrl).toBe(`/cita/${ownActive.manageToken}`);

    const ownerActor = {
      id: 'adm-owner',
      email: 'duena@nails.studio',
      role: 'owner' as const,
      fullName: 'Karla Rodríguez (Dueña)',
    };
    const adminActor = {
      id: 'adm-frontdesk',
      email: 'recepcion@nails.studio',
      role: 'admin' as const,
      fullName: 'Recepción',
    };
    const reqResched = await requestBookingReschedule({
      bookingId: ownActive.id,
      note: 'Tuvimos un ajuste de horario.',
      actor: ownerActor,
    });
    expect(reqResched.ok).toBe(true);
    expect(reqResched.rescheduleUrl).toContain(`/cita/${ownActive.manageToken}?action=reschedule`);
    expect(reqResched.waMeUrl).toContain('https://wa.me/522229330001');
    expect(reqResched.messagePreview).toContain('Tuvimos un ajuste de horario.');

    await expect(
      requestBookingReschedule({
        bookingId: 'bk-1005',
        actor: adminActor,
      }),
    ).rejects.toMatchObject({ code: 'PAST_BOOKING_LOCKED' });

    await expect(
      addDateOverride({
        staffId: 'staff-karla',
        overrideDate: '2027-06-10',
        isUnavailable: true,
        startTime: null,
        endTime: null,
        reason: 'Auto redirect test',
        redirectStaffId: 'staff-karla',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_REDIRECT_STAFF' });

    const rangeCreated = await addDateOverrideRange({
      staffId: 'staff-karla',
      startDate: '2027-07-01',
      endDate: '2027-07-03',
      isUnavailable: true,
      startTime: null,
      endTime: null,
      reason: 'Vacaciones verano',
      publicNote: 'Karla de vacaciones — agenda con Paty',
      redirectStaffId: 'staff-paty',
    });
    expect(rangeCreated).toHaveLength(3);
    expect(rangeCreated.every((o) => o.redirectStaffId === 'staff-paty')).toBe(true);
    expect(rangeCreated[0]?.publicNote).toBe('Karla de vacaciones — agenda con Paty');

    const futureYear = Number(today.slice(0, 4)) + 1;
    const holidaysFirst = await preloadMexicoHolidays({
      year: futureYear,
      staffId: 'staff-karla',
      redirectStaffId: 'staff-tere',
    });
    expect(holidaysFirst.created).toHaveLength(7);
    expect(holidaysFirst.skippedDates).toHaveLength(0);

    const holidaysSecond = await preloadMexicoHolidays({
      year: futureYear,
      staffId: 'staff-karla',
      redirectStaffId: 'staff-tere',
    });
    expect(holidaysSecond.created).toHaveLength(0);
    expect(holidaysSecond.skippedDates).toHaveLength(7);

    const vipService = await upsertService({
      name: 'Set Novia VIP Privado',
      durationMinutes: 120,
      priceCents: 95000,
      isPrivate: true,
    });
    expect(vipService.isPrivate).toBe(true);

    const bootstrap = await getRepository().getPublicBootstrap();
    expect(bootstrap.services.some((s) => s.id === vipService.id)).toBe(false);
    expect(bootstrap.settings.optimizeContinuousSlots).toBe(true);
  });

  it('Phase 3B (Opción B / N5 / U3): handles idempotent Mercado Pago deposit confirmation, N5 WhatsApp cascade skip, and U3 waitlist 10-min priority offer on cancel', async () => {
    const db = getSnapshot();
    const tz = db.settings.timezone;
    const today = getDateKeyInTimezone(new Date(), tz);

    const mpFirst = await confirmBookingDepositFromWebhook({
      provider: 'mercadopago',
      providerPaymentId: 'mp-pay-9001',
      bookingReference: 'NL-1044',
      amountCents: 20000,
      currency: 'MXN',
    });
    expect(mpFirst).toEqual({
      status: 'ok',
      idempotent: false,
      bookingId: 'bk-1003',
    });

    const afterFirst = getSnapshot();
    const bk1003 = afterFirst.bookings.find((b) => b.id === 'bk-1003');
    expect(bk1003?.status).toBe('confirmed');
    expect(bk1003?.confirmedVia).toBe('payment');
    const splitsAfterFirst = (afterFirst.paymentSplits ?? []).filter(
      (s) => s.bookingId === 'bk-1003',
    );
    const cashAfterFirst = afterFirst.cashEntries.filter((c) => c.bookingId === 'bk-1003');
    const paymentsAfterFirst = (afterFirst.bookingPayments ?? []).filter(
      (p) => p.bookingId === 'bk-1003',
    );
    const auditsAfterFirst = (afterFirst.auditLogs ?? []).filter(
      (a) => a.entityId === 'bk-1003' && a.action === 'deposit_approved',
    );
    expect(splitsAfterFirst).toHaveLength(1);
    expect(splitsAfterFirst[0]?.method).toBe('online');
    expect(splitsAfterFirst[0]?.amountCents).toBe(20000);
    expect(cashAfterFirst).toHaveLength(1);
    expect(cashAfterFirst[0]?.entryType).toBe('deposit');
    expect(paymentsAfterFirst).toHaveLength(1);
    expect(auditsAfterFirst).toHaveLength(1);

    const mpReplay = await confirmBookingDepositFromWebhook({
      provider: 'mercadopago',
      providerPaymentId: 'mp-pay-9001',
      bookingReference: 'NL-1044',
      amountCents: 20000,
      currency: 'MXN',
    });
    expect(mpReplay).toEqual({
      status: 'ok',
      idempotent: true,
      bookingId: 'bk-1003',
    });

    const afterReplay = getSnapshot();
    expect(
      (afterReplay.paymentSplits ?? []).filter((s) => s.bookingId === 'bk-1003'),
    ).toHaveLength(1);
    expect(afterReplay.cashEntries.filter((c) => c.bookingId === 'bk-1003')).toHaveLength(1);
    expect(
      (afterReplay.bookingPayments ?? []).filter((p) => p.bookingId === 'bk-1003'),
    ).toHaveLength(1);
    expect(
      (afterReplay.auditLogs ?? []).filter(
        (a) => a.entityId === 'bk-1003' && a.action === 'deposit_approved',
      ),
    ).toHaveLength(1);

    const pastIso = new Date(Date.now() - 60_000).toISOString();
    const liveDb = getSnapshot();
    const bk1001 = liveDb.bookings.find((b) => b.id === 'bk-1001');
    if (!bk1001) throw new Error('Expected bk-1001');
    bk1001.confirmedVia = 'email';
    liveDb.notifications.unshift(
      {
        id: 'ntf-cascade-wa-skip',
        bookingId: 'bk-1001',
        workflowId: 'wf-24h',
        channel: 'whatsapp',
        recipient: '+522224123987',
        scheduledFor: pastIso,
        status: 'pending',
        subject: 'Recordatorio 24h WA',
        previewText: 'Cascade WA test',
        providerMessageId: null,
        errorMessage: null,
        sentAt: null,
        createdAt: pastIso,
      },
      {
        id: 'ntf-cascade-email-send',
        bookingId: 'bk-1001',
        workflowId: 'wf-24h',
        channel: 'email',
        recipient: 'sofia.ramirez@ejemplo.mx',
        scheduledFor: pastIso,
        status: 'pending',
        subject: 'Recordatorio 24h Email',
        previewText: 'Cascade Email test',
        providerMessageId: null,
        errorMessage: null,
        sentAt: null,
        createdAt: pastIso,
      },
    );

    const dispatchedIds: string[] = [];
    const cronSummary = await processDueScheduledNotifications(async ({ notification }) => {
      dispatchedIds.push(notification.id);
      return {
        status: 'sent',
        providerMessageId: `mock-${notification.id}`,
        errorMessage: null,
      };
    });
    expect(cronSummary.skippedCount).toBe(1);
    expect(cronSummary.sentCount).toBe(1);
    expect(dispatchedIds).toEqual(['ntf-cascade-email-send']);

    const skippedLog = getSnapshot().notifications.find((n) => n.id === 'ntf-cascade-wa-skip');
    expect(skippedLog?.status).toBe('canceled');
    expect(skippedLog?.errorMessage).toBe('skipped_cascade');

    const farSlot = queryAvailability({
      serviceId: 'srv-rubber',
      addonIds: [],
      staffId: 'staff-tere',
      startDate: today,
      days: 14,
    })
      .days.flatMap((d) => d.slots)
      .find((s) => new Date(s.startAt).getTime() - Date.now() > 48 * 3_600_000);
    if (!farSlot) throw new Error('Expected far open slot for Tere');

    const cancelBooking = await createBookingAtomic({
      serviceId: 'srv-rubber',
      addonIds: [],
      staffId: farSlot.staffId,
      startAt: farSlot.startAt,
      clientName: 'Clienta Cancela U3',
      clientPhone: '+522229440001',
    });

    const bookingDateKey = getDateKeyInTimezone(new Date(cancelBooking.startAt), tz);
    const firstWaiter = await addWaitlistEntry({
      serviceId: 'srv-rubber',
      preferredStaffId: 'staff-tere',
      desiredDate: bookingDateKey,
      preferredWindow: 'any',
      clientName: 'Primera en Fila U3',
      clientPhoneE164: '+522229440010',
      clientEmail: 'primera@ejemplo.mx',
      notes: 'Prioridad 1',
    });
    const secondWaiter = await addWaitlistEntry({
      serviceId: 'srv-rubber',
      preferredStaffId: 'staff-tere',
      desiredDate: bookingDateKey,
      preferredWindow: 'any',
      clientName: 'Segunda en Fila U3',
      clientPhoneE164: '+522229440011',
      clientEmail: 'segunda@ejemplo.mx',
      notes: 'Prioridad 2',
    });

    const dbForOrder = getSnapshot();
    const w1 = dbForOrder.waitlist.find((w) => w.id === firstWaiter.id);
    const w2 = dbForOrder.waitlist.find((w) => w.id === secondWaiter.id);
    if (w1 && w2) {
      w1.createdAt = new Date(Date.now() - 120_000).toISOString();
      w2.createdAt = new Date(Date.now() - 60_000).toISOString();
    }

    const beforeCancelMs = Date.now();
    await manageClientBookingAction({
      token: cancelBooking.manageToken,
      action: 'cancel',
      reason: 'Cambio de planes',
    });

    const afterCancelDb = getSnapshot();
    const updatedFirst = afterCancelDb.waitlist.find((w) => w.id === firstWaiter.id);
    const updatedSecond = afterCancelDb.waitlist.find((w) => w.id === secondWaiter.id);
    expect(updatedFirst?.status).toBe('notified');
    expect(updatedFirst?.priorityOfferToken).toBeTruthy();
    expect(updatedFirst?.priorityOfferSlotStartAt).toBe(cancelBooking.startAt);
    expect(updatedFirst?.priorityOfferExpiresAt).toBeTruthy();
    const expiresDeltaMin =
      (new Date(updatedFirst?.priorityOfferExpiresAt ?? 0).getTime() - beforeCancelMs) /
      60_000;
    expect(expiresDeltaMin).toBeGreaterThan(9);
    expect(expiresDeltaMin).toBeLessThan(11.5);
    expect(updatedSecond?.status).toBe('waiting');

    const offerLog = afterCancelDb.notifications.find(
      (n) =>
        n.recipient === firstWaiter.clientPhoneE164 &&
        n.subject.includes('Oferta prioritaria lista de espera'),
    );
    expect(offerLog).toBeDefined();
    expect(offerLog?.previewText).toContain('/reservar/');
    expect(offerLog?.previewText).toContain(updatedFirst?.priorityOfferToken ?? '');
  });

  it('Wave 2 (U1/U2/U4/U5/U6/N7): enforces no-show deposit policy, recurring series partial conflicts, packages ledger, portal snapshot isolation, Owner PIN gates, and rate limiting', async () => {
    resetRateLimiterForTests();
    const db = getSnapshot();
    const tz = db.settings.timezone;
    const today = getDateKeyInTimezone(new Date(), tz);

    const flaggedStatus = getClientNoShowPolicyStatus('+522227711223');
    expect(flaggedStatus.requiresMandatoryDeposit).toBe(true);
    expect(flaggedStatus.isFlagged).toBe(true);
    expect(flaggedStatus.noShowCount).toBe(2);

    const ownerUserEarly = getSnapshot().adminUsers.find((u) => u.role === 'owner');
    if (!ownerUserEarly) throw new Error('Expected seeded owner');
    const ownerTokenEarly = createAdminSessionToken(ownerUserEarly);
    if (!ownerTokenEarly) throw new Error('Expected owner token');
    const earlyCampRes = await getAdminCampaigns(
      new NextRequest('http://localhost:3000/api/admin/campaigns', {
        headers: { cookie: `${ADMIN_SESSION_COOKIE}=${ownerTokenEarly}` },
      }),
    );
    expect(earlyCampRes.status).toBe(200);
    const earlyCampJson = (await earlyCampRes.json()) as {
      birthdays: Array<{ clientId: string }>;
      reactivation: Array<{ clientId: string }>;
    };
    expect(earlyCampJson.birthdays.some((c) => c.clientId === 'client-sofia')).toBe(true);
    expect(earlyCampJson.reactivation.some((c) => c.clientId === 'client-valeria')).toBe(
      true,
    );

    const retiroAvail = queryAvailability({
      serviceId: 'srv-retiro',
      addonIds: [],
      staffId: 'staff-tere',
      startDate: today,
      days: 14,
    });
    const retiroSlot = retiroAvail.days.flatMap((d) => d.slots)[0];
    if (!retiroSlot) throw new Error('Expected open retiro slot');

    const flaggedBooking = await createBookingAtomic({
      serviceId: 'srv-retiro',
      addonIds: [],
      staffId: retiroSlot.staffId,
      startAt: retiroSlot.startAt,
      clientName: 'Valeria Mendoza',
      clientPhone: '+522227711223',
      source: 'web',
      forceConfirmed: false,
      privacyConsentAccepted: true,
    });
    expect(flaggedBooking.depositAmountCents).toBeGreaterThan(0);
    expect(flaggedBooking.status).toBe('pending_confirmation');
    expect(flaggedBooking.noShowPolicyEnforced).toBe(true);

    const recurSlots = queryAvailability({
      serviceId: 'srv-gel-semipermanente-manos',
      addonIds: [],
      staffId: 'staff-karla',
      startDate: today,
      days: 14,
    }).days.flatMap((d) => d.slots);
    const seriesStartSlot = recurSlots[0];
    if (!seriesStartSlot) throw new Error('Expected open slot for recurrence');

    const secondDateKey = getDateKeyInTimezone(
      new Date(new Date(seriesStartSlot.startAt).getTime() + 14 * 86_400_000),
      tz,
    );
    await addDateOverride({
      staffId: 'staff-karla',
      overrideDate: secondDateKey,
      isUnavailable: true,
      startTime: null,
      endTime: null,
      reason: 'Bloqueo parcial para prueba de serie',
    });

    const series = await createRecurringBookingSeries({
      serviceId: 'srv-gel-semipermanente-manos',
      addonIds: [],
      staffId: 'staff-karla',
      startAt: seriesStartSlot.startAt,
      clientName: 'Clienta Serie',
      clientPhone: '+522229551100',
      source: 'manual',
      forceConfirmed: true,
      recurrence: { intervalWeeks: 2, count: 3 },
    });
    expect(series.created.length).toBe(2);
    expect(series.skippedConflicts).toHaveLength(1);
    expect(series.skippedConflicts[0]?.dateKey).toBe(secondDateKey);
    expect(series.created.every((b) => b.recurrenceSeriesId === series.seriesId)).toBe(
      true,
    );

    const portalSofia = getClientPortalSnapshotByPhone('+522224123987');
    expect(portalSofia.clientId).toBe('client-sofia');
    expect(portalSofia.bookings.length).toBeGreaterThanOrEqual(2);
    expect(portalSofia.loyaltySummary?.currentStamps).toBe(6);
    expect(portalSofia.packages).toHaveLength(1);
    expect(portalSofia.packages[0]?.remainingSessions).toBe(3);
    const portalSerialized = JSON.stringify(portalSofia);
    expect(portalSerialized).not.toContain('internalNotes');
    expect(portalSerialized).not.toContain('commissionPercent');
    expect(portalSerialized).not.toContain('Andrea López');

    expect(listServicePackages()).toHaveLength(2);
    const newPkg = await upsertServicePackage({
      name: 'Paquete 3 Retoques',
      description: '3 visitas de retoque',
      serviceId: 'srv-retoque',
      totalSessions: 3,
      priceCents: 90000,
      validDays: 120,
    });
    const assigned = await assignClientPackage({
      clientId: 'client-mariana',
      packageId: newPkg.id,
      notes: 'Pagado en recepción',
    });
    expect(assigned.usedSessions).toBe(0);
    const redeemed = await redeemClientPackageSession({
      clientPackageId: assigned.id,
      bookingId: 'bk-1002',
    });
    expect(redeemed.usedSessions).toBe(1);
    await expect(
      redeemClientPackageSession({
        clientPackageId: assigned.id,
        bookingId: 'bk-1002',
      }),
    ).rejects.toMatchObject({ code: 'PACKAGE_ALREADY_REDEEMED' });
    expect(listClientPackages('client-mariana')[0]?.remainingSessions).toBe(2);

    const cashCountBeforePkgCheckout = getSnapshot().cashEntries.length;
    const pkgZeroCheckout = await recordBookingCheckoutAtomic({
      bookingId: 'bk-1001',
      splits: [{ method: 'cash', amountCents: 0, tipCents: 0 }],
      markCompleted: true,
      redeemClientPackageId: 'cpkg-sofia-1',
      actor: {
        id: 'adm-owner',
        email: 'duena@nails.studio',
        role: 'owner',
        fullName: 'Karla Rodríguez (Dueña)',
      },
    });
    expect(pkgZeroCheckout.summary.isUncollected).toBe(false);
    expect(pkgZeroCheckout.summary.isFullyPaid).toBe(true);
    expect(pkgZeroCheckout.summary.totalPriceCents).toBe(0);
    expect(pkgZeroCheckout.booking.totalPriceCents).toBe(0);
    expect(pkgZeroCheckout.booking.packageRedemptionId).toBe('cpkg-sofia-1');
    expect(pkgZeroCheckout.redeemedPackage?.usedSessions).toBe(2);
    expect(listClientPackages('client-sofia')[0]?.remainingSessions).toBe(2);
    expect(getSnapshot().cashEntries.length).toBe(cashCountBeforePkgCheckout);

    const pinHash = hashOwnerPin('4821');
    const updatedSettings = await updateSalonSettings({
      ownerPinHash: pinHash,
      ownerPinEnabled: true,
    });
    expect(updatedSettings.hasOwnerPin).toBe(true);
    expect(updatedSettings.ownerPinEnabled).toBe(true);
    expect(Object.keys(getSnapshot().settings)).not.toContain('ownerPinHash');
    expect(JSON.stringify(getSnapshot().settings)).not.toContain('ownerPinHash');
    expect(JSON.stringify(getSnapshot().settings)).not.toContain(pinHash);

    globalThis.nailsDbCache = undefined;
    expect(verifyStoredOwnerPin('4821')).toEqual({ required: true, valid: true });
    expect(verifyStoredOwnerPin('9999')).toEqual({ required: true, valid: false });
    expect(verifyStoredOwnerPin(undefined)).toEqual({ required: true, valid: false });

    const ownerUser = getSnapshot().adminUsers.find((u) => u.role === 'owner');
    const specialistUser = getSnapshot().adminUsers.find((u) => u.role === 'specialist');
    if (!ownerUser || !specialistUser) throw new Error('Expected seeded users');
    const ownerToken = createAdminSessionToken(ownerUser);
    const specialistToken = createAdminSessionToken(specialistUser);
    if (!ownerToken || !specialistToken) throw new Error('Expected session tokens');
    const ownerCookie = `${ADMIN_SESSION_COOKIE}=${ownerToken}`;
    const specialistCookie = `${ADMIN_SESSION_COOKIE}=${specialistToken}`;

    const brandPinRes = await patchAdminBrand(
      new NextRequest('http://localhost:3000/api/admin/brand', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: ownerCookie },
        body: JSON.stringify({
          noShowDepositThreshold: 3,
          ownerPin: '1357',
          ownerPinEnabled: true,
        }),
      }),
    );
    expect(brandPinRes.status).toBe(200);
    const brandJson = (await brandPinRes.json()) as {
      settings: Record<string, unknown>;
    };
    expect(brandJson.settings.hasOwnerPin).toBe(true);
    expect(brandJson.settings.noShowDepositThreshold).toBe(3);
    expect('ownerPinHash' in brandJson.settings).toBe(false);

    const cancelNoPinRes = await patchAdminBookings(
      new NextRequest('http://localhost:3000/api/admin/bookings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: ownerCookie },
        body: JSON.stringify({
          bookingId: 'bk-1001',
          status: 'canceled',
          cancellationReason: 'Test sin PIN',
        }),
      }),
    );
    expect(cancelNoPinRes.status).toBe(403);
    expect(((await cancelNoPinRes.json()) as { code: string }).code).toBe(
      'OWNER_PIN_REQUIRED',
    );

    const cancelBadPinRes = await patchAdminBookings(
      new NextRequest('http://localhost:3000/api/admin/bookings', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          cookie: ownerCookie,
          'x-owner-pin': '0000',
        },
        body: JSON.stringify({
          bookingId: 'bk-1001',
          status: 'canceled',
          cancellationReason: 'Test mal PIN',
        }),
      }),
    );
    expect(cancelBadPinRes.status).toBe(403);
    expect(((await cancelBadPinRes.json()) as { code: string }).code).toBe(
      'OWNER_PIN_INVALID',
    );

    const csvNoPinRes = await getAdminOperations(
      new NextRequest('http://localhost:3000/api/admin/operations?export=csv', {
        headers: { cookie: ownerCookie },
      }),
    );
    expect(csvNoPinRes.status).toBe(403);

    const csvWithPinRes = await getAdminOperations(
      new NextRequest('http://localhost:3000/api/admin/operations?export=csv', {
        headers: { cookie: ownerCookie, 'x-owner-pin': '1357' },
      }),
    );
    expect(csvWithPinRes.status).toBe(200);

    const priceSlot = queryAvailability({
      serviceId: 'srv-rubber',
      addonIds: [],
      staffId: 'staff-paty',
      startDate: today,
      days: 14,
    }).days.flatMap((d) => d.slots)[0];
    if (!priceSlot) throw new Error('Expected open slot for price override test');

    const priceOverrideNoPin = await postAdminBookings(
      new NextRequest('http://localhost:3000/api/admin/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: ownerCookie },
        body: JSON.stringify({
          serviceId: 'srv-rubber',
          staffId: priceSlot.staffId,
          startAt: priceSlot.startAt,
          clientName: 'Precio Override',
          clientPhone: '+522229660001',
          customPriceCents: 10000,
        }),
      }),
    );
    expect(priceOverrideNoPin.status).toBe(403);

    const pkgGetSpec = await getAdminPackages(
      new NextRequest('http://localhost:3000/api/admin/packages', {
        headers: { cookie: specialistCookie },
      }),
    );
    expect(pkgGetSpec.status).toBe(200);

    const pkgPostSpec = await postAdminPackages(
      new NextRequest('http://localhost:3000/api/admin/packages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: specialistCookie },
        body: JSON.stringify({
          kind: 'assign',
          clientId: 'client-paula',
          packageId: 'pkg-rubber-4',
        }),
      }),
    );
    expect(pkgPostSpec.status).toBe(403);

    const pkgPostOwner = await postAdminPackages(
      new NextRequest('http://localhost:3000/api/admin/packages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: ownerCookie },
        body: JSON.stringify({
          kind: 'assign',
          clientId: 'client-paula',
          packageId: 'pkg-gel-5',
        }),
      }),
    );
    expect(pkgPostOwner.status).toBe(201);
    const assignedJson = (await pkgPostOwner.json()) as {
      clientPackage: { id: string };
    };

    const pkgRedeemRes = await patchAdminPackages(
      new NextRequest('http://localhost:3000/api/admin/packages', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: ownerCookie },
        body: JSON.stringify({
          action: 'redeem',
          clientPackageId: assignedJson.clientPackage.id,
        }),
      }),
    );
    expect(pkgRedeemRes.status).toBe(200);

    const campSpecRes = await getAdminCampaigns(
      new NextRequest('http://localhost:3000/api/admin/campaigns', {
        headers: { cookie: specialistCookie },
      }),
    );
    expect(campSpecRes.status).toBe(403);

    const campOwnerRes = await getAdminCampaigns(
      new NextRequest('http://localhost:3000/api/admin/campaigns', {
        headers: { cookie: ownerCookie },
      }),
    );
    expect(campOwnerRes.status).toBe(200);
    const campJson = (await campOwnerRes.json()) as {
      birthdays: Array<{ clientId: string }>;
      reactivation: Array<{ clientId: string }>;
    };
    expect(campJson.birthdays.some((c) => c.clientId === 'client-sofia')).toBe(true);
    expect(campJson.reactivation.some((c) => c.clientId === 'client-valeria')).toBe(false);

    const campDispatchRes = await postAdminCampaigns(
      new NextRequest('http://localhost:3000/api/admin/campaigns', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: ownerCookie },
        body: JSON.stringify({
          kind: 'birthday',
          clientId: 'client-sofia',
        }),
      }),
    );
    expect(campDispatchRes.status).toBe(201);

    resetRateLimiterForTests();
    for (let i = 0; i < 30; i += 1) {
      const okRes = await postValidateCoupon(
        new NextRequest('http://localhost:3000/api/coupons/validate', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-forwarded-for': '198.51.100.77',
          },
          body: JSON.stringify({ code: 'BIENVENIDA10', subtotalCents: 40000 }),
        }),
      );
      expect(okRes.status).toBe(200);
      expect(okRes.headers.get('X-RateLimit-Remaining')).toBe(String(29 - i));
    }
    const limitedRes = await postValidateCoupon(
      new NextRequest('http://localhost:3000/api/coupons/validate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '198.51.100.77',
        },
        body: JSON.stringify({ code: 'BIENVENIDA10', subtotalCents: 40000 }),
      }),
    );
    expect(limitedRes.status).toBe(429);
    expect(Number(limitedRes.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
    expect(((await limitedRes.json()) as { code: string }).code).toBe('RATE_LIMITED');
    resetRateLimiterForTests();
  });

  it('Wave 6: registers/links media assets, resolves access owner, warns & purges idempotently without deleting booking/accounting records', async () => {
    const tinyPngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2dIAAAAASUVORK5CYII=';
    const dataUrl = `data:image/png;base64,${tinyPngBase64}`;
    const uploadsDir = path.join(
      os.tmpdir(),
      `nails-uploads-w6-${process.pid}-${crypto.randomUUID()}`,
    );
    const prevUploadsDir = process.env.NAILS_DEMO_UPLOADS_DIR;
    process.env.NAILS_DEMO_UPLOADS_DIR = uploadsDir;

    try {
      const db = getSnapshot();
      const today = getDateKeyInTimezone(new Date(), db.settings.timezone);
      const avail = queryAvailability({
        serviceId: 'srv-gel-semipermanente-manos',
        addonIds: [],
        staffId: 'staff-karla',
        startDate: today,
        days: 14,
      });
      const openSlot = avail.days.find((d) => d.date > today && d.slots.length > 0)?.slots[0];
      if (!openSlot) throw new Error('Expected open slot');

      const storedUrl = await persistBookingMediaField(dataUrl, 'proofs');
      expect(storedUrl).toMatch(/^\/api\/media\/proofs\/.+\.png$/);

      const booking = await createBookingAtomic({
        serviceId: 'srv-gel-semipermanente-manos',
        addonIds: [],
        staffId: openSlot.staffId,
        startAt: openSlot.startAt,
        clientName: 'Clienta Media W6',
        clientPhone: '+522229001122',
        paymentProofUrl: storedUrl,
      });

      const storagePath = storedUrl!.replace(/^\/api\/media\//, '');
      const owner = await getMediaAccessOwner(storagePath);
      expect(owner).toEqual({
        storagePath,
        folder: 'proofs',
        bookingId: booking.id,
        staffId: 'staff-karla',
        manageToken: booking.manageToken,
        clientPhoneE164: '+522229001122',
      });

      const retentionList = await listMediaAssetsForRetention();
      const asset = retentionList.find((a) => a.storagePath === storagePath);
      expect(asset).toBeDefined();
      expect(asset?.sizeBytes).toBeGreaterThan(0);

      const warned1 = await markMediaRetentionWarned(
        asset!.id,
        '30d',
        '2027-10-01T09:00:00.000Z',
      );
      expect(warned1?.retentionWarned30dAt).toBe('2027-10-01T09:00:00.000Z');
      const auditCountAfterWarn1 = (getSnapshot().auditLogs ?? []).filter(
        (a) => a.action === 'media_retention_warned' && a.entityId === asset!.id,
      ).length;
      expect(auditCountAfterWarn1).toBe(1);

      const warned2 = await markMediaRetentionWarned(
        asset!.id,
        '30d',
        '2027-10-02T09:00:00.000Z',
      );
      expect(warned2?.retentionWarned30dAt).toBe('2027-10-01T09:00:00.000Z');
      expect(
        (getSnapshot().auditLogs ?? []).filter(
          (a) => a.action === 'media_retention_warned' && a.entityId === asset!.id,
        ).length,
      ).toBe(1);

      const warned7d = await markMediaRetentionWarned(
        asset!.id,
        '7d',
        '2027-10-25T09:00:00.000Z',
      );
      expect(warned7d?.retentionWarned7dAt).toBe('2027-10-25T09:00:00.000Z');

      const purged1 = await markMediaAssetPurged(asset!.id, '2027-11-01T09:00:00.000Z');
      expect(purged1?.purgedAt).toBe('2027-11-01T09:00:00.000Z');

      const purged2 = await markMediaAssetPurged(asset!.id, '2027-11-02T09:00:00.000Z');
      expect(purged2?.purgedAt).toBe('2027-11-01T09:00:00.000Z');
      expect(
        (getSnapshot().auditLogs ?? []).filter(
          (a) => a.action === 'media_retention_purged' && a.entityId === asset!.id,
        ).length,
      ).toBe(1);

      const refreshedBooking = getBookingByToken(booking.manageToken);
      expect(refreshedBooking).not.toBeNull();
      expect(refreshedBooking?.id).toBe(booking.id);
      expect(refreshedBooking?.paymentProofUrl).toBeNull();
      expect(refreshedBooking?.totalPriceCents).toBe(booking.totalPriceCents);

      const remainingRetention = await listMediaAssetsForRetention();
      expect(remainingRetention.some((a) => a.id === asset!.id)).toBe(false);

      const uploadedViaManage = await manageClientBookingAction({
        token: booking.manageToken,
        action: 'upload_proof',
        paymentProofUrl: dataUrl,
      });
      expect(uploadedViaManage.paymentProofUrl).toMatch(/^\/api\/media\/proofs\/.+\.png$/);
      const uploadedOwner = await getMediaAccessOwner(uploadedViaManage.paymentProofUrl!);
      expect(uploadedOwner?.bookingId).toBe(booking.id);
      expect(uploadedOwner?.staffId).toBe('staff-karla');

      const manualAsset = await registerMediaAsset({
        storagePath: 'inspo/manual-ref.webp',
        folder: 'inspo',
        bookingId: booking.id,
        clientId: booking.clientId,
        contentType: 'image/webp',
        sizeBytes: 4096,
      });
      expect(manualAsset.storagePath).toBe('inspo/manual-ref.webp');
    } finally {
      if (prevUploadsDir === undefined) {
        delete process.env.NAILS_DEMO_UPLOADS_DIR;
      } else {
        process.env.NAILS_DEMO_UPLOADS_DIR = prevUploadsDir;
      }
      fs.rmSync(uploadsDir, { recursive: true, force: true });
    }
  });

  it('Wave 6: manages WhatsApp templates/monthly quota alerts, webhook idempotency, and slot-hold keep-alive cleanup', async () => {
    const templates = await getWhatsAppTemplates();
    expect(templates).toHaveLength(6);
    expect(templates.every((t) => t.category === 'UTILITY' && t.languageCode === 'es_MX')).toBe(
      true,
    );

    const prevOverride = process.env.WHATSAPP_TEMPLATE_BOOKING_CONFIRMED;
    process.env.WHATSAPP_TEMPLATE_BOOKING_CONFIRMED = 'laikona_override_confirmada';
    try {
      const overridden = await getWhatsAppTemplates();
      expect(
        overridden.find((t) => t.triggerKey === 'booking_confirmed')?.templateName,
      ).toBe('laikona_override_confirmada');
    } finally {
      if (prevOverride === undefined) {
        delete process.env.WHATSAPP_TEMPLATE_BOOKING_CONFIRMED;
      } else {
        process.env.WHATSAPP_TEMPLATE_BOOKING_CONFIRMED = prevOverride;
      }
    }

    const emptyMonth = await getWhatsAppMonthlyUsage('2027-01');
    expect(emptyMonth).toMatchObject({
      monthKey: '2027-01',
      sentCount: 0,
      quotaLimit: 500,
      percentUsed: 0,
      alertLevel: 'ok',
    });

    const at399 = await incrementWhatsAppMonthlyUsage('2027-01', 399);
    expect(at399.alertLevel).toBe('ok');
    expect(at399.warned80At).toBeNull();

    const at400 = await incrementWhatsAppMonthlyUsage('2027-01', 1);
    expect(at400.sentCount).toBe(400);
    expect(at400.percentUsed).toBe(80);
    expect(at400.alertLevel).toBe('warning_80');
    expect(at400.warned80At).not.toBeNull();
    expect(at400.warned100At).toBeNull();

    const at500 = await incrementWhatsAppMonthlyUsage('2027-01', 100);
    expect(at500.sentCount).toBe(500);
    expect(at500.percentUsed).toBe(100);
    expect(at500.alertLevel).toBe('limit_100');
    expect(at500.warned100At).not.toBeNull();

    expect(await claimWebhookEventIdempotent('whatsapp', 'wamid.dedup.1')).toBe(true);
    expect(await claimWebhookEventIdempotent('whatsapp', 'wamid.dedup.1')).toBe(false);
    expect(await claimWebhookEventIdempotent('whatsapp', 'wamid.dedup.2')).toBe(true);

    const db = getSnapshot();
    const today = getDateKeyInTimezone(new Date(), db.settings.timezone);
    const avail = queryAvailability({
      serviceId: 'srv-gel-semipermanente-manos',
      addonIds: [],
      staffId: 'staff-karla',
      startDate: today,
      days: 14,
    });
    const openSlot = avail.days.find((d) => d.date > today && d.slots.length > 0)?.slots[0];
    if (!openSlot) throw new Error('Expected open slot');

    const hold = await createOrRefreshSlotHold({
      serviceId: 'srv-gel-semipermanente-manos',
      addonIds: [],
      staffId: openSlot.staffId,
      startAt: openSlot.startAt,
      sessionToken: 'sess-cleanup-test',
    });
    const futureMs = new Date(hold.expiresAt).getTime() + 60_000;
    const cleanup = await cleanupExpiredSlotHolds(futureMs);
    expect(cleanup).toEqual({ cleanedCount: 1, dbAlive: true });
    expect(getSnapshot().slotHolds.some((h) => h.id === hold.id)).toBe(false);
  });
});
