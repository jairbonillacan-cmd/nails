import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createInitialDemoDatabase } from '../demo-seed';
import {
  assertSlotBookable,
  computeServiceTotals,
  findNearestAvailableSlots,
  getAvailabilityForRange,
  getAvailableSlotsForDate,
  type AvailabilityContext,
  type AvailableSlot,
} from '../availability/engine';
import {
  isActiveBookingStatus,
  isTerminalBookingStatus,
  transitionBookingStatus,
  type BookingTransitionEffect,
} from '../booking/state-machine';
import { checkManagePolicyWindow } from '../availability/policy';
import {
  generateBookingCode,
  generateId,
  systemClock,
  type Clock,
} from '../clock';
import { assertProductionEnvValid, getRuntimeIntegrationStatus } from '../env';
import {
  buildWhatsAppLink,
  formatDateLongInTimezone,
  formatTimeInTimezone,
  getDateKeyInTimezone,
  normalizePhoneE164,
  slugify,
} from '../format';
import {
  dispatchEmailNotification,
  dispatchWhatsAppNotification,
} from '../integrations/notifications';
import {
  toPublicServiceDTO,
  toPublicSettingsDTO,
  toPublicStaffDTO,
} from '../public-dto';
import { publishRealtimeEvent } from '../realtime';
import { MediaValidationError, storeMediaUpload } from '../storage/media';
import { dispatchOutboxEvent, type OutboxEventInput } from '../use-cases/outbox';
import { parseDemoDatabase } from './schema';
import { isSupabaseEnabled } from './supabase-client';
import { createSupabaseRepository } from './supabase-repo';
import {
  PolicyError,
  SlotConflictError,
  type CreateBookingAtomicInput,
  type CreateSlotHoldInput,
  type OutboxEventRecord,
  type PublicBootstrapData,
  type QueryAvailabilityInput,
  type SalonRepository,
  type SlotHoldResult,
} from './port';

export { PolicyError, SlotConflictError };
import type {
  AdminRole,
  AdminUser,
  AvailabilityRule,
  Booking,
  BookingReview,
  BookingStatus,
  BookingWithRelations,
  CalendarConnection,
  CashRegisterEntry,
  ClientProfile,
  Coupon,
  DateOverride,
  DemoDatabase,
  GalleryItem,
  InventoryItem,
  NotificationWorkflow,
  PaymentMethod,
  SalonSettings,
  ScheduledNotification,
  Service,
  ServiceAddon,
  SlotHold,
  StaffMember,
  WaitlistEntry,
} from '../types';

const DEFAULT_DEMO_DB_PATH = path.join(process.cwd(), '.nails-demo-db.json');

function getActiveTestDbPath(): string | null {
  if (process.env.NODE_ENV === 'test') {
    const configured = process.env.NAILS_DEMO_DB_PATH?.trim();
    if (configured) return configured;
  }
  return null;
}

function demoDbFileExists(testDbPath: string | null): boolean {
  if (process.env.NODE_ENV === 'test' && testDbPath) {
    return fs.existsSync(testDbPath);
  }
  return fs.existsSync(DEFAULT_DEMO_DB_PATH);
}

function readRawDemoDb(testDbPath: string | null): string | null {
  if (process.env.NODE_ENV === 'test' && testDbPath) {
    return fs.existsSync(testDbPath) ? fs.readFileSync(testDbPath, 'utf-8') : null;
  }
  return fs.existsSync(DEFAULT_DEMO_DB_PATH)
    ? fs.readFileSync(DEFAULT_DEMO_DB_PATH, 'utf-8')
    : null;
}

function writeRawDemoDb(testDbPath: string | null, serialized: string): void {
  if (process.env.NODE_ENV === 'test' && testDbPath) {
    fs.writeFileSync(testDbPath, serialized, 'utf-8');
    return;
  }
  fs.writeFileSync(DEFAULT_DEMO_DB_PATH, serialized, 'utf-8');
}

declare global {
  var nailsDbCache: DemoDatabase | undefined;
  var nailsDbCachePath: string | undefined;
  var nailsDbPersistedToDisk: boolean | undefined;
  var nailsWriteMutex: Promise<void> | undefined;
  var nailsDemoOutbox: OutboxEventRecord[] | undefined;
}

function readDbFromDisk(): DemoDatabase {
  const testDbPath = getActiveTestDbPath();
  const cacheKey = testDbPath ?? DEFAULT_DEMO_DB_PATH;
  if (
    globalThis.nailsDbCache &&
    globalThis.nailsDbCachePath === cacheKey &&
    (globalThis.nailsDbPersistedToDisk === false || demoDbFileExists(testDbPath))
  ) {
    return globalThis.nailsDbCache;
  }
  globalThis.nailsDbCache = undefined;
  globalThis.nailsDbCachePath = undefined;
  globalThis.nailsDbPersistedToDisk = undefined;
  try {
    const raw = readRawDemoDb(testDbPath);
    if (raw !== null) {
      const parsed = parseDemoDatabase(JSON.parse(raw) as unknown);
      globalThis.nailsDbCache = parsed;
      globalThis.nailsDbCachePath = cacheKey;
      globalThis.nailsDbPersistedToDisk = true;
      return parsed;
    }
  } catch {
    globalThis.nailsDbCache = undefined;
    globalThis.nailsDbCachePath = undefined;
    globalThis.nailsDbPersistedToDisk = undefined;
  }
  const seeded = createInitialDemoDatabase();
  globalThis.nailsDbCache = seeded;
  globalThis.nailsDbCachePath = cacheKey;
  writeDbToDisk(seeded);
  return seeded;
}

function writeDbToDisk(db: DemoDatabase): void {
  const testDbPath = getActiveTestDbPath();
  const cacheKey = testDbPath ?? DEFAULT_DEMO_DB_PATH;
  globalThis.nailsDbCache = db;
  globalThis.nailsDbCachePath = cacheKey;
  try {
    writeRawDemoDb(testDbPath, JSON.stringify(db, null, 2));
    globalThis.nailsDbPersistedToDisk = true;
  } catch {
    globalThis.nailsDbPersistedToDisk = false;
    return;
  }
}

async function withWriteLock<T>(fn: (db: DemoDatabase) => Promise<T> | T): Promise<T> {
  const prev = globalThis.nailsWriteMutex ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  globalThis.nailsWriteMutex = prev.then(() => next);
  await prev;

  try {
    const db = readDbFromDisk();
    pruneExpiredHolds(db);
    const result = await fn(db);
    writeDbToDisk(db);
    return result;
  } finally {
    release();
  }
}

function pruneExpiredHolds(db: DemoDatabase): void {
  const nowMs = Date.now();
  db.slotHolds = db.slotHolds.filter((h) => new Date(h.expiresAt).getTime() > nowMs);
}

export function getSnapshot(): DemoDatabase {
  const db = readDbFromDisk();
  pruneExpiredHolds(db);
  return db;
}

function hydrateBooking(db: DemoDatabase, booking: Booking): BookingWithRelations {
  const service: Service = db.services.find((s) => s.id === booking.serviceId) ??
    db.services[0] ?? {
      id: booking.serviceId,
      categoryId: null,
      name: 'Servicio',
      slug: 'servicio',
      description: '',
      durationMinutes: booking.totalDurationMinutes,
      priceCents: booking.subtotalCents,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      requiresConfirmation: false,
      depositRequired: false,
      depositAmountCents: booking.depositAmountCents,
      allowInspoPhoto: false,
      isActive: true,
      isFeatured: false,
      displayOrder: 0,
      imageUrl: null,
    };
  const staff: StaffMember = db.staff.find((s) => s.id === booking.staffId) ??
    db.staff[0] ?? {
      id: booking.staffId,
      name: 'Especialista',
      roleTitle: 'Nail Artist',
      bio: '',
      avatarUrl: null,
      bookingSlug: 'especialista',
      commissionPercent: db.settings.defaultCommissionPercent,
      isActive: true,
      displayOrder: 0,
      serviceIds: [],
    };
  const client =
    db.clients.find((c) => c.id === booking.clientId) ?? {
      id: booking.clientId,
      fullName: 'Clienta',
      phoneE164: '',
      email: null,
      birthday: null,
      notes: '',
      noShowCount: 0,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
    };
  const review = db.reviews.find((r) => r.bookingId === booking.id) ?? null;
  return { ...booking, service, staff, client, review };
}

export function getBookingsWithRelations(role?: AdminRole, staffMemberId?: string | null): BookingWithRelations[] {
  const db = getSnapshot();
  const filtered =
    role === 'specialist' && staffMemberId
      ? db.bookings.filter((b) => b.staffId === staffMemberId)
      : db.bookings;
  return filtered
    .map((b) => hydrateBooking(db, b))
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
}

export function getBookingByToken(token: string): BookingWithRelations | null {
  const db = getSnapshot();
  const found = db.bookings.find((b) => b.manageToken === token);
  return found ? hydrateBooking(db, found) : null;
}

const INSTAGRAM_HANDLE_RE = /^[a-zA-Z0-9._]{1,30}$/;

