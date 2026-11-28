import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  createDefaultWhatsAppTemplates,
  createInitialDemoDatabase,
} from '../demo-seed';
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
  expandPlainDateRange,
  getMexicoOfficialHolidays,
} from '../availability/holidays-mx';
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
import { computeBookingBalance } from '../booking/balance';
import {
  DEFAULT_NO_SHOW_DEPOSIT_THRESHOLD,
  evaluateClientNoShowPolicy,
  type NoShowPolicyEvaluation,
} from '../booking/no-show-policy';
import {
  buildTouchUpBookingUrl,
  computeSuggestedTouchUpDateKey,
  generateRecurrenceDates,
  type RecurrenceIntervalWeeks,
} from '../booking/recurrence';
import {
  canRedeemPackageSession,
  computeClientPackageBalance,
} from '../loyalty/packages';
import { verifyOwnerPin } from '../security/auth-pin';
import { logError, logWarn } from '../logger';
import {
  selectNextWaitlistCandidate,
  shouldSkipWhatsappCascade,
  WAITLIST_OFFER_TTL_MINUTES,
} from '../notifications/cascade';
import {
  canonicalizeWhatsAppPhoneE164,
  computeNotificationRetryAt,
  computeWhatsAppServiceWindow,
  inferReminderTriggerKey,
  resolveNextDeliveryStatus,
} from '../notifications/whatsapp-inbox';
import type {
  WhatsAppInboxSummaryDTO,
  WhatsAppReminderItemDTO,
  WhatsAppServiceWindowDTO,
  WhatsAppThreadBookingContextDTO,
  WhatsAppThreadSummaryDTO,
} from '../contracts/whatsapp';
import { checkManagePolicyWindow } from '../availability/policy';
import {
  generateBookingCode,
  generateId,
  systemClock,
  type Clock,
} from '../clock';
import {
  assertProductionEnvValid,
  getConfiguredWhatsAppMonthlyQuota,
  getRuntimeIntegrationStatus,
  getWhatsAppTemplateNameOverrides,
} from '../env';
import {
  buildWhatsAppLink,
  formatDateLongInTimezone,
  phonesMatchE164,
  formatTimeInTimezone,
  getDateKeyInTimezone,
  normalizePhoneE164,
  slugify,
} from '../format';
import {
  buildBookingTemplateParameters,
  dispatchDepositRejectedNotification,
  dispatchEmailNotification,
  dispatchSalonAlertEmail,
  dispatchTouchUpInviteNotification,
  dispatchWhatsAppNotification,
} from '../integrations/notifications';
import {
  getOfficialWhatsAppTemplateSpec,
  sanitizeWhatsAppTemplateName,
} from '../integrations/whatsapp-templates';
import { buildWaitlistOfferTemplatePayload } from '../integrations/resend-templates';
import {
  ClientPortalSnapshotDTOSchema,
  PublicLoyaltySummarySchema,
  toPublicClientPackageDTO,
  toPublicReviewDTO,
  toPublicServiceDTO,
  toPublicSettingsDTO,
  toPublicStaffDTO,
  type ClientPortalBookingDTO,
  type ClientPortalSnapshotDTO,
  type PublicLoyaltySummaryDTO,
  type PublicReviewDTO,
} from '../public-dto';
import { publishRealtimeEvent } from '../realtime';
import {
  isSafeExternalProofUrl,
  isSafeInternalBookingMediaPath,
} from '../contracts';
import { isSafeBrandMediaPath } from '../landing-config';
import {
  deleteStoredMedia,
  MediaValidationError,
  storeMediaUpload,
  validateMediaDataUrl,
} from '../storage/media';
import { dispatchOutboxEvent, type OutboxEventInput } from '../use-cases/outbox';
import { parseDemoDatabase } from './schema';
import { createSupabaseAdminClient, isSupabaseEnabled } from './supabase-client';
import {
  createSupabaseRepository,
  fetchSupabaseActiveInventoryItemById,
  fetchSupabaseActiveLoyaltyProgram,
  fetchSupabaseAddonsByIds,
  fetchSupabaseBookingById,
  fetchSupabaseBookingPaymentSplits,
  fetchSupabaseBookingStaffId,
  fetchSupabaseClientIdsByPhone,
  fetchSupabaseClientLoyaltyStamps,
  fetchSupabaseClientLoyaltySummary,
  fetchSupabaseDateOverrideStaffId,
  fetchSupabaseHasOverlappingBooking,
  fetchSupabaseOverdueWaitlistContext,
  fetchSupabaseRecurringBlockStaffId,
  fetchSupabaseServicesByIds,
  fetchSupabaseStaffCalendarConnection,
  fetchSupabaseStaffMemberById,
  fetchSupabaseTouchUpContext,
  runPostCommitSideEffects,
} from './supabase-repo';
import {
  PolicyError,
  SlotConflictError,
  type AdminBookingsRangeData,
  type BookingsRangeFilter,
  type CleanupExpiredSlotHoldsResult,
  type ClientArcoExport,
  type ClientPortalRecordData,
  type CreateBookingAtomicInput,
  type CreateSlotHoldInput,
  type ExecutiveReportData,
  type GetWhatsAppThreadDetailParams,
  type InactiveClientRecord,
  type ListScheduledNotificationsParams,
  type ListWhatsAppThreadsParams,
  type NearRewardClientRecord,
  type OutboxEventRecord,
  type OutboxSummary,
  type PublicBootstrapData,
  type PublicServiceReviewsData,
  type QueryAvailabilityInput,
  type QuickSearchAvailabilityInput,
  type RecordWhatsAppMessageInput,
  type RegisterMediaAssetInput,
  type ResolveRetriedWhatsAppMessageInput,
  type SalonRepository,
  type SlotHoldResult,
  type UpdateCashEntryInput,
  type UpdateClientNotesInput,
  type UpdateScheduledNotificationStatusInput,
  type UpdateWhatsAppMessageStatusInput,
  type UpsertClientPortalProfileInput,
  type WhatsAppContactContextData,
  type WhatsAppThreadDetailData,
} from './port';

export { PolicyError, SlotConflictError };

interface ActiveBookingRecoveryItem {
  bookingCode: string;
  serviceName: string;
  staffName: string;
  startAt: string;
  manageUrl: string;
}

export class MaxActiveBookingsError extends PolicyError {
  readonly activeBookings: ActiveBookingRecoveryItem[];

  constructor(message: string, activeBookings: ActiveBookingRecoveryItem[]) {
    super('MAX_ACTIVE_BOOKINGS', message);
    this.name = 'MaxActiveBookingsError';
    this.activeBookings = activeBookings;
  }
}
import type {
  AdminRole,
  AdminUser,
  AuditAction,
  AuditLogEntry,
  AvailabilityRule,
  Booking,
  BookingPayment,
  BookingReview,
  BookingStatus,
  BookingWithRelations,
  CalendarConnection,
  CampaignDispatchLog,
  CashRegisterEntry,
  ClientPackage,
  ClientProfile,
  ConsentRecord,
  Coupon,
  CouponRedemption,
  DateOverride,
  DemoDatabase,
  FunnelEventRecord,
  FunnelEventType,
  GalleryItem,
  InventoryItem,
  LoyaltyProgram,
  LoyaltyStamp,
  MediaAccessOwner,
  MediaAssetFolder,
  MediaAssetRecord,
  NotificationWorkflow,
  PaymentMethod,
  PaymentSplit,
  PaymentSplitMethod,
  RecurringBlock,
  SalonSettings,
  ScheduledNotification,
  Service,
  ServiceCategory,
  ServiceAddon,
  ServicePackage,
  SlotHold,
  StaffMember,
  WaitlistEntry,
  WebhookEventRecord,
  WhatsAppMessage,
  WhatsAppMonthlyUsage,
  WhatsAppMonthlyUsageSummary,
  WhatsAppQuotaAlertLevel,
  WhatsAppTemplateConfig,
  WhatsAppTemplateTriggerKey,
  WhatsAppThread,
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

function applySafeSettingsShape(
  rawSettings: SalonSettings,
  overridePinHash?: string | null,
): SalonSettings {
  const effectiveHash =
    overridePinHash !== undefined
      ? overridePinHash
      : (rawSettings.ownerPinHash ?? null);
  const { ownerPinHash: _ignoredHash, ...publicSafeRest } = rawSettings;
  const safe: SalonSettings = {
    ...publicSafeRest,
    noShowDepositThreshold:
      rawSettings.noShowDepositThreshold ?? DEFAULT_NO_SHOW_DEPOSIT_THRESHOLD,
    ownerPinEnabled: Boolean(rawSettings.ownerPinEnabled && effectiveHash),
    hasOwnerPin: Boolean(effectiveHash),
  };
  Object.defineProperty(safe, 'ownerPinHash', {
    value: effectiveHash,
    enumerable: false,
    writable: true,
    configurable: true,
  });
  return safe;
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
      parsed.settings = applySafeSettingsShape(parsed.settings);
      globalThis.nailsDbCache = parsed;
      globalThis.nailsDbCachePath = cacheKey;
      globalThis.nailsDbPersistedToDisk = true;
      return parsed;
    }
  } catch (err) {
    logWarn('demo_db_read_failed', { error: err });
    globalThis.nailsDbCache = undefined;
    globalThis.nailsDbCachePath = undefined;
    globalThis.nailsDbPersistedToDisk = undefined;
  }
  const seeded = createInitialDemoDatabase();
  seeded.settings = applySafeSettingsShape(seeded.settings);
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
    const diskPayload = {
      ...db,
      settings: {
        ...db.settings,
        ownerPinHash: db.settings.ownerPinHash ?? null,
      },
    };
    writeRawDemoDb(testDbPath, JSON.stringify(diskPayload, null, 2));
    globalThis.nailsDbPersistedToDisk = true;
  } catch (err) {
    logError('demo_db_write_failed', { error: err });
    globalThis.nailsDbPersistedToDisk = false;
    return;
  }
}

