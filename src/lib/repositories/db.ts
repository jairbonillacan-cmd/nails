import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createInitialDemoDatabase } from '../demo-seed';
import {
  assertSlotBookable,
  computeServiceTotals,
  findEarliestAvailableSlots,
  findNearestAvailableSlots,
  getAvailabilityForRange,
  getAvailableSlotsForDate,
  type AvailabilityContext,
  type AvailableSlot,
} from '../availability/engine';
import {
  canAwardStamp,
  computeClientLoyaltySummary,
} from '../loyalty/stamps';
import {
  computeBookingPaymentSummary,
  validatePaymentSplits,
  type BookingPaymentSummary,
  type PaymentSplitInput,
} from '../payments/splits';
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
  PublicLoyaltySummarySchema,
  toPublicServiceDTO,
  toPublicSettingsDTO,
  toPublicStaffDTO,
  type PublicLoyaltySummaryDTO,
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
  AuditAction,
  AuditLogEntry,
  AvailabilityRule,
  Booking,
  BookingReview,
  BookingStatus,
  BookingWithRelations,
  CalendarConnection,
  CashRegisterEntry,
  ClientProfile,
  ConsentRecord,
  Coupon,
  CouponRedemption,
  DateOverride,
  DemoDatabase,
  GalleryItem,
  InventoryItem,
  LoyaltyProgram,
  LoyaltyStamp,
  NotificationWorkflow,
  PaymentMethod,
  PaymentSplit,
  PaymentSplitMethod,
  RecurringBlock,
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

interface AuditActor {
  id: string;
  email: string;
  role: AdminRole;
  fullName?: string;
}

interface Phase3Collections {
  paymentSplits: PaymentSplit[];
  recurringBlocks: RecurringBlock[];
  loyaltyPrograms: LoyaltyProgram[];
  loyaltyStamps: LoyaltyStamp[];
  couponRedemptions: CouponRedemption[];
  consents: ConsentRecord[];
  auditLogs: AuditLogEntry[];
}

function ensurePhase3Collections(db: DemoDatabase): Phase3Collections {
  if (!db.paymentSplits) db.paymentSplits = [];
  if (!db.recurringBlocks) db.recurringBlocks = [];
  if (!db.loyaltyPrograms) db.loyaltyPrograms = [];
  if (!db.loyaltyStamps) db.loyaltyStamps = [];
  if (!db.couponRedemptions) db.couponRedemptions = [];
  if (!db.consents) db.consents = [];
  if (!db.auditLogs) db.auditLogs = [];
  return {
    paymentSplits: db.paymentSplits,
    recurringBlocks: db.recurringBlocks,
    loyaltyPrograms: db.loyaltyPrograms,
    loyaltyStamps: db.loyaltyStamps,
    couponRedemptions: db.couponRedemptions,
    consents: db.consents,
    auditLogs: db.auditLogs,
  };
}

function appendAuditLog(
  db: DemoDatabase,
  params: {
    actor: AuditActor;
    action: AuditAction;
    entityType: string;
    entityId: string;
    metadata?: Record<string, string | number | boolean | null>;
  },
): AuditLogEntry {
  const cols = ensurePhase3Collections(db);
  const entry: AuditLogEntry = {
    id: generateId('aud'),
    actorId: params.actor.id,
    actorEmail: params.actor.email,
    actorRole: params.actor.role,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    metadata: params.metadata ?? {},
    createdAt: new Date().toISOString(),
  };
  cols.auditLogs.unshift(entry);
  if (cols.auditLogs.length > 500) {
    cols.auditLogs.length = 500;
  }
  return entry;
}

export async function recordAuditEvent(params: {
  actor: AuditActor;
  action: AuditAction;
  entityType: string;
  entityId: string;
  metadata?: Record<string, string | number | boolean | null>;
}): Promise<AuditLogEntry> {
  return withWriteLock((db) => appendAuditLog(db, params));
}

function mapSplitMethodToCashMethod(method: PaymentSplitMethod): PaymentMethod {
  if (method === 'giftcard') return 'gift_card';
  if (method === 'online') return 'card';
  return method;
}

function getEffectiveGiftCardBalance(db: DemoDatabase, coupon: Coupon): number {
  const redemptions = (db.couponRedemptions ?? []).filter(
    (r) => r.couponId === coupon.id,
  );
  if (redemptions.length === 0) {
    return coupon.remainingBalanceCents ?? coupon.discountValue;
  }
  const activeUsed = redemptions
    .filter((r) => r.status === 'active')
    .reduce((sum, r) => sum + r.amountCents, 0);
  return Math.max(0, coupon.discountValue - activeUsed);
}

function awardLoyaltyStampInLock(db: DemoDatabase, booking: Booking): LoyaltyStamp | null {
  const cols = ensurePhase3Collections(db);
  const activeProgram = cols.loyaltyPrograms.find((p) => p.isActive);
  if (!activeProgram) return null;
  const tz = db.settings.timezone || 'America/Mexico_City';
  const stampedDate = getDateKeyInTimezone(new Date(), tz);
  if (
    !canAwardStamp(cols.loyaltyStamps, {
      clientId: booking.clientId,
      programId: activeProgram.id,
      stampedDate,
    })
  ) {
    return null;
  }
  const stamp: LoyaltyStamp = {
    id: generateId('lst'),
    clientId: booking.clientId,
    bookingId: booking.id,
    programId: activeProgram.id,
    stampedDate,
    createdAt: new Date().toISOString(),
  };
  cols.loyaltyStamps.unshift(stamp);
  return stamp;
}