export function normalizeInstagramHandle(
  raw: string | null | undefined,
): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const stripped = trimmed
    .replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, '')
    .replace(/^(?:www\.)?instagram\.com\//i, '')
    .replace(/[/?#].*$/, '')
    .replace(/^@+/, '')
    .trim();
  if (!stripped || !INSTAGRAM_HANDLE_RE.test(stripped)) {
    throw new PolicyError(
      'INVALID_INSTAGRAM_HANDLE',
      'Ingresa un usuario de Instagram válido (ej. @tu.usuario).',
    );
  }
  return `@${stripped.toLowerCase()}`;
}

function resolveExtraServices(
  db: DemoDatabase,
  primaryServiceId: string,
  extraServiceIds?: string[],
): Service[] {
  if (!extraServiceIds || extraServiceIds.length === 0) return [];
  const uniqueIds = Array.from(
    new Set(
      extraServiceIds
        .map((id) => id.trim())
        .filter((id) => id.length > 0 && id !== primaryServiceId),
    ),
  );
  const resolved: Service[] = [];
  for (const id of uniqueIds) {
    const found = db.services.find((s) => s.id === id && s.isActive);
    if (!found) {
      throw new PolicyError(
        'SERVICE_NOT_FOUND',
        'Uno de los servicios adicionales seleccionados no está disponible.',
      );
    }
    resolved.push(found);
  }
  return resolved;
}

function isStaffEligibleForAllServices(
  staff: StaffMember,
  requiredServiceIds: readonly string[],
): boolean {
  return (
    staff.isActive &&
    (staff.serviceIds.length === 0 ||
      requiredServiceIds.every((id) => staff.serviceIds.includes(id)))
  );
}

interface ExtendedQueryAvailabilityInput extends QueryAvailabilityInput {
  extraServiceIds?: string[];
}

interface ExtendedCreateBookingAtomicInput extends CreateBookingAtomicInput {
  extraServiceIds?: string[];
  clientInstagram?: string | null;
  proofDeliveryMethod?: 'web_upload' | 'instagram_dm' | 'none';
  customDurationMinutes?: number | null;
  customPriceCents?: number | null;
  internalNotes?: string | null;
  notifyEmail?: boolean;
  notifyWhatsapp?: boolean;
}

export function queryAvailability(params: ExtendedQueryAvailabilityInput) {
  const db = getSnapshot();
  const service = db.services.find((s) => s.id === params.serviceId);
  if (!service) {
    throw new PolicyError('SERVICE_NOT_FOUND', 'Servicio no encontrado.');
  }
  const extraServices = resolveExtraServices(db, service.id, params.extraServiceIds);
  const addons = db.addons.filter((a) => params.addonIds.includes(a.id) && a.isActive);
  const requiredServiceIds = [service.id, ...extraServices.map((s) => s.id)];
  const eligibleStaff = db.staff.filter((st) =>
    isStaffEligibleForAllServices(st, requiredServiceIds),
  );

  const summary = getAvailabilityForRange(
    {
      settings: db.settings,
      service,
      extraServices,
      addons,
      staffMembers: eligibleStaff,
      schedules: db.schedules,
      dateOverrides: db.dateOverrides,
      bookings: db.bookings,
      slotHolds: db.slotHolds,
      calendarConnections: db.calendarConnections,
      callerSessionToken: params.sessionToken,
      ignoreBookingId: params.ignoreBookingId,
    },
    params.startDate,
    Math.min(Math.max(params.days, 1), 45),
    params.staffId || null,
  );

  const totals = computeServiceTotals(service, addons, extraServices);
  return {
    service,
    extraServices,
    addons,
    totals,
    activeStaffCount: eligibleStaff.length,
    days: summary,
  };
}

export async function queryAvailabilityWithExtras(
  params: ExtendedQueryAvailabilityInput,
) {
  const repo = getRepository();
  if (isSupabaseEnabled()) {
    return repo.queryAvailability(params);
  }
  return queryAvailability(params);
}

export function validateCouponCode(code: string, subtotalCents: number) {
  const db = getSnapshot();
  const normalized = code.trim().toUpperCase();
  const coupon = db.coupons.find((c) => c.code.toUpperCase() === normalized && c.isActive);
  if (!coupon) {
    return { valid: false as const, error: 'Código no válido o inactivo.' };
  }
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) {
    return { valid: false as const, error: 'Este código ya expiró.' };
  }
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    return { valid: false as const, error: 'Este código alcanzó su límite de usos.' };
  }
  if (subtotalCents < coupon.minSubtotalCents) {
    return {
      valid: false as const,
      error: `Monto mínimo requerido: $${(coupon.minSubtotalCents / 100).toFixed(0)} MXN.`,
    };
  }

  let discountCents = 0;
  if (coupon.kind === 'gift_card') {
    const balance = coupon.remainingBalanceCents ?? coupon.discountValue;
    if (balance <= 0) {
      return { valid: false as const, error: 'Esta Gift Card ya no tiene saldo disponible.' };
    }
    discountCents = Math.min(subtotalCents, balance);
  } else if (coupon.discountType === 'percent') {
    discountCents = Math.round((subtotalCents * coupon.discountValue) / 100);
  } else {
    discountCents = Math.min(subtotalCents, coupon.discountValue);
  }

  return { valid: true as const, coupon, discountCents };
}

function buildAvailabilityContext(
  db: DemoDatabase,
  service: Service,
  addons: ServiceAddon[],
  options?: {
    extraServices?: Service[];
    now?: Date;
    callerSessionToken?: string | null;
    ignoreBookingId?: string | null;
  },
): AvailabilityContext {
  return {
    settings: db.settings,
    service,
    extraServices: options?.extraServices,
    addons,
    staffMembers: db.staff,
    schedules: db.schedules,
    dateOverrides: db.dateOverrides,
    bookings: db.bookings,
    slotHolds: db.slotHolds,
    calendarConnections: db.calendarConnections,
    now: options?.now,
    callerSessionToken: options?.callerSessionToken,
    ignoreBookingId: options?.ignoreBookingId,
  };
}

function countActiveBookingsForStaffOnDate(
  db: DemoDatabase,
  staffId: string,
  dateKey: string,
): number {
  const tz = db.settings.timezone || 'America/Mexico_City';
  let count = 0;
  for (const b of db.bookings) {
    if (b.staffId !== staffId) continue;
    if (!isActiveBookingStatus(b.status)) continue;
    if (getDateKeyInTimezone(new Date(b.startAt), tz) === dateKey) {
      count += 1;
    }
  }
  return count;
}

function resolveBookableSlotOrThrow(params: {
  db: DemoDatabase;
  service: Service;
  extraServices?: Service[];
  requiredServiceIds?: readonly string[];
  addons: ServiceAddon[];
  startAt: string;
  staffId?: string | null;
  now: Date;
  ignoreBookingId?: string;
  ignoreHoldSessionToken?: string;
  conflictMessage: string;
}): { slot: AvailableSlot; staff: StaffMember } {
  const requiredServiceIds = params.requiredServiceIds ?? [
    params.service.id,
    ...(params.extraServices ?? []).map((s) => s.id),
  ];
  const ctx = buildAvailabilityContext(params.db, params.service, params.addons, {
    extraServices: params.extraServices,
    now: params.now,
    callerSessionToken: params.ignoreHoldSessionToken ?? null,
    ignoreBookingId: params.ignoreBookingId ?? null,
  });

  if (params.staffId) {
    const requestedStaff = params.db.staff.find((s) => s.id === params.staffId);
    if (
      !requestedStaff ||
      !isStaffEligibleForAllServices(requestedStaff, requiredServiceIds)
    ) {
      throw new PolicyError(
        'STAFF_INELIGIBLE',
        'La especialista seleccionada no está disponible para todos los servicios elegidos.',
      );
    }

    const check = assertSlotBookable(ctx, {
      startAt: params.startAt,
      staffId: params.staffId,
      now: params.now,
      ignoreBookingId: params.ignoreBookingId,
      ignoreHoldSessionToken: params.ignoreHoldSessionToken,
    });
    if (!check.ok) {
      if (check.code === 'SLOT_TAKEN') {
        throw new SlotConflictError(params.conflictMessage, check.suggestedSlots);
      }
      throw new PolicyError(check.code, check.message, check.suggestedSlots);
    }
    return { slot: check.slot, staff: requestedStaff };
  }

  const eligibleStaff = params.db.staff.filter((st) =>
    isStaffEligibleForAllServices(st, requiredServiceIds),
  );
  if (eligibleStaff.length === 0) {
    throw new PolicyError(
      'STAFF_INELIGIBLE',
      'No hay especialistas disponibles para este servicio.',
      [],
    );
  }

  const parsedStartMs = new Date(params.startAt).getTime();
  const tz = params.db.settings.timezone || 'America/Mexico_City';
  const targetDateKey = Number.isNaN(parsedStartMs)
    ? getDateKeyInTimezone(params.now, tz)
    : getDateKeyInTimezone(new Date(parsedStartMs), tz);

  const rankedStaff = eligibleStaff.toSorted((a, b) => {
    const diff =
      countActiveBookingsForStaffOnDate(params.db, a.id, targetDateKey) -
      countActiveBookingsForStaffOnDate(params.db, b.id, targetDateKey);
    return diff !== 0 ? diff : a.displayOrder - b.displayOrder;
  });

  let sawSlotTaken = false;
  let firstFailure: Extract<ReturnType<typeof assertSlotBookable>, { ok: false }> | null =
    null;

  for (const candidate of rankedStaff) {
    const check = assertSlotBookable(ctx, {
      startAt: params.startAt,
      staffId: candidate.id,
      now: params.now,
      ignoreBookingId: params.ignoreBookingId,
      ignoreHoldSessionToken: params.ignoreHoldSessionToken,
    });
    if (check.ok) {
      return { slot: check.slot, staff: candidate };
    }
    if (check.code === 'SLOT_TAKEN') {
      sawSlotTaken = true;
    }
    if (!firstFailure) {
      firstFailure = check;
    }
  }

  const anchorIso =
    Number.isNaN(parsedStartMs) || parsedStartMs < params.now.getTime()
      ? params.now.toISOString()
      : new Date(parsedStartMs).toISOString();
  const suggestions = findNearestAvailableSlots(ctx, anchorIso, null, 3);

  if (sawSlotTaken) {
    throw new SlotConflictError(params.conflictMessage, suggestions);
  }
  if (firstFailure) {
    throw new PolicyError(firstFailure.code, firstFailure.message, suggestions);
  }
  throw new PolicyError(
    'OUTSIDE_HOURS',
    'No hay horarios disponibles para esta fecha.',
    suggestions,
  );
}

