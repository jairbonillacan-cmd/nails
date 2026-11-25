import type { SupabaseClient } from '@supabase/supabase-js';
import {
  assertSlotBookable,
  computeServiceTotals,
  findNearestAvailableSlots,
  getAvailabilityForRange,
  getAvailableSlotsForDate,
  type AvailabilityContext,
  type AvailableSlot,
} from '../availability/engine';
import { checkManagePolicyWindow } from '../availability/policy';
import {
  isActiveBookingStatus,
  transitionBookingStatus,
} from '../booking/state-machine';
import { generateBookingCode, systemClock, type Clock } from '../clock';
import { getDateKeyInTimezone, normalizePhoneE164, slugify } from '../format';
import {
  toPublicServiceDTO,
  toPublicSettingsDTO,
  toPublicStaffDTO,
} from '../public-dto';
import { dispatchOutboxEvent } from '../use-cases/outbox';
import type {
  AdminRole,
  AdminUser,
  AvailabilityRule,
  AvailabilitySchedule,
  Booking,
  BookingLayoutView,
  BookingReview,
  BookingWithRelations,
  CalendarConnection,
  CashRegisterEntry,
  ClientProfile,
  Coupon,
  DateOverride,
  DemoDatabase,
  GalleryItem,
  InventoryItem,
  InventoryMovement,
  NotificationChannel,
  NotificationWorkflow,
  SalonSettings,
  ScheduledNotification,
  Service,
  ServiceAddon,
  ServiceCategory,
  SlotHold,
  StaffMember,
  WaitlistEntry,
} from '../types';
import type { Database } from './database.types';
import { createSupabaseAdminClient } from './supabase-client';
import {
  PolicyError,
  SlotConflictError,
  type AdjustInventoryInput,
  type CreateBookingAtomicInput,
  type CreateSlotHoldInput,
  type ManageClientBookingInput,
  type NotificationDispatcher,
  type OutboxEventRecord,
  type ProcessDueNotificationsResult,
  type PublicBootstrapData,
  type QueryAvailabilityInput,
  type QueryAvailabilityOutput,
  type SalonRepository,
  type SlotHoldResult,
  type SubmitReviewInput,
  type UpdateBookingStatusInput,
  type UpdateClientNotesInput,
  type ValidateCouponResult,
} from './port';

type Tables = Database['public']['Tables'];
type Views = Database['public']['Views'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asSlotInterval(value: number): 15 | 30 | 60 {
  if (value === 15 || value === 60) return value;
  return 30;
}

function asDayOfWeek(value: number): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  if (value >= 0 && value <= 6 && Number.isInteger(value)) {
    return value as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  }
  return 1;
}

function asRating(value: number): 1 | 2 | 3 | 4 | 5 {
  if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5) {
    return value;
  }
  return 5;
}

function asBookingLayouts(values: string[]): BookingLayoutView[] {
  const allowed: BookingLayoutView[] = [];
  for (const item of values) {
    if (item === 'month' || item === 'week' || item === 'column') {
      allowed.push(item);
    }
  }
  return allowed.length > 0 ? allowed : ['month', 'week', 'column'];
}

function asNotificationChannels(values: string[]): NotificationChannel[] {
  const out: NotificationChannel[] = [];
  for (const item of values) {
    if (item === 'email' || item === 'whatsapp' || item === 'sms') {
      out.push(item);
    }
  }
  return out;
}

function mapLandingContent(raw: unknown): SalonSettings['landingContent'] {
  if (!isRecord(raw)) {
    return {
      heroEyebrow: '',
      heroTitle: '',
      heroSubtitle: '',
      aboutTitle: '',
      aboutBody: '',
    };
  }
  return {
    heroEyebrow: asString(raw.heroEyebrow),
    heroTitle: asString(raw.heroTitle),
    heroSubtitle: asString(raw.heroSubtitle),
    aboutTitle: asString(raw.aboutTitle),
    aboutBody: asString(raw.aboutBody),
  };
}

function mapSettingsRow(row: Tables['salon_settings']['Row']): SalonSettings {
  return {
    id: 'default',
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    logoUrl: row.logo_url,
    coverImageUrl: row.cover_image_url,
    address: row.address,
    mapsUrl: row.maps_url,
    instagramHandle: row.instagram_handle,
    whatsappNumber: row.whatsapp_number,
    contactEmail: row.contact_email,
    timezone: row.timezone,
    brandAccentLight: row.brand_accent_light,
    brandAccentDark: row.brand_accent_dark,
    defaultPublicMode: row.default_public_mode,
    defaultAdminMode: row.default_admin_mode,
    cornerStyle: row.corner_style,
    defaultBookingLayout: row.default_booking_layout,
    enabledBookingLayouts: asBookingLayouts(row.enabled_booking_layouts),
    lockTimezone: row.lock_timezone,
    slotIntervalMinutes: asSlotInterval(row.slot_interval_minutes),
    enableSlotHold: row.enable_slot_hold,
    slotHoldMinutes: row.slot_hold_minutes,
    minBookingNoticeMinutes: row.min_booking_notice_minutes,
    maxBookingDaysAhead: row.max_booking_days_ahead,
    minCancelHours: row.min_cancel_hours,
    minRescheduleHours: row.min_reschedule_hours,
    cancellationPolicyText: row.cancellation_policy_text,
    bookingInstructionsText: row.booking_instructions_text,
    paymentMode: row.payment_mode,
    depositBankName: row.deposit_bank_name ?? '',
    depositAccountHolder: row.deposit_account_holder ?? '',
    depositClabe: row.deposit_clabe ?? '',
    depositInstructions: row.deposit_instructions ?? '',
    currency: row.currency === 'USD' ? 'USD' : 'MXN',
    landingContent: mapLandingContent(row.landing_content),
    whatsappBookingEnabled: row.whatsapp_booking_enabled,
    smsRemindersEnabled: row.sms_reminders_enabled,
    metaPixelId: row.meta_pixel_id,
    ga4MeasurementId: row.ga4_measurement_id,
    googleReviewUrl: row.google_review_url,
    defaultCommissionPercent: Number(row.default_commission_percent),
    updatedAt: row.updated_at,
  };
}

function mapStaffRow(
  row: Tables['staff_members']['Row'],
  staffServices: Tables['staff_services']['Row'][],
): StaffMember {
  return {
    id: row.id,
    name: row.name,
    roleTitle: row.role_title,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    bookingSlug: row.booking_slug,
    commissionPercent: Number(row.commission_percent),
    isActive: row.is_active,
    displayOrder: row.display_order,
    serviceIds: staffServices
      .filter((link) => link.staff_id === row.id)
      .map((link) => link.service_id),
  };
}

function mapAdminUserRow(row: Tables['admin_users']['Row']): AdminUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    staffMemberId: row.staff_member_id,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

function mapCategoryRow(row: Tables['service_categories']['Row']): ServiceCategory {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    displayOrder: row.display_order,
  };
}

function mapServiceRow(row: Tables['services']['Row']): Service {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    durationMinutes: row.duration_minutes,
    priceCents: row.price_cents,
    bufferBeforeMinutes: row.buffer_before_minutes,
    bufferAfterMinutes: row.buffer_after_minutes,
    requiresConfirmation: row.requires_confirmation,
    depositRequired: row.deposit_required,
    depositAmountCents: row.deposit_amount_cents,
    allowInspoPhoto: row.allow_inspo_photo,
    isActive: row.is_active,
    isFeatured: row.is_featured,
    displayOrder: row.display_order,
    imageUrl: row.image_url,
  };
}

function mapAddonRow(row: Tables['service_addons']['Row']): ServiceAddon {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    extraMinutes: row.extra_minutes,
    extraPriceCents: row.extra_price_cents,
    appliesToAll: row.applies_to_all,
    serviceIds: row.service_ids,
    isActive: row.is_active,
    displayOrder: row.display_order,
  };
}

function mapScheduleRow(
  row: Tables['availability_schedules']['Row'],
  rules: Tables['availability_rules']['Row'][],
): AvailabilitySchedule {
  return {
    id: row.id,
    staffId: row.staff_id,
    name: row.name,
    timezone: row.timezone,
    isDefault: row.is_default,
    rules: rules
      .filter((r) => r.schedule_id === row.id)
      .map((r) => ({
        id: r.id,
        dayOfWeek: asDayOfWeek(r.day_of_week),
        startTime: r.start_time,
        endTime: r.end_time,
      })),
  };
}

function mapDateOverrideRow(row: Tables['date_overrides']['Row']): DateOverride {
  return {
    id: row.id,
    staffId: row.staff_id,
    overrideDate: row.override_date,
    isUnavailable: row.is_unavailable,
    startTime: row.start_time,
    endTime: row.end_time,
    reason: row.reason,
  };
}

function mapPublicOverrideRow(row: Views['public_busy_overrides']['Row']): DateOverride {
  return {
    id: row.id,
    staffId: row.staff_id,
    overrideDate: row.override_date,
    isUnavailable: row.is_unavailable,
    startTime: row.start_time,
    endTime: row.end_time,
    reason: '',
  };
}

function parseAvailableCalendars(
  raw: unknown,
): CalendarConnection['availableCalendars'] {
  if (!Array.isArray(raw)) return [];
  const out: CalendarConnection['availableCalendars'] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const id = asString(item.id);
    const summary = asString(item.summary);
    if (!id) continue;
    out.push({
      id,
      summary,
      primary: typeof item.primary === 'boolean' ? item.primary : undefined,
    });
  }
  return out;
}

function parseExternalBusyBlocks(
  raw: unknown,
): NonNullable<CalendarConnection['externalBusyBlocks']> {
  if (!Array.isArray(raw)) return [];
  const out: NonNullable<CalendarConnection['externalBusyBlocks']> = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const startAt = asString(item.startAt);
    const endAt = asString(item.endAt);
    if (!startAt || !endAt) continue;
    out.push({
      startAt,
      endAt,
      summary: typeof item.summary === 'string' ? item.summary : undefined,
    });
  }
  return out;
}

function mapCalendarConnectionRow(
  row: Tables['calendar_connections']['Row'],
): CalendarConnection {
  return {
    id: row.id,
    staffId: row.staff_id,
    provider: 'google',
    accountEmail: row.account_email,
    destinationCalendarId: row.destination_calendar_id,
    conflictCalendarIds: row.conflict_calendar_ids,
    availableCalendars: parseAvailableCalendars(row.available_calendars),
    isConnected: row.is_connected,
    lastSyncedAt: row.last_synced_at,
    externalBusyBlocks: parseExternalBusyBlocks(row.external_busy_blocks),
  };
}

