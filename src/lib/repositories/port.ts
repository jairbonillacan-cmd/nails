import type { AvailableSlot, DayAvailabilitySummary } from '../availability/engine';
import type {
  PublicServiceDTO,
  PublicSettingsDTO,
  PublicStaffDTO,
} from '../public-dto';
import type {
  AdminRole,
  AdminUser,
  AuditAction,
  AuditLogEntry,
  AvailabilityRule,
  BookingReview,
  BookingSource,
  BookingStatus,
  BookingWithRelations,
  CalendarConnection,
  CashRegisterEntry,
  ClientProfile,
  ConsentRecord,
  Coupon,
  DateOverride,
  DemoDatabase,
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
  ServiceAddon,
  SlotHold,
  StaffMember,
  WaitlistEntry,
  WhatsAppMonthlyUsageSummary,
  WhatsAppTemplateConfig,
} from '../types';

type OutboxEventStatus = 'pending' | 'processing' | 'processed' | 'failed';

export class SlotConflictError extends Error {
  readonly code = 'SLOT_TAKEN';
  readonly suggestedSlots: AvailableSlot[];

  constructor(message: string, suggestedSlots: AvailableSlot[]) {
    super(message);
    this.name = 'SlotConflictError';
    this.suggestedSlots = suggestedSlots;
  }
}

export class PolicyError extends Error {
  readonly code: string;
  readonly suggestedSlots?: AvailableSlot[];

  constructor(code: string, message: string, suggestedSlots?: AvailableSlot[]) {
    super(message);
    this.name = 'PolicyError';
    this.code = code;
    this.suggestedSlots = suggestedSlots;
  }
}