async function withWriteLock<T>(
  fn: (db: DemoDatabase) => Promise<T> | T,
  options?: { skipPruneHolds?: boolean },
): Promise<T> {
  const prev = globalThis.nailsWriteMutex ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  globalThis.nailsWriteMutex = prev.then(() => next);
  await prev;

  try {
    const db = readDbFromDisk();
    if (!options?.skipPruneHolds) {
      pruneExpiredHolds(db);
    }
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

function hydrateBooking(db: Readonly<DemoDatabase>, booking: Booking): BookingWithRelations {
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
      name: 'Profesional',
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

export function hydrateBookingsWithRelationsFromDb(
  db: Readonly<DemoDatabase>,
  role?: AdminRole,
  staffMemberId?: string | null,
  filter?: BookingsRangeFilter,
): BookingWithRelations[] {
  const effectiveRole = filter?.role ?? role;
  const effectiveStaffMemberId =
    filter?.staffMemberId !== undefined ? filter.staffMemberId : staffMemberId;
  if (effectiveRole === 'specialist' && !effectiveStaffMemberId) {
    return [];
  }
  const effectiveStaffId =
    effectiveRole === 'specialist'
      ? (effectiveStaffMemberId ?? null)
      : filter?.staffId && filter.staffId !== 'all'
        ? filter.staffId
        : null;
  const tz = db.settings.timezone || 'America/Mexico_City';
  const fromKey = filter?.from?.trim() || null;
  const toKey = filter?.to?.trim() || null;

  const filtered = db.bookings.filter((b) => {
    if (effectiveStaffId && b.staffId !== effectiveStaffId) return false;
    if (fromKey || toKey) {
      const dateKey = getDateKeyInTimezone(new Date(b.startAt), tz);
      if (fromKey && dateKey < fromKey) return false;
      if (toKey && dateKey > toKey) return false;
    }
    return true;
  });

  return filtered
    .map((b) => hydrateBooking(db, b))
    .toSorted((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
}

function getBookingsWithRelations(filter?: BookingsRangeFilter): BookingWithRelations[] {
  return hydrateBookingsWithRelationsFromDb(
    getSnapshot(),
    filter?.role,
    filter?.staffMemberId,
    filter,
  );
}

function getAdminBookingsRangeFromDemo(
  filter?: BookingsRangeFilter,
): AdminBookingsRangeData {
  const db = getSnapshot();
  const timezone = db.settings.timezone || 'America/Mexico_City';
  if (filter?.role === 'specialist' && !filter.staffMemberId) {
    return { bookings: [], paymentSplits: [], cashEntries: [], timezone };
  }
  const bookings = hydrateBookingsWithRelationsFromDb(
    db,
    filter?.role,
    filter?.staffMemberId,
    filter,
  );
  const bookingIds = new Set(bookings.map((b) => b.id));
  const paymentSplits = (db.paymentSplits ?? []).filter((split) =>
    bookingIds.has(split.bookingId),
  );
  const cashEntries = (db.cashEntries ?? []).filter(
    (entry) => entry.bookingId !== null && bookingIds.has(entry.bookingId),
  );
  return { bookings, paymentSplits, cashEntries, timezone };
}

function getExecutiveReportDataFromDemo(options?: {
  scopeStaffId?: string | null;
}): ExecutiveReportData {
  const db = getSnapshot();
  const scopeStaffId = options?.scopeStaffId?.trim() || null;
  const bookings = scopeStaffId
    ? db.bookings.filter((b) => b.staffId === scopeStaffId)
    : [...db.bookings];
  const bookingIds = new Set(bookings.map((b) => b.id));
  const staff = scopeStaffId
    ? db.staff.filter((s) => s.id === scopeStaffId)
    : [...db.staff];
  const schedules = scopeStaffId
    ? db.schedules.filter((sc) => sc.staffId === scopeStaffId)
    : [...db.schedules];
  const reviews = scopeStaffId
    ? db.reviews.filter(
        (r) =>
          r.staffId === scopeStaffId ||
          (r.staffId === null && bookingIds.has(r.bookingId)),
      )
    : [...db.reviews];
  const allPaymentSplits = db.paymentSplits ?? [];
  const paymentSplits = scopeStaffId
    ? allPaymentSplits.filter((ps) => bookingIds.has(ps.bookingId))
    : [...allPaymentSplits];
  const allCashEntries = db.cashEntries ?? [];
  const cashEntries = scopeStaffId
    ? allCashEntries.filter(
        (entry) =>
          entry.staffId === scopeStaffId ||
          (entry.bookingId !== null && bookingIds.has(entry.bookingId)),
      )
    : [...allCashEntries];
  return {
    settings: {
      timezone: db.settings.timezone || 'America/Mexico_City',
      currency: db.settings.currency,
    },
    bookings,
    services: [...db.services],
    staff,
    schedules,
    reviews,
    paymentSplits,
    cashEntries,
    funnelEvents: scopeStaffId ? [] : [...(db.funnelEvents ?? [])],
  };
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
  db: Readonly<DemoDatabase>,
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
  bookingPayments: BookingPayment[];
  servicePackages: ServicePackage[];
  clientPackages: ClientPackage[];
  campaignDispatches: CampaignDispatchLog[];
  mediaAssets: MediaAssetRecord[];
  whatsappTemplates: WhatsAppTemplateConfig[];
  whatsappMonthlyUsage: WhatsAppMonthlyUsage[];
  whatsappThreads: WhatsAppThread[];
  whatsappMessages: WhatsAppMessage[];
  webhookEvents: WebhookEventRecord[];
}

function ensurePhase3Collections(db: DemoDatabase): Phase3Collections {
  if (!db.paymentSplits) db.paymentSplits = [];
  if (!db.recurringBlocks) db.recurringBlocks = [];
  if (!db.loyaltyPrograms) db.loyaltyPrograms = [];
  if (!db.loyaltyStamps) db.loyaltyStamps = [];
  if (!db.couponRedemptions) db.couponRedemptions = [];
  if (!db.consents) db.consents = [];
  if (!db.auditLogs) db.auditLogs = [];
  if (!db.bookingPayments) db.bookingPayments = [];
  if (!db.servicePackages) db.servicePackages = [];
  if (!db.clientPackages) db.clientPackages = [];
  if (!db.campaignDispatches) db.campaignDispatches = [];
  if (!db.mediaAssets) db.mediaAssets = [];
  if (!db.whatsappTemplates) db.whatsappTemplates = [];
  if (!db.whatsappMonthlyUsage) db.whatsappMonthlyUsage = [];
  if (!db.whatsappThreads) db.whatsappThreads = [];
  if (!db.whatsappMessages) db.whatsappMessages = [];
  if (!db.webhookEvents) db.webhookEvents = [];
  return {
    paymentSplits: db.paymentSplits,
    recurringBlocks: db.recurringBlocks,
    loyaltyPrograms: db.loyaltyPrograms,
    loyaltyStamps: db.loyaltyStamps,
    couponRedemptions: db.couponRedemptions,
    consents: db.consents,
    auditLogs: db.auditLogs,
    bookingPayments: db.bookingPayments,
    servicePackages: db.servicePackages,
    clientPackages: db.clientPackages,
    campaignDispatches: db.campaignDispatches,
    mediaAssets: db.mediaAssets,
    whatsappTemplates: db.whatsappTemplates,
    whatsappMonthlyUsage: db.whatsappMonthlyUsage,
    whatsappThreads: db.whatsappThreads,
    whatsappMessages: db.whatsappMessages,
    webhookEvents: db.webhookEvents,
  };
}

const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

function normalizeMediaStoragePath(raw: string): string {
  const withoutQuery = raw.trim().split(/[?#]/)[0] ?? '';
  return withoutQuery.replace(/^\/+/, '').replace(/^api\/media\/+/, '');
}

function inferMediaFolder(storagePath: string): MediaAssetFolder | null {
  if (storagePath.startsWith('proofs/')) return 'proofs';
  if (storagePath.startsWith('inspo/')) return 'inspo';
  if (storagePath.startsWith('gallery/')) return 'gallery';
  return null;
}

function inferContentTypeFromPath(storagePath: string): string {
  const lower = storagePath.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/png';
}

function resolveCurrentMonthKey(timezone: string, now = new Date()): string {
  return getDateKeyInTimezone(now, timezone || 'America/Mexico_City').slice(0, 7);
}

function resolveEffectiveMonthKey(
  timezone: string,
  monthKey?: string,
  now = new Date(),
): string {
  const trimmed = monthKey?.trim();
  if (trimmed && MONTH_KEY_RE.test(trimmed)) {
    return trimmed;
  }
  return resolveCurrentMonthKey(timezone, now);
}

function resolveWhatsAppQuotaLimit(settings: SalonSettings): number {
  const envQuota = getConfiguredWhatsAppMonthlyQuota();
  if (envQuota !== undefined && envQuota >= 1) {
    return envQuota;
  }
  if (
    typeof settings.whatsappMonthlyQuota === 'number' &&
    Number.isFinite(settings.whatsappMonthlyQuota) &&
    settings.whatsappMonthlyQuota >= 1
  ) {
    return Math.floor(settings.whatsappMonthlyQuota);
  }
  return 500;
}

function buildWhatsAppUsageSummary(usage: {
  monthKey: string;
  sentCount: number;
  quotaLimit: number;
  warned80At: string | null;
  warned100At: string | null;
}): WhatsAppMonthlyUsageSummary {
  const quotaLimit = Math.max(1, Math.floor(usage.quotaLimit));
  const sentCount = Math.max(0, Math.floor(usage.sentCount));
  const percentUsed = Math.round((sentCount / quotaLimit) * 100);
  const alertLevel: WhatsAppQuotaAlertLevel =
    sentCount >= quotaLimit
      ? 'limit_100'
      : sentCount * 100 >= quotaLimit * 80
        ? 'warning_80'
        : 'ok';
  return {
    monthKey: usage.monthKey,
    sentCount,
    quotaLimit,
    percentUsed,
    alertLevel,
    warned80At: usage.warned80At,
    warned100At: usage.warned100At,
  };
}

function linkMediaAssetToBookingInLock(
  db: DemoDatabase,
  mediaUrl: string | null | undefined,
  folder: 'inspo' | 'proofs',
  bookingId: string,
  clientId: string,
  nowIso: string,
): void {
  if (!mediaUrl) return;
  const trimmed = mediaUrl.trim();
  if (
    !trimmed.startsWith('/api/media/') &&
    !trimmed.startsWith('proofs/') &&
    !trimmed.startsWith('inspo/')
  ) {
    return;
  }
  const storagePath = normalizeMediaStoragePath(trimmed);
  if (!storagePath || !inferMediaFolder(storagePath)) return;
  const cols = ensurePhase3Collections(db);
  const existing = cols.mediaAssets.find((a) => a.storagePath === storagePath);
  if (existing) {
    existing.bookingId = bookingId;
    existing.clientId = clientId;
    return;
  }
  cols.mediaAssets.push({
    id: generateId('med'),
    storagePath,
    folder,
    bookingId,
    clientId,
    contentType: inferContentTypeFromPath(storagePath),
    sizeBytes: 0,
    createdAt: nowIso,
    retentionWarned30dAt: null,
    retentionWarned7dAt: null,
    purgedAt: null,
  });
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
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().writeAuditLog({
      actorId: params.actor.id,
      actorEmail: params.actor.email,
      actorRole: params.actor.role,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      metadata: params.metadata,
    });
  }
  return withWriteLock((db) => appendAuditLog(db, params));
}

function mapSplitMethodToCashMethod(method: PaymentSplitMethod): PaymentMethod {
  if (method === 'giftcard') return 'gift_card';
  if (method === 'online') return 'card';
  return method;
}

function mapCashMethodToSplitMethod(method: PaymentMethod): PaymentSplitMethod {
  if (method === 'gift_card') return 'giftcard';
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
    const salonAlertTrigger: WhatsAppTemplateTriggerKey =
      params.kind === 'canceled' ? 'booking_canceled' : 'booking_rescheduled';
    const waRes = await dispatchWhatsAppNotification({
      toPhoneE164: params.settings.whatsappNumber,
      bodyText,
      triggerKey: salonAlertTrigger,
      templateParameters: buildBookingTemplateParameters({
        triggerKey: salonAlertTrigger,
        booking: params.booking,
        settings: params.settings,
        appUrl: env.appUrl,
      }),
      withinServiceWindow: false,
      settingsTimezone: tz,
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
    const emailRes = await dispatchSalonAlertEmail({
      to: params.settings.contactEmail,
      subject,
      bodyText,
      kind: params.kind,
      reason: params.reason,
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

interface WaitlistOfferDispatchPayload {
  entryId: string;
  bookingId: string | null;
  clientId?: string | null;
  clientName: string;
  clientPhoneE164: string;
  clientEmail: string | null;
  serviceName: string;
  serviceSlug: string;
  staffName: string;
  slotStartAt: string;
  dateKey: string;
  offerToken: string;
  offerExpiresAt: string;
  settings: SalonSettings;
}

function assignWaitlistPriorityOfferInLock(
  db: DemoDatabase,
  vacatedSlot: { id: string | null; serviceId: string; staffId: string; startAt: string },
  nowMs = Date.now(),
): WaitlistOfferDispatchPayload | null {
  const tz = db.settings.timezone || 'America/Mexico_City';
  const dateKey = getDateKeyInTimezone(new Date(vacatedSlot.startAt), tz);
  const candidate = selectNextWaitlistCandidate(db.waitlist, {
    serviceId: vacatedSlot.serviceId,
    staffId: vacatedSlot.staffId,
    dateKey,
    nowMs,
  });
  if (!candidate) return null;

  const nowIso = new Date(nowMs).toISOString();
  const offerToken = generateId('wlo');
  const offerExpiresAt = new Date(
    nowMs + WAITLIST_OFFER_TTL_MINUTES * 60_000,
  ).toISOString();

  candidate.status = 'notified';
  candidate.notifiedAt = nowIso;
  candidate.priorityOfferToken = offerToken;
  candidate.priorityOfferExpiresAt = offerExpiresAt;
  candidate.priorityOfferSlotStartAt = vacatedSlot.startAt;
  candidate.priorityOfferStaffId = vacatedSlot.staffId;

  const service = db.services.find((s) => s.id === vacatedSlot.serviceId);
  const staff = db.staff.find((s) => s.id === vacatedSlot.staffId);
  const matchedClient = db.clients.find(
    (c) => phonesMatchE164(c.phoneE164, candidate.clientPhoneE164),
  );
  return {
    entryId: candidate.id,
    bookingId: vacatedSlot.id,
    clientId: matchedClient?.id ?? null,
    clientName: candidate.clientName,
    clientPhoneE164: candidate.clientPhoneE164,
    clientEmail: candidate.clientEmail ?? matchedClient?.email ?? null,
    serviceName: service?.name ?? 'Servicio',
    serviceSlug: service?.slug ?? 'servicio',
    staffName: staff?.name ?? 'Profesional',
    slotStartAt: vacatedSlot.startAt,
    dateKey,
    offerToken,
    offerExpiresAt,
    settings: { ...db.settings },
  };
}

async function dispatchWaitlistPriorityOffer(
  offer: WaitlistOfferDispatchPayload,
): Promise<void> {
  const env = getRuntimeIntegrationStatus();
  const tz = offer.settings.timezone || 'America/Mexico_City';
  const dateLabel = formatDateLongInTimezone(offer.slotStartAt, tz);
  const timeLabel = formatTimeInTimezone(offer.slotStartAt, tz, false);
  const offerUrl = `${env.appUrl}/reservar/${offer.serviceSlug}?date=${encodeURIComponent(offer.dateKey)}&slot=${encodeURIComponent(offer.slotStartAt)}&offer=${encodeURIComponent(offer.offerToken)}`;
  const bodyText = `Hola ${offer.clientName}, se liberó un espacio de ${offer.serviceName} con ${offer.staffName} (${dateLabel} ${timeLabel}) en ${offer.settings.name}. Tienes ${WAITLIST_OFFER_TTL_MINUTES} min de prioridad aquí: ${offerUrl}`;

  const nowIso = new Date().toISOString();
  const waRes = await dispatchWhatsAppNotification({
    toPhoneE164: offer.clientPhoneE164,
    bodyText,
    triggerKey: 'waitlist_offer',
    templateParameters: [
      offer.clientName,
      offer.serviceName,
      dateLabel,
      timeLabel,
      offerUrl,
    ],
    withinServiceWindow: false,
    settingsTimezone: tz,
    fallbackEmail: offer.clientEmail
      ? {
          to: offer.clientEmail,
          subject: `¡Se liberó un espacio en ${offer.settings.name}! (${dateLabel} ${timeLabel})`,
          settings: offer.settings,
          appUrl: env.appUrl,
          template: buildWaitlistOfferTemplatePayload({
            clientName: offer.clientName,
            serviceName: offer.serviceName,
            staffName: offer.staffName,
            dateLabel,
            timeLabel,
            ttlMinutes: WAITLIST_OFFER_TTL_MINUTES,
            offerUrl,
            settings: offer.settings,
            appUrl: env.appUrl,
          }),
          idempotencyKey: `waitlist-offer-${offer.entryId}-${offer.offerToken}`,
        }
      : undefined,
  });

  const log: ScheduledNotification = {
    id: generateId('ntf'),
    bookingId: offer.bookingId,
    clientId: offer.clientId ?? null,
    workflowId: null,
    triggerKey: 'waitlist_offer',
    channel: 'whatsapp',
    recipient: offer.clientPhoneE164,
    scheduledFor: nowIso,
    status: waRes.status,
    deliveryStatus: waRes.status === 'sent' ? 'sent' : 'failed',
    subject: `Oferta prioritaria lista de espera (${WAITLIST_OFFER_TTL_MINUTES} min)`,
    previewText: bodyText,
    bodyText,
    providerMessageId: waRes.providerMessageId,
    errorMessage: waRes.errorMessage,
    attempts: 1,
    maxAttempts: 3,
    nextRetryAt: null,
    lastAttemptAt: nowIso,
    sentAt: waRes.status === 'sent' ? nowIso : null,
    createdAt: nowIso,
  };

  if (isSupabaseEnabled()) {
    const supabase = createSupabaseAdminClient();
    await supabase.from('scheduled_notifications').insert({
      booking_id: log.bookingId,
      client_id: log.clientId ?? null,
      workflow_id: log.workflowId,
      trigger_key: log.triggerKey ?? null,
      channel: log.channel,
      recipient: log.recipient,
      scheduled_for: log.scheduledFor,
      status: log.status,
      delivery_status: log.deliveryStatus ?? null,
      subject: log.subject,
      preview_text: log.previewText,
      body_text: log.bodyText ?? log.previewText,
      provider_message_id: log.providerMessageId,
      error_message: log.errorMessage,
      attempts: log.attempts ?? 1,
      max_attempts: log.maxAttempts ?? 3,
      next_retry_at: log.nextRetryAt ?? null,
      last_attempt_at: log.lastAttemptAt ?? nowIso,
      sent_at: log.sentAt,
    });
  } else {
    await withWriteLock((liveDb) => {
      liveDb.notifications.unshift(log);
    });
  }
  publishRealtimeEvent('waitlist_updated');
}

interface ExtendedQueryAvailabilityInput extends QueryAvailabilityInput {
  extraServiceIds?: string[];
}

interface ExtendedCreateBookingAtomicInput extends CreateBookingAtomicInput {
  extraServiceIds?: string[];
  clientInstagram?: string | null;
  proofDeliveryMethod?: 'web_upload' | 'web_link' | 'instagram_dm' | 'none';
  customDurationMinutes?: number | null;
  customPriceCents?: number | null;
  internalNotes?: string | null;
  notifyEmail?: boolean;
  notifyWhatsapp?: boolean;
  privacyConsentAccepted?: boolean;
  marketingOptIn?: boolean;
  enforceMaxActiveBookings?: boolean;
  recurrenceSeriesId?: string | null;
  recurrenceIndex?: number;
  recurrenceTotal?: number;
  actor?: AuditActor;
}

function buildWaitlistOfferSlotHolds(
  waitlist: readonly WaitlistEntry[],
  services: readonly Service[],
  nowMs: number,
  callerOfferToken?: string | null,
): SlotHold[] {
  const trimmedToken = callerOfferToken?.trim() || null;
  const holds: SlotHold[] = [];
  for (const entry of waitlist) {
    if (entry.status !== 'notified') continue;
    const offerToken = entry.priorityOfferToken?.trim();
    const slotStartAt = entry.priorityOfferSlotStartAt;
    const staffId = entry.priorityOfferStaffId;
    const expiresAt = entry.priorityOfferExpiresAt;
    if (!offerToken || !slotStartAt || !staffId || !expiresAt) continue;
    const expiresMs = Date.parse(expiresAt);
    if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) continue;
    if (trimmedToken && offerToken === trimmedToken) continue;
    const startMs = Date.parse(slotStartAt);
    if (!Number.isFinite(startMs)) continue;
    const matchedService = services.find((srv) => srv.id === entry.serviceId);
    const durationMinutes = matchedService?.durationMinutes ?? 60;
    const bufferBeforeMinutes = matchedService?.bufferBeforeMinutes ?? 0;
    const bufferAfterMinutes = matchedService?.bufferAfterMinutes ?? 0;
    holds.push({
      id: `wlo-hold-${entry.id}`,
      staffId,
      serviceId: entry.serviceId,
      sessionToken: `waitlist-offer:${entry.id}`,
      startAt: new Date(startMs - bufferBeforeMinutes * 60_000).toISOString(),
      endAt: new Date(
        startMs + (durationMinutes + bufferAfterMinutes) * 60_000,
      ).toISOString(),
      expiresAt,
      createdAt: entry.notifiedAt ?? entry.createdAt,
    });
  }
  return holds;
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
  const effectiveSlotHolds = [
    ...db.slotHolds,
    ...buildWaitlistOfferSlotHolds(
      db.waitlist,
      db.services,
      Date.now(),
      params.waitlistOfferToken,
    ),
  ];

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
      slotHolds: effectiveSlotHolds,
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

function computeQuickSearchAvailability(
  db: Readonly<DemoDatabase>,
  params: {
    serviceId: string;
    extraServiceIds?: string[];
    addonIds: string[];
    staffId?: string | null;
    startDate: string;
    days: number;
    limit?: number;
    sessionToken?: string | null;
    waitlistOfferToken?: string | null;
  },
) {
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
  const effectiveSlotHolds = [
    ...db.slotHolds,
    ...buildWaitlistOfferSlotHolds(
      db.waitlist,
      db.services,
      Date.now(),
      params.waitlistOfferToken,
    ),
  ];

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
      slotHolds: effectiveSlotHolds,
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

export function quickSearchAvailability(params: {
  serviceId: string;
  extraServiceIds?: string[];
  addonIds: string[];
  staffId?: string | null;
  startDate: string;
  days: number;
  limit?: number;
  sessionToken?: string | null;
  waitlistOfferToken?: string | null;
}) {
  return computeQuickSearchAvailability(getSnapshot(), params);
}

export async function quickSearchAvailabilityAsync(
  params: QuickSearchAvailabilityInput,
) {
  return getRepository().quickSearchAvailability(params);
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
    waitlistOfferToken?: string | null;
  },
): AvailabilityContext {
  const nowMs = (options?.now ?? new Date()).getTime();
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
    slotHolds: [
      ...db.slotHolds,
      ...buildWaitlistOfferSlotHolds(
        db.waitlist,
        db.services,
        nowMs,
        options?.waitlistOfferToken,
      ),
    ],
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
  waitlistOfferToken?: string | null;
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
    waitlistOfferToken: params.waitlistOfferToken ?? null,
  });

  if (params.staffId) {
    const requestedStaff = params.db.staff.find((s) => s.id === params.staffId);
    if (
      !requestedStaff ||
      !isStaffEligibleForAllServices(requestedStaff, requiredServiceIds)
    ) {
      throw new PolicyError(
        'STAFF_INELIGIBLE',
        'La profesional seleccionada no está disponible para todos los servicios elegidos.',
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
      'No hay profesionales disponibles para este servicio.',
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
      const cols = ensurePhase3Collections(db);
      const hasServiceIncome = db.cashEntries.some(
        (e) => e.bookingId === effect.bookingId && e.entryType === 'service_income',
      );
      const balance = computeBookingBalance(booking, cols.paymentSplits, db.cashEntries);
      const tipCents = options.tipCents ?? 0;
      const amountToRecord = balance.remainingCents;
      if (!hasServiceIncome && (amountToRecord > 0 || tipCents > 0)) {
        const nowIso = new Date().toISOString();
        const paymentMethod = options.paymentMethod ?? 'card';
        const staff = db.staff.find((s) => s.id === effect.staffId);
        const pct = staff?.commissionPercent ?? db.settings.defaultCommissionPercent;
        const commissionCents = Math.round((amountToRecord * pct) / 100);
        db.cashEntries.unshift({
          id: generateId('cash'),
          bookingId: effect.bookingId,
          staffId: effect.staffId,
          entryType: 'service_income',
          description: `${hydrated.service.name} — ${hydrated.client.fullName}`,
          amountCents: amountToRecord,
          tipCents,
          commissionCents,
          paymentMethod,
          occurredAt: nowIso,
          recordedBy: options.recordedBy ?? 'Admin',
        });
        const existingSplitsPaid = cols.paymentSplits
          .filter((s) => s.bookingId === effect.bookingId && s.amountCents > 0)
          .reduce((sum, s) => sum + s.amountCents, 0);
        const splitAmountNeeded = Math.max(0, booking.totalPriceCents - existingSplitsPaid);
        if (splitAmountNeeded > 0 || tipCents > 0) {
          cols.paymentSplits.push({
            id: generateId('ps'),
            bookingId: effect.bookingId,
            method: mapCashMethodToSplitMethod(paymentMethod),
            amountCents: Math.min(amountToRecord, splitAmountNeeded),
            tipCents,
            tipStaffId: tipCents > 0 ? effect.staffId : null,
            reference: 'Liquidación de cita',
            createdAt: nowIso,
          });
        }
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

type ValidatedBookingMediaField =
  | { kind: 'none' }
  | { kind: 'url'; url: string }
  | { kind: 'data_url'; dataUrl: string };

function validateBookingMediaField(
  value: string | null | undefined,
  folder: 'inspo' | 'proofs',
): ValidatedBookingMediaField {
  const trimmed = value?.trim();
  if (!trimmed) return { kind: 'none' };
  if (trimmed.toLowerCase().startsWith('data:')) {
    try {
      validateMediaDataUrl(trimmed);
      return { kind: 'data_url', dataUrl: trimmed };
    } catch (err) {
      if (err instanceof MediaValidationError) {
        throw new PolicyError(err.code, err.message);
      }
      throw err;
    }
  }
  if (folder === 'proofs' && isSafeExternalProofUrl(trimmed)) {
    return { kind: 'url', url: trimmed };
  }
  if (isSafeInternalBookingMediaPath(trimmed, folder)) {
    return {
      kind: 'url',
      url: trimmed.startsWith('/api/media/') ? trimmed : `/api/media/${trimmed}`,
    };
  }
  throw new PolicyError(
    'INVALID_MEDIA_URL',
    folder === 'proofs'
      ? 'Sube una imagen PNG, JPEG o WEBP, o pega un enlace HTTPS válido de tu comprobante.'
      : 'Solo se permiten imágenes subidas directamente (PNG, JPEG o WEBP). No se aceptan URLs externas.',
  );
}

export async function persistBookingMediaField(
  value: string | null | undefined,
  folder: 'inspo' | 'proofs',
  context?: { bookingId?: string | null; clientId?: string | null },
): Promise<string | null> {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase().startsWith('data:')) {
    try {
      const stored = await storeMediaUpload({ dataUrl: trimmed, folder });
      await registerMediaAsset({
        storagePath: stored.storagePath,
        folder,
        bookingId: context?.bookingId ?? null,
        clientId: context?.clientId ?? null,
        contentType: stored.contentType,
        sizeBytes: stored.sizeBytes,
      });
      return `/api/media/${stored.storagePath}`;
    } catch (err) {
      if (err instanceof MediaValidationError) {
        throw new PolicyError(err.code, err.message);
      }
      throw err;
    }
  }
  if (folder === 'proofs' && isSafeExternalProofUrl(trimmed)) {
    return trimmed;
  }
  if (isSafeInternalBookingMediaPath(trimmed, folder)) {
    return trimmed.startsWith('/api/media/') ? trimmed : `/api/media/${trimmed}`;
  }
  throw new PolicyError(
    'INVALID_MEDIA_URL',
    folder === 'proofs'
      ? 'Sube una imagen PNG, JPEG o WEBP, o pega un enlace HTTPS válido de tu comprobante.'
      : 'Solo se permiten imágenes subidas directamente (PNG, JPEG o WEBP). No se aceptan URLs externas.',
  );
}

export async function persistBrandMediaField(
  value: string | null | undefined,
): Promise<string | null> {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase().startsWith('data:')) {
    try {
      const stored = await storeMediaUpload({ dataUrl: trimmed, folder: 'gallery' });
      return `/api/media/${stored.storagePath}`;
    } catch (err) {
      if (err instanceof MediaValidationError) {
        throw new PolicyError(err.code, err.message);
      }
      throw err;
    }
  }
  if (isSafeBrandMediaPath(trimmed)) {
    return trimmed;
  }
  throw new PolicyError(
    'INVALID_MEDIA_URL',
    'Solo se permiten imágenes subidas desde tu dispositivo (PNG, JPEG o WEBP) o rutas del estudio.',
  );
}

interface ExtendedCreateSlotHoldInput extends CreateSlotHoldInput {
  extraServiceIds?: string[];
}

export async function createOrRefreshSlotHold(
  params: ExtendedCreateSlotHoldInput,
): Promise<SlotHoldResult> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().createOrRefreshSlotHold(params);
  }
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
      waitlistOfferToken: params.waitlistOfferToken ?? null,
      conflictMessage: 'Ese horario acaba de ser apartado hace unos segundos.',
    });

    db.slotHolds = db.slotHolds.filter((h) => h.sessionToken !== params.sessionToken);

    const holdMinutes = db.settings.slotHoldMinutes || 5;
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
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().releaseSlotHold(sessionToken);
  }
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
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().createBookingAtomic(params);
  }
  const normalizedInstagram = normalizeInstagramHandle(params.clientInstagram);
  const validatedInspo = validateBookingMediaField(params.inspoPhotoUrl, 'inspo');
  const validatedProof = validateBookingMediaField(params.paymentProofUrl, 'proofs');
  const initialInspoPhotoUrl =
    validatedInspo.kind === 'url' ? validatedInspo.url : null;
  const initialPaymentProofUrl =
    validatedProof.kind === 'url' ? validatedProof.url : null;
  const resolvedProofDeliveryMethod =
    params.proofDeliveryMethod ??
    (validatedProof.kind === 'data_url'
      ? 'web_upload'
      : validatedProof.kind === 'url'
        ? validatedProof.url.startsWith('https://')
          ? 'web_link'
          : 'web_upload'
        : 'none');

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
          isReplay: true,
          bookingId: existing.id,
          clientId: existing.clientId,
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
      const activeFutureBookings = db.bookings
        .filter(
          (b) =>
            b.clientId === existingClient.id &&
            isActiveBookingStatus(b.status) &&
            new Date(b.endAt).getTime() > now.getTime(),
        )
        .toSorted((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
      if (activeFutureBookings.length >= maxActive) {
        const activeBookings: ActiveBookingRecoveryItem[] = activeFutureBookings.map((b) => {
          const svc = db.services.find((s) => s.id === b.serviceId);
          const st = db.staff.find((s) => s.id === b.staffId);
          return {
            bookingCode: b.bookingCode,
            serviceName: svc?.name ?? 'Servicio',
            staffName: st?.name ?? 'Profesional',
            startAt: b.startAt,
            manageUrl: `/cita/${b.manageToken}`,
          };
        });
        throw new MaxActiveBookingsError(
          `Ya cuentas con ${activeFutureBookings.length} citas activas (límite máximo: ${maxActive}). Cancela o reagenda una cita existente antes de agendar otra.`,
          activeBookings,
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
      waitlistOfferToken: params.waitlistOfferToken ?? null,
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
          waitlistOfferToken: params.waitlistOfferToken ?? null,
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
    const configuredDepositCents = Math.max(
      service.depositAmountCents,
      ...extraServices.map((s) => s.depositAmountCents),
      db.settings.depositAmountCents ?? 0,
    );
    const noShowPolicy = evaluateClientNoShowPolicy({
      noShowCount: client.noShowCount,
      threshold: db.settings.noShowDepositThreshold,
      baseDepositAmountCents: configuredDepositCents,
    });
    const effectiveDepositRequired =
      anyDepositRequired || noShowPolicy.requiresMandatoryDeposit;
    const depositAmountCents = effectiveDepositRequired
      ? Math.max(
          anyDepositRequired
            ? Math.max(
                service.depositRequired ? service.depositAmountCents : 0,
                ...extraServices.map((s) =>
                  s.depositRequired ? s.depositAmountCents : 0,
                ),
                db.settings.depositAmountCents ?? 0,
              )
            : 0,
          noShowPolicy.requiresMandatoryDeposit ? noShowPolicy.depositAmountCents : 0,
        )
      : 0;

    const needsOnlinePayment =
      !params.forceConfirmed &&
      effectiveDepositRequired &&
      (db.settings.paymentMode === 'mercadopago' || db.settings.paymentMode === 'stripe');
    const needsManualConfirm =
      !params.forceConfirmed &&
      !needsOnlinePayment &&
      (anyRequiresConfirmation ||
        (effectiveDepositRequired && db.settings.paymentMode === 'manual_transfer') ||
        noShowPolicy.requiresMandatoryDeposit);

    const status: BookingStatus = needsOnlinePayment
      ? 'pending_payment'
      : needsManualConfirm
        ? 'pending_confirmation'
        : 'confirmed';
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
      inspoPhotoUrl: initialInspoPhotoUrl,
      paymentProofUrl: initialPaymentProofUrl,
      proofDeliveryMethod: resolvedProofDeliveryMethod,
      attendanceStatus: 'pending',
      googleEventId: null,
      cancellationReason: null,
      rescheduledFromId: null,
      ...(params.recurrenceSeriesId
        ? { recurrenceSeriesId: params.recurrenceSeriesId }
        : {}),
      ...(typeof params.recurrenceIndex === 'number'
        ? { recurrenceIndex: params.recurrenceIndex }
        : {}),
      ...(typeof params.recurrenceTotal === 'number'
        ? { recurrenceTotal: params.recurrenceTotal }
        : {}),
      ...(noShowPolicy.requiresMandatoryDeposit ? { noShowPolicyEnforced: true } : {}),
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

    linkMediaAssetToBookingInLock(
      db,
      initialInspoPhotoUrl,
      'inspo',
      booking.id,
      client.id,
      nowIso,
    );
    linkMediaAssetToBookingInLock(
      db,
      initialPaymentProofUrl,
      'proofs',
      booking.id,
      client.id,
      nowIso,
    );

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

    if (params.waitlistOfferToken?.trim()) {
      const token = params.waitlistOfferToken.trim();
      const matchedOffer = db.waitlist.find(
        (entry) =>
          entry.priorityOfferToken === token &&
          entry.status === 'notified',
      );
      if (matchedOffer) {
        matchedOffer.status = 'booked';
      }
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

    return {
      hydrated,
      outboxEvents,
      isReplay: false,
      bookingId: booking.id,
      clientId: client.id,
    };
  });

  if (
    !committed.isReplay &&
    (validatedInspo.kind === 'data_url' || validatedProof.kind === 'data_url')
  ) {
    const uploadedPaths: string[] = [];
    let uploadedInspoUrl: string | null = null;
    let uploadedProofUrl: string | null = null;
    try {
      if (validatedInspo.kind === 'data_url') {
        uploadedInspoUrl = await persistBookingMediaField(
          validatedInspo.dataUrl,
          'inspo',
          { bookingId: committed.bookingId, clientId: committed.clientId },
        );
        const storagePath = uploadedInspoUrl
          ? normalizeMediaStoragePath(uploadedInspoUrl)
          : null;
        if (storagePath) uploadedPaths.push(storagePath);
      }
      if (validatedProof.kind === 'data_url') {
        uploadedProofUrl = await persistBookingMediaField(
          validatedProof.dataUrl,
          'proofs',
          { bookingId: committed.bookingId, clientId: committed.clientId },
        );
        const storagePath = uploadedProofUrl
          ? normalizeMediaStoragePath(uploadedProofUrl)
          : null;
        if (storagePath) uploadedPaths.push(storagePath);
      }
    } catch (err) {
      for (const storagePath of uploadedPaths) {
        await deleteStoredMedia(storagePath).catch(() => {});
      }
      throw err;
    }

    await withWriteLock((liveDb) => {
      const target = liveDb.bookings.find((b) => b.id === committed.bookingId);
      if (!target) return;
      if (uploadedInspoUrl) target.inspoPhotoUrl = uploadedInspoUrl;
      if (uploadedProofUrl) target.paymentProofUrl = uploadedProofUrl;
    });
    if (uploadedInspoUrl) committed.hydrated.inspoPhotoUrl = uploadedInspoUrl;
    if (uploadedProofUrl) committed.hydrated.paymentProofUrl = uploadedProofUrl;
  }

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
  skipDepositEntries?: boolean;
  skipRecordCash?: boolean;
}): Promise<BookingWithRelations> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().updateBookingStatus(params);
  }
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
      booking.confirmedVia = booking.confirmedVia ?? 'manual';
      if (!params.skipDepositEntries && booking.depositAmountCents > 0) {
        if (!cols.paymentSplits.some((s) => s.bookingId === booking.id)) {
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
        if (
          !db.cashEntries.some(
            (e) => e.bookingId === booking.id && e.entryType === 'deposit',
          )
        ) {
          const clientName =
            db.clients.find((c) => c.id === booking.clientId)?.fullName ?? 'Clienta';
          db.cashEntries.unshift({
            id: generateId('cash'),
            bookingId: booking.id,
            staffId: booking.staffId,
            entryType: 'deposit',
            description: `Anticipo SPEI ${booking.bookingCode} — ${clientName}`,
            amountCents: booking.depositAmountCents,
            tipCents: 0,
            commissionCents: 0,
            paymentMethod: 'transfer',
            occurredAt: nowIso,
            recordedBy: params.recordedBy ?? params.actor?.fullName ?? 'Admin',
          });
        }
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

    const waitlistOffer =
      transition.nextStatus === 'canceled'
        ? assignWaitlistPriorityOfferInLock(db, booking)
        : null;

    if (transition.nextStatus === 'completed') {
      awardLoyaltyStampInLock(db, booking);
    }

    const hydrated = hydrateBooking(db, booking);
    const effectiveTransitionEffects = params.skipRecordCash
      ? transition.effects.filter((effect) => effect.type !== 'RecordCash')
      : transition.effects;
    const outboxEvents = applyInLockTransitionEffects(
      db,
      booking,
      hydrated,
      effectiveTransitionEffects,
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

    return { hydrated, outboxEvents, waitlistOffer };
  });

  await dispatchPostCommitOutbox(committed.outboxEvents);
  if (committed.waitlistOffer) {
    await dispatchWaitlistPriorityOffer(committed.waitlistOffer);
  }
  return committed.hydrated;
}

export async function confirmBookingDepositFromWebhook(params: {
  provider: 'mercadopago' | 'stripe';
  providerPaymentId: string;
  bookingReference: string;
  amountCents: number;
  currency: 'MXN' | 'USD';
}): Promise<
  | { status: 'not_found' }
  | { status: 'ok'; idempotent: boolean; bookingId: string }
> {
  const trimmedPaymentId = params.providerPaymentId.trim();
  const trimmedRef = params.bookingReference.trim();
  const normalizedRef = trimmedRef.toUpperCase();

  if (isSupabaseEnabled()) {
    const supabase = createSupabaseAdminClient();
    const repo = createSupabaseRepository();
    const existingRes = await supabase
      .from('booking_payments')
      .select('booking_id')
      .eq('provider', params.provider)
      .eq('provider_payment_id', trimmedPaymentId)
      .eq('status', 'paid')
      .maybeSingle();
    if (existingRes.data?.booking_id) {
      return {
        status: 'ok',
        idempotent: true,
        bookingId: existingRes.data.booking_id,
      };
    }

    const byCodeRes = await supabase
      .from('bookings')
      .select('id, booking_code, status, staff_id, deposit_amount_cents')
      .eq('booking_code', normalizedRef)
      .maybeSingle();
    let bookingRow = byCodeRes.data;
    if (!bookingRow && /^[0-9a-f-]{36}$/i.test(trimmedRef)) {
      const byIdRes = await supabase
        .from('bookings')
        .select('id, booking_code, status, staff_id, deposit_amount_cents')
        .eq('id', trimmedRef)
        .maybeSingle();
      bookingRow = byIdRes.data;
    }
    if (!bookingRow) {
      return { status: 'not_found' };
    }
    const booking = {
      id: bookingRow.id,
      bookingCode: bookingRow.booking_code,
      status: bookingRow.status,
      staffId: bookingRow.staff_id,
      depositAmountCents: bookingRow.deposit_amount_cents,
      checkoutUrl: null as string | null,
    };

    const nowIso = new Date().toISOString();
    const effectiveAmountCents =
      params.amountCents > 0 ? params.amountCents : booking.depositAmountCents;

    await supabase.from('booking_payments').insert({
      booking_id: booking.id,
      provider: params.provider,
      amount_cents: effectiveAmountCents,
      currency: params.currency,
      status: 'paid',
      paid_at: nowIso,
      provider_payment_id: trimmedPaymentId,
      checkout_url: booking.checkoutUrl ?? null,
    });

    if (
      booking.status === 'pending_payment' ||
      booking.status === 'pending_confirmation'
    ) {
      await repo.updateBookingStatus({
        bookingId: booking.id,
        status: 'confirmed',
        recordedBy: 'Mercado Pago Webhook',
        skipDepositEntries: true,
      });
    }
    await supabase
      .from('bookings')
      .update({ confirmed_via: 'payment', updated_at: nowIso })
      .eq('id', booking.id);

    if (effectiveAmountCents > 0) {
      const existingSplits = await fetchSupabaseBookingPaymentSplits(booking.id);
      if (existingSplits.length === 0) {
        await repo.recordPaymentSplits({
          bookingId: booking.id,
          splits: [
            {
              method: 'online',
              amountCents: effectiveAmountCents,
              tipCents: 0,
              tipStaffId: null,
              reference: `${params.provider.toUpperCase()}-${trimmedPaymentId}`,
            },
          ],
        });
      }
      const existingDepositCashRes = await supabase
        .from('cash_register_entries')
        .select('id')
        .eq('booking_id', booking.id)
        .eq('entry_type', 'deposit')
        .limit(1);
      if ((existingDepositCashRes.data ?? []).length === 0) {
        await repo.addCashEntry({
          bookingId: booking.id,
          staffId: booking.staffId,
          entryType: 'deposit',
          description: `Anticipo en línea ${booking.bookingCode} (${params.provider})`,
          amountCents: effectiveAmountCents,
          tipCents: 0,
          commissionCents: 0,
          paymentMethod: 'card',
          recordedBy: 'Mercado Pago Webhook',
        });
      }
    }

    await repo.writeAuditLog({
      actorId: 'system-mercadopago',
      actorEmail: 'webhook@mercadopago.system',
      actorRole: 'owner',
      action: 'deposit_approved',
      entityType: 'booking',
      entityId: booking.id,
      metadata: {
        bookingCode: booking.bookingCode,
        provider: params.provider,
        providerPaymentId: trimmedPaymentId,
        amountCents: effectiveAmountCents,
      },
    });

    return {
      status: 'ok',
      idempotent: false,
      bookingId: booking.id,
    };
  }

  const committed = await withWriteLock((db) => {
    const cols = ensurePhase3Collections(db);
    const existingApproved = cols.bookingPayments.find(
      (p) =>
        p.provider === params.provider &&
        p.providerPaymentId === trimmedPaymentId &&
        p.status === 'approved',
    );
    if (existingApproved) {
      return {
        status: 'ok' as const,
        idempotent: true,
        bookingId: existingApproved.bookingId,
        outboxEvents: [] as OutboxEventInput[],
      };
    }

    const booking = db.bookings.find(
      (b) =>
        b.bookingCode.toUpperCase() === normalizedRef || b.id === trimmedRef,
    );
    if (!booking) {
      return {
        status: 'not_found' as const,
        idempotent: false,
        bookingId: '',
        outboxEvents: [] as OutboxEventInput[],
      };
    }

    const nowIso = new Date().toISOString();
    const effectiveAmountCents =
      params.amountCents > 0 ? params.amountCents : booking.depositAmountCents;

    const paymentRecord: BookingPayment = {
      id: generateId('pay'),
      bookingId: booking.id,
      provider: params.provider,
      amountCents: effectiveAmountCents,
      currency: params.currency,
      status: 'approved',
      providerPaymentId: trimmedPaymentId,
      checkoutUrl: booking.checkoutUrl ?? null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    cols.bookingPayments.unshift(paymentRecord);

    const outboxEvents: OutboxEventInput[] = [];
    if (
      booking.status === 'pending_payment' ||
      booking.status === 'pending_confirmation'
    ) {
      const transition = transitionBookingStatus(booking, 'confirmed');
      if (transition.ok) {
        booking.status = transition.nextStatus;
        booking.confirmedVia = 'payment';
        booking.updatedAt = nowIso;
        const hydrated = hydrateBooking(db, booking);
        outboxEvents.push(
          ...applyInLockTransitionEffects(
            db,
            booking,
            hydrated,
            transition.effects,
            { recordedBy: 'Mercado Pago Webhook' },
          ),
        );
      }
    } else {
      booking.confirmedVia = booking.confirmedVia ?? 'payment';
      booking.updatedAt = nowIso;
    }

    if (effectiveAmountCents > 0) {
      if (!cols.paymentSplits.some((s) => s.bookingId === booking.id)) {
        cols.paymentSplits.push({
          id: generateId('ps'),
          bookingId: booking.id,
          method: 'online',
          amountCents: effectiveAmountCents,
          tipCents: 0,
          tipStaffId: null,
          reference: `${params.provider.toUpperCase()}-${trimmedPaymentId}`,
          createdAt: nowIso,
        });
      }
      if (
        !db.cashEntries.some(
          (e) => e.bookingId === booking.id && e.entryType === 'deposit',
        )
      ) {
        db.cashEntries.unshift({
          id: generateId('cash'),
          bookingId: booking.id,
          staffId: booking.staffId,
          entryType: 'deposit',
          description: `Anticipo en línea ${booking.bookingCode} (${params.provider})`,
          amountCents: effectiveAmountCents,
          tipCents: 0,
          commissionCents: 0,
          paymentMethod: 'card',
          occurredAt: nowIso,
          recordedBy: 'Mercado Pago Webhook',
        });
      }
    }

    appendAuditLog(db, {
      actor: {
        id: 'system-mercadopago',
        email: 'webhook@mercadopago.system',
        role: 'owner',
      },
      action: 'deposit_approved',
      entityType: 'booking',
      entityId: booking.id,
      metadata: {
        bookingCode: booking.bookingCode,
        provider: params.provider,
        providerPaymentId: trimmedPaymentId,
        amountCents: effectiveAmountCents,
      },
    });

    outboxEvents.push({
      type: 'Realtime',
      eventType: 'slot_changed',
      payload: { staffId: booking.staffId, startAt: booking.startAt },
    });

    return {
      status: 'ok' as const,
      idempotent: false,
      bookingId: booking.id,
      outboxEvents,
    };
  });

  if (committed.status === 'not_found') {
    return { status: 'not_found' };
  }

  await dispatchPostCommitOutbox(committed.outboxEvents);
  return {
    status: 'ok',
    idempotent: committed.idempotent,
    bookingId: committed.bookingId,
  };
}

export async function recordBookingCheckoutAtomic(params: {
  bookingId: string;
  splits: PaymentSplitInput[];
  extraItem?: { inventoryItemId: string; quantity: number } | null;
  markCompleted?: boolean;
  redeemLoyaltyReward?: boolean;
  redeemClientPackageId?: string | null;
  actor: AuditActor;
}): Promise<{
  booking: BookingWithRelations;
  splits: PaymentSplit[];
  summary: BookingPaymentSummary;
  stampAwarded: LoyaltyStamp | null;
  redeemedPackage?: ClientPackage | null;
}> {
  if (isSupabaseEnabled()) {
    const repo = createSupabaseRepository();
    const supabase = createSupabaseAdminClient();
    const [hydratedBeforeCash, settings, extraInventoryItem, activeProgram] =
      await Promise.all([
        fetchSupabaseBookingById(params.bookingId),
        repo.getSalonSettings(),
        params.extraItem
          ? fetchSupabaseActiveInventoryItemById(params.extraItem.inventoryItemId)
          : Promise.resolve(null),
        params.redeemLoyaltyReward || params.markCompleted !== false
          ? fetchSupabaseActiveLoyaltyProgram()
          : Promise.resolve(null),
      ]);
    const booking = hydratedBeforeCash;
    if (!booking) throw new PolicyError('BOOKING_NOT_FOUND', 'Cita no encontrada.');
    if (booking.status === 'canceled' || booking.status === 'no_show') {
      throw new PolicyError(
        'INVALID_STATE',
        'No se puede registrar cobro en una cita cancelada o no-show.',
      );
    }

    const isPast = new Date(booking.endAt).getTime() < Date.now();
    const pastLockActive = settings.lockPastBookings !== false;
    if (pastLockActive && isPast && params.actor.role !== 'owner') {
      throw new PolicyError(
        'PAST_BOOKING_LOCKED',
        'Las citas pasadas están bloqueadas; solo la Dueña puede cobrarlas o modificarlas.',
      );
    }

    let extraRetailTotalCents = 0;
    if (params.extraItem) {
      if (!extraInventoryItem) {
        throw new PolicyError('ITEM_NOT_FOUND', 'Producto de reventa no encontrado.');
      }
      extraRetailTotalCents = Math.round(
        extraInventoryItem.retailPriceCents * params.extraItem.quantity,
      );
    }

    const effectiveTotalCents = booking.totalPriceCents + extraRetailTotalCents;
    const validation = validatePaymentSplits(params.splits, effectiveTotalCents);
    if (!validation.ok) {
      throw new PolicyError(validation.code, validation.message);
    }

    let loyaltyProgramForRedemption: LoyaltyProgram | null = null;
    let clientLoyaltyStamps: LoyaltyStamp[] = [];
    if (params.redeemLoyaltyReward) {
      if (!activeProgram) {
        throw new PolicyError(
          'LOYALTY_NOT_READY',
          'No hay un programa de lealtad activo.',
        );
      }
      const [stamps, rewardServices] = await Promise.all([
        fetchSupabaseClientLoyaltyStamps(booking.clientId, activeProgram.id),
        activeProgram.rewardServiceId
          ? fetchSupabaseServicesByIds([activeProgram.rewardServiceId])
          : Promise.resolve([]),
      ]);
      clientLoyaltyStamps = stamps;
      const rewardServiceName = rewardServices[0]?.name ?? null;
      const clientLoyalty = computeClientLoyaltySummary(
        activeProgram,
        stamps,
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

    const recordedBy = params.actor.fullName || params.actor.email;
    if (pastLockActive && isPast && params.actor.role === 'owner') {
      await repo.writeAuditLog({
        actorId: params.actor.id,
        actorEmail: params.actor.email,
        actorRole: params.actor.role,
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
      await repo.adjustInventoryItem({
        itemId: extraInventoryItem.id,
        delta: -params.extraItem.quantity,
        reason: 'retail_sale',
        notes: `Checkout cita ${booking.bookingCode}`,
        createdBy: recordedBy,
      });
      await supabase
        .from('bookings')
        .update({
          subtotal_cents: booking.subtotalCents + extraRetailTotalCents,
          total_price_cents: effectiveTotalCents,
          updated_at: new Date().toISOString(),
        })
        .eq('id', booking.id);
    }

    const createdSplits = await repo.recordPaymentSplits({
      bookingId: booking.id,
      splits: params.splits.map((s) => ({
        method: s.method,
        amountCents: s.amountCents,
        tipCents: s.tipCents ?? 0,
        tipStaffId:
          s.tipStaffId !== undefined
            ? s.tipStaffId
            : (s.tipCents ?? 0) > 0
              ? booking.staffId
              : null,
        reference: s.reference ?? null,
      })),
    });

    const extraSuffix =
      extraInventoryItem && params.extraItem
        ? ` + ${extraInventoryItem.name} (x${params.extraItem.quantity})`
        : '';
    const commissionPct =
      booking.staff.commissionPercent ?? settings.defaultCommissionPercent;

    for (const splitRecord of createdSplits) {
      if (splitRecord.amountCents === 0 && splitRecord.tipCents === 0) continue;
      const commissionCents = Math.round((splitRecord.amountCents * commissionPct) / 100);
      const isCrossStaffTip =
        splitRecord.tipCents > 0 &&
        Boolean(splitRecord.tipStaffId) &&
        splitRecord.tipStaffId !== booking.staffId;

      await repo.addCashEntry({
        bookingId: booking.id,
        staffId: booking.staffId,
        entryType: 'service_income',
        description: `${booking.service.name}${extraSuffix} — ${booking.client.fullName}`,
        amountCents: splitRecord.amountCents,
        tipCents: isCrossStaffTip ? 0 : splitRecord.tipCents,
        commissionCents,
        paymentMethod: mapSplitMethodToCashMethod(splitRecord.method),
        recordedBy,
      });

      if (isCrossStaffTip && splitRecord.tipStaffId) {
        await repo.addCashEntry({
          bookingId: booking.id,
          staffId: splitRecord.tipStaffId,
          entryType: 'service_income',
          description: `Propina (${booking.service.name} — ${booking.client.fullName})`,
          amountCents: 0,
          tipCents: splitRecord.tipCents,
          commissionCents: 0,
          paymentMethod: mapSplitMethodToCashMethod(splitRecord.method),
          recordedBy,
        });
      }
    }

    if (loyaltyProgramForRedemption) {
      const requiredCount = Math.max(
        1,
        Math.floor(loyaltyProgramForRedemption.stampsRequired),
      );
      const eligibleStamps = clientLoyaltyStamps.toSorted((a, b) => {
        const dateCmp = a.stampedDate.localeCompare(b.stampedDate);
        return dateCmp !== 0 ? dateCmp : a.createdAt.localeCompare(b.createdAt);
      });
      const consumedIds = eligibleStamps.slice(0, requiredCount).map((s) => s.id);
      if (consumedIds.length > 0) {
        await supabase.from('loyalty_stamps').delete().in('id', consumedIds);
      }
      await repo.writeAuditLog({
        actorId: params.actor.id,
        actorEmail: params.actor.email,
        actorRole: params.actor.role,
        action: 'loyalty_redeemed',
        entityType: 'client',
        entityId: booking.clientId,
        metadata: {
          bookingId: booking.id,
          bookingCode: booking.bookingCode,
          programId: loyaltyProgramForRedemption.id,
          stampsConsumed: consumedIds.length,
        },
      });
    }

    const shouldComplete =
      params.markCompleted !== false && booking.status !== 'completed';
    const hydratedFinal = shouldComplete
      ? await repo.updateBookingStatus({
          bookingId: booking.id,
          status: 'completed',
          recordedBy,
          skipLoyaltyStamp: true,
          skipRecordCash: true,
        })
      : {
          ...booking,
          subtotalCents: booking.subtotalCents + extraRetailTotalCents,
          totalPriceCents: effectiveTotalCents,
        };

    let stampAwarded: LoyaltyStamp | null = null;
    if (hydratedFinal.status === 'completed' && activeProgram) {
      const stampedDate = getDateKeyInTimezone(
        new Date(hydratedFinal.startAt),
        settings.timezone || 'America/Mexico_City',
      );
      try {
        stampAwarded = await repo.awardLoyaltyStamp({
          clientId: hydratedFinal.clientId,
          bookingId: hydratedFinal.id,
          programId: activeProgram.id,
          stampedDate,
        });
      } catch {
        stampAwarded = null;
      }
    }

    const allBookingSplits = await fetchSupabaseBookingPaymentSplits(booking.id);
    const summary = computeBookingPaymentSummary(
      hydratedFinal.totalPriceCents,
      allBookingSplits,
    );

    return {
      booking: hydratedFinal,
      splits: createdSplits,
      summary,
      stampAwarded,
    };
  }

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

    let clientPackageForRedemption: ClientPackage | null = null;
    if (params.redeemClientPackageId) {
      const candidatePkg = cols.clientPackages.find(
        (p) =>
          p.id === params.redeemClientPackageId && p.clientId === booking.clientId,
      );
      if (!candidatePkg) {
        throw new PolicyError(
          'PACKAGE_NOT_FOUND',
          'Paquete de sesiones no encontrado para esta clienta.',
        );
      }
      const alreadyRedeemedForBooking = (candidatePkg.redeemedBookingIds ?? []).includes(
        booking.id,
      );
      if (alreadyRedeemedForBooking) {
        throw new PolicyError(
          'PACKAGE_ALREADY_REDEEMED',
          'Esta cita ya descontó una sesión de este paquete.',
        );
      }
      if (!canRedeemPackageSession(candidatePkg)) {
        throw new PolicyError(
          'PACKAGE_NOT_REDEEMABLE',
          'Este paquete no tiene sesiones disponibles o ya expiró.',
        );
      }
      clientPackageForRedemption = candidatePkg;
    }

    const effectiveTotalCents = clientPackageForRedemption
      ? extraRetailTotalCents
      : booking.totalPriceCents + extraRetailTotalCents;
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

    if (clientPackageForRedemption) {
      booking.discountCents += booking.totalPriceCents;
      booking.totalPriceCents = extraRetailTotalCents;
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

      if (splitRecord.amountCents === 0 && splitRecord.tipCents === 0) {
        continue;
      }

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

    let redeemedPackage: ClientPackage | null = null;
    if (clientPackageForRedemption) {
      clientPackageForRedemption.usedSessions += 1;
      clientPackageForRedemption.redeemedBookingIds = [
        ...(clientPackageForRedemption.redeemedBookingIds ?? []),
        booking.id,
      ];
      if (clientPackageForRedemption.usedSessions >= clientPackageForRedemption.totalSessions) {
        clientPackageForRedemption.status = 'exhausted';
      }
      booking.packageRedemptionId = clientPackageForRedemption.id;
      redeemedPackage = { ...clientPackageForRedemption };
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
      redeemedPackage,
      outboxEvents,
    };
  });

  await dispatchPostCommitOutbox(committed.outboxEvents);
  return {
    booking: committed.hydrated,
    splits: committed.createdSplits,
    summary: committed.summary,
    stampAwarded: committed.stampAwarded,
    ...(committed.redeemedPackage ? { redeemedPackage: committed.redeemedPackage } : {}),
  };
}

export async function manageClientBookingAction(params: {
  token: string;
  action: 'cancel' | 'reschedule' | 'upload_proof' | 'confirm_attendance';
  reason?: string;
  newStartAt?: string;
  newStaffId?: string;
  paymentProofUrl?: string;
  confirmedVia?: 'email' | 'whatsapp';
}): Promise<BookingWithRelations> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().manageClientBookingAction(params);
  }
  if (params.action === 'confirm_attendance') {
    const committedConfirm = await withWriteLock((db) => {
      const booking = db.bookings.find((b) => b.manageToken === params.token);
      if (!booking) throw new PolicyError('BOOKING_NOT_FOUND', 'No encontramos esta cita.');
      if (isTerminalBookingStatus(booking.status)) {
        throw new PolicyError('INVALID_STATE', 'Esta cita ya no admite confirmación.');
      }
      const nowIso = new Date().toISOString();
      booking.attendanceStatus = 'confirmed';
      booking.attendanceConfirmedAt = nowIso;
      booking.confirmedVia = params.confirmedVia ?? booking.confirmedVia ?? 'email';
      booking.updatedAt = nowIso;
      const hydrated = hydrateBooking(db, booking);
      const outboxEvents: OutboxEventInput[] = [
        {
          type: 'Realtime',
          eventType: 'booking_updated',
          payload: { staffId: booking.staffId, startAt: booking.startAt },
        },
      ];
      return { hydrated, outboxEvents };
    });
    await dispatchPostCommitOutbox(committedConfirm.outboxEvents);
    return committedConfirm.hydrated;
  }

  if (params.action === 'upload_proof') {
    const rawProof = params.paymentProofUrl?.trim() ?? '';
    if (!rawProof) {
      throw new PolicyError(
        'MISSING_PROOF',
        'Sube una imagen o pega el enlace de tu comprobante antes de enviar.',
      );
    }
    const storedProofUrl = await persistBookingMediaField(rawProof, 'proofs');
    if (!storedProofUrl) {
      throw new PolicyError('MISSING_PROOF', 'No se pudo procesar el comprobante.');
    }
    const isExternalLink = storedProofUrl.startsWith('https://');
    const committedProof = await withWriteLock((db) => {
      const booking = db.bookings.find((b) => b.manageToken === params.token);
      if (!booking) throw new PolicyError('BOOKING_NOT_FOUND', 'No encontramos esta cita.');
      if (isTerminalBookingStatus(booking.status)) {
        throw new PolicyError('INVALID_STATE', 'Esta cita ya no admite cambios.');
      }
      booking.paymentProofUrl = storedProofUrl;
      booking.proofDeliveryMethod = isExternalLink ? 'web_link' : 'web_upload';
      booking.proofRejectedAt = null;
      booking.proofRejectionReason = null;
      booking.updatedAt = new Date().toISOString();
      if (!isExternalLink) {
        linkMediaAssetToBookingInLock(
          db,
          storedProofUrl,
          'proofs',
          booking.id,
          booking.clientId,
          booking.updatedAt,
        );
      }
      const hydrated = hydrateBooking(db, booking);
      const outboxEvents: OutboxEventInput[] = [
        {
          type: 'Realtime',
          eventType: 'booking_updated',
          payload: { staffId: booking.staffId, startAt: booking.startAt },
        },
      ];
      return { hydrated, outboxEvents };
    });
    await dispatchPostCommitOutbox(committedProof.outboxEvents);
    return committedProof.hydrated;
  }

  const manageAction = params.action;

  const committed = await withWriteLock((db) => {
    const booking = db.bookings.find((b) => b.manageToken === params.token);
    if (!booking) throw new PolicyError('BOOKING_NOT_FOUND', 'No encontramos esta cita.');
    if (isTerminalBookingStatus(booking.status)) {
      throw new PolicyError('INVALID_STATE', 'Esta cita ya no puede modificarse.');
    }

    const minHours =
      manageAction === 'cancel'
        ? db.settings.minCancelHours
        : db.settings.minRescheduleHours;
    const policyCheck = checkManagePolicyWindow({
      startAtIso: booking.startAt,
      nowMs: Date.now(),
      minHours,
      action: manageAction,
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
      const waitlistOffer = assignWaitlistPriorityOfferInLock(db, booking);
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
        waitlistOffer,
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

    const vacatedSlot = {
      id: booking.id,
      serviceId: booking.serviceId,
      staffId: booking.staffId,
      startAt: booking.startAt,
    };

    booking.staffId = slot.staffId;
    booking.startAt = slot.startAt;
    booking.endAt = slot.endAt;
    booking.occupiedStartAt = slot.occupiedStartAt;
    booking.occupiedEndAt = slot.occupiedEndAt;
    booking.attendanceStatus = 'rescheduled';
    booking.attendanceConfirmedAt = null;
    booking.updatedAt = now.toISOString();

    const waitlistOffer =
      vacatedSlot.startAt !== slot.startAt || vacatedSlot.staffId !== slot.staffId
        ? assignWaitlistPriorityOfferInLock(db, vacatedSlot, now.getTime())
        : null;

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
      waitlistOffer,
      salonAlert: {
        booking: hydrated,
        settings: settingsSnapshot,
        kind: 'rescheduled' as const,
      },
    };
  });

  await dispatchPostCommitOutbox(committed.outboxEvents);
  await dispatchSalonBookingAlert(committed.salonAlert);
  if (committed.waitlistOffer) {
    await dispatchWaitlistPriorityOffer(committed.waitlistOffer);
  }
  return committed.hydrated;
}

export async function rescheduleBookingAdmin(params: {
  bookingId: string;
  startAt: string;
  staffId?: string;
  durationMinutes?: number;
  reason?: string;
  actor: AuditActor;
}): Promise<BookingWithRelations> {
  const newStartMs = Date.parse(params.startAt);
  if (!Number.isFinite(newStartMs)) {
    throw new PolicyError('INVALID_START_AT', 'La fecha y hora seleccionadas no son válidas.');
  }

  if (isSupabaseEnabled()) {
    const repo = createSupabaseRepository();
    const supabase = createSupabaseAdminClient();
    const [booking, settings] = await Promise.all([
      fetchSupabaseBookingById(params.bookingId),
      repo.getSalonSettings(),
    ]);
    if (!booking) {
      throw new PolicyError('BOOKING_NOT_FOUND', 'Cita no encontrada.');
    }
    if (!isActiveBookingStatus(booking.status)) {
      throw new PolicyError('INVALID_STATE', 'Solo se pueden mover o ajustar citas activas.');
    }

    const isPast = new Date(booking.endAt).getTime() < Date.now();
    const pastLockActive = settings.lockPastBookings !== false;
    if (pastLockActive && isPast && params.actor.role !== 'owner') {
      throw new PolicyError(
        'PAST_BOOKING_LOCKED',
        'Las citas pasadas están bloqueadas; solo la Dueña puede modificarlas.',
      );
    }

    const targetStaffId = params.staffId?.trim() || booking.staffId;
    const targetStaff =
      targetStaffId === booking.staffId
        ? booking.staff.isActive
          ? booking.staff
          : null
        : await fetchSupabaseStaffMemberById(targetStaffId);
    if (!targetStaff || !targetStaff.isActive) {
      throw new PolicyError('STAFF_NOT_FOUND', 'La profesional seleccionada no está activa.');
    }

    const bufferBefore = booking.service.bufferBeforeMinutes ?? 0;
    const bufferAfter = booking.service.bufferAfterMinutes ?? 0;
    const nextDurationMinutes = params.durationMinutes ?? booking.totalDurationMinutes;
    const newEndMs = newStartMs + nextDurationMinutes * 60_000;
    const newOccStartMs = newStartMs - bufferBefore * 60_000;
    const newOccEndMs = newEndMs + bufferAfter * 60_000;
    const startIso = new Date(newStartMs).toISOString();
    const endIso = new Date(newEndMs).toISOString();
    const occStartIso = new Date(newOccStartMs).toISOString();
    const occEndIso = new Date(newOccEndMs).toISOString();

    const hasOverlap = await fetchSupabaseHasOverlappingBooking({
      staffId: targetStaff.id,
      excludeBookingId: booking.id,
      occStartIso,
      occEndIso,
    });
    if (hasOverlap) {
      throw new SlotConflictError(
        `Ese horario se empalma con otra cita de ${targetStaff.name}. Elige otro espacio libre.`,
        [],
      );
    }

    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from('bookings')
      .update({
        staff_id: targetStaff.id,
        start_at: startIso,
        end_at: endIso,
        occupied_start_at: occStartIso,
        occupied_end_at: occEndIso,
        occupied_range: `[${occStartIso},${occEndIso})`,
        total_duration_minutes: nextDurationMinutes,
        ...(params.durationMinutes !== undefined
          ? { custom_duration_minutes: nextDurationMinutes }
          : {}),
        updated_at: nowIso,
      })
      .eq('id', booking.id);

    if (error) {
      if (error.code === '23P01') {
        throw new SlotConflictError(
          `Ese horario se empalma con otra cita de ${targetStaff.name}. Elige otro espacio libre.`,
          [],
        );
      }
      throw new PolicyError('RESCHEDULE_FAILED', error.message);
    }

    await supabase
      .from('scheduled_notifications')
      .update({ status: 'canceled' })
      .eq('booking_id', booking.id)
      .eq('status', 'pending');

    if (pastLockActive && isPast && params.actor.role === 'owner') {
      await repo.writeAuditLog({
        actorId: params.actor.id,
        actorEmail: params.actor.email,
        actorRole: params.actor.role,
        action: 'past_booking_override',
        entityType: 'booking',
        entityId: booking.id,
        metadata: {
          bookingCode: booking.bookingCode,
          operation: 'reschedule_admin',
          newStartAt: startIso,
          newStaffId: targetStaff.id,
          durationMinutes: nextDurationMinutes,
        },
      });
    }

    const hydrated: BookingWithRelations = {
      ...booking,
      staffId: targetStaff.id,
      staff: targetStaff,
      startAt: startIso,
      endAt: endIso,
      occupiedStartAt: occStartIso,
      occupiedEndAt: occEndIso,
      totalDurationMinutes: nextDurationMinutes,
      ...(params.durationMinutes !== undefined
        ? { customDurationMinutes: nextDurationMinutes }
        : {}),
      updatedAt: nowIso,
    };

    await dispatchOutboxEvent({
      type: 'Realtime',
      eventType: 'slot_changed',
      payload: { staffId: hydrated.staffId, startAt: hydrated.startAt },
    });

    const postCommitTask = (async () => {
      const conn = await fetchSupabaseStaffCalendarConnection(hydrated.staffId);
      await dispatchOutboxEvent({
        type: 'SyncCalendar',
        booking: hydrated,
        connection: conn ? { ...conn } : undefined,
        settings,
        action: hydrated.googleEventId ? 'update' : 'create',
        onSynced: async (googleEventId) => {
          if (!googleEventId) return;
          hydrated.googleEventId = googleEventId;
          await supabase
            .from('bookings')
            .update({ google_event_id: googleEventId })
            .eq('id', hydrated.id);
        },
      });
    })();
    await runPostCommitSideEffects(postCommitTask);

    return hydrated;
  }

  const committed = await withWriteLock((db) => {
    const booking = db.bookings.find((b) => b.id === params.bookingId);
    if (!booking) {
      throw new PolicyError('BOOKING_NOT_FOUND', 'Cita no encontrada.');
    }
    if (!isActiveBookingStatus(booking.status)) {
      throw new PolicyError('INVALID_STATE', 'Solo se pueden mover o ajustar citas activas.');
    }

    const isPast = new Date(booking.endAt).getTime() < Date.now();
    const pastLockActive = db.settings.lockPastBookings !== false;
    if (pastLockActive && isPast && params.actor.role !== 'owner') {
      throw new PolicyError(
        'PAST_BOOKING_LOCKED',
        'Las citas pasadas están bloqueadas; solo la Dueña puede modificarlas.',
      );
    }

    const targetStaffId = params.staffId?.trim() || booking.staffId;
    const targetStaff = db.staff.find((s) => s.id === targetStaffId && s.isActive);
    if (!targetStaff) {
      throw new PolicyError('STAFF_NOT_FOUND', 'La profesional seleccionada no está activa.');
    }

    const service = db.services.find((s) => s.id === booking.serviceId);
    const bufferBefore = service?.bufferBeforeMinutes ?? 0;
    const bufferAfter = service?.bufferAfterMinutes ?? 0;
    const nextDurationMinutes = params.durationMinutes ?? booking.totalDurationMinutes;
    const newEndMs = newStartMs + nextDurationMinutes * 60_000;
    const newOccStartMs = newStartMs - bufferBefore * 60_000;
    const newOccEndMs = newEndMs + bufferAfter * 60_000;

    const overlapping = db.bookings.find(
      (other) =>
        other.id !== booking.id &&
        other.staffId === targetStaff.id &&
        isActiveBookingStatus(other.status) &&
        new Date(other.occupiedStartAt).getTime() < newOccEndMs &&
        new Date(other.occupiedEndAt).getTime() > newOccStartMs,
    );
    if (overlapping) {
      throw new SlotConflictError(
        `Ese horario se empalma con otra cita de ${targetStaff.name}. Elige otro espacio libre.`,
        [],
      );
    }

    const prevStaffId = booking.staffId;
    const nowIso = new Date().toISOString();
    booking.staffId = targetStaff.id;
    booking.startAt = new Date(newStartMs).toISOString();
    booking.endAt = new Date(newEndMs).toISOString();
    booking.occupiedStartAt = new Date(newOccStartMs).toISOString();
    booking.occupiedEndAt = new Date(newOccEndMs).toISOString();
    booking.totalDurationMinutes = nextDurationMinutes;
    if (params.durationMinutes !== undefined) {
      booking.customDurationMinutes = nextDurationMinutes;
    }
    booking.updatedAt = nowIso;

    for (const n of db.notifications) {
      if (n.bookingId === booking.id && n.status === 'pending') {
        n.status = 'canceled';
      }
    }

    if (pastLockActive && isPast && params.actor.role === 'owner') {
      appendAuditLog(db, {
        actor: params.actor,
        action: 'past_booking_override',
        entityType: 'booking',
        entityId: booking.id,
        metadata: {
          bookingCode: booking.bookingCode,
          operation: 'reschedule_admin',
          prevStaffId,
          newStaffId: targetStaff.id,
          newStartAt: booking.startAt,
          durationMinutes: nextDurationMinutes,
        },
      });
    }

    const hydrated = hydrateBooking(db, booking);
    const bookingId = booking.id;
    const conn = db.calendarConnections.find(
      (c) => c.staffId === booking.staffId && c.isConnected,
    );
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
  let hydrated: BookingWithRelations;
  let settings: SalonSettings;
  let extraNames: string[] = [];

  if (isSupabaseEnabled()) {
    const [found, fetchedSettings] = await Promise.all([
      fetchSupabaseBookingById(params.bookingId),
      createSupabaseRepository().getSalonSettings(),
    ]);
    if (!found) {
      throw new PolicyError('BOOKING_NOT_FOUND', 'Cita no encontrada.');
    }
    if (isTerminalBookingStatus(found.status)) {
      throw new PolicyError(
        'INVALID_STATE',
        'Solo puedes enviar recordatorios para citas activas.',
      );
    }
    hydrated = found;
    settings = { ...fetchedSettings };
    if ((hydrated.extraServiceIds ?? []).length > 0) {
      const extras = await fetchSupabaseServicesByIds(hydrated.extraServiceIds ?? []);
      extraNames = (hydrated.extraServiceIds ?? [])
        .map((id) => extras.find((s) => s.id === id)?.name)
        .filter((name): name is string => Boolean(name));
    }
  } else {
    const db = await getRepository().getSnapshot();
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
    hydrated = hydrateBooking(db, booking);
    settings = { ...db.settings };
    extraNames = (hydrated.extraServiceIds ?? [])
      .map((id) => db.services.find((s) => s.id === id)?.name)
      .filter((name): name is string => Boolean(name));
  }

  const channel = params.channel ?? 'whatsapp';
  const env = getRuntimeIntegrationStatus();
  const tz = settings.timezone || 'America/Mexico_City';
  const dateLabel = formatDateLongInTimezone(hydrated.startAt, tz);
  const timeLabel = formatTimeInTimezone(hydrated.startAt, tz, false);
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
      triggerKey: 'reminder_24h',
      templateParameters: [
        hydrated.client.fullName,
        serviceSummary,
        timeLabel,
        hydrated.staff.name,
        manageUrl,
      ],
      interactiveButtons: [
        { id: `confirm_booking:${hydrated.id}`, title: 'Confirmo' },
        { id: `reschedule_booking:${hydrated.id}`, title: 'Necesito reagendar' },
      ],
      withinServiceWindow: false,
      settingsTimezone: tz,
      fallbackEmail: hydrated.client.email
        ? {
            to: hydrated.client.email,
            subject: `Recordatorio de tu cita en ${settings.name} (${hydrated.bookingCode})`,
            booking: hydrated,
            settings,
            appUrl: env.appUrl,
            situation: 'reminder_24h',
          }
        : undefined,
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
        situation: 'reminder_24h',
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

  if (isSupabaseEnabled()) {
    if (createdLogs.length > 0) {
      const supabase = createSupabaseAdminClient();
      await supabase.from('scheduled_notifications').insert(
        createdLogs.map((item) => ({
          booking_id: item.bookingId,
          workflow_id: item.workflowId,
          channel: item.channel,
          recipient: item.recipient,
          scheduled_for: item.scheduledFor,
          status: item.status,
          subject: item.subject,
          preview_text: item.previewText,
          provider_message_id: item.providerMessageId,
          error_message: item.errorMessage,
          sent_at: item.sentAt,
        })),
      );
    }
  } else {
    await withWriteLock((liveDb) => {
      liveDb.notifications.unshift(...createdLogs);
    });
  }

  return {
    ok: true,
    bookingId: hydrated.id,
    channel,
    waMeUrl,
    messagePreview,
    logs: createdLogs,
  };
}

export async function requestBookingReschedule(params: {
  bookingId: string;
  note?: string;
  actor: AuditActor;
}): Promise<{
  ok: true;
  bookingId: string;
  rescheduleUrl: string;
  waMeUrl: string;
  messagePreview: string;
}> {
  let hydrated: BookingWithRelations;
  let settings: SalonSettings;

  if (isSupabaseEnabled()) {
    const [found, fetchedSettings] = await Promise.all([
      fetchSupabaseBookingById(params.bookingId),
      createSupabaseRepository().getSalonSettings(),
    ]);
    if (!found) {
      throw new PolicyError('BOOKING_NOT_FOUND', 'Cita no encontrada.');
    }
    hydrated = found;
    settings = { ...fetchedSettings };
  } else {
    const db = await getRepository().getSnapshot();
    const booking = db.bookings.find((b) => b.id === params.bookingId);
    if (!booking) {
      throw new PolicyError('BOOKING_NOT_FOUND', 'Cita no encontrada.');
    }
    hydrated = hydrateBooking(db, booking);
    settings = { ...db.settings };
  }

  const isPast = new Date(hydrated.endAt).getTime() < Date.now();
  if (settings.lockPastBookings !== false && isPast && params.actor.role !== 'owner') {
    throw new PolicyError(
      'PAST_BOOKING_LOCKED',
      'Las citas pasadas están bloqueadas; solo la Dueña puede modificarlas.',
    );
  }
  if (isTerminalBookingStatus(hydrated.status)) {
    throw new PolicyError(
      'INVALID_STATE',
      'Solo puedes solicitar reprogramación en citas activas.',
    );
  }

  const env = getRuntimeIntegrationStatus();
  const tz = settings.timezone || 'America/Mexico_City';
  const dateLabel = formatDateLongInTimezone(hydrated.startAt, tz);
  const timeLabel = formatTimeInTimezone(hydrated.startAt, tz, false);
  const rescheduleUrl = `${env.appUrl}/cita/${hydrated.manageToken}?action=reschedule`;
  const cleanNote = params.note?.trim();
  const noteSuffix = cleanNote ? ` ${cleanNote}` : '';
  const messagePreview = `Hola ${hydrated.client.fullName}, te escribimos de ${settings.name} sobre tu cita (${hydrated.bookingCode}) de ${hydrated.service.name} el ${dateLabel} a las ${timeLabel}.${noteSuffix} Puedes elegir un nuevo horario directamente aquí: ${rescheduleUrl}`;
  const waMeUrl = buildWhatsAppLink(hydrated.client.phoneE164, messagePreview);

  const nowIso = new Date().toISOString();
  const waRes = await dispatchWhatsAppNotification({
    toPhoneE164: hydrated.client.phoneE164,
    bodyText: messagePreview,
    triggerKey: 'booking_rescheduled',
    templateParameters: [
      hydrated.client.fullName,
      hydrated.service.name,
      dateLabel,
      timeLabel,
      rescheduleUrl,
    ],
    withinServiceWindow: false,
    settingsTimezone: tz,
    fallbackEmail: hydrated.client.email
      ? {
          to: hydrated.client.email,
          subject: `Reagenda tu cita en ${settings.name} (${hydrated.bookingCode})`,
          booking: hydrated,
          settings,
          appUrl: env.appUrl,
          situation: 'rescheduled',
        }
      : undefined,
  });
  const log: ScheduledNotification = {
    id: generateId('ntf'),
    bookingId: hydrated.id,
    workflowId: null,
    channel: 'whatsapp',
    recipient: hydrated.client.phoneE164,
    scheduledFor: nowIso,
    status: waRes.status,
    subject: `Solicitud de reprogramación (${hydrated.bookingCode})`,
    previewText: messagePreview.slice(0, 160),
    providerMessageId: waRes.providerMessageId,
    errorMessage: waRes.errorMessage,
    sentAt: waRes.status === 'sent' ? nowIso : null,
    createdAt: nowIso,
  };

  if (isSupabaseEnabled()) {
    const supabase = createSupabaseAdminClient();
    await supabase.from('scheduled_notifications').insert({
      booking_id: log.bookingId,
      workflow_id: log.workflowId,
      channel: log.channel,
      recipient: log.recipient,
      scheduled_for: log.scheduledFor,
      status: log.status,
      subject: log.subject,
      preview_text: log.previewText,
      provider_message_id: log.providerMessageId,
      error_message: log.errorMessage,
      sent_at: log.sentAt,
    });
  } else {
    await withWriteLock((liveDb) => {
      liveDb.notifications.unshift(log);
    });
  }

  return {
    ok: true,
    bookingId: hydrated.id,
    rescheduleUrl,
    waMeUrl,
    messagePreview,
  };
}

export async function updateSalonSettings(
  patch: Partial<Omit<SalonSettings, 'landingContent'>> & {
    landingContent?: Partial<SalonSettings['landingContent']>;
  },
): Promise<SalonSettings> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().updateSalonSettings(patch);
  }
  return withWriteLock((db) => {
    const existingHash = db.settings.ownerPinHash ?? null;
    const nextHash =
      patch.ownerPinHash !== undefined ? patch.ownerPinHash : existingHash;
    const merged: SalonSettings = {
      ...db.settings,
      ...patch,
      landingContent: patch.landingContent
        ? {
            ...db.settings.landingContent,
            ...patch.landingContent,
            ...(patch.landingContent.sections !== undefined
              ? {
                  sections: {
                    ...db.settings.landingContent.sections,
                    ...patch.landingContent.sections,
                  },
                }
              : {}),
          }
        : db.settings.landingContent,
      updatedAt: new Date().toISOString(),
    };
    db.settings = applySafeSettingsShape(merged, nextHash);
    publishRealtimeEvent('settings_updated');
    return db.settings;
  });
}

export function verifyStoredOwnerPin(pin: string | null | undefined): {
  required: boolean;
  valid: boolean;
} {
  const db = readDbFromDisk();
  const storedHash = db.settings.ownerPinHash ?? null;
  const required = Boolean(db.settings.ownerPinEnabled && storedHash);
  if (!required) {
    return { required: false, valid: true };
  }
  if (!pin || !pin.trim()) {
    return { required: true, valid: false };
  }
  return {
    required: true,
    valid: verifyOwnerPin(pin, storedHash),
  };
}

export async function verifyStoredOwnerPinAsync(pin: string | null | undefined): Promise<{
  required: boolean;
  valid: boolean;
}> {
  if (!isSupabaseEnabled()) {
    return verifyStoredOwnerPin(pin);
  }
  const settings = await createSupabaseRepository().getSalonSettings();
  const storedHash = settings.ownerPinHash ?? null;
  const required = Boolean(settings.ownerPinEnabled && storedHash);
  if (!required) {
    return { required: false, valid: true };
  }
  if (!pin || !pin.trim()) {
    return { required: true, valid: false };
  }
  return {
    required: true,
    valid: verifyOwnerPin(pin, storedHash),
  };
}

export function getClientNoShowPolicyStatus(phone: string): NoShowPolicyEvaluation {
  const db = getSnapshot();
  const normalized = normalizePhoneE164(phone);
  const client = normalized
    ? db.clients.find((c) => c.phoneE164 === normalized)
    : undefined;
  return evaluateClientNoShowPolicy({
    noShowCount: client?.noShowCount ?? 0,
    threshold: db.settings.noShowDepositThreshold,
    baseDepositAmountCents: db.settings.depositAmountCents ?? 20_000,
  });
}

export async function createRecurringBookingSeries(
  params: ExtendedCreateBookingAtomicInput & {
    recurrence: { intervalWeeks: RecurrenceIntervalWeeks; count: number };
  },
): Promise<{
  seriesId: string;
  created: BookingWithRelations[];
  skippedConflicts: Array<{
    index: number;
    startAt: string;
    dateKey: string;
    reason: string;
    code: string;
  }>;
}> {
  const settings = await getRepository().getSalonSettings();
  const tz = settings.timezone || 'America/Mexico_City';
  let occurrences: ReturnType<typeof generateRecurrenceDates>;
  try {
    occurrences = generateRecurrenceDates({
      startAt: params.startAt,
      intervalWeeks: params.recurrence.intervalWeeks,
      count: params.recurrence.count,
      timezone: tz,
    });
  } catch (err) {
    throw new PolicyError(
      'INVALID_RECURRENCE',
      err instanceof Error ? err.message : 'Configuración de recurrencia inválida.',
    );
  }

  const seriesId = generateId('ser');
  const created: BookingWithRelations[] = [];
  const skippedConflicts: Array<{
    index: number;
    startAt: string;
    dateKey: string;
    reason: string;
    code: string;
  }> = [];

  for (const occ of occurrences) {
    try {
      const booking = await createBookingAtomic({
        ...params,
        startAt: occ.startAt,
        idempotencyKey: params.idempotencyKey
          ? `${params.idempotencyKey}:occ-${occ.index}`
          : null,
        recurrenceSeriesId: seriesId,
        recurrenceIndex: occ.index + 1,
        recurrenceTotal: occurrences.length,
      });
      created.push(booking);
    } catch (err) {
      if (occ.index === 0) {
        throw err;
      }
      if (err instanceof SlotConflictError || err instanceof PolicyError) {
        skippedConflicts.push({
          index: occ.index + 1,
          startAt: occ.startAt,
          dateKey: occ.dateKey,
          reason: err.message,
          code: err.code,
        });
        continue;
      }
      throw err;
    }
  }

  return {
    seriesId,
    created,
    skippedConflicts,
  };
}

function computeClientPortalSnapshotByPhone(
  db: Readonly<DemoDatabase>,
  phoneE164: string,
): ClientPortalSnapshotDTO {
  const normalized = normalizePhoneE164(phoneE164);
  const client = normalized
    ? db.clients.find((c) => phonesMatchE164(c.phoneE164, normalized))
    : undefined;

  if (!client) {
    return ClientPortalSnapshotDTOSchema.parse({
      phoneE164: normalized,
      clientId: null,
      clientName: null,
      bookings: [],
      loyaltySummary: null,
      packages: [],
    });
  }

  const tz = db.settings.timezone || 'America/Mexico_City';
  const serviceById = new Map(db.services.map((s) => [s.id, s]));
  const staffById = new Map(db.staff.map((st) => [st.id, st]));

  const portalBookings: ClientPortalBookingDTO[] = db.bookings
    .filter((b) => b.clientId === client.id)
    .toSorted((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())
    .map((b) => {
      const svc = serviceById.get(b.serviceId);
      const st = staffById.get(b.staffId);
      const serviceSlug = svc?.slug ?? '';
      const staffBookingSlug = st?.bookingSlug ?? '';
      const suggestedDateKey = computeSuggestedTouchUpDateKey({
        startAt: b.startAt,
        daysAhead: 21,
        timezone: tz,
      });
      return {
        id: b.id,
        bookingCode: b.bookingCode,
        manageToken: b.manageToken,
        manageUrl: `/cita/${b.manageToken}`,
        status: b.status,
        startAt: b.startAt,
        endAt: b.endAt,
        totalDurationMinutes: b.totalDurationMinutes,
        totalPriceCents: b.totalPriceCents,
        depositAmountCents: b.depositAmountCents,
        serviceId: b.serviceId,
        serviceName: svc?.name ?? 'Servicio',
        serviceSlug,
        staffId: b.staffId,
        staffName: st?.name ?? 'Profesional',
        staffBookingSlug,
        addons: b.addons.map((a) => ({
          name: a.name,
          extraPriceCents: a.extraPriceCents,
        })),
        touchUpUrl: buildTouchUpBookingUrl({
          serviceSlug,
          staffSlug: staffBookingSlug,
          suggestedDateKey,
        }),
      };
    });

  const nowMs = Date.now();
  const packages = (db.clientPackages ?? [])
    .filter((p) => p.clientId === client.id)
    .toSorted(
      (a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime(),
    )
    .map((p) => {
      const balance = computeClientPackageBalance(p, nowMs);
      return toPublicClientPackageDTO(p, {
        serviceName: serviceById.get(p.serviceId)?.name ?? 'Servicio',
        remainingSessions: balance.remainingSessions,
        effectiveStatus: balance.effectiveStatus,
      });
    });

  return ClientPortalSnapshotDTOSchema.parse({
    phoneE164: client.phoneE164,
    clientId: client.id,
    clientName: client.fullName,
    bookings: portalBookings,
    loyaltySummary: computeClientLoyaltySummaryFromDb(db, client.id),
    packages,
  });
}

export function getClientPortalSnapshotByPhone(
  phoneE164: string,
): ClientPortalSnapshotDTO {
  return computeClientPortalSnapshotByPhone(getSnapshot(), phoneE164);
}

export async function getClientPortalSnapshotByPhoneAsync(
  phoneE164: string,
): Promise<ClientPortalSnapshotDTO> {
  return getRepository().getClientPortalSnapshotByPhone(phoneE164);
}

export function listServicePackages(): ServicePackage[] {
  const db = getSnapshot();
  return [...(db.servicePackages ?? [])];
}

export async function listServicePackagesAsync(): Promise<ServicePackage[]> {
  const db = await getRepository().getSnapshot();
  return [...(db.servicePackages ?? [])];
}

export async function upsertServicePackage(input: {
  id?: string;
  name: string;
  description?: string;
  serviceId: string;
  totalSessions: number;
  priceCents: number;
  validDays: number | null;
  isActive?: boolean;
}): Promise<ServicePackage> {
  return withWriteLock((db) => {
    const cols = ensurePhase3Collections(db);
    const service = db.services.find((s) => s.id === input.serviceId);
    if (!service) {
      throw new PolicyError('SERVICE_NOT_FOUND', 'Servicio no encontrado para este paquete.');
    }
    if (input.id) {
      const existing = cols.servicePackages.find((p) => p.id === input.id);
      if (!existing) {
        throw new PolicyError('PACKAGE_NOT_FOUND', 'Paquete no encontrado.');
      }
      existing.name = input.name.trim();
      existing.description = input.description?.trim() ?? existing.description;
      existing.serviceId = input.serviceId;
      existing.totalSessions = input.totalSessions;
      existing.priceCents = input.priceCents;
      existing.validDays = input.validDays;
      if (input.isActive !== undefined) existing.isActive = input.isActive;
      publishRealtimeEvent('settings_updated');
      return { ...existing };
    }
    const created: ServicePackage = {
      id: generateId('pkg'),
      name: input.name.trim(),
      description: input.description?.trim() ?? '',
      serviceId: input.serviceId,
      totalSessions: input.totalSessions,
      priceCents: input.priceCents,
      validDays: input.validDays,
      isActive: input.isActive ?? true,
      createdAt: new Date().toISOString(),
    };
    cols.servicePackages.unshift(created);
    publishRealtimeEvent('settings_updated');
    return { ...created };
  });
}

export async function toggleServicePackage(
  packageId: string,
  isActive: boolean,
): Promise<ServicePackage> {
  return withWriteLock((db) => {
    const cols = ensurePhase3Collections(db);
    const target = cols.servicePackages.find((p) => p.id === packageId);
    if (!target) {
      throw new PolicyError('PACKAGE_NOT_FOUND', 'Paquete no encontrado.');
    }
    target.isActive = isActive;
    publishRealtimeEvent('settings_updated');
    return { ...target };
  });
}

function listClientPackagesFromDb(
  db: Readonly<DemoDatabase>,
  clientId?: string,
): Array<
  ClientPackage & {
    clientName: string;
    serviceName: string;
    remainingSessions: number;
    isExpired: boolean;
  }
> {
  const nowMs = Date.now();
  const clientById = new Map(db.clients.map((c) => [c.id, c]));
  const serviceById = new Map(db.services.map((s) => [s.id, s]));

  return (db.clientPackages ?? [])
    .filter((p) => (clientId ? p.clientId === clientId : true))
    .toSorted(
      (a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime(),
    )
    .map((p) => {
      const balance = computeClientPackageBalance(p, nowMs);
      return {
        ...p,
        status: balance.effectiveStatus,
        clientName: clientById.get(p.clientId)?.fullName ?? 'Clienta',
        serviceName: serviceById.get(p.serviceId)?.name ?? 'Servicio',
        remainingSessions: balance.remainingSessions,
        isExpired: balance.isExpired,
      };
    });
}

export function listClientPackages(clientId?: string): Array<
  ClientPackage & {
    clientName: string;
    serviceName: string;
    remainingSessions: number;
    isExpired: boolean;
  }
> {
  return listClientPackagesFromDb(getSnapshot(), clientId);
}

export async function listClientPackagesAsync(clientId?: string): Promise<
  Array<
    ClientPackage & {
      clientName: string;
      serviceName: string;
      remainingSessions: number;
      isExpired: boolean;
    }
  >
> {
  const db = await getRepository().getSnapshot();
  return listClientPackagesFromDb(db, clientId);
}

export async function assignClientPackage(params: {
  clientId: string;
  packageId: string;
  notes?: string;
}): Promise<ClientPackage> {
  return withWriteLock((db) => {
    const cols = ensurePhase3Collections(db);
    const client = db.clients.find((c) => c.id === params.clientId);
    if (!client) {
      throw new PolicyError('CLIENT_NOT_FOUND', 'Clienta no encontrada.');
    }
    const pkgDef = cols.servicePackages.find(
      (p) => p.id === params.packageId && p.isActive,
    );
    if (!pkgDef) {
      throw new PolicyError(
        'PACKAGE_NOT_FOUND',
        'Paquete no encontrado o inactivo.',
      );
    }
    const now = new Date();
    const expiresAt =
      pkgDef.validDays !== null
        ? new Date(now.getTime() + pkgDef.validDays * 86_400_000).toISOString()
        : null;
    const assigned: ClientPackage = {
      id: generateId('cpkg'),
      clientId: client.id,
      packageId: pkgDef.id,
      packageName: pkgDef.name,
      serviceId: pkgDef.serviceId,
      totalSessions: pkgDef.totalSessions,
      usedSessions: 0,
      purchasedAt: now.toISOString(),
      expiresAt,
      status: 'active',
      notes: params.notes?.trim() ?? '',
      redeemedBookingIds: [],
    };
    cols.clientPackages.unshift(assigned);
    publishRealtimeEvent('settings_updated');
    return { ...assigned };
  });
}

export async function redeemClientPackageSession(params: {
  clientPackageId: string;
  bookingId?: string | null;
}): Promise<ClientPackage> {
  return withWriteLock((db) => {
    const cols = ensurePhase3Collections(db);
    const pkg = cols.clientPackages.find((p) => p.id === params.clientPackageId);
    if (!pkg) {
      throw new PolicyError('PACKAGE_NOT_FOUND', 'Paquete de clienta no encontrado.');
    }
    const bookingId = params.bookingId?.trim() || null;
    if (bookingId && (pkg.redeemedBookingIds ?? []).includes(bookingId)) {
      throw new PolicyError(
        'PACKAGE_ALREADY_REDEEMED',
        'Esta cita ya descontó una sesión de este paquete.',
      );
    }
    if (!canRedeemPackageSession(pkg)) {
      throw new PolicyError(
        'PACKAGE_NOT_REDEEMABLE',
        'Este paquete ya no tiene sesiones disponibles o expiró.',
      );
    }
    pkg.usedSessions += 1;
    if (bookingId) {
      pkg.redeemedBookingIds = [...(pkg.redeemedBookingIds ?? []), bookingId];
      const booking = db.bookings.find((b) => b.id === bookingId);
      if (booking) {
        booking.packageRedemptionId = pkg.id;
      }
    }
    if (pkg.usedSessions >= pkg.totalSessions) {
      pkg.status = 'exhausted';
    }
    publishRealtimeEvent('settings_updated');
    return { ...pkg };
  });
}

export async function cancelClientPackage(
  clientPackageId: string,
): Promise<ClientPackage> {
  return withWriteLock((db) => {
    const cols = ensurePhase3Collections(db);
    const pkg = cols.clientPackages.find((p) => p.id === clientPackageId);
    if (!pkg) {
      throw new PolicyError('PACKAGE_NOT_FOUND', 'Paquete de clienta no encontrado.');
    }
    pkg.status = 'canceled';
    publishRealtimeEvent('settings_updated');
    return { ...pkg };
  });
}

export async function logCampaignDispatch(
  params: Omit<CampaignDispatchLog, 'id' | 'dispatchedAt'>,
): Promise<CampaignDispatchLog> {
  return withWriteLock((db) => {
    const cols = ensurePhase3Collections(db);
    const entry: CampaignDispatchLog = {
      ...params,
      id: generateId('cmp'),
      dispatchedAt: new Date().toISOString(),
    };
    cols.campaignDispatches.unshift(entry);
    if (cols.campaignDispatches.length > 200) {
      cols.campaignDispatches.length = 200;
    }
    return { ...entry };
  });
}

export async function listCampaignDispatches(limit = 50): Promise<CampaignDispatchLog[]> {
  const db = await getRepository().getSnapshot();
  return (db.campaignDispatches ?? []).slice(0, Math.max(1, Math.min(limit, 200)));
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
  if (isSupabaseEnabled()) {
    const repo = createSupabaseRepository();
    const settings = await repo.updateSalonSettings({
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
    });
    let starterService: Service | null = null;
    if (params.starterService) {
      const depositCents = settings.depositAmountCents ?? 20000;
      starterService = await repo.upsertService({
        ...(params.starterService.id ? { id: params.starterService.id } : {}),
        name: params.starterService.name,
        priceCents: params.starterService.priceCents,
        durationMinutes: params.starterService.durationMinutes,
        isStartingPrice: params.starterService.isStartingPrice ?? false,
        requiresConfirmation: depositCents > 0,
        depositRequired: depositCents > 0,
        depositAmountCents: depositCents,
        allowInspoPhoto: true,
        isActive: true,
        isFeatured: true,
      });
    }
    return { settings, starterService };
  }
  return withWriteLock((db) => {
    const nowIso = new Date().toISOString();
    const existingHash = db.settings.ownerPinHash ?? null;
    db.settings = applySafeSettingsShape(
      {
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
      },
      existingHash,
    );

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

export async function upsertServiceCategory(input: {
  id?: string;
  name: string;
  displayOrder?: number;
}): Promise<ServiceCategory> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().upsertServiceCategory(input);
  }
  return withWriteLock((db) => {
    const name = input.name.trim();
    const existing = input.id ? db.categories.find((c) => c.id === input.id) : null;
    if (existing) {
      existing.name = name;
      if (input.displayOrder !== undefined) existing.displayOrder = input.displayOrder;
      publishRealtimeEvent('availability_updated');
      return existing;
    }
    if (input.id) {
      throw new PolicyError('CATEGORY_UPDATE_FAILED', 'No se encontró la categoría.');
    }
    const baseSlug = slugify(name) || 'categoria';
    const created: ServiceCategory = {
      id: generateId('cat'),
      name,
      slug: `${baseSlug}-${generateId().slice(0, 6)}`,
      displayOrder: input.displayOrder ?? db.categories.length,
    };
    db.categories.push(created);
    publishRealtimeEvent('availability_updated');
    return created;
  });
}

export async function upsertService(
  input: Partial<Service> & { name: string; durationMinutes: number; priceCents: number },
): Promise<Service> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().upsertService(input);
  }
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
      isPrivate: input.isPrivate ?? false,
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
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().upsertAddon(input);
  }
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
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().saveStaffSchedule(staffId, rules);
  }
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

function validateOverrideStaffAndRedirect(
  db: DemoDatabase,
  staffId: string,
  redirectStaffId?: string | null,
): string | null {
  if (!db.staff.some((s) => s.id === staffId)) {
    throw new PolicyError('STAFF_NOT_FOUND', 'Profesional no encontrada.');
  }
  const cleanRedirect = redirectStaffId?.trim() || null;
  if (!cleanRedirect) return null;
  if (cleanRedirect === staffId) {
    throw new PolicyError(
      'INVALID_REDIRECT_STAFF',
      'La profesional de redirección debe ser distinta a la profesional bloqueada.',
    );
  }
  if (!db.staff.some((s) => s.id === cleanRedirect && s.isActive)) {
    throw new PolicyError(
      'REDIRECT_STAFF_NOT_FOUND',
      'La profesional de redirección no existe o está inactiva.',
    );
  }
  return cleanRedirect;
}

export async function addDateOverride(
  override: Omit<DateOverride, 'id'>,
): Promise<DateOverride> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().addDateOverride(override);
  }
  return withWriteLock((db) => {
    const validatedRedirect = validateOverrideStaffAndRedirect(
      db,
      override.staffId,
      override.redirectStaffId,
    );
    const cleanPublicNote = override.publicNote?.trim();
    db.dateOverrides = db.dateOverrides.filter(
      (o) => !(o.staffId === override.staffId && o.overrideDate === override.overrideDate),
    );
    const created: DateOverride = {
      staffId: override.staffId,
      overrideDate: override.overrideDate,
      isUnavailable: override.isUnavailable,
      startTime: override.startTime,
      endTime: override.endTime,
      reason: override.reason,
      ...(cleanPublicNote ? { publicNote: cleanPublicNote } : {}),
      redirectStaffId: validatedRedirect,
      id: `ovr-${crypto.randomUUID().slice(0, 8)}`,
    };
    db.dateOverrides.push(created);
    publishRealtimeEvent('availability_updated', { staffId: override.staffId });
    return created;
  });
}

export async function addDateOverrideRange(params: {
  staffId: string;
  startDate: string;
  endDate: string;
  isUnavailable: boolean;
  startTime: string | null;
  endTime: string | null;
  reason: string;
  publicNote?: string;
  redirectStaffId?: string | null;
}): Promise<DateOverride[]> {
  let dates: string[];
  try {
    dates = expandPlainDateRange(params.startDate, params.endDate, 31);
  } catch (err) {
    throw new PolicyError(
      'INVALID_DATE_RANGE',
      err instanceof Error ? err.message : 'Rango de fechas inválido.',
    );
  }

  if (isSupabaseEnabled()) {
    const repo = createSupabaseRepository();
    const cleanPublicNote = params.publicNote?.trim();
    const created: DateOverride[] = [];
    for (const overrideDate of dates) {
      const record = await repo.addDateOverride({
        staffId: params.staffId,
        overrideDate,
        isUnavailable: params.isUnavailable,
        startTime: params.isUnavailable ? null : params.startTime,
        endTime: params.isUnavailable ? null : params.endTime,
        reason: params.reason,
        ...(cleanPublicNote ? { publicNote: cleanPublicNote } : {}),
        redirectStaffId: params.redirectStaffId ?? null,
      });
      created.push(record);
    }
    return created;
  }

  return withWriteLock((db) => {
    const validatedRedirect = validateOverrideStaffAndRedirect(
      db,
      params.staffId,
      params.redirectStaffId,
    );
    const cleanPublicNote = params.publicNote?.trim();
    const dateSet = new Set(dates);
    db.dateOverrides = db.dateOverrides.filter(
      (o) => !(o.staffId === params.staffId && dateSet.has(o.overrideDate)),
    );

    const created: DateOverride[] = dates.map((overrideDate) => ({
      id: `ovr-${crypto.randomUUID().slice(0, 8)}`,
      staffId: params.staffId,
      overrideDate,
      isUnavailable: params.isUnavailable,
      startTime: params.isUnavailable ? null : params.startTime,
      endTime: params.isUnavailable ? null : params.endTime,
      reason: params.reason,
      ...(cleanPublicNote ? { publicNote: cleanPublicNote } : {}),
      redirectStaffId: validatedRedirect,
    }));

    db.dateOverrides.push(...created);
    publishRealtimeEvent('availability_updated', { staffId: params.staffId });
    return created;
  });
}

export async function preloadMexicoHolidays(params: {
  year: number;
  staffId: string;
  publicNote?: string;
  redirectStaffId?: string | null;
}): Promise<{ created: DateOverride[]; skippedDates: string[]; year: number }> {
  let holidays: ReturnType<typeof getMexicoOfficialHolidays>;
  try {
    holidays = getMexicoOfficialHolidays(params.year);
  } catch (err) {
    throw new PolicyError(
      'INVALID_YEAR',
      err instanceof Error ? err.message : 'Año inválido.',
    );
  }

  if (isSupabaseEnabled()) {
    const repo = createSupabaseRepository();
    const snapshot = await repo.getSnapshot();
    const tz = snapshot.settings.timezone || 'America/Mexico_City';
    const todayKey = getDateKeyInTimezone(new Date(), tz);
    const created: DateOverride[] = [];
    const skippedDates: string[] = [];

    for (const holiday of holidays) {
      if (holiday.date < todayKey) continue;
      const alreadyExists = snapshot.dateOverrides.some(
        (o) => o.staffId === params.staffId && o.overrideDate === holiday.date,
      );
      if (alreadyExists) {
        skippedDates.push(holiday.date);
        continue;
      }
      const cleanNote = params.publicNote?.trim() || `Cerrado por ${holiday.name}`;
      const record = await repo.addDateOverride({
        staffId: params.staffId,
        overrideDate: holiday.date,
        isUnavailable: true,
        startTime: null,
        endTime: null,
        reason: `Festivo MX: ${holiday.name}`,
        publicNote: cleanNote,
        redirectStaffId: params.redirectStaffId ?? null,
      });
      created.push(record);
    }

    return {
      created,
      skippedDates,
      year: params.year,
    };
  }

  return withWriteLock((db) => {
    const validatedRedirect = validateOverrideStaffAndRedirect(
      db,
      params.staffId,
      params.redirectStaffId,
    );
    const tz = db.settings.timezone || 'America/Mexico_City';
    const todayKey = getDateKeyInTimezone(new Date(), tz);
    const created: DateOverride[] = [];
    const skippedDates: string[] = [];

    for (const holiday of holidays) {
      if (holiday.date < todayKey) continue;
      const alreadyExists = db.dateOverrides.some(
        (o) => o.staffId === params.staffId && o.overrideDate === holiday.date,
      );
      if (alreadyExists) {
        skippedDates.push(holiday.date);
        continue;
      }
      const cleanNote = params.publicNote?.trim() || `Cerrado por ${holiday.name}`;
      const record: DateOverride = {
        id: `ovr-${crypto.randomUUID().slice(0, 8)}`,
        staffId: params.staffId,
        overrideDate: holiday.date,
        isUnavailable: true,
        startTime: null,
        endTime: null,
        reason: `Festivo MX: ${holiday.name}`,
        publicNote: cleanNote,
        redirectStaffId: validatedRedirect,
      };
      db.dateOverrides.push(record);
      created.push(record);
    }

    if (created.length > 0) {
      publishRealtimeEvent('availability_updated', { staffId: params.staffId });
    }

    return {
      created,
      skippedDates,
      year: params.year,
    };
  });
}

export async function deleteDateOverride(id: string): Promise<void> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().deleteDateOverride(id);
  }
  await withWriteLock((db) => {
    db.dateOverrides = db.dateOverrides.filter((o) => o.id !== id);
    publishRealtimeEvent('availability_updated');
  });
}

export async function upsertRecurringBlock(
  input: Omit<RecurringBlock, 'id'> & { id?: string },
): Promise<RecurringBlock> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().upsertRecurringBlock(input);
  }
  return withWriteLock((db) => {
    const cols = ensurePhase3Collections(db);
    if (!db.staff.some((s) => s.id === input.staffId)) {
      throw new PolicyError('STAFF_NOT_FOUND', 'Profesional no encontrada.');
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
  if (isSupabaseEnabled()) {
    const repo = createSupabaseRepository();
    const snapshot = await repo.getSnapshot();
    const block = (snapshot.recurringBlocks ?? []).find((b) => b.id === id);
    if (!block) {
      throw new PolicyError('BLOCK_NOT_FOUND', 'Bloqueo recurrente no encontrado.');
    }
    return repo.upsertRecurringBlock({ ...block, isActive });
  }
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
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().deleteRecurringBlock(id);
  }
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
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().upsertLoyaltyProgram(patch);
  }
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

function computeClientLoyaltySummaryFromDb(
  db: Readonly<DemoDatabase>,
  clientId: string,
): PublicLoyaltySummaryDTO | null {
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

export function getClientLoyaltySummary(clientId: string): PublicLoyaltySummaryDTO | null {
  return computeClientLoyaltySummaryFromDb(getSnapshot(), clientId);
}

export async function getServicesByIdsAsync(
  serviceIds: readonly string[],
): Promise<Service[]> {
  const uniqueIds = Array.from(
    new Set(serviceIds.map((id) => id.trim()).filter((id) => id.length > 0)),
  );
  if (uniqueIds.length === 0) return [];
  if (isSupabaseEnabled()) {
    return fetchSupabaseServicesByIds(uniqueIds);
  }
  const db = getSnapshot();
  const idSet = new Set(uniqueIds);
  return db.services.filter((srv) => idSet.has(srv.id));
}

export async function getClientLoyaltySummaryAsync(
  clientId: string,
): Promise<PublicLoyaltySummaryDTO | null> {
  if (isSupabaseEnabled()) {
    return fetchSupabaseClientLoyaltySummary(clientId);
  }
  return computeClientLoyaltySummaryFromDb(getSnapshot(), clientId);
}

function computeNearRewardClientsFromDb(db: Readonly<DemoDatabase>): Array<{
  clientId: string;
  fullName: string;
  phoneE164: string;
  instagramHandle: string | null;
  summary: PublicLoyaltySummaryDTO;
}> {
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

export async function listClientsAsync(): Promise<ClientProfile[]> {
  return getRepository().listClients();
}

export function getNearRewardClients(): NearRewardClientRecord[] {
  return computeNearRewardClientsFromDb(getSnapshot());
}

export async function getNearRewardClientsAsync(
  snapshot?: Readonly<DemoDatabase>,
): Promise<NearRewardClientRecord[]> {
  if (snapshot) {
    return computeNearRewardClientsFromDb(snapshot);
  }
  return getRepository().getNearRewardClients();
}

function computeInactiveClientsFromDb(
  db: Readonly<DemoDatabase>,
  inactiveDays: number,
  nowMs = Date.now(),
): InactiveClientRecord[] {
  const cutoffMs = nowMs - inactiveDays * 86_400_000;
  const serviceNameById = new Map<string, string>(
    db.services.map((srv) => [srv.id, srv.name]),
  );

  const inactive: InactiveClientRecord[] = [];

  for (const client of db.clients) {
    const clientBookings = db.bookings.filter(
      (b) => b.clientId === client.id && b.status !== 'canceled' && b.status !== 'no_show',
    );
    const hasRecentOrUpcoming = clientBookings.some(
      (b) => new Date(b.startAt).getTime() >= cutoffMs,
    );
    if (hasRecentOrUpcoming) continue;

    let lastVisitMs: number | null = null;
    let lastServiceId: string | null = null;
    let totalVisits = 0;
    for (const b of clientBookings) {
      const startMs = new Date(b.startAt).getTime();
      if (b.status === 'completed' || (b.status === 'confirmed' && startMs <= nowMs)) {
        totalVisits += 1;
        if (lastVisitMs === null || startMs > lastVisitMs) {
          lastVisitMs = startMs;
          lastServiceId = b.serviceId;
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
      lastServiceId,
      lastServiceName: lastServiceId ? (serviceNameById.get(lastServiceId) ?? null) : null,
    });
  }

  return inactive.toSorted((a, b) => {
    if (a.daysSinceLastVisit === null && b.daysSinceLastVisit === null) return 0;
    if (a.daysSinceLastVisit === null) return 1;
    if (b.daysSinceLastVisit === null) return -1;
    return b.daysSinceLastVisit - a.daysSinceLastVisit;
  });
}

export function getInactiveClients(inactiveDays: number): InactiveClientRecord[] {
  return computeInactiveClientsFromDb(getSnapshot(), inactiveDays);
}

export async function getInactiveClientsAsync(
  inactiveDays: number,
  snapshot?: Readonly<DemoDatabase>,
): Promise<InactiveClientRecord[]> {
  if (snapshot) {
    return computeInactiveClientsFromDb(snapshot, inactiveDays);
  }
  return getRepository().getInactiveClients(inactiveDays);
}

function computeClientArcoExportFromDb(
  db: Readonly<DemoDatabase>,
  clientId: string,
  exportedAtIso = new Date().toISOString(),
): ClientArcoExport | null {
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
  const loyaltySummary = computeClientLoyaltySummaryFromDb(db, client.id);
  const paymentSplits = (db.paymentSplits ?? []).filter((s) =>
    bookingIds.has(s.bookingId),
  );

  return {
    exportedAt: exportedAtIso,
    privacyPolicyVersion: db.settings.privacyPolicyVersion ?? '2026-11',
    client,
    bookings,
    consents,
    loyaltySummary,
    paymentSplits,
  };
}

export function getClientArcoExport(clientId: string): ClientArcoExport | null {
  return computeClientArcoExportFromDb(getSnapshot(), clientId);
}

export async function getClientArcoExportAsync(
  clientId: string,
): Promise<ClientArcoExport | null> {
  return getRepository().getClientArcoExport(clientId);
}

export async function upsertStaffMember(
  input: Partial<StaffMember> & { name: string },
): Promise<StaffMember> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().upsertStaffMember(input);
  }
  return withWriteLock((db) => {
    if (input.id) {
      const existing = db.staff.find((s) => s.id === input.id);
      if (!existing) {
        throw new PolicyError('STAFF_NOT_FOUND', 'Profesional no encontrada.');
      }
      if (input.name !== undefined) existing.name = input.name.trim();
      if (input.roleTitle !== undefined) {
        existing.roleTitle = input.roleTitle.trim() || 'Nail Artist';
      }
      if (input.bio !== undefined) existing.bio = input.bio.trim();
      if (input.avatarUrl !== undefined) existing.avatarUrl = input.avatarUrl;
      if (input.bookingSlug !== undefined) existing.bookingSlug = input.bookingSlug;
      if (input.commissionPercent !== undefined) {
        existing.commissionPercent = input.commissionPercent;
      }
      if (input.isActive !== undefined) existing.isActive = input.isActive;
      if (input.displayOrder !== undefined) existing.displayOrder = input.displayOrder;
      if (input.serviceIds !== undefined) existing.serviceIds = [...input.serviceIds];
      return { ...existing, serviceIds: [...existing.serviceIds] };
    }
    const created: StaffMember = {
      id: `staff-${crypto.randomUUID().slice(0, 8)}`,
      name: input.name,
      roleTitle: input.roleTitle?.trim() || 'Nail Artist',
      bio: input.bio?.trim() || '',
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
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().upsertAdminUser(input);
  }
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
  if (isSupabaseEnabled()) {
    const supabase = createSupabaseAdminClient();
    const phoneE164 = normalizePhoneE164(params.phone);
    const { data, error } = await supabase
      .from('clients')
      .insert({
        full_name: params.fullName.trim(),
        phone_e164: phoneE164,
        email: params.email?.trim() || null,
        ...(normalizedInstagram ? { instagram_handle: normalizedInstagram } : {}),
        birthday: params.birthday?.trim() || null,
        notes: params.notes?.trim() || '',
        no_show_count: 0,
      })
      .select('*')
      .single();
    if (error || !data) {
      if (error?.code === '23505') {
        throw new PolicyError(
          'CLIENT_EXISTS',
          'Ya existe una clienta registrada con ese número de teléfono.',
        );
      }
      throw new PolicyError(
        'CLIENT_CREATE_FAILED',
        error?.message ?? 'No se pudo registrar a la clienta.',
      );
    }
    return {
      id: data.id,
      fullName: data.full_name,
      phoneE164: data.phone_e164,
      email: data.email,
      ...(data.instagram_handle ? { instagramHandle: data.instagram_handle } : {}),
      birthday: data.birthday,
      notes: data.notes,
      noShowCount: data.no_show_count,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }
  return withWriteLock((db) => {
    const phoneE164 = normalizePhoneE164(params.phone);
    const existing = db.clients.find((c) => phonesMatchE164(c.phoneE164, phoneE164));
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

export async function updateClientNotes(
  params: UpdateClientNotesInput,
): Promise<ClientProfile> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().updateClientNotes(params);
  }
  const hasInstagramUpdate = params.instagramHandle !== undefined;
  const normalizedInstagram = hasInstagramUpdate
    ? normalizeInstagramHandle(params.instagramHandle)
    : undefined;
  return withWriteLock((db) => {
    const client = db.clients.find((c) => c.id === params.clientId);
    if (!client) throw new PolicyError('CLIENT_NOT_FOUND', 'Clienta no encontrada.');
    if (params.fullName !== undefined) {
      const trimmedName = params.fullName.trim();
      if (trimmedName.length < 2) {
        throw new PolicyError('INVALID_CLIENT_NAME', 'Escribe el nombre completo.');
      }
      client.fullName = trimmedName;
    }
    if (params.phone !== undefined) {
      const normalizedPhone = normalizePhoneE164(params.phone);
      const digits = normalizedPhone.replace(/\D/g, '');
      if (!normalizedPhone.startsWith('+') || digits.length < 8 || digits.length > 15) {
        throw new PolicyError('INVALID_PHONE', 'Escribe un WhatsApp válido de 10 dígitos.');
      }
      const duplicate = db.clients.find(
        (c) => c.id !== params.clientId && phonesMatchE164(c.phoneE164, normalizedPhone),
      );
      if (duplicate) {
        throw new PolicyError(
          'CLIENT_EXISTS',
          'Ya existe otra clienta registrada con ese WhatsApp.',
        );
      }
      client.phoneE164 = normalizedPhone;
    }
    if (params.notes !== undefined) client.notes = params.notes;
    if (params.birthday !== undefined) client.birthday = params.birthday;
    if (params.email !== undefined) client.email = params.email;
    if (hasInstagramUpdate) {
      client.instagramHandle = normalizedInstagram;
    }
    client.updatedAt = new Date().toISOString();
    return { ...client };
  });
}

export async function deleteClientProfile(clientId: string): Promise<ClientProfile> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().deleteClientProfile(clientId);
  }
  const cleanId = clientId.trim();
  if (!cleanId) {
    throw new PolicyError('CLIENT_NOT_FOUND', 'Clienta no encontrada.');
  }
  return withWriteLock((db) => {
    const idx = db.clients.findIndex((c) => c.id === cleanId);
    const target = idx === -1 ? undefined : db.clients[idx];
    if (!target) {
      throw new PolicyError('CLIENT_NOT_FOUND', 'Clienta no encontrada.');
    }
    const hasBookings = db.bookings.some((b) => b.clientId === cleanId);
    const hasPackages = (db.clientPackages ?? []).some((p) => p.clientId === cleanId);
    const hasRedemptions = (db.couponRedemptions ?? []).some((r) => r.clientId === cleanId);
    if (hasBookings || hasPackages || hasRedemptions) {
      throw new PolicyError(
        'CLIENT_HAS_HISTORY',
        'No se puede eliminar esta clienta porque ya tiene citas o paquetes registrados.',
      );
    }
    const removed: ClientProfile = { ...target };
    db.clients.splice(idx, 1);
    if (db.consents) {
      db.consents = db.consents.filter((c) => c.clientId !== cleanId);
    }
    if (db.loyaltyStamps) {
      db.loyaltyStamps = db.loyaltyStamps.filter((s) => s.clientId !== cleanId);
    }
    if (db.campaignDispatches) {
      db.campaignDispatches = db.campaignDispatches.filter((d) => d.clientId !== cleanId);
    }
    if (db.mediaAssets) {
      for (const asset of db.mediaAssets) {
        if (asset.clientId === cleanId) asset.clientId = null;
      }
    }
    for (const review of db.reviews) {
      if (review.clientId === cleanId) review.clientId = null;
    }
    return removed;
  });
}

export async function addWaitlistEntry(
  input: Omit<WaitlistEntry, 'id' | 'status' | 'notifiedAt' | 'createdAt'>,
): Promise<WaitlistEntry> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().addWaitlistEntry(input);
  }
  return withWriteLock((db) => {
    const maxExistingMs = db.waitlist.reduce((max, item) => {
      const ts = Date.parse(item.createdAt);
      return Number.isFinite(ts) && ts > max ? ts : max;
    }, 0);
    const nowMs = Date.now();
    const createdAtMs = nowMs > maxExistingMs ? nowMs : maxExistingMs + 1;
    const entry: WaitlistEntry = {
      ...input,
      clientPhoneE164: normalizePhoneE164(input.clientPhoneE164),
      id: `wl-${crypto.randomUUID().slice(0, 8)}`,
      status: 'waiting',
      notifiedAt: null,
      createdAt: new Date(createdAtMs).toISOString(),
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
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().updateWaitlistStatus(id, status);
  }
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
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().submitBookingReview(params);
  }
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
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().upsertCoupon(input);
  }
  return withWriteLock((db) => {
    const normalizedCode = input.code.trim().toUpperCase();
    const duplicate = db.coupons.find(
      (c) => c.code.toUpperCase() === normalizedCode && c.id !== input.id,
    );
    if (duplicate) {
      throw new PolicyError(
        'COUPON_CODE_EXISTS',
        'Ya existe otro cupón o tarjeta con ese código.',
      );
    }

    if (input.id) {
      const existing = db.coupons.find((c) => c.id === input.id);
      if (!existing) {
        throw new PolicyError('COUPON_NOT_FOUND', 'Cupón no encontrado.');
      }
      existing.code = normalizedCode;
      existing.kind = input.kind;
      existing.discountType = input.discountType;
      existing.discountValue = input.discountValue;
      existing.remainingBalanceCents =
        input.kind === 'gift_card'
          ? (input.remainingBalanceCents ??
            existing.remainingBalanceCents ??
            input.discountValue)
          : null;
      existing.maxUses = input.maxUses;
      existing.minSubtotalCents = input.minSubtotalCents;
      existing.expiresAt = input.expiresAt;
      existing.recipientName = input.recipientName;
      existing.isActive = input.isActive;
      publishRealtimeEvent('settings_updated');
      return { ...existing };
    }

    const created: Coupon = {
      ...input,
      id: `cp-${crypto.randomUUID().slice(0, 8)}`,
      code: normalizedCode,
      usedCount: 0,
      remainingBalanceCents:
        input.kind === 'gift_card'
          ? (input.remainingBalanceCents ?? input.discountValue)
          : null,
      createdAt: new Date().toISOString(),
    };
    db.coupons.unshift(created);
    publishRealtimeEvent('settings_updated');
    return { ...created };
  });
}

export async function deleteCoupon(id: string): Promise<Coupon> {
  const cleanId = id.trim();
  if (!cleanId) {
    throw new PolicyError('COUPON_NOT_FOUND', 'Cupón no encontrado.');
  }
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().deleteCoupon(cleanId);
  }
  return withWriteLock((db) => {
    const idx = db.coupons.findIndex((c) => c.id === cleanId);
    if (idx === -1) {
      throw new PolicyError('COUPON_NOT_FOUND', 'Cupón no encontrado.');
    }
    const [removed] = db.coupons.splice(idx, 1);
    if (!removed) {
      throw new PolicyError('COUPON_NOT_FOUND', 'Cupón no encontrado.');
    }
    if (db.couponRedemptions) {
      db.couponRedemptions = db.couponRedemptions.filter((r) => r.couponId !== cleanId);
    }
    publishRealtimeEvent('settings_updated');
    return { ...removed };
  });
}

export async function adjustInventoryItem(params: {
  itemId?: string;
  newItem?: Omit<InventoryItem, 'id' | 'updatedAt'>;
  delta?: number;
  reason?: 'restock' | 'service_usage' | 'retail_sale' | 'adjustment';
  notes?: string;
  paymentMethod?: PaymentMethod;
  staffId?: string | null;
  createdBy?: string;
}): Promise<InventoryItem> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().adjustInventoryItem(params);
  }
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
        staffId: params.staffId ?? null,
        entryType: 'product_sale',
        description: `Venta producto: ${item.name} (x${qty})`,
        amountCents: Math.round(item.retailPriceCents * qty),
        tipCents: 0,
        commissionCents: Math.round(item.retailPriceCents * qty * 0.1),
        paymentMethod: params.paymentMethod ?? 'cash',
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
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().addCashEntry(input);
  }
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

export async function updateCashEntry(
  id: string,
  patch: UpdateCashEntryInput,
): Promise<CashRegisterEntry> {
  const cleanId = id.trim();
  if (!cleanId) {
    throw new PolicyError('CASH_ENTRY_NOT_FOUND', 'Movimiento de caja no encontrado.');
  }
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().updateCashEntry(cleanId, patch);
  }
  return withWriteLock((db) => {
    const entry = db.cashEntries.find((e) => e.id === cleanId);
    if (!entry) {
      throw new PolicyError('CASH_ENTRY_NOT_FOUND', 'Movimiento de caja no encontrado.');
    }
    if (entry.bookingId !== null) {
      throw new PolicyError(
        'BOOKING_LINKED_ENTRY_IMMUTABLE',
        'Los cobros vinculados a una cita no se pueden editar ni eliminar manualmente.',
      );
    }
    if (patch.staffId !== undefined) entry.staffId = patch.staffId;
    if (patch.entryType !== undefined) entry.entryType = patch.entryType;
    if (patch.description !== undefined) entry.description = patch.description.trim();
    if (patch.amountCents !== undefined) entry.amountCents = patch.amountCents;
    if (patch.tipCents !== undefined) entry.tipCents = patch.tipCents;
    if (patch.commissionCents !== undefined) entry.commissionCents = patch.commissionCents;
    if (patch.paymentMethod !== undefined) entry.paymentMethod = patch.paymentMethod;
    return { ...entry };
  });
}

export async function deleteCashEntry(id: string): Promise<CashRegisterEntry> {
  const cleanId = id.trim();
  if (!cleanId) {
    throw new PolicyError('CASH_ENTRY_NOT_FOUND', 'Movimiento de caja no encontrado.');
  }
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().deleteCashEntry(cleanId);
  }
  return withWriteLock((db) => {
    const idx = db.cashEntries.findIndex((e) => e.id === cleanId);
    if (idx === -1) {
      throw new PolicyError('CASH_ENTRY_NOT_FOUND', 'Movimiento de caja no encontrado.');
    }
    const existing = db.cashEntries[idx];
    if (!existing) {
      throw new PolicyError('CASH_ENTRY_NOT_FOUND', 'Movimiento de caja no encontrado.');
    }
    if (existing.bookingId !== null) {
      throw new PolicyError(
        'BOOKING_LINKED_ENTRY_IMMUTABLE',
        'Los cobros vinculados a una cita no se pueden editar ni eliminar manualmente.',
      );
    }
    db.cashEntries.splice(idx, 1);
    return { ...existing };
  });
}

export async function updateWorkflow(
  id: string,
  patch: Partial<NotificationWorkflow>,
): Promise<NotificationWorkflow> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().updateWorkflow(id, patch);
  }
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
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().updateCalendarConnection(staffId, patch);
  }
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

export async function syncCalendarConnectionBusyBlocks(params: {
  staffId: string;
  busyBlocks: Array<{ startAt: string; endAt: string; summary?: string }>;
  refreshedAccessTokenEncrypted?: string;
  refreshedTokenExpiresAt?: string;
}): Promise<void> {
  if (isSupabaseEnabled()) {
    await createSupabaseRepository().updateCalendarConnection(params.staffId, {
      externalBusyBlocks: params.busyBlocks,
      lastSyncedAt: new Date().toISOString(),
      ...(params.refreshedAccessTokenEncrypted
        ? { accessTokenEncrypted: params.refreshedAccessTokenEncrypted }
        : {}),
      ...(params.refreshedTokenExpiresAt
        ? { tokenExpiresAt: params.refreshedTokenExpiresAt }
        : {}),
    });
    return;
  }
  await withWriteLock((db) => {
    const conn = db.calendarConnections.find((c) => c.staffId === params.staffId);
    if (!conn) return;
    conn.externalBusyBlocks = params.busyBlocks;
    conn.lastSyncedAt = new Date().toISOString();
    if (params.refreshedAccessTokenEncrypted) {
      conn.accessTokenEncrypted = params.refreshedAccessTokenEncrypted;
    }
    if (params.refreshedTokenExpiresAt) {
      conn.tokenExpiresAt = params.refreshedTokenExpiresAt;
    }
    publishRealtimeEvent('availability_updated', { staffId: params.staffId });
  });
}

export async function upsertGalleryItem(
  input: Omit<GalleryItem, 'id' | 'displayOrder'> & { id?: string },
): Promise<GalleryItem> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().upsertGalleryItem(input);
  }
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
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().deleteGalleryItem(id);
  }
  await withWriteLock((db) => {
    db.gallery = db.gallery.filter((g) => g.id !== id);
  });
}

