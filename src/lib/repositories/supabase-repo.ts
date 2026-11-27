import { getCloudflareContext } from '@opennextjs/cloudflare';
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
import {
  isSafeExternalProofUrl,
  isSafeInternalBookingMediaPath,
  LandingContentSchema,
} from '../contracts';
import { createDefaultWhatsAppTemplates } from '../demo-seed';
import {
  getConfiguredWhatsAppMonthlyQuota,
  getWhatsAppTemplateNameOverrides,
} from '../env';
import {
  getOfficialWhatsAppTemplateSpec,
  sanitizeWhatsAppTemplateName,
} from '../integrations/whatsapp-templates';
import {
  getDateKeyInTimezone,
  normalizePhoneE164,
  phonesMatchE164,
  slugify,
} from '../format';
import { logError } from '../logger';
import { computeClientLoyaltySummary } from '../loyalty/stamps';
import { shouldSkipWhatsappCascade } from '../notifications/cascade';
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
import {
  PublicLoyaltySummarySchema,
  toPublicServiceDTO,
  toPublicSettingsDTO,
  toPublicStaffDTO,
  type PublicLoyaltySummaryDTO,
} from '../public-dto';
import { dispatchOutboxEvent } from '../use-cases/outbox';
import { MediaValidationError, storeMediaUpload } from '../storage/media';
import type {
  AdminRole,
  AdminUser,
  AuditLogEntry,
  AvailabilityRule,
  AvailabilitySchedule,
  Booking,
  BookingLayoutView,
  BookingPayment,
  BookingReview,
  BookingWithRelations,
  CalendarConnection,
  CashRegisterEntry,
  ClientProfile,
  ConsentRecord,
  Coupon,
  CouponRedemption,
  DateOverride,
  DemoDatabase,
  FunnelEventRecord,
  GalleryItem,
  InventoryItem,
  InventoryMovement,
  LoyaltyProgram,
  LoyaltyStamp,
  MediaAccessOwner,
  MediaAssetFolder,
  MediaAssetRecord,
  NotificationChannel,
  NotificationWorkflow,
  PaymentSplit,
  RecurringBlock,
  SalonSettings,
  ScheduledNotification,
  Service,
  ServiceAddon,
  ServiceCategory,
  SlotHold,
  StaffMember,
  WaitlistEntry,
  WhatsAppMessage,
  WhatsAppMonthlyUsage,
  WhatsAppMonthlyUsageSummary,
  WhatsAppQuotaAlertLevel,
  WhatsAppTemplateConfig,
  WhatsAppTemplateTriggerKey,
  WhatsAppThread,
} from '../types';
import type { Database } from './database.types';
import { createSupabaseAdminClient } from './supabase-client';
import {
  PolicyError,
  SlotConflictError,
  type AdjustInventoryInput,
  type AwardLoyaltyStampInput,
  type CleanupExpiredSlotHoldsResult,
  type CreateBookingAtomicInput,
  type CreateSlotHoldInput,
  type GetWhatsAppThreadDetailParams,
  type ListScheduledNotificationsParams,
  type ListWhatsAppThreadsParams,
  type ManageClientBookingInput,
  type NotificationDispatcher,
  type OutboxEventRecord,
  type OutboxSummary,
  type ProcessDueNotificationsResult,
  type PublicBootstrapData,
  type QueryAvailabilityInput,
  type QueryAvailabilityOutput,
  type RecordConsentInput,
  type RecordPaymentSplitsInput,
  type RecordWhatsAppMessageInput,
  type RegisterMediaAssetInput,
  type ResolveRetriedWhatsAppMessageInput,
  type SalonRepository,
  type SlotHoldResult,
  type SubmitReviewInput,
  type UpdateBookingStatusInput,
  type UpdateClientNotesInput,
  type UpdateScheduledNotificationStatusInput,
  type UpdateWhatsAppMessageStatusInput,
  type ValidateCouponResult,
  type WhatsAppThreadDetailData,
  type WriteAuditLogInput,
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
  const base = {
    heroEyebrow: asString(raw.heroEyebrow),
    heroTitle: asString(raw.heroTitle),
    heroSubtitle: asString(raw.heroSubtitle),
    aboutTitle: asString(raw.aboutTitle),
    aboutBody: asString(raw.aboutBody),
  };
  const parsed = LandingContentSchema.safeParse({
    ...raw,
    ...base,
  });
  return parsed.success ? parsed.data : base;
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
    ...(row.sister_studio_handle ? { sisterStudioHandle: row.sister_studio_handle } : {}),
    whatsappNumber: row.whatsapp_number,
    contactEmail: row.contact_email,
    timezone: row.timezone,
    brandAccentLight: row.brand_accent_light,
    brandAccentDark: row.brand_accent_dark,
    defaultPublicMode: row.default_public_mode,
    defaultAdminMode: row.default_admin_mode,
    cornerStyle: row.corner_style,
    publicPalette: row.public_palette ?? 'laikona',
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
    ...(row.deposit_beneficiary ? { depositBeneficiary: row.deposit_beneficiary } : {}),
    depositClabe: row.deposit_clabe ?? '',
    ...(typeof row.deposit_amount_cents === 'number'
      ? { depositAmountCents: row.deposit_amount_cents }
      : {}),
    depositInstructions: row.deposit_instructions ?? '',
    currency: row.currency === 'USD' ? 'USD' : 'MXN',
    ...(row.service_mode ? { serviceMode: row.service_mode } : {}),
    ...(row.business_type ? { businessType: row.business_type } : {}),
    ...(row.team_size_tier ? { teamSizeTier: row.team_size_tier } : {}),
    ...(typeof row.onboarding_completed === 'boolean'
      ? { onboardingCompleted: row.onboarding_completed }
      : {}),
    ...(typeof row.sound_alerts_enabled === 'boolean'
      ? { soundAlertsEnabled: row.sound_alerts_enabled }
      : {}),
    ...(typeof row.lock_past_bookings === 'boolean'
      ? { lockPastBookings: row.lock_past_bookings }
      : {}),
    ...(typeof row.max_active_bookings_per_client === 'number'
      ? { maxActiveBookingsPerClient: row.max_active_bookings_per_client }
      : {}),
    ...(row.privacy_policy_version
      ? { privacyPolicyVersion: row.privacy_policy_version }
      : {}),
    ...(typeof row.optimize_continuous_slots === 'boolean'
      ? { optimizeContinuousSlots: row.optimize_continuous_slots }
      : {}),
    landingContent: mapLandingContent(row.landing_content),
    whatsappBookingEnabled: row.whatsapp_booking_enabled,
    smsRemindersEnabled: row.sms_reminders_enabled,
    ...(row.retention_notice_email !== undefined
      ? { retentionNoticeEmail: row.retention_notice_email }
      : {}),
    ...(typeof row.whatsapp_monthly_quota === 'number'
      ? { whatsappMonthlyQuota: row.whatsapp_monthly_quota }
      : {}),
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
    ...(typeof row.is_starting_price === 'boolean'
      ? { isStartingPrice: row.is_starting_price }
      : {}),
    bufferBeforeMinutes: row.buffer_before_minutes,
    bufferAfterMinutes: row.buffer_after_minutes,
    requiresConfirmation: row.requires_confirmation,
    depositRequired: row.deposit_required,
    depositAmountCents: row.deposit_amount_cents,
    allowInspoPhoto: row.allow_inspo_photo,
    isActive: row.is_active,
    isFeatured: row.is_featured,
    ...(typeof row.is_private === 'boolean' ? { isPrivate: row.is_private } : {}),
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
        ...(Array.isArray(r.fixed_start_times) && r.fixed_start_times.length > 0
          ? { fixedStartTimes: r.fixed_start_times }
          : {}),
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
    ...(row.public_note ? { publicNote: row.public_note } : {}),
    ...(row.redirect_staff_id !== undefined
      ? { redirectStaffId: row.redirect_staff_id }
      : {}),
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
    ...(row.public_note ? { publicNote: row.public_note } : {}),
    ...(row.redirect_staff_id !== undefined
      ? { redirectStaffId: row.redirect_staff_id }
      : {}),
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
    accessTokenEncrypted: row.access_token_encrypted,
    refreshTokenEncrypted: row.refresh_token_encrypted,
    tokenExpiresAt: row.token_expires_at,
    watchChannelId: row.watch_channel_id,
    watchResourceId: row.watch_resource_id,
    watchExpiration: row.watch_expiration,
  };
}

function mapClientRow(row: Tables['clients']['Row']): ClientProfile {
  return {
    id: row.id,
    fullName: row.full_name,
    phoneE164: row.phone_e164,
    email: row.email,
    ...(row.instagram_handle ? { instagramHandle: row.instagram_handle } : {}),
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
    ...(Array.isArray(row.extra_service_ids) && row.extra_service_ids.length > 0
      ? { extraServiceIds: row.extra_service_ids }
      : {}),
    staffId: row.staff_id,
    clientId: row.client_id,
    ...(row.client_instagram ? { clientInstagram: row.client_instagram } : {}),
    startAt: row.start_at,
    endAt: row.end_at,
    occupiedStartAt: row.occupied_start_at,
    occupiedEndAt: row.occupied_end_at,
    totalDurationMinutes: row.total_duration_minutes,
    ...(typeof row.custom_duration_minutes === 'number'
      ? { customDurationMinutes: row.custom_duration_minutes }
      : {}),
    subtotalCents: row.subtotal_cents,
    discountCents: row.discount_cents,
    totalPriceCents: row.total_price_cents,
    ...(typeof row.custom_price_cents === 'number'
      ? { customPriceCents: row.custom_price_cents }
      : {}),
    depositAmountCents: row.deposit_amount_cents,
    couponCode: row.coupon_code,
    status: row.status,
    ...(row.attendance_status !== undefined
      ? { attendanceStatus: row.attendance_status }
      : {}),
    ...(row.attendance_confirmed_at !== undefined
      ? { attendanceConfirmedAt: row.attendance_confirmed_at }
      : {}),
    ...(row.reminder_24h_sent_at !== undefined
      ? { reminder24hSentAt: row.reminder_24h_sent_at }
      : {}),
    ...(row.confirmed_via !== undefined ? { confirmedVia: row.confirmed_via } : {}),
    ...(row.checkout_url !== undefined ? { checkoutUrl: row.checkout_url } : {}),
    source: row.source,
    clientNotes: row.client_notes,
    internalNotes: row.internal_notes,
    inspoPhotoUrl: row.inspo_photo_url,
    paymentProofUrl: row.payment_proof_url,
    ...(row.proof_delivery_method
      ? { proofDeliveryMethod: row.proof_delivery_method }
      : {}),
    ...(row.proof_rejected_at !== undefined
      ? { proofRejectedAt: row.proof_rejected_at }
      : {}),
    ...(row.proof_rejection_reason !== undefined
      ? { proofRejectionReason: row.proof_rejection_reason }
      : {}),
    ...(row.touchup_invited_at !== undefined
      ? { touchupInvitedAt: row.touchup_invited_at }
      : {}),
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
    clientId: row.client_id ?? null,
    workflowId: row.workflow_id,
    triggerKey:
      row.trigger_key && isWhatsAppTriggerKey(row.trigger_key)
        ? row.trigger_key
        : null,
    channel: row.channel,
    recipient: row.recipient,
    scheduledFor: row.scheduled_for,
    status: row.status,
    deliveryStatus: row.delivery_status ?? null,
    subject: row.subject,
    previewText: row.preview_text,
    bodyText: row.body_text || row.preview_text,
    providerMessageId: row.provider_message_id,
    errorMessage: row.error_message,
    attempts: row.attempts ?? 0,
    maxAttempts: row.max_attempts ?? 3,
    nextRetryAt: row.next_retry_at ?? null,
    lastAttemptAt: row.last_attempt_at ?? null,
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
    ...(row.priority_offer_token !== undefined
      ? { priorityOfferToken: row.priority_offer_token }
      : {}),
    ...(row.priority_offer_expires_at !== undefined
      ? { priorityOfferExpiresAt: row.priority_offer_expires_at }
      : {}),
    ...(row.priority_offer_slot_start_at !== undefined
      ? { priorityOfferSlotStartAt: row.priority_offer_slot_start_at }
      : {}),
    ...(row.priority_offer_staff_id !== undefined
      ? { priorityOfferStaffId: row.priority_offer_staff_id }
      : {}),
    createdAt: row.created_at,
  };
}

function mapFunnelEventRow(
  row: Tables['funnel_events']['Row'],
): FunnelEventRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    eventType: row.event_type,
    serviceSlug: row.service_slug,
    staffSlug: row.staff_slug,
    createdAt: row.created_at,
  };
}

function mapBookingPaymentStatus(
  status: Tables['booking_payments']['Row']['status'],
): BookingPayment['status'] {
  if (status === 'paid') return 'approved';
  if (status === 'failed') return 'rejected';
  return status;
}

function mapBookingPaymentRow(row: Tables['booking_payments']['Row']): BookingPayment {
  return {
    id: row.id,
    bookingId: row.booking_id,
    provider: row.provider,
    amountCents: row.amount_cents,
    currency: row.currency === 'USD' ? 'USD' : 'MXN',
    status: mapBookingPaymentStatus(row.status),
    providerPaymentId: row.provider_payment_id,
    checkoutUrl: row.checkout_url ?? null,
    createdAt: row.created_at,
    updatedAt: row.paid_at ?? row.created_at,
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

function mapAuditMetadata(
  raw: unknown,
): Record<string, string | number | boolean | null> {
  if (!isRecord(raw)) return {};
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (
      val === null ||
      typeof val === 'string' ||
      typeof val === 'number' ||
      typeof val === 'boolean'
    ) {
      out[key] = val;
    }
  }
  return out;
}

function mapPaymentSplitRow(row: Tables['payment_splits']['Row']): PaymentSplit {
  return {
    id: row.id,
    bookingId: row.booking_id,
    method: row.method,
    amountCents: row.amount_cents,
    tipCents: row.tip_cents,
    tipStaffId: row.tip_staff_id,
    ...(row.reference ? { reference: row.reference } : {}),
    createdAt: row.created_at,
  };
}

function mapRecurringBlockRow(row: Tables['recurring_blocks']['Row']): RecurringBlock {
  return {
    id: row.id,
    staffId: row.staff_id,
    reason: row.reason,
    frequency: row.frequency,
    weekdays: Array.isArray(row.weekdays) ? row.weekdays : [],
    dayOfMonth: row.day_of_month,
    startTime: row.start_time,
    endTime: row.end_time,
    untilDate: row.until_date,
    isActive: row.is_active,
  };
}

function mapLoyaltyProgramRow(row: Tables['loyalty_programs']['Row']): LoyaltyProgram {
  return {
    id: row.id,
    isActive: row.is_active,
    name: row.name,
    stampsRequired: row.stamps_required,
    rewardType: row.reward_type,
    rewardServiceId: row.reward_service_id,
    discountPercent: row.discount_percent,
    maxDiscountCents: row.max_discount_cents,
    validDays: row.valid_days,
  };
}

function mapLoyaltyStampRow(row: Tables['loyalty_stamps']['Row']): LoyaltyStamp {
  return {
    id: row.id,
    clientId: row.client_id,
    bookingId: row.booking_id,
    programId: row.program_id,
    stampedDate: row.stamped_date,
    createdAt: row.created_at,
  };
}

function mapCouponRedemptionRow(
  row: Tables['coupon_redemptions']['Row'],
): CouponRedemption {
  return {
    id: row.id,
    couponId: row.coupon_id,
    bookingId: row.booking_id,
    clientId: row.client_id,
    amountCents: row.amount_cents,
    status: row.status,
    createdAt: row.created_at,
    releasedAt: row.released_at ?? null,
  };
}

function mapConsentRow(row: Tables['consents']['Row']): ConsentRecord {
  return {
    id: row.id,
    clientId: row.client_id,
    bookingId: row.booking_id,
    policyVersion: row.policy_version,
    acceptedAt: row.accepted_at,
    marketingOptIn: row.marketing_opt_in,
  };
}

function mapAuditLogRow(row: Tables['audit_logs']['Row']): AuditLogEntry {
  return {
    id: row.id,
    actorId: row.actor_id,
    actorEmail: row.actor_email,
    actorRole: row.actor_role,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: mapAuditMetadata(row.metadata),
    createdAt: row.created_at,
  };
}

const MONTH_KEY_RE = /^\d{4}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toUuidOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return UUID_RE.test(trimmed) ? trimmed : null;
}

const VALID_WHATSAPP_TRIGGERS = new Set<WhatsAppTemplateTriggerKey>([
  'booking_confirmed',
  'reminder_24h',
  'reminder_2h',
  'booking_rescheduled',
  'booking_canceled',
  'waitlist_offer',
  'deposit_rejected',
  'client_otp',
  'touchup_invite',
]);

function isWhatsAppTriggerKey(value: string): value is WhatsAppTemplateTriggerKey {
  return VALID_WHATSAPP_TRIGGERS.has(value as WhatsAppTemplateTriggerKey);
}

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

function mapMediaAssetRow(row: Tables['media_assets']['Row']): MediaAssetRecord {
  return {
    id: row.id,
    storagePath: row.storage_path,
    folder: row.folder,
    bookingId: row.booking_id,
    clientId: row.client_id,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    retentionWarned30dAt: row.retention_warned_30d_at,
    retentionWarned7dAt: row.retention_warned_7d_at,
    purgedAt: row.purged_at,
  };
}

function mapWhatsAppTemplateRow(
  row: Tables['whatsapp_templates']['Row'],
): WhatsAppTemplateConfig | null {
  if (!isWhatsAppTriggerKey(row.trigger_key)) return null;
  return {
    id: row.id,
    triggerKey: row.trigger_key,
    templateName: row.template_name,
    category: row.category,
    languageCode: row.language_code,
    isActive: row.is_active,
    updatedAt: row.updated_at,
  };
}

function mapWhatsAppMonthlyUsageRow(
  row: Tables['whatsapp_monthly_usage']['Row'],
): WhatsAppMonthlyUsage {
  return {
    monthKey: row.month_key,
    sentCount: row.sent_count,
    quotaLimit: row.quota_limit,
    warned80At: row.warned_80_at,
    warned100At: row.warned_100_at,
    updatedAt: row.updated_at,
  };
}