export interface OutboxEventRecord {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: OutboxEventStatus;
  attempts: number;
  availableAt: string;
  processedAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface PublicBootstrapData {
  settings: PublicSettingsDTO;
  categories: DemoDatabase['categories'];
  services: PublicServiceDTO[];
  addons: ServiceAddon[];
  staff: PublicStaffDTO[];
  gallery: GalleryItem[];
  reviewsSummary: {
    count: number;
    average: number;
  };
}

export interface QueryAvailabilityInput {
  serviceId: string;
  extraServiceIds?: string[];
  addonIds: string[];
  staffId?: string | null;
  startDate: string;
  days: number;
  sessionToken?: string | null;
  ignoreBookingId?: string | null;
}

export interface QueryAvailabilityOutput {
  service: Service;
  extraServices?: Service[];
  addons: ServiceAddon[];
  totals: {
    totalDurationMinutes: number;
    subtotalCents: number;
    bufferBeforeMinutes: number;
    bufferAfterMinutes: number;
  };
  activeStaffCount: number;
  days: DayAvailabilitySummary[];
  timezone?: string;
}

export type ValidateCouponResult =
  | { valid: false; error: string }
  | { valid: true; coupon: Coupon; discountCents: number };

export interface CreateSlotHoldInput {
  serviceId: string;
  extraServiceIds?: string[];
  addonIds: string[];
  staffId: string;
  startAt: string;
  sessionToken: string;
}

export interface SlotHoldResult extends SlotHold {
  holdId: string;
}

export interface CreateBookingAtomicInput {
  serviceId: string;
  extraServiceIds?: string[];
  addonIds: string[];
  staffId?: string | null;
  startAt: string;
  clientName: string;
  clientPhone: string;
  clientEmail?: string | null;
  clientInstagram?: string | null;
  clientBirthday?: string | null;
  clientNotes?: string;
  internalNotes?: string | null;
  customDurationMinutes?: number | null;
  customPriceCents?: number | null;
  inspoPhotoUrl?: string | null;
  paymentProofUrl?: string | null;
  proofDeliveryMethod?: 'web_upload' | 'web_link' | 'instagram_dm' | 'none';
  privacyConsentAccepted?: boolean;
  marketingOptIn?: boolean;
  couponCode?: string | null;
  source?: BookingSource;
  sessionToken?: string | null;
  holdId?: string | null;
  waitlistOfferToken?: string | null;
  idempotencyKey?: string | null;
  forceConfirmed?: boolean;
}

export interface UpdateBookingStatusInput {
  bookingId: string;
  status: BookingStatus;
  cancellationReason?: string;
  internalNotes?: string;
  paymentMethod?: PaymentMethod;
  tipCents?: number;
  recordedBy?: string;
}

export interface ManageClientBookingInput {
  token: string;
  action: 'cancel' | 'reschedule' | 'upload_proof' | 'confirm_attendance';
  reason?: string;
  newStartAt?: string;
  newStaffId?: string;
  paymentProofUrl?: string;
  confirmedVia?: 'email' | 'whatsapp';
}

export type NotificationDispatcher = (params: {
  notification: ScheduledNotification;
  booking: BookingWithRelations;
  settings: SalonSettings;
}) => Promise<{
  status: 'sent' | 'failed';
  providerMessageId: string | null;
  errorMessage: string | null;
}>;

export interface ProcessDueNotificationsResult {
  processed: number;
  sentCount: number;
  failedCount: number;
  canceledCount: number;
}

export interface UpdateClientNotesInput {
  clientId: string;
  notes?: string;
  birthday?: string | null;
  email?: string | null;
  instagramHandle?: string | null;
}

export interface RecordPaymentSplitsInput {
  bookingId: string;
  splits: Array<{
    method: PaymentSplitMethod;
    amountCents: number;
    tipCents?: number;
    tipStaffId?: string | null;
    reference?: string | null;
  }>;
}

export interface AwardLoyaltyStampInput {
  clientId: string;
  bookingId: string;
  programId: string;
  stampedDate: string;
}

export interface RecordConsentInput {
  clientId: string;
  bookingId?: string | null;
  policyVersion: string;
  marketingOptIn?: boolean;
}

export interface WriteAuditLogInput {
  actorId: string;
  actorEmail: string;
  actorRole: AdminRole;
  action: AuditAction;
  entityType: string;
  entityId: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface SubmitReviewInput {
  manageToken: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string;
  clickedGoogleReview?: boolean;
}

export interface AdjustInventoryInput {
  itemId?: string;
  newItem?: Omit<InventoryItem, 'id' | 'updatedAt'>;
  delta?: number;
  reason?: 'restock' | 'service_usage' | 'retail_sale' | 'adjustment';
  notes?: string;
  createdBy?: string;
}

export interface RegisterMediaAssetInput {
  storagePath: string;
  folder: MediaAssetFolder;
  bookingId?: string | null;
  clientId?: string | null;
  contentType: string;
  sizeBytes: number;
  createdAt?: string;
}

export interface CleanupExpiredSlotHoldsResult {
  cleanedCount: number;
  dbAlive: boolean;
}

export interface SalonRepository {
  getSalonSettings(): Promise<SalonSettings>;
  getSnapshot(): Promise<Readonly<DemoDatabase>>;
  getPublicBootstrap(): Promise<PublicBootstrapData>;
  getBookingsWithRelations(
    role?: AdminRole,
    staffMemberId?: string | null,
  ): Promise<BookingWithRelations[]>;
  getBookingByToken(token: string): Promise<BookingWithRelations | null>;
  queryAvailability(params: QueryAvailabilityInput): Promise<QueryAvailabilityOutput>;
  getNextQuickSlots(
    serviceId: string,
    staffId?: string | null,
  ): Promise<Array<AvailableSlot & { date: string }>>;
  validateCouponCode(code: string, subtotalCents: number): Promise<ValidateCouponResult>;

  createOrRefreshSlotHold(params: CreateSlotHoldInput): Promise<SlotHoldResult>;
  releaseSlotHold(sessionToken: string): Promise<void>;

  createBookingAtomic(params: CreateBookingAtomicInput): Promise<BookingWithRelations>;
  updateBookingStatus(params: UpdateBookingStatusInput): Promise<BookingWithRelations>;
  manageClientBookingAction(
    params: ManageClientBookingInput,
  ): Promise<BookingWithRelations>;

  processDueScheduledNotifications(
    dispatcher: NotificationDispatcher,
    nowMs?: number,
  ): Promise<ProcessDueNotificationsResult>;

  enqueueOutboxEvent(
    eventType: string,
    payload: Record<string, unknown>,
    availableAt?: string,
  ): Promise<OutboxEventRecord>;
  dequeueOutboxEvents(limit?: number, nowMs?: number): Promise<OutboxEventRecord[]>;
  ackOutboxEvent(id: string): Promise<void>;
  failOutboxEvent(
    id: string,
    errorMessage: string,
    retryAfterMs?: number,
  ): Promise<void>;