function applyInLockTransitionEffects(
  db: DemoDatabase,
  booking: Booking,
  hydrated: BookingWithRelations,
  effects: readonly BookingTransitionEffect[],
  options: {
    paymentMethod?: PaymentMethod;
    tipCents?: number;
    recordedBy?: string;
  },
): OutboxEventInput[] {
  const outboxEvents: OutboxEventInput[] = [];
  const bookingId = booking.id;

  for (const effect of effects) {
    if (effect.type === 'SyncCalendar') {
      const conn = db.calendarConnections.find((c) => c.staffId === effect.staffId);
      const settingsSnapshot = { ...db.settings };
      outboxEvents.push({
        type: 'SyncCalendar',
        booking: hydrated,
        connection: conn ? { ...conn } : undefined,
        settings: settingsSnapshot,
        action: effect.action,
        onSynced: async (googleEventId) => {
          hydrated.googleEventId = googleEventId;
          await withWriteLock((liveDb) => {
            const target = liveDb.bookings.find((b) => b.id === bookingId);
            if (target) {
              target.googleEventId = googleEventId;
            }
          });
        },
      });
    } else if (effect.type === 'Notify') {
      if (effect.cancelPending) {
        for (const n of db.notifications) {
          if (n.bookingId === effect.bookingId && n.status === 'pending') {
            n.status = 'canceled';
          }
        }
      }
      const workflowsSnapshot = [...db.workflows];
      const settingsSnapshot = { ...db.settings };
      outboxEvents.push({
        type: 'Notify',
        booking: hydrated,
        workflows: workflowsSnapshot,
        settings: settingsSnapshot,
        trigger: effect.trigger,
        onLogs: async (logs) => {
          await withWriteLock((liveDb) => {
            liveDb.notifications.unshift(...logs);
          });
        },
      });
    } else if (effect.type === 'RecordCash') {
      const alreadyRecorded = db.cashEntries.some((e) => e.bookingId === effect.bookingId);
      if (!alreadyRecorded) {
        const staff = db.staff.find((s) => s.id === effect.staffId);
        const pct = staff?.commissionPercent ?? db.settings.defaultCommissionPercent;
        const commissionCents = Math.round((effect.amountCents * pct) / 100);
        db.cashEntries.unshift({
          id: generateId('cash'),
          bookingId: effect.bookingId,
          staffId: effect.staffId,
          entryType: 'service_income',
          description: `${hydrated.service.name} — ${hydrated.client.fullName}`,
          amountCents: effect.amountCents,
          tipCents: options.tipCents ?? 0,
          commissionCents,
          paymentMethod: options.paymentMethod ?? 'card',
          occurredAt: new Date().toISOString(),
          recordedBy: options.recordedBy ?? 'Admin',
        });
      }
    } else if (effect.type === 'ReleaseCoupon') {
      const normalizedCode = effect.couponCode.trim().toUpperCase();
      const coupon = db.coupons.find((c) => c.code.toUpperCase() === normalizedCode);
      if (coupon) {
        coupon.usedCount = Math.max(0, coupon.usedCount - 1);
        if (coupon.kind === 'gift_card') {
          const currentBalance = coupon.remainingBalanceCents ?? 0;
          coupon.remainingBalanceCents = Math.min(
            coupon.discountValue,
            currentBalance + effect.discountCents,
          );
        }
      }
    } else if (effect.type === 'IncrementNoShow') {
      const client = db.clients.find((c) => c.id === effect.clientId);
      if (client) {
        client.noShowCount += 1;
      }
    }
  }

  return outboxEvents;
}

async function dispatchPostCommitOutbox(
  events: readonly OutboxEventInput[],
): Promise<void> {
  for (const event of events) {
    await dispatchOutboxEvent(event);
  }
}

export async function persistBookingMediaField(
  value: string | null | undefined,
  folder: 'inspo' | 'proofs',
): Promise<string | null> {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase().startsWith('data:')) {
    try {
      const stored = await storeMediaUpload({ dataUrl: trimmed, folder });
      if (isSupabaseEnabled()) {
        return stored.signedUrl ?? stored.storagePath;
      }
      return `/api/media/${stored.storagePath}`;
    } catch (err) {
      if (err instanceof MediaValidationError) {
        throw new PolicyError(err.code, err.message);
      }
      throw err;
    }
  }
  if (
    trimmed.startsWith('/api/media/') ||
    trimmed.startsWith('/gallery/') ||
    trimmed.startsWith('inspo/') ||
    trimmed.startsWith('proofs/') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('demo-')
  ) {
    return trimmed;
  }
  throw new PolicyError('INVALID_MEDIA_URL', 'Referencia de imagen inválida.');
}

interface ExtendedCreateSlotHoldInput extends CreateSlotHoldInput {
  extraServiceIds?: string[];
}

export async function createOrRefreshSlotHold(
  params: ExtendedCreateSlotHoldInput,
): Promise<SlotHoldResult> {
  const created = await withWriteLock((db) => {
    const service = db.services.find((s) => s.id === params.serviceId);
    if (!service || !service.isActive) {
      throw new PolicyError('SERVICE_NOT_FOUND', 'Servicio no encontrado.');
    }

    const extraServices = resolveExtraServices(db, service.id, params.extraServiceIds);
    const requiredServiceIds = [service.id, ...extraServices.map((s) => s.id)];
    const addons = db.addons.filter((a) => params.addonIds.includes(a.id) && a.isActive);
    const now = new Date();
    const { slot } = resolveBookableSlotOrThrow({
      db,
      service,
      extraServices,
      requiredServiceIds,
      addons,
      startAt: params.startAt,
      staffId: params.staffId,
      now,
      ignoreHoldSessionToken: params.sessionToken,
      conflictMessage: 'Ese horario acaba de ser apartado hace unos segundos.',
    });

    db.slotHolds = db.slotHolds.filter((h) => h.sessionToken !== params.sessionToken);

    const holdMinutes = db.settings.slotHoldMinutes || 3;
    const hold: SlotHold = {
      id: generateId('hold'),
      staffId: slot.staffId,
      serviceId: params.serviceId,
      sessionToken: params.sessionToken,
      startAt: slot.occupiedStartAt,
      endAt: slot.occupiedEndAt,
      expiresAt: new Date(now.getTime() + holdMinutes * 60_000).toISOString(),
      createdAt: now.toISOString(),
    };
    db.slotHolds.push(hold);
    return { hold: { ...hold, holdId: hold.id }, staffId: slot.staffId, startAt: slot.startAt };
  });

  await dispatchOutboxEvent({
    type: 'Realtime',
    eventType: 'hold_changed',
    payload: { staffId: created.staffId, startAt: created.startAt },
  });
  return created.hold;
}

export async function createOrRefreshSlotHoldWithExtras(
  params: ExtendedCreateSlotHoldInput,
): Promise<SlotHoldResult> {
  const repo = getRepository();
  if (isSupabaseEnabled()) {
    return repo.createOrRefreshSlotHold(params);
  }
  return createOrRefreshSlotHold(params);
}

export async function releaseSlotHold(sessionToken: string): Promise<void> {
  const released = await withWriteLock((db) => {
    const before = db.slotHolds.length;
    db.slotHolds = db.slotHolds.filter((h) => h.sessionToken !== sessionToken);
    return db.slotHolds.length !== before;
  });
  if (released) {
    await dispatchOutboxEvent({
      type: 'Realtime',
      eventType: 'hold_changed',
    });
  }
}