function isScheduledNotificationDue(
  notification: ScheduledNotification,
  nowMs: number,
): boolean {
  if (notification.status === 'pending') {
    const scheduledMs = Date.parse(notification.scheduledFor);
    return Number.isFinite(scheduledMs) && scheduledMs <= nowMs;
  }
  if (notification.status === 'failed' && notification.nextRetryAt) {
    const attempts = notification.attempts ?? 0;
    const maxAttempts = notification.maxAttempts ?? 3;
    const retryMs = Date.parse(notification.nextRetryAt);
    return attempts < maxAttempts && Number.isFinite(retryMs) && retryMs <= nowMs;
  }
  return false;
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
  skippedCount: number;
  retriedCount: number;
}> {
  if (isSupabaseEnabled()) {
    const result = await createSupabaseRepository().processDueScheduledNotifications(
      dispatcher,
      nowMs,
    );
    return {
      ...result,
      skippedCount: result.skippedCount ?? 0,
      retriedCount: result.retriedCount ?? 0,
    };
  }
  const phase1 = await withWriteLock((db) => {
    const due = db.notifications.filter((n) => isScheduledNotificationDue(n, nowMs));

    let canceledCount = 0;
    let skippedCount = 0;
    const workItems: Array<{
      notificationId: string;
      isRetry: boolean;
      notification: ScheduledNotification;
      booking: BookingWithRelations;
      settings: SalonSettings;
      isReminder24h: boolean;
      isTouchUp: boolean;
    }> = [];

    for (const item of due) {
      const isRetry = item.status === 'failed';
      const rawBooking = item.bookingId
        ? db.bookings.find((b) => b.id === item.bookingId)
        : undefined;
      if (!rawBooking || rawBooking.status === 'canceled' || rawBooking.status === 'no_show') {
        item.status = 'canceled';
        item.nextRetryAt = null;
        canceledCount += 1;
        continue;
      }

      const wf = item.workflowId
        ? db.workflows.find((w) => w.id === item.workflowId)
        : null;
      const isAfterBooking = wf?.triggerEvent === 'after_booking';

      if (!isAfterBooking && rawBooking.status === 'completed') {
        item.status = 'canceled';
        item.errorMessage = 'booking_already_completed';
        item.nextRetryAt = null;
        canceledCount += 1;
        continue;
      }

      if (isAfterBooking) {
        if (rawBooking.status !== 'completed') {
          const endMs = Date.parse(rawBooking.endAt);
          if (Number.isFinite(endMs) && nowMs - endMs > 7 * 86_400_000) {
            item.status = 'canceled';
            item.errorMessage = 'booking_not_completed';
            item.nextRetryAt = null;
            canceledCount += 1;
          }
          continue;
        }
        if ((wf?.offsetMinutes ?? 0) >= 1440 && rawBooking.touchupInvitedAt) {
          item.status = 'canceled';
          item.errorMessage = 'already_invited_touchup';
          item.nextRetryAt = null;
          canceledCount += 1;
          continue;
        }
      }

      const alreadySentEmail = db.notifications.some((n) => {
        if (n.bookingId !== rawBooking.id || n.channel !== 'email' || n.status !== 'sent') {
          return false;
        }
        const nWf = n.workflowId
          ? db.workflows.find((w) => w.id === n.workflowId)
          : null;
        return nWf?.triggerEvent === 'before_booking';
      });

      if (
        item.channel === 'whatsapp' &&
        !isAfterBooking &&
        shouldSkipWhatsappCascade(rawBooking, alreadySentEmail)
      ) {
        item.status = 'canceled';
        item.errorMessage = 'skipped_cascade';
        item.sentAt = null;
        item.nextRetryAt = null;
        skippedCount += 1;
        canceledCount += 1;
        continue;
      }

      const hydrated = hydrateBooking(db, rawBooking);
      workItems.push({
        notificationId: item.id,
        isRetry,
        notification: { ...item, bodyText: item.bodyText || item.previewText },
        booking: hydrated,
        settings: { ...db.settings },
        isReminder24h: Boolean(wf?.triggerEvent === 'before_booking' && wf.offsetMinutes >= 720),
        isTouchUp: Boolean(isAfterBooking && (wf?.offsetMinutes ?? 0) >= 1440),
      });
    }

    return {
      totalDue: due.length,
      canceledCount,
      skippedCount,
      workItems,
    };
  });

  if (phase1.workItems.length === 0) {
    return {
      processed: phase1.totalDue,
      sentCount: 0,
      failedCount: 0,
      canceledCount: phase1.canceledCount,
      skippedCount: phase1.skippedCount,
      retriedCount: 0,
    };
  }

  const dispatchResults: Array<{
    work: (typeof phase1.workItems)[number];
    res: {
      status: 'sent' | 'failed';
      providerMessageId: string | null;
      errorMessage: string | null;
    };
  }> = [];

  for (const work of phase1.workItems) {
    const res = await dispatcher({
      notification: work.notification,
      booking: work.booking,
      settings: work.settings,
    });
    dispatchResults.push({ work, res });
  }

  return withWriteLock((db) => {
    let sentCount = 0;
    let failedCount = 0;
    let retriedCount = 0;
    const attemptIso = new Date(nowMs).toISOString();

    for (const { work, res } of dispatchResults) {
      const item = db.notifications.find((n) => n.id === work.notificationId);
      if (!item) continue;
      const rawBooking = item.bookingId
        ? db.bookings.find((b) => b.id === item.bookingId)
        : undefined;

      const nextAttempt = (item.attempts ?? 0) + 1;
      const maxAttempts = item.maxAttempts ?? 3;
      item.attempts = nextAttempt;
      item.maxAttempts = maxAttempts;
      item.lastAttemptAt = attemptIso;
      item.status = res.status;
      item.providerMessageId = res.providerMessageId;
      item.errorMessage = res.errorMessage;

      if (res.status === 'sent') {
        item.deliveryStatus = 'sent';
        item.sentAt = attemptIso;
        item.nextRetryAt = null;
        if (rawBooking && work.isReminder24h) {
          rawBooking.reminder24hSentAt = attemptIso;
        }
        if (rawBooking && work.isTouchUp) {
          rawBooking.touchupInvitedAt = attemptIso;
        }
        sentCount += 1;
        if (work.isRetry) {
          retriedCount += 1;
        }
      } else {
        item.deliveryStatus = 'failed';
        item.sentAt = null;
        item.nextRetryAt =
          nextAttempt < maxAttempts
            ? computeNotificationRetryAt(nextAttempt, nowMs)
            : null;
        failedCount += 1;
      }
    }

    return {
      processed: phase1.totalDue,
      sentCount,
      failedCount,
      canceledCount: phase1.canceledCount,
      skippedCount: phase1.skippedCount,
      retriedCount,
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

export async function registerMediaAsset(
  input: RegisterMediaAssetInput,
): Promise<MediaAssetRecord> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().registerMediaAsset(input);
  }
  const storagePath = normalizeMediaStoragePath(input.storagePath);
  if (!storagePath) {
    throw new PolicyError('INVALID_MEDIA_URL', 'Ruta de archivo inválida.');
  }
  return withWriteLock((db) => {
    const cols = ensurePhase3Collections(db);
    const existing = cols.mediaAssets.find((a) => a.storagePath === storagePath);
    if (existing) {
      if (input.bookingId !== undefined && input.bookingId !== null) {
        existing.bookingId = input.bookingId;
      }
      if (input.clientId !== undefined && input.clientId !== null) {
        existing.clientId = input.clientId;
      }
      if (input.contentType) {
        existing.contentType = input.contentType;
      }
      if (input.sizeBytes > 0) {
        existing.sizeBytes = input.sizeBytes;
      }
      return { ...existing };
    }
    const created: MediaAssetRecord = {
      id: generateId('med'),
      storagePath,
      folder: input.folder,
      bookingId: input.bookingId ?? null,
      clientId: input.clientId ?? null,
      contentType: input.contentType,
      sizeBytes: Math.max(0, Math.floor(input.sizeBytes)),
      createdAt: input.createdAt ?? new Date().toISOString(),
      retentionWarned30dAt: null,
      retentionWarned7dAt: null,
      purgedAt: null,
    };
    cols.mediaAssets.push(created);
    return { ...created };
  });
}

export async function getMediaAccessOwner(
  rawStoragePath: string,
): Promise<MediaAccessOwner | null> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().getMediaAccessOwner(rawStoragePath);
  }
  const storagePath = normalizeMediaStoragePath(rawStoragePath);
  if (!storagePath) return null;
  const db = getSnapshot();
  const mediaRecord = (db.mediaAssets ?? []).find((a) => a.storagePath === storagePath);

  if (mediaRecord) {
    const booking = mediaRecord.bookingId
      ? db.bookings.find((b) => b.id === mediaRecord.bookingId) ?? null
      : db.bookings.find(
          (b) =>
            (b.paymentProofUrl &&
              normalizeMediaStoragePath(b.paymentProofUrl) === storagePath) ||
            (b.inspoPhotoUrl &&
              normalizeMediaStoragePath(b.inspoPhotoUrl) === storagePath),
        ) ?? null;
    const clientId = mediaRecord.clientId ?? booking?.clientId ?? null;
    const client = clientId ? db.clients.find((c) => c.id === clientId) ?? null : null;
    return {
      storagePath,
      folder: mediaRecord.folder,
      bookingId: booking?.id ?? mediaRecord.bookingId ?? null,
      staffId: booking?.staffId ?? null,
      manageToken: booking?.manageToken ?? null,
      clientPhoneE164: client?.phoneE164 ?? null,
    };
  }

  const booking = db.bookings.find(
    (b) =>
      (b.paymentProofUrl &&
        normalizeMediaStoragePath(b.paymentProofUrl) === storagePath) ||
      (b.inspoPhotoUrl &&
        normalizeMediaStoragePath(b.inspoPhotoUrl) === storagePath),
  );
  if (!booking) return null;

  const folder: MediaAssetFolder =
    inferMediaFolder(storagePath) ??
    (booking.inspoPhotoUrl &&
    normalizeMediaStoragePath(booking.inspoPhotoUrl) === storagePath
      ? 'inspo'
      : 'proofs');
  const client = db.clients.find((c) => c.id === booking.clientId) ?? null;
  return {
    storagePath,
    folder,
    bookingId: booking.id,
    staffId: booking.staffId,
    manageToken: booking.manageToken,
    clientPhoneE164: client?.phoneE164 ?? null,
  };
}