async function dispatchSalonBookingAlert(params: {
  booking: BookingWithRelations;
  settings: SalonSettings;
  kind: 'canceled' | 'rescheduled';
  reason?: string;
}): Promise<void> {
  const env = getRuntimeIntegrationStatus();
  const tz = params.settings.timezone || 'America/Mexico_City';
  const dateLabel = formatDateLongInTimezone(params.booking.startAt, tz);
  const timeLabel = formatTimeInTimezone(params.booking.startAt, tz, false);
  const subject =
    params.kind === 'canceled'
      ? `Aviso al estudio: cita cancelada (${params.booking.bookingCode})`
      : `Aviso al estudio: cita reagendada (${params.booking.bookingCode})`;
  const bodyText =
    params.kind === 'canceled'
      ? `La clienta ${params.booking.client.fullName} canceló su cita ${params.booking.bookingCode} (${params.booking.service.name} con ${params.booking.staff.name}). Motivo: ${params.reason || 'Sin motivo especificado'}.`
      : `La clienta ${params.booking.client.fullName} reagendó su cita ${params.booking.bookingCode} (${params.booking.service.name} con ${params.booking.staff.name}) para el ${dateLabel} a las ${timeLabel}.`;

  const createdLogs: ScheduledNotification[] = [];
  const nowIso = new Date().toISOString();

  if (params.settings.whatsappNumber.trim()) {
    const waRes = await dispatchWhatsAppNotification({
      toPhoneE164: params.settings.whatsappNumber,
      bodyText,
    });
    createdLogs.push({
      id: generateId('ntf'),
      bookingId: params.booking.id,
      workflowId: null,
      channel: 'whatsapp',
      recipient: params.settings.whatsappNumber,
      scheduledFor: nowIso,
      status: waRes.status,
      subject,
      previewText: bodyText.slice(0, 160),
      providerMessageId: waRes.providerMessageId,
      errorMessage: waRes.errorMessage,
      sentAt: waRes.status === 'sent' ? nowIso : null,
      createdAt: nowIso,
    });
  }

  if (params.settings.contactEmail.trim()) {
    const emailRes = await dispatchEmailNotification({
      to: params.settings.contactEmail,
      subject,
      bodyText,
      booking: params.booking,
      settings: params.settings,
      appUrl: env.appUrl,
    });
    createdLogs.push({
      id: generateId('ntf'),
      bookingId: params.booking.id,
      workflowId: null,
      channel: 'email',
      recipient: params.settings.contactEmail,
      scheduledFor: nowIso,
      status: emailRes.status,
      subject,
      previewText: bodyText.slice(0, 160),
      providerMessageId: emailRes.providerMessageId,
      errorMessage: emailRes.errorMessage,
      sentAt: emailRes.status === 'sent' ? nowIso : null,
      createdAt: nowIso,
    });
  }

  if (createdLogs.length > 0) {
    await withWriteLock((liveDb) => {
      liveDb.notifications.unshift(...createdLogs);
    });
  }
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
  privacyConsentAccepted?: boolean;
  marketingOptIn?: boolean;
  enforceMaxActiveBookings?: boolean;
  actor?: AuditActor;
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
      recurringBlocks: db.recurringBlocks ?? [],
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

export function quickSearchAvailability(params: {
  serviceId: string;
  extraServiceIds?: string[];
  addonIds: string[];
  staffId?: string | null;
  startDate: string;
  days: number;
  limit?: number;
  sessionToken?: string | null;
}) {
  const db = getSnapshot();
  const service = db.services.find((s) => s.id === params.serviceId && s.isActive);
  if (!service) {
    throw new PolicyError('SERVICE_NOT_FOUND', 'Servicio no encontrado.');
  }
  const extraServices = resolveExtraServices(db, service.id, params.extraServiceIds);
  const addons = db.addons.filter((a) => params.addonIds.includes(a.id) && a.isActive);
  const requiredServiceIds = [service.id, ...extraServices.map((s) => s.id)];
  const eligibleStaff = db.staff.filter((st) =>
    isStaffEligibleForAllServices(st, requiredServiceIds),
  );

  const slots = findEarliestAvailableSlots(
    {
      settings: db.settings,
      service,
      extraServices,
      addons,
      staffMembers: eligibleStaff,
      schedules: db.schedules,
      dateOverrides: db.dateOverrides,
      recurringBlocks: db.recurringBlocks ?? [],
      bookings: db.bookings,
      slotHolds: db.slotHolds,
      calendarConnections: db.calendarConnections,
      callerSessionToken: params.sessionToken,
    },
    params.startDate,
    Math.min(Math.max(params.days, 1), 45),
    Math.min(Math.max(params.limit ?? 12, 1), 30),
    params.staffId || null,
  );

  const totals = computeServiceTotals(service, addons, extraServices);
  return {
    service,
    extraServices,
    addons,
    totals,
    slots,
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

function validateCouponInDb(
  db: DemoDatabase,
  code: string,
  subtotalCents: number,
  clientId?: string | null,
) {
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

  if (coupon.kind === 'coupon' && clientId) {
    const hasActiveRedemption = (db.couponRedemptions ?? []).some(
      (r) =>
        r.couponId === coupon.id &&
        r.clientId === clientId &&
        r.status === 'active',
    );
    if (hasActiveRedemption) {
      return {
        valid: false as const,
        error: 'Ya usaste este cupón en una cita activa.',
      };
    }
  }

  let discountCents = 0;
  if (coupon.kind === 'gift_card') {
    const balance = getEffectiveGiftCardBalance(db, coupon);
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

export function validateCouponCode(
  code: string,
  subtotalCents: number,
  clientId?: string | null,
) {
  const db = getSnapshot();
  return validateCouponInDb(db, code, subtotalCents, clientId);
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
    recurringBlocks: db.recurringBlocks ?? [],
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
      const cols = ensurePhase3Collections(db);
      const normalizedCode = effect.couponCode.trim().toUpperCase();
      const coupon = db.coupons.find((c) => c.code.toUpperCase() === normalizedCode);
      const releasedAt = new Date().toISOString();
      let releasedRedemptionCount = 0;
      for (const redemption of cols.couponRedemptions) {
        if (
          redemption.bookingId === booking.id &&
          redemption.status === 'active' &&
          (!coupon || redemption.couponId === coupon.id)
        ) {
          redemption.status = 'released';
          redemption.releasedAt = releasedAt;
          releasedRedemptionCount += 1;
        }
      }
      if (coupon) {
        coupon.usedCount = Math.max(0, coupon.usedCount - 1);
        if (coupon.kind === 'gift_card') {
          if (releasedRedemptionCount > 0) {
            coupon.remainingBalanceCents = getEffectiveGiftCardBalance(db, coupon);
          } else {
            const currentBalance = coupon.remainingBalanceCents ?? 0;
            coupon.remainingBalanceCents = Math.min(
              coupon.discountValue,
              currentBalance + effect.discountCents,
            );
          }
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
    const cols = ensurePhase3Collections(db);

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

    const now = new Date();
    const nowIso = now.toISOString();
    const phoneE164 = normalizePhoneE164(params.clientPhone);
    const existingClient = db.clients.find((c) => c.phoneE164 === phoneE164);

    if (params.enforceMaxActiveBookings && existingClient) {
      const maxActive = db.settings.maxActiveBookingsPerClient ?? 3;
      const activeFutureCount = db.bookings.filter(
        (b) =>
          b.clientId === existingClient.id &&
          isActiveBookingStatus(b.status) &&
          new Date(b.endAt).getTime() > now.getTime(),
      ).length;
      if (activeFutureCount >= maxActive) {
        throw new PolicyError(
          'MAX_ACTIVE_BOOKINGS',
          `Ya cuentas con ${activeFutureCount} citas activas (límite máximo: ${maxActive}). Cancela o reagenda una cita existente antes de agendar otra.`,
        );
      }
    }

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
    let appliedCoupon: Coupon | null = null;
    if (params.couponCode?.trim()) {
      const check = validateCouponInDb(
        db,
        params.couponCode,
        subtotalCents,
        existingClient?.id ?? null,
      );
      if (!check.valid) {
        throw new PolicyError('COUPON_INVALID', check.error);
      }
      discountCents = check.discountCents;
      appliedCoupon = check.coupon;
    }

    let client = existingClient;
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
      couponCode: appliedCoupon ? appliedCoupon.code : null,
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

    if (appliedCoupon) {
      cols.couponRedemptions.unshift({
        id: generateId('cred'),
        couponId: appliedCoupon.id,
        bookingId: booking.id,
        clientId: client.id,
        amountCents: discountCents,
        status: 'active',
        createdAt: nowIso,
        releasedAt: null,
      });
      appliedCoupon.usedCount += 1;
      if (appliedCoupon.kind === 'gift_card') {
        appliedCoupon.remainingBalanceCents = getEffectiveGiftCardBalance(
          db,
          appliedCoupon,
        );
      }
    }

    if (params.privacyConsentAccepted) {
      cols.consents.unshift({
        id: generateId('cns'),
        clientId: client.id,
        bookingId: booking.id,
        policyVersion: db.settings.privacyPolicyVersion || '2026-11',
        acceptedAt: nowIso,
        marketingOptIn: Boolean(params.marketingOptIn),
      });
    }

    if (typeof params.customPriceCents === 'number' && params.actor) {
      appendAuditLog(db, {
        actor: params.actor,
        action: 'booking_price_override',
        entityType: 'booking',
        entityId: booking.id,
        metadata: {
          bookingCode: booking.bookingCode,
          computedSubtotalCents: computedTotals.subtotalCents,
          customPriceCents: params.customPriceCents,
        },
      });
    }

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
  actor?: AuditActor;
}): Promise<BookingWithRelations> {
  const committed = await withWriteLock((db) => {
    const cols = ensurePhase3Collections(db);
    const booking = db.bookings.find((b) => b.id === params.bookingId);
    if (!booking) throw new PolicyError('BOOKING_NOT_FOUND', 'Cita no encontrada.');

    const isPast = new Date(booking.endAt).getTime() < Date.now();
    const pastLockActive = db.settings.lockPastBookings !== false;
    if (pastLockActive && isPast && params.actor && params.actor.role !== 'owner') {
      throw new PolicyError(
        'PAST_BOOKING_LOCKED',
        'Las citas pasadas están bloqueadas; solo la Dueña puede modificarlas.',
      );
    }

    const prevStatus = booking.status;
    const transition = transitionBookingStatus(booking, params.status);
    if (!transition.ok) {
      throw new PolicyError(transition.code, transition.message);
    }

    const nowIso = new Date().toISOString();
    booking.status = transition.nextStatus;
    if (params.cancellationReason !== undefined) {
      booking.cancellationReason = params.cancellationReason;
    }
    if (params.internalNotes !== undefined) {
      booking.internalNotes = params.internalNotes;
    }
    booking.updatedAt = nowIso;

    if (pastLockActive && isPast && params.actor && params.actor.role === 'owner') {
      appendAuditLog(db, {
        actor: params.actor,
        action: 'past_booking_override',
        entityType: 'booking',
        entityId: booking.id,
        metadata: {
          bookingCode: booking.bookingCode,
          fromStatus: prevStatus,
          toStatus: transition.nextStatus,
        },
      });
    }

    if (
      (prevStatus === 'pending_confirmation' || prevStatus === 'pending_payment') &&
      transition.nextStatus === 'confirmed'
    ) {
      if (
        booking.depositAmountCents > 0 &&
        !cols.paymentSplits.some((s) => s.bookingId === booking.id)
      ) {
        cols.paymentSplits.push({
          id: generateId('ps'),
          bookingId: booking.id,
          method: 'transfer',
          amountCents: booking.depositAmountCents,
          tipCents: 0,
          tipStaffId: null,
          reference: 'Anticipo SPEI aprobado',
          createdAt: nowIso,
        });
      }
      if (params.actor) {
        appendAuditLog(db, {
          actor: params.actor,
          action: 'deposit_approved',
          entityType: 'booking',
          entityId: booking.id,
          metadata: {
            bookingCode: booking.bookingCode,
            depositAmountCents: booking.depositAmountCents,
          },
        });
      }
    }

    if (transition.nextStatus === 'canceled' && params.actor) {
      appendAuditLog(db, {
        actor: params.actor,
        action: 'booking_canceled',
        entityType: 'booking',
        entityId: booking.id,
        metadata: {
          bookingCode: booking.bookingCode,
          reason: booking.cancellationReason,
        },
      });
    }

    if (transition.nextStatus === 'completed') {
      awardLoyaltyStampInLock(db, booking);
    }

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

export async function recordBookingCheckoutAtomic(params: {
  bookingId: string;
  splits: PaymentSplitInput[];
  extraItem?: { inventoryItemId: string; quantity: number } | null;
  markCompleted?: boolean;
  redeemLoyaltyReward?: boolean;
  actor: AuditActor;
}): Promise<{
  booking: BookingWithRelations;
  splits: PaymentSplit[];
  summary: BookingPaymentSummary;
  stampAwarded: LoyaltyStamp | null;
}> {
  const committed = await withWriteLock((db) => {
    const cols = ensurePhase3Collections(db);
    const booking = db.bookings.find((b) => b.id === params.bookingId);
    if (!booking) throw new PolicyError('BOOKING_NOT_FOUND', 'Cita no encontrada.');
    if (booking.status === 'canceled' || booking.status === 'no_show') {
      throw new PolicyError(
        'INVALID_STATE',
        'No se puede registrar cobro en una cita cancelada o no-show.',
      );
    }

    const isPast = new Date(booking.endAt).getTime() < Date.now();
    const pastLockActive = db.settings.lockPastBookings !== false;
    if (pastLockActive && isPast && params.actor.role !== 'owner') {
      throw new PolicyError(
        'PAST_BOOKING_LOCKED',
        'Las citas pasadas están bloqueadas; solo la Dueña puede cobrarlas o modificarlas.',
      );
    }

    let extraInventoryItem: InventoryItem | null = null;
    let extraRetailTotalCents = 0;
    if (params.extraItem) {
      const found = db.inventory.find(
        (i) => i.id === params.extraItem?.inventoryItemId && i.isActive,
      );
      if (!found) {
        throw new PolicyError('ITEM_NOT_FOUND', 'Producto de reventa no encontrado.');
      }
      extraInventoryItem = found;
      extraRetailTotalCents = Math.round(
        found.retailPriceCents * params.extraItem.quantity,
      );
    }

    const effectiveTotalCents = booking.totalPriceCents + extraRetailTotalCents;
    const validation = validatePaymentSplits(params.splits, effectiveTotalCents);
    if (!validation.ok) {
      throw new PolicyError(validation.code, validation.message);
    }

    let loyaltyProgramForRedemption: LoyaltyProgram | null = null;
    if (params.redeemLoyaltyReward) {
      const activeProgram = cols.loyaltyPrograms.find((p) => p.isActive);
      if (!activeProgram) {
        throw new PolicyError(
          'LOYALTY_NOT_READY',
          'No hay un programa de lealtad activo.',
        );
      }
      const rewardServiceName = activeProgram.rewardServiceId
        ? db.services.find((s) => s.id === activeProgram.rewardServiceId)?.name ?? null
        : null;
      const clientLoyalty = computeClientLoyaltySummary(
        activeProgram,
        cols.loyaltyStamps,
        booking.clientId,
        rewardServiceName,
      );
      if (!clientLoyalty.isRewardReady) {
        throw new PolicyError(
          'LOYALTY_NOT_READY',
          'La clienta aún no alcanza los sellos requeridos para canjear recompensa.',
        );
      }
      loyaltyProgramForRedemption = activeProgram;
    }

    const shouldComplete =
      params.markCompleted !== false && booking.status !== 'completed';
    const completionTransition = shouldComplete
      ? transitionBookingStatus(booking, 'completed')
      : null;
    if (completionTransition && !completionTransition.ok) {
      throw new PolicyError(completionTransition.code, completionTransition.message);
    }

    const nowIso = new Date().toISOString();
    const recordedBy = params.actor.fullName || params.actor.email;

    if (pastLockActive && isPast && params.actor.role === 'owner') {
      appendAuditLog(db, {
        actor: params.actor,
        action: 'past_booking_override',
        entityType: 'booking',
        entityId: booking.id,
        metadata: {
          bookingCode: booking.bookingCode,
          operation: 'checkout_split',
        },
      });
    }

    if (extraInventoryItem && params.extraItem) {
      extraInventoryItem.stockQuantity = Math.max(
        0,
        Number((extraInventoryItem.stockQuantity - params.extraItem.quantity).toFixed(2)),
      );
      extraInventoryItem.updatedAt = nowIso;
      db.inventoryMovements.unshift({
        id: generateId('imv'),
        itemId: extraInventoryItem.id,
        delta: -params.extraItem.quantity,
        reason: 'retail_sale',
        notes: `Checkout cita ${booking.bookingCode}`,
        bookingId: booking.id,
        createdBy: recordedBy,
        createdAt: nowIso,
      });
      booking.subtotalCents += extraRetailTotalCents;
      booking.totalPriceCents = effectiveTotalCents;
    }

    const hydratedBeforeCash = hydrateBooking(db, booking);
    const createdSplits: PaymentSplit[] = [];
    const extraSuffix =
      extraInventoryItem && params.extraItem
        ? ` + ${extraInventoryItem.name} (x${params.extraItem.quantity})`
        : '';

    for (const inputSplit of params.splits) {
      const tipCents = inputSplit.tipCents ?? 0;
      const tipStaffId =
        inputSplit.tipStaffId !== undefined
          ? inputSplit.tipStaffId
          : tipCents > 0
            ? booking.staffId
            : null;
      const splitRecord: PaymentSplit = {
        id: generateId('ps'),
        bookingId: booking.id,
        method: inputSplit.method,
        amountCents: inputSplit.amountCents,
        tipCents,
        tipStaffId,
        ...(inputSplit.reference?.trim()
          ? { reference: inputSplit.reference.trim() }
          : {}),
        createdAt: nowIso,
      };
      cols.paymentSplits.push(splitRecord);
      createdSplits.push(splitRecord);

      const serviceStaffMember = db.staff.find((st) => st.id === booking.staffId);
      const commissionPct =
        serviceStaffMember?.commissionPercent ?? db.settings.defaultCommissionPercent;
      const commissionCents = Math.round((splitRecord.amountCents * commissionPct) / 100);
      const isCrossStaffTip =
        splitRecord.tipCents > 0 &&
        Boolean(splitRecord.tipStaffId) &&
        splitRecord.tipStaffId !== booking.staffId;

      db.cashEntries.unshift({
        id: generateId('cash'),
        bookingId: booking.id,
        staffId: booking.staffId,
        entryType: 'service_income',
        description: `${hydratedBeforeCash.service.name}${extraSuffix} — ${hydratedBeforeCash.client.fullName}`,
        amountCents: splitRecord.amountCents,
        tipCents: isCrossStaffTip ? 0 : splitRecord.tipCents,
        commissionCents,
        paymentMethod: mapSplitMethodToCashMethod(splitRecord.method),
        occurredAt: nowIso,
        recordedBy,
      });

      if (isCrossStaffTip && splitRecord.tipStaffId) {
        db.cashEntries.unshift({
          id: generateId('cash'),
          bookingId: booking.id,
          staffId: splitRecord.tipStaffId,
          entryType: 'service_income',
          description: `Propina (${hydratedBeforeCash.service.name} — ${hydratedBeforeCash.client.fullName})`,
          amountCents: 0,
          tipCents: splitRecord.tipCents,
          commissionCents: 0,
          paymentMethod: mapSplitMethodToCashMethod(splitRecord.method),
          occurredAt: nowIso,
          recordedBy,
        });
      }
    }

    if (loyaltyProgramForRedemption) {
      const programId = loyaltyProgramForRedemption.id;
      const requiredCount = Math.max(1, Math.floor(loyaltyProgramForRedemption.stampsRequired));
      const eligibleStamps = cols.loyaltyStamps
        .filter((s) => s.clientId === booking.clientId && s.programId === programId)
        .toSorted((a, b) => {
          const dateCmp = a.stampedDate.localeCompare(b.stampedDate);
          return dateCmp !== 0 ? dateCmp : a.createdAt.localeCompare(b.createdAt);
        });
      const consumedIds = new Set(
        eligibleStamps.slice(0, requiredCount).map((s) => s.id),
      );
      cols.loyaltyStamps = cols.loyaltyStamps.filter((s) => !consumedIds.has(s.id));
      db.loyaltyStamps = cols.loyaltyStamps;

      appendAuditLog(db, {
        actor: params.actor,
        action: 'loyalty_redeemed',
        entityType: 'client',
        entityId: booking.clientId,
        metadata: {
          bookingId: booking.id,
          bookingCode: booking.bookingCode,
          programId,
          stampsConsumed: consumedIds.size,
        },
      });
    }

    let outboxEvents: OutboxEventInput[] = [];
    if (completionTransition && completionTransition.ok) {
      booking.status = completionTransition.nextStatus;
      booking.updatedAt = nowIso;
      const hydrated = hydrateBooking(db, booking);
      const nonCashEffects = completionTransition.effects.filter(
        (effect) => effect.type !== 'RecordCash',
      );
      outboxEvents = applyInLockTransitionEffects(
        db,
        booking,
        hydrated,
        nonCashEffects,
        { recordedBy },
      );
    } else {
      booking.updatedAt = nowIso;
    }

    const stampAwarded =
      booking.status === 'completed' ? awardLoyaltyStampInLock(db, booking) : null;
    const allBookingSplits = cols.paymentSplits.filter(
      (s) => s.bookingId === booking.id,
    );
    const summary = computeBookingPaymentSummary(
      booking.totalPriceCents,
      allBookingSplits,
    );
    const hydratedFinal = hydrateBooking(db, booking);
    outboxEvents.push({
      type: 'Realtime',
      eventType: 'slot_changed',
      payload: { staffId: booking.staffId, startAt: booking.startAt },
    });

    return {
      hydrated: hydratedFinal,
      createdSplits,
      summary,
      stampAwarded,
      outboxEvents,
    };
  });

  await dispatchPostCommitOutbox(committed.outboxEvents);
  return {
    booking: committed.hydrated,
    splits: committed.createdSplits,
    summary: committed.summary,
    stampAwarded: committed.stampAwarded,
  };
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
      return {
        hydrated,
        outboxEvents,
        salonAlert: {
          booking: hydrated,
          settings: { ...db.settings },
          kind: 'canceled' as const,
          reason: booking.cancellationReason ?? undefined,
        },
      };
    }

    if (!params.newStartAt) {
      throw new PolicyError('MISSING_SLOT', 'Selecciona un nuevo horario.');
    }

    const service = db.services.find((s) => s.id === booking.serviceId);
    if (!service || !service.isActive) {
      throw new PolicyError('SERVICE_NOT_FOUND', 'Servicio no encontrado.');
    }
    const extraServiceIds = booking.extraServiceIds ?? [];
    const extraServices = extraServiceIds.length
      ? db.services.filter((s) => extraServiceIds.includes(s.id) && s.isActive)
      : [];
    const requiredServiceIds = [service.id, ...extraServiceIds];
    const addons = db.addons.filter((a) =>
      booking.addons.some((ba) => ba.addonId === a.id),
    );
    const targetStaffId = params.newStaffId || booking.staffId;
    const now = new Date();
    const { slot } = resolveBookableSlotOrThrow({
      db,
      service,
      extraServices,
      requiredServiceIds,
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

    return {
      hydrated,
      outboxEvents,
      salonAlert: {
        booking: hydrated,
        settings: settingsSnapshot,
        kind: 'rescheduled' as const,
      },
    };
  });

  await dispatchPostCommitOutbox(committed.outboxEvents);
  await dispatchSalonBookingAlert(committed.salonAlert);
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

export async function upsertRecurringBlock(
  input: Omit<RecurringBlock, 'id'> & { id?: string },
): Promise<RecurringBlock> {
  return withWriteLock((db) => {
    const cols = ensurePhase3Collections(db);
    if (!db.staff.some((s) => s.id === input.staffId)) {
      throw new PolicyError('STAFF_NOT_FOUND', 'Especialista no encontrada.');
    }
    const existing = input.id
      ? cols.recurringBlocks.find((b) => b.id === input.id)
      : null;
    if (existing) {
      Object.assign(existing, {
        ...input,
        id: existing.id,
      });
      publishRealtimeEvent('availability_updated', { staffId: existing.staffId });
      return existing;
    }
    const created: RecurringBlock = {
      ...input,
      id: generateId('rblk'),
    };
    cols.recurringBlocks.push(created);
    publishRealtimeEvent('availability_updated', { staffId: created.staffId });
    return created;
  });
}

export async function toggleRecurringBlock(
  id: string,
  isActive: boolean,
): Promise<RecurringBlock> {
  return withWriteLock((db) => {
    const cols = ensurePhase3Collections(db);
    const block = cols.recurringBlocks.find((b) => b.id === id);
    if (!block) {
      throw new PolicyError('BLOCK_NOT_FOUND', 'Bloqueo recurrente no encontrado.');
    }
    block.isActive = isActive;
    publishRealtimeEvent('availability_updated', { staffId: block.staffId });
    return block;
  });
}

export async function deleteRecurringBlock(id: string): Promise<void> {
  await withWriteLock((db) => {
    const cols = ensurePhase3Collections(db);
    cols.recurringBlocks = cols.recurringBlocks.filter((b) => b.id !== id);
    db.recurringBlocks = cols.recurringBlocks;
    publishRealtimeEvent('availability_updated');
  });
}

export async function upsertLoyaltyProgram(
  patch: Partial<LoyaltyProgram>,
): Promise<LoyaltyProgram> {
  return withWriteLock((db) => {
    const cols = ensurePhase3Collections(db);
    const existing = patch.id
      ? cols.loyaltyPrograms.find((p) => p.id === patch.id)
      : (cols.loyaltyPrograms.find((p) => p.isActive) ?? cols.loyaltyPrograms[0] ?? null);
    if (existing) {
      if (patch.isActive !== undefined) existing.isActive = patch.isActive;
      if (patch.name !== undefined) existing.name = patch.name;
      if (patch.stampsRequired !== undefined) existing.stampsRequired = patch.stampsRequired;
      if (patch.rewardType !== undefined) existing.rewardType = patch.rewardType;
      if (patch.rewardServiceId !== undefined) existing.rewardServiceId = patch.rewardServiceId;
      if (patch.discountPercent !== undefined) existing.discountPercent = patch.discountPercent;
      if (patch.maxDiscountCents !== undefined) existing.maxDiscountCents = patch.maxDiscountCents;
      if (patch.validDays !== undefined) existing.validDays = patch.validDays;
      publishRealtimeEvent('settings_updated');
      return existing;
    }
    const created: LoyaltyProgram = {
      id: generateId('loy'),
      isActive: patch.isActive ?? true,
      name: patch.name ?? 'Tarjeta de Sellos',
      stampsRequired: patch.stampsRequired ?? 8,
      rewardType: patch.rewardType ?? 'percent_discount',
      rewardServiceId: patch.rewardServiceId ?? null,
      discountPercent: patch.discountPercent ?? 50,
      maxDiscountCents: patch.maxDiscountCents ?? 25000,
      validDays: patch.validDays ?? 90,
    };
    cols.loyaltyPrograms.push(created);
    publishRealtimeEvent('settings_updated');
    return created;
  });
}

export function getClientLoyaltySummary(clientId: string): PublicLoyaltySummaryDTO | null {
  const db = getSnapshot();
  const activeProgram = (db.loyaltyPrograms ?? []).find((p) => p.isActive);
  if (!activeProgram) return null;
  const rewardServiceName = activeProgram.rewardServiceId
    ? db.services.find((s) => s.id === activeProgram.rewardServiceId)?.name ?? null
    : null;
  const summary = computeClientLoyaltySummary(
    activeProgram,
    db.loyaltyStamps ?? [],
    clientId,
    rewardServiceName,
  );
  return PublicLoyaltySummarySchema.parse(summary);
}

export function getNearRewardClients(): Array<{
  clientId: string;
  fullName: string;
  phoneE164: string;
  instagramHandle: string | null;
  summary: PublicLoyaltySummaryDTO;
}> {
  const db = getSnapshot();
  const activeProgram = (db.loyaltyPrograms ?? []).find((p) => p.isActive);
  if (!activeProgram) return [];
  const rewardServiceName = activeProgram.rewardServiceId
    ? db.services.find((s) => s.id === activeProgram.rewardServiceId)?.name ?? null
    : null;
  const stamps = db.loyaltyStamps ?? [];

  const results: Array<{
    clientId: string;
    fullName: string;
    phoneE164: string;
    instagramHandle: string | null;
    summary: PublicLoyaltySummaryDTO;
  }> = [];

  for (const client of db.clients) {
    const summary = PublicLoyaltySummarySchema.parse(
      computeClientLoyaltySummary(activeProgram, stamps, client.id, rewardServiceName),
    );
    if (summary.isNearReward || summary.isRewardReady) {
      results.push({
        clientId: client.id,
        fullName: client.fullName,
        phoneE164: client.phoneE164,
        instagramHandle: client.instagramHandle ?? null,
        summary,
      });
    }
  }

  return results.toSorted((a, b) => {
    const diff = a.summary.remainingForReward - b.summary.remainingForReward;
    return diff !== 0 ? diff : b.summary.currentStamps - a.summary.currentStamps;
  });
}

export function getInactiveClients(inactiveDays: number): Array<{
  clientId: string;
  fullName: string;
  phoneE164: string;
  instagramHandle: string | null;
  lastVisitAt: string | null;
  daysSinceLastVisit: number | null;
  totalVisits: number;
}> {
  const db = getSnapshot();
  const nowMs = Date.now();
  const cutoffMs = nowMs - inactiveDays * 86_400_000;

  const inactive: Array<{
    clientId: string;
    fullName: string;
    phoneE164: string;
    instagramHandle: string | null;
    lastVisitAt: string | null;
    daysSinceLastVisit: number | null;
    totalVisits: number;
  }> = [];

  for (const client of db.clients) {
    const clientBookings = db.bookings.filter(
      (b) => b.clientId === client.id && b.status !== 'canceled' && b.status !== 'no_show',
    );
    const hasRecentOrUpcoming = clientBookings.some(
      (b) => new Date(b.startAt).getTime() >= cutoffMs,
    );
    if (hasRecentOrUpcoming) continue;

    let lastVisitMs: number | null = null;
    let totalVisits = 0;
    for (const b of clientBookings) {
      const startMs = new Date(b.startAt).getTime();
      if (b.status === 'completed' || (b.status === 'confirmed' && startMs <= nowMs)) {
        totalVisits += 1;
        if (lastVisitMs === null || startMs > lastVisitMs) {
          lastVisitMs = startMs;
        }
      }
    }

    inactive.push({
      clientId: client.id,
      fullName: client.fullName,
      phoneE164: client.phoneE164,
      instagramHandle: client.instagramHandle ?? null,
      lastVisitAt: lastVisitMs !== null ? new Date(lastVisitMs).toISOString() : null,
      daysSinceLastVisit:
        lastVisitMs !== null ? Math.floor((nowMs - lastVisitMs) / 86_400_000) : null,
      totalVisits,
    });
  }

  return inactive.toSorted((a, b) => {
    if (a.daysSinceLastVisit === null && b.daysSinceLastVisit === null) return 0;
    if (a.daysSinceLastVisit === null) return 1;
    if (b.daysSinceLastVisit === null) return -1;
    return b.daysSinceLastVisit - a.daysSinceLastVisit;
  });
}

export function getClientArcoExport(clientId: string) {
  const db = getSnapshot();
  const client = db.clients.find((c) => c.id === clientId);
  if (!client) return null;

  const bookings = db.bookings
    .filter((b) => b.clientId === client.id)
    .map((b) => ({
      id: b.id,
      bookingCode: b.bookingCode,
      serviceId: b.serviceId,
      extraServiceIds: b.extraServiceIds ?? [],
      staffId: b.staffId,
      startAt: b.startAt,
      endAt: b.endAt,
      status: b.status,
      source: b.source,
      subtotalCents: b.subtotalCents,
      discountCents: b.discountCents,
      totalPriceCents: b.totalPriceCents,
      depositAmountCents: b.depositAmountCents,
      clientNotes: b.clientNotes,
      createdAt: b.createdAt,
    }));
  const bookingIds = new Set(bookings.map((b) => b.id));
  const consents = (db.consents ?? []).filter((c) => c.clientId === client.id);
  const loyaltySummary = getClientLoyaltySummary(client.id);
  const paymentSplits = (db.paymentSplits ?? []).filter((s) =>
    bookingIds.has(s.bookingId),
  );

  return {
    exportedAt: new Date().toISOString(),
    privacyPolicyVersion: db.settings.privacyPolicyVersion ?? '2026-11',
    client,
    bookings,
    consents,
    loyaltySummary,
    paymentSplits,
  };
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
        recurringBlocks: db.recurringBlocks ?? [],
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
    async recordPaymentSplits(params) {
      return withWriteLock((db) => {
        const cols = ensurePhase3Collections(db);
        const nowIso = clock.now().toISOString();
        const created: PaymentSplit[] = params.splits.map((split) => ({
          id: generateId('ps', clock),
          bookingId: params.bookingId,
          method: split.method,
          amountCents: split.amountCents,
          tipCents: split.tipCents ?? 0,
          tipStaffId: split.tipStaffId ?? null,
          ...(split.reference?.trim() ? { reference: split.reference.trim() } : {}),
          createdAt: nowIso,
        }));
        cols.paymentSplits.push(...created);
        return created;
      });
    },
    upsertRecurringBlock,
    deleteRecurringBlock,
    upsertLoyaltyProgram,
    async awardLoyaltyStamp(params) {
      return withWriteLock((db) => {
        const cols = ensurePhase3Collections(db);
        if (!canAwardStamp(cols.loyaltyStamps, params)) {
          throw new PolicyError(
            'DUPLICATE_STAMP',
            'Ya se otorgó un sello para esta clienta hoy.',
          );
        }
        const stamp: LoyaltyStamp = {
          id: generateId('lst', clock),
          clientId: params.clientId,
          bookingId: params.bookingId,
          programId: params.programId,
          stampedDate: params.stampedDate,
          createdAt: clock.now().toISOString(),
        };
        cols.loyaltyStamps.unshift(stamp);
        return stamp;
      });
    },
    async recordConsent(params) {
      return withWriteLock((db) => {
        const cols = ensurePhase3Collections(db);
        const consent: ConsentRecord = {
          id: generateId('cns', clock),
          clientId: params.clientId,
          bookingId: params.bookingId ?? null,
          policyVersion: params.policyVersion,
          acceptedAt: clock.now().toISOString(),
          marketingOptIn: Boolean(params.marketingOptIn),
        };
        cols.consents.unshift(consent);
        return consent;
      });
    },
    async writeAuditLog(params) {
      return withWriteLock((db) =>
        appendAuditLog(db, {
          actor: {
            id: params.actorId,
            email: params.actorEmail,
            role: params.actorRole,
          },
          action: params.action,
          entityType: params.entityType,
          entityId: params.entityId,
          metadata: params.metadata,
        }),
      );
    },
  };
}

export function getRepository(clock: Clock = systemClock): SalonRepository {
  assertProductionEnvValid();
  if (isSupabaseEnabled()) {
    return createSupabaseRepository(clock);
  }
  return createDemoRepository(clock);
}