export async function createBookingAtomic(
  params: ExtendedCreateBookingAtomicInput,
): Promise<BookingWithRelations> {
  const normalizedInstagram = normalizeInstagramHandle(params.clientInstagram);
  const storedInspoPhotoUrl = await persistBookingMediaField(
    params.inspoPhotoUrl,
    'inspo',
  );
  const storedPaymentProofUrl = await persistBookingMediaField(
    params.paymentProofUrl,
    'proofs',
  );

  const committed = await withWriteLock((db) => {
    if (params.idempotencyKey) {
      const existing = db.bookings.find(
        (b) => b.idempotencyKey === params.idempotencyKey,
      );
      if (existing) {
        return {
          hydrated: hydrateBooking(db, existing),
          outboxEvents: [] as OutboxEventInput[],
        };
      }
    }

    const service = db.services.find((s) => s.id === params.serviceId);
    if (!service || !service.isActive) {
      throw new PolicyError('SERVICE_NOT_FOUND', 'El servicio seleccionado no está disponible.');
    }

    const extraServices = resolveExtraServices(db, service.id, params.extraServiceIds);
    const addons = db.addons.filter((a) => params.addonIds.includes(a.id) && a.isActive);
    const computedTotals = computeServiceTotals(service, addons, extraServices);
    const customDuration =
      typeof params.customDurationMinutes === 'number' && params.customDurationMinutes > 0
        ? params.customDurationMinutes
        : null;
    const hasCustomDuration = customDuration !== null;
    const totalDurationMinutes = customDuration ?? computedTotals.totalDurationMinutes;
    const subtotalCents =
      typeof params.customPriceCents === 'number' && params.customPriceCents >= 0
        ? params.customPriceCents
        : computedTotals.subtotalCents;

    const requiredServiceIds = [service.id, ...extraServices.map((s) => s.id)];
    const serviceForSlot: Service = hasCustomDuration
      ? {
          ...service,
          durationMinutes: totalDurationMinutes,
          bufferBeforeMinutes: computedTotals.bufferBeforeMinutes,
          bufferAfterMinutes: computedTotals.bufferAfterMinutes,
        }
      : service;
    const extraServicesForSlot = hasCustomDuration ? [] : extraServices;
    const addonsForSlot = hasCustomDuration ? [] : addons;

    const now = new Date();
    const { slot, staff: chosenStaff } = resolveBookableSlotOrThrow({
      db,
      service: serviceForSlot,
      extraServices: extraServicesForSlot,
      requiredServiceIds,
      addons: addonsForSlot,
      startAt: params.startAt,
      staffId: params.staffId,
      now,
      ignoreHoldSessionToken: params.sessionToken ?? undefined,
      conflictMessage:
        'Ese horario acaba de ser reservado hace unos segundos. Elige uno de los horarios más cercanos sin perder tus datos.',
    });

    if (params.holdId) {
      const matchingHold = db.slotHolds.find((h) => h.id === params.holdId);
      const slotOccStartMs = new Date(slot.occupiedStartAt).getTime();
      const slotOccEndMs = new Date(slot.occupiedEndAt).getTime();
      const holdMatches =
        Boolean(matchingHold) &&
        Boolean(params.sessionToken) &&
        matchingHold?.sessionToken === params.sessionToken &&
        matchingHold?.staffId === chosenStaff.id &&
        new Date(matchingHold.startAt).getTime() <= slotOccStartMs &&
        new Date(matchingHold.endAt).getTime() >= slotOccEndMs;

      if (!holdMatches) {
        const ctx = buildAvailabilityContext(db, serviceForSlot, addonsForSlot, {
          extraServices: extraServicesForSlot,
          now,
          callerSessionToken: params.sessionToken ?? null,
        });
        const suggestions = findNearestAvailableSlots(
          ctx,
          params.startAt,
          chosenStaff.id,
          3,
        );
        throw new SlotConflictError(
          'El apartado de este horario expiró o pertenece a otra sesión. Elige uno de los horarios disponibles.',
          suggestions,
        );
      }
    }

    const conn = db.calendarConnections.find(
      (c) => c.staffId === chosenStaff.id && c.isConnected,
    );

    let discountCents = 0;
    let appliedCouponCode: string | null = null;
    if (params.couponCode?.trim()) {
      const check = validateCouponCode(params.couponCode, subtotalCents);
      if (check.valid) {
        discountCents = check.discountCents;
        appliedCouponCode = check.coupon.code;
        check.coupon.usedCount += 1;
        if (check.coupon.kind === 'gift_card') {
          const currentBal = check.coupon.remainingBalanceCents ?? check.coupon.discountValue;
          check.coupon.remainingBalanceCents = Math.max(0, currentBal - discountCents);
        }
      }
    }

    const phoneE164 = normalizePhoneE164(params.clientPhone);
    const nowIso = now.toISOString();
    let client = db.clients.find((c) => c.phoneE164 === phoneE164);
    if (!client) {
      client = {
        id: generateId('cli'),
        fullName: params.clientName.trim(),
        phoneE164,
        email: params.clientEmail?.trim() || null,
        ...(normalizedInstagram ? { instagramHandle: normalizedInstagram } : {}),
        birthday: params.clientBirthday || null,
        notes: '',
        noShowCount: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      db.clients.push(client);
    } else {
      client.fullName = params.clientName.trim() || client.fullName;
      if (params.clientEmail?.trim()) client.email = params.clientEmail.trim();
      if (normalizedInstagram) client.instagramHandle = normalizedInstagram;
      if (params.clientBirthday) client.birthday = params.clientBirthday;
      client.updatedAt = nowIso;
    }

    const anyRequiresConfirmation =
      service.requiresConfirmation || extraServices.some((s) => s.requiresConfirmation);
    const anyDepositRequired =
      service.depositRequired || extraServices.some((s) => s.depositRequired);
    const depositAmountCents = anyDepositRequired
      ? Math.max(
          service.depositRequired ? service.depositAmountCents : 0,
          ...extraServices.map((s) => (s.depositRequired ? s.depositAmountCents : 0)),
          db.settings.depositAmountCents ?? 0,
        )
      : 0;

    const needsManualConfirm =
      !params.forceConfirmed &&
      (anyRequiresConfirmation ||
        (anyDepositRequired && db.settings.paymentMode === 'manual_transfer'));

    const status: BookingStatus = needsManualConfirm ? 'pending_confirmation' : 'confirmed';
    const bookingCode = generateBookingCode();
    const manageToken = crypto.randomBytes(12).toString('hex');
    const resolvedInstagram = normalizedInstagram ?? client.instagramHandle;

    const booking: Booking = {
      id: generateId('bk'),
      bookingCode,
      manageToken,
      idempotencyKey: params.idempotencyKey || null,
      serviceId: service.id,
      extraServiceIds: extraServices.map((s) => s.id),
      staffId: chosenStaff.id,
      clientId: client.id,
      ...(resolvedInstagram ? { clientInstagram: resolvedInstagram } : {}),
      startAt: slot.startAt,
      endAt: slot.endAt,
      occupiedStartAt: slot.occupiedStartAt,
      occupiedEndAt: slot.occupiedEndAt,
      totalDurationMinutes,
      ...(hasCustomDuration ? { customDurationMinutes: totalDurationMinutes } : {}),
      subtotalCents,
      discountCents,
      totalPriceCents: Math.max(0, subtotalCents - discountCents),
      ...(typeof params.customPriceCents === 'number'
        ? { customPriceCents: params.customPriceCents }
        : {}),
      depositAmountCents,
      couponCode: appliedCouponCode,
      status,
      source: params.source ?? 'web',
      clientNotes: params.clientNotes?.trim() || '',
      internalNotes: params.internalNotes?.trim() || '',
      inspoPhotoUrl: storedInspoPhotoUrl,
      paymentProofUrl: storedPaymentProofUrl,
      proofDeliveryMethod:
        params.proofDeliveryMethod ?? (storedPaymentProofUrl ? 'web_upload' : 'none'),
      googleEventId: null,
      cancellationReason: null,
      rescheduledFromId: null,
      addons: addons.map((a) => ({
        addonId: a.id,
        name: a.name,
        extraMinutes: a.extraMinutes,
        extraPriceCents: a.extraPriceCents,
      })),
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    db.bookings.push(booking);

    if (params.holdId || params.sessionToken) {
      db.slotHolds = db.slotHolds.filter(
        (h) =>
          (params.holdId ? h.id !== params.holdId : true) &&
          (params.sessionToken ? h.sessionToken !== params.sessionToken : true),
      );
    }

    const hydrated = hydrateBooking(db, booking);
    const bookingId = booking.id;
    const settingsSnapshot = { ...db.settings };
    const workflowsSnapshot = db.workflows.map((wf) => ({
      ...wf,
      channels: wf.channels.filter((ch) => {
        if (ch === 'email' && params.notifyEmail === false) return false;
        if (ch === 'whatsapp' && params.notifyWhatsapp === false) return false;
        return true;
      }),
    }));

    const outboxEvents: OutboxEventInput[] = [
      {
        type: 'SyncCalendar',
        booking: hydrated,
        connection: conn ? { ...conn } : undefined,
        settings: settingsSnapshot,
        action: 'create',
        onSynced: async (googleEventId) => {
          hydrated.googleEventId = googleEventId;
          await withWriteLock((liveDb) => {
            const target = liveDb.bookings.find((b) => b.id === bookingId);
            if (target) target.googleEventId = googleEventId;
          });
        },
      },
      {
        type: 'Notify',
        booking: hydrated,
        workflows: workflowsSnapshot,
        settings: settingsSnapshot,
        trigger: 'booking_created',
        onLogs: async (logs) => {
          await withWriteLock((liveDb) => {
            liveDb.notifications.unshift(...logs);
          });
        },
      },
      {
        type: 'Realtime',
        eventType: 'slot_changed',
        payload: {
          staffId: booking.staffId,
          startAt: booking.startAt,
        },
      },
    ];

    return { hydrated, outboxEvents };
  });

  await dispatchPostCommitOutbox(committed.outboxEvents);
  return committed.hydrated;
}

export async function createBookingWithExtras(
  params: ExtendedCreateBookingAtomicInput,
): Promise<BookingWithRelations> {
  const repo = getRepository();
  if (isSupabaseEnabled()) {
    return repo.createBookingAtomic(params);
  }
  return createBookingAtomic(params);
}

export async function updateBookingStatus(params: {
  bookingId: string;
  status: BookingStatus;
  cancellationReason?: string;
  internalNotes?: string;
  paymentMethod?: PaymentMethod;
  tipCents?: number;
  recordedBy?: string;
}): Promise<BookingWithRelations> {
  const committed = await withWriteLock((db) => {
    const booking = db.bookings.find((b) => b.id === params.bookingId);
    if (!booking) throw new PolicyError('BOOKING_NOT_FOUND', 'Cita no encontrada.');

    const transition = transitionBookingStatus(booking, params.status);
    if (!transition.ok) {
      throw new PolicyError(transition.code, transition.message);
    }

    booking.status = transition.nextStatus;
    if (params.cancellationReason !== undefined) {
      booking.cancellationReason = params.cancellationReason;
    }
    if (params.internalNotes !== undefined) {
      booking.internalNotes = params.internalNotes;
    }
    booking.updatedAt = new Date().toISOString();

    const hydrated = hydrateBooking(db, booking);
    const outboxEvents = applyInLockTransitionEffects(
      db,
      booking,
      hydrated,
      transition.effects,
      {
        paymentMethod: params.paymentMethod,
        tipCents: params.tipCents,
        recordedBy: params.recordedBy,
      },
    );
    outboxEvents.push({
      type: 'Realtime',
      eventType: 'slot_changed',
      payload: { staffId: booking.staffId, startAt: booking.startAt },
    });

    return { hydrated, outboxEvents };
  });

  await dispatchPostCommitOutbox(committed.outboxEvents);
  return committed.hydrated;
}

export async function manageClientBookingAction(params: {
  token: string;
  action: 'cancel' | 'reschedule';
  reason?: string;
  newStartAt?: string;
  newStaffId?: string;
}): Promise<BookingWithRelations> {
  const committed = await withWriteLock((db) => {
    const booking = db.bookings.find((b) => b.manageToken === params.token);
    if (!booking) throw new PolicyError('BOOKING_NOT_FOUND', 'No encontramos esta cita.');
    if (isTerminalBookingStatus(booking.status)) {
      throw new PolicyError('INVALID_STATE', 'Esta cita ya no puede modificarse.');
    }

    const minHours =
      params.action === 'cancel'
        ? db.settings.minCancelHours
        : db.settings.minRescheduleHours;
    const policyCheck = checkManagePolicyWindow({
      startAtIso: booking.startAt,
      nowMs: Date.now(),
      minHours,
      action: params.action,
    });
    if (!policyCheck.allowed) {
      throw new PolicyError(policyCheck.code, policyCheck.message);
    }

    if (params.action === 'cancel') {
      const transition = transitionBookingStatus(booking, 'canceled');
      if (!transition.ok) {
        throw new PolicyError(transition.code, transition.message);
      }
      booking.status = transition.nextStatus;
      booking.cancellationReason =
        params.reason || 'Cancelada por la clienta desde link personal';
      booking.updatedAt = new Date().toISOString();
      const hydrated = hydrateBooking(db, booking);
      const outboxEvents = applyInLockTransitionEffects(
        db,
        booking,
        hydrated,
        transition.effects,
        { recordedBy: 'Clienta' },
      );
      outboxEvents.push({
        type: 'Realtime',
        eventType: 'slot_changed',
        payload: { staffId: booking.staffId, startAt: booking.startAt },
      });
      return { hydrated, outboxEvents };
    }

    if (!params.newStartAt) {
      throw new PolicyError('MISSING_SLOT', 'Selecciona un nuevo horario.');
    }

    const service = db.services.find((s) => s.id === booking.serviceId);
    if (!service || !service.isActive) {
      throw new PolicyError('SERVICE_NOT_FOUND', 'Servicio no encontrado.');
    }
    const extraServices = booking.extraServiceIds?.length
      ? db.services.filter((s) => booking.extraServiceIds?.includes(s.id) && s.isActive)
      : [];
    const addons = db.addons.filter((a) =>
      booking.addons.some((ba) => ba.addonId === a.id),
    );
    const targetStaffId = params.newStaffId || booking.staffId;
    const now = new Date();
    const { slot } = resolveBookableSlotOrThrow({
      db,
      service,
      extraServices,
      addons,
      startAt: params.newStartAt,
      staffId: targetStaffId,
      now,
      ignoreBookingId: booking.id,
      conflictMessage:
        'Ese nuevo horario ya fue ocupado. Prueba con uno de los horarios cercanos.',
    });

    booking.staffId = slot.staffId;
    booking.startAt = slot.startAt;
    booking.endAt = slot.endAt;
    booking.occupiedStartAt = slot.occupiedStartAt;
    booking.occupiedEndAt = slot.occupiedEndAt;
    booking.updatedAt = now.toISOString();

    for (const n of db.notifications) {
      if (n.bookingId === booking.id && n.status === 'pending') n.status = 'canceled';
    }

    const hydrated = hydrateBooking(db, booking);
    const bookingId = booking.id;
    const conn = db.calendarConnections.find((c) => c.staffId === booking.staffId);
    const settingsSnapshot = { ...db.settings };
    const workflowsSnapshot = [...db.workflows];

    const outboxEvents: OutboxEventInput[] = [
      {
        type: 'SyncCalendar',
        booking: hydrated,
        connection: conn ? { ...conn } : undefined,
        settings: settingsSnapshot,
        action: booking.googleEventId ? 'update' : 'create',
        onSynced: async (googleEventId) => {
          hydrated.googleEventId = googleEventId;
          await withWriteLock((liveDb) => {
            const target = liveDb.bookings.find((b) => b.id === bookingId);
            if (target) target.googleEventId = googleEventId;
          });
        },
      },
      {
        type: 'Notify',
        booking: hydrated,
        workflows: workflowsSnapshot,
        settings: settingsSnapshot,
        trigger: 'booking_rescheduled',
        onLogs: async (logs) => {
          await withWriteLock((liveDb) => {
            liveDb.notifications.unshift(...logs);
          });
        },
      },
      {
        type: 'Realtime',
        eventType: 'slot_changed',
        payload: { staffId: booking.staffId, startAt: booking.startAt },
      },
    ];

    return { hydrated, outboxEvents };
  });

  await dispatchPostCommitOutbox(committed.outboxEvents);
  return committed.hydrated;
}

export async function sendManualBookingReminder(params: {
  bookingId: string;
  channel?: 'whatsapp' | 'email' | 'both';
}): Promise<{
  ok: true;
  bookingId: string;
  channel: 'whatsapp' | 'email' | 'both';
  waMeUrl: string;
  messagePreview: string;
  logs: ScheduledNotification[];
}> {
  const db = getSnapshot();
  const booking = db.bookings.find((b) => b.id === params.bookingId);
  if (!booking) {
    throw new PolicyError('BOOKING_NOT_FOUND', 'Cita no encontrada.');
  }
  if (isTerminalBookingStatus(booking.status)) {
    throw new PolicyError(
      'INVALID_STATE',
      'Solo puedes enviar recordatorios para citas activas.',
    );
  }

  const hydrated = hydrateBooking(db, booking);
  const settings = { ...db.settings };
  const channel = params.channel ?? 'whatsapp';
  const env = getRuntimeIntegrationStatus();
  const tz = settings.timezone || 'America/Mexico_City';
  const dateLabel = formatDateLongInTimezone(hydrated.startAt, tz);
  const timeLabel = formatTimeInTimezone(hydrated.startAt, tz, false);
  const extraNames = (hydrated.extraServiceIds ?? [])
    .map((id) => db.services.find((s) => s.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const serviceSummary = [hydrated.service.name, ...extraNames].join(' + ');
  const manageUrl = `${env.appUrl}/cita/${hydrated.manageToken}`;
  const messagePreview = `Hola ${hydrated.client.fullName}, te recordamos tu cita en ${settings.name} (${hydrated.bookingCode}) de ${serviceSummary} con ${hydrated.staff.name} el ${dateLabel} a las ${timeLabel}. Gestiona tu cita aquí: ${manageUrl}`;
  const waMeUrl = buildWhatsAppLink(hydrated.client.phoneE164, messagePreview);

  const createdLogs: ScheduledNotification[] = [];
  const nowIso = new Date().toISOString();

  if (channel === 'whatsapp' || channel === 'both') {
    const waRes = await dispatchWhatsAppNotification({
      toPhoneE164: hydrated.client.phoneE164,
      bodyText: messagePreview,
    });
    createdLogs.push({
      id: generateId('ntf'),
      bookingId: hydrated.id,
      workflowId: null,
      channel: 'whatsapp',
      recipient: hydrated.client.phoneE164,
      scheduledFor: nowIso,
      status: waRes.status,
      subject: `Recordatorio manual (${hydrated.bookingCode})`,
      previewText: messagePreview.slice(0, 160),
      providerMessageId: waRes.providerMessageId,
      errorMessage: waRes.errorMessage,
      sentAt: waRes.status === 'sent' ? nowIso : null,
      createdAt: nowIso,
    });
  }

  if (channel === 'email' || channel === 'both') {
    if (!hydrated.client.email) {
      if (channel === 'email') {
        throw new PolicyError(
          'CLIENT_NO_EMAIL',
          'La clienta no tiene correo registrado para enviar recordatorio por email.',
        );
      }
    } else {
      const subject = `Recordatorio de tu cita en ${settings.name} (${hydrated.bookingCode})`;
      const emailRes = await dispatchEmailNotification({
        to: hydrated.client.email,
        subject,
        bodyText: messagePreview,
        booking: hydrated,
        settings,
        appUrl: env.appUrl,
      });
      createdLogs.push({
        id: generateId('ntf'),
        bookingId: hydrated.id,
        workflowId: null,
        channel: 'email',
        recipient: hydrated.client.email,
        scheduledFor: nowIso,
        status: emailRes.status,
        subject,
        previewText: messagePreview.slice(0, 160),
        providerMessageId: emailRes.providerMessageId,
        errorMessage: emailRes.errorMessage,
        sentAt: emailRes.status === 'sent' ? nowIso : null,
        createdAt: nowIso,
      });
    }
  }

  await withWriteLock((liveDb) => {
    liveDb.notifications.unshift(...createdLogs);
  });

  return {
    ok: true,
    bookingId: hydrated.id,
    channel,
    waMeUrl,
    messagePreview,
    logs: createdLogs,
  };
}

export async function updateSalonSettings(
  patch: Partial<Omit<SalonSettings, 'landingContent'>> & {
    landingContent?: Partial<SalonSettings['landingContent']>;
  },
): Promise<SalonSettings> {
  return withWriteLock((db) => {
    db.settings = {
      ...db.settings,
      ...patch,
      landingContent: patch.landingContent
        ? { ...db.settings.landingContent, ...patch.landingContent }
        : db.settings.landingContent,
      updatedAt: new Date().toISOString(),
    };
    publishRealtimeEvent('settings_updated');
    return db.settings;
  });
}

export async function saveOnboardingSetup(params: {
  businessType?: string;
  teamSizeTier?: string;
  salonName?: string;
  serviceMode?: 'studio' | 'home' | 'online';
  address?: string;
  soundAlertsEnabled?: boolean;
  onboardingCompleted?: boolean;
  starterService?: {
    id?: string;
    name: string;
    priceCents: number;
    durationMinutes: number;
    isStartingPrice?: boolean;
  };
}): Promise<{ settings: SalonSettings; starterService: Service | null }> {
  return withWriteLock((db) => {
    const nowIso = new Date().toISOString();
    db.settings = {
      ...db.settings,
      ...(params.salonName?.trim() ? { name: params.salonName.trim() } : {}),
      ...(params.businessType !== undefined ? { businessType: params.businessType } : {}),
      ...(params.teamSizeTier !== undefined ? { teamSizeTier: params.teamSizeTier } : {}),
      ...(params.serviceMode !== undefined ? { serviceMode: params.serviceMode } : {}),
      ...(params.address !== undefined ? { address: params.address } : {}),
      ...(params.soundAlertsEnabled !== undefined
        ? { soundAlertsEnabled: params.soundAlertsEnabled }
        : {}),
      ...(params.onboardingCompleted !== undefined
        ? { onboardingCompleted: params.onboardingCompleted }
        : {}),
      updatedAt: nowIso,
    };

    let starterService: Service | null = null;
    if (params.starterService) {
      const existing = params.starterService.id
        ? db.services.find((s) => s.id === params.starterService?.id)
        : null;
      if (existing) {
        existing.name = params.starterService.name;
        existing.priceCents = params.starterService.priceCents;
        existing.durationMinutes = params.starterService.durationMinutes;
        if (params.starterService.isStartingPrice !== undefined) {
          existing.isStartingPrice = params.starterService.isStartingPrice;
        }
        starterService = existing;
      } else {
        const depositCents = db.settings.depositAmountCents ?? 20000;
        const created: Service = {
          id: generateId('srv'),
          categoryId: db.categories[0]?.id ?? null,
          name: params.starterService.name,
          slug: `${slugify(params.starterService.name)}-${generateId().slice(0, 6)}`,
          description: '',
          durationMinutes: params.starterService.durationMinutes,
          priceCents: params.starterService.priceCents,
          isStartingPrice: params.starterService.isStartingPrice ?? false,
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 0,
          requiresConfirmation: depositCents > 0,
          depositRequired: depositCents > 0,
          depositAmountCents: depositCents,
          allowInspoPhoto: true,
          isActive: true,
          isFeatured: true,
          displayOrder: db.services.length,
          imageUrl: null,
        };
        db.services.push(created);
        for (const st of db.staff) {
          if (!st.serviceIds.includes(created.id)) {
            st.serviceIds.push(created.id);
          }
        }
        starterService = created;
      }
      publishRealtimeEvent('availability_updated');
    }

    publishRealtimeEvent('settings_updated');
    return { settings: db.settings, starterService };
  });
}

export async function upsertService(
  input: Partial<Service> & { name: string; durationMinutes: number; priceCents: number },
): Promise<Service> {
  return withWriteLock((db) => {
    const existing = input.id ? db.services.find((s) => s.id === input.id) : null;
    if (existing) {
      Object.assign(existing, input);
      publishRealtimeEvent('availability_updated');
      return existing;
    }
    const created: Service = {
      id: generateId('srv'),
      categoryId: input.categoryId ?? db.categories[0]?.id ?? null,
      name: input.name,
      slug: input.slug || `${slugify(input.name)}-${generateId().slice(0, 6)}`,
      description: input.description ?? '',
      durationMinutes: input.durationMinutes,
      priceCents: input.priceCents,
      isStartingPrice: input.isStartingPrice ?? false,
      bufferBeforeMinutes: input.bufferBeforeMinutes ?? 0,
      bufferAfterMinutes: input.bufferAfterMinutes ?? 15,
      requiresConfirmation: input.requiresConfirmation ?? false,
      depositRequired: input.depositRequired ?? false,
      depositAmountCents: input.depositAmountCents ?? 0,
      allowInspoPhoto: input.allowInspoPhoto ?? true,
      isActive: input.isActive ?? true,
      isFeatured: input.isFeatured ?? true,
      displayOrder: db.services.length,
      imageUrl: input.imageUrl ?? null,
    };
    db.services.push(created);
    for (const st of db.staff) {
      if (!st.serviceIds.includes(created.id)) st.serviceIds.push(created.id);
    }
    publishRealtimeEvent('availability_updated');
    return created;
  });
}

export async function upsertAddon(
  input: Partial<ServiceAddon> & { name: string; extraMinutes: number; extraPriceCents: number },
): Promise<ServiceAddon> {
  return withWriteLock((db) => {
    const existing = input.id ? db.addons.find((a) => a.id === input.id) : null;
    if (existing) {
      Object.assign(existing, input);
      return existing;
    }
    const created: ServiceAddon = {
      id: `addon-${crypto.randomUUID().slice(0, 8)}`,
      name: input.name,
      description: input.description ?? '',
      extraMinutes: input.extraMinutes,
      extraPriceCents: input.extraPriceCents,
      appliesToAll: input.appliesToAll ?? true,
      serviceIds: input.serviceIds ?? [],
      isActive: input.isActive ?? true,
      displayOrder: db.addons.length,
    };
    db.addons.push(created);
    return created;
  });
}

export async function saveStaffSchedule(
  staffId: string,
  rules: AvailabilityRule[],
): Promise<void> {
  await withWriteLock((db) => {
    let sched = db.schedules.find((s) => s.staffId === staffId && s.isDefault);
    if (!sched) {
      sched = {
        id: `sched-${crypto.randomUUID().slice(0, 6)}`,
        staffId,
        name: 'Horario habitual',
        timezone: db.settings.timezone,
        isDefault: true,
        rules: [],
      };
      db.schedules.push(sched);
    }
    sched.rules = rules;
    publishRealtimeEvent('availability_updated', { staffId });
  });
}

export async function addDateOverride(
  override: Omit<DateOverride, 'id'>,
): Promise<DateOverride> {
  return withWriteLock((db) => {
    db.dateOverrides = db.dateOverrides.filter(
      (o) => !(o.staffId === override.staffId && o.overrideDate === override.overrideDate),
    );
    const created: DateOverride = {
      ...override,
      id: `ovr-${crypto.randomUUID().slice(0, 8)}`,
    };
    db.dateOverrides.push(created);
    publishRealtimeEvent('availability_updated', { staffId: override.staffId });
    return created;
  });
}

export async function deleteDateOverride(id: string): Promise<void> {
  await withWriteLock((db) => {
    db.dateOverrides = db.dateOverrides.filter((o) => o.id !== id);
    publishRealtimeEvent('availability_updated');
  });
}

export async function upsertStaffMember(
  input: Partial<StaffMember> & { name: string },
): Promise<StaffMember> {
  return withWriteLock((db) => {
    const existing = input.id ? db.staff.find((s) => s.id === input.id) : null;
    if (existing) {
      Object.assign(existing, input);
      return existing;
    }
    const created: StaffMember = {
      id: `staff-${crypto.randomUUID().slice(0, 8)}`,
      name: input.name,
      roleTitle: input.roleTitle || 'Nail Artist',
      bio: input.bio || '',
      avatarUrl: input.avatarUrl ?? null,
      bookingSlug: input.bookingSlug || slugify(input.name),
      commissionPercent: input.commissionPercent ?? db.settings.defaultCommissionPercent,
      isActive: input.isActive ?? true,
      displayOrder: db.staff.length,
      serviceIds: input.serviceIds ?? db.services.map((s) => s.id),
    };
    db.staff.push(created);
    db.schedules.push({
      id: `sched-${created.id}`,
      staffId: created.id,
      name: 'Horario habitual',
      timezone: db.settings.timezone,
      isDefault: true,
      rules: [
        { id: `r-${created.id}-1`, dayOfWeek: 1, startTime: '10:00', endTime: '18:00' },
        { id: `r-${created.id}-2`, dayOfWeek: 2, startTime: '10:00', endTime: '18:00' },
        { id: `r-${created.id}-3`, dayOfWeek: 3, startTime: '10:00', endTime: '18:00' },
        { id: `r-${created.id}-4`, dayOfWeek: 4, startTime: '10:00', endTime: '18:00' },
        { id: `r-${created.id}-5`, dayOfWeek: 5, startTime: '10:00', endTime: '18:00' },
        { id: `r-${created.id}-6`, dayOfWeek: 6, startTime: '10:00', endTime: '16:00' },
      ],
    });
    return created;
  });
}

export async function upsertAdminUser(
  input: Omit<AdminUser, 'id' | 'createdAt'> & { id?: string },
): Promise<AdminUser> {
  return withWriteLock((db) => {
    const existing = input.id
      ? db.adminUsers.find((u) => u.id === input.id)
      : db.adminUsers.find((u) => u.email.toLowerCase() === input.email.toLowerCase());
    if (existing) {
      Object.assign(existing, input);
      return existing;
    }
    const created: AdminUser = {
      id: `adm-${crypto.randomUUID().slice(0, 8)}`,
      email: input.email.trim().toLowerCase(),
      fullName: input.fullName.trim(),
      role: input.role,
      staffMemberId: input.staffMemberId ?? null,
      isActive: input.isActive ?? true,
      createdAt: new Date().toISOString(),
    };
    db.adminUsers.push(created);
    return created;
  });
}

export async function createClientProfile(params: {
  fullName: string;
  phone: string;
  email?: string | null;
  instagramHandle?: string | null;
  birthday?: string | null;
  notes?: string;
}): Promise<ClientProfile> {
  const normalizedInstagram = normalizeInstagramHandle(params.instagramHandle);
  return withWriteLock((db) => {
    const phoneE164 = normalizePhoneE164(params.phone);
    const existing = db.clients.find((c) => c.phoneE164 === phoneE164);
    if (existing) {
      throw new PolicyError(
        'CLIENT_EXISTS',
        'Ya existe una clienta registrada con ese número de teléfono.',
      );
    }
    const nowIso = new Date().toISOString();
    const created: ClientProfile = {
      id: generateId('cli'),
      fullName: params.fullName.trim(),
      phoneE164,
      email: params.email?.trim() || null,
      ...(normalizedInstagram ? { instagramHandle: normalizedInstagram } : {}),
      birthday: params.birthday?.trim() || null,
      notes: params.notes?.trim() || '',
      noShowCount: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    db.clients.unshift(created);
    return created;
  });
}

export async function updateClientNotes(params: {
  clientId: string;
  notes?: string;
  birthday?: string | null;
  email?: string | null;
  instagramHandle?: string | null;
}): Promise<ClientProfile> {
  const hasInstagramUpdate = params.instagramHandle !== undefined;
  const normalizedInstagram = hasInstagramUpdate
    ? normalizeInstagramHandle(params.instagramHandle)
    : undefined;
  return withWriteLock((db) => {
    const client = db.clients.find((c) => c.id === params.clientId);
    if (!client) throw new PolicyError('CLIENT_NOT_FOUND', 'Clienta no encontrada.');
    if (params.notes !== undefined) client.notes = params.notes;
    if (params.birthday !== undefined) client.birthday = params.birthday;
    if (params.email !== undefined) client.email = params.email;
    if (hasInstagramUpdate) {
      client.instagramHandle = normalizedInstagram;
    }
    client.updatedAt = new Date().toISOString();
    return client;
  });
}

export async function addWaitlistEntry(
  input: Omit<WaitlistEntry, 'id' | 'status' | 'notifiedAt' | 'createdAt'>,
): Promise<WaitlistEntry> {
  return withWriteLock((db) => {
    const entry: WaitlistEntry = {
      ...input,
      clientPhoneE164: normalizePhoneE164(input.clientPhoneE164),
      id: `wl-${crypto.randomUUID().slice(0, 8)}`,
      status: 'waiting',
      notifiedAt: null,
      createdAt: new Date().toISOString(),
    };
    db.waitlist.unshift(entry);
    publishRealtimeEvent('waitlist_updated');
    return entry;
  });
}

export async function updateWaitlistStatus(
  id: string,
  status: WaitlistEntry['status'],
): Promise<WaitlistEntry> {
  return withWriteLock((db) => {
    const entry = db.waitlist.find((w) => w.id === id);
    if (!entry) throw new PolicyError('WAITLIST_NOT_FOUND', 'Registro no encontrado.');
    entry.status = status;
    if (status === 'notified') entry.notifiedAt = new Date().toISOString();
    publishRealtimeEvent('waitlist_updated');
    return entry;
  });
}

export async function submitBookingReview(params: {
  manageToken: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string;
  clickedGoogleReview?: boolean;
}): Promise<BookingReview> {
  return withWriteLock((db) => {
    const booking = db.bookings.find((b) => b.manageToken === params.manageToken);
    if (!booking) throw new PolicyError('BOOKING_NOT_FOUND', 'Cita no encontrada.');
    const existing = db.reviews.find((r) => r.bookingId === booking.id);
    if (existing) {
      existing.rating = params.rating;
      existing.comment = params.comment;
      if (params.clickedGoogleReview) existing.clickedGoogleReview = true;
      return existing;
    }
    const review: BookingReview = {
      id: `rev-${crypto.randomUUID().slice(0, 8)}`,
      bookingId: booking.id,
      clientId: booking.clientId,
      staffId: booking.staffId,
      rating: params.rating,
      comment: params.comment,
      clickedGoogleReview: Boolean(params.clickedGoogleReview),
      createdAt: new Date().toISOString(),
    };
    db.reviews.unshift(review);
    return review;
  });
}

export async function upsertCoupon(
  input: Omit<Coupon, 'id' | 'usedCount' | 'createdAt'> & { id?: string },
): Promise<Coupon> {
  return withWriteLock((db) => {
    const existing = input.id ? db.coupons.find((c) => c.id === input.id) : null;
    if (existing) {
      Object.assign(existing, { ...input, code: input.code.trim().toUpperCase() });
      return existing;
    }
    const created: Coupon = {
      ...input,
      id: `cp-${crypto.randomUUID().slice(0, 8)}`,
      code: input.code.trim().toUpperCase(),
      usedCount: 0,
      remainingBalanceCents:
        input.kind === 'gift_card' ? input.discountValue : null,
      createdAt: new Date().toISOString(),
    };
    db.coupons.unshift(created);
    return created;
  });
}

export async function adjustInventoryItem(params: {
  itemId?: string;
  newItem?: Omit<InventoryItem, 'id' | 'updatedAt'>;
  delta?: number;
  reason?: 'restock' | 'service_usage' | 'retail_sale' | 'adjustment';
  notes?: string;
  createdBy?: string;
}): Promise<InventoryItem> {
  return withWriteLock((db) => {
    const nowIso = new Date().toISOString();
    if (params.newItem) {
      const created: InventoryItem = {
        ...params.newItem,
        id: `inv-${crypto.randomUUID().slice(0, 8)}`,
        updatedAt: nowIso,
      };
      db.inventory.unshift(created);
      return created;
    }

    const item = db.inventory.find((i) => i.id === params.itemId);
    if (!item) throw new PolicyError('ITEM_NOT_FOUND', 'Producto no encontrado.');
    const delta = params.delta ?? 0;
    item.stockQuantity = Math.max(0, Number((item.stockQuantity + delta).toFixed(2)));
    item.updatedAt = nowIso;

    db.inventoryMovements.unshift({
      id: `imv-${crypto.randomUUID().slice(0, 8)}`,
      itemId: item.id,
      delta,
      reason: params.reason ?? 'adjustment',
      notes: params.notes ?? '',
      bookingId: null,
      createdBy: params.createdBy ?? 'Admin',
      createdAt: nowIso,
    });

    if (params.reason === 'retail_sale' && delta < 0 && item.retailPriceCents > 0) {
      const qty = Math.abs(delta);
      db.cashEntries.unshift({
        id: `cash-${crypto.randomUUID().slice(0, 8)}`,
        bookingId: null,
        staffId: null,
        entryType: 'product_sale',
        description: `Venta producto: ${item.name} (x${qty})`,
        amountCents: Math.round(item.retailPriceCents * qty),
        tipCents: 0,
        commissionCents: Math.round(item.retailPriceCents * qty * 0.1),
        paymentMethod: 'cash',
        occurredAt: nowIso,
        recordedBy: params.createdBy ?? 'Admin',
      });
    }

    return item;
  });
}

export async function addCashEntry(
  input: Omit<CashRegisterEntry, 'id' | 'occurredAt'>,
): Promise<CashRegisterEntry> {
  return withWriteLock((db) => {
    const created: CashRegisterEntry = {
      ...input,
      id: `cash-${crypto.randomUUID().slice(0, 8)}`,
      occurredAt: new Date().toISOString(),
    };
    db.cashEntries.unshift(created);
    return created;
  });
}

export async function updateWorkflow(
  id: string,
  patch: Partial<NotificationWorkflow>,
): Promise<NotificationWorkflow> {
  return withWriteLock((db) => {
    const wf = db.workflows.find((w) => w.id === id);
    if (!wf) throw new PolicyError('WORKFLOW_NOT_FOUND', 'Workflow no encontrado.');
    Object.assign(wf, patch);
    return wf;
  });
}

export async function updateCalendarConnection(
  staffId: string,
  patch: Partial<CalendarConnection>,
): Promise<CalendarConnection> {
  return withWriteLock((db) => {
    let conn = db.calendarConnections.find((c) => c.staffId === staffId);
    if (!conn) {
      conn = {
        id: `gcal-${staffId}`,
        staffId,
        provider: 'google',
        accountEmail: 'calendario@nails.studio',
        destinationCalendarId: 'primary',
        conflictCalendarIds: ['primary'],
        availableCalendars: [{ id: 'primary', summary: 'Principal', primary: true }],
        isConnected: false,
        lastSyncedAt: null,
        externalBusyBlocks: [],
      };
      db.calendarConnections.push(conn);
    }
    Object.assign(conn, patch, { lastSyncedAt: new Date().toISOString() });
    publishRealtimeEvent('availability_updated', { staffId });
    return conn;
  });
}

export async function upsertGalleryItem(
  input: Omit<GalleryItem, 'id' | 'displayOrder'> & { id?: string },
): Promise<GalleryItem> {
  return withWriteLock((db) => {
    const existing = input.id ? db.gallery.find((g) => g.id === input.id) : null;
    if (existing) {
      Object.assign(existing, input);
      return existing;
    }
    const created: GalleryItem = {
      ...input,
      id: `gal-${crypto.randomUUID().slice(0, 8)}`,
      displayOrder: db.gallery.length,
    };
    db.gallery.push(created);
    return created;
  });
}

export async function deleteGalleryItem(id: string): Promise<void> {
  await withWriteLock((db) => {
    db.gallery = db.gallery.filter((g) => g.id !== id);
  });
}

export async function processDueScheduledNotifications(
  dispatcher: (params: {
    notification: ScheduledNotification;
    booking: BookingWithRelations;
    settings: SalonSettings;
  }) => Promise<{
    status: 'sent' | 'failed';
    providerMessageId: string | null;
    errorMessage: string | null;
  }>,
  nowMs = Date.now(),
): Promise<{
  processed: number;
  sentCount: number;
  failedCount: number;
  canceledCount: number;
}> {
  return withWriteLock(async (db) => {
    const due = db.notifications.filter(
      (n) => n.status === 'pending' && new Date(n.scheduledFor).getTime() <= nowMs,
    );

    let sentCount = 0;
    let failedCount = 0;
    let canceledCount = 0;

    for (const item of due) {
      const rawBooking = db.bookings.find((b) => b.id === item.bookingId);
      if (!rawBooking || rawBooking.status === 'canceled' || rawBooking.status === 'no_show') {
        item.status = 'canceled';
        canceledCount += 1;
        continue;
      }

      const hydrated = hydrateBooking(db, rawBooking);
      const res = await dispatcher({
        notification: { ...item },
        booking: hydrated,
        settings: db.settings,
      });

      item.status = res.status;
      item.providerMessageId = res.providerMessageId;
      item.errorMessage = res.errorMessage;
      if (res.status === 'sent') {
        item.sentAt = new Date().toISOString();
        sentCount += 1;
      } else {
        item.sentAt = null;
        failedCount += 1;
      }
    }

    return {
      processed: due.length,
      sentCount,
      failedCount,
      canceledCount,
    };
  });
}

function getNextQuickSlots(serviceId: string, staffId?: string | null) {
  const db = getSnapshot();
  const service = db.services.find((s) => s.id === serviceId);
  if (!service) return [];
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: db.settings.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const eligibleStaff = db.staff.filter(
    (st) => st.isActive && (st.serviceIds.length === 0 || st.serviceIds.includes(service.id)),
  );
  const found: Array<AvailableSlot & { date: string }> = [];
  for (let i = 0; i < 14 && found.length < 6; i++) {
    const dt = new Date(Date.now() + i * 86_400_000);
    const dateKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: db.settings.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(dt);
    if (dateKey < today) continue;
    const slots = getAvailableSlotsForDate(
      {
        settings: db.settings,
        service,
        addons: [],
        staffMembers: eligibleStaff,
        schedules: db.schedules,
        dateOverrides: db.dateOverrides,
        bookings: db.bookings,
        slotHolds: db.slotHolds,
        calendarConnections: db.calendarConnections,
      },
      dateKey,
      staffId || null,
    );
    for (const s of slots.slice(0, 2)) {
      found.push({ ...s, date: dateKey });
      if (found.length >= 6) break;
    }
  }
  return found;
}

function getDemoOutboxStore(): OutboxEventRecord[] {
  if (!globalThis.nailsDemoOutbox) {
    globalThis.nailsDemoOutbox = [];
  }
  return globalThis.nailsDemoOutbox;
}

function createDemoRepository(clock: Clock = systemClock): SalonRepository {
  return {
    async getSnapshot() {
      return getSnapshot();
    },
    async getPublicBootstrap(): Promise<PublicBootstrapData> {
      const db = getSnapshot();
      const reviewsCount = db.reviews.length;
      const average =
        reviewsCount > 0
          ? Number(
              (
                db.reviews.reduce((sum, r) => sum + r.rating, 0) / reviewsCount
              ).toFixed(1),
            )
          : 5.0;
      return {
        settings: toPublicSettingsDTO(db.settings),
        categories: db.categories.toSorted((a, b) => a.displayOrder - b.displayOrder),
        services: db.services
          .filter((s) => s.isActive)
          .toSorted((a, b) => a.displayOrder - b.displayOrder)
          .map(toPublicServiceDTO),
        addons: db.addons
          .filter((a) => a.isActive)
          .toSorted((a, b) => a.displayOrder - b.displayOrder),
        staff: db.staff
          .filter((s) => s.isActive)
          .toSorted((a, b) => a.displayOrder - b.displayOrder)
          .map(toPublicStaffDTO),
        gallery: db.gallery.toSorted((a, b) => a.displayOrder - b.displayOrder),
        reviewsSummary: { count: reviewsCount, average },
      };
    },
    async getBookingsWithRelations(role, staffMemberId) {
      return getBookingsWithRelations(role, staffMemberId);
    },
    async getBookingByToken(token) {
      return getBookingByToken(token);
    },
    async queryAvailability(params) {
      return queryAvailability(params);
    },
    async getNextQuickSlots(serviceId, staffId) {
      return getNextQuickSlots(serviceId, staffId);
    },
    async validateCouponCode(code, subtotalCents) {
      return validateCouponCode(code, subtotalCents);
    },
    createOrRefreshSlotHold,
    releaseSlotHold,
    createBookingAtomic,
    updateBookingStatus,
    manageClientBookingAction,
    processDueScheduledNotifications,
    async enqueueOutboxEvent(eventType, payload, availableAt) {
      const nowIso = clock.now().toISOString();
      const record: OutboxEventRecord = {
        id: generateId('outbox', clock),
        eventType,
        payload,
        status: 'pending',
        attempts: 0,
        availableAt: availableAt ?? nowIso,
        processedAt: null,
        lastError: null,
        createdAt: nowIso,
      };
      getDemoOutboxStore().push(record);
      return record;
    },
    async dequeueOutboxEvents(limit = 20, nowMs = clock.nowMs()) {
      const store = getDemoOutboxStore();
      const claimed: OutboxEventRecord[] = [];
      for (const item of store) {
        if (claimed.length >= limit) break;
        if (
          item.status === 'pending' &&
          new Date(item.availableAt).getTime() <= nowMs
        ) {
          item.status = 'processing';
          item.attempts += 1;
          claimed.push({ ...item });
        }
      }
      return claimed;
    },
    async ackOutboxEvent(id) {
      const found = getDemoOutboxStore().find((e) => e.id === id);
      if (found) {
        found.status = 'processed';
        found.processedAt = clock.now().toISOString();
      }
    },
    async failOutboxEvent(id, errorMessage, retryAfterMs = 60_000) {
      const found = getDemoOutboxStore().find((e) => e.id === id);
      if (found) {
        found.status = found.attempts >= 5 ? 'failed' : 'pending';
        found.lastError = errorMessage;
        found.availableAt = new Date(clock.nowMs() + retryAfterMs).toISOString();
      }
    },
    updateSalonSettings,
    upsertService,
    upsertAddon,
    saveStaffSchedule,
    addDateOverride,
    deleteDateOverride,
    upsertStaffMember,
    upsertAdminUser,
    updateClientNotes,
    addWaitlistEntry,
    updateWaitlistStatus,
    submitBookingReview,
    upsertCoupon,
    adjustInventoryItem,
    addCashEntry,
    updateWorkflow,
    updateCalendarConnection,
    upsertGalleryItem,
    deleteGalleryItem,
  };
}

export function getRepository(clock: Clock = systemClock): SalonRepository {
  assertProductionEnvValid();
  if (isSupabaseEnabled()) {
    return createSupabaseRepository(clock);
  }
  return createDemoRepository(clock);
}