export async function listMediaAssetsForRetention(): Promise<MediaAssetRecord[]> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().listMediaAssetsForRetention();
  }
  const db = getSnapshot();
  return (db.mediaAssets ?? [])
    .filter((a) => a.purgedAt === null)
    .map((a) => ({ ...a }))
    .toSorted(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
}

export async function markMediaRetentionWarned(
  id: string,
  stage: '30d' | '7d',
  atIso = new Date().toISOString(),
): Promise<MediaAssetRecord | null> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().markMediaRetentionWarned(id, stage, atIso);
  }
  return withWriteLock((db) => {
    const cols = ensurePhase3Collections(db);
    const asset = cols.mediaAssets.find((a) => a.id === id);
    if (!asset || asset.purgedAt !== null) return null;

    if (stage === '30d') {
      if (asset.retentionWarned30dAt !== null) {
        return { ...asset };
      }
      asset.retentionWarned30dAt = atIso;
    } else {
      if (asset.retentionWarned7dAt !== null) {
        return { ...asset };
      }
      asset.retentionWarned7dAt = atIso;
    }

    appendAuditLog(db, {
      actor: {
        id: 'system-retention-cron',
        email: 'cron@laikonanails.mx',
        role: 'owner',
      },
      action: 'media_retention_warned',
      entityType: 'media_asset',
      entityId: asset.id,
      metadata: {
        stage,
        storagePath: asset.storagePath,
        folder: asset.folder,
        bookingId: asset.bookingId,
      },
    });
    return { ...asset };
  });
}