  updateSalonSettings(
    patch: Partial<Omit<SalonSettings, 'landingContent'>> & {
      landingContent?: Partial<SalonSettings['landingContent']>;
    },
  ): Promise<SalonSettings>;
  upsertService(
    input: Partial<Service> & {
      name: string;
      durationMinutes: number;
      priceCents: number;
    },
  ): Promise<Service>;
  upsertAddon(
    input: Partial<ServiceAddon> & {
      name: string;
      extraMinutes: number;
      extraPriceCents: number;
    },
  ): Promise<ServiceAddon>;
  saveStaffSchedule(staffId: string, rules: AvailabilityRule[]): Promise<void>;
  addDateOverride(override: Omit<DateOverride, 'id'>): Promise<DateOverride>;
  deleteDateOverride(id: string): Promise<void>;
  upsertStaffMember(input: Partial<StaffMember> & { name: string }): Promise<StaffMember>;
  upsertAdminUser(
    input: Omit<AdminUser, 'id' | 'createdAt'> & { id?: string },
  ): Promise<AdminUser>;
  updateClientNotes(params: UpdateClientNotesInput): Promise<ClientProfile>;
  addWaitlistEntry(
    input: Omit<WaitlistEntry, 'id' | 'status' | 'notifiedAt' | 'createdAt'>,
  ): Promise<WaitlistEntry>;
  updateWaitlistStatus(
    id: string,
    status: WaitlistEntry['status'],
  ): Promise<WaitlistEntry>;
  submitBookingReview(params: SubmitReviewInput): Promise<BookingReview>;
  upsertCoupon(
    input: Omit<Coupon, 'id' | 'usedCount' | 'createdAt'> & { id?: string },
  ): Promise<Coupon>;
  adjustInventoryItem(params: AdjustInventoryInput): Promise<InventoryItem>;
  addCashEntry(input: Omit<CashRegisterEntry, 'id' | 'occurredAt'>): Promise<CashRegisterEntry>;
  updateWorkflow(
    id: string,
    patch: Partial<NotificationWorkflow>,
  ): Promise<NotificationWorkflow>;
  updateCalendarConnection(
    staffId: string,
    patch: Partial<CalendarConnection>,
  ): Promise<CalendarConnection>;
  upsertGalleryItem(
    input: Omit<GalleryItem, 'id' | 'displayOrder'> & { id?: string },
  ): Promise<GalleryItem>;
  deleteGalleryItem(id: string): Promise<void>;
  recordPaymentSplits(params: RecordPaymentSplitsInput): Promise<PaymentSplit[]>;
  upsertRecurringBlock(
    input: Omit<RecurringBlock, 'id'> & { id?: string },
  ): Promise<RecurringBlock>;
  deleteRecurringBlock(id: string): Promise<void>;
  upsertLoyaltyProgram(patch: Partial<LoyaltyProgram>): Promise<LoyaltyProgram>;
  awardLoyaltyStamp(params: AwardLoyaltyStampInput): Promise<LoyaltyStamp>;
  recordConsent(params: RecordConsentInput): Promise<ConsentRecord>;
  writeAuditLog(params: WriteAuditLogInput): Promise<AuditLogEntry>;

  registerMediaAsset(input: RegisterMediaAssetInput): Promise<MediaAssetRecord>;
  getMediaAccessOwner(storagePath: string): Promise<MediaAccessOwner | null>;
  listMediaAssetsForRetention(): Promise<MediaAssetRecord[]>;
  markMediaRetentionWarned(
    id: string,
    stage: '30d' | '7d',
    atIso?: string,
  ): Promise<MediaAssetRecord | null>;
  markMediaAssetPurged(id: string, atIso?: string): Promise<MediaAssetRecord | null>;
  getWhatsAppTemplates(): Promise<WhatsAppTemplateConfig[]>;
  getWhatsAppMonthlyUsage(monthKey?: string): Promise<WhatsAppMonthlyUsageSummary>;
  incrementWhatsAppMonthlyUsage(
    monthKey?: string,
    count?: number,
  ): Promise<WhatsAppMonthlyUsageSummary>;
  claimWebhookEventIdempotent(provider: string, eventId: string): Promise<boolean>;
  cleanupExpiredSlotHolds(nowMs?: number): Promise<CleanupExpiredSlotHoldsResult>;
}