function mapClientRow(row: Tables['clients']['Row']): ClientProfile {
  return {
    id: row.id,
    fullName: row.full_name,
    phoneE164: row.phone_e164,
    email: row.email,
    birthday: row.birthday,
    notes: row.notes,
    noShowCount: row.no_show_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSlotHoldRow(row: Tables['slot_holds']['Row']): SlotHold {
  return {
    id: row.id,
    staffId: row.staff_id,
    serviceId: row.service_id,
    sessionToken: row.session_token,
    startAt: row.start_at,
    endAt: row.end_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

function mapBookingRow(
  row: Tables['bookings']['Row'],
  bookingAddons: Tables['booking_addons']['Row'][],
): Booking {
  return {
    id: row.id,
    bookingCode: row.booking_code,
    manageToken: row.manage_token,
    idempotencyKey: row.idempotency_key,
    serviceId: row.service_id,
    staffId: row.staff_id,
    clientId: row.client_id,
    startAt: row.start_at,
    endAt: row.end_at,
    occupiedStartAt: row.occupied_start_at,
    occupiedEndAt: row.occupied_end_at,
    totalDurationMinutes: row.total_duration_minutes,
    subtotalCents: row.subtotal_cents,
    discountCents: row.discount_cents,
    totalPriceCents: row.total_price_cents,
    depositAmountCents: row.deposit_amount_cents,
    couponCode: row.coupon_code,
    status: row.status,
    source: row.source,
    clientNotes: row.client_notes,
    internalNotes: row.internal_notes,
    inspoPhotoUrl: row.inspo_photo_url,
    paymentProofUrl: row.payment_proof_url,
    googleEventId: row.google_event_id,
    cancellationReason: row.cancellation_reason,
    rescheduledFromId: row.rescheduled_from_id,
    addons: bookingAddons
      .filter((a) => a.booking_id === row.id)
      .map((a) => ({
        addonId: a.addon_id ?? a.id,
        name: a.name_snapshot,
        extraMinutes: a.extra_minutes,
        extraPriceCents: a.extra_price_cents,
      })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapWorkflowRow(
  row: Tables['notification_workflows']['Row'],
): NotificationWorkflow {
  return {
    id: row.id,
    name: row.name,
    triggerEvent: row.trigger_event,
    offsetMinutes: row.offset_minutes,
    channels: asNotificationChannels(row.channels),
    isEnabled: row.is_enabled,
    subjectTemplate: row.subject_template,
    messageTemplate: row.message_template,
  };
}

function mapNotificationRow(
  row: Tables['scheduled_notifications']['Row'],
): ScheduledNotification {
  return {
    id: row.id,
    bookingId: row.booking_id,
    workflowId: row.workflow_id,
    channel: row.channel,
    recipient: row.recipient,
    scheduledFor: row.scheduled_for,
    status: row.status,
    subject: row.subject,
    previewText: row.preview_text,
    providerMessageId: row.provider_message_id,
    errorMessage: row.error_message,
    sentAt: row.sent_at,
    createdAt: row.created_at,
  };
}

function mapGalleryRow(row: Tables['gallery_items']['Row']): GalleryItem {
  return {
    id: row.id,
    title: row.title,
    caption: row.caption,
    category: row.category,
    imageUrl: row.image_url,
    serviceId: row.service_id,
    isFeatured: row.is_featured,
    displayOrder: row.display_order,
  };
}

function mapCouponRow(row: Tables['coupons']['Row']): Coupon {
  return {
    id: row.id,
    code: row.code,
    kind: row.kind,
    discountType: row.discount_type,
    discountValue: row.discount_value,
    remainingBalanceCents: row.remaining_balance_cents,
    maxUses: row.max_uses,
    usedCount: row.used_count,
    minSubtotalCents: row.min_subtotal_cents,
    expiresAt: row.expires_at,
    recipientName: row.recipient_name,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

function mapWaitlistRow(row: Tables['waitlist_entries']['Row']): WaitlistEntry {
  return {
    id: row.id,
    serviceId: row.service_id,
    preferredStaffId: row.preferred_staff_id,
    desiredDate: row.desired_date,
    preferredWindow: row.preferred_window,
    clientName: row.client_name,
    clientPhoneE164: row.client_phone_e164,
    clientEmail: row.client_email,
    notes: row.notes,
    status: row.status,
    notifiedAt: row.notified_at,
    createdAt: row.created_at,
  };
}

function mapReviewRow(row: Tables['booking_reviews']['Row']): BookingReview {
  return {
    id: row.id,
    bookingId: row.booking_id,
    clientId: row.client_id,
    staffId: row.staff_id,
    rating: asRating(row.rating),
    comment: row.comment,
    clickedGoogleReview: row.clicked_google_review,
    createdAt: row.created_at,
  };
}

function mapInventoryItemRow(row: Tables['inventory_items']['Row']): InventoryItem {
  return {
    id: row.id,
    sku: row.sku ?? '',
    name: row.name,
    category: row.category,
    unit: row.unit,
    stockQuantity: Number(row.stock_quantity),
    minStockAlert: Number(row.min_stock_alert),
    costCents: row.cost_cents,
    retailPriceCents: row.retail_price_cents,
    isForRetail: row.is_for_retail,
    isActive: row.is_active,
    updatedAt: row.updated_at,
  };
}

function mapInventoryMovementRow(
  row: Tables['inventory_movements']['Row'],
): InventoryMovement {
  return {
    id: row.id,
    itemId: row.item_id,
    delta: Number(row.delta),
    reason: row.reason,
    notes: row.notes,
    bookingId: row.booking_id,
    createdBy: row.created_by ?? 'Admin',
    createdAt: row.created_at,
  };
}

function mapCashEntryRow(
  row: Tables['cash_register_entries']['Row'],
): CashRegisterEntry {
  return {
    id: row.id,
    bookingId: row.booking_id,
    staffId: row.staff_id,
    entryType: row.entry_type,
    description: row.description,
    amountCents: row.amount_cents,
    tipCents: row.tip_cents,
    commissionCents: row.commission_cents,
    paymentMethod: row.payment_method,
    occurredAt: row.occurred_at,
    recordedBy: row.recorded_by ?? 'Admin',
  };
}

function mapOutboxRow(row: Tables['outbox_events']['Row']): OutboxEventRecord {
  return {
    id: row.id,
    eventType: row.event_type,
    payload: isRecord(row.payload) ? row.payload : {},
    status: row.status,
    attempts: row.attempts,
    availableAt: row.available_at,
    processedAt: row.processed_at,
    lastError: row.last_error,
    createdAt: row.created_at,
  };
}

function parsePgTstzRange(rangeStr: string): { startAt: string; endAt: string } | null {
  const trimmed = rangeStr.trim();
  if (trimmed.length < 5) return null;
  const inner = trimmed.slice(1, -1);
  const commaIdx = inner.indexOf(',');
  if (commaIdx <= 0) return null;
  const rawStart = inner.slice(0, commaIdx).trim().replace(/^"|"$/g, '');
  const rawEnd = inner.slice(commaIdx + 1).trim().replace(/^"|"$/g, '');
  const startDate = new Date(rawStart);
  const endDate = new Date(rawEnd);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null;
  }
  return {
    startAt: startDate.toISOString(),
    endAt: endDate.toISOString(),
  };
}

function hydrateBookingFromSnapshot(
  db: DemoDatabase,
  booking: Booking,
): BookingWithRelations {
  const service =
    db.services.find((s) => s.id === booking.serviceId) ??
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
  const staff =
    db.staff.find((s) => s.id === booking.staffId) ??
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

function extractPgErrorCode(error: { code?: string; message?: string } | null): {
  code: string;
  message: string;
} {
  return {
    code: error?.code ?? '',
    message: error?.message ?? 'Supabase error',
  };
}

function isSlotConflictPgError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '23P01') return true;
  if (
    error.code === 'P0001' &&
    typeof error.message === 'string' &&
    (error.message.includes('HOLD_OWNERSHIP_MISMATCH') ||
      error.message.includes('SLOT_HELD_BY_OTHER_SESSION'))
  ) {
    return true;
  }
  return false;
}

function findNearestAfterConflict(
  ctx: AvailabilityContext,
  conflictedSlot: AvailableSlot,
  preferredStaffId: string | null,
): AvailableSlot[] {
  const syntheticConflict: Booking = {
    id: 'conflict-synthetic',
    bookingCode: '',
    manageToken: '',
    idempotencyKey: null,
    serviceId: ctx.service.id,
    staffId: conflictedSlot.staffId,
    clientId: '',
    startAt: conflictedSlot.startAt,
    endAt: conflictedSlot.endAt,
    occupiedStartAt: conflictedSlot.occupiedStartAt,
    occupiedEndAt: conflictedSlot.occupiedEndAt,
    totalDurationMinutes: ctx.service.durationMinutes,
    subtotalCents: 0,
    discountCents: 0,
    totalPriceCents: 0,
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
    createdAt: conflictedSlot.startAt,
    updatedAt: conflictedSlot.startAt,
  };
  const updatedCtx: AvailabilityContext = {
    ...ctx,
    bookings: [...ctx.bookings, syntheticConflict],
  };
  return findNearestAvailableSlots(
    updatedCtx,
    conflictedSlot.startAt,
    preferredStaffId,
    3,
  );
}

function resolveBookableSlotOrThrow(params: {
  ctx: AvailabilityContext;
  startAt: string;
  staffId?: string | null;
  ignoreBookingId?: string;
  ignoreHoldSessionToken?: string;
  conflictMessage: string;
}): AvailableSlot {
  const { ctx, startAt, staffId, ignoreBookingId, ignoreHoldSessionToken, conflictMessage } =
    params;

  if (staffId) {
    const check = assertSlotBookable(ctx, {
      startAt,
      staffId,
      now: ctx.now,
      ignoreBookingId,
      ignoreHoldSessionToken,
    });
    if (check.ok) {
      return check.slot;
    }
    if (check.code === 'SLOT_TAKEN') {
      throw new SlotConflictError(conflictMessage, check.suggestedSlots);
    }
    throw new PolicyError(check.code, check.message, check.suggestedSlots);
  }

  const startDate = new Date(startAt);
  const tz = ctx.settings.timezone || 'America/Mexico_City';
  const targetDateKey = Number.isNaN(startDate.getTime())
    ? null
    : getDateKeyInTimezone(startDate, tz);

  const eligibleStaff = ctx.staffMembers
    .filter(
      (st) =>
        st.isActive &&
        (st.serviceIds.length === 0 || st.serviceIds.includes(ctx.service.id)),
    )
    .toSorted((a, b) => {
      if (targetDateKey) {
        const countA = ctx.bookings.filter(
          (bk) =>
            bk.staffId === a.id &&
            isActiveBookingStatus(bk.status) &&
            getDateKeyInTimezone(new Date(bk.startAt), tz) === targetDateKey,
        ).length;
        const countB = ctx.bookings.filter(
          (bk) =>
            bk.staffId === b.id &&
            isActiveBookingStatus(bk.status) &&
            getDateKeyInTimezone(new Date(bk.startAt), tz) === targetDateKey,
        ).length;
        if (countA !== countB) return countA - countB;
      }
      return a.displayOrder - b.displayOrder;
    });

  if (eligibleStaff.length === 0) {
    throw new PolicyError('STAFF_INELIGIBLE', 'Especialista no disponible para este servicio.');
  }

  let firstFailure: Extract<ReturnType<typeof assertSlotBookable>, { ok: false }> | null =
    null;

  for (const candidate of eligibleStaff) {
    const check = assertSlotBookable(ctx, {
      startAt,
      staffId: candidate.id,
      now: ctx.now,
      ignoreBookingId,
      ignoreHoldSessionToken,
    });
    if (check.ok) {
      return check.slot;
    }
    if (!firstFailure || check.code === 'SLOT_TAKEN') {
      firstFailure = check;
    }
  }

  const suggestedSlots = Number.isNaN(startDate.getTime())
    ? []
    : findNearestAvailableSlots(ctx, startAt, null, 3);

  if (firstFailure?.code === 'SLOT_TAKEN') {
    throw new SlotConflictError(conflictMessage, suggestedSlots);
  }
  throw new PolicyError(
    firstFailure?.code ?? 'OUTSIDE_HOURS',
    firstFailure?.message ?? 'El horario seleccionado no está disponible.',
    suggestedSlots,
  );
}

export function createSupabaseRepository(
  clock: Clock = systemClock,
  clientOverride?: SupabaseClient<Database>,
): SalonRepository {
  const getClient = (): SupabaseClient<Database> =>
    clientOverride ?? createSupabaseAdminClient();

  async function loadPublicAvailabilityContext(params: {
    serviceId: string;
    addonIds: string[];
    sessionToken?: string | null;
    ignoreBookingId?: string | null;
  }): Promise<{
    settings: SalonSettings;
    service: Service;
    addons: ServiceAddon[];
    eligibleStaff: StaffMember[];
    ctx: AvailabilityContext;
  }> {
    const supabase = getClient();
    const nowIso = clock.now().toISOString();

    const [
      settingsRes,
      servicesRes,
      addonsRes,
      staffRes,
      staffServicesRes,
      schedulesRes,
      rulesRes,
      publicOverridesRes,
      busyIntervalsRes,
      holdsRes,
      calRes,
    ] = await Promise.all([
      supabase.from('salon_settings').select('*').eq('id', 'default').maybeSingle(),
      supabase.from('services').select('*').eq('id', params.serviceId).maybeSingle(),
      supabase.from('service_addons').select('*').eq('is_active', true),
      supabase.from('staff_members').select('*').eq('is_active', true),
      supabase.from('staff_services').select('*'),
      supabase.from('availability_schedules').select('*'),
      supabase.from('availability_rules').select('*'),
      supabase.from('public_busy_overrides').select('*'),
      supabase.from('public_busy_intervals').select('*'),
      supabase.from('slot_holds').select('*').gt('expires_at', nowIso),
      supabase.from('calendar_connections').select('*').eq('is_connected', true),
    ]);

    if (!settingsRes.data) {
      throw new PolicyError('SETTINGS_NOT_FOUND', 'Configuración del salón no encontrada.');
    }
    if (!servicesRes.data) {
      throw new PolicyError('SERVICE_NOT_FOUND', 'Servicio no encontrado.');
    }

    const settings = mapSettingsRow(settingsRes.data);
    const service = mapServiceRow(servicesRes.data);
    const addons = (addonsRes.data ?? [])
      .filter((a) => params.addonIds.includes(a.id))
      .map(mapAddonRow);

    const staffLinks = staffServicesRes.data ?? [];
    const allActiveStaff = (staffRes.data ?? []).map((row) => mapStaffRow(row, staffLinks));
    const eligibleStaff = allActiveStaff.filter(
      (st) => st.serviceIds.length === 0 || st.serviceIds.includes(service.id),
    );
    const schedules = (schedulesRes.data ?? []).map((row) =>
      mapScheduleRow(row, rulesRes.data ?? []),
    );
    const dateOverrides = (publicOverridesRes.data ?? []).map(mapPublicOverrideRow);
    const slotHolds = (holdsRes.data ?? []).map(mapSlotHoldRow);
    const calendarConnections = (calRes.data ?? []).map(mapCalendarConnectionRow);

    const busyBookings: Booking[] = [];
    for (const interval of busyIntervalsRes.data ?? []) {
      if (interval.source_kind !== 'booking') continue;
      if (params.ignoreBookingId && interval.source_id === params.ignoreBookingId) continue;
      const parsedRange = parsePgTstzRange(interval.occupied_range);
      if (!parsedRange) continue;
      busyBookings.push({
        id: interval.source_id,
        bookingCode: '',
        manageToken: '',
        idempotencyKey: null,
        serviceId: service.id,
        staffId: interval.staff_id,
        clientId: '',
        startAt: parsedRange.startAt,
        endAt: parsedRange.endAt,
        occupiedStartAt: parsedRange.startAt,
        occupiedEndAt: parsedRange.endAt,
        totalDurationMinutes: service.durationMinutes,
        subtotalCents: 0,
        discountCents: 0,
        totalPriceCents: 0,
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
        createdAt: interval.updated_at,
        updatedAt: interval.updated_at,
      });
    }

    const ctx: AvailabilityContext = {
      settings,
      service,
      addons,
      staffMembers: eligibleStaff,
      schedules,
      dateOverrides,
      bookings: busyBookings,
      slotHolds,
      calendarConnections,
      now: clock.now(),
      callerSessionToken: params.sessionToken ?? null,
      ignoreBookingId: params.ignoreBookingId ?? null,
    };

    return { settings, service, addons, eligibleStaff, ctx };
  }

  async function getSnapshot(): Promise<Readonly<DemoDatabase>> {
    const supabase = getClient();
    const nowIso = clock.now().toISOString();

    const [
      settingsRes,
      staffRes,
      staffServicesRes,
      adminUsersRes,
      categoriesRes,
      servicesRes,
      addonsRes,
      schedulesRes,
      rulesRes,
      overridesRes,
      calendarsRes,
      clientsRes,
      holdsRes,
      bookingsRes,
      bookingAddonsRes,
      workflowsRes,
      notificationsRes,
      galleryRes,
      couponsRes,
      waitlistRes,
      reviewsRes,
      inventoryRes,
      movementsRes,
      cashRes,
    ] = await Promise.all([
      supabase.from('salon_settings').select('*').eq('id', 'default').maybeSingle(),
      supabase.from('staff_members').select('*'),
      supabase.from('staff_services').select('*'),
      supabase.from('admin_users').select('*'),
      supabase.from('service_categories').select('*'),
      supabase.from('services').select('*'),
      supabase.from('service_addons').select('*'),
      supabase.from('availability_schedules').select('*'),
      supabase.from('availability_rules').select('*'),
      supabase.from('date_overrides').select('*'),
      supabase.from('calendar_connections').select('*'),
      supabase.from('clients').select('*'),
      supabase.from('slot_holds').select('*').gt('expires_at', nowIso),
      supabase.from('bookings').select('*'),
      supabase.from('booking_addons').select('*'),
      supabase.from('notification_workflows').select('*'),
      supabase.from('scheduled_notifications').select('*'),
      supabase.from('gallery_items').select('*'),
      supabase.from('coupons').select('*'),
      supabase.from('waitlist_entries').select('*'),
      supabase.from('booking_reviews').select('*'),
      supabase.from('inventory_items').select('*'),
      supabase.from('inventory_movements').select('*'),
      supabase.from('cash_register_entries').select('*'),
    ]);

    if (!settingsRes.data) {
      throw new PolicyError('SETTINGS_NOT_FOUND', 'Configuración del salón no encontrada.');
    }

    const staffLinks = staffServicesRes.data ?? [];
    const ruleRows = rulesRes.data ?? [];
    const bookingAddonRows = bookingAddonsRes.data ?? [];

    return {
      settings: mapSettingsRow(settingsRes.data),
      staff: (staffRes.data ?? []).map((row) => mapStaffRow(row, staffLinks)),
      adminUsers: (adminUsersRes.data ?? []).map(mapAdminUserRow),
      categories: (categoriesRes.data ?? []).map(mapCategoryRow),
      services: (servicesRes.data ?? []).map(mapServiceRow),
      addons: (addonsRes.data ?? []).map(mapAddonRow),
      schedules: (schedulesRes.data ?? []).map((row) => mapScheduleRow(row, ruleRows)),
      dateOverrides: (overridesRes.data ?? []).map(mapDateOverrideRow),
      calendarConnections: (calendarsRes.data ?? []).map(mapCalendarConnectionRow),
      clients: (clientsRes.data ?? []).map(mapClientRow),
      slotHolds: (holdsRes.data ?? []).map(mapSlotHoldRow),
      bookings: (bookingsRes.data ?? []).map((row) => mapBookingRow(row, bookingAddonRows)),
      workflows: (workflowsRes.data ?? []).map(mapWorkflowRow),
      notifications: (notificationsRes.data ?? []).map(mapNotificationRow),
      gallery: (galleryRes.data ?? []).map(mapGalleryRow),
      coupons: (couponsRes.data ?? []).map(mapCouponRow),
      waitlist: (waitlistRes.data ?? []).map(mapWaitlistRow),
      reviews: (reviewsRes.data ?? []).map(mapReviewRow),
      inventory: (inventoryRes.data ?? []).map(mapInventoryItemRow),
      inventoryMovements: (movementsRes.data ?? []).map(mapInventoryMovementRow),
      cashEntries: (cashRes.data ?? []).map(mapCashEntryRow),
    };
  }

  async function persistScheduledNotifications(
    logs: ScheduledNotification[],
  ): Promise<void> {
    if (logs.length === 0) return;
    const supabase = getClient();
    await supabase.from('scheduled_notifications').insert(
      logs.map((log) => ({
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
      })),
    );
  }

  async function validateCouponCode(
    code: string,
    subtotalCents: number,
  ): Promise<ValidateCouponResult> {
    const supabase = getClient();
    const normalized = code.trim().toUpperCase();
    const { data, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('code', normalized)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) {
      return { valid: false, error: 'Código no válido o inactivo.' };
    }
    const coupon = mapCouponRow(data);
    if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() <= clock.nowMs()) {
      return { valid: false, error: 'Este código ya expiró.' };
    }
    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      return { valid: false, error: 'Este código alcanzó su límite de usos.' };
    }
    if (subtotalCents < coupon.minSubtotalCents) {
      return {
        valid: false,
        error: `Monto mínimo requerido: $${(coupon.minSubtotalCents / 100).toFixed(0)} MXN.`,
      };
    }

    let discountCents = 0;
    if (coupon.kind === 'gift_card') {
      const balance = coupon.remainingBalanceCents ?? coupon.discountValue;
      if (balance <= 0) {
        return { valid: false, error: 'Esta Gift Card ya no tiene saldo disponible.' };
      }
      discountCents = Math.min(subtotalCents, balance);
    } else if (coupon.discountType === 'percent') {
      discountCents = Math.round((subtotalCents * coupon.discountValue) / 100);
    } else {
      discountCents = Math.min(subtotalCents, coupon.discountValue);
    }

    return { valid: true, coupon, discountCents };
  }

  async function getBookingByIdHydrated(bookingId: string): Promise<BookingWithRelations> {
    const snapshot = await getSnapshot();
    const found = snapshot.bookings.find((b) => b.id === bookingId);
    if (!found) {
      throw new PolicyError('BOOKING_NOT_FOUND', 'Cita no encontrada.');
    }
    return hydrateBookingFromSnapshot(snapshot, found);
  }

  return {
    getSnapshot,

    async getPublicBootstrap(): Promise<PublicBootstrapData> {
      const supabase = getClient();
      const [
        settingsRes,
        categoriesRes,
        servicesRes,
        addonsRes,
        staffRes,
        staffServicesRes,
        galleryRes,
        reviewsRes,
      ] = await Promise.all([
        supabase.from('salon_settings').select('*').eq('id', 'default').maybeSingle(),
        supabase.from('service_categories').select('*'),
        supabase.from('services').select('*').eq('is_active', true),
        supabase.from('service_addons').select('*').eq('is_active', true),
        supabase.from('staff_members').select('*').eq('is_active', true),
        supabase.from('staff_services').select('*'),
        supabase.from('gallery_items').select('*'),
        supabase.from('booking_reviews').select('rating'),
      ]);

      if (!settingsRes.data) {
        throw new PolicyError('SETTINGS_NOT_FOUND', 'Configuración del salón no encontrada.');
      }

      const staffLinks = staffServicesRes.data ?? [];
      const ratings = reviewsRes.data ?? [];
      const count = ratings.length;
      const average =
        count > 0
          ? Number(
              (ratings.reduce((sum, r) => sum + r.rating, 0) / count).toFixed(1),
            )
          : 5.0;

      return {
        settings: toPublicSettingsDTO(mapSettingsRow(settingsRes.data)),
        categories: (categoriesRes.data ?? [])
          .map(mapCategoryRow)
          .toSorted((a, b) => a.displayOrder - b.displayOrder),
        services: (servicesRes.data ?? [])
          .map(mapServiceRow)
          .toSorted((a, b) => a.displayOrder - b.displayOrder)
          .map(toPublicServiceDTO),
        addons: (addonsRes.data ?? [])
          .map(mapAddonRow)
          .toSorted((a, b) => a.displayOrder - b.displayOrder),
        staff: (staffRes.data ?? [])
          .map((row) => mapStaffRow(row, staffLinks))
          .toSorted((a, b) => a.displayOrder - b.displayOrder)
          .map(toPublicStaffDTO),
        gallery: (galleryRes.data ?? [])
          .map(mapGalleryRow)
          .toSorted((a, b) => a.displayOrder - b.displayOrder),
        reviewsSummary: { count, average },
      };
    },

    async getBookingsWithRelations(
      role?: AdminRole,
      staffMemberId?: string | null,
    ): Promise<BookingWithRelations[]> {
      const snapshot = await getSnapshot();
      const filtered =
        role === 'specialist' && staffMemberId
          ? snapshot.bookings.filter((b) => b.staffId === staffMemberId)
          : snapshot.bookings;
      return filtered
        .map((b) => hydrateBookingFromSnapshot(snapshot, b))
        .toSorted(
          (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
        );
    },

    async getBookingByToken(token: string): Promise<BookingWithRelations | null> {
      const snapshot = await getSnapshot();
      const found = snapshot.bookings.find((b) => b.manageToken === token);
      return found ? hydrateBookingFromSnapshot(snapshot, found) : null;
    },

    async queryAvailability(
      params: QueryAvailabilityInput,
    ): Promise<QueryAvailabilityOutput> {
      const { settings, service, addons, eligibleStaff, ctx } =
        await loadPublicAvailabilityContext({
          serviceId: params.serviceId,
          addonIds: params.addonIds,
          sessionToken: params.sessionToken,
          ignoreBookingId: params.ignoreBookingId,
        });

      const days = getAvailabilityForRange(
        ctx,
        params.startDate,
        Math.min(Math.max(params.days, 1), 45),
        params.staffId || null,
      );
      const totals = computeServiceTotals(service, addons);

      return {
        service,
        addons,
        totals,
        activeStaffCount: eligibleStaff.length,
        days,
        timezone: settings.timezone,
      };
    },

    async getNextQuickSlots(
      serviceId: string,
      staffId?: string | null,
    ): Promise<Array<AvailableSlot & { date: string }>> {
      const { settings, ctx } = await loadPublicAvailabilityContext({
        serviceId,
        addonIds: [],
      });
      const found: Array<AvailableSlot & { date: string }> = [];
      for (let i = 0; i < 14 && found.length < 6; i++) {
        const dt = new Date(clock.nowMs() + i * 86_400_000);
        const dateKey = getDateKeyInTimezone(dt, settings.timezone);
        const daySlots = getAvailableSlotsForDate(ctx, dateKey, staffId || null);
        for (const slot of daySlots) {
          found.push({ ...slot, date: dateKey });
          if (found.length >= 6) break;
        }
      }
      return found;
    },

    validateCouponCode,

    async createOrRefreshSlotHold(
      params: CreateSlotHoldInput,
    ): Promise<SlotHoldResult> {
      const supabase = getClient();
      const { settings, ctx } = await loadPublicAvailabilityContext({
        serviceId: params.serviceId,
        addonIds: params.addonIds,
        sessionToken: params.sessionToken,
      });

      const slot = resolveBookableSlotOrThrow({
        ctx,
        startAt: params.startAt,
        staffId: params.staffId,
        ignoreHoldSessionToken: params.sessionToken,
        conflictMessage: 'Ese horario acaba de ser apartado hace unos segundos.',
      });

      await supabase.rpc('purge_expired_slot_holds');
      await supabase
        .from('slot_holds')
        .delete()
        .eq('session_token', params.sessionToken);

      const holdMinutes = settings.slotHoldMinutes || 3;
      const expiresAt = new Date(clock.nowMs() + holdMinutes * 60_000).toISOString();
      const heldRange = `[${slot.occupiedStartAt},${slot.occupiedEndAt})`;

      const { data, error } = await supabase
        .from('slot_holds')
        .insert({
          staff_id: slot.staffId,
          service_id: params.serviceId,
          session_token: params.sessionToken,
          start_at: slot.occupiedStartAt,
          end_at: slot.occupiedEndAt,
          held_range: heldRange,
          expires_at: expiresAt,
        })
        .select('*')
        .single();

      if (error || !data) {
        if (isSlotConflictPgError(error)) {
          const suggestions = findNearestAfterConflict(ctx, slot, slot.staffId);
          throw new SlotConflictError(
            'Ese horario acaba de ser apartado hace unos segundos.',
            suggestions,
          );
        }
        const pgErr = extractPgErrorCode(error);
        throw new PolicyError(pgErr.code || 'HOLD_FAILED', pgErr.message);
      }

      const hold = mapSlotHoldRow(data);
      await dispatchOutboxEvent({
        type: 'Realtime',
        eventType: 'hold_changed',
        payload: { staffId: hold.staffId, startAt: params.startAt },
      });

      return { ...hold, holdId: hold.id };
    },

    async releaseSlotHold(sessionToken: string): Promise<void> {
      const supabase = getClient();
      const { data } = await supabase
        .from('slot_holds')
        .delete()
        .eq('session_token', sessionToken)
        .select('staff_id');
      if (data && data.length > 0) {
        await dispatchOutboxEvent({
          type: 'Realtime',
          eventType: 'hold_changed',
          payload: { staffId: data[0]?.staff_id },
        });
      }
    },

    async createBookingAtomic(
      params: CreateBookingAtomicInput,
    ): Promise<BookingWithRelations> {
      const supabase = getClient();

      if (params.idempotencyKey) {
        const existingRes = await supabase
          .from('bookings')
          .select('id')
          .eq('idempotency_key', params.idempotencyKey)
          .maybeSingle();
        if (existingRes.data?.id) {
          return getBookingByIdHydrated(existingRes.data.id);
        }
      }

      const { settings, service, addons, ctx } = await loadPublicAvailabilityContext({
        serviceId: params.serviceId,
        addonIds: params.addonIds,
        sessionToken: params.sessionToken,
      });

      if (!service.isActive) {
        throw new PolicyError(
          'SERVICE_NOT_FOUND',
          'El servicio seleccionado no está disponible.',
        );
      }

      const slot = resolveBookableSlotOrThrow({
        ctx,
        startAt: params.startAt,
        staffId: params.staffId,
        ignoreHoldSessionToken: params.sessionToken ?? undefined,
        conflictMessage:
          'Ese horario acaba de ser reservado hace unos segundos. Elige uno de los horarios más cercanos sin perder tus datos.',
      });

      const { totalDurationMinutes, subtotalCents } = computeServiceTotals(
        service,
        addons,
      );

      let discountCents = 0;
      let appliedCouponCode: string | null = null;
      let appliedCouponId: string | null = null;
      if (params.couponCode?.trim()) {
        const couponCheck = await validateCouponCode(params.couponCode, subtotalCents);
        if (couponCheck.valid) {
          discountCents = couponCheck.discountCents;
          appliedCouponCode = couponCheck.coupon.code;
          appliedCouponId = couponCheck.coupon.id;
        }
      }

      const phoneE164 = normalizePhoneE164(params.clientPhone);
      const nowIso = clock.now().toISOString();
      const existingClientRes = await supabase
        .from('clients')
        .select('*')
        .eq('phone_e164', phoneE164)
        .maybeSingle();

      let clientId: string;
      if (existingClientRes.data) {
        clientId = existingClientRes.data.id;
        await supabase
          .from('clients')
          .update({
            full_name: params.clientName.trim() || existingClientRes.data.full_name,
            email: params.clientEmail?.trim() || existingClientRes.data.email,
            birthday: params.clientBirthday || existingClientRes.data.birthday,
            updated_at: nowIso,
          })
          .eq('id', clientId);
      } else {
        const insertedClient = await supabase
          .from('clients')
          .insert({
            full_name: params.clientName.trim(),
            phone_e164: phoneE164,
            email: params.clientEmail?.trim() || null,
            birthday: params.clientBirthday || null,
            notes: '',
            no_show_count: 0,
          })
          .select('id')
          .single();
        if (insertedClient.error || !insertedClient.data) {
          throw new PolicyError(
            'CLIENT_UPSERT_FAILED',
            insertedClient.error?.message ?? 'No se pudo registrar a la clienta.',
          );
        }
        clientId = insertedClient.data.id;
      }

      const needsManualConfirm =
        !params.forceConfirmed &&
        (service.requiresConfirmation ||
          (service.depositRequired && settings.paymentMode === 'manual_transfer'));
      const status = needsManualConfirm ? 'pending_confirmation' : 'confirmed';
      const bookingCode = generateBookingCode(clock);
      const manageToken = clock.randomUUID().replace(/-/g, '');
      const totalPriceCents = Math.max(0, subtotalCents - discountCents);
      const depositAmountCents = service.depositRequired ? service.depositAmountCents : 0;

      const { data: createdBookingId, error: rpcError } = await supabase.rpc(
        'create_booking_atomic',
        {
          p_booking_code: bookingCode,
          p_manage_token: manageToken,
          p_idempotency_key: params.idempotencyKey || null,
          p_service_id: service.id,
          p_staff_id: slot.staffId,
          p_client_id: clientId,
          p_start_at: slot.startAt,
          p_end_at: slot.endAt,
          p_occupied_start_at: slot.occupiedStartAt,
          p_occupied_end_at: slot.occupiedEndAt,
          p_total_duration_minutes: totalDurationMinutes,
          p_subtotal_cents: subtotalCents,
          p_discount_cents: discountCents,
          p_total_price_cents: totalPriceCents,
          p_deposit_amount_cents: depositAmountCents,
          p_coupon_code: appliedCouponCode,
          p_coupon_id: appliedCouponId,
          p_status: status,
          p_source: params.source ?? 'web',
          p_client_notes: params.clientNotes?.trim() || '',
          p_inspo_photo_url: params.inspoPhotoUrl || null,
          p_payment_proof_url: params.paymentProofUrl || null,
          p_hold_id: params.holdId ?? null,
          p_session_token: params.sessionToken ?? null,
          p_addons: addons.map((addon) => ({
            addon_id: addon.id,
            name_snapshot: addon.name,
            extra_minutes: addon.extraMinutes,
            extra_price_cents: addon.extraPriceCents,
          })),
        },
      );

      if (rpcError || !createdBookingId) {
        if (isSlotConflictPgError(rpcError)) {
          const suggestions = findNearestAfterConflict(ctx, slot, slot.staffId);
          throw new SlotConflictError(
            'Ese horario acaba de ser reservado hace unos segundos. Elige uno de los horarios más cercanos sin perder tus datos.',
            suggestions,
          );
        }
        const pgErr = extractPgErrorCode(rpcError);
        throw new PolicyError(pgErr.code || 'BOOKING_FAILED', pgErr.message);
      }

      const snapshot = await getSnapshot();
      const createdBooking = snapshot.bookings.find((b) => b.id === createdBookingId);
      if (!createdBooking) {
        throw new PolicyError('BOOKING_NOT_FOUND', 'No se encontró la cita creada.');
      }
      const hydrated = hydrateBookingFromSnapshot(snapshot, createdBooking);
      const connection = snapshot.calendarConnections.find(
        (c) => c.staffId === hydrated.staffId && c.isConnected,
      );

      await dispatchOutboxEvent({
        type: 'SyncCalendar',
        booking: hydrated,
        connection,
        settings: snapshot.settings,
        action: 'create',
        onSynced: async (googleEventId) => {
          if (!googleEventId) return;
          hydrated.googleEventId = googleEventId;
          await supabase
            .from('bookings')
            .update({ google_event_id: googleEventId })
            .eq('id', hydrated.id);
        },
      });

      await dispatchOutboxEvent({
        type: 'Notify',
        booking: hydrated,
        workflows: snapshot.workflows,
        settings: snapshot.settings,
        trigger: 'booking_created',
        onLogs: persistScheduledNotifications,
      });

      await dispatchOutboxEvent({
        type: 'Realtime',
        eventType: 'slot_changed',
        payload: { staffId: hydrated.staffId, startAt: hydrated.startAt },
      });

      return hydrated;
    },

    async updateBookingStatus(
      params: UpdateBookingStatusInput,
    ): Promise<BookingWithRelations> {
      const supabase = getClient();
      const snapshot = await getSnapshot();
      const booking = snapshot.bookings.find((b) => b.id === params.bookingId);
      if (!booking) {
        throw new PolicyError('BOOKING_NOT_FOUND', 'Cita no encontrada.');
      }

      const transition = transitionBookingStatus(booking, params.status);
      if (!transition.ok) {
        throw new PolicyError(transition.code, transition.message);
      }

      const nowIso = clock.now().toISOString();
      const updatePatch: Tables['bookings']['Update'] = {
        status: transition.nextStatus,
        updated_at: nowIso,
      };
      if (params.cancellationReason !== undefined) {
        updatePatch.cancellation_reason = params.cancellationReason;
      }
      if (params.internalNotes !== undefined) {
        updatePatch.internal_notes = params.internalNotes;
      }

      const { error: updateError } = await supabase
        .from('bookings')
        .update(updatePatch)
        .eq('id', booking.id);
      if (updateError) {
        throw new PolicyError('UPDATE_FAILED', updateError.message);
      }

      const updatedBooking: Booking = {
        ...booking,
        status: transition.nextStatus,
        cancellationReason:
          params.cancellationReason !== undefined
            ? params.cancellationReason
            : booking.cancellationReason,
        internalNotes:
          params.internalNotes !== undefined
            ? params.internalNotes
            : booking.internalNotes,
        updatedAt: nowIso,
      };
      const hydrated = hydrateBookingFromSnapshot(snapshot, updatedBooking);
      const connection = snapshot.calendarConnections.find(
        (c) => c.staffId === booking.staffId,
      );

      for (const effect of transition.effects) {
        if (effect.type === 'SyncCalendar') {
          await dispatchOutboxEvent({
            type: 'SyncCalendar',
            booking: hydrated,
            connection,
            settings: snapshot.settings,
            action: effect.action,
            onSynced: async (googleEventId) => {
              hydrated.googleEventId = googleEventId;
              await supabase
                .from('bookings')
                .update({ google_event_id: googleEventId })
                .eq('id', booking.id);
            },
          });
        } else if (effect.type === 'Notify') {
          if (effect.cancelPending) {
            await supabase
              .from('scheduled_notifications')
              .update({ status: 'canceled' })
              .eq('booking_id', booking.id)
              .eq('status', 'pending');
          }
          await dispatchOutboxEvent({
            type: 'Notify',
            booking: hydrated,
            workflows: snapshot.workflows,
            settings: snapshot.settings,
            trigger: effect.trigger,
            onLogs: persistScheduledNotifications,
          });
        } else if (effect.type === 'RecordCash') {
          const existingCash = snapshot.cashEntries.some(
            (e) => e.bookingId === effect.bookingId,
          );
          if (!existingCash) {
            const staff = snapshot.staff.find((s) => s.id === effect.staffId);
            const pct =
              staff?.commissionPercent ?? snapshot.settings.defaultCommissionPercent;
            const commissionCents = Math.round((effect.amountCents * pct) / 100);
            await supabase.from('cash_register_entries').insert({
              booking_id: effect.bookingId,
              staff_id: effect.staffId,
              entry_type: 'service_income',
              description: `${hydrated.service.name} — ${hydrated.client.fullName}`,
              amount_cents: effect.amountCents,
              tip_cents: params.tipCents ?? 0,
              commission_cents: commissionCents,
              payment_method: params.paymentMethod ?? 'card',
              occurred_at: nowIso,
              recorded_by: params.recordedBy ?? 'Admin',
            });
          }
        } else if (effect.type === 'ReleaseCoupon') {
          const coupon = snapshot.coupons.find(
            (c) => c.code.toUpperCase() === effect.couponCode.toUpperCase(),
          );
          if (coupon) {
            await supabase
              .from('coupon_redemptions')
              .update({ status: 'released' })
              .eq('booking_id', booking.id)
              .eq('coupon_id', coupon.id);
            await supabase
              .from('coupons')
              .update({
                used_count: Math.max(0, coupon.usedCount - 1),
                remaining_balance_cents:
                  coupon.kind === 'gift_card'
                    ? Math.min(
                        coupon.discountValue,
                        (coupon.remainingBalanceCents ?? 0) + effect.discountCents,
                      )
                    : coupon.remainingBalanceCents,
              })
              .eq('id', coupon.id);
          }
        } else if (effect.type === 'IncrementNoShow') {
          const client = snapshot.clients.find((c) => c.id === effect.clientId);
          if (client) {
            await supabase
              .from('clients')
              .update({
                no_show_count: client.noShowCount + 1,
                updated_at: nowIso,
              })
              .eq('id', client.id);
          }
        }
      }

      await dispatchOutboxEvent({
        type: 'Realtime',
        eventType: 'slot_changed',
        payload: { staffId: hydrated.staffId, startAt: hydrated.startAt },
      });

      return hydrated;
    },

    async manageClientBookingAction(
      params: ManageClientBookingInput,
    ): Promise<BookingWithRelations> {
      const supabase = getClient();
      const snapshot = await getSnapshot();
      const booking = snapshot.bookings.find((b) => b.manageToken === params.token);
      if (!booking) {
        throw new PolicyError('BOOKING_NOT_FOUND', 'No encontramos esta cita.');
      }
      if (!isActiveBookingStatus(booking.status)) {
        throw new PolicyError(
          'INVALID_TRANSITION',
          'Esta cita ya no puede modificarse.',
        );
      }

      const minHours =
        params.action === 'cancel'
          ? snapshot.settings.minCancelHours
          : snapshot.settings.minRescheduleHours;
      const policyCheck = checkManagePolicyWindow({
        startAtIso: booking.startAt,
        nowMs: clock.nowMs(),
        minHours,
        action: params.action,
      });
      if (!policyCheck.allowed) {
        throw new PolicyError(policyCheck.code, policyCheck.message);
      }

      if (params.action === 'cancel') {
        return this.updateBookingStatus({
          bookingId: booking.id,
          status: 'canceled',
          cancellationReason:
            params.reason || 'Cancelada por la clienta desde link personal',
          recordedBy: 'Clienta',
        });
      }

      if (!params.newStartAt) {
        throw new PolicyError('MISSING_SLOT', 'Selecciona un nuevo horario.');
      }

      const { ctx } = await loadPublicAvailabilityContext({
        serviceId: booking.serviceId,
        addonIds: booking.addons.map((a) => a.addonId),
        ignoreBookingId: booking.id,
      });
      const slot = resolveBookableSlotOrThrow({
        ctx,
        startAt: params.newStartAt,
        staffId: params.newStaffId || booking.staffId,
        ignoreBookingId: booking.id,
        conflictMessage:
          'Ese nuevo horario ya fue ocupado. Prueba con uno de los horarios cercanos.',
      });

      const nowIso = clock.now().toISOString();
      const { error: rescheduleError } = await supabase
        .from('bookings')
        .update({
          staff_id: slot.staffId,
          start_at: slot.startAt,
          end_at: slot.endAt,
          occupied_start_at: slot.occupiedStartAt,
          occupied_end_at: slot.occupiedEndAt,
          occupied_range: `[${slot.occupiedStartAt},${slot.occupiedEndAt})`,
          updated_at: nowIso,
        })
        .eq('id', booking.id);

      if (rescheduleError) {
        if (isSlotConflictPgError(rescheduleError)) {
          const suggestions = findNearestAfterConflict(ctx, slot, slot.staffId);
          throw new SlotConflictError(
            'Ese nuevo horario ya fue ocupado. Prueba con uno de los horarios cercanos.',
            suggestions,
          );
        }
        throw new PolicyError('RESCHEDULE_FAILED', rescheduleError.message);
      }

      await supabase
        .from('scheduled_notifications')
        .update({ status: 'canceled' })
        .eq('booking_id', booking.id)
        .eq('status', 'pending');

      const hydrated = await getBookingByIdHydrated(booking.id);
      const connection = snapshot.calendarConnections.find(
        (c) => c.staffId === hydrated.staffId,
      );

      await dispatchOutboxEvent({
        type: 'SyncCalendar',
        booking: hydrated,
        connection,
        settings: snapshot.settings,
        action: hydrated.googleEventId ? 'update' : 'create',
        onSynced: async (googleEventId) => {
          hydrated.googleEventId = googleEventId;
          await supabase
            .from('bookings')
            .update({ google_event_id: googleEventId })
            .eq('id', hydrated.id);
        },
      });

      await dispatchOutboxEvent({
        type: 'Notify',
        booking: hydrated,
        workflows: snapshot.workflows,
        settings: snapshot.settings,
        trigger: 'booking_rescheduled',
        onLogs: persistScheduledNotifications,
      });

      await dispatchOutboxEvent({
        type: 'Realtime',
        eventType: 'slot_changed',
        payload: { staffId: hydrated.staffId, startAt: hydrated.startAt },
      });

      return hydrated;
    },

    async processDueScheduledNotifications(
      dispatcher: NotificationDispatcher,
      nowMs = clock.nowMs(),
    ): Promise<ProcessDueNotificationsResult> {
      const supabase = getClient();
      const snapshot = await getSnapshot();
      const due = snapshot.notifications.filter(
        (n) => n.status === 'pending' && new Date(n.scheduledFor).getTime() <= nowMs,
      );

      let sentCount = 0;
      let failedCount = 0;
      let canceledCount = 0;

      for (const item of due) {
        const rawBooking = snapshot.bookings.find((b) => b.id === item.bookingId);
        if (
          !rawBooking ||
          rawBooking.status === 'canceled' ||
          rawBooking.status === 'no_show'
        ) {
          await supabase
            .from('scheduled_notifications')
            .update({ status: 'canceled' })
            .eq('id', item.id);
          canceledCount += 1;
          continue;
        }

        const hydrated = hydrateBookingFromSnapshot(snapshot, rawBooking);
        const res = await dispatcher({
          notification: { ...item },
          booking: hydrated,
          settings: snapshot.settings,
        });

        await supabase
          .from('scheduled_notifications')
          .update({
            status: res.status,
            provider_message_id: res.providerMessageId,
            error_message: res.errorMessage,
            sent_at: res.status === 'sent' ? clock.now().toISOString() : null,
          })
          .eq('id', item.id);

        if (res.status === 'sent') sentCount += 1;
        else failedCount += 1;
      }

      return {
        processed: due.length,
        sentCount,
        failedCount,
        canceledCount,
      };
    },

    async enqueueOutboxEvent(
      eventType: string,
      payload: Record<string, unknown>,
      availableAt?: string,
    ): Promise<OutboxEventRecord> {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('outbox_events')
        .insert({
          event_type: eventType,
          payload: JSON.parse(JSON.stringify(payload)),
          status: 'pending',
          available_at: availableAt ?? clock.now().toISOString(),
        })
        .select('*')
        .single();
      if (error || !data) {
        throw new PolicyError(
          'OUTBOX_ENQUEUE_FAILED',
          error?.message ?? 'No se pudo encolar evento outbox.',
        );
      }
      return mapOutboxRow(data);
    },

    async dequeueOutboxEvents(
      limit = 20,
      nowMs = clock.nowMs(),
    ): Promise<OutboxEventRecord[]> {
      const supabase = getClient();
      const nowIso = new Date(nowMs).toISOString();
      const { data, error } = await supabase
        .from('outbox_events')
        .select('*')
        .in('status', ['pending', 'failed'])
        .lte('available_at', nowIso)
        .order('available_at', { ascending: true })
        .limit(limit);
      if (error || !data) return [];

      const claimed: OutboxEventRecord[] = [];
      for (const row of data) {
        const updated = await supabase
          .from('outbox_events')
          .update({
            status: 'processing',
            attempts: row.attempts + 1,
          })
          .eq('id', row.id)
          .in('status', ['pending', 'failed'])
          .select('*')
          .maybeSingle();
        if (updated.data) {
          claimed.push(mapOutboxRow(updated.data));
        }
      }
      return claimed;
    },

    async ackOutboxEvent(id: string): Promise<void> {
      const supabase = getClient();
      await supabase
        .from('outbox_events')
        .update({
          status: 'processed',
          processed_at: clock.now().toISOString(),
          last_error: null,
        })
        .eq('id', id);
    },

    async failOutboxEvent(
      id: string,
      errorMessage: string,
      retryAfterMs = 60_000,
    ): Promise<void> {
      const supabase = getClient();
      await supabase
        .from('outbox_events')
        .update({
          status: 'failed',
          last_error: errorMessage,
          available_at: new Date(clock.nowMs() + retryAfterMs).toISOString(),
        })
        .eq('id', id);
    },

    async updateSalonSettings(
      patch: Partial<SalonSettings>,
    ): Promise<SalonSettings> {
      const supabase = getClient();
      const dbPatch: Tables['salon_settings']['Update'] = {
        updated_at: clock.now().toISOString(),
      };
      if (patch.name !== undefined) dbPatch.name = patch.name;
      if (patch.tagline !== undefined) dbPatch.tagline = patch.tagline;
      if (patch.description !== undefined) dbPatch.description = patch.description;
      if (patch.logoUrl !== undefined) dbPatch.logo_url = patch.logoUrl;
      if (patch.coverImageUrl !== undefined) dbPatch.cover_image_url = patch.coverImageUrl;
      if (patch.address !== undefined) dbPatch.address = patch.address;
      if (patch.mapsUrl !== undefined) dbPatch.maps_url = patch.mapsUrl;
      if (patch.instagramHandle !== undefined) {
        dbPatch.instagram_handle = patch.instagramHandle;
      }
      if (patch.whatsappNumber !== undefined) {
        dbPatch.whatsapp_number = patch.whatsappNumber;
      }
      if (patch.contactEmail !== undefined) dbPatch.contact_email = patch.contactEmail;
      if (patch.timezone !== undefined) dbPatch.timezone = patch.timezone;
      if (patch.brandAccentLight !== undefined) {
        dbPatch.brand_accent_light = patch.brandAccentLight;
      }
      if (patch.brandAccentDark !== undefined) {
        dbPatch.brand_accent_dark = patch.brandAccentDark;
      }
      if (patch.defaultPublicMode !== undefined) {
        dbPatch.default_public_mode = patch.defaultPublicMode;
      }
      if (patch.defaultAdminMode !== undefined) {
        dbPatch.default_admin_mode = patch.defaultAdminMode;
      }
      if (patch.cornerStyle !== undefined) dbPatch.corner_style = patch.cornerStyle;
      if (patch.defaultBookingLayout !== undefined) {
        dbPatch.default_booking_layout = patch.defaultBookingLayout;
      }
      if (patch.enabledBookingLayouts !== undefined) {
        dbPatch.enabled_booking_layouts = patch.enabledBookingLayouts;
      }
      if (patch.lockTimezone !== undefined) dbPatch.lock_timezone = patch.lockTimezone;
      if (patch.slotIntervalMinutes !== undefined) {
        dbPatch.slot_interval_minutes = patch.slotIntervalMinutes;
      }
      if (patch.enableSlotHold !== undefined) {
        dbPatch.enable_slot_hold = patch.enableSlotHold;
      }
      if (patch.slotHoldMinutes !== undefined) {
        dbPatch.slot_hold_minutes = patch.slotHoldMinutes;
      }
      if (patch.minBookingNoticeMinutes !== undefined) {
        dbPatch.min_booking_notice_minutes = patch.minBookingNoticeMinutes;
      }
      if (patch.maxBookingDaysAhead !== undefined) {
        dbPatch.max_booking_days_ahead = patch.maxBookingDaysAhead;
      }
      if (patch.minCancelHours !== undefined) {
        dbPatch.min_cancel_hours = patch.minCancelHours;
      }
      if (patch.minRescheduleHours !== undefined) {
        dbPatch.min_reschedule_hours = patch.minRescheduleHours;
      }
      if (patch.cancellationPolicyText !== undefined) {
        dbPatch.cancellation_policy_text = patch.cancellationPolicyText;
      }
      if (patch.bookingInstructionsText !== undefined) {
        dbPatch.booking_instructions_text = patch.bookingInstructionsText;
      }
      if (patch.paymentMode !== undefined) dbPatch.payment_mode = patch.paymentMode;
      if (patch.depositBankName !== undefined) {
        dbPatch.deposit_bank_name = patch.depositBankName;
      }
      if (patch.depositAccountHolder !== undefined) {
        dbPatch.deposit_account_holder = patch.depositAccountHolder;
      }
      if (patch.depositClabe !== undefined) dbPatch.deposit_clabe = patch.depositClabe;
      if (patch.depositInstructions !== undefined) {
        dbPatch.deposit_instructions = patch.depositInstructions;
      }
      if (patch.currency !== undefined) dbPatch.currency = patch.currency;
      if (patch.landingContent !== undefined) {
        dbPatch.landing_content = {
          heroEyebrow: patch.landingContent.heroEyebrow,
          heroTitle: patch.landingContent.heroTitle,
          heroSubtitle: patch.landingContent.heroSubtitle,
          aboutTitle: patch.landingContent.aboutTitle,
          aboutBody: patch.landingContent.aboutBody,
        };
      }
      if (patch.whatsappBookingEnabled !== undefined) {
        dbPatch.whatsapp_booking_enabled = patch.whatsappBookingEnabled;
      }
      if (patch.smsRemindersEnabled !== undefined) {
        dbPatch.sms_reminders_enabled = patch.smsRemindersEnabled;
      }
      if (patch.metaPixelId !== undefined) dbPatch.meta_pixel_id = patch.metaPixelId;
      if (patch.ga4MeasurementId !== undefined) {
        dbPatch.ga4_measurement_id = patch.ga4MeasurementId;
      }
      if (patch.googleReviewUrl !== undefined) {
        dbPatch.google_review_url = patch.googleReviewUrl;
      }
      if (patch.defaultCommissionPercent !== undefined) {
        dbPatch.default_commission_percent = patch.defaultCommissionPercent;
      }

      const { data, error } = await supabase
        .from('salon_settings')
        .update(dbPatch)
        .eq('id', 'default')
        .select('*')
        .single();
      if (error || !data) {
        throw new PolicyError(
          'SETTINGS_UPDATE_FAILED',
          error?.message ?? 'No se pudo actualizar la configuración.',
        );
      }

      await dispatchOutboxEvent({
        type: 'Realtime',
        eventType: 'schedule_changed',
      });
      return mapSettingsRow(data);
    },

    async upsertService(
      input: Partial<Service> & {
        name: string;
        durationMinutes: number;
        priceCents: number;
      },
    ): Promise<Service> {
      const supabase = getClient();
      const nowIso = clock.now().toISOString();
      if (input.id) {
        const { data, error } = await supabase
          .from('services')
          .update({
            category_id: input.categoryId,
            name: input.name,
            slug: input.slug,
            description: input.description,
            duration_minutes: input.durationMinutes,
            price_cents: input.priceCents,
            buffer_before_minutes: input.bufferBeforeMinutes,
            buffer_after_minutes: input.bufferAfterMinutes,
            requires_confirmation: input.requiresConfirmation,
            deposit_required: input.depositRequired,
            deposit_amount_cents: input.depositAmountCents,
            allow_inspo_photo: input.allowInspoPhoto,
            is_active: input.isActive,
            is_featured: input.isFeatured,
            display_order: input.displayOrder,
            image_url: input.imageUrl,
            updated_at: nowIso,
          })
          .eq('id', input.id)
          .select('*')
          .single();
        if (error || !data) {
          throw new PolicyError(
            'SERVICE_UPDATE_FAILED',
            error?.message ?? 'No se pudo actualizar el servicio.',
          );
        }
        await dispatchOutboxEvent({ type: 'Realtime', eventType: 'schedule_changed' });
        return mapServiceRow(data);
      }

      const slug = input.slug || `${slugify(input.name)}-${clock.randomCode(4).toLowerCase()}`;
      const { data, error } = await supabase
        .from('services')
        .insert({
          category_id: input.categoryId ?? null,
          name: input.name,
          slug,
          description: input.description ?? '',
          duration_minutes: input.durationMinutes,
          price_cents: input.priceCents,
          buffer_before_minutes: input.bufferBeforeMinutes ?? 0,
          buffer_after_minutes: input.bufferAfterMinutes ?? 15,
          requires_confirmation: input.requiresConfirmation ?? false,
          deposit_required: input.depositRequired ?? false,
          deposit_amount_cents: input.depositAmountCents ?? 0,
          allow_inspo_photo: input.allowInspoPhoto ?? true,
          is_active: input.isActive ?? true,
          is_featured: input.isFeatured ?? true,
          display_order: input.displayOrder ?? 0,
          image_url: input.imageUrl ?? null,
        })
        .select('*')
        .single();
      if (error || !data) {
        throw new PolicyError(
          'SERVICE_CREATE_FAILED',
          error?.message ?? 'No se pudo crear el servicio.',
        );
      }
      await dispatchOutboxEvent({ type: 'Realtime', eventType: 'schedule_changed' });
      return mapServiceRow(data);
    },

    async upsertAddon(
      input: Partial<ServiceAddon> & {
        name: string;
        extraMinutes: number;
        extraPriceCents: number;
      },
    ): Promise<ServiceAddon> {
      const supabase = getClient();
      const rowPayload = {
        name: input.name,
        description: input.description ?? '',
        extra_minutes: input.extraMinutes,
        extra_price_cents: input.extraPriceCents,
        applies_to_all: input.appliesToAll ?? true,
        service_ids: input.serviceIds ?? [],
        is_active: input.isActive ?? true,
        display_order: input.displayOrder ?? 0,
      };
      const query = input.id
        ? supabase
            .from('service_addons')
            .update(rowPayload)
            .eq('id', input.id)
            .select('*')
            .single()
        : supabase.from('service_addons').insert(rowPayload).select('*').single();

      const { data, error } = await query;
      if (error || !data) {
        throw new PolicyError(
          'ADDON_UPSERT_FAILED',
          error?.message ?? 'No se pudo guardar el extra.',
        );
      }
      return mapAddonRow(data);
    },

    async saveStaffSchedule(
      staffId: string,
      rules: AvailabilityRule[],
    ): Promise<void> {
      const supabase = getClient();
      const existing = await supabase
        .from('availability_schedules')
        .select('id')
        .eq('staff_id', staffId)
        .eq('is_default', true)
        .maybeSingle();

      let scheduleId = existing.data?.id;
      if (!scheduleId) {
        const created = await supabase
          .from('availability_schedules')
          .insert({ staff_id: staffId, name: 'Horario habitual', is_default: true })
          .select('id')
          .single();
        if (created.error || !created.data) {
          throw new PolicyError(
            'SCHEDULE_CREATE_FAILED',
            created.error?.message ?? 'No se pudo crear horario.',
          );
        }
        scheduleId = created.data.id;
      }

      await supabase.from('availability_rules').delete().eq('schedule_id', scheduleId);
      if (rules.length > 0) {
        await supabase.from('availability_rules').insert(
          rules.map((r) => ({
            schedule_id: scheduleId,
            day_of_week: r.dayOfWeek,
            start_time: r.startTime,
            end_time: r.endTime,
          })),
        );
      }

      await dispatchOutboxEvent({
        type: 'Realtime',
        eventType: 'schedule_changed',
        payload: { staffId },
      });
    },

    async addDateOverride(override: Omit<DateOverride, 'id'>): Promise<DateOverride> {
      const supabase = getClient();
      await supabase
        .from('date_overrides')
        .delete()
        .eq('staff_id', override.staffId)
        .eq('override_date', override.overrideDate);

      const { data, error } = await supabase
        .from('date_overrides')
        .insert({
          staff_id: override.staffId,
          override_date: override.overrideDate,
          is_unavailable: override.isUnavailable,
          start_time: override.startTime,
          end_time: override.endTime,
          reason: override.reason,
        })
        .select('*')
        .single();
      if (error || !data) {
        throw new PolicyError(
          'OVERRIDE_CREATE_FAILED',
          error?.message ?? 'No se pudo guardar la excepción.',
        );
      }
      await dispatchOutboxEvent({
        type: 'Realtime',
        eventType: 'schedule_changed',
        payload: { staffId: override.staffId, date: override.overrideDate },
      });
      return mapDateOverrideRow(data);
    },

    async deleteDateOverride(id: string): Promise<void> {
      const supabase = getClient();
      await supabase.from('date_overrides').delete().eq('id', id);
      await dispatchOutboxEvent({ type: 'Realtime', eventType: 'schedule_changed' });
    },

    async upsertStaffMember(
      input: Partial<StaffMember> & { name: string },
    ): Promise<StaffMember> {
      const supabase = getClient();
      const nowIso = clock.now().toISOString();
      const query = input.id
        ? supabase
            .from('staff_members')
            .update({
              name: input.name,
              role_title: input.roleTitle,
              bio: input.bio,
              avatar_url: input.avatarUrl,
              booking_slug: input.bookingSlug,
              commission_percent: input.commissionPercent,
              is_active: input.isActive,
              display_order: input.displayOrder,
              updated_at: nowIso,
            })
            .eq('id', input.id)
            .select('*')
            .single()
        : supabase
            .from('staff_members')
            .insert({
              name: input.name,
              role_title: input.roleTitle || 'Nail Artist',
              bio: input.bio || '',
              avatar_url: input.avatarUrl ?? null,
              booking_slug: input.bookingSlug || slugify(input.name),
              commission_percent: input.commissionPercent ?? 30,
              is_active: input.isActive ?? true,
              display_order: input.displayOrder ?? 0,
            })
            .select('*')
            .single();

      const { data, error } = await query;
      if (error || !data) {
        throw new PolicyError(
          'STAFF_UPSERT_FAILED',
          error?.message ?? 'No se pudo guardar especialista.',
        );
      }

      if (input.serviceIds) {
        await supabase.from('staff_services').delete().eq('staff_id', data.id);
        if (input.serviceIds.length > 0) {
          await supabase.from('staff_services').insert(
            input.serviceIds.map((serviceId) => ({
              staff_id: data.id,
              service_id: serviceId,
            })),
          );
        }
      }

      const links = await supabase
        .from('staff_services')
        .select('*')
        .eq('staff_id', data.id);
      return mapStaffRow(data, links.data ?? []);
    },

    async upsertAdminUser(
      input: Omit<AdminUser, 'id' | 'createdAt'> & { id?: string },
    ): Promise<AdminUser> {
      const supabase = getClient();
      const payload = {
        email: input.email.trim().toLowerCase(),
        full_name: input.fullName.trim(),
        role: input.role,
        staff_member_id: input.staffMemberId ?? null,
        is_active: input.isActive ?? true,
        updated_at: clock.now().toISOString(),
      };
      const query = input.id
        ? supabase
            .from('admin_users')
            .update(payload)
            .eq('id', input.id)
            .select('*')
            .single()
        : supabase.from('admin_users').insert(payload).select('*').single();

      const { data, error } = await query;
      if (error || !data) {
        throw new PolicyError(
          'ADMIN_USER_UPSERT_FAILED',
          error?.message ?? 'No se pudo guardar usuario administrador.',
        );
      }
      return mapAdminUserRow(data);
    },

    async updateClientNotes(params: UpdateClientNotesInput): Promise<ClientProfile> {
      const supabase = getClient();
      const patch: Tables['clients']['Update'] = {
        updated_at: clock.now().toISOString(),
      };
      if (params.notes !== undefined) patch.notes = params.notes;
      if (params.birthday !== undefined) patch.birthday = params.birthday;
      if (params.email !== undefined) patch.email = params.email;

      const { data, error } = await supabase
        .from('clients')
        .update(patch)
        .eq('id', params.clientId)
        .select('*')
        .single();
      if (error || !data) {
        throw new PolicyError('CLIENT_NOT_FOUND', 'Clienta no encontrada.');
      }
      return mapClientRow(data);
    },

    async addWaitlistEntry(
      input: Omit<WaitlistEntry, 'id' | 'status' | 'notifiedAt' | 'createdAt'>,
    ): Promise<WaitlistEntry> {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('waitlist_entries')
        .insert({
          service_id: input.serviceId,
          preferred_staff_id: input.preferredStaffId,
          desired_date: input.desiredDate,
          preferred_window: input.preferredWindow,
          client_name: input.clientName,
          client_phone_e164: normalizePhoneE164(input.clientPhoneE164),
          client_email: input.clientEmail,
          notes: input.notes,
          status: 'waiting',
        })
        .select('*')
        .single();
      if (error || !data) {
        throw new PolicyError(
          'WAITLIST_CREATE_FAILED',
          error?.message ?? 'No se pudo registrar en lista de espera.',
        );
      }
      return mapWaitlistRow(data);
    },

    async updateWaitlistStatus(
      id: string,
      status: WaitlistEntry['status'],
    ): Promise<WaitlistEntry> {
      const supabase = getClient();
      const patch: Tables['waitlist_entries']['Update'] = { status };
      if (status === 'notified') {
        patch.notified_at = clock.now().toISOString();
      }
      const { data, error } = await supabase
        .from('waitlist_entries')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (error || !data) {
        throw new PolicyError('WAITLIST_NOT_FOUND', 'Registro no encontrado.');
      }
      return mapWaitlistRow(data);
    },

    async submitBookingReview(params: SubmitReviewInput): Promise<BookingReview> {
      const supabase = getClient();
      const bookingRes = await supabase
        .from('bookings')
        .select('id, client_id, staff_id')
        .eq('manage_token', params.manageToken)
        .maybeSingle();
      if (!bookingRes.data) {
        throw new PolicyError('BOOKING_NOT_FOUND', 'Cita no encontrada.');
      }
      const existing = await supabase
        .from('booking_reviews')
        .select('id')
        .eq('booking_id', bookingRes.data.id)
        .maybeSingle();

      const query = existing.data
        ? supabase
            .from('booking_reviews')
            .update({
              rating: params.rating,
              comment: params.comment,
              clicked_google_review: Boolean(params.clickedGoogleReview),
            })
            .eq('id', existing.data.id)
            .select('*')
            .single()
        : supabase
            .from('booking_reviews')
            .insert({
              booking_id: bookingRes.data.id,
              client_id: bookingRes.data.client_id,
              staff_id: bookingRes.data.staff_id,
              rating: params.rating,
              comment: params.comment,
              clicked_google_review: Boolean(params.clickedGoogleReview),
            })
            .select('*')
            .single();

      const { data, error } = await query;
      if (error || !data) {
        throw new PolicyError(
          'REVIEW_SAVE_FAILED',
          error?.message ?? 'No se pudo guardar reseña.',
        );
      }
      return mapReviewRow(data);
    },

    async upsertCoupon(
      input: Omit<Coupon, 'id' | 'usedCount' | 'createdAt'> & { id?: string },
    ): Promise<Coupon> {
      const supabase = getClient();
      const normalizedCode = input.code.trim().toUpperCase();
      const payload = {
        code: normalizedCode,
        kind: input.kind,
        discount_type: input.discountType,
        discount_value: input.discountValue,
        remaining_balance_cents:
          input.kind === 'gift_card'
            ? (input.remainingBalanceCents ?? input.discountValue)
            : null,
        max_uses: input.maxUses,
        min_subtotal_cents: input.minSubtotalCents,
        expires_at: input.expiresAt,
        recipient_name: input.recipientName,
        is_active: input.isActive,
      };
      const query = input.id
        ? supabase
            .from('coupons')
            .update(payload)
            .eq('id', input.id)
            .select('*')
            .single()
        : supabase.from('coupons').insert(payload).select('*').single();

      const { data, error } = await query;
      if (error || !data) {
        throw new PolicyError(
          'COUPON_UPSERT_FAILED',
          error?.message ?? 'No se pudo guardar el cupón.',
        );
      }
      return mapCouponRow(data);
    },

    async adjustInventoryItem(
      params: AdjustInventoryInput,
    ): Promise<InventoryItem> {
      const supabase = getClient();
      const nowIso = clock.now().toISOString();
      if (params.newItem) {
        const { data, error } = await supabase
          .from('inventory_items')
          .insert({
            sku: params.newItem.sku || null,
            name: params.newItem.name,
            category: params.newItem.category,
            unit: params.newItem.unit,
            stock_quantity: params.newItem.stockQuantity,
            min_stock_alert: params.newItem.minStockAlert,
            cost_cents: params.newItem.costCents,
            retail_price_cents: params.newItem.retailPriceCents,
            is_for_retail: params.newItem.isForRetail,
            is_active: params.newItem.isActive,
            updated_at: nowIso,
          })
          .select('*')
          .single();
        if (error || !data) {
          throw new PolicyError(
            'INVENTORY_CREATE_FAILED',
            error?.message ?? 'No se pudo crear el producto.',
          );
        }
        return mapInventoryItemRow(data);
      }

      if (!params.itemId) {
        throw new PolicyError('ITEM_NOT_FOUND', 'Producto no encontrado.');
      }
      const existingRes = await supabase
        .from('inventory_items')
        .select('*')
        .eq('id', params.itemId)
        .maybeSingle();
      if (!existingRes.data) {
        throw new PolicyError('ITEM_NOT_FOUND', 'Producto no encontrado.');
      }

      const delta = params.delta ?? 0;
      const nextStock = Math.max(
        0,
        Number((Number(existingRes.data.stock_quantity) + delta).toFixed(2)),
      );
      const updatedRes = await supabase
        .from('inventory_items')
        .update({ stock_quantity: nextStock, updated_at: nowIso })
        .eq('id', params.itemId)
        .select('*')
        .single();
      if (updatedRes.error || !updatedRes.data) {
        throw new PolicyError(
          'INVENTORY_UPDATE_FAILED',
          updatedRes.error?.message ?? 'No se pudo ajustar inventario.',
        );
      }

      await supabase.from('inventory_movements').insert({
        item_id: params.itemId,
        delta,
        reason: params.reason ?? 'adjustment',
        notes: params.notes ?? '',
        booking_id: null,
        created_by: params.createdBy ?? 'Admin',
      });

      if (
        params.reason === 'retail_sale' &&
        delta < 0 &&
        existingRes.data.retail_price_cents > 0
      ) {
        const qty = Math.abs(delta);
        await supabase.from('cash_register_entries').insert({
          booking_id: null,
          staff_id: null,
          entry_type: 'product_sale',
          description: `Venta producto: ${existingRes.data.name} (x${qty})`,
          amount_cents: Math.round(existingRes.data.retail_price_cents * qty),
          tip_cents: 0,
          commission_cents: Math.round(existingRes.data.retail_price_cents * qty * 0.1),
          payment_method: 'cash',
          occurred_at: nowIso,
          recorded_by: params.createdBy ?? 'Admin',
        });
      }

      return mapInventoryItemRow(updatedRes.data);
    },

    async addCashEntry(
      input: Omit<CashRegisterEntry, 'id' | 'occurredAt'>,
    ): Promise<CashRegisterEntry> {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('cash_register_entries')
        .insert({
          booking_id: input.bookingId,
          staff_id: input.staffId,
          entry_type: input.entryType,
          description: input.description,
          amount_cents: input.amountCents,
          tip_cents: input.tipCents,
          commission_cents: input.commissionCents,
          payment_method: input.paymentMethod,
          occurred_at: clock.now().toISOString(),
          recorded_by: input.recordedBy,
        })
        .select('*')
        .single();
      if (error || !data) {
        throw new PolicyError(
          'CASH_ENTRY_FAILED',
          error?.message ?? 'No se pudo registrar en caja.',
        );
      }
      return mapCashEntryRow(data);
    },

    async updateWorkflow(
      id: string,
      patch: Partial<NotificationWorkflow>,
    ): Promise<NotificationWorkflow> {
      const supabase = getClient();
      const dbPatch: Tables['notification_workflows']['Update'] = {
        updated_at: clock.now().toISOString(),
      };
      if (patch.name !== undefined) dbPatch.name = patch.name;
      if (patch.triggerEvent !== undefined) dbPatch.trigger_event = patch.triggerEvent;
      if (patch.offsetMinutes !== undefined) dbPatch.offset_minutes = patch.offsetMinutes;
      if (patch.channels !== undefined) dbPatch.channels = patch.channels;
      if (patch.isEnabled !== undefined) dbPatch.is_enabled = patch.isEnabled;
      if (patch.subjectTemplate !== undefined) {
        dbPatch.subject_template = patch.subjectTemplate;
      }
      if (patch.messageTemplate !== undefined) {
        dbPatch.message_template = patch.messageTemplate;
      }

      const { data, error } = await supabase
        .from('notification_workflows')
        .update(dbPatch)
        .eq('id', id)
        .select('*')
        .single();
      if (error || !data) {
        throw new PolicyError('WORKFLOW_NOT_FOUND', 'Workflow no encontrado.');
      }
      return mapWorkflowRow(data);
    },

    async updateCalendarConnection(
      staffId: string,
      patch: Partial<CalendarConnection>,
    ): Promise<CalendarConnection> {
      const supabase = getClient();
      const nowIso = clock.now().toISOString();
      const existing = await supabase
        .from('calendar_connections')
        .select('id')
        .eq('staff_id', staffId)
        .maybeSingle();

      const dbPatch: Tables['calendar_connections']['Update'] = {
        last_synced_at: nowIso,
        updated_at: nowIso,
      };
      if (patch.accountEmail !== undefined) dbPatch.account_email = patch.accountEmail;
      if (patch.destinationCalendarId !== undefined) {
        dbPatch.destination_calendar_id = patch.destinationCalendarId;
      }
      if (patch.conflictCalendarIds !== undefined) {
        dbPatch.conflict_calendar_ids = patch.conflictCalendarIds;
      }
      if (patch.availableCalendars !== undefined) {
        dbPatch.available_calendars = patch.availableCalendars;
      }
      if (patch.externalBusyBlocks !== undefined) {
        dbPatch.external_busy_blocks = patch.externalBusyBlocks;
      }
      if (patch.isConnected !== undefined) dbPatch.is_connected = patch.isConnected;

      const query = existing.data
        ? supabase
            .from('calendar_connections')
            .update(dbPatch)
            .eq('staff_id', staffId)
            .select('*')
            .single()
        : supabase
            .from('calendar_connections')
            .insert({
              staff_id: staffId,
              account_email: patch.accountEmail ?? 'calendario@nails.studio',
              destination_calendar_id: patch.destinationCalendarId ?? 'primary',
              conflict_calendar_ids: patch.conflictCalendarIds ?? ['primary'],
              is_connected: patch.isConnected ?? false,
              last_synced_at: nowIso,
              updated_at: nowIso,
            })
            .select('*')
            .single();

      const { data, error } = await query;
      if (error || !data) {
        throw new PolicyError(
          'CALENDAR_UPDATE_FAILED',
          error?.message ?? 'No se pudo actualizar conexión de Google Calendar.',
        );
      }
      await dispatchOutboxEvent({
        type: 'Realtime',
        eventType: 'schedule_changed',
        payload: { staffId },
      });
      return mapCalendarConnectionRow(data);
    },

    async upsertGalleryItem(
      input: Omit<GalleryItem, 'id' | 'displayOrder'> & { id?: string },
    ): Promise<GalleryItem> {
      const supabase = getClient();
      const payload = {
        title: input.title,
        caption: input.caption,
        category: input.category,
        image_url: input.imageUrl,
        service_id: input.serviceId,
        is_featured: input.isFeatured,
      };
      const query = input.id
        ? supabase
            .from('gallery_items')
            .update(payload)
            .eq('id', input.id)
            .select('*')
            .single()
        : supabase.from('gallery_items').insert(payload).select('*').single();

      const { data, error } = await query;
      if (error || !data) {
        throw new PolicyError(
          'GALLERY_UPSERT_FAILED',
          error?.message ?? 'No se pudo guardar elemento de galería.',
        );
      }
      return mapGalleryRow(data);
    },

    async deleteGalleryItem(id: string): Promise<void> {
      const supabase = getClient();
      await supabase.from('gallery_items').delete().eq('id', id);
    },
  };
}