export async function markMediaAssetPurged(
  id: string,
  atIso = new Date().toISOString(),
): Promise<MediaAssetRecord | null> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().markMediaAssetPurged(id, atIso);
  }
  return withWriteLock((db) => {
    const cols = ensurePhase3Collections(db);
    const asset = cols.mediaAssets.find((a) => a.id === id);
    if (!asset) return null;
    if (asset.purgedAt !== null) {
      return { ...asset };
    }

    asset.purgedAt = atIso;
    const normalizedPath = normalizeMediaStoragePath(asset.storagePath);

    for (const booking of db.bookings) {
      const matchesBooking = asset.bookingId !== null && booking.id === asset.bookingId;
      const matchesProof =
        Boolean(booking.paymentProofUrl) &&
        normalizeMediaStoragePath(booking.paymentProofUrl ?? '') === normalizedPath;
      const matchesInspo =
        Boolean(booking.inspoPhotoUrl) &&
        normalizeMediaStoragePath(booking.inspoPhotoUrl ?? '') === normalizedPath;

      if (matchesProof || (matchesBooking && asset.folder === 'proofs')) {
        booking.paymentProofUrl = null;
        booking.updatedAt = atIso;
      }
      if (matchesInspo || (matchesBooking && asset.folder === 'inspo')) {
        booking.inspoPhotoUrl = null;
        booking.updatedAt = atIso;
      }
    }

    appendAuditLog(db, {
      actor: {
        id: 'system-retention-cron',
        email: 'cron@laikonanails.mx',
        role: 'owner',
      },
      action: 'media_retention_purged',
      entityType: 'media_asset',
      entityId: asset.id,
      metadata: {
        storagePath: asset.storagePath,
        folder: asset.folder,
        bookingId: asset.bookingId,
      },
    });
    return { ...asset };
  });
}