function mapWhatsAppThreadRow(
  row: Tables['whatsapp_threads']['Row'],
): WhatsAppThread {
  return {
    id: row.id,
    phoneE164: row.phone_e164,
    clientId: row.client_id,
    contactName: row.contact_name,
    lastMessageAt: row.last_message_at,
    lastMessagePreview: row.last_message_preview,
    lastMessageDirection: row.last_message_direction,
    lastInboundAt: row.last_inbound_at,
    unreadCount: row.unread_count,
    lastReadAt: row.last_read_at,
    hasFailedMessages: row.has_failed_messages,
    isArchived: row.is_archived,
    assignedStaffId: row.assigned_staff_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapWhatsAppMessageRow(
  row: Tables['whatsapp_messages']['Row'],
): WhatsAppMessage {
  const params = Array.isArray(row.template_params)
    ? row.template_params.filter((v): v is string => typeof v === 'string')
    : [];
  return {
    id: row.id,
    threadId: row.thread_id,
    phoneE164: row.phone_e164,
    clientId: row.client_id,
    bookingId: row.booking_id,
    notificationId: row.notification_id,
    direction: row.direction,
    senderKind: row.sender_kind,
    senderName: row.sender_name,
    messageType: row.message_type,
    bodyText: row.body_text,
    templateName: row.template_name,
    templateTriggerKey:
      row.template_trigger_key && isWhatsAppTriggerKey(row.template_trigger_key)
        ? row.template_trigger_key
        : null,
    templateParams: params,
    deliveryStatus: row.delivery_status,
    deliveryMode: row.delivery_mode,
    providerMessageId: row.provider_message_id,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    sentAt: row.sent_at,
    deliveredAt: row.delivered_at,
    readAt: row.read_at,
    failedAt: row.failed_at,
    createdAt: row.created_at,
  };
}

function phoneLookupVariants(canonicalPhone: string): string[] {
  const variants = new Set<string>([canonicalPhone]);
  const digits = canonicalPhone.replace(/\D/g, '');
  if (digits.startsWith('52') && digits.length === 12) {
    variants.add(`+521${digits.slice(2)}`);
  } else if (digits.startsWith('521') && digits.length === 13) {
    variants.add(`+52${digits.slice(3)}`);
  }
  return Array.from(variants);
}

function isSupabaseScheduledNotificationDue(
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

function normalizeOptionalInstagram(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const stripped = trimmed
    .replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, '')
    .replace(/^(?:www\.)?instagram\.com\//i, '')
    .replace(/[/?#].*$/, '')
    .replace(/^@+/, '')
    .trim();
  return stripped ? `@${stripped.toLowerCase()}` : null;
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

const POST_COMMIT_SIDE_EFFECT_MAX_WAIT_MS = 2500;

function tryRegisterWorkerWaitUntil(promise: Promise<unknown>): boolean {
  try {
    const cfContext: unknown = getCloudflareContext();
    if (!cfContext || typeof cfContext !== 'object') {
      return false;
    }
    const execCtx: unknown = Reflect.get(cfContext, 'ctx');
    if (!execCtx || typeof execCtx !== 'object') {
      return false;
    }
    const waitUntil: unknown = Reflect.get(execCtx, 'waitUntil');
    if (typeof waitUntil !== 'function') {
      return false;
    }
    Reflect.apply(waitUntil, execCtx, [promise]);
    return true;
  } catch {
    return false;
  }
}

export async function runPostCommitSideEffects(
  task: Promise<void>,
  maxWaitMs = POST_COMMIT_SIDE_EFFECT_MAX_WAIT_MS,
): Promise<void> {
  const safeTask = task.catch((err) => {
    logError('booking_post_commit_side_effects_failed', { error: err });
  });
  const registeredInWorker = tryRegisterWorkerWaitUntil(safeTask);
  if (!registeredInWorker) {
    await safeTask;
    return;
  }
  let timerId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<void>((resolve) => {
    timerId = setTimeout(resolve, maxWaitMs);
  });
  try {
    await Promise.race([safeTask, timeoutPromise]);
  } finally {
    if (timerId !== null) {
      clearTimeout(timerId);
    }
  }
}

async function hydrateBookingRowWithClient(
  supabase: SupabaseClient<Database>,
  bookingRow: Tables['bookings']['Row'],
): Promise<BookingWithRelations> {
  const [
    bookingAddonsRes,
    serviceRes,
    staffRes,
    staffServicesRes,
    clientRes,
    reviewRes,
  ] = await Promise.all([
    supabase.from('booking_addons').select('*').eq('booking_id', bookingRow.id),
    supabase.from('services').select('*').eq('id', bookingRow.service_id).maybeSingle(),
    supabase.from('staff_members').select('*').eq('id', bookingRow.staff_id).maybeSingle(),
    supabase.from('staff_services').select('*').eq('staff_id', bookingRow.staff_id),
    supabase.from('clients').select('*').eq('id', bookingRow.client_id).maybeSingle(),
    supabase.from('booking_reviews').select('*').eq('booking_id', bookingRow.id).maybeSingle(),
  ]);

  const booking = mapBookingRow(bookingRow, bookingAddonsRes.data ?? []);
  const service = serviceRes.data
    ? mapServiceRow(serviceRes.data)
    : buildFallbackServiceForBooking(booking);
  const staff = staffRes.data
    ? mapStaffRow(staffRes.data, staffServicesRes.data ?? [])
    : buildFallbackStaffForBooking(booking);
  const client = clientRes.data
    ? mapClientRow(clientRes.data)
    : buildFallbackClientForBooking(booking);
  const review = reviewRes.data ? mapReviewRow(reviewRes.data) : null;

  return { ...booking, service, staff, client, review };
}

function buildFallbackServiceForBooking(booking: Booking): Service {
  return {
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
}

function buildFallbackStaffForBooking(
  booking: Booking,
  defaultCommissionPercent = 35,
): StaffMember {
  return {
    id: booking.staffId,
    name: 'Profesional',
    roleTitle: 'Nail Artist',
    bio: '',
    avatarUrl: null,
    bookingSlug: 'especialista',
    commissionPercent: defaultCommissionPercent,
    isActive: true,
    displayOrder: 0,
    serviceIds: [],
  };
}

function buildFallbackClientForBooking(booking: Booking): ClientProfile {
  return {
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
}

function hydrateBookingFromSnapshot(
  db: DemoDatabase,
  booking: Booking,
): BookingWithRelations {
  const service =
    db.services.find((s) => s.id === booking.serviceId) ??
    db.services[0] ??
    buildFallbackServiceForBooking(booking);
  const staff =
    db.staff.find((s) => s.id === booking.staffId) ??
    db.staff[0] ??
    buildFallbackStaffForBooking(booking, db.settings.defaultCommissionPercent);
  const client =
    db.clients.find((c) => c.id === booking.clientId) ??
    buildFallbackClientForBooking(booking);
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

  const requiredServiceIds = [
    ctx.service.id,
    ...(ctx.extraServices ?? []).map((s) => s.id),
  ];

  const eligibleStaff = ctx.staffMembers
    .filter(
      (st) =>
        st.isActive &&
        (st.serviceIds.length === 0 ||
          requiredServiceIds.every((id) => st.serviceIds.includes(id))),
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
    throw new PolicyError('STAFF_INELIGIBLE', 'Profesional no disponible para este servicio.');
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
    extraServiceIds?: string[];
    addonIds: string[];
    sessionToken?: string | null;
    ignoreBookingId?: string | null;
  }): Promise<{
    settings: SalonSettings;
    service: Service;
    extraServices: Service[];
    addons: ServiceAddon[];
    eligibleStaff: StaffMember[];
    ctx: AvailabilityContext;
  }> {
    const supabase = getClient();
    const nowIso = clock.now().toISOString();
    const uniqueExtraIds = Array.from(
      new Set(
        (params.extraServiceIds ?? [])
          .map((id) => id.trim())
          .filter((id) => id.length > 0 && id !== params.serviceId),
      ),
    );

    const [settingsRes, servicesRes, extraServicesRes, addonsRes, staffRes] =
      await Promise.all([
        supabase.from('salon_settings').select('*').eq('id', 'default').maybeSingle(),
        supabase.from('services').select('*').eq('id', params.serviceId).maybeSingle(),
        uniqueExtraIds.length > 0
          ? supabase.from('services').select('*').in('id', uniqueExtraIds).eq('is_active', true)
          : Promise.resolve({ data: [] as Tables['services']['Row'][] }),
        supabase.from('service_addons').select('*').eq('is_active', true),
        supabase.from('staff_members').select('*').eq('is_active', true),
      ]);

    const [staffServicesRes, schedulesRes, rulesRes, publicOverridesRes] =
      await Promise.all([
        supabase.from('staff_services').select('*'),
        supabase.from('availability_schedules').select('*'),
        supabase.from('availability_rules').select('*'),
        supabase.from('public_busy_overrides').select('*'),
      ]);

    const [recurringBlocksRes, busyIntervalsRes, holdsRes, calRes] =
      await Promise.all([
        supabase.from('recurring_blocks').select('*').eq('is_active', true),
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
    const extraServices = (extraServicesRes.data ?? [])
      .filter((row) => uniqueExtraIds.includes(row.id) && row.is_active)
      .map(mapServiceRow);
    if (extraServices.length !== uniqueExtraIds.length) {
      throw new PolicyError(
        'SERVICE_NOT_FOUND',
        'Uno de los servicios adicionales seleccionados no está disponible.',
      );
    }

    const addons = (addonsRes.data ?? [])
      .filter((a) => params.addonIds.includes(a.id))
      .map(mapAddonRow);

    const requiredServiceIds = [service.id, ...extraServices.map((s) => s.id)];
    const staffLinks = staffServicesRes.data ?? [];
    const allActiveStaff = (staffRes.data ?? []).map((row) => mapStaffRow(row, staffLinks));
    const eligibleStaff = allActiveStaff.filter(
      (st) =>
        st.serviceIds.length === 0 ||
        requiredServiceIds.every((id) => st.serviceIds.includes(id)),
    );
    const schedules = (schedulesRes.data ?? []).map((row) =>
      mapScheduleRow(row, rulesRes.data ?? []),
    );
    const dateOverrides = (publicOverridesRes.data ?? []).map(mapPublicOverrideRow);
    const recurringBlocks = (recurringBlocksRes.data ?? []).map(mapRecurringBlockRow);
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
      extraServices,
      addons,
      staffMembers: eligibleStaff,
      schedules,
      dateOverrides,
      recurringBlocks,
      bookings: busyBookings,
      slotHolds,
      calendarConnections,
      now: clock.now(),
      callerSessionToken: params.sessionToken ?? null,
      ignoreBookingId: params.ignoreBookingId ?? null,
    };

    return { settings, service, extraServices, addons, eligibleStaff, ctx };
  }

  async function getSalonSettings(): Promise<SalonSettings> {
    const supabase = getClient();
    const settingsRes = await supabase
      .from('salon_settings')
      .select('*')
      .eq('id', 'default')
      .maybeSingle();

    if (!settingsRes.data) {
      if (settingsRes.error) {
        logError('supabase_salon_settings_error', {
          code: settingsRes.error.code,
          message: settingsRes.error.message,
        });
      }
      throw new PolicyError('SETTINGS_NOT_FOUND', 'Configuración del salón no encontrada.');
    }

    return mapSettingsRow(settingsRes.data);
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
    ] = await Promise.all([
      supabase.from('salon_settings').select('*').eq('id', 'default').maybeSingle(),
      supabase.from('staff_members').select('*'),
      supabase.from('staff_services').select('*'),
      supabase.from('admin_users').select('*'),
      supabase.from('service_categories').select('*'),
      supabase.from('services').select('*'),
    ]);

    if (!settingsRes.data) {
      if (settingsRes.error) {
        logError('supabase_snapshot_settings_error', {
          code: settingsRes.error.code,
          message: settingsRes.error.message,
        });
      }
      throw new PolicyError('SETTINGS_NOT_FOUND', 'Configuración del salón no encontrada.');
    }

    const [
      addonsRes,
      schedulesRes,
      rulesRes,
      overridesRes,
      calendarsRes,
      clientsRes,
    ] = await Promise.all([
      supabase.from('service_addons').select('*'),
      supabase.from('availability_schedules').select('*'),
      supabase.from('availability_rules').select('*'),
      supabase.from('date_overrides').select('*'),
      supabase.from('calendar_connections').select('*'),
      supabase.from('clients').select('*'),
    ]);

    const [
      holdsRes,
      bookingsRes,
      bookingAddonsRes,
      workflowsRes,
      notificationsRes,
      galleryRes,
    ] = await Promise.all([
      supabase.from('slot_holds').select('*').gt('expires_at', nowIso),
      supabase.from('bookings').select('*'),
      supabase.from('booking_addons').select('*'),
      supabase.from('notification_workflows').select('*'),
      supabase.from('scheduled_notifications').select('*'),
      supabase.from('gallery_items').select('*'),
    ]);

    const [
      couponsRes,
      waitlistRes,
      reviewsRes,
      inventoryRes,
      movementsRes,
      cashRes,
    ] = await Promise.all([
      supabase.from('coupons').select('*'),
      supabase.from('waitlist_entries').select('*'),
      supabase.from('booking_reviews').select('*'),
      supabase.from('inventory_items').select('*'),
      supabase.from('inventory_movements').select('*'),
      supabase.from('cash_register_entries').select('*'),
    ]);

    const [
      paymentSplitsRes,
      recurringBlocksRes,
      loyaltyProgramsRes,
      loyaltyStampsRes,
      couponRedemptionsRes,
      consentsRes,
    ] = await Promise.all([
      supabase.from('payment_splits').select('*'),
      supabase.from('recurring_blocks').select('*'),
      supabase.from('loyalty_programs').select('*'),
      supabase.from('loyalty_stamps').select('*'),
      supabase.from('coupon_redemptions').select('*'),
      supabase.from('consents').select('*'),
    ]);

    const [
      auditLogsRes,
      bookingPaymentsRes,
      mediaAssetsRes,
      whatsappTemplatesRes,
      whatsappMonthlyUsageRes,
      funnelEventsRes,
      whatsappThreadsRes,
      whatsappMessagesRes,
    ] = await Promise.all([
      supabase.from('audit_logs').select('*'),
      supabase.from('booking_payments').select('*'),
      supabase.from('media_assets').select('*'),
      supabase.from('whatsapp_templates').select('*'),
      supabase.from('whatsapp_monthly_usage').select('*'),
      supabase.from('funnel_events').select('*'),
      supabase.from('whatsapp_threads').select('*'),
      supabase.from('whatsapp_messages').select('*'),
    ]);

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
      paymentSplits: (paymentSplitsRes.data ?? []).map(mapPaymentSplitRow),
      recurringBlocks: (recurringBlocksRes.data ?? []).map(mapRecurringBlockRow),
      loyaltyPrograms: (loyaltyProgramsRes.data ?? []).map(mapLoyaltyProgramRow),
      loyaltyStamps: (loyaltyStampsRes.data ?? []).map(mapLoyaltyStampRow),
      couponRedemptions: (couponRedemptionsRes.data ?? []).map(mapCouponRedemptionRow),
      consents: (consentsRes.data ?? []).map(mapConsentRow),
      auditLogs: (auditLogsRes.data ?? []).map(mapAuditLogRow),
      bookingPayments: (bookingPaymentsRes.data ?? []).map(mapBookingPaymentRow),
      mediaAssets: (mediaAssetsRes.data ?? []).map(mapMediaAssetRow),
      whatsappTemplates: (whatsappTemplatesRes.data ?? [])
        .map(mapWhatsAppTemplateRow)
        .filter((tpl): tpl is WhatsAppTemplateConfig => tpl !== null),
      whatsappMonthlyUsage: (whatsappMonthlyUsageRes.data ?? []).map(
        mapWhatsAppMonthlyUsageRow,
      ),
      whatsappThreads: (whatsappThreadsRes.data ?? []).map(mapWhatsAppThreadRow),
      whatsappMessages: (whatsappMessagesRes.data ?? []).map(mapWhatsAppMessageRow),
      funnelEvents: (funnelEventsRes.data ?? []).map(mapFunnelEventRow),
    };
  }

  async function registerMediaAssetInternal(
    input: RegisterMediaAssetInput,
  ): Promise<MediaAssetRecord> {
    const supabase = getClient();
    const storagePath = normalizeMediaStoragePath(input.storagePath);
    if (!storagePath) {
      throw new PolicyError('INVALID_MEDIA_URL', 'Ruta de archivo inválida.');
    }
    const existingRes = await supabase
      .from('media_assets')
      .select('*')
      .eq('storage_path', storagePath)
      .maybeSingle();

    if (existingRes.data) {
      const patch: Tables['media_assets']['Update'] = {};
      if (input.bookingId !== undefined && input.bookingId !== null) {
        patch.booking_id = input.bookingId;
      }
      if (input.clientId !== undefined && input.clientId !== null) {
        patch.client_id = input.clientId;
      }
      if (input.contentType) {
        patch.content_type = input.contentType;
      }
      if (input.sizeBytes > 0) {
        patch.size_bytes = Math.floor(input.sizeBytes);
      }
      if (Object.keys(patch).length === 0) {
        return mapMediaAssetRow(existingRes.data);
      }
      const updated = await supabase
        .from('media_assets')
        .update(patch)
        .eq('id', existingRes.data.id)
        .select('*')
        .single();
      if (updated.error || !updated.data) {
        throw new PolicyError(
          'MEDIA_ASSET_UPDATE_FAILED',
          updated.error?.message ?? 'No se pudo actualizar el registro de archivo.',
        );
      }
      return mapMediaAssetRow(updated.data);
    }

    const inserted = await supabase
      .from('media_assets')
      .insert({
        storage_path: storagePath,
        folder: input.folder,
        booking_id: input.bookingId ?? null,
        client_id: input.clientId ?? null,
        content_type: input.contentType,
        size_bytes: Math.max(0, Math.floor(input.sizeBytes)),
        ...(input.createdAt ? { created_at: input.createdAt } : {}),
      })
      .select('*')
      .single();

    if (inserted.error || !inserted.data) {
      throw new PolicyError(
        'MEDIA_ASSET_REGISTER_FAILED',
        inserted.error?.message ?? 'No se pudo registrar el archivo.',
      );
    }
    return mapMediaAssetRow(inserted.data);
  }

  async function resolveQuotaAndMonth(
    monthKey?: string,
  ): Promise<{ targetMonthKey: string; quotaLimit: number }> {
    const supabase = getClient();
    const settingsRes = await supabase
      .from('salon_settings')
      .select('timezone, whatsapp_monthly_quota')
      .eq('id', 'default')
      .maybeSingle();
    const tz = settingsRes.data?.timezone || 'America/Mexico_City';
    const trimmed = monthKey?.trim();
    const targetMonthKey =
      trimmed && MONTH_KEY_RE.test(trimmed)
        ? trimmed
        : getDateKeyInTimezone(clock.now(), tz).slice(0, 7);
    const envQuota = getConfiguredWhatsAppMonthlyQuota();
    const dbQuota =
      typeof settingsRes.data?.whatsapp_monthly_quota === 'number' &&
      settingsRes.data.whatsapp_monthly_quota >= 1
        ? Math.floor(settingsRes.data.whatsapp_monthly_quota)
        : 500;
    const quotaLimit = envQuota !== undefined && envQuota >= 1 ? envQuota : dbQuota;
    return { targetMonthKey, quotaLimit };
  }

  async function persistScheduledNotifications(
    logs: ScheduledNotification[],
  ): Promise<void> {
    if (logs.length === 0) return;
    const supabase = getClient();
    await supabase.from('scheduled_notifications').insert(
      logs.map((log) => ({
        booking_id: log.bookingId,
        client_id: log.clientId ?? null,
        workflow_id: log.workflowId,
        trigger_key: log.triggerKey ?? null,
        channel: log.channel,
        recipient: log.recipient,
        scheduled_for: log.scheduledFor,
        status: log.status,
        delivery_status:
          log.deliveryStatus ??
          (log.status === 'sent'
            ? 'sent'
            : log.status === 'failed'
              ? 'failed'
              : log.status === 'pending'
                ? 'queued'
                : null),
        subject: log.subject,
        preview_text: log.previewText,
        body_text: log.bodyText ?? log.previewText,
        provider_message_id: log.providerMessageId,
        error_message: log.errorMessage,
        attempts: log.attempts ?? (log.status === 'pending' ? 0 : 1),
        max_attempts: log.maxAttempts ?? 3,
        next_retry_at: log.nextRetryAt ?? null,
        last_attempt_at: log.lastAttemptAt ?? (log.sentAt ?? null),
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

  async function hydrateBookingRowTargeted(
    bookingRow: Tables['bookings']['Row'],
  ): Promise<BookingWithRelations> {
    return hydrateBookingRowWithClient(getClient(), bookingRow);
  }

  async function getBookingByIdHydrated(bookingId: string): Promise<BookingWithRelations> {
    const supabase = getClient();
    const bookingRes = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .maybeSingle();
    if (!bookingRes.data) {
      throw new PolicyError('BOOKING_NOT_FOUND', 'Cita no encontrada.');
    }
    return hydrateBookingRowTargeted(bookingRes.data);
  }

  return {
    getSalonSettings,
    getSnapshot,

    async getPublicBootstrap(): Promise<PublicBootstrapData> {
      const supabase = getClient();
      const [settingsRes, categoriesRes, servicesRes, addonsRes] = await Promise.all([
        supabase.from('salon_settings').select('*').eq('id', 'default').maybeSingle(),
        supabase.from('service_categories').select('*'),
        supabase.from('services').select('*').eq('is_active', true),
        supabase.from('service_addons').select('*').eq('is_active', true),
      ]);
      const [staffRes, staffServicesRes, galleryRes, reviewsRes] = await Promise.all([
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
          .filter((s) => s.isPrivate !== true)
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
      const supabase = getClient();
      const bookingRes = await supabase
        .from('bookings')
        .select('*')
        .eq('manage_token', token)
        .maybeSingle();
      if (!bookingRes.data) {
        return null;
      }
      return hydrateBookingRowTargeted(bookingRes.data);
    },

    async queryAvailability(
      params: QueryAvailabilityInput,
    ): Promise<QueryAvailabilityOutput> {
      const { settings, service, extraServices, addons, eligibleStaff, ctx } =
        await loadPublicAvailabilityContext({
          serviceId: params.serviceId,
          extraServiceIds: params.extraServiceIds,
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
      const totals = computeServiceTotals(service, addons, extraServices);

      return {
        service,
        extraServices,
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
        extraServiceIds: params.extraServiceIds,
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

      const holdMinutes = settings.slotHoldMinutes || 5;
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

      const { settings, service, extraServices, addons, ctx } =
        await loadPublicAvailabilityContext({
          serviceId: params.serviceId,
          extraServiceIds: params.extraServiceIds,
          addonIds: params.addonIds,
          sessionToken: params.sessionToken,
        });

      if (!service.isActive) {
        throw new PolicyError(
          'SERVICE_NOT_FOUND',
          'El servicio seleccionado no está disponible.',
        );
      }

      const computedTotals = computeServiceTotals(service, addons, extraServices);
      const customDuration =
        typeof params.customDurationMinutes === 'number' &&
        params.customDurationMinutes > 0
          ? params.customDurationMinutes
          : null;
      const customPrice =
        typeof params.customPriceCents === 'number' && params.customPriceCents >= 0
          ? params.customPriceCents
          : null;
      const totalDurationMinutes = customDuration ?? computedTotals.totalDurationMinutes;
      const subtotalCents = customPrice ?? computedTotals.subtotalCents;

      const ctxForSlot: AvailabilityContext =
        customDuration !== null
          ? {
              ...ctx,
              service: {
                ...service,
                durationMinutes: customDuration,
                bufferBeforeMinutes: computedTotals.bufferBeforeMinutes,
                bufferAfterMinutes: computedTotals.bufferAfterMinutes,
              },
              extraServices: [],
              addons: [],
            }
          : ctx;

      const slot = resolveBookableSlotOrThrow({
        ctx: ctxForSlot,
        startAt: params.startAt,
        staffId: params.staffId,
        ignoreHoldSessionToken: params.sessionToken ?? undefined,
        conflictMessage:
          'Ese horario acaba de ser reservado hace unos segundos. Elige uno de los horarios más cercanos sin perder tus datos.',
      });

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
      const normalizedInstagram = normalizeOptionalInstagram(params.clientInstagram);
      const nowIso = clock.now().toISOString();
      const existingClientRes = await supabase
        .from('clients')
        .select('*')
        .eq('phone_e164', phoneE164)
        .maybeSingle();

      let clientId: string;
      let clientProfile: ClientProfile;
      if (existingClientRes.data) {
        clientId = existingClientRes.data.id;
        const clientPatch: Tables['clients']['Update'] = {
          full_name: params.clientName.trim() || existingClientRes.data.full_name,
          email: params.clientEmail?.trim() || existingClientRes.data.email,
          birthday: params.clientBirthday || existingClientRes.data.birthday,
          updated_at: nowIso,
        };
        if (normalizedInstagram) {
          clientPatch.instagram_handle = normalizedInstagram;
        }
        await supabase.from('clients').update(clientPatch).eq('id', clientId);
        clientProfile = mapClientRow({
          ...existingClientRes.data,
          full_name: clientPatch.full_name ?? existingClientRes.data.full_name,
          email: clientPatch.email !== undefined ? clientPatch.email : existingClientRes.data.email,
          instagram_handle:
            clientPatch.instagram_handle !== undefined
              ? clientPatch.instagram_handle
              : existingClientRes.data.instagram_handle,
          birthday:
            clientPatch.birthday !== undefined
              ? clientPatch.birthday
              : existingClientRes.data.birthday,
          updated_at: nowIso,
        });
      } else {
        const insertedClient = await supabase
          .from('clients')
          .insert({
            full_name: params.clientName.trim(),
            phone_e164: phoneE164,
            email: params.clientEmail?.trim() || null,
            ...(normalizedInstagram ? { instagram_handle: normalizedInstagram } : {}),
            birthday: params.clientBirthday || null,
            notes: '',
            no_show_count: 0,
          })
          .select('*')
          .single();
        if (insertedClient.error || !insertedClient.data) {
          throw new PolicyError(
            'CLIENT_UPSERT_FAILED',
            insertedClient.error?.message ?? 'No se pudo registrar a la clienta.',
          );
        }
        clientId = insertedClient.data.id;
        clientProfile = mapClientRow(insertedClient.data);
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

      const uploadedMedia: Array<{
        storagePath: string;
        folder: 'inspo' | 'proofs';
        contentType: string;
        sizeBytes: number;
      }> = [];

      let persistedInspoPhotoUrl = params.inspoPhotoUrl?.trim() || null;
      if (persistedInspoPhotoUrl?.toLowerCase().startsWith('data:')) {
        try {
          const stored = await storeMediaUpload({
            dataUrl: persistedInspoPhotoUrl,
            folder: 'inspo',
          });
          persistedInspoPhotoUrl = `/api/media/${stored.storagePath}`;
          uploadedMedia.push({
            storagePath: stored.storagePath,
            folder: 'inspo',
            contentType: stored.contentType,
            sizeBytes: stored.sizeBytes,
          });
        } catch (err) {
          if (err instanceof MediaValidationError) {
            throw new PolicyError(err.code, err.message);
          }
          throw err;
        }
      } else if (persistedInspoPhotoUrl) {
        if (!isSafeInternalBookingMediaPath(persistedInspoPhotoUrl, 'inspo')) {
          throw new PolicyError(
            'INVALID_MEDIA_URL',
            'Solo se permiten imágenes subidas directamente (PNG, JPEG o WEBP). No se aceptan URLs externas.',
          );
        }
        persistedInspoPhotoUrl = persistedInspoPhotoUrl.startsWith('/api/media/')
          ? persistedInspoPhotoUrl
          : `/api/media/${persistedInspoPhotoUrl}`;
      }

      let persistedPaymentProofUrl = params.paymentProofUrl?.trim() || null;
      if (persistedPaymentProofUrl?.toLowerCase().startsWith('data:')) {
        try {
          const stored = await storeMediaUpload({
            dataUrl: persistedPaymentProofUrl,
            folder: 'proofs',
          });
          persistedPaymentProofUrl = `/api/media/${stored.storagePath}`;
          uploadedMedia.push({
            storagePath: stored.storagePath,
            folder: 'proofs',
            contentType: stored.contentType,
            sizeBytes: stored.sizeBytes,
          });
        } catch (err) {
          if (err instanceof MediaValidationError) {
            throw new PolicyError(err.code, err.message);
          }
          throw err;
        }
      } else if (persistedPaymentProofUrl) {
        if (isSafeExternalProofUrl(persistedPaymentProofUrl)) {
          persistedPaymentProofUrl = persistedPaymentProofUrl.trim();
        } else if (isSafeInternalBookingMediaPath(persistedPaymentProofUrl, 'proofs')) {
          persistedPaymentProofUrl = persistedPaymentProofUrl.startsWith('/api/media/')
            ? persistedPaymentProofUrl
            : `/api/media/${persistedPaymentProofUrl}`;
        } else {
          throw new PolicyError(
            'INVALID_MEDIA_URL',
            'Sube una imagen PNG, JPEG o WEBP, o pega un enlace HTTPS válido de tu comprobante.',
          );
        }
      }

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
          p_inspo_photo_url: persistedInspoPhotoUrl,
          p_payment_proof_url: persistedPaymentProofUrl,
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
          const suggestions = findNearestAfterConflict(ctxForSlot, slot, slot.staffId);
          throw new SlotConflictError(
            'Ese horario acaba de ser reservado hace unos segundos. Elige uno de los horarios más cercanos sin perder tus datos.',
            suggestions,
          );
        }
        const pgErr = extractPgErrorCode(rpcError);
        throw new PolicyError(pgErr.code || 'BOOKING_FAILED', pgErr.message);
      }

      const mediaToLink: Array<{
        url: string | null;
        folder: 'inspo' | 'proofs';
      }> = [
        { url: persistedInspoPhotoUrl, folder: 'inspo' },
        { url: persistedPaymentProofUrl, folder: 'proofs' },
      ];
      for (const item of mediaToLink) {
        if (!item.url) continue;
        if (
          !item.url.startsWith('/api/media/') &&
          !item.url.startsWith('proofs/') &&
          !item.url.startsWith('inspo/')
        ) {
          continue;
        }
        const storagePath = normalizeMediaStoragePath(item.url);
        if (!storagePath || !inferMediaFolder(storagePath)) continue;
        const uploadedMeta = uploadedMedia.find((u) => u.storagePath === storagePath);
        await registerMediaAssetInternal({
          storagePath,
          folder: item.folder,
          bookingId: createdBookingId,
          clientId,
          contentType: uploadedMeta?.contentType ?? inferContentTypeFromPath(storagePath),
          sizeBytes: uploadedMeta?.sizeBytes ?? 0,
        });
      }

      const extraBookingPatch: Tables['bookings']['Update'] = {};
      if (extraServices.length > 0) {
        extraBookingPatch.extra_service_ids = extraServices.map((s) => s.id);
      }
      if (normalizedInstagram) {
        extraBookingPatch.client_instagram = normalizedInstagram;
      }
      if (customDuration !== null) {
        extraBookingPatch.custom_duration_minutes = customDuration;
      }
      if (customPrice !== null) {
        extraBookingPatch.custom_price_cents = customPrice;
      }
      if (params.internalNotes && params.internalNotes.trim().length > 0) {
        extraBookingPatch.internal_notes = params.internalNotes.trim();
      }
      if (params.proofDeliveryMethod !== undefined) {
        extraBookingPatch.proof_delivery_method = params.proofDeliveryMethod;
      } else if (persistedPaymentProofUrl) {
        extraBookingPatch.proof_delivery_method = persistedPaymentProofUrl.startsWith(
          'https://',
        )
          ? 'web_link'
          : 'web_upload';
      }
      if (Object.keys(extraBookingPatch).length > 0) {
        await supabase
          .from('bookings')
          .update(extraBookingPatch)
          .eq('id', createdBookingId);
      }

      if (params.waitlistOfferToken?.trim()) {
        await supabase
          .from('waitlist_entries')
          .update({ status: 'booked' })
          .eq('priority_offer_token', params.waitlistOfferToken.trim())
          .eq('status', 'notified');
      }

      if (params.privacyConsentAccepted) {
        await supabase.from('consents').insert({
          client_id: clientId,
          booking_id: createdBookingId,
          policy_version: settings.privacyPolicyVersion ?? '2026-11',
          accepted_at: nowIso,
          marketing_opt_in: Boolean(params.marketingOptIn),
        });
      }

      const [createdBookingRes, createdAddonsRes, workflowsRes] = await Promise.all([
        supabase.from('bookings').select('*').eq('id', createdBookingId).maybeSingle(),
        supabase.from('booking_addons').select('*').eq('booking_id', createdBookingId),
        supabase.from('notification_workflows').select('*').eq('is_enabled', true),
      ]);

      if (!createdBookingRes.data) {
        throw new PolicyError('BOOKING_NOT_FOUND', 'No se encontró la cita creada.');
      }

      const createdBooking = mapBookingRow(
        createdBookingRes.data,
        createdAddonsRes.data ?? [],
      );
      const staffMember =
        ctx.staffMembers.find((member) => member.id === createdBooking.staffId) ??
        buildFallbackStaffForBooking(createdBooking, settings.defaultCommissionPercent);
      const hydrated: BookingWithRelations = {
        ...createdBooking,
        service,
        staff: staffMember,
        client: clientProfile,
        review: null,
      };
      const connection = ctx.calendarConnections.find(
        (c) => c.staffId === hydrated.staffId && c.isConnected,
      );
      const enabledWorkflows = (workflowsRes.data ?? []).map(mapWorkflowRow);

      await dispatchOutboxEvent({
        type: 'Realtime',
        eventType: 'slot_changed',
        payload: { staffId: hydrated.staffId, startAt: hydrated.startAt },
      });

      const postCommitTask = (async () => {
        await dispatchOutboxEvent({
          type: 'SyncCalendar',
          booking: hydrated,
          connection,
          settings,
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
          workflows: enabledWorkflows,
          settings,
          trigger: 'booking_created',
          onLogs: persistScheduledNotifications,
        });
      })();

      await runPostCommitSideEffects(postCommitTask);

      return hydrated;
    },

    async updateBookingStatus(
      params: UpdateBookingStatusInput,
    ): Promise<BookingWithRelations> {
      const supabase = getClient();
      const [bookingRes, settings] = await Promise.all([
        supabase.from('bookings').select('*').eq('id', params.bookingId).maybeSingle(),
        getSalonSettings(),
      ]);
      if (!bookingRes.data) {
        throw new PolicyError('BOOKING_NOT_FOUND', 'Cita no encontrada.');
      }

      const hydratedBefore = await hydrateBookingRowTargeted(bookingRes.data);
      const isPast = new Date(hydratedBefore.endAt).getTime() < clock.nowMs();
      const pastLockActive = settings.lockPastBookings !== false;
      if (pastLockActive && isPast && params.actor && params.actor.role !== 'owner') {
        throw new PolicyError(
          'PAST_BOOKING_LOCKED',
          'Las citas pasadas están bloqueadas; solo la Dueña puede modificarlas.',
        );
      }

      const prevStatus = hydratedBefore.status;
      const transition = transitionBookingStatus(hydratedBefore, params.status);
      if (!transition.ok) {
        throw new PolicyError(transition.code, transition.message);
      }

      const nowIso = clock.now().toISOString();
      const isApprovingDeposit =
        (prevStatus === 'pending_confirmation' || prevStatus === 'pending_payment') &&
        transition.nextStatus === 'confirmed';
      const nextConfirmedVia = isApprovingDeposit
        ? (hydratedBefore.confirmedVia ?? 'manual')
        : hydratedBefore.confirmedVia;

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
      if (isApprovingDeposit) {
        updatePatch.confirmed_via = nextConfirmedVia ?? 'manual';
      }

      const { error: updateError } = await supabase
        .from('bookings')
        .update(updatePatch)
        .eq('id', hydratedBefore.id);
      if (updateError) {
        throw new PolicyError('UPDATE_FAILED', updateError.message);
      }

      const hydrated: BookingWithRelations = {
        ...hydratedBefore,
        status: transition.nextStatus,
        cancellationReason:
          params.cancellationReason !== undefined
            ? params.cancellationReason
            : hydratedBefore.cancellationReason,
        internalNotes:
          params.internalNotes !== undefined
            ? params.internalNotes
            : hydratedBefore.internalNotes,
        ...(isApprovingDeposit ? { confirmedVia: nextConfirmedVia ?? 'manual' } : {}),
        updatedAt: nowIso,
      };

      const auditRows: Array<Tables['audit_logs']['Insert']> = [];
      if (pastLockActive && isPast && params.actor && params.actor.role === 'owner') {
        auditRows.push({
          actor_id: params.actor.id,
          actor_email: params.actor.email,
          actor_role: params.actor.role,
          action: 'past_booking_override',
          entity_type: 'booking',
          entity_id: hydrated.id,
          metadata: {
            bookingCode: hydrated.bookingCode,
            fromStatus: prevStatus,
            toStatus: transition.nextStatus,
          },
        });
      }

      if (isApprovingDeposit) {
        if (hydrated.depositAmountCents > 0) {
          const existingSplitRes = await supabase
            .from('payment_splits')
            .select('id')
            .eq('booking_id', hydrated.id)
            .limit(1);
          if ((existingSplitRes.data ?? []).length === 0) {
            await supabase.from('payment_splits').insert([
              {
                booking_id: hydrated.id,
                method: 'transfer',
                amount_cents: hydrated.depositAmountCents,
                tip_cents: 0,
                tip_staff_id: null,
                reference: 'Anticipo SPEI aprobado',
              },
            ]);
          }
        }
        if (params.actor) {
          auditRows.push({
            actor_id: params.actor.id,
            actor_email: params.actor.email,
            actor_role: params.actor.role,
            action: 'deposit_approved',
            entity_type: 'booking',
            entity_id: hydrated.id,
            metadata: {
              bookingCode: hydrated.bookingCode,
              depositAmountCents: hydrated.depositAmountCents,
            },
          });
        }
      }

      if (transition.nextStatus === 'canceled' && params.actor) {
        auditRows.push({
          actor_id: params.actor.id,
          actor_email: params.actor.email,
          actor_role: params.actor.role,
          action: 'booking_canceled',
          entity_type: 'booking',
          entity_id: hydrated.id,
          metadata: {
            bookingCode: hydrated.bookingCode,
            reason: hydrated.cancellationReason,
          },
        });
      }

      if (auditRows.length > 0) {
        await supabase.from('audit_logs').insert(auditRows);
      }

      if (transition.nextStatus === 'completed' && !params.skipLoyaltyStamp) {
        const activeProgramRes = await supabase
          .from('loyalty_programs')
          .select('id')
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        if (activeProgramRes.data?.id) {
          const stampedDate = getDateKeyInTimezone(
            new Date(hydrated.startAt),
            settings.timezone || 'America/Mexico_City',
          );
          await supabase.from('loyalty_stamps').insert({
            client_id: hydrated.clientId,
            booking_id: hydrated.id,
            program_id: activeProgramRes.data.id,
            stamped_date: stampedDate,
          });
        }
      }

      const calendarEffects: Array<
        Extract<(typeof transition.effects)[number], { type: 'SyncCalendar' }>
      > = [];
      const notifyEffects: Array<
        Extract<(typeof transition.effects)[number], { type: 'Notify' }>
      > = [];

      for (const effect of transition.effects) {
        if (effect.type === 'SyncCalendar') {
          calendarEffects.push(effect);
        } else if (effect.type === 'Notify') {
          if (effect.cancelPending) {
            await supabase
              .from('scheduled_notifications')
              .update({ status: 'canceled' })
              .eq('booking_id', hydrated.id)
              .eq('status', 'pending');
          }
          notifyEffects.push(effect);
        } else if (effect.type === 'RecordCash') {
          const existingCashRes = await supabase
            .from('cash_register_entries')
            .select('id')
            .eq('booking_id', effect.bookingId)
            .limit(1);
          if ((existingCashRes.data ?? []).length === 0) {
            const pct =
              hydrated.staff.commissionPercent ?? settings.defaultCommissionPercent;
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
          const couponRes = await supabase
            .from('coupons')
            .select('*')
            .eq('code', effect.couponCode.toUpperCase())
            .maybeSingle();
          if (couponRes.data) {
            const coupon = mapCouponRow(couponRes.data);
            await supabase
              .from('coupon_redemptions')
              .update({ status: 'released', released_at: nowIso })
              .eq('booking_id', hydrated.id)
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
          const nextNoShowCount = hydrated.client.noShowCount + 1;
          hydrated.client = {
            ...hydrated.client,
            noShowCount: nextNoShowCount,
            updatedAt: nowIso,
          };
          await supabase
            .from('clients')
            .update({
              no_show_count: nextNoShowCount,
              updated_at: nowIso,
            })
            .eq('id', effect.clientId);
        }
      }

      await dispatchOutboxEvent({
        type: 'Realtime',
        eventType: 'slot_changed',
        payload: { staffId: hydrated.staffId, startAt: hydrated.startAt },
      });

      if (calendarEffects.length > 0 || notifyEffects.length > 0) {
        const postCommitTask = (async () => {
          const [calRes, workflowsRes] = await Promise.all([
            calendarEffects.length > 0
              ? supabase
                  .from('calendar_connections')
                  .select('*')
                  .eq('staff_id', hydrated.staffId)
                  .eq('is_connected', true)
                  .limit(1)
                  .maybeSingle()
              : Promise.resolve({ data: null as Tables['calendar_connections']['Row'] | null }),
            notifyEffects.length > 0
              ? supabase
                  .from('notification_workflows')
                  .select('*')
                  .eq('is_enabled', true)
              : Promise.resolve({ data: [] as Tables['notification_workflows']['Row'][] }),
          ]);

          const connection = calRes.data ? mapCalendarConnectionRow(calRes.data) : undefined;
          const enabledWorkflows = (workflowsRes.data ?? []).map(mapWorkflowRow);

          for (const effect of calendarEffects) {
            await dispatchOutboxEvent({
              type: 'SyncCalendar',
              booking: hydrated,
              connection,
              settings,
              action: effect.action,
              onSynced: async (googleEventId) => {
                hydrated.googleEventId = googleEventId;
                await supabase
                  .from('bookings')
                  .update({ google_event_id: googleEventId })
                  .eq('id', hydrated.id);
              },
            });
          }

          for (const effect of notifyEffects) {
            await dispatchOutboxEvent({
              type: 'Notify',
              booking: hydrated,
              workflows: enabledWorkflows,
              settings,
              trigger: effect.trigger,
              onLogs: persistScheduledNotifications,
            });
          }
        })();

        await runPostCommitSideEffects(postCommitTask);
      }

      return hydrated;
    },

    async manageClientBookingAction(
      params: ManageClientBookingInput,
    ): Promise<BookingWithRelations> {
      const supabase = getClient();
      const bookingRes = await supabase
        .from('bookings')
        .select('*')
        .eq('manage_token', params.token)
        .maybeSingle();
      if (!bookingRes.data) {
        throw new PolicyError('BOOKING_NOT_FOUND', 'No encontramos esta cita.');
      }
      const hydratedBefore = await hydrateBookingRowTargeted(bookingRes.data);
      if (!isActiveBookingStatus(hydratedBefore.status)) {
        throw new PolicyError(
          'INVALID_TRANSITION',
          'Esta cita ya no puede modificarse.',
        );
      }

      if (params.action === 'confirm_attendance') {
        const nowIso = clock.now().toISOString();
        const confirmedVia = params.confirmedVia ?? hydratedBefore.confirmedVia ?? 'email';
        const { error: confirmError } = await supabase
          .from('bookings')
          .update({
            attendance_status: 'confirmed',
            attendance_confirmed_at: nowIso,
            confirmed_via: confirmedVia,
            updated_at: nowIso,
          })
          .eq('id', hydratedBefore.id);
        if (confirmError) {
          throw new Error(`No se pudo confirmar la asistencia: ${confirmError.message}`);
        }
        const hydrated: BookingWithRelations = {
          ...hydratedBefore,
          attendanceStatus: 'confirmed',
          attendanceConfirmedAt: nowIso,
          confirmedVia,
          updatedAt: nowIso,
        };
        await dispatchOutboxEvent({
          type: 'Realtime',
          eventType: 'booking_updated',
          payload: { staffId: hydrated.staffId, startAt: hydrated.startAt },
        });
        return hydrated;
      }

      if (params.action === 'upload_proof') {
        const rawProof = params.paymentProofUrl?.trim() ?? '';
        if (!rawProof) {
          throw new PolicyError(
            'MISSING_PROOF',
            'Sube una imagen o pega el enlace de tu comprobante antes de enviar.',
          );
        }
        let persistedProofUrl = rawProof;
        let proofDeliveryMethod: 'web_upload' | 'web_link' = 'web_upload';
        let uploadedProofMeta: {
          storagePath: string;
          contentType: string;
          sizeBytes: number;
        } | null = null;
        if (rawProof.toLowerCase().startsWith('data:')) {
          try {
            const stored = await storeMediaUpload({ dataUrl: rawProof, folder: 'proofs' });
            persistedProofUrl = `/api/media/${stored.storagePath}`;
            uploadedProofMeta = {
              storagePath: stored.storagePath,
              contentType: stored.contentType,
              sizeBytes: stored.sizeBytes,
            };
          } catch (err) {
            if (err instanceof MediaValidationError) {
              throw new PolicyError(err.code, err.message);
            }
            throw err;
          }
        } else if (isSafeExternalProofUrl(rawProof)) {
          persistedProofUrl = rawProof;
          proofDeliveryMethod = 'web_link';
        } else if (isSafeInternalBookingMediaPath(rawProof, 'proofs')) {
          persistedProofUrl = rawProof.startsWith('/api/media/')
            ? rawProof
            : `/api/media/${rawProof}`;
        } else {
          throw new PolicyError(
            'INVALID_MEDIA_URL',
            'Sube una imagen PNG, JPEG o WEBP, o pega un enlace HTTPS válido de tu comprobante.',
          );
        }
        const nowIso = clock.now().toISOString();
        const { error: proofError } = await supabase
          .from('bookings')
          .update({
            payment_proof_url: persistedProofUrl,
            proof_delivery_method: proofDeliveryMethod,
            proof_rejected_at: null,
            proof_rejection_reason: null,
            updated_at: nowIso,
          })
          .eq('id', hydratedBefore.id);
        if (proofError) {
          throw new Error(`No se pudo guardar el comprobante: ${proofError.message}`);
        }
        if (
          uploadedProofMeta ||
          persistedProofUrl.startsWith('/api/media/') ||
          persistedProofUrl.startsWith('proofs/')
        ) {
          const storagePath =
            uploadedProofMeta?.storagePath ?? normalizeMediaStoragePath(persistedProofUrl);
          if (storagePath && inferMediaFolder(storagePath)) {
            await registerMediaAssetInternal({
              storagePath,
              folder: 'proofs',
              bookingId: hydratedBefore.id,
              clientId: hydratedBefore.clientId,
              contentType:
                uploadedProofMeta?.contentType ?? inferContentTypeFromPath(storagePath),
              sizeBytes: uploadedProofMeta?.sizeBytes ?? 0,
            });
          }
        }
        const hydrated: BookingWithRelations = {
          ...hydratedBefore,
          paymentProofUrl: persistedProofUrl,
          proofDeliveryMethod,
          proofRejectedAt: null,
          proofRejectionReason: null,
          updatedAt: nowIso,
        };
        await dispatchOutboxEvent({
          type: 'Realtime',
          eventType: 'booking_updated',
          payload: { staffId: hydrated.staffId, startAt: hydrated.startAt },
        });
        return hydrated;
      }

      const settings = await getSalonSettings();
      const manageAction = params.action;
      const minHours =
        manageAction === 'cancel'
          ? settings.minCancelHours
          : settings.minRescheduleHours;
      const policyCheck = checkManagePolicyWindow({
        startAtIso: hydratedBefore.startAt,
        nowMs: clock.nowMs(),
        minHours,
        action: manageAction,
      });
      if (!policyCheck.allowed) {
        throw new PolicyError(policyCheck.code, policyCheck.message);
      }

      if (params.action === 'cancel') {
        return this.updateBookingStatus({
          bookingId: hydratedBefore.id,
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
        serviceId: hydratedBefore.serviceId,
        extraServiceIds: hydratedBefore.extraServiceIds,
        addonIds: hydratedBefore.addons.map((a) => a.addonId),
        ignoreBookingId: hydratedBefore.id,
      });
      const slot = resolveBookableSlotOrThrow({
        ctx,
        startAt: params.newStartAt,
        staffId: params.newStaffId || hydratedBefore.staffId,
        ignoreBookingId: hydratedBefore.id,
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
          attendance_status: 'rescheduled',
          attendance_confirmed_at: null,
          updated_at: nowIso,
        })
        .eq('id', hydratedBefore.id);

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
        .eq('booking_id', hydratedBefore.id)
        .eq('status', 'pending');

      const nextStaff =
        slot.staffId === hydratedBefore.staffId
          ? hydratedBefore.staff
          : (ctx.staffMembers.find((member) => member.id === slot.staffId) ??
            hydratedBefore.staff);
      const hydrated: BookingWithRelations = {
        ...hydratedBefore,
        staffId: slot.staffId,
        staff: nextStaff,
        startAt: slot.startAt,
        endAt: slot.endAt,
        occupiedStartAt: slot.occupiedStartAt,
        occupiedEndAt: slot.occupiedEndAt,
        attendanceStatus: 'rescheduled',
        attendanceConfirmedAt: null,
        updatedAt: nowIso,
      };
      const connection = ctx.calendarConnections.find(
        (c) => c.staffId === hydrated.staffId && c.isConnected,
      );

      await dispatchOutboxEvent({
        type: 'Realtime',
        eventType: 'slot_changed',
        payload: { staffId: hydrated.staffId, startAt: hydrated.startAt },
      });

      const postCommitTask = (async () => {
        const workflowsRes = await supabase
          .from('notification_workflows')
          .select('*')
          .eq('is_enabled', true);
        const enabledWorkflows = (workflowsRes.data ?? []).map(mapWorkflowRow);

        await dispatchOutboxEvent({
          type: 'SyncCalendar',
          booking: hydrated,
          connection,
          settings,
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
          workflows: enabledWorkflows,
          settings,
          trigger: 'booking_rescheduled',
          onLogs: persistScheduledNotifications,
        });
      })();

      await runPostCommitSideEffects(postCommitTask);

      return hydrated;
    },

    async processDueScheduledNotifications(
      dispatcher: NotificationDispatcher,
      nowMs = clock.nowMs(),
    ): Promise<ProcessDueNotificationsResult> {
      const supabase = getClient();
      const snapshot = await getSnapshot();
      const due = snapshot.notifications.filter((n) =>
        isSupabaseScheduledNotificationDue(n, nowMs),
      );

      let sentCount = 0;
      let failedCount = 0;
      let canceledCount = 0;
      let skippedCount = 0;
      let retriedCount = 0;

      for (const item of due) {
        const isRetry = item.status === 'failed';
        const rawBooking = item.bookingId
          ? snapshot.bookings.find((b) => b.id === item.bookingId)
          : undefined;
        if (
          !rawBooking ||
          rawBooking.status === 'canceled' ||
          rawBooking.status === 'no_show'
        ) {
          await supabase
            .from('scheduled_notifications')
            .update({ status: 'canceled', next_retry_at: null })
            .eq('id', item.id);
          canceledCount += 1;
          continue;
        }

        const wf = item.workflowId
          ? snapshot.workflows.find((w) => w.id === item.workflowId)
          : null;
        const isAfterBooking = wf?.triggerEvent === 'after_booking';

        if (!isAfterBooking && rawBooking.status === 'completed') {
          await supabase
            .from('scheduled_notifications')
            .update({
              status: 'canceled',
              error_message: 'booking_already_completed',
              next_retry_at: null,
            })
            .eq('id', item.id);
          canceledCount += 1;
          continue;
        }

        if (isAfterBooking) {
          if (rawBooking.status !== 'completed') {
            const endMs = Date.parse(rawBooking.endAt);
            if (Number.isFinite(endMs) && nowMs - endMs > 7 * 86_400_000) {
              await supabase
                .from('scheduled_notifications')
                .update({
                  status: 'canceled',
                  error_message: 'booking_not_completed',
                  next_retry_at: null,
                })
                .eq('id', item.id);
              canceledCount += 1;
            }
            continue;
          }
          if ((wf?.offsetMinutes ?? 0) >= 1440 && rawBooking.touchupInvitedAt) {
            await supabase
              .from('scheduled_notifications')
              .update({
                status: 'canceled',
                error_message: 'already_invited_touchup',
                next_retry_at: null,
              })
              .eq('id', item.id);
            canceledCount += 1;
            continue;
          }
        }

        const alreadySentEmail = snapshot.notifications.some((n) => {
          if (n.bookingId !== rawBooking.id || n.channel !== 'email' || n.status !== 'sent') {
            return false;
          }
          const nWf = n.workflowId
            ? snapshot.workflows.find((w) => w.id === n.workflowId)
            : null;
          return nWf?.triggerEvent === 'before_booking';
        });

        if (
          item.channel === 'whatsapp' &&
          !isAfterBooking &&
          shouldSkipWhatsappCascade(rawBooking, alreadySentEmail)
        ) {
          await supabase
            .from('scheduled_notifications')
            .update({
              status: 'canceled',
              error_message: 'skipped_cascade',
              sent_at: null,
              next_retry_at: null,
            })
            .eq('id', item.id);
          skippedCount += 1;
          canceledCount += 1;
          continue;
        }

        const nextAttempt = (item.attempts ?? 0) + 1;
        const maxAttempts = item.maxAttempts ?? 3;

        const { error: claimError } = await supabase
          .from('webhook_events')
          .insert({
            provider: 'scheduled_notification',
            event_id: `${item.id}:attempt:${nextAttempt}`,
          });
        if (claimError) {
          if (claimError.code !== '23505') {
            failedCount += 1;
          }
          continue;
        }

        const hydrated = hydrateBookingFromSnapshot(snapshot, rawBooking);
        const res = await dispatcher({
          notification: { ...item, bodyText: item.bodyText || item.previewText },
          booking: hydrated,
          settings: snapshot.settings,
        });

        const attemptIso = new Date(nowMs).toISOString();
        const nextRetryAt =
          res.status === 'failed' && nextAttempt < maxAttempts
            ? computeNotificationRetryAt(nextAttempt, nowMs)
            : null;

        await supabase
          .from('scheduled_notifications')
          .update({
            status: res.status,
            delivery_status: res.status === 'sent' ? 'sent' : 'failed',
            provider_message_id: res.providerMessageId,
            error_message: res.errorMessage,
            attempts: nextAttempt,
            max_attempts: maxAttempts,
            last_attempt_at: attemptIso,
            next_retry_at: nextRetryAt,
            sent_at: res.status === 'sent' ? attemptIso : null,
          })
          .eq('id', item.id);

        if (res.status === 'sent') {
          if (wf?.triggerEvent === 'before_booking' && wf.offsetMinutes >= 720) {
            await supabase
              .from('bookings')
              .update({ reminder_24h_sent_at: attemptIso, updated_at: attemptIso })
              .eq('id', rawBooking.id);
          }
          if (isAfterBooking && (wf?.offsetMinutes ?? 0) >= 1440) {
            await supabase
              .from('bookings')
              .update({ touchup_invited_at: attemptIso, updated_at: attemptIso })
              .eq('id', rawBooking.id);
          }
          sentCount += 1;
          if (isRetry) retriedCount += 1;
        } else {
          failedCount += 1;
        }
      }

      return {
        processed: due.length,
        sentCount,
        failedCount,
        canceledCount,
        skippedCount,
        retriedCount,
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
      patch: Partial<Omit<SalonSettings, 'landingContent'>> & {
        landingContent?: Partial<SalonSettings['landingContent']>;
      },
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
      if (patch.sisterStudioHandle !== undefined) {
        dbPatch.sister_studio_handle = patch.sisterStudioHandle;
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
      if (patch.publicPalette !== undefined) dbPatch.public_palette = patch.publicPalette;
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
      if (patch.depositBeneficiary !== undefined) {
        dbPatch.deposit_beneficiary = patch.depositBeneficiary;
      }
      if (patch.depositClabe !== undefined) dbPatch.deposit_clabe = patch.depositClabe;
      if (patch.depositAmountCents !== undefined) {
        dbPatch.deposit_amount_cents = patch.depositAmountCents;
      }
      if (patch.depositInstructions !== undefined) {
        dbPatch.deposit_instructions = patch.depositInstructions;
      }
      if (patch.currency !== undefined) dbPatch.currency = patch.currency;
      if (patch.serviceMode !== undefined) dbPatch.service_mode = patch.serviceMode;
      if (patch.businessType !== undefined) dbPatch.business_type = patch.businessType;
      if (patch.teamSizeTier !== undefined) dbPatch.team_size_tier = patch.teamSizeTier;
      if (patch.onboardingCompleted !== undefined) {
        dbPatch.onboarding_completed = patch.onboardingCompleted;
      }
      if (patch.soundAlertsEnabled !== undefined) {
        dbPatch.sound_alerts_enabled = patch.soundAlertsEnabled;
      }
      if (patch.lockPastBookings !== undefined) {
        dbPatch.lock_past_bookings = patch.lockPastBookings;
      }
      if (patch.maxActiveBookingsPerClient !== undefined) {
        dbPatch.max_active_bookings_per_client = patch.maxActiveBookingsPerClient;
      }
      if (patch.privacyPolicyVersion !== undefined) {
        dbPatch.privacy_policy_version = patch.privacyPolicyVersion;
      }
      if (patch.optimizeContinuousSlots !== undefined) {
        dbPatch.optimize_continuous_slots = patch.optimizeContinuousSlots;
      }
      if (patch.landingContent !== undefined) {
        const currentRow = await supabase
          .from('salon_settings')
          .select('landing_content')
          .eq('id', 'default')
          .maybeSingle();
        const existingContent = mapLandingContent(currentRow.data?.landing_content);
        const mergedContent: SalonSettings['landingContent'] = {
          ...existingContent,
          ...patch.landingContent,
          ...(patch.landingContent.sections !== undefined
            ? {
                sections: {
                  ...existingContent.sections,
                  ...patch.landingContent.sections,
                },
              }
            : {}),
        };
        const serializedLanding: Record<string, Database['public']['Tables']['salon_settings']['Update']['landing_content']> = {
          heroEyebrow: mergedContent.heroEyebrow,
          heroTitle: mergedContent.heroTitle,
          heroSubtitle: mergedContent.heroSubtitle,
          aboutTitle: mergedContent.aboutTitle,
          aboutBody: mergedContent.aboutBody,
        };
        if (mergedContent.heroPrimaryCta !== undefined) {
          serializedLanding.heroPrimaryCta = mergedContent.heroPrimaryCta;
        }
        if (mergedContent.heroSecondaryCta !== undefined) {
          serializedLanding.heroSecondaryCta = mergedContent.heroSecondaryCta;
        }
        if (mergedContent.heroImageDesktopUrl !== undefined) {
          serializedLanding.heroImageDesktopUrl = mergedContent.heroImageDesktopUrl;
        }
        if (mergedContent.heroImageMobileUrl !== undefined) {
          serializedLanding.heroImageMobileUrl = mergedContent.heroImageMobileUrl;
        }
        if (mergedContent.marqueeItems !== undefined) {
          serializedLanding.marqueeItems = mergedContent.marqueeItems;
        }
        if (mergedContent.menuTitle !== undefined) {
          serializedLanding.menuTitle = mergedContent.menuTitle;
        }
        if (mergedContent.menuBannerText !== undefined) {
          serializedLanding.menuBannerText = mergedContent.menuBannerText;
        }
        if (mergedContent.creationsTitle !== undefined) {
          serializedLanding.creationsTitle = mergedContent.creationsTitle;
        }
        if (mergedContent.creationsSubtitle !== undefined) {
          serializedLanding.creationsSubtitle = mergedContent.creationsSubtitle;
        }
        if (mergedContent.galleryMode !== undefined) {
          serializedLanding.galleryMode = mergedContent.galleryMode;
        }
        if (mergedContent.reviewsTitle !== undefined) {
          serializedLanding.reviewsTitle = mergedContent.reviewsTitle;
        }
        if (mergedContent.reviewsSubtitle !== undefined) {
          serializedLanding.reviewsSubtitle = mergedContent.reviewsSubtitle;
        }
        if (mergedContent.teamTitle !== undefined) {
          serializedLanding.teamTitle = mergedContent.teamTitle;
        }
        if (mergedContent.teamSubtitle !== undefined) {
          serializedLanding.teamSubtitle = mergedContent.teamSubtitle;
        }
        if (mergedContent.connectTitle !== undefined) {
          serializedLanding.connectTitle = mergedContent.connectTitle;
        }
        if (mergedContent.connectSubtitle !== undefined) {
          serializedLanding.connectSubtitle = mergedContent.connectSubtitle;
        }
        if (mergedContent.faqTitle !== undefined) {
          serializedLanding.faqTitle = mergedContent.faqTitle;
        }
        if (mergedContent.faqSubtitle !== undefined) {
          serializedLanding.faqSubtitle = mergedContent.faqSubtitle;
        }
        if (mergedContent.customFaqs !== undefined) {
          serializedLanding.customFaqs = mergedContent.customFaqs.map((faq) => ({
            id: faq.id,
            question: faq.question,
            answer: faq.answer,
          }));
        }
        if (mergedContent.visitTitle !== undefined) {
          serializedLanding.visitTitle = mergedContent.visitTitle;
        }
        if (mergedContent.visitHoursDays !== undefined) {
          serializedLanding.visitHoursDays = mergedContent.visitHoursDays;
        }
        if (mergedContent.visitHoursText !== undefined) {
          serializedLanding.visitHoursText = mergedContent.visitHoursText;
        }
        if (mergedContent.showBookingQr !== undefined) {
          serializedLanding.showBookingQr = mergedContent.showBookingQr;
        }
        if (mergedContent.touchUpDays !== undefined) {
          serializedLanding.touchUpDays = mergedContent.touchUpDays;
        }
        if (mergedContent.sections !== undefined) {
          serializedLanding.sections = { ...mergedContent.sections };
        }
        dbPatch.landing_content = serializedLanding;
      }
      if (patch.whatsappBookingEnabled !== undefined) {
        dbPatch.whatsapp_booking_enabled = patch.whatsappBookingEnabled;
      }
      if (patch.smsRemindersEnabled !== undefined) {
        dbPatch.sms_reminders_enabled = patch.smsRemindersEnabled;
      }
      if (patch.retentionNoticeEmail !== undefined) {
        dbPatch.retention_notice_email = patch.retentionNoticeEmail;
      }
      if (patch.whatsappMonthlyQuota !== undefined) {
        dbPatch.whatsapp_monthly_quota = patch.whatsappMonthlyQuota;
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

    async upsertServiceCategory(input: {
      id?: string;
      name: string;
      displayOrder?: number;
    }): Promise<ServiceCategory> {
      const supabase = getClient();
      const name = input.name.trim();
      if (input.id) {
        const { data, error } = await supabase
          .from('service_categories')
          .update({
            name,
            ...(input.displayOrder !== undefined ? { display_order: input.displayOrder } : {}),
          })
          .eq('id', input.id)
          .select('*')
          .single();
        if (error || !data) {
          throw new PolicyError(
            'CATEGORY_UPDATE_FAILED',
            error?.message ?? 'No se pudo guardar la categoría.',
          );
        }
        return mapCategoryRow(data);
      }
      let displayOrder = input.displayOrder;
      if (displayOrder === undefined) {
        const { count } = await supabase
          .from('service_categories')
          .select('id', { count: 'exact', head: true });
        displayOrder = count ?? 0;
      }
      const baseSlug = slugify(name) || 'categoria';
      const { data, error } = await supabase
        .from('service_categories')
        .insert({
          name,
          slug: `${baseSlug}-${clock.randomCode(4).toLowerCase()}`,
          display_order: displayOrder,
        })
        .select('*')
        .single();
      if (error || !data) {
        throw new PolicyError(
          'CATEGORY_CREATE_FAILED',
          error?.message ?? 'No se pudo crear la categoría.',
        );
      }
      return mapCategoryRow(data);
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
            ...(input.isStartingPrice !== undefined
              ? { is_starting_price: input.isStartingPrice }
              : {}),
            buffer_before_minutes: input.bufferBeforeMinutes,
            buffer_after_minutes: input.bufferAfterMinutes,
            requires_confirmation: input.requiresConfirmation,
            deposit_required: input.depositRequired,
            deposit_amount_cents: input.depositAmountCents,
            allow_inspo_photo: input.allowInspoPhoto,
            is_active: input.isActive,
            is_featured: input.isFeatured,
            ...(input.isPrivate !== undefined ? { is_private: input.isPrivate } : {}),
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
          is_starting_price: input.isStartingPrice ?? false,
          buffer_before_minutes: input.bufferBeforeMinutes ?? 0,
          buffer_after_minutes: input.bufferAfterMinutes ?? 15,
          requires_confirmation: input.requiresConfirmation ?? false,
          deposit_required: input.depositRequired ?? false,
          deposit_amount_cents: input.depositAmountCents ?? 0,
          allow_inspo_photo: input.allowInspoPhoto ?? true,
          is_active: input.isActive ?? true,
          is_featured: input.isFeatured ?? true,
          is_private: input.isPrivate ?? false,
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
            fixed_start_times:
              r.fixedStartTimes && r.fixedStartTimes.length > 0
                ? r.fixedStartTimes
                : null,
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
          public_note: override.publicNote?.trim() || null,
          redirect_staff_id: override.redirectStaffId ?? null,
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
              role_title:
                input.roleTitle === undefined
                  ? undefined
                  : input.roleTitle.trim() || 'Nail Artist',
              bio: input.bio === undefined ? undefined : input.bio.trim(),
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
              role_title: input.roleTitle?.trim() || 'Nail Artist',
              bio: input.bio?.trim() || '',
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
          error?.message ?? 'No se pudo guardar profesional.',
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
      if (params.instagramHandle !== undefined) {
        patch.instagram_handle = normalizeOptionalInstagram(params.instagramHandle);
      }

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

    async deleteCoupon(id: string): Promise<Coupon> {
      const cleanId = id.trim();
      if (!cleanId) {
        throw new PolicyError('COUPON_NOT_FOUND', 'Cupón no encontrado.');
      }
      const supabase = getClient();
      const existingRes = await supabase
        .from('coupons')
        .select('*')
        .eq('id', cleanId)
        .maybeSingle();
      if (!existingRes.data) {
        throw new PolicyError('COUPON_NOT_FOUND', 'Cupón no encontrado.');
      }
      const { error: redemptionsError } = await supabase
        .from('coupon_redemptions')
        .delete()
        .eq('coupon_id', cleanId);
      if (redemptionsError) {
        throw new PolicyError(
          'COUPON_DELETE_FAILED',
          redemptionsError.message || 'No se pudieron limpiar los canjes del cupón.',
        );
      }
      const { error: deleteError } = await supabase
        .from('coupons')
        .delete()
        .eq('id', cleanId);
      if (deleteError) {
        throw new PolicyError(
          'COUPON_DELETE_FAILED',
          deleteError.message || 'No se pudo eliminar el cupón.',
        );
      }
      return mapCouponRow(existingRes.data);
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
          staff_id: params.staffId ?? null,
          entry_type: 'product_sale',
          description: `Venta producto: ${existingRes.data.name} (x${qty})`,
          amount_cents: Math.round(existingRes.data.retail_price_cents * qty),
          tip_cents: 0,
          commission_cents: Math.round(existingRes.data.retail_price_cents * qty * 0.1),
          payment_method: params.paymentMethod ?? 'cash',
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
      if (patch.accessTokenEncrypted !== undefined) {
        dbPatch.access_token_encrypted = patch.accessTokenEncrypted;
      }
      if (patch.refreshTokenEncrypted !== undefined) {
        dbPatch.refresh_token_encrypted = patch.refreshTokenEncrypted;
      }
      if (patch.tokenExpiresAt !== undefined) {
        dbPatch.token_expires_at = patch.tokenExpiresAt;
      }
      if (patch.watchChannelId !== undefined) {
        dbPatch.watch_channel_id = patch.watchChannelId;
      }
      if (patch.watchResourceId !== undefined) {
        dbPatch.watch_resource_id = patch.watchResourceId;
      }
      if (patch.watchExpiration !== undefined) {
        dbPatch.watch_expiration = patch.watchExpiration;
      }

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
              access_token_encrypted: patch.accessTokenEncrypted ?? null,
              refresh_token_encrypted: patch.refreshTokenEncrypted ?? null,
              token_expires_at: patch.tokenExpiresAt ?? null,
              watch_channel_id: patch.watchChannelId ?? null,
              watch_resource_id: patch.watchResourceId ?? null,
              watch_expiration: patch.watchExpiration ?? null,
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

    async recordPaymentSplits(params: RecordPaymentSplitsInput): Promise<PaymentSplit[]> {
      const supabase = getClient();
      if (params.splits.length === 0) return [];
      const { data, error } = await supabase
        .from('payment_splits')
        .insert(
          params.splits.map((split) => ({
            booking_id: params.bookingId,
            method: split.method,
            amount_cents: split.amountCents,
            tip_cents: split.tipCents ?? 0,
            tip_staff_id: split.tipStaffId ?? null,
            reference: split.reference ?? null,
          })),
        )
        .select('*');
      if (error || !data) {
        throw new PolicyError(
          'PAYMENT_SPLITS_FAILED',
          error?.message ?? 'No se pudieron registrar los pagos divididos.',
        );
      }
      return data.map(mapPaymentSplitRow);
    },

    async upsertRecurringBlock(
      input: Omit<RecurringBlock, 'id'> & { id?: string },
    ): Promise<RecurringBlock> {
      const supabase = getClient();
      const payload = {
        staff_id: input.staffId,
        reason: input.reason,
        frequency: input.frequency,
        weekdays: input.weekdays,
        day_of_month: input.dayOfMonth,
        start_time: input.startTime,
        end_time: input.endTime,
        until_date: input.untilDate,
        is_active: input.isActive,
      };
      const query = input.id
        ? supabase
            .from('recurring_blocks')
            .update(payload)
            .eq('id', input.id)
            .select('*')
            .single()
        : supabase.from('recurring_blocks').insert(payload).select('*').single();

      const { data, error } = await query;
      if (error || !data) {
        throw new PolicyError(
          'RECURRING_BLOCK_FAILED',
          error?.message ?? 'No se pudo guardar el bloqueo recurrente.',
        );
      }
      await dispatchOutboxEvent({
        type: 'Realtime',
        eventType: 'schedule_changed',
        payload: { staffId: input.staffId },
      });
      return mapRecurringBlockRow(data);
    },

    async deleteRecurringBlock(id: string): Promise<void> {
      const supabase = getClient();
      await supabase.from('recurring_blocks').delete().eq('id', id);
      await dispatchOutboxEvent({ type: 'Realtime', eventType: 'schedule_changed' });
    },

    async upsertLoyaltyProgram(
      patch: Partial<LoyaltyProgram>,
    ): Promise<LoyaltyProgram> {
      const supabase = getClient();
      const existingQuery = patch.id
        ? supabase.from('loyalty_programs').select('*').eq('id', patch.id).maybeSingle()
        : supabase
            .from('loyalty_programs')
            .select('*')
            .order('is_active', { ascending: false })
            .limit(1)
            .maybeSingle();
      const existingRes = await existingQuery;
      const existing = existingRes.data ? mapLoyaltyProgramRow(existingRes.data) : null;

      const payload = {
        is_active: patch.isActive ?? existing?.isActive ?? true,
        name: patch.name ?? existing?.name ?? 'Tarjeta de Sellos',
        stamps_required: patch.stampsRequired ?? existing?.stampsRequired ?? 8,
        reward_type: patch.rewardType ?? existing?.rewardType ?? 'percent_discount',
        reward_service_id:
          patch.rewardServiceId !== undefined
            ? patch.rewardServiceId
            : (existing?.rewardServiceId ?? null),
        discount_percent: patch.discountPercent ?? existing?.discountPercent ?? 50,
        max_discount_cents: patch.maxDiscountCents ?? existing?.maxDiscountCents ?? 25000,
        valid_days: patch.validDays ?? existing?.validDays ?? 90,
      };
      const targetId = patch.id ?? existing?.id;
      const query = targetId
        ? supabase
            .from('loyalty_programs')
            .update(payload)
            .eq('id', targetId)
            .select('*')
            .single()
        : supabase.from('loyalty_programs').insert(payload).select('*').single();

      const { data, error } = await query;
      if (error || !data) {
        throw new PolicyError(
          'LOYALTY_PROGRAM_FAILED',
          error?.message ?? 'No se pudo guardar el programa de lealtad.',
        );
      }
      return mapLoyaltyProgramRow(data);
    },

    async awardLoyaltyStamp(params: AwardLoyaltyStampInput): Promise<LoyaltyStamp> {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('loyalty_stamps')
        .insert({
          client_id: params.clientId,
          booking_id: params.bookingId,
          program_id: params.programId,
          stamped_date: params.stampedDate,
        })
        .select('*')
        .single();
      if (error || !data) {
        throw new PolicyError(
          error?.code === '23505' ? 'STAMP_ALREADY_AWARDED' : 'LOYALTY_STAMP_FAILED',
          error?.code === '23505'
            ? 'La clienta ya recibió su sello del día.'
            : (error?.message ?? 'No se pudo registrar el sello de lealtad.'),
        );
      }
      return mapLoyaltyStampRow(data);
    },

    async recordConsent(params: RecordConsentInput): Promise<ConsentRecord> {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('consents')
        .insert({
          client_id: params.clientId,
          booking_id: params.bookingId ?? null,
          policy_version: params.policyVersion,
          accepted_at: clock.now().toISOString(),
          marketing_opt_in: Boolean(params.marketingOptIn),
        })
        .select('*')
        .single();
      if (error || !data) {
        throw new PolicyError(
          'CONSENT_RECORD_FAILED',
          error?.message ?? 'No se pudo registrar el consentimiento de privacidad.',
        );
      }
      return mapConsentRow(data);
    },

    async writeAuditLog(params: WriteAuditLogInput): Promise<AuditLogEntry> {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('audit_logs')
        .insert({
          actor_id: params.actorId,
          actor_email: params.actorEmail,
          actor_role: params.actorRole,
          action: params.action,
          entity_type: params.entityType,
          entity_id: params.entityId,
          metadata: params.metadata ?? {},
        })
        .select('*')
        .single();
      if (error || !data) {
        throw new PolicyError(
          'AUDIT_LOG_FAILED',
          error?.message ?? 'No se pudo escribir el registro de auditoría.',
        );
      }
      return mapAuditLogRow(data);
    },

    registerMediaAsset: registerMediaAssetInternal,

    async getMediaAccessOwner(rawStoragePath: string): Promise<MediaAccessOwner | null> {
      const supabase = getClient();
      const storagePath = normalizeMediaStoragePath(rawStoragePath);
      if (!storagePath) return null;

      const mediaRes = await supabase
        .from('media_assets')
        .select('*')
        .eq('storage_path', storagePath)
        .maybeSingle();

      if (mediaRes.data) {
        const asset = mediaRes.data;
        let bookingRow: {
          id: string;
          staff_id: string;
          client_id: string;
          manage_token: string;
        } | null = null;

        if (asset.booking_id) {
          const bookingRes = await supabase
            .from('bookings')
            .select('id, staff_id, client_id, manage_token')
            .eq('id', asset.booking_id)
            .maybeSingle();
          bookingRow = bookingRes.data ?? null;
        }

        const effectiveClientId = asset.client_id ?? bookingRow?.client_id ?? null;
        let clientPhoneE164: string | null = null;
        if (effectiveClientId) {
          const clientRes = await supabase
            .from('clients')
            .select('phone_e164')
            .eq('id', effectiveClientId)
            .maybeSingle();
          clientPhoneE164 = clientRes.data?.phone_e164 ?? null;
        }

        return {
          storagePath,
          folder: asset.folder,
          bookingId: bookingRow?.id ?? asset.booking_id,
          staffId: bookingRow?.staff_id ?? null,
          manageToken: bookingRow?.manage_token ?? null,
          clientPhoneE164,
        };
      }

      const apiMediaPath = `/api/media/${storagePath}`;
      const [proofMatch, inspoMatch] = await Promise.all([
        supabase
          .from('bookings')
          .select('id, staff_id, client_id, manage_token')
          .in('payment_proof_url', [storagePath, apiMediaPath])
          .limit(1)
          .maybeSingle(),
        supabase
          .from('bookings')
          .select('id, staff_id, client_id, manage_token')
          .in('inspo_photo_url', [storagePath, apiMediaPath])
          .limit(1)
          .maybeSingle(),
      ]);

      const booking = proofMatch.data ?? inspoMatch.data ?? null;
      if (!booking) return null;

      const clientRes = await supabase
        .from('clients')
        .select('phone_e164')
        .eq('id', booking.client_id)
        .maybeSingle();

      const folder: MediaAssetFolder =
        inferMediaFolder(storagePath) ?? (inspoMatch.data ? 'inspo' : 'proofs');

      return {
        storagePath,
        folder,
        bookingId: booking.id,
        staffId: booking.staff_id,
        manageToken: booking.manage_token,
        clientPhoneE164: clientRes.data?.phone_e164 ?? null,
      };
    },

    async listMediaAssetsForRetention(): Promise<MediaAssetRecord[]> {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('media_assets')
        .select('*')
        .is('purged_at', null)
        .order('created_at', { ascending: true });
      if (error || !data) {
        return [];
      }
      return data.map(mapMediaAssetRow);
    },

    async markMediaRetentionWarned(
      id: string,
      stage: '30d' | '7d',
      atIso = clock.now().toISOString(),
    ): Promise<MediaAssetRecord | null> {
      const supabase = getClient();
      const existingRes = await supabase
        .from('media_assets')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (!existingRes.data || existingRes.data.purged_at !== null) {
        return null;
      }

      const existing = existingRes.data;
      if (stage === '30d' && existing.retention_warned_30d_at !== null) {
        return mapMediaAssetRow(existing);
      }
      if (stage === '7d' && existing.retention_warned_7d_at !== null) {
        return mapMediaAssetRow(existing);
      }

      const updatePatch: Tables['media_assets']['Update'] =
        stage === '30d'
          ? { retention_warned_30d_at: atIso }
          : { retention_warned_7d_at: atIso };

      const colToGuard =
        stage === '30d' ? 'retention_warned_30d_at' : 'retention_warned_7d_at';

      const updated = await supabase
        .from('media_assets')
        .update(updatePatch)
        .eq('id', id)
        .is(colToGuard, null)
        .is('purged_at', null)
        .select('*')
        .maybeSingle();

      if (!updated.data) {
        const refreshed = await supabase
          .from('media_assets')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        return refreshed.data ? mapMediaAssetRow(refreshed.data) : null;
      }

      await supabase.from('audit_logs').insert({
        actor_id: 'system-retention-cron',
        actor_email: 'cron@laikonanails.mx',
        actor_role: 'owner',
        action: 'media_retention_warned',
        entity_type: 'media_asset',
        entity_id: updated.data.id,
        metadata: {
          stage,
          storagePath: updated.data.storage_path,
          folder: updated.data.folder,
          bookingId: updated.data.booking_id,
        },
      });

      return mapMediaAssetRow(updated.data);
    },

    async markMediaAssetPurged(
      id: string,
      atIso = clock.now().toISOString(),
    ): Promise<MediaAssetRecord | null> {
      const supabase = getClient();
      const existingRes = await supabase
        .from('media_assets')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (!existingRes.data) {
        return null;
      }
      if (existingRes.data.purged_at !== null) {
        return mapMediaAssetRow(existingRes.data);
      }

      const updated = await supabase
        .from('media_assets')
        .update({ purged_at: atIso })
        .eq('id', id)
        .is('purged_at', null)
        .select('*')
        .maybeSingle();

      if (!updated.data) {
        const refreshed = await supabase
          .from('media_assets')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        return refreshed.data ? mapMediaAssetRow(refreshed.data) : null;
      }

      const asset = updated.data;
      const apiMediaPath = `/api/media/${asset.storage_path}`;

      if (asset.booking_id) {
        const bookingPatch: Tables['bookings']['Update'] = {
          updated_at: atIso,
        };
        if (asset.folder === 'proofs') {
          bookingPatch.payment_proof_url = null;
        } else if (asset.folder === 'inspo') {
          bookingPatch.inspo_photo_url = null;
        }
        if (
          bookingPatch.payment_proof_url === null ||
          bookingPatch.inspo_photo_url === null
        ) {
          await supabase
            .from('bookings')
            .update(bookingPatch)
            .eq('id', asset.booking_id);
        }
      }

      if (asset.folder === 'proofs') {
        await supabase
          .from('bookings')
          .update({ payment_proof_url: null, updated_at: atIso })
          .in('payment_proof_url', [asset.storage_path, apiMediaPath]);
      } else if (asset.folder === 'inspo') {
        await supabase
          .from('bookings')
          .update({ inspo_photo_url: null, updated_at: atIso })
          .in('inspo_photo_url', [asset.storage_path, apiMediaPath]);
      }

      await supabase.from('audit_logs').insert({
        actor_id: 'system-retention-cron',
        actor_email: 'cron@laikonanails.mx',
        actor_role: 'owner',
        action: 'media_retention_purged',
        entity_type: 'media_asset',
        entity_id: asset.id,
        metadata: {
          storagePath: asset.storage_path,
          folder: asset.folder,
          bookingId: asset.booking_id,
        },
      });

      return mapMediaAssetRow(asset);
    },

    async getWhatsAppTemplates(): Promise<WhatsAppTemplateConfig[]> {
      const supabase = getClient();
      const { data } = await supabase.from('whatsapp_templates').select('*');
      const mapped = (data ?? [])
        .map(mapWhatsAppTemplateRow)
        .filter((tpl): tpl is WhatsAppTemplateConfig => tpl !== null);
      const defaults = createDefaultWhatsAppTemplates(clock.now().toISOString());
      const byTrigger = new Map<WhatsAppTemplateTriggerKey, WhatsAppTemplateConfig>();
      for (const tpl of defaults) {
        byTrigger.set(tpl.triggerKey, tpl);
      }
      for (const tpl of mapped) {
        byTrigger.set(tpl.triggerKey, tpl);
      }
      const overrides = getWhatsAppTemplateNameOverrides();
      return Array.from(byTrigger.values()).map((tpl) => ({
        ...tpl,
        templateName: overrides[tpl.triggerKey] ?? tpl.templateName,
      }));
    },

    async updateWhatsAppTemplate(
      triggerKey: WhatsAppTemplateTriggerKey,
      patch: { templateName?: string; isActive?: boolean },
    ): Promise<WhatsAppTemplateConfig> {
      const supabase = getClient();
      const spec = getOfficialWhatsAppTemplateSpec(triggerKey);
      const nowIso = clock.now().toISOString();
      const { data: existing } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .eq('trigger_key', triggerKey)
        .maybeSingle();

      const nextName =
        patch.templateName !== undefined
          ? sanitizeWhatsAppTemplateName(patch.templateName, triggerKey)
          : existing?.template_name ?? spec.defaultTemplateName;
      const nextActive =
        patch.isActive !== undefined ? patch.isActive : existing?.is_active ?? true;

      const { data, error } = await supabase
        .from('whatsapp_templates')
        .upsert(
          {
            ...(existing?.id ? { id: existing.id } : {}),
            trigger_key: triggerKey,
            template_name: nextName,
            category: existing?.category ?? spec.category,
            language_code: existing?.language_code ?? spec.languageCode,
            is_active: nextActive,
            updated_at: nowIso,
          },
          { onConflict: 'trigger_key' },
        )
        .select('*')
        .single();

      if (error || !data) {
        throw new PolicyError(
          'WHATSAPP_TEMPLATE_UPDATE_FAILED',
          error?.message || 'No se pudo actualizar la plantilla de WhatsApp.',
        );
      }

      const mapped = mapWhatsAppTemplateRow(data);
      if (!mapped) {
        throw new PolicyError(
          'WHATSAPP_TEMPLATE_UPDATE_FAILED',
          'Plantilla de WhatsApp inválida.',
        );
      }
      return mapped;
    },

    async updateNotificationDeliveryByProviderId(
      providerMessageId: string,
      status: 'sent' | 'failed',
      errorMessage: string | null = null,
    ): Promise<boolean> {
      const cleanId = providerMessageId.trim();
      if (!cleanId) return false;
      const supabase = getClient();
      const nowIso = clock.now().toISOString();
      const { data, error } = await supabase
        .from('scheduled_notifications')
        .update({
          status,
          delivery_status: status === 'sent' ? 'sent' : 'failed',
          error_message: errorMessage,
          ...(status === 'sent' ? { sent_at: nowIso } : {}),
        })
        .eq('provider_message_id', cleanId)
        .select('id');
      return !error && Boolean(data && data.length > 0);
    },

    async getWhatsAppMonthlyUsage(
      monthKey?: string,
    ): Promise<WhatsAppMonthlyUsageSummary> {
      const supabase = getClient();
      const { targetMonthKey, quotaLimit } = await resolveQuotaAndMonth(monthKey);
      const { data } = await supabase
        .from('whatsapp_monthly_usage')
        .select('*')
        .eq('month_key', targetMonthKey)
        .maybeSingle();

      return buildWhatsAppUsageSummary({
        monthKey: targetMonthKey,
        sentCount: data?.sent_count ?? 0,
        quotaLimit: data?.quota_limit ?? quotaLimit,
        warned80At: data?.warned_80_at ?? null,
        warned100At: data?.warned_100_at ?? null,
      });
    },

    async incrementWhatsAppMonthlyUsage(
      monthKey?: string,
      count = 1,
    ): Promise<WhatsAppMonthlyUsageSummary> {
      const supabase = getClient();
      const { targetMonthKey, quotaLimit } = await resolveQuotaAndMonth(monthKey);
      const increment = Math.max(0, Math.floor(count));

      const { data, error } = await supabase.rpc('increment_whatsapp_usage', {
        p_month_key: targetMonthKey,
        p_quota_limit: quotaLimit,
        p_increment: increment,
      });
      if (error) {
        throw new PolicyError(
          'WHATSAPP_USAGE_INCREMENT_FAILED',
          error.message || 'No se pudo actualizar el contador mensual de WhatsApp.',
        );
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        return buildWhatsAppUsageSummary({
          monthKey: targetMonthKey,
          sentCount: increment,
          quotaLimit,
          warned80At: null,
          warned100At: null,
        });
      }

      return buildWhatsAppUsageSummary({
        monthKey: row.month_key,
        sentCount: row.sent_count,
        quotaLimit: row.quota_limit,
        warned80At: row.warned_80_at,
        warned100At: row.warned_100_at,
      });
    },

    async claimWebhookEventIdempotent(
      provider: string,
      eventId: string,
    ): Promise<boolean> {
      const cleanProvider = provider.trim().toLowerCase();
      const cleanEventId = eventId.trim();
      if (!cleanProvider || !cleanEventId) return false;

      const supabase = getClient();
      const { error } = await supabase.from('webhook_events').insert({
        provider: cleanProvider,
        event_id: cleanEventId,
      });

      if (!error) return true;
      if (error.code === '23505') return false;

      throw new PolicyError(
        'WEBHOOK_EVENT_CLAIM_FAILED',
        error.message || 'No se pudo registrar el evento de webhook.',
      );
    },

    async cleanupExpiredSlotHolds(): Promise<CleanupExpiredSlotHoldsResult> {
      const supabase = getClient();
      const { data, error } = await supabase.rpc('purge_expired_slot_holds');
      if (error) {
        return {
          cleanedCount: 0,
          dbAlive: false,
        };
      }
      return {
        cleanedCount: typeof data === 'number' ? data : 0,
        dbAlive: true,
      };
    },

    async listWhatsAppThreads(
      params?: ListWhatsAppThreadsParams,
    ): Promise<{ threads: WhatsAppThreadSummaryDTO[]; summary: WhatsAppInboxSummaryDTO }> {
      const supabase = getClient();
      const nowMs = params?.nowMs ?? clock.nowMs();

      const [
        threadsRes,
        messagesRes,
        clientsRes,
        bookingsRes,
        servicesRes,
        staffRes,
        notifsRes,
      ] = await Promise.all([
        supabase
          .from('whatsapp_threads')
          .select('*')
          .eq('is_archived', false)
          .order('last_message_at', { ascending: false, nullsFirst: false }),
        supabase
          .from('whatsapp_messages')
          .select('thread_id, delivery_status, sender_kind, created_at')
          .order('created_at', { ascending: false }),
        supabase.from('clients').select('*'),
        supabase.from('bookings').select('*'),
        supabase.from('services').select('id, name'),
        supabase.from('staff_members').select('id, name'),
        supabase
          .from('scheduled_notifications')
          .select('id, booking_id, client_id, status')
          .in('status', ['pending', 'failed']),
      ]);

      const threads = (threadsRes.data ?? []).map(mapWhatsAppThreadRow);
      const clients = (clientsRes.data ?? []).map(mapClientRow);
      const bookings = (bookingsRes.data ?? []).map((row) => mapBookingRow(row, []));
      const serviceNameById = new Map(
        (servicesRes.data ?? []).map((s) => [s.id, s.name]),
      );
      const staffNameById = new Map(
        (staffRes.data ?? []).map((s) => [s.id, s.name]),
      );

      const latestMsgByThread = new Map<
        string,
        {
          deliveryStatus: WhatsAppMessage['deliveryStatus'];
          senderKind: WhatsAppMessage['senderKind'];
        }
      >();
      const failedThreadIds = new Set<string>();
      for (const m of messagesRes.data ?? []) {
        if (!latestMsgByThread.has(m.thread_id)) {
          latestMsgByThread.set(m.thread_id, {
            deliveryStatus: m.delivery_status,
            senderKind: m.sender_kind,
          });
        }
        if (m.delivery_status === 'failed') {
          failedThreadIds.add(m.thread_id);
        }
      }

      const role = params?.role;
      const staffMemberId = params?.staffMemberId ?? null;
      const isSpecialist = role === 'specialist';

      const findClientForThread = (thread: WhatsAppThread): ClientProfile | null => {
        if (thread.clientId) {
          const byId = clients.find((c) => c.id === thread.clientId);
          if (byId) return byId;
        }
        return clients.find((c) => phonesMatchE164(c.phoneE164, thread.phoneE164)) ?? null;
      };

      const isVisibleThread = (thread: WhatsAppThread, client: ClientProfile | null): boolean => {
        if (!isSpecialist) return true;
        if (!staffMemberId) return false;
        if (thread.assignedStaffId === staffMemberId) return true;
        if (!client) return false;
        return bookings.some(
          (b) => b.clientId === client.id && b.staffId === staffMemberId,
        );
      };

      const toContext = (b: Booking): WhatsAppThreadBookingContextDTO => ({
        bookingId: b.id,
        bookingCode: b.bookingCode,
        serviceName: serviceNameById.get(b.serviceId) ?? 'Servicio',
        staffId: b.staffId,
        staffName: staffNameById.get(b.staffId) ?? 'Profesional',
        startAt: b.startAt,
        endAt: b.endAt,
        status: b.status,
        attendanceStatus: b.attendanceStatus ?? 'pending',
        totalPriceCents: b.totalPriceCents,
        depositAmountCents: b.depositAmountCents,
        manageToken: b.manageToken,
      });

      const allSummaries: WhatsAppThreadSummaryDTO[] = [];
      for (const thread of threads) {
        const client = findClientForThread(thread);
        if (!isVisibleThread(thread, client)) continue;
        const clientIds = new Set<string>();
        if (thread.clientId) clientIds.add(thread.clientId);
        if (client) clientIds.add(client.id);
        const clientBookings = bookings.filter((b) => clientIds.has(b.clientId));
        const upcomingActive = clientBookings
          .filter((b) => isActiveBookingStatus(b.status) && Date.parse(b.endAt) >= nowMs)
          .toSorted((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
        const otherBookings = clientBookings
          .filter((b) => !(isActiveBookingStatus(b.status) && Date.parse(b.endAt) >= nowMs))
          .toSorted((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt));
        const nextRaw = upcomingActive[0] ?? otherBookings[0] ?? null;
        const latestMsg = latestMsgByThread.get(thread.id) ?? null;

        allSummaries.push({
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
          hasFailedMessages: thread.hasFailedMessages || failedThreadIds.has(thread.id),
          isArchived: thread.isArchived,
          assignedStaffId: thread.assignedStaffId,
          serviceWindow: computeWhatsAppServiceWindow(thread.lastInboundAt, nowMs),
          nextBooking: nextRaw ? toContext(nextRaw) : null,
          lastDeliveryStatus: latestMsg?.deliveryStatus ?? null,
          lastSenderKind: latestMsg?.senderKind ?? null,
        });
      }

      let unreadCount = 0;
      let failedCount = 0;
      let windowOpenCount = 0;
      for (const item of allSummaries) {
        unreadCount += item.unreadCount;
        if (item.hasFailedMessages) failedCount += 1;
        if (item.serviceWindow.isOpen) windowOpenCount += 1;
      }

      const bookingById = new Map(bookings.map((b) => [b.id, b]));
      let failedRemindersCount = 0;
      let pendingRemindersCount = 0;
      for (const n of notifsRes.data ?? []) {
        if (isSpecialist) {
          if (!staffMemberId) continue;
          const b = n.booking_id ? bookingById.get(n.booking_id) : undefined;
          const visible = b
            ? b.staffId === staffMemberId
            : Boolean(
                n.client_id &&
                  bookings.some(
                    (bk) => bk.clientId === n.client_id && bk.staffId === staffMemberId,
                  ),
              );
          if (!visible) continue;
        }
        if (n.status === 'failed') failedRemindersCount += 1;
        if (n.status === 'pending') pendingRemindersCount += 1;
      }

      const summary: WhatsAppInboxSummaryDTO = {
        unreadCount,
        failedCount,
        failedRemindersCount,
        pendingRemindersCount,
        windowOpenCount,
        totalThreads: allSummaries.length,
      };

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
          if (clientIdFilter && item.clientId !== clientIdFilter) return false;
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
    },

    async getWhatsAppThreadDetail(
      params: GetWhatsAppThreadDetailParams,
    ): Promise<WhatsAppThreadDetailData | null> {
      const supabase = getClient();
      const nowMs = params.nowMs ?? clock.nowMs();
      let threadRow: Tables['whatsapp_threads']['Row'] | null = null;

      if (params.threadId) {
        const res = await supabase
          .from('whatsapp_threads')
          .select('*')
          .eq('id', params.threadId)
          .maybeSingle();
        threadRow = res.data ?? null;
      } else if (params.phoneE164) {
        const canonical =
          canonicalizeWhatsAppPhoneE164(params.phoneE164) ||
          normalizePhoneE164(params.phoneE164);
        if (canonical) {
          const variants = phoneLookupVariants(canonical);
          const res = await supabase
            .from('whatsapp_threads')
            .select('*')
            .in('phone_e164', variants)
            .limit(1)
            .maybeSingle();
          threadRow = res.data ?? null;
        }
      } else if (params.clientId) {
        const res = await supabase
          .from('whatsapp_threads')
          .select('*')
          .eq('client_id', params.clientId)
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        threadRow = res.data ?? null;
      }

      if (!threadRow) return null;
      const thread = mapWhatsAppThreadRow(threadRow);
      const limit = Math.max(1, Math.min(500, params.limit ?? 200));

      const phoneVariants = phoneLookupVariants(thread.phoneE164);
      const [messagesRes, clientByIdRes, clientByPhoneRes, servicesRes, staffRes] =
        await Promise.all([
          supabase
            .from('whatsapp_messages')
            .select('*')
            .eq('thread_id', thread.id)
            .order('created_at', { ascending: false })
            .limit(limit),
          thread.clientId
            ? supabase.from('clients').select('*').eq('id', thread.clientId).maybeSingle()
            : Promise.resolve({ data: null as Tables['clients']['Row'] | null }),
          supabase
            .from('clients')
            .select('*')
            .in('phone_e164', phoneVariants)
            .limit(1)
            .maybeSingle(),
          supabase.from('services').select('id, name'),
          supabase.from('staff_members').select('id, name'),
        ]);

      const clientRow = clientByIdRes.data ?? clientByPhoneRes.data ?? null;
      const client = clientRow ? mapClientRow(clientRow) : null;

      let bookings: Booking[] = [];
      if (client) {
        const bookingsRes = await supabase
          .from('bookings')
          .select('*')
          .eq('client_id', client.id);
        bookings = (bookingsRes.data ?? []).map((row) => mapBookingRow(row, []));
      }

      if (params.role === 'specialist') {
        const staffId = params.staffMemberId ?? null;
        if (!staffId) return null;
        const allowed =
          thread.assignedStaffId === staffId ||
          bookings.some((b) => b.staffId === staffId);
        if (!allowed) return null;
      }

      const serviceNameById = new Map(
        (servicesRes.data ?? []).map((s) => [s.id, s.name]),
      );
      const staffNameById = new Map(
        (staffRes.data ?? []).map((s) => [s.id, s.name]),
      );

      const upcomingActive = bookings
        .filter((b) => isActiveBookingStatus(b.status) && Date.parse(b.endAt) >= nowMs)
        .toSorted((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
      const otherBookings = bookings
        .filter((b) => !(isActiveBookingStatus(b.status) && Date.parse(b.endAt) >= nowMs))
        .toSorted((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt));

      const bookingContexts: WhatsAppThreadBookingContextDTO[] = [
        ...upcomingActive,
        ...otherBookings,
      ].map((b) => ({
        bookingId: b.id,
        bookingCode: b.bookingCode,
        serviceName: serviceNameById.get(b.serviceId) ?? 'Servicio',
        staffId: b.staffId,
        staffName: staffNameById.get(b.staffId) ?? 'Profesional',
        startAt: b.startAt,
        endAt: b.endAt,
        status: b.status,
        attendanceStatus: b.attendanceStatus ?? 'pending',
        totalPriceCents: b.totalPriceCents,
        depositAmountCents: b.depositAmountCents,
        manageToken: b.manageToken,
      }));

      const messagesDesc = (messagesRes.data ?? []).map(mapWhatsAppMessageRow);
      const messagesAsc = messagesDesc.toReversed();
      const latestMsg = messagesDesc[0] ?? null;

      const summary: WhatsAppThreadSummaryDTO = {
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
        hasFailedMessages:
          thread.hasFailedMessages ||
          messagesAsc.some((m) => m.deliveryStatus === 'failed'),
        isArchived: thread.isArchived,
        assignedStaffId: thread.assignedStaffId,
        serviceWindow: computeWhatsAppServiceWindow(thread.lastInboundAt, nowMs),
        nextBooking: bookingContexts[0] ?? null,
        lastDeliveryStatus: latestMsg?.deliveryStatus ?? null,
        lastSenderKind: latestMsg?.senderKind ?? null,
      };

      return {
        thread: summary,
        messages: messagesAsc,
        client,
        bookings: bookingContexts,
      };
    },

    async getWhatsAppMessageById(messageId: string): Promise<WhatsAppMessage | null> {
      const validId = toUuidOrNull(messageId);
      if (!validId) return null;
      const supabase = getClient();
      const { data } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('id', validId)
        .maybeSingle();
      return data ? mapWhatsAppMessageRow(data) : null;
    },

    async recordWhatsAppMessage(
      input: RecordWhatsAppMessageInput,
    ): Promise<{ thread: WhatsAppThread; message: WhatsAppMessage }> {
      const supabase = getClient();
      const canonicalPhone =
        canonicalizeWhatsAppPhoneE164(input.phoneE164) ||
        normalizePhoneE164(input.phoneE164);
      if (!canonicalPhone) {
        throw new PolicyError('INVALID_PHONE', 'Número de WhatsApp inválido.');
      }
      const nowIso = input.createdAt ?? clock.now().toISOString();
      const cleanProviderId = input.providerMessageId?.trim() || null;
      const validInputClientId = toUuidOrNull(input.clientId);
      const validBookingId = toUuidOrNull(input.bookingId);
      const validNotificationId = toUuidOrNull(input.notificationId);
      const validAssignedStaffId = toUuidOrNull(input.assignedStaffId);

      if (cleanProviderId) {
        const existingMsgRes = await supabase
          .from('whatsapp_messages')
          .select('*')
          .eq('provider_message_id', cleanProviderId)
          .maybeSingle();
        if (existingMsgRes.data) {
          const existingThreadRes = await supabase
            .from('whatsapp_threads')
            .select('*')
            .eq('id', existingMsgRes.data.thread_id)
            .single();
          if (existingThreadRes.data) {
            return {
              thread: mapWhatsAppThreadRow(existingThreadRes.data),
              message: mapWhatsAppMessageRow(existingMsgRes.data),
            };
          }
        }
      }

      const phoneVariants = phoneLookupVariants(canonicalPhone);
      const [existingThreadRes, matchedClientRes] = await Promise.all([
        supabase
          .from('whatsapp_threads')
          .select('*')
          .in('phone_e164', phoneVariants)
          .limit(1)
          .maybeSingle(),
        validInputClientId
          ? supabase.from('clients').select('*').eq('id', validInputClientId).maybeSingle()
          : supabase
              .from('clients')
              .select('*')
              .in('phone_e164', phoneVariants)
              .limit(1)
              .maybeSingle(),
      ]);

      const matchedClient = matchedClientRes.data
        ? mapClientRow(matchedClientRes.data)
        : null;
      const resolvedClientId = matchedClient?.id ?? validInputClientId;
      let threadRow = existingThreadRes.data ?? null;

      if (!threadRow) {
        const insertThreadRes = await supabase
          .from('whatsapp_threads')
          .insert({
            phone_e164: canonicalPhone,
            client_id: resolvedClientId,
            contact_name:
              input.contactName?.trim() || matchedClient?.fullName || canonicalPhone,
            assigned_staff_id: validAssignedStaffId,
            created_at: nowIso,
            updated_at: nowIso,
          })
          .select('*')
          .single();

        if (insertThreadRes.error) {
          if (insertThreadRes.error.code === '23505') {
            const retryRes = await supabase
              .from('whatsapp_threads')
              .select('*')
              .eq('phone_e164', canonicalPhone)
              .single();
            threadRow = retryRes.data ?? null;
          }
          if (!threadRow) {
            throw new PolicyError(
              'WHATSAPP_THREAD_CREATE_FAILED',
              insertThreadRes.error.message || 'No se pudo crear la conversación.',
            );
          }
        } else {
          threadRow = insertThreadRes.data;
        }
      }

      const isSentOrBeyond =
        input.deliveryStatus === 'sent' ||
        input.deliveryStatus === 'delivered' ||
        input.deliveryStatus === 'read';
      const isDeliveredOrRead =
        input.deliveryStatus === 'delivered' || input.deliveryStatus === 'read';

      const insertMsgRes = await supabase
        .from('whatsapp_messages')
        .insert({
          thread_id: threadRow.id,
          phone_e164: canonicalPhone,
          client_id: threadRow.client_id ?? resolvedClientId,
          booking_id: validBookingId,
          notification_id: validNotificationId,
          direction: input.direction,
          sender_kind: input.senderKind,
          sender_name: input.senderName?.trim() || null,
          message_type: input.messageType ?? 'text',
          body_text: input.bodyText,
          template_name: input.templateName ?? null,
          template_trigger_key: input.templateTriggerKey ?? null,
          template_params: [...(input.templateParams ?? [])],
          delivery_status: input.deliveryStatus,
          delivery_mode: input.deliveryMode,
          provider_message_id: cleanProviderId,
          error_code: input.errorCode ?? null,
          error_message: input.errorMessage ?? null,
          sent_at: isSentOrBeyond ? nowIso : null,
          delivered_at: isDeliveredOrRead ? nowIso : null,
          read_at: input.deliveryStatus === 'read' ? nowIso : null,
          failed_at: input.deliveryStatus === 'failed' ? nowIso : null,
          created_at: nowIso,
        })
        .select('*')
        .single();

      if (insertMsgRes.error || !insertMsgRes.data) {
        if (insertMsgRes.error?.code === '23505' && cleanProviderId) {
          const dupMsgRes = await supabase
            .from('whatsapp_messages')
            .select('*')
            .eq('provider_message_id', cleanProviderId)
            .single();
          if (dupMsgRes.data) {
            return {
              thread: mapWhatsAppThreadRow(threadRow),
              message: mapWhatsAppMessageRow(dupMsgRes.data),
            };
          }
        }
        throw new PolicyError(
          'WHATSAPP_MESSAGE_RECORD_FAILED',
          insertMsgRes.error?.message || 'No se pudo registrar el mensaje de WhatsApp.',
        );
      }

      const msgMs = Date.parse(nowIso);
      const currentLastMs = threadRow.last_message_at
        ? Date.parse(threadRow.last_message_at)
        : -Infinity;
      const threadPatch: Tables['whatsapp_threads']['Update'] = {
        updated_at: nowIso,
      };
      if (threadRow.phone_e164 !== canonicalPhone) {
        threadPatch.phone_e164 = canonicalPhone;
      }
      if (!threadRow.client_id && resolvedClientId) {
        threadPatch.client_id = resolvedClientId;
      }
      if (
        input.contactName?.trim() &&
        (!threadRow.contact_name || threadRow.contact_name === threadRow.phone_e164)
      ) {
        threadPatch.contact_name = input.contactName.trim();
      }
      if (validAssignedStaffId) {
        threadPatch.assigned_staff_id = validAssignedStaffId;
      }
      if (!threadRow.last_message_at || msgMs >= currentLastMs) {
        threadPatch.last_message_at = nowIso;
        threadPatch.last_message_preview = input.bodyText.trim().slice(0, 180);
        threadPatch.last_message_direction = input.direction;
      }
      if (input.direction === 'inbound') {
        const currentInboundMs = threadRow.last_inbound_at
          ? Date.parse(threadRow.last_inbound_at)
          : -Infinity;
        if (!threadRow.last_inbound_at || msgMs >= currentInboundMs) {
          threadPatch.last_inbound_at = nowIso;
        }
        threadPatch.unread_count = threadRow.unread_count + 1;
        threadPatch.is_archived = false;
      }
      if (input.deliveryStatus === 'failed') {
        threadPatch.has_failed_messages = true;
      }

      const updatedThreadRes = await supabase
        .from('whatsapp_threads')
        .update(threadPatch)
        .eq('id', threadRow.id)
        .select('*')
        .single();

      return {
        thread: mapWhatsAppThreadRow(updatedThreadRes.data ?? threadRow),
        message: mapWhatsAppMessageRow(insertMsgRes.data),
      };
    },

    async resolveRetriedWhatsAppMessage(
      input: ResolveRetriedWhatsAppMessageInput,
    ): Promise<{ thread: WhatsAppThread; message: WhatsAppMessage } | null> {
      const validId = toUuidOrNull(input.messageId);
      if (!validId) return null;
      const supabase = getClient();
      const atIso = input.atIso ?? clock.now().toISOString();
      const cleanProviderId = input.providerMessageId?.trim() || null;

      const msgPatch: Tables['whatsapp_messages']['Update'] = {
        delivery_status: input.deliveryStatus,
        delivery_mode: input.deliveryMode,
        sender_kind: 'staff',
        ...(input.senderName?.trim() ? { sender_name: input.senderName.trim() } : {}),
        ...(cleanProviderId ? { provider_message_id: cleanProviderId } : {}),
        ...(input.deliveryStatus === 'sent'
          ? {
              sent_at: atIso,
              error_code: null,
              error_message: null,
              failed_at: null,
            }
          : {
              failed_at: atIso,
              error_code: input.errorCode ?? null,
              error_message: input.errorMessage ?? null,
            }),
      };

      const updatedMsgRes = await supabase
        .from('whatsapp_messages')
        .update(msgPatch)
        .eq('id', validId)
        .select('*')
        .maybeSingle();

      if (!updatedMsgRes.data) return null;

      const failedCheckRes = await supabase
        .from('whatsapp_messages')
        .select('id')
        .eq('thread_id', updatedMsgRes.data.thread_id)
        .eq('delivery_status', 'failed')
        .limit(1);

      const updatedThreadRes = await supabase
        .from('whatsapp_threads')
        .update({
          has_failed_messages: Boolean(
            failedCheckRes.data && failedCheckRes.data.length > 0,
          ),
          updated_at: atIso,
        })
        .eq('id', updatedMsgRes.data.thread_id)
        .select('*')
        .single();

      if (!updatedThreadRes.data) return null;

      return {
        thread: mapWhatsAppThreadRow(updatedThreadRes.data),
        message: mapWhatsAppMessageRow(updatedMsgRes.data),
      };
    },

    async updateWhatsAppMessageStatusByProviderId(
      params: UpdateWhatsAppMessageStatusInput,
    ): Promise<{ updated: boolean; message: WhatsAppMessage | null; threadId: string | null }> {
      const supabase = getClient();
      const cleanProviderId = params.providerMessageId?.trim() || null;
      const validMessageId = toUuidOrNull(params.messageId);
      if (!cleanProviderId && !validMessageId) {
        return { updated: false, message: null, threadId: null };
      }
      const atIso = params.atIso ?? clock.now().toISOString();

      let msgRow: Tables['whatsapp_messages']['Row'] | null = null;
      if (cleanProviderId) {
        const res = await supabase
          .from('whatsapp_messages')
          .select('*')
          .eq('provider_message_id', cleanProviderId)
          .maybeSingle();
        msgRow = res.data ?? null;
      }
      if (!msgRow && validMessageId) {
        const res = await supabase
          .from('whatsapp_messages')
          .select('*')
          .eq('id', validMessageId)
          .maybeSingle();
        msgRow = res.data ?? null;
      }

      if (!msgRow) {
        if (!cleanProviderId) {
          return { updated: false, message: null, threadId: null };
        }
        const notifRes = await supabase
          .from('scheduled_notifications')
          .select('id, status, delivery_status, sent_at')
          .eq('provider_message_id', cleanProviderId);
        let updatedNotif = false;
        for (const n of notifRes.data ?? []) {
          const cur =
            n.delivery_status ??
            (n.status === 'sent'
              ? 'sent'
              : n.status === 'failed'
                ? 'failed'
                : 'queued');
          const nextStatus = resolveNextDeliveryStatus(cur, params.status);
          if (nextStatus === 'failed') {
            await supabase
              .from('scheduled_notifications')
              .update({
                status: 'failed',
                delivery_status: 'failed',
                error_message: params.errorMessage ?? null,
              })
              .eq('id', n.id);
            updatedNotif = true;
          } else if (
            nextStatus === 'sent' ||
            nextStatus === 'delivered' ||
            nextStatus === 'read'
          ) {
            await supabase
              .from('scheduled_notifications')
              .update({
                status: 'sent',
                delivery_status: nextStatus,
                sent_at: n.sent_at ?? atIso,
                error_message: null,
                next_retry_at: null,
              })
              .eq('id', n.id);
            updatedNotif = true;
          }
        }
        return { updated: updatedNotif, message: null, threadId: null };
      }

      const nextStatus = resolveNextDeliveryStatus(
        msgRow.delivery_status,
        params.status,
      );
      const changed =
        nextStatus !== msgRow.delivery_status ||
        (nextStatus === 'failed' &&
          (Boolean(params.errorCode && params.errorCode !== msgRow.error_code) ||
            Boolean(params.errorMessage && params.errorMessage !== msgRow.error_message)));

      if (!changed) {
        return {
          updated: false,
          message: mapWhatsAppMessageRow(msgRow),
          threadId: msgRow.thread_id,
        };
      }

      const msgPatch: Tables['whatsapp_messages']['Update'] = {
        delivery_status: nextStatus,
      };
      if (nextStatus === 'sent') {
        if (!msgRow.sent_at) msgPatch.sent_at = atIso;
      } else if (nextStatus === 'delivered') {
        if (!msgRow.sent_at) msgPatch.sent_at = atIso;
        if (!msgRow.delivered_at) msgPatch.delivered_at = atIso;
        msgPatch.error_code = null;
        msgPatch.error_message = null;
        msgPatch.failed_at = null;
      } else if (nextStatus === 'read') {
        if (!msgRow.sent_at) msgPatch.sent_at = atIso;
        if (!msgRow.delivered_at) msgPatch.delivered_at = atIso;
        if (!msgRow.read_at) msgPatch.read_at = atIso;
        msgPatch.error_code = null;
        msgPatch.error_message = null;
        msgPatch.failed_at = null;
      } else if (nextStatus === 'failed') {
        msgPatch.failed_at = atIso;
        msgPatch.error_code = params.errorCode ?? msgRow.error_code;
        msgPatch.error_message = params.errorMessage ?? msgRow.error_message;
      }

      const updatedMsgRes = await supabase
        .from('whatsapp_messages')
        .update(msgPatch)
        .eq('id', msgRow.id)
        .select('*')
        .single();

      const failedCheckRes = await supabase
        .from('whatsapp_messages')
        .select('id')
        .eq('thread_id', msgRow.thread_id)
        .eq('delivery_status', 'failed')
        .limit(1);

      await supabase
        .from('whatsapp_threads')
        .update({
          has_failed_messages: Boolean(
            failedCheckRes.data && failedCheckRes.data.length > 0,
          ),
          updated_at: atIso,
        })
        .eq('id', msgRow.thread_id);

      const notifPatch: Tables['scheduled_notifications']['Update'] | null =
        nextStatus === 'failed'
          ? {
              status: 'failed',
              delivery_status: 'failed',
              error_message: params.errorMessage ?? msgRow.error_message ?? null,
            }
          : nextStatus === 'sent' || nextStatus === 'delivered' || nextStatus === 'read'
            ? {
                status: 'sent',
                delivery_status: nextStatus,
                error_message: null,
                next_retry_at: null,
              }
            : null;

      if (notifPatch) {
        if (msgRow.notification_id) {
          await supabase
            .from('scheduled_notifications')
            .update(notifPatch)
            .eq('id', msgRow.notification_id);
        } else if (msgRow.provider_message_id) {
          await supabase
            .from('scheduled_notifications')
            .update(notifPatch)
            .eq('provider_message_id', msgRow.provider_message_id);
        }
      }

      return {
        updated: true,
        message: mapWhatsAppMessageRow(updatedMsgRes.data ?? msgRow),
        threadId: msgRow.thread_id,
      };
    },

    async markWhatsAppThreadRead(
      threadId: string,
      atIso?: string,
    ): Promise<WhatsAppThread | null> {
      const supabase = getClient();
      const readAt = atIso ?? clock.now().toISOString();
      const { data } = await supabase
        .from('whatsapp_threads')
        .update({
          unread_count: 0,
          last_read_at: readAt,
          updated_at: readAt,
        })
        .eq('id', threadId)
        .select('*')
        .maybeSingle();
      return data ? mapWhatsAppThreadRow(data) : null;
    },

    async getWhatsAppThreadWindow(
      lookup: { threadId?: string; phoneE164?: string },
      nowMs = clock.nowMs(),
    ): Promise<WhatsAppServiceWindowDTO> {
      const supabase = getClient();
      let lastInboundAt: string | null = null;
      if (lookup.threadId) {
        const { data } = await supabase
          .from('whatsapp_threads')
          .select('last_inbound_at')
          .eq('id', lookup.threadId)
          .maybeSingle();
        lastInboundAt = data?.last_inbound_at ?? null;
      } else if (lookup.phoneE164) {
        const canonical =
          canonicalizeWhatsAppPhoneE164(lookup.phoneE164) ||
          normalizePhoneE164(lookup.phoneE164);
        if (canonical) {
          const { data } = await supabase
            .from('whatsapp_threads')
            .select('last_inbound_at')
            .in('phone_e164', phoneLookupVariants(canonical))
            .limit(1)
            .maybeSingle();
          lastInboundAt = data?.last_inbound_at ?? null;
        }
      }
      return computeWhatsAppServiceWindow(lastInboundAt, nowMs);
    },

    async getWhatsAppUnreadSummary(params?: {
      role?: AdminRole;
      staffMemberId?: string | null;
      nowMs?: number;
    }): Promise<WhatsAppInboxSummaryDTO> {
      const supabase = getClient();
      const nowMs = params?.nowMs ?? clock.nowMs();
      const isSpecialist = params?.role === 'specialist';
      const staffId = params?.staffMemberId ?? null;

      const [threadsRes, notifsRes, clientsRes, bookingsRes] = await Promise.all([
        supabase
          .from('whatsapp_threads')
          .select('id, client_id, phone_e164, unread_count, has_failed_messages, last_inbound_at, assigned_staff_id')
          .eq('is_archived', false),
        supabase
          .from('scheduled_notifications')
          .select('booking_id, client_id, status')
          .in('status', ['pending', 'failed']),
        isSpecialist
          ? supabase.from('clients').select('id, phone_e164')
          : Promise.resolve({ data: [] as Array<{ id: string; phone_e164: string }> }),
        isSpecialist && staffId
          ? supabase.from('bookings').select('id, client_id, staff_id').eq('staff_id', staffId)
          : Promise.resolve({
              data: [] as Array<{ id: string; client_id: string; staff_id: string }>,
            }),
      ]);

      const staffBookingIds = new Set((bookingsRes.data ?? []).map((b) => b.id));
      const staffClientIds = new Set((bookingsRes.data ?? []).map((b) => b.client_id));
      const staffPhones = (clientsRes.data ?? [])
        .filter((c) => staffClientIds.has(c.id))
        .map((c) => c.phone_e164);

      let unreadCount = 0;
      let failedCount = 0;
      let windowOpenCount = 0;
      let totalThreads = 0;

      for (const t of threadsRes.data ?? []) {
        if (isSpecialist) {
          if (!staffId) continue;
          const visible =
            t.assigned_staff_id === staffId ||
            (t.client_id !== null && staffClientIds.has(t.client_id)) ||
            staffPhones.some((p) => phonesMatchE164(p, t.phone_e164));
          if (!visible) continue;
        }
        totalThreads += 1;
        unreadCount += t.unread_count;
        if (t.has_failed_messages) failedCount += 1;
        if (computeWhatsAppServiceWindow(t.last_inbound_at, nowMs).isOpen) {
          windowOpenCount += 1;
        }
      }

      let failedRemindersCount = 0;
      let pendingRemindersCount = 0;
      for (const n of notifsRes.data ?? []) {
        if (isSpecialist) {
          if (!staffId) continue;
          const visible =
            (n.booking_id !== null && staffBookingIds.has(n.booking_id)) ||
            (n.client_id !== null && staffClientIds.has(n.client_id));
          if (!visible) continue;
        }
        if (n.status === 'failed') failedRemindersCount += 1;
        if (n.status === 'pending') pendingRemindersCount += 1;
      }

      return {
        unreadCount,
        failedCount,
        failedRemindersCount,
        pendingRemindersCount,
        windowOpenCount,
        totalThreads,
      };
    },

    async listScheduledNotifications(
      params?: ListScheduledNotificationsParams,
    ): Promise<WhatsAppReminderItemDTO[]> {
      const supabase = getClient();
      const limit = Math.max(1, Math.min(200, params?.limit ?? 100));

      let notifQuery = supabase.from('scheduled_notifications').select('*');
      if (params?.status) notifQuery = notifQuery.eq('status', params.status);
      if (params?.channel) notifQuery = notifQuery.eq('channel', params.channel);
      if (params?.bookingId) notifQuery = notifQuery.eq('booking_id', params.bookingId);
      notifQuery = notifQuery
        .order('scheduled_for', { ascending: params?.status === 'pending' })
        .limit(limit * 2);

      const [notifsRes, workflowsRes, bookingsRes, clientsRes, servicesRes, staffRes] =
        await Promise.all([
          notifQuery,
          supabase.from('notification_workflows').select('*'),
          supabase.from('bookings').select('*'),
          supabase.from('clients').select('*'),
          supabase.from('services').select('id, name'),
          supabase.from('staff_members').select('id, name'),
        ]);

      const notifications = (notifsRes.data ?? []).map(mapNotificationRow);
      const workflows = (workflowsRes.data ?? []).map(mapWorkflowRow);
      const bookings = (bookingsRes.data ?? []).map((row) => mapBookingRow(row, []));
      const clients = (clientsRes.data ?? []).map(mapClientRow);

      const workflowById = new Map(workflows.map((w) => [w.id, w]));
      const bookingById = new Map(bookings.map((b) => [b.id, b]));
      const clientById = new Map(clients.map((c) => [c.id, c]));
      const serviceNameById = new Map(
        (servicesRes.data ?? []).map((s) => [s.id, s.name]),
      );
      const staffNameById = new Map(
        (staffRes.data ?? []).map((s) => [s.id, s.name]),
      );

      const isSpecialist = params?.role === 'specialist';
      const staffMemberId = params?.staffMemberId ?? null;

      const visible = notifications.filter((item) => {
        if (!isSpecialist) return true;
        if (!staffMemberId) return false;
        if (item.bookingId) {
          return bookingById.get(item.bookingId)?.staffId === staffMemberId;
        }
        if (item.clientId) {
          return bookings.some(
            (b) => b.clientId === item.clientId && b.staffId === staffMemberId,
          );
        }
        return false;
      });

      const sorted =
        params?.status === 'pending'
          ? visible.toSorted(
              (a, b) => Date.parse(a.scheduledFor) - Date.parse(b.scheduledFor),
            )
          : visible.toSorted((a, b) => {
              const aKey = Date.parse(a.sentAt ?? a.scheduledFor ?? a.createdAt);
              const bKey = Date.parse(b.sentAt ?? b.scheduledFor ?? b.createdAt);
              return bKey - aKey;
            });

      return sorted.slice(0, limit).map((item) => {
        const booking = item.bookingId ? bookingById.get(item.bookingId) : undefined;
        const client =
          (booking ? clientById.get(booking.clientId) : undefined) ??
          (item.clientId ? clientById.get(item.clientId) : undefined) ??
          clients.find((c) => phonesMatchE164(c.phoneE164, item.recipient));
        const workflow = item.workflowId ? workflowById.get(item.workflowId) : undefined;

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
          staffName: booking ? (staffNameById.get(booking.staffId) ?? null) : null,
          serviceName: booking ? (serviceNameById.get(booking.serviceId) ?? null) : null,
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
    },

    async getScheduledNotificationById(
      id: string,
    ): Promise<ScheduledNotification | null> {
      const supabase = getClient();
      const { data } = await supabase
        .from('scheduled_notifications')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      return data ? mapNotificationRow(data) : null;
    },

    async retryScheduledNotification(
      id: string,
      atIso?: string,
    ): Promise<ScheduledNotification> {
      const supabase = getClient();
      const existingRes = await supabase
        .from('scheduled_notifications')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (!existingRes.data) {
        throw new PolicyError('NOTIFICATION_NOT_FOUND', 'Recordatorio no encontrado.');
      }
      const nextMaxAttempts = Math.max(
        existingRes.data.max_attempts ?? 3,
        (existingRes.data.attempts ?? 0) + 1,
      );
      const scheduledAt = atIso ?? clock.now().toISOString();
      const { data, error } = await supabase
        .from('scheduled_notifications')
        .update({
          status: 'pending',
          delivery_status: 'queued',
          error_message: null,
          scheduled_for: scheduledAt,
          next_retry_at: null,
          max_attempts: nextMaxAttempts,
        })
        .eq('id', id)
        .select('*')
        .single();
      if (error || !data) {
        throw new PolicyError(
          'NOTIFICATION_RETRY_FAILED',
          error?.message ?? 'No se pudo reprogramar el recordatorio.',
        );
      }
      return mapNotificationRow(data);
    },

    async cancelScheduledNotification(
      id: string,
      reason?: string,
    ): Promise<ScheduledNotification> {
      const supabase = getClient();
      const patch: Tables['scheduled_notifications']['Update'] = {
        status: 'canceled',
        next_retry_at: null,
      };
      if (reason?.trim()) {
        patch.error_message = reason.trim();
      }
      const { data, error } = await supabase
        .from('scheduled_notifications')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (error || !data) {
        throw new PolicyError('NOTIFICATION_NOT_FOUND', 'Recordatorio no encontrado.');
      }
      return mapNotificationRow(data);
    },

    async updateScheduledNotificationStatus(
      id: string,
      patch: UpdateScheduledNotificationStatusInput,
    ): Promise<ScheduledNotification | null> {
      const supabase = getClient();
      const dbPatch: Tables['scheduled_notifications']['Update'] = {
        status: patch.status,
      };
      if (patch.deliveryStatus !== undefined) {
        dbPatch.delivery_status = patch.deliveryStatus;
      }
      if (patch.providerMessageId !== undefined) {
        dbPatch.provider_message_id = patch.providerMessageId;
      }
      if (patch.errorMessage !== undefined) {
        dbPatch.error_message = patch.errorMessage;
      }
      if (patch.sentAt !== undefined) {
        dbPatch.sent_at = patch.sentAt;
      }
      if (patch.attempts !== undefined) {
        dbPatch.attempts = patch.attempts;
      }
      if (patch.nextRetryAt !== undefined) {
        dbPatch.next_retry_at = patch.nextRetryAt;
      }
      if (patch.lastAttemptAt !== undefined) {
        dbPatch.last_attempt_at = patch.lastAttemptAt;
      }
      const { data } = await supabase
        .from('scheduled_notifications')
        .update(dbPatch)
        .eq('id', id)
        .select('*')
        .maybeSingle();
      return data ? mapNotificationRow(data) : null;
    },

    async updateNotificationWorkflow(
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

    async getOutboxSummary(): Promise<OutboxSummary> {
      const supabase = getClient();
      const { data } = await supabase.from('outbox_events').select('status');
      let pendingCount = 0;
      let processingCount = 0;
      let failedCount = 0;
      let processedCount = 0;
      for (const row of data ?? []) {
        if (row.status === 'pending') pendingCount += 1;
        else if (row.status === 'processing') processingCount += 1;
        else if (row.status === 'failed') failedCount += 1;
        else if (row.status === 'processed') processedCount += 1;
      }
      return { pendingCount, processingCount, failedCount, processedCount };
    },

    async drainStaleOutboxEvents(
      olderThanMs = 5 * 60_000,
      nowMs = clock.nowMs(),
    ): Promise<{ drainedCount: number }> {
      const supabase = getClient();
      const nowIso = new Date(nowMs).toISOString();
      const cutoffIso = new Date(nowMs - Math.max(0, olderThanMs)).toISOString();
      const { data } = await supabase
        .from('outbox_events')
        .update({
          status: 'pending',
          available_at: nowIso,
        })
        .eq('status', 'processing')
        .lte('available_at', cutoffIso)
        .select('id');
      return { drainedCount: data?.length ?? 0 };
    },
  };
}

export async function fetchSupabaseServicesByIds(
  serviceIds: readonly string[],
  clientOverride?: SupabaseClient<Database>,
): Promise<Service[]> {
  const uniqueIds = Array.from(
    new Set(serviceIds.map((id) => id.trim()).filter((id) => id.length > 0)),
  );
  if (uniqueIds.length === 0) return [];
  const supabase = clientOverride ?? createSupabaseAdminClient();
  const { data } = await supabase.from('services').select('*').in('id', uniqueIds);
  return (data ?? []).map(mapServiceRow);
}

export async function fetchSupabaseAddonsByIds(
  addonIds: readonly string[],
  clientOverride?: SupabaseClient<Database>,
): Promise<ServiceAddon[]> {
  const uniqueIds = Array.from(
    new Set(addonIds.map((id) => id.trim()).filter((id) => id.length > 0)),
  );
  if (uniqueIds.length === 0) return [];
  const supabase = clientOverride ?? createSupabaseAdminClient();
  const { data } = await supabase
    .from('service_addons')
    .select('*')
    .in('id', uniqueIds)
    .eq('is_active', true);
  return (data ?? []).map(mapAddonRow);
}

export async function fetchSupabaseBookingById(
  bookingId: string,
  clientOverride?: SupabaseClient<Database>,
): Promise<BookingWithRelations | null> {
  const cleanId = bookingId.trim();
  if (!cleanId) return null;
  const supabase = clientOverride ?? createSupabaseAdminClient();
  const bookingRes = await supabase
    .from('bookings')
    .select('*')
    .eq('id', cleanId)
    .maybeSingle();
  if (!bookingRes.data) return null;
  return hydrateBookingRowWithClient(supabase, bookingRes.data);
}

export async function fetchSupabaseBookingStaffId(
  bookingId: string,
  clientOverride?: SupabaseClient<Database>,
): Promise<string | null> {
  const cleanId = bookingId.trim();
  if (!cleanId) return null;
  const supabase = clientOverride ?? createSupabaseAdminClient();
  const res = await supabase
    .from('bookings')
    .select('staff_id')
    .eq('id', cleanId)
    .maybeSingle();
  return res.data?.staff_id ?? null;
}

export async function fetchSupabaseBookingPaymentSplits(
  bookingId: string,
  clientOverride?: SupabaseClient<Database>,
): Promise<PaymentSplit[]> {
  const cleanId = bookingId.trim();
  if (!cleanId) return [];
  const supabase = clientOverride ?? createSupabaseAdminClient();
  const { data } = await supabase
    .from('payment_splits')
    .select('*')
    .eq('booking_id', cleanId);
  return (data ?? []).map(mapPaymentSplitRow);
}

export async function fetchSupabaseRecurringBlockStaffId(
  blockId: string,
  clientOverride?: SupabaseClient<Database>,
): Promise<string | null> {
  const cleanId = blockId.trim();
  if (!cleanId) return null;
  const supabase = clientOverride ?? createSupabaseAdminClient();
  const res = await supabase
    .from('recurring_blocks')
    .select('staff_id')
    .eq('id', cleanId)
    .maybeSingle();
  return res.data?.staff_id ?? null;
}

export async function fetchSupabaseDateOverrideStaffId(
  overrideId: string,
  clientOverride?: SupabaseClient<Database>,
): Promise<string | null> {
  const cleanId = overrideId.trim();
  if (!cleanId) return null;
  const supabase = clientOverride ?? createSupabaseAdminClient();
  const res = await supabase
    .from('date_overrides')
    .select('staff_id')
    .eq('id', cleanId)
    .maybeSingle();
  return res.data?.staff_id ?? null;
}

export async function fetchSupabaseActiveInventoryItemById(
  itemId: string,
  clientOverride?: SupabaseClient<Database>,
): Promise<InventoryItem | null> {
  const cleanId = itemId.trim();
  if (!cleanId) return null;
  const supabase = clientOverride ?? createSupabaseAdminClient();
  const res = await supabase
    .from('inventory_items')
    .select('*')
    .eq('id', cleanId)
    .eq('is_active', true)
    .maybeSingle();
  return res.data ? mapInventoryItemRow(res.data) : null;
}

export async function fetchSupabaseStaffMemberById(
  staffId: string,
  clientOverride?: SupabaseClient<Database>,
): Promise<StaffMember | null> {
  const cleanId = staffId.trim();
  if (!cleanId) return null;
  const supabase = clientOverride ?? createSupabaseAdminClient();
  const [staffRes, linksRes] = await Promise.all([
    supabase.from('staff_members').select('*').eq('id', cleanId).maybeSingle(),
    supabase.from('staff_services').select('*').eq('staff_id', cleanId),
  ]);
  if (!staffRes.data) return null;
  return mapStaffRow(staffRes.data, linksRes.data ?? []);
}

export async function fetchSupabaseStaffCalendarConnection(
  staffId: string,
  clientOverride?: SupabaseClient<Database>,
): Promise<CalendarConnection | null> {
  const cleanId = staffId.trim();
  if (!cleanId) return null;
  const supabase = clientOverride ?? createSupabaseAdminClient();
  const res = await supabase
    .from('calendar_connections')
    .select('*')
    .eq('staff_id', cleanId)
    .eq('is_connected', true)
    .limit(1)
    .maybeSingle();
  return res.data ? mapCalendarConnectionRow(res.data) : null;
}

export async function fetchSupabaseActiveLoyaltyProgram(
  clientOverride?: SupabaseClient<Database>,
): Promise<LoyaltyProgram | null> {
  const supabase = clientOverride ?? createSupabaseAdminClient();
  const res = await supabase
    .from('loyalty_programs')
    .select('*')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  return res.data ? mapLoyaltyProgramRow(res.data) : null;
}

export async function fetchSupabaseClientLoyaltyStamps(
  clientId: string,
  programId: string,
  clientOverride?: SupabaseClient<Database>,
): Promise<LoyaltyStamp[]> {
  const supabase = clientOverride ?? createSupabaseAdminClient();
  const { data } = await supabase
    .from('loyalty_stamps')
    .select('*')
    .eq('client_id', clientId)
    .eq('program_id', programId);
  return (data ?? []).map(mapLoyaltyStampRow);
}

export async function fetchSupabaseHasOverlappingBooking(
  params: {
    staffId: string;
    excludeBookingId: string;
    occStartIso: string;
    occEndIso: string;
  },
  clientOverride?: SupabaseClient<Database>,
): Promise<boolean> {
  const supabase = clientOverride ?? createSupabaseAdminClient();
  const { data } = await supabase
    .from('bookings')
    .select('id')
    .eq('staff_id', params.staffId)
    .neq('id', params.excludeBookingId)
    .in('status', ['pending_payment', 'pending_confirmation', 'confirmed'])
    .lt('occupied_start_at', params.occEndIso)
    .gt('occupied_end_at', params.occStartIso)
    .limit(1);
  return (data ?? []).length > 0;
}

export async function fetchSupabaseClientLoyaltySummary(
  clientId: string,
  clientOverride?: SupabaseClient<Database>,
): Promise<PublicLoyaltySummaryDTO | null> {
  const cleanClientId = clientId.trim();
  if (!cleanClientId) return null;
  const supabase = clientOverride ?? createSupabaseAdminClient();
  const [programsRes, stampsRes] = await Promise.all([
    supabase.from('loyalty_programs').select('*').eq('is_active', true),
    supabase.from('loyalty_stamps').select('*').eq('client_id', cleanClientId),
  ]);
  const activeProgramRow = (programsRes.data ?? [])[0] ?? null;
  if (!activeProgramRow) return null;
  const activeProgram = mapLoyaltyProgramRow(activeProgramRow);
  const stamps = (stampsRes.data ?? []).map(mapLoyaltyStampRow);
  let rewardServiceName: string | null = null;
  if (activeProgram.rewardServiceId) {
    const rewardRes = await supabase
      .from('services')
      .select('name')
      .eq('id', activeProgram.rewardServiceId)
      .maybeSingle();
    rewardServiceName = rewardRes.data?.name ?? null;
  }
  return PublicLoyaltySummarySchema.parse(
    computeClientLoyaltySummary(activeProgram, stamps, cleanClientId, rewardServiceName),
  );
}