export async function getWhatsAppTemplates(): Promise<WhatsAppTemplateConfig[]> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().getWhatsAppTemplates();
  }
  const db = getSnapshot();
  const defaults = createDefaultWhatsAppTemplates();
  const byTrigger = new Map<WhatsAppTemplateTriggerKey, WhatsAppTemplateConfig>();
  for (const tpl of defaults) {
    byTrigger.set(tpl.triggerKey, tpl);
  }
  for (const tpl of db.whatsappTemplates ?? []) {
    byTrigger.set(tpl.triggerKey, tpl);
  }
  const overrides = getWhatsAppTemplateNameOverrides();
  return Array.from(byTrigger.values()).map((tpl) => ({
    ...tpl,
    templateName: overrides[tpl.triggerKey] ?? tpl.templateName,
  }));
}

export async function updateWhatsAppTemplate(
  triggerKey: WhatsAppTemplateTriggerKey,
  patch: { templateName?: string; isActive?: boolean },
): Promise<WhatsAppTemplateConfig> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().updateWhatsAppTemplate(triggerKey, patch);
  }
  return withWriteLock((db) => {
    const cols = ensurePhase3Collections(db);
    const nowIso = new Date().toISOString();
    const spec = getOfficialWhatsAppTemplateSpec(triggerKey);
    const existingIdx = cols.whatsappTemplates.findIndex(
      (tpl) => tpl.triggerKey === triggerKey,
    );
    const existing = existingIdx >= 0 ? cols.whatsappTemplates[existingIdx] : undefined;
    const updated: WhatsAppTemplateConfig = {
      id: existing?.id ?? `watpl-${triggerKey.replace(/_/g, '-')}`,
      triggerKey,
      templateName:
        patch.templateName !== undefined
          ? sanitizeWhatsAppTemplateName(patch.templateName, triggerKey)
          : existing?.templateName ?? spec.defaultTemplateName,
      category: existing?.category ?? spec.category,
      languageCode: existing?.languageCode ?? spec.languageCode,
      isActive: patch.isActive !== undefined ? patch.isActive : existing?.isActive ?? true,
      updatedAt: nowIso,
    };
    if (existingIdx >= 0) {
      cols.whatsappTemplates[existingIdx] = updated;
    } else {
      cols.whatsappTemplates.push(updated);
    }
    return updated;
  });
}

export async function updateNotificationDeliveryByProviderId(
  providerMessageId: string,
  status: 'sent' | 'failed',
  errorMessage: string | null = null,
): Promise<boolean> {
  const cleanId = providerMessageId.trim();
  if (!cleanId) return false;
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().updateNotificationDeliveryByProviderId(
      cleanId,
      status,
      errorMessage,
    );
  }
  return withWriteLock((db) => {
    let matched = false;
    const nowIso = new Date().toISOString();
    for (const notif of db.notifications) {
      if (notif.providerMessageId === cleanId) {
        notif.status = status;
        notif.deliveryStatus = status === 'sent' ? 'sent' : 'failed';
        notif.errorMessage = errorMessage;
        if (status === 'sent' && !notif.sentAt) {
          notif.sentAt = nowIso;
        }
        matched = true;
      }
    }
    return matched;
  });
}

export async function getWhatsAppMonthlyUsage(
  monthKey?: string,
): Promise<WhatsAppMonthlyUsageSummary> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().getWhatsAppMonthlyUsage(monthKey);
  }
  const db = getSnapshot();
  const targetMonthKey = resolveEffectiveMonthKey(db.settings.timezone, monthKey);
  const quotaLimit = resolveWhatsAppQuotaLimit(db.settings);
  const existing = (db.whatsappMonthlyUsage ?? []).find(
    (u) => u.monthKey === targetMonthKey,
  );
  return buildWhatsAppUsageSummary({
    monthKey: targetMonthKey,
    sentCount: existing?.sentCount ?? 0,
    quotaLimit: existing?.quotaLimit ?? quotaLimit,
    warned80At: existing?.warned80At ?? null,
    warned100At: existing?.warned100At ?? null,
  });
}

export async function incrementWhatsAppMonthlyUsage(
  monthKey?: string,
  count = 1,
): Promise<WhatsAppMonthlyUsageSummary> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().incrementWhatsAppMonthlyUsage(monthKey, count);
  }
  const increment = Math.max(0, Math.floor(count));
  return withWriteLock((db) => {
    const cols = ensurePhase3Collections(db);
    const now = new Date();
    const nowIso = now.toISOString();
    const targetMonthKey = resolveEffectiveMonthKey(db.settings.timezone, monthKey, now);
    const quotaLimit = resolveWhatsAppQuotaLimit(db.settings);
    let record = cols.whatsappMonthlyUsage.find((u) => u.monthKey === targetMonthKey);
    if (!record) {
      record = {
        monthKey: targetMonthKey,
        sentCount: 0,
        quotaLimit,
        warned80At: null,
        warned100At: null,
        updatedAt: nowIso,
      };
      cols.whatsappMonthlyUsage.push(record);
    }
    record.sentCount += increment;
    record.quotaLimit = quotaLimit;
    if (record.warned80At === null && record.sentCount * 100 >= quotaLimit * 80) {
      record.warned80At = nowIso;
    }
    if (record.warned100At === null && record.sentCount >= quotaLimit) {
      record.warned100At = nowIso;
    }
    record.updatedAt = nowIso;
    return buildWhatsAppUsageSummary(record);
  });
}

export async function claimWebhookEventIdempotent(
  provider: string,
  eventId: string,
): Promise<boolean> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().claimWebhookEventIdempotent(provider, eventId);
  }
  const cleanProvider = provider.trim().toLowerCase();
  const cleanEventId = eventId.trim();
  if (!cleanProvider || !cleanEventId) return false;

  return withWriteLock((db) => {
    const cols = ensurePhase3Collections(db);
    const exists = cols.webhookEvents.some(
      (e) => e.provider === cleanProvider && e.eventId === cleanEventId,
    );
    if (exists) {
      return false;
    }
    cols.webhookEvents.push({
      provider: cleanProvider,
      eventId: cleanEventId,
      receivedAt: new Date().toISOString(),
    });
    if (cols.webhookEvents.length > 2000) {
      cols.webhookEvents.splice(0, cols.webhookEvents.length - 2000);
    }
    return true;
  });
}

export async function cleanupExpiredSlotHolds(
  nowMs = Date.now(),
): Promise<CleanupExpiredSlotHoldsResult> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().cleanupExpiredSlotHolds(nowMs);
  }
  return withWriteLock(
    (db) => {
      const before = db.slotHolds.length;
      db.slotHolds = db.slotHolds.filter(
        (h) => new Date(h.expiresAt).getTime() > nowMs,
      );
      return {
        cleanedCount: Math.max(0, before - db.slotHolds.length),
        dbAlive: true,
      };
    },
    { skipPruneHolds: true },
  );
}

function getDemoOutboxStore(): OutboxEventRecord[] {
  if (!globalThis.nailsDemoOutbox) {
    globalThis.nailsDemoOutbox = [];
  }
  return globalThis.nailsDemoOutbox;
}

function toThreadBookingContext(
  db: Readonly<DemoDatabase>,
  booking: Booking,
): WhatsAppThreadBookingContextDTO {
  const service = db.services.find((s) => s.id === booking.serviceId);
  const staff = db.staff.find((s) => s.id === booking.staffId);
  return {
    bookingId: booking.id,
    bookingCode: booking.bookingCode,
    serviceName: service?.name ?? 'Servicio',
    staffId: booking.staffId,
    staffName: staff?.name ?? 'Profesional',
    startAt: booking.startAt,
    endAt: booking.endAt,
    status: booking.status,
    attendanceStatus: booking.attendanceStatus ?? 'pending',
    totalPriceCents: booking.totalPriceCents,
    depositAmountCents: booking.depositAmountCents,
    manageToken: booking.manageToken,
  };
}

function resolveClientForThread(
  db: Readonly<DemoDatabase>,
  thread: WhatsAppThread,
): ClientProfile | null {
  if (thread.clientId) {
    const byId = db.clients.find((c) => c.id === thread.clientId);
    if (byId) return byId;
  }
  return db.clients.find((c) => phonesMatchE164(c.phoneE164, thread.phoneE164)) ?? null;
}

function resolveBookingsForThread(
  db: Readonly<DemoDatabase>,
  thread: WhatsAppThread,
  nowMs: number,
): {
  bookings: WhatsAppThreadBookingContextDTO[];
  nextBooking: WhatsAppThreadBookingContextDTO | null;
} {
  const matchedClientIds = new Set<string>();
  if (thread.clientId) matchedClientIds.add(thread.clientId);
  for (const client of db.clients) {
    if (phonesMatchE164(client.phoneE164, thread.phoneE164)) {
      matchedClientIds.add(client.id);
    }
  }
  if (matchedClientIds.size === 0) {
    return { bookings: [], nextBooking: null };
  }

  const rawBookings = db.bookings.filter((b) => matchedClientIds.has(b.clientId));
  const upcomingActive = rawBookings
    .filter((b) => isActiveBookingStatus(b.status) && Date.parse(b.endAt) >= nowMs)
    .toSorted((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  const otherBookings = rawBookings
    .filter((b) => !(isActiveBookingStatus(b.status) && Date.parse(b.endAt) >= nowMs))
    .toSorted((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt));

  const ordered = [...upcomingActive, ...otherBookings];
  const contexts = ordered.map((b) => toThreadBookingContext(db, b));
  return {
    bookings: contexts,
    nextBooking: contexts[0] ?? null,
  };
}

function isThreadVisibleToActor(
  db: Readonly<DemoDatabase>,
  thread: WhatsAppThread,
  role?: AdminRole,
  staffMemberId?: string | null,
): boolean {
  if (!role || role === 'owner' || role === 'admin') {
    return true;
  }
  if (!staffMemberId) {
    return false;
  }
  if (thread.assignedStaffId === staffMemberId) {
    return true;
  }
  const client = resolveClientForThread(db, thread);
  if (!client) return false;
  return db.bookings.some(
    (b) => b.clientId === client.id && b.staffId === staffMemberId,
  );
}

function isNotificationVisibleToActor(
  db: Readonly<DemoDatabase>,
  notification: ScheduledNotification,
  role?: AdminRole,
  staffMemberId?: string | null,
): boolean {
  if (!role || role === 'owner' || role === 'admin') {
    return true;
  }
  if (!staffMemberId) {
    return false;
  }
  if (notification.bookingId) {
    const booking = db.bookings.find((b) => b.id === notification.bookingId);
    return booking?.staffId === staffMemberId;
  }
  if (notification.clientId) {
    return db.bookings.some(
      (b) => b.clientId === notification.clientId && b.staffId === staffMemberId,
    );
  }
  return false;
}

function buildThreadSummaryDTOFromDb(
  db: Readonly<DemoDatabase>,
  thread: WhatsAppThread,
  nowMs: number,
): WhatsAppThreadSummaryDTO {
  const client = resolveClientForThread(db, thread);
  const { nextBooking } = resolveBookingsForThread(db, thread, nowMs);
  const threadMessages = (db.whatsappMessages ?? []).filter(
    (m) => m.threadId === thread.id,
  );
  let latestMsg: WhatsAppMessage | null = null;
  let latestMs = -Infinity;
  for (const msg of threadMessages) {
    const ms = Date.parse(msg.createdAt);
    if (ms >= latestMs) {
      latestMs = ms;
      latestMsg = msg;
    }
  }
  const hasFailed =
    thread.hasFailedMessages ||
    threadMessages.some((m) => m.deliveryStatus === 'failed');

  return {
    id: thread.id,
    phoneE164: thread.phoneE164,
    clientId: client?.id ?? thread.clientId,
    contactName: thread.contactName || client?.fullName || thread.phoneE164,
    clientEmail: client?.email ?? null,
    clientInstagram: client?.instagramHandle ?? null,
    lastMessageAt: thread.lastMessageAt,
    lastMessagePreview: thread.lastMessagePreview,
    lastMessageDirection: thread.lastMessageDirection,
    lastInboundAt: thread.lastInboundAt,
    unreadCount: thread.unreadCount,
    lastReadAt: thread.lastReadAt,
    hasFailedMessages: hasFailed,
    isArchived: thread.isArchived,
    assignedStaffId: thread.assignedStaffId,
    serviceWindow: computeWhatsAppServiceWindow(thread.lastInboundAt, nowMs),
    nextBooking,
    lastDeliveryStatus: latestMsg?.deliveryStatus ?? null,
    lastSenderKind: latestMsg?.senderKind ?? null,
  };
}

function computeDemoInboxSummary(
  db: Readonly<DemoDatabase>,
  visibleSummaries: readonly WhatsAppThreadSummaryDTO[],
  role?: AdminRole,
  staffMemberId?: string | null,
): WhatsAppInboxSummaryDTO {
  let unreadCount = 0;
  let failedCount = 0;
  let windowOpenCount = 0;
  for (const summary of visibleSummaries) {
    unreadCount += summary.unreadCount;
    if (summary.hasFailedMessages) failedCount += 1;
    if (summary.serviceWindow.isOpen) windowOpenCount += 1;
  }
  let failedRemindersCount = 0;
  let pendingRemindersCount = 0;
  for (const notif of db.notifications) {
    if (!isNotificationVisibleToActor(db, notif, role, staffMemberId)) continue;
    if (notif.status === 'failed') failedRemindersCount += 1;
    if (notif.status === 'pending') pendingRemindersCount += 1;
  }
  return {
    unreadCount,
    failedCount,
    failedRemindersCount,
    pendingRemindersCount,
    windowOpenCount,
    totalThreads: visibleSummaries.length,
  };
}

export async function listWhatsAppThreads(
  params?: ListWhatsAppThreadsParams,
): Promise<{ threads: WhatsAppThreadSummaryDTO[]; summary: WhatsAppInboxSummaryDTO }> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().listWhatsAppThreads(params);
  }
  const db = getSnapshot();
  const nowMs = params?.nowMs ?? Date.now();
  const visibleThreads = (db.whatsappThreads ?? []).filter(
    (t) =>
      !t.isArchived &&
      isThreadVisibleToActor(db, t, params?.role, params?.staffMemberId),
  );
  const allSummaries = visibleThreads.map((t) =>
    buildThreadSummaryDTOFromDb(db, t, nowMs),
  );
  const summary = computeDemoInboxSummary(
    db,
    allSummaries,
    params?.role,
    params?.staffMemberId,
  );

  const filter = params?.filter ?? 'all';
  const query = params?.q?.trim().toLowerCase() ?? '';
  const phoneFilter = params?.phone?.trim() ?? '';
  const clientIdFilter = params?.clientId?.trim() ?? '';
  const limit = Math.max(1, Math.min(200, params?.limit ?? 50));

  const filtered = allSummaries
    .filter((item) => {
      if (filter === 'unread' && item.unreadCount <= 0) return false;
      if (filter === 'window_open' && !item.serviceWindow.isOpen) return false;
      if (filter === 'failed' && !item.hasFailedMessages) return false;
      if (phoneFilter && !phonesMatchE164(item.phoneE164, phoneFilter)) {
        return false;
      }
      if (clientIdFilter && item.clientId !== clientIdFilter) {
        return false;
      }
      if (query) {
        const haystack = [
          item.contactName,
          item.phoneE164,
          item.lastMessagePreview,
          item.clientEmail ?? '',
          item.clientInstagram ?? '',
          item.nextBooking?.bookingCode ?? '',
          item.nextBooking?.serviceName ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    })
    .toSorted((a, b) => {
      const aMs = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
      const bMs = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
      return bMs - aMs;
    })
    .slice(0, limit);

  return { threads: filtered, summary };
}

export async function getWhatsAppThreadDetail(
  params: GetWhatsAppThreadDetailParams,
): Promise<WhatsAppThreadDetailData | null> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().getWhatsAppThreadDetail(params);
  }
  const db = getSnapshot();
  const nowMs = params.nowMs ?? Date.now();
  const threads = db.whatsappThreads ?? [];
  let thread: WhatsAppThread | undefined;

  if (params.threadId) {
    thread = threads.find((t) => t.id === params.threadId);
  } else if (params.phoneE164) {
    const canonical = canonicalizeWhatsAppPhoneE164(params.phoneE164);
    thread = threads.find(
      (t) =>
        (canonical && canonicalizeWhatsAppPhoneE164(t.phoneE164) === canonical) ||
        phonesMatchE164(t.phoneE164, params.phoneE164 ?? ''),
    );
  } else if (params.clientId) {
    thread = threads.find((t) => t.clientId === params.clientId);
  }

  if (!thread || !isThreadVisibleToActor(db, thread, params.role, params.staffMemberId)) {
    return null;
  }

  const limit = Math.max(1, Math.min(500, params.limit ?? 200));
  const messages = (db.whatsappMessages ?? [])
    .filter((m) => m.threadId === thread.id)
    .toSorted((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .slice(-limit)
    .map((m) => ({ ...m, templateParams: [...m.templateParams] }));

  const client = resolveClientForThread(db, thread);
  const { bookings } = resolveBookingsForThread(db, thread, nowMs);

  return {
    thread: buildThreadSummaryDTOFromDb(db, thread, nowMs),
    messages,
    client: client ? { ...client } : null,
    bookings,
  };
}

export async function getWhatsAppMessageById(
  messageId: string,
): Promise<WhatsAppMessage | null> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().getWhatsAppMessageById(messageId);
  }
  const db = getSnapshot();
  const found = (db.whatsappMessages ?? []).find((m) => m.id === messageId);
  return found ? { ...found, templateParams: [...found.templateParams] } : null;
}

export async function recordWhatsAppMessage(
  input: RecordWhatsAppMessageInput,
): Promise<{ thread: WhatsAppThread; message: WhatsAppMessage }> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().recordWhatsAppMessage(input);
  }
  const canonicalPhone =
    canonicalizeWhatsAppPhoneE164(input.phoneE164) ||
    normalizePhoneE164(input.phoneE164);
  if (!canonicalPhone) {
    throw new PolicyError('INVALID_PHONE', 'Número de WhatsApp inválido.');
  }
  const nowIso = input.createdAt ?? new Date().toISOString();
  const cleanProviderId = input.providerMessageId?.trim() || null;

  return withWriteLock((db) => {
    const cols = ensurePhase3Collections(db);
    if (cleanProviderId) {
      const existingMessage = cols.whatsappMessages.find(
        (m) => m.providerMessageId === cleanProviderId,
      );
      if (existingMessage) {
        const existingThread = cols.whatsappThreads.find(
          (t) => t.id === existingMessage.threadId,
        );
        if (existingThread) {
          return {
            thread: { ...existingThread },
            message: {
              ...existingMessage,
              templateParams: [...existingMessage.templateParams],
            },
          };
        }
      }
    }

    const matchedClient =
      (input.clientId ? db.clients.find((c) => c.id === input.clientId) : undefined) ??
      db.clients.find((c) => phonesMatchE164(c.phoneE164, canonicalPhone)) ??
      null;

    let thread = cols.whatsappThreads.find(
      (t) =>
        canonicalizeWhatsAppPhoneE164(t.phoneE164) === canonicalPhone ||
        phonesMatchE164(t.phoneE164, canonicalPhone),
    );

    if (!thread) {
      thread = {
        id: generateId('wth'),
        phoneE164: canonicalPhone,
        clientId: matchedClient?.id ?? input.clientId ?? null,
        contactName:
          input.contactName?.trim() || matchedClient?.fullName || canonicalPhone,
        lastMessageAt: null,
        lastMessagePreview: '',
        lastMessageDirection: null,
        lastInboundAt: null,
        unreadCount: 0,
        lastReadAt: null,
        hasFailedMessages: false,
        isArchived: false,
        assignedStaffId: input.assignedStaffId ?? null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      cols.whatsappThreads.unshift(thread);
    } else {
      thread.phoneE164 = canonicalPhone;
      if (!thread.clientId && (matchedClient?.id || input.clientId)) {
        thread.clientId = matchedClient?.id ?? input.clientId ?? null;
      }
      if (
        input.contactName?.trim() &&
        (!thread.contactName || thread.contactName === thread.phoneE164)
      ) {
        thread.contactName = input.contactName.trim();
      }
      if (input.assignedStaffId) {
        thread.assignedStaffId = input.assignedStaffId;
      }
    }

    const isSentOrBeyond =
      input.deliveryStatus === 'sent' ||
      input.deliveryStatus === 'delivered' ||
      input.deliveryStatus === 'read';
    const isDeliveredOrRead =
      input.deliveryStatus === 'delivered' || input.deliveryStatus === 'read';

    const message: WhatsAppMessage = {
      id: generateId('wmsg'),
      threadId: thread.id,
      phoneE164: canonicalPhone,
      clientId: thread.clientId ?? input.clientId ?? null,
      bookingId: input.bookingId ?? null,
      notificationId: input.notificationId ?? null,
      direction: input.direction,
      senderKind: input.senderKind,
      senderName: input.senderName?.trim() || null,
      messageType: input.messageType ?? 'text',
      bodyText: input.bodyText,
      templateName: input.templateName ?? null,
      templateTriggerKey: input.templateTriggerKey ?? null,
      templateParams: [...(input.templateParams ?? [])],
      deliveryStatus: input.deliveryStatus,
      deliveryMode: input.deliveryMode,
      providerMessageId: cleanProviderId,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      sentAt: isSentOrBeyond ? nowIso : null,
      deliveredAt: isDeliveredOrRead ? nowIso : null,
      readAt: input.deliveryStatus === 'read' ? nowIso : null,
      failedAt: input.deliveryStatus === 'failed' ? nowIso : null,
      createdAt: nowIso,
    };

    cols.whatsappMessages.push(message);

    const msgMs = Date.parse(nowIso);
    const currentLastMs = thread.lastMessageAt ? Date.parse(thread.lastMessageAt) : -Infinity;
    if (!thread.lastMessageAt || msgMs >= currentLastMs) {
      thread.lastMessageAt = nowIso;
      thread.lastMessagePreview = input.bodyText.trim().slice(0, 180);
      thread.lastMessageDirection = input.direction;
    }

    if (input.direction === 'inbound') {
      const currentInboundMs = thread.lastInboundAt
        ? Date.parse(thread.lastInboundAt)
        : -Infinity;
      if (!thread.lastInboundAt || msgMs >= currentInboundMs) {
        thread.lastInboundAt = nowIso;
      }
      thread.unreadCount += 1;
      thread.isArchived = false;
    }

    thread.hasFailedMessages = cols.whatsappMessages.some(
      (m) => m.threadId === thread.id && m.deliveryStatus === 'failed',
    );
    thread.updatedAt = nowIso;

    return {
      thread: { ...thread },
      message: { ...message, templateParams: [...message.templateParams] },
    };
  });
}

async function resolveRetriedWhatsAppMessage(
  input: ResolveRetriedWhatsAppMessageInput,
): Promise<{ thread: WhatsAppThread; message: WhatsAppMessage } | null> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().resolveRetriedWhatsAppMessage(input);
  }
  const atIso = input.atIso ?? new Date().toISOString();
  const cleanProviderId = input.providerMessageId?.trim() || null;

  return withWriteLock((db) => {
    const cols = ensurePhase3Collections(db);
    const msg = cols.whatsappMessages.find((m) => m.id === input.messageId);
    if (!msg) return null;
    const thread = cols.whatsappThreads.find((t) => t.id === msg.threadId);
    if (!thread) return null;

    msg.deliveryStatus = input.deliveryStatus;
    msg.deliveryMode = input.deliveryMode;
    msg.senderKind = 'staff';
    if (input.senderName?.trim()) {
      msg.senderName = input.senderName.trim();
    }
    if (cleanProviderId) {
      msg.providerMessageId = cleanProviderId;
    }

    if (input.deliveryStatus === 'sent') {
      msg.sentAt = atIso;
      msg.errorCode = null;
      msg.errorMessage = null;
      msg.failedAt = null;
    } else {
      msg.failedAt = atIso;
      msg.errorCode = input.errorCode ?? null;
      msg.errorMessage = input.errorMessage ?? null;
    }

    thread.hasFailedMessages = cols.whatsappMessages.some(
      (m) => m.threadId === thread.id && m.deliveryStatus === 'failed',
    );
    thread.updatedAt = atIso;

    return {
      thread: { ...thread },
      message: { ...msg, templateParams: [...msg.templateParams] },
    };
  });
}

export async function updateWhatsAppMessageStatusByProviderId(
  params: UpdateWhatsAppMessageStatusInput,
): Promise<{ updated: boolean; message: WhatsAppMessage | null; threadId: string | null }> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().updateWhatsAppMessageStatusByProviderId(params);
  }
  const cleanProviderId = params.providerMessageId?.trim() || null;
  const cleanMessageId = params.messageId?.trim() || null;
  if (!cleanProviderId && !cleanMessageId) {
    return { updated: false, message: null, threadId: null };
  }
  const atIso = params.atIso ?? new Date().toISOString();

  return withWriteLock((db) => {
    const cols = ensurePhase3Collections(db);
    const msg = cols.whatsappMessages.find(
      (m) =>
        (cleanProviderId && m.providerMessageId === cleanProviderId) ||
        (cleanMessageId && m.id === cleanMessageId),
    );

    if (!msg) {
      let notifMatched = false;
      if (cleanProviderId) {
        for (const notif of db.notifications) {
          if (notif.providerMessageId === cleanProviderId) {
            const currentAsDelivery = notif.deliveryStatus ?? (notif.status === 'sent' ? 'sent' : notif.status === 'failed' ? 'failed' : 'queued');
            const nextStatus = resolveNextDeliveryStatus(currentAsDelivery, params.status);
            if (nextStatus === 'failed') {
              notif.status = 'failed';
              notif.deliveryStatus = 'failed';
              notif.errorMessage = params.errorMessage ?? notif.errorMessage;
              notifMatched = true;
            } else if (nextStatus === 'sent' || nextStatus === 'delivered' || nextStatus === 'read') {
              notif.status = 'sent';
              notif.deliveryStatus = nextStatus;
              if (!notif.sentAt) notif.sentAt = atIso;
              notif.errorMessage = null;
              notif.nextRetryAt = null;
              notifMatched = true;
            }
          }
        }
      }
      return { updated: notifMatched, message: null, threadId: null };
    }

    const nextStatus = resolveNextDeliveryStatus(msg.deliveryStatus, params.status);
    const changed =
      nextStatus !== msg.deliveryStatus ||
      (nextStatus === 'failed' &&
        (Boolean(params.errorCode && params.errorCode !== msg.errorCode) ||
          Boolean(params.errorMessage && params.errorMessage !== msg.errorMessage)));

    if (!changed) {
      return {
        updated: false,
        message: { ...msg, templateParams: [...msg.templateParams] },
        threadId: msg.threadId,
      };
    }

    msg.deliveryStatus = nextStatus;
    if (nextStatus === 'sent') {
      if (!msg.sentAt) msg.sentAt = atIso;
    } else if (nextStatus === 'delivered') {
      if (!msg.sentAt) msg.sentAt = atIso;
      if (!msg.deliveredAt) msg.deliveredAt = atIso;
      msg.errorCode = null;
      msg.errorMessage = null;
      msg.failedAt = null;
    } else if (nextStatus === 'read') {
      if (!msg.sentAt) msg.sentAt = atIso;
      if (!msg.deliveredAt) msg.deliveredAt = atIso;
      if (!msg.readAt) msg.readAt = atIso;
      msg.errorCode = null;
      msg.errorMessage = null;
      msg.failedAt = null;
    } else if (nextStatus === 'failed') {
      msg.failedAt = atIso;
      msg.errorCode = params.errorCode ?? msg.errorCode;
      msg.errorMessage = params.errorMessage ?? msg.errorMessage;
    }

    const thread = cols.whatsappThreads.find((t) => t.id === msg.threadId);
    if (thread) {
      thread.hasFailedMessages = cols.whatsappMessages.some(
        (m) => m.threadId === thread.id && m.deliveryStatus === 'failed',
      );
      thread.updatedAt = atIso;
    }

    for (const notif of db.notifications) {
      const matchesNotif =
        (msg.notificationId && notif.id === msg.notificationId) ||
        (msg.providerMessageId && notif.providerMessageId === msg.providerMessageId);
      if (!matchesNotif) continue;
      if (nextStatus === 'failed') {
        notif.status = 'failed';
        notif.deliveryStatus = 'failed';
        notif.errorMessage = params.errorMessage ?? msg.errorMessage ?? notif.errorMessage;
      } else if (nextStatus === 'sent' || nextStatus === 'delivered' || nextStatus === 'read') {
        notif.status = 'sent';
        notif.deliveryStatus = nextStatus;
        if (!notif.sentAt) notif.sentAt = atIso;
        notif.errorMessage = null;
        notif.nextRetryAt = null;
      }
    }

    return {
      updated: true,
      message: { ...msg, templateParams: [...msg.templateParams] },
      threadId: msg.threadId,
    };
  });
}

export async function markWhatsAppThreadRead(
  threadId: string,
  atIso?: string,
): Promise<WhatsAppThread | null> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().markWhatsAppThreadRead(threadId, atIso);
  }
  const readAt = atIso ?? new Date().toISOString();
  return withWriteLock((db) => {
    const cols = ensurePhase3Collections(db);
    const thread = cols.whatsappThreads.find((t) => t.id === threadId);
    if (!thread) return null;
    thread.unreadCount = 0;
    thread.lastReadAt = readAt;
    thread.updatedAt = readAt;
    return { ...thread };
  });
}

export async function getWhatsAppThreadWindow(
  lookup: { threadId?: string; phoneE164?: string },
  nowMs = Date.now(),
): Promise<WhatsAppServiceWindowDTO> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().getWhatsAppThreadWindow(lookup, nowMs);
  }
  const db = getSnapshot();
  const threads = db.whatsappThreads ?? [];
  let thread: WhatsAppThread | undefined;
  if (lookup.threadId) {
    thread = threads.find((t) => t.id === lookup.threadId);
  } else if (lookup.phoneE164) {
    const canonical = canonicalizeWhatsAppPhoneE164(lookup.phoneE164);
    thread = threads.find(
      (t) =>
        (canonical && canonicalizeWhatsAppPhoneE164(t.phoneE164) === canonical) ||
        phonesMatchE164(t.phoneE164, lookup.phoneE164 ?? ''),
    );
  }
  return computeWhatsAppServiceWindow(thread?.lastInboundAt ?? null, nowMs);
}

export async function getWhatsAppUnreadSummary(params?: {
  role?: AdminRole;
  staffMemberId?: string | null;
  nowMs?: number;
}): Promise<WhatsAppInboxSummaryDTO> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().getWhatsAppUnreadSummary(params);
  }
  const db = getSnapshot();
  const nowMs = params?.nowMs ?? Date.now();
  const visibleSummaries = (db.whatsappThreads ?? [])
    .filter(
      (t) =>
        !t.isArchived &&
        isThreadVisibleToActor(db, t, params?.role, params?.staffMemberId),
    )
    .map((t) => buildThreadSummaryDTOFromDb(db, t, nowMs));
  return computeDemoInboxSummary(
    db,
    visibleSummaries,
    params?.role,
    params?.staffMemberId,
  );
}

export async function listScheduledNotifications(
  params?: ListScheduledNotificationsParams,
): Promise<WhatsAppReminderItemDTO[]> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().listScheduledNotifications(params);
  }
  const db = getSnapshot();
  const limit = Math.max(1, Math.min(200, params?.limit ?? 100));

  const filtered = db.notifications.filter((n) => {
    if (!isNotificationVisibleToActor(db, n, params?.role, params?.staffMemberId)) {
      return false;
    }
    if (params?.status && n.status !== params.status) return false;
    if (params?.channel && n.channel !== params.channel) return false;
    if (params?.bookingId && n.bookingId !== params.bookingId) return false;
    return true;
  });

  const sorted =
    params?.status === 'pending'
      ? filtered.toSorted(
          (a, b) => Date.parse(a.scheduledFor) - Date.parse(b.scheduledFor),
        )
      : filtered.toSorted((a, b) => {
          const aKey = Date.parse(a.sentAt ?? a.scheduledFor ?? a.createdAt);
          const bKey = Date.parse(b.sentAt ?? b.scheduledFor ?? b.createdAt);
          return bKey - aKey;
        });

  return sorted.slice(0, limit).map((item) => {
    const booking = item.bookingId
      ? db.bookings.find((b) => b.id === item.bookingId)
      : undefined;
    const client =
      (booking ? db.clients.find((c) => c.id === booking.clientId) : undefined) ??
      (item.clientId ? db.clients.find((c) => c.id === item.clientId) : undefined) ??
      db.clients.find((c) => phonesMatchE164(c.phoneE164, item.recipient));
    const staff = booking ? db.staff.find((s) => s.id === booking.staffId) : undefined;
    const service = booking
      ? db.services.find((s) => s.id === booking.serviceId)
      : undefined;
    const workflow = item.workflowId
      ? db.workflows.find((w) => w.id === item.workflowId)
      : undefined;

    const deliveryStatus =
      item.deliveryStatus ??
      (item.status === 'sent'
        ? 'sent'
        : item.status === 'failed'
          ? 'failed'
          : item.status === 'pending'
            ? 'queued'
            : null);

    return {
      id: item.id,
      bookingId: item.bookingId,
      bookingCode: booking?.bookingCode ?? null,
      clientId: client?.id ?? item.clientId ?? null,
      clientName: client?.fullName ?? null,
      staffName: staff?.name ?? null,
      serviceName: service?.name ?? null,
      bookingStartAt: booking?.startAt ?? null,
      workflowId: item.workflowId,
      workflowName: workflow?.name ?? null,
      triggerKey: inferReminderTriggerKey(workflow, item, booking),
      channel: item.channel,
      recipient: item.recipient,
      scheduledFor: item.scheduledFor,
      status: item.status,
      deliveryStatus,
      subject: item.subject,
      previewText: item.previewText,
      bodyText: item.bodyText || item.previewText,
      providerMessageId: item.providerMessageId,
      errorMessage: item.errorMessage,
      attempts: item.attempts ?? (item.status === 'pending' ? 0 : 1),
      maxAttempts: item.maxAttempts ?? 3,
      nextRetryAt: item.nextRetryAt ?? null,
      lastAttemptAt: item.lastAttemptAt ?? null,
      sentAt: item.sentAt,
      createdAt: item.createdAt,
    };
  });
}

export async function getScheduledNotificationById(
  id: string,
): Promise<ScheduledNotification | null> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().getScheduledNotificationById(id);
  }
  const db = getSnapshot();
  const found = db.notifications.find((n) => n.id === id);
  return found ? { ...found } : null;
}

export async function retryScheduledNotification(
  id: string,
  atIso?: string,
): Promise<ScheduledNotification> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().retryScheduledNotification(id, atIso);
  }
  const scheduledAt = atIso ?? new Date().toISOString();
  return withWriteLock((db) => {
    const item = db.notifications.find((n) => n.id === id);
    if (!item) {
      throw new PolicyError('NOTIFICATION_NOT_FOUND', 'Recordatorio no encontrado.');
    }
    item.status = 'pending';
    item.deliveryStatus = 'queued';
    item.errorMessage = null;
    item.scheduledFor = scheduledAt;
    item.nextRetryAt = null;
    item.maxAttempts = Math.max(item.maxAttempts ?? 3, (item.attempts ?? 0) + 1);
    return { ...item };
  });
}

export async function cancelScheduledNotification(
  id: string,
  reason?: string,
): Promise<ScheduledNotification> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().cancelScheduledNotification(id, reason);
  }
  return withWriteLock((db) => {
    const item = db.notifications.find((n) => n.id === id);
    if (!item) {
      throw new PolicyError('NOTIFICATION_NOT_FOUND', 'Recordatorio no encontrado.');
    }
    item.status = 'canceled';
    item.nextRetryAt = null;
    if (reason?.trim()) {
      item.errorMessage = reason.trim();
    }
    return { ...item };
  });
}

export async function updateScheduledNotificationStatus(
  id: string,
  patch: UpdateScheduledNotificationStatusInput,
): Promise<ScheduledNotification | null> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().updateScheduledNotificationStatus(id, patch);
  }
  return withWriteLock((db) => {
    const item = db.notifications.find((n) => n.id === id);
    if (!item) return null;
    item.status = patch.status;
    if (patch.deliveryStatus !== undefined) item.deliveryStatus = patch.deliveryStatus;
    if (patch.providerMessageId !== undefined) {
      item.providerMessageId = patch.providerMessageId;
    }
    if (patch.errorMessage !== undefined) item.errorMessage = patch.errorMessage;
    if (patch.sentAt !== undefined) item.sentAt = patch.sentAt;
    if (patch.attempts !== undefined) item.attempts = patch.attempts;
    if (patch.nextRetryAt !== undefined) item.nextRetryAt = patch.nextRetryAt;
    if (patch.lastAttemptAt !== undefined) item.lastAttemptAt = patch.lastAttemptAt;
    return { ...item };
  });
}

export async function updateNotificationWorkflow(
  id: string,
  patch: Partial<NotificationWorkflow>,
): Promise<NotificationWorkflow> {
  return updateWorkflow(id, patch);
}

export async function getOutboxSummary(): Promise<OutboxSummary> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().getOutboxSummary();
  }
  const store = getDemoOutboxStore();
  let pendingCount = 0;
  let processingCount = 0;
  let failedCount = 0;
  let processedCount = 0;
  for (const ev of store) {
    if (ev.status === 'pending') pendingCount += 1;
    else if (ev.status === 'processing') processingCount += 1;
    else if (ev.status === 'failed') failedCount += 1;
    else if (ev.status === 'processed') processedCount += 1;
  }
  return { pendingCount, processingCount, failedCount, processedCount };
}

export async function drainStaleOutboxEvents(
  olderThanMs = 5 * 60_000,
  nowMs = Date.now(),
): Promise<{ drainedCount: number }> {
  if (isSupabaseEnabled()) {
    return createSupabaseRepository().drainStaleOutboxEvents(olderThanMs, nowMs);
  }
  const cutoffMs = nowMs - Math.max(0, olderThanMs);
  const nowIso = new Date(nowMs).toISOString();
  let drainedCount = 0;
  for (const ev of getDemoOutboxStore()) {
    if (ev.status !== 'processing') continue;
    const refMs = Date.parse(ev.availableAt || ev.createdAt);
    if (Number.isFinite(refMs) && refMs <= cutoffMs) {
      ev.status = 'pending';
      ev.availableAt = nowIso;
      drainedCount += 1;
    }
  }
  return { drainedCount };
}

function createDemoRepository(clock: Clock = systemClock): SalonRepository {
  return {
    async getSalonSettings() {
      return getSnapshot().settings;
    },
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
          .filter((s) => s.isActive && !s.isPrivate)
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
    async getPublicServiceBySlug(slug: string) {
      const trimmed = slug.trim();
      if (!trimmed) return null;
      const found = getSnapshot().services.find(
        (s) => s.isActive && s.slug === trimmed,
      );
      return found ? toPublicServiceDTO(found) : null;
    },
    async getPublicReviewsForService(
      serviceId: string | null,
    ): Promise<PublicServiceReviewsData> {
      const db = getSnapshot();
      const bookingById = new Map(db.bookings.map((b) => [b.id, b]));
      const clientById = new Map(db.clients.map((c) => [c.id, c]));

      const studioReviews: PublicReviewDTO[] = db.reviews
        .flatMap((review) => {
          const booking = bookingById.get(review.bookingId);
          if (!booking || booking.status !== 'completed') {
            return [];
          }
          const client = clientById.get(review.clientId ?? booking.clientId);
          return [
            toPublicReviewDTO(review, {
              serviceId: booking.serviceId,
              clientFullName: client?.fullName ?? null,
            }),
          ];
        })
        .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));

      const serviceReviews: PublicReviewDTO[] = serviceId
        ? db.reviews
            .flatMap((review) => {
              const booking = bookingById.get(review.bookingId);
              if (!booking || booking.status !== 'completed') {
                return [];
              }
              const matchesService =
                booking.serviceId === serviceId ||
                Boolean(booking.extraServiceIds?.includes(serviceId));
              if (!matchesService) {
                return [];
              }
              const client = clientById.get(review.clientId ?? booking.clientId);
              return [
                toPublicReviewDTO(review, {
                  serviceId,
                  clientFullName: client?.fullName ?? null,
                }),
              ];
            })
            .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
        : [];

      return { studioReviews, serviceReviews };
    },
    async getClientPortalRecordByPhone(
      phoneE164: string,
    ): Promise<ClientPortalRecordData> {
      const normalized = normalizePhoneE164(phoneE164);
      if (!normalized) {
        return { client: null, latestBooking: null };
      }
      const db = getSnapshot();
      const client =
        db.clients.find((entry) => phonesMatchE164(entry.phoneE164, normalized)) ??
        null;
      if (!client) {
        return { client: null, latestBooking: null };
      }
      let latestBooking: ClientPortalRecordData['latestBooking'] = null;
      let latestStartMs = -Infinity;
      for (const booking of db.bookings) {
        if (booking.clientId !== client.id) continue;
        if (booking.status === 'canceled') continue;
        const startMs = Date.parse(booking.startAt);
        const score = Number.isFinite(startMs) ? startMs : 0;
        if (!latestBooking || score > latestStartMs) {
          latestBooking = {
            clientId: booking.clientId,
            serviceId: booking.serviceId,
            staffId: booking.staffId,
            status: booking.status,
            startAt: booking.startAt,
          };
          latestStartMs = score;
        }
      }
      return { client: { ...client }, latestBooking };
    },
    async getClientPortalSnapshotByPhone(phoneE164: string) {
      return computeClientPortalSnapshotByPhone(getSnapshot(), phoneE164);
    },
    async upsertClientPortalProfileByPhone(
      params: UpsertClientPortalProfileInput,
    ): Promise<ClientPortalRecordData> {
      const normalized = normalizePhoneE164(params.phoneE164);
      if (!normalized) {
        throw new PolicyError('INVALID_PHONE', 'Escribe un WhatsApp válido de 10 dígitos.');
      }
      const trimmedName = params.fullName.trim();
      if (trimmedName.length < 2) {
        throw new PolicyError('INVALID_CLIENT_NAME', 'Escribe tu nombre completo.');
      }
      const cleanEmail =
        params.email === undefined ? undefined : params.email?.trim() || null;
      const cleanInstagram =
        params.instagramHandle === undefined
          ? undefined
          : normalizeInstagramHandle(params.instagramHandle);
      const cleanBirthday =
        params.birthday === undefined ? undefined : params.birthday?.trim() || null;

      return withWriteLock((db) => {
        const nowIso = clock.now().toISOString();
        const existing = db.clients.find((entry) =>
          phonesMatchE164(entry.phoneE164, normalized),
        );
        let savedClient: ClientProfile;
        if (existing) {
          existing.fullName = trimmedName;
          if (cleanEmail !== undefined) existing.email = cleanEmail;
          if (cleanInstagram !== undefined) {
            existing.instagramHandle = cleanInstagram ?? undefined;
          }
          if (cleanBirthday !== undefined) existing.birthday = cleanBirthday;
          existing.updatedAt = nowIso;
          savedClient = existing;
        } else {
          savedClient = {
            id: generateId('cli', clock),
            fullName: trimmedName,
            phoneE164: normalized,
            email: cleanEmail ?? null,
            instagramHandle: cleanInstagram ?? undefined,
            birthday: cleanBirthday ?? null,
            notes: '',
            noShowCount: 0,
            createdAt: nowIso,
            updatedAt: nowIso,
          };
          db.clients.push(savedClient);
        }

        let latestBooking: ClientPortalRecordData['latestBooking'] = null;
        let latestStartMs = -Infinity;
        for (const booking of db.bookings) {
          if (booking.clientId !== savedClient.id) continue;
          if (booking.status === 'canceled') continue;
          const startMs = Date.parse(booking.startAt);
          const score = Number.isFinite(startMs) ? startMs : 0;
          if (!latestBooking || score > latestStartMs) {
            latestBooking = {
              clientId: booking.clientId,
              serviceId: booking.serviceId,
              staffId: booking.staffId,
              status: booking.status,
              startAt: booking.startAt,
            };
            latestStartMs = score;
          }
        }
        return { client: { ...savedClient }, latestBooking };
      });
    },
    async getNotificationWorkflows() {
      return [...getSnapshot().workflows];
    },
    async findApprovedBookingPayment(provider, providerPaymentId) {
      const trimmed = providerPaymentId.trim();
      if (!trimmed) return null;
      const found = (getSnapshot().bookingPayments ?? []).find(
        (entry) =>
          entry.provider === provider &&
          entry.providerPaymentId === trimmed &&
          entry.status === 'approved',
      );
      return found ? { bookingId: found.bookingId } : null;
    },
    async getCalendarConnectionByWatchChannelId(channelId) {
      const trimmed = channelId.trim();
      if (!trimmed) return null;
      return (
        getSnapshot().calendarConnections.find(
          (c) => c.watchChannelId === trimmed && c.isConnected,
        ) ?? null
      );
    },
    async staffMemberExists(staffId) {
      const trimmed = staffId.trim();
      if (!trimmed) return false;
      return getSnapshot().staff.some((s) => s.id === trimmed);
    },
    async getWhatsAppContactContextByPhones(
      phones: string[],
    ): Promise<WhatsAppContactContextData> {
      const normalizedPhones = Array.from(
        new Set(phones.map((p) => normalizePhoneE164(p)).filter(Boolean)),
      );
      if (normalizedPhones.length === 0) {
        return { clients: [], bookings: [] };
      }
      const db = getSnapshot();
      const clients = db.clients.filter((client) =>
        normalizedPhones.some((phone) => phonesMatchE164(client.phoneE164, phone)),
      );
      if (clients.length === 0) {
        return { clients: [], bookings: [] };
      }
      const clientIds = new Set(clients.map((c) => c.id));
      const bookings = db.bookings.filter(
        (booking) =>
          clientIds.has(booking.clientId) && isActiveBookingStatus(booking.status),
      );
      return { clients, bookings };
    },
    async getBookingsWithRelations(filter) {
      return getBookingsWithRelations(filter);
    },
    async getAdminBookingsRange(filter) {
      return getAdminBookingsRangeFromDemo(filter);
    },
    async getExecutiveReportData(options) {
      return getExecutiveReportDataFromDemo(options);
    },
    async getBookingByToken(token) {
      return getBookingByToken(token);
    },
    async queryAvailability(params) {
      return queryAvailability(params);
    },
    async quickSearchAvailability(params) {
      return computeQuickSearchAvailability(getSnapshot(), params);
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
    upsertServiceCategory,
    upsertAddon,
    saveStaffSchedule,
    addDateOverride,
    deleteDateOverride,
    upsertStaffMember,
    upsertAdminUser,
    async listClients() {
      return [...getSnapshot().clients];
    },
    async getNearRewardClients() {
      return computeNearRewardClientsFromDb(getSnapshot());
    },
    async getInactiveClients(inactiveDays) {
      return computeInactiveClientsFromDb(getSnapshot(), inactiveDays, clock.nowMs());
    },
    async getClientArcoExport(clientId) {
      return computeClientArcoExportFromDb(
        getSnapshot(),
        clientId,
        clock.now().toISOString(),
      );
    },
    updateClientNotes,
    deleteClientProfile,
    addWaitlistEntry,
    updateWaitlistStatus,
    submitBookingReview,
    upsertCoupon,
    deleteCoupon,
    adjustInventoryItem,
    addCashEntry,
    updateCashEntry,
    deleteCashEntry,
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
    registerMediaAsset,
    getMediaAccessOwner,
    listMediaAssetsForRetention,
    markMediaRetentionWarned,
    markMediaAssetPurged,
    getWhatsAppTemplates,
    updateWhatsAppTemplate,
    updateNotificationDeliveryByProviderId,
    getWhatsAppMonthlyUsage,
    incrementWhatsAppMonthlyUsage,
    claimWebhookEventIdempotent,
    cleanupExpiredSlotHolds,
    listWhatsAppThreads,
    getWhatsAppThreadDetail,
    getWhatsAppMessageById,
    recordWhatsAppMessage,
    resolveRetriedWhatsAppMessage,
    updateWhatsAppMessageStatusByProviderId,
    markWhatsAppThreadRead,
    getWhatsAppThreadWindow,
    getWhatsAppUnreadSummary,
    listScheduledNotifications,
    getScheduledNotificationById,
    retryScheduledNotification,
    cancelScheduledNotification,
    updateScheduledNotificationStatus,
    updateNotificationWorkflow,
    getOutboxSummary,
    drainStaleOutboxEvents,
  };
}

export async function confirmBookingAttendanceFromWebhook(params: {
  bookingId?: string | null;
  phoneE164?: string | null;
  via: 'whatsapp' | 'email';
}): Promise<BookingWithRelations | null> {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const normalizedPhone = params.phoneE164
    ? normalizePhoneE164(params.phoneE164)
    : '';

  if (isSupabaseEnabled()) {
    const repo = createSupabaseRepository();
    const supabase = createSupabaseAdminClient();
    let targetBookingId: string | null = null;

    if (params.bookingId) {
      const bookingRes = await supabase
        .from('bookings')
        .select('id, client_id, status')
        .eq('id', params.bookingId)
        .maybeSingle();
      const row = bookingRes.data;
      if (row && isActiveBookingStatus(row.status)) {
        if (!normalizedPhone) {
          targetBookingId = row.id;
        } else {
          const clientRes = await supabase
            .from('clients')
            .select('phone_e164')
            .eq('id', row.client_id)
            .maybeSingle();
          if (
            clientRes.data &&
            phonesMatchE164(clientRes.data.phone_e164, normalizedPhone)
          ) {
            targetBookingId = row.id;
          }
        }
      }
    } else if (normalizedPhone) {
      const matchedClientIds = await fetchSupabaseClientIdsByPhone(
        normalizedPhone,
        supabase,
      );
      if (matchedClientIds.length > 0) {
        const upcomingRes = await supabase
          .from('bookings')
          .select('id, status, start_at, end_at')
          .in('client_id', matchedClientIds)
          .in('status', ['pending_payment', 'pending_confirmation', 'confirmed'])
          .gte('end_at', nowIso)
          .order('start_at', { ascending: true })
          .limit(1);
        targetBookingId = upcomingRes.data?.[0]?.id ?? null;
      }
    }

    if (!targetBookingId) return null;
    await supabase
      .from('bookings')
      .update({
        attendance_status: 'confirmed',
        attendance_confirmed_at: nowIso,
        confirmed_via: params.via,
        updated_at: nowIso,
      })
      .eq('id', targetBookingId);
    const [settings, hydrated] = await Promise.all([
      repo.getSalonSettings(),
      fetchSupabaseBookingById(targetBookingId, supabase),
    ]);
    if (!hydrated) return null;
    publishRealtimeEvent('booking_updated', {
      staffId: hydrated.staffId,
      date: getDateKeyInTimezone(new Date(hydrated.startAt), settings.timezone),
    });
    return hydrated;
  }

  const result = await withWriteLock((db) => {
    const matchesSender = (clientId: string) => {
      if (!normalizedPhone) return false;
      const client = db.clients.find((c) => c.id === clientId);
      return Boolean(client && phonesMatchE164(client.phoneE164, normalizedPhone));
    };
    const target = params.bookingId
      ? db.bookings.find(
          (b) =>
            b.id === params.bookingId &&
            isActiveBookingStatus(b.status) &&
            (normalizedPhone ? matchesSender(b.clientId) : true),
        )
      : db.bookings
          .filter((b) => {
            if (!isActiveBookingStatus(b.status)) return false;
            if (new Date(b.endAt).getTime() < nowMs) return false;
            return matchesSender(b.clientId);
          })
          .toSorted(
            (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
          )[0];

    if (!target) return null;
    target.attendanceStatus = 'confirmed';
    target.attendanceConfirmedAt = nowIso;
    target.confirmedVia = params.via;
    target.updatedAt = nowIso;
    return hydrateBooking(db, target);
  });

  if (result) {
    publishRealtimeEvent('booking_updated', {
      staffId: result.staffId,
      date: getDateKeyInTimezone(new Date(result.startAt), 'America/Mexico_City'),
    });
  }
  return result;
}

export async function rejectBookingDeposit(params: {
  bookingId: string;
  reason?: string;
  actor: AuditActor;
}): Promise<BookingWithRelations> {
  const cleanReason =
    params.reason?.trim() ||
    'No pudimos validar tu comprobante. Por favor sube una imagen clara o pega el enlace de tu recibo.';
  const nowIso = new Date().toISOString();
  const env = getRuntimeIntegrationStatus();

  if (isSupabaseEnabled()) {
    const repo = createSupabaseRepository();
    const supabase = createSupabaseAdminClient();
    const [booking, settings] = await Promise.all([
      fetchSupabaseBookingById(params.bookingId),
      repo.getSalonSettings(),
    ]);
    if (!booking) {
      throw new PolicyError('BOOKING_NOT_FOUND', 'Cita no encontrada.');
    }
    if (
      booking.status !== 'pending_confirmation' &&
      booking.status !== 'pending_payment'
    ) {
      throw new PolicyError(
        'INVALID_STATE',
        'Solo se puede rechazar el comprobante de citas pendientes por confirmar.',
      );
    }
    const { error } = await supabase
      .from('bookings')
      .update({
        payment_proof_url: null,
        proof_delivery_method: 'none',
        proof_rejected_at: nowIso,
        proof_rejection_reason: cleanReason,
        updated_at: nowIso,
      })
      .eq('id', booking.id);
    if (error) {
      throw new PolicyError('REJECT_DEPOSIT_FAILED', error.message);
    }
    await repo.writeAuditLog({
      actorId: params.actor.id,
      actorEmail: params.actor.email,
      actorRole: params.actor.role,
      action: 'deposit_rejected',
      entityType: 'booking',
      entityId: booking.id,
      metadata: {
        bookingCode: booking.bookingCode,
        reason: cleanReason,
      },
    });
    const hydrated: BookingWithRelations = {
      ...booking,
      paymentProofUrl: null,
      proofDeliveryMethod: 'none',
      proofRejectedAt: nowIso,
      proofRejectionReason: cleanReason,
      updatedAt: nowIso,
    };
    publishRealtimeEvent('booking_updated', {
      staffId: hydrated.staffId,
      date: getDateKeyInTimezone(new Date(hydrated.startAt), settings.timezone),
    });
    const postCommitTask = (async () => {
      const notifyRes = await dispatchDepositRejectedNotification({
        booking: hydrated,
        settings,
        appUrl: env.appUrl,
        reason: cleanReason,
      });
      const bodyText = `Solicitamos un nuevo comprobante: ${cleanReason}`;
      await supabase.from('scheduled_notifications').insert({
        booking_id: hydrated.id,
        client_id: hydrated.clientId,
        workflow_id: null,
        trigger_key: 'deposit_rejected',
        channel: 'whatsapp',
        recipient: hydrated.client.phoneE164,
        scheduled_for: nowIso,
        status: notifyRes.status,
        delivery_status: notifyRes.status === 'sent' ? 'sent' : 'failed',
        subject: `Comprobante rechazado (${hydrated.bookingCode})`,
        preview_text: bodyText.slice(0, 160),
        body_text: bodyText,
        provider_message_id: notifyRes.providerMessageId,
        error_message: notifyRes.errorMessage,
        attempts: 1,
        max_attempts: 3,
        next_retry_at: null,
        last_attempt_at: nowIso,
        sent_at: notifyRes.status === 'sent' ? nowIso : null,
      });
    })();
    await runPostCommitSideEffects(postCommitTask);
    return hydrated;
  }

  const committed = await withWriteLock((db) => {
    const booking = db.bookings.find((b) => b.id === params.bookingId);
    if (!booking) {
      throw new PolicyError('BOOKING_NOT_FOUND', 'Cita no encontrada.');
    }
    if (
      booking.status !== 'pending_confirmation' &&
      booking.status !== 'pending_payment'
    ) {
      throw new PolicyError(
        'INVALID_STATE',
        'Solo se puede rechazar el comprobante de citas pendientes por confirmar.',
      );
    }
    booking.paymentProofUrl = null;
    booking.proofDeliveryMethod = 'none';
    booking.proofRejectedAt = nowIso;
    booking.proofRejectionReason = cleanReason;
    booking.updatedAt = nowIso;
    appendAuditLog(db, {
      actor: params.actor,
      action: 'deposit_rejected',
      entityType: 'booking',
      entityId: booking.id,
      metadata: {
        bookingCode: booking.bookingCode,
        reason: cleanReason,
      },
    });
    return {
      hydrated: hydrateBooking(db, booking),
      settings: { ...db.settings },
    };
  });

  const notifyRes = await dispatchDepositRejectedNotification({
    booking: committed.hydrated,
    settings: committed.settings,
    appUrl: env.appUrl,
    reason: cleanReason,
  });

  await withWriteLock((liveDb) => {
    const bodyText = `Solicitamos un nuevo comprobante: ${cleanReason}`;
    liveDb.notifications.unshift({
      id: generateId('ntf'),
      bookingId: committed.hydrated.id,
      clientId: committed.hydrated.clientId,
      workflowId: null,
      triggerKey: 'deposit_rejected',
      channel: 'whatsapp',
      recipient: committed.hydrated.client.phoneE164,
      scheduledFor: nowIso,
      status: notifyRes.status,
      deliveryStatus: notifyRes.status === 'sent' ? 'sent' : 'failed',
      subject: `Comprobante rechazado (${committed.hydrated.bookingCode})`,
      previewText: bodyText.slice(0, 160),
      bodyText,
      providerMessageId: notifyRes.providerMessageId,
      errorMessage: notifyRes.errorMessage,
      attempts: 1,
      maxAttempts: 3,
      nextRetryAt: null,
      lastAttemptAt: nowIso,
      sentAt: notifyRes.status === 'sent' ? nowIso : null,
      createdAt: nowIso,
    });
  });

  publishRealtimeEvent('booking_updated', {
    staffId: committed.hydrated.staffId,
    date: getDateKeyInTimezone(
      new Date(committed.hydrated.startAt),
      committed.settings.timezone,
    ),
  });
  return committed.hydrated;
}

export async function processExpiredWaitlistOffers(
  nowMs = Date.now(),
): Promise<{ expiredCount: number; rolledOverCount: number }> {
  const nowIso = new Date(nowMs).toISOString();
  const dispatches: WaitlistOfferDispatchPayload[] = [];
  let expiredCount = 0;

  if (isSupabaseEnabled()) {
    const supabase = createSupabaseAdminClient();
    const context = await fetchSupabaseOverdueWaitlistContext(nowIso, supabase);
    if (!context) {
      return { expiredCount: 0, rolledOverCount: 0 };
    }

    const mutableWaitlist = [
      ...context.overdue.map((w) => ({ ...w })),
      ...context.waiting.map((w) => ({ ...w })),
    ];
    for (const entry of context.overdue) {
      await supabase
        .from('waitlist_entries')
        .update({ status: 'expired' })
        .eq('id', entry.id)
        .eq('status', 'notified');
      const localEntry = mutableWaitlist.find((w) => w.id === entry.id);
      if (localEntry) localEntry.status = 'expired';
      expiredCount += 1;

      const slotStartAt = entry.priorityOfferSlotStartAt;
      if (!slotStartAt || new Date(slotStartAt).getTime() <= nowMs) continue;
      const service = context.services.find((s) => s.id === entry.serviceId);
      if (!service) continue;
      const staffId = entry.priorityOfferStaffId ?? entry.preferredStaffId ?? null;
      const slotStartMs = new Date(slotStartAt).getTime();
      const slotEndMs = slotStartMs + service.durationMinutes * 60_000;
      const slotOccupied = context.activeBookings.some(
        (b) =>
          isActiveBookingStatus(b.status) &&
          (!staffId || b.staffId === staffId) &&
          new Date(b.occupiedStartAt).getTime() < slotEndMs &&
          new Date(b.occupiedEndAt).getTime() > slotStartMs,
      );
      if (slotOccupied) continue;

      const tz = context.settings.timezone || 'America/Mexico_City';
      const dateKey = getDateKeyInTimezone(new Date(slotStartAt), tz);
      const nextCandidate = selectNextWaitlistCandidate(mutableWaitlist, {
        serviceId: entry.serviceId,
        staffId,
        dateKey,
        nowMs,
      });
      if (!nextCandidate) continue;

      const offerToken = generateId('wlo');
      const offerExpiresAt = new Date(
        nowMs + WAITLIST_OFFER_TTL_MINUTES * 60_000,
      ).toISOString();
      const resolvedStaffId =
        staffId ??
        nextCandidate.preferredStaffId ??
        context.staff.find((s) => s.isActive)?.id ??
        '';
      await supabase
        .from('waitlist_entries')
        .update({
          status: 'notified',
          notified_at: nowIso,
          priority_offer_token: offerToken,
          priority_offer_expires_at: offerExpiresAt,
          priority_offer_slot_start_at: slotStartAt,
          priority_offer_staff_id: resolvedStaffId || null,
        })
        .eq('id', nextCandidate.id)
        .eq('status', 'waiting');

      nextCandidate.status = 'notified';
      nextCandidate.notifiedAt = nowIso;
      nextCandidate.priorityOfferToken = offerToken;
      nextCandidate.priorityOfferExpiresAt = offerExpiresAt;
      nextCandidate.priorityOfferSlotStartAt = slotStartAt;
      nextCandidate.priorityOfferStaffId = resolvedStaffId || null;

      const staff = context.staff.find((s) => s.id === resolvedStaffId);
      const matchedClient = context.clients.find((c) =>
        phonesMatchE164(c.phoneE164, nextCandidate.clientPhoneE164),
      );
      dispatches.push({
        entryId: nextCandidate.id,
        bookingId: null,
        clientId: matchedClient?.id ?? null,
        clientName: nextCandidate.clientName,
        clientPhoneE164: nextCandidate.clientPhoneE164,
        clientEmail: nextCandidate.clientEmail ?? matchedClient?.email ?? null,
        serviceName: service.name,
        serviceSlug: service.slug,
        staffName: staff?.name ?? 'Profesional',
        slotStartAt,
        dateKey,
        offerToken,
        offerExpiresAt,
        settings: { ...context.settings },
      });
    }

    for (const offer of dispatches) {
      await dispatchWaitlistPriorityOffer(offer);
    }
    return { expiredCount, rolledOverCount: dispatches.length };
  }

  await withWriteLock((db) => {
    const overdue = db.waitlist.filter((entry) => {
      if (entry.status !== 'notified' || !entry.priorityOfferExpiresAt) return false;
      const expMs = new Date(entry.priorityOfferExpiresAt).getTime();
      return Number.isFinite(expMs) && expMs <= nowMs;
    });

    for (const entry of overdue) {
      entry.status = 'expired';
      expiredCount += 1;

      const slotStartAt = entry.priorityOfferSlotStartAt;
      if (!slotStartAt || new Date(slotStartAt).getTime() <= nowMs) continue;
      const service = db.services.find((s) => s.id === entry.serviceId);
      if (!service) continue;
      const staffId =
        entry.priorityOfferStaffId ??
        entry.preferredStaffId ??
        db.staff.find((s) => s.isActive)?.id;
      if (!staffId) continue;

      const slotStartMs = new Date(slotStartAt).getTime();
      const slotEndMs = slotStartMs + service.durationMinutes * 60_000;
      const slotOccupied = db.bookings.some(
        (b) =>
          isActiveBookingStatus(b.status) &&
          b.staffId === staffId &&
          new Date(b.occupiedStartAt).getTime() < slotEndMs &&
          new Date(b.occupiedEndAt).getTime() > slotStartMs,
      );
      if (slotOccupied) continue;

      const nextOffer = assignWaitlistPriorityOfferInLock(
        db,
        {
          id: null,
          serviceId: entry.serviceId,
          staffId,
          startAt: slotStartAt,
        },
        nowMs,
      );
      if (nextOffer) {
        dispatches.push(nextOffer);
      }
    }
  });

  for (const offer of dispatches) {
    await dispatchWaitlistPriorityOffer(offer);
  }
  return { expiredCount, rolledOverCount: dispatches.length };
}

export async function processProactiveTouchUpInvites(
  nowMs = Date.now(),
): Promise<{ eligibleCount: number; sentCount: number }> {
  const MIN_AGE_MS = 18 * 86_400_000;
  const MAX_AGE_MS = 25 * 86_400_000;
  const nowIso = new Date(nowMs).toISOString();
  const env = getRuntimeIntegrationStatus();

  interface TouchUpTarget {
    hydrated: BookingWithRelations;
    touchUpUrl: string;
    settings: SalonSettings;
  }

  const collectEligible = (db: Readonly<DemoDatabase>): TouchUpTarget[] => {
    const touchUpEnabled = db.workflows.some(
      (w) =>
        w.triggerEvent === 'after_booking' &&
        w.offsetMinutes >= 1440 &&
        w.isEnabled,
    );
    if (!touchUpEnabled) return [];

    const tz = db.settings.timezone || 'America/Mexico_City';
    const targets: TouchUpTarget[] = [];
    const seenClientIds = new Set<string>();

    const candidates = db.bookings
      .filter((b) => {
        if (b.status !== 'completed' || b.touchupInvitedAt) return false;
        const endMs = new Date(b.endAt).getTime();
        if (!Number.isFinite(endMs)) return false;
        const ageMs = nowMs - endMs;
        return ageMs >= MIN_AGE_MS && ageMs <= MAX_AGE_MS;
      })
      .toSorted((a, b) => new Date(b.endAt).getTime() - new Date(a.endAt).getTime());

    for (const booking of candidates) {
      if (seenClientIds.has(booking.clientId)) continue;
      const bookingEndMs = new Date(booking.endAt).getTime();
      const hasNewerBooking = db.bookings.some(
        (other) =>
          other.id !== booking.id &&
          other.clientId === booking.clientId &&
          other.status !== 'canceled' &&
          other.status !== 'no_show' &&
          new Date(other.startAt).getTime() > bookingEndMs,
      );
      if (hasNewerBooking) continue;

      seenClientIds.add(booking.clientId);
      const hydrated = hydrateBooking(db, booking);
      const suggestedDateKey = computeSuggestedTouchUpDateKey({
        startAt: booking.endAt,
        daysAhead: 21,
        timezone: tz,
      });
      const touchUpUrl = buildTouchUpBookingUrl({
        serviceSlug: hydrated.service.slug,
        staffSlug: hydrated.staff.bookingSlug,
        suggestedDateKey,
      });
      targets.push({
        hydrated,
        touchUpUrl,
        settings: { ...db.settings },
      });
    }
    return targets;
  };

  if (isSupabaseEnabled()) {
    const supabase = createSupabaseAdminClient();
    const minEndIso = new Date(nowMs - MAX_AGE_MS).toISOString();
    const maxEndIso = new Date(nowMs - MIN_AGE_MS).toISOString();
    const context = await fetchSupabaseTouchUpContext(minEndIso, maxEndIso, supabase);
    if (!context) {
      return { eligibleCount: 0, sentCount: 0 };
    }

    const tz = context.settings.timezone || 'America/Mexico_City';
    const seenClientIds = new Set<string>();
    const targets: TouchUpTarget[] = [];
    for (const hydrated of context.candidates) {
      if (seenClientIds.has(hydrated.clientId)) continue;
      const bookingEndMs = new Date(hydrated.endAt).getTime();
      const hasNewerBooking = context.newerBookings.some(
        (other) =>
          other.id !== hydrated.id &&
          other.clientId === hydrated.clientId &&
          other.status !== 'canceled' &&
          other.status !== 'no_show' &&
          new Date(other.startAt).getTime() > bookingEndMs,
      );
      if (hasNewerBooking) continue;

      seenClientIds.add(hydrated.clientId);
      const suggestedDateKey = computeSuggestedTouchUpDateKey({
        startAt: hydrated.endAt,
        daysAhead: 21,
        timezone: tz,
      });
      const touchUpUrl = buildTouchUpBookingUrl({
        serviceSlug: hydrated.service.slug,
        staffSlug: hydrated.staff.bookingSlug,
        suggestedDateKey,
      });
      targets.push({
        hydrated,
        touchUpUrl,
        settings: { ...context.settings },
      });
    }

    let sentCount = 0;
    for (const target of targets) {
      const dispatch = await dispatchTouchUpInviteNotification({
        booking: target.hydrated,
        settings: target.settings,
        appUrl: env.appUrl,
        touchUpUrl: target.touchUpUrl,
      });
      const delivered =
        dispatch.whatsapp.status === 'sent' || dispatch.email?.status === 'sent';
      if (delivered) {
        const bodyText = `Link sugerido: ${target.touchUpUrl}`;
        await supabase
          .from('bookings')
          .update({ touchup_invited_at: nowIso, updated_at: nowIso })
          .eq('id', target.hydrated.id)
          .is('touchup_invited_at', null);
        await supabase.from('scheduled_notifications').insert({
          booking_id: target.hydrated.id,
          client_id: target.hydrated.clientId,
          workflow_id: context.workflowId,
          trigger_key: 'touchup_invite',
          channel: 'whatsapp',
          recipient: target.hydrated.client.phoneE164,
          scheduled_for: nowIso,
          status: dispatch.whatsapp.status,
          delivery_status: dispatch.whatsapp.status === 'sent' ? 'sent' : 'failed',
          subject: `Invitación de retoque (${target.hydrated.service.name})`,
          preview_text: bodyText.slice(0, 160),
          body_text: bodyText,
          provider_message_id: dispatch.whatsapp.providerMessageId,
          error_message: dispatch.whatsapp.errorMessage,
          attempts: 1,
          max_attempts: 3,
          next_retry_at: null,
          last_attempt_at: nowIso,
          sent_at: dispatch.whatsapp.status === 'sent' ? nowIso : null,
        });
        sentCount += 1;
      }
    }
    return { eligibleCount: targets.length, sentCount };
  }

  const snapshot = getSnapshot();
  const targets = collectEligible(snapshot);
  let sentCount = 0;

  for (const target of targets) {
    const dispatch = await dispatchTouchUpInviteNotification({
      booking: target.hydrated,
      settings: target.settings,
      appUrl: env.appUrl,
      touchUpUrl: target.touchUpUrl,
    });
    const delivered =
      dispatch.whatsapp.status === 'sent' || dispatch.email?.status === 'sent';
    if (delivered) {
      sentCount += 1;
      await withWriteLock((liveDb) => {
        const raw = liveDb.bookings.find((b) => b.id === target.hydrated.id);
        if (raw && !raw.touchupInvitedAt) {
          raw.touchupInvitedAt = nowIso;
          raw.updatedAt = nowIso;
        }
        const bodyText = `Link sugerido: ${target.touchUpUrl}`;
        liveDb.notifications.unshift({
          id: generateId('ntf'),
          bookingId: target.hydrated.id,
          clientId: target.hydrated.clientId,
          workflowId: 'wf-retoque',
          triggerKey: 'touchup_invite',
          channel: 'whatsapp',
          recipient: target.hydrated.client.phoneE164,
          scheduledFor: nowIso,
          status: dispatch.whatsapp.status,
          deliveryStatus: dispatch.whatsapp.status === 'sent' ? 'sent' : 'failed',
          subject: `Invitación de retoque (${target.hydrated.service.name})`,
          previewText: bodyText.slice(0, 160),
          bodyText,
          providerMessageId: dispatch.whatsapp.providerMessageId,
          errorMessage: dispatch.whatsapp.errorMessage,
          attempts: 1,
          maxAttempts: 3,
          nextRetryAt: null,
          lastAttemptAt: nowIso,
          sentAt: dispatch.whatsapp.status === 'sent' ? nowIso : null,
          createdAt: nowIso,
        });
      });
    }
  }

  return { eligibleCount: targets.length, sentCount };
}

export async function recordFunnelEvent(params: {
  sessionId: string;
  eventType: FunnelEventType;
  serviceSlug?: string | null;
  staffSlug?: string | null;
}): Promise<FunnelEventRecord> {
  const nowIso = new Date().toISOString();
  const serviceSlug = params.serviceSlug?.trim() || null;
  const staffSlug = params.staffSlug?.trim() || null;

  if (isSupabaseEnabled()) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('funnel_events')
      .insert({
        session_id: params.sessionId,
        event_type: params.eventType,
        service_slug: serviceSlug,
        staff_slug: staffSlug,
        created_at: nowIso,
      })
      .select('*')
      .single();
    if (error || !data) {
      throw new PolicyError(
        'FUNNEL_EVENT_FAILED',
        error?.message ?? 'No se pudo registrar el evento.',
      );
    }
    return {
      id: data.id,
      sessionId: data.session_id,
      eventType: data.event_type,
      serviceSlug: data.service_slug,
      staffSlug: data.staff_slug,
      createdAt: data.created_at,
    };
  }

  return withWriteLock((db) => {
    if (!db.funnelEvents) db.funnelEvents = [];
    const record: FunnelEventRecord = {
      id: generateId('fnl'),
      sessionId: params.sessionId,
      eventType: params.eventType,
      serviceSlug,
      staffSlug,
      createdAt: nowIso,
    };
    db.funnelEvents.unshift(record);
    if (db.funnelEvents.length > 5000) {
      db.funnelEvents.length = 5000;
    }
    return record;
  });
}

export async function getBookingPaymentSummaryAsync(
  bookingId: string,
  totalPriceCents: number,
): Promise<BookingPaymentSummary> {
  const cleanId = bookingId.trim();
  if (!cleanId) {
    return computeBookingPaymentSummary(totalPriceCents, []);
  }
  if (isSupabaseEnabled()) {
    const splits = await fetchSupabaseBookingPaymentSplits(cleanId);
    return computeBookingPaymentSummary(totalPriceCents, splits);
  }
  const db = getSnapshot();
  const splits = (db.paymentSplits ?? []).filter((s) => s.bookingId === cleanId);
  return computeBookingPaymentSummary(totalPriceCents, splits);
}

export async function getBookingStaffOwnerAsync(bookingId: string): Promise<string | null> {
  const cleanId = bookingId.trim();
  if (!cleanId) return null;
  if (isSupabaseEnabled()) {
    return fetchSupabaseBookingStaffId(cleanId);
  }
  const db = getSnapshot();
  return db.bookings.find((b) => b.id === cleanId)?.staffId ?? null;
}

export async function getAddonsByIdsAsync(
  addonIds: readonly string[],
): Promise<ServiceAddon[]> {
  const uniqueIds = Array.from(
    new Set(addonIds.map((id) => id.trim()).filter((id) => id.length > 0)),
  );
  if (uniqueIds.length === 0) return [];
  if (isSupabaseEnabled()) {
    return fetchSupabaseAddonsByIds(uniqueIds);
  }
  const db = getSnapshot();
  return db.addons.filter((a) => uniqueIds.includes(a.id) && a.isActive);
}

export async function getRecurringBlockStaffOwnerAsync(
  blockId: string,
): Promise<string | null> {
  const cleanId = blockId.trim();
  if (!cleanId) return null;
  if (isSupabaseEnabled()) {
    return fetchSupabaseRecurringBlockStaffId(cleanId);
  }
  const db = getSnapshot();
  return (db.recurringBlocks ?? []).find((b) => b.id === cleanId)?.staffId ?? null;
}

export async function getDateOverrideStaffOwnerAsync(
  overrideId: string,
): Promise<string | null> {
  const cleanId = overrideId.trim();
  if (!cleanId) return null;
  if (isSupabaseEnabled()) {
    return fetchSupabaseDateOverrideStaffId(cleanId);
  }
  const db = getSnapshot();
  return db.dateOverrides.find((o) => o.id === cleanId)?.staffId ?? null;
}

export async function checkInBookingAdmin(params: {
  bookingId: string;
  actor: AuditActor;
}): Promise<BookingWithRelations> {
  const nowIso = new Date().toISOString();

  if (isSupabaseEnabled()) {
    const supabase = createSupabaseAdminClient();
    const booking = await fetchSupabaseBookingById(params.bookingId);
    if (!booking) {
      throw new PolicyError('BOOKING_NOT_FOUND', 'Cita no encontrada.');
    }
    if (booking.status === 'canceled' || booking.status === 'no_show') {
      throw new PolicyError(
        'INVALID_STATE',
        'No se puede registrar llegada en una cita cancelada o no-show.',
      );
    }
    if (booking.attendanceStatus === 'confirmed' && booking.attendanceConfirmedAt) {
      return booking;
    }
    const nextConfirmedVia = booking.confirmedVia ?? 'manual';
    const { error } = await supabase
      .from('bookings')
      .update({
        attendance_status: 'confirmed',
        attendance_confirmed_at: nowIso,
        confirmed_via: nextConfirmedVia,
        updated_at: nowIso,
      })
      .eq('id', booking.id);
    if (error) {
      throw new PolicyError('CHECK_IN_FAILED', error.message);
    }
    const hydrated: BookingWithRelations = {
      ...booking,
      attendanceStatus: 'confirmed',
      attendanceConfirmedAt: nowIso,
      confirmedVia: nextConfirmedVia,
      updatedAt: nowIso,
    };
    await dispatchOutboxEvent({
      type: 'Realtime',
      eventType: 'booking_updated',
      payload: { staffId: hydrated.staffId, startAt: hydrated.startAt },
    });
    return hydrated;
  }

  const hydrated = await withWriteLock((db) => {
    const booking = db.bookings.find((b) => b.id === params.bookingId);
    if (!booking) {
      throw new PolicyError('BOOKING_NOT_FOUND', 'Cita no encontrada.');
    }
    if (booking.status === 'canceled' || booking.status === 'no_show') {
      throw new PolicyError(
        'INVALID_STATE',
        'No se puede registrar llegada en una cita cancelada o no-show.',
      );
    }
    if (booking.attendanceStatus === 'confirmed' && booking.attendanceConfirmedAt) {
      return hydrateBooking(db, booking);
    }
    booking.attendanceStatus = 'confirmed';
    booking.attendanceConfirmedAt = nowIso;
    booking.confirmedVia = booking.confirmedVia ?? 'manual';
    booking.updatedAt = nowIso;
    return hydrateBooking(db, booking);
  });

  await dispatchOutboxEvent({
    type: 'Realtime',
    eventType: 'booking_updated',
    payload: { staffId: hydrated.staffId, startAt: hydrated.startAt },
  });
  return hydrated;
}

export function getRepository(clock: Clock = systemClock): SalonRepository {
  assertProductionEnvValid(process.env, {
    requireCoreSecrets:
      isSupabaseEnabled() || Boolean(process.env.R2_ACCOUNT_ID?.trim()),
  });
  if (isSupabaseEnabled()) {
    return createSupabaseRepository(clock);
  }
  return createDemoRepository(clock);
}
