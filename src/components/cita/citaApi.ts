import type { AvailableSlot, DayAvailabilitySummary } from '@/lib/availability/engine';
import { checkManagePolicyWindow } from '@/lib/availability/policy';
import {
  buildTouchUpBookingUrl,
  computeSuggestedTouchUpDateKey,
} from '@/lib/booking/recurrence';
import { resolveTouchUpDays } from '@/lib/cita/cita-settings';
import type { PublicLoyaltySummaryDTO, PublicSettingsDTO } from '@/lib/public-dto';
import {
  buildPolicyHelpWhatsAppUrl,
  type CalendarAddLinks,
  type PublicManageBooking,
} from './types';

export interface ManageBookingPayload {
  booking?: PublicManageBooking;
  calendarLinks?: CalendarAddLinks;
  whatsappUrl?: string;
  manageUrl?: string;
  loyaltySummary?: PublicLoyaltySummaryDTO | null;
  code?: string;
  error?: string;
  suggestedSlots?: AvailableSlot[];
}

export type ManagePatchRequest =
  | { action: 'upload_proof'; paymentProofUrl: string }
  | { action: 'confirm_attendance' }
  | { action: 'reschedule'; newStartAt: string; newStaffId: string; reason?: string }
  | { action: 'cancel'; reason?: string };

export function resolveInitialNowMs(
  renderedAtIso: string | undefined,
  updatedAtIso: string,
): number {
  const parsed = renderedAtIso ? new Date(renderedAtIso).getTime() : Number.NaN;
  if (!Number.isNaN(parsed)) return parsed;
  const updated = new Date(updatedAtIso).getTime();
  return Number.isNaN(updated) ? 0 : updated;
}

export function resolveNextReasonText(
  option: string,
  currentReason: string,
  presets: readonly string[],
): string {
  if (option !== 'Otro') return option;
  return presets.some((preset) => preset === currentReason.trim()) ? '' : currentReason;
}

export function computeManagePoliciesAndUrls(params: {
  booking: PublicManageBooking;
  settings: PublicSettingsDTO;
  nowMs: number;
  tz: string;
  whatsappUrl: string;
}) {
  const { booking, settings, nowMs, tz, whatsappUrl } = params;
  const reschedulePolicy = checkManagePolicyWindow({
    startAtIso: booking.startAt,
    nowMs,
    minHours: settings.minRescheduleHours,
    action: 'reschedule',
  });
  const cancelPolicy = checkManagePolicyWindow({
    startAtIso: booking.startAt,
    nowMs,
    minHours: settings.minCancelHours,
    action: 'cancel',
  });
  const policyHelpWhatsappUrl = buildPolicyHelpWhatsAppUrl({
    booking,
    settings,
    minHours: Math.max(settings.minCancelHours, settings.minRescheduleHours),
    fallbackUrl: whatsappUrl,
  });
  const touchUpDays = resolveTouchUpDays(settings.landingContent);
  const touchUpUrl = buildTouchUpBookingUrl({
    serviceSlug: booking.service.slug,
    staffSlug: booking.staff.bookingSlug,
    suggestedDateKey: computeSuggestedTouchUpDateKey({
      startAt: booking.startAt,
      touchUpDays,
      timezone: tz,
    }),
  });
  return { reschedulePolicy, cancelPolicy, policyHelpWhatsappUrl, touchUpUrl, touchUpDays };
}

export async function fetchManageBookingSnapshot(
  manageToken: string,
  signal?: AbortSignal,
): Promise<ManageBookingPayload | null> {
  const res = await fetch(`/api/bookings/manage/${encodeURIComponent(manageToken)}`, {
    cache: 'no-store',
    signal,
  });
  if (!res.ok || signal?.aborted) return null;
  return (await res.json()) as ManageBookingPayload;
}

export async function fetchRescheduleAvailability(params: {
  serviceId: string;
  extraServiceIdsKey: string;
  addonIdsKey: string;
  staffId: string;
  startDate: string;
  manageToken: string;
  signal?: AbortSignal;
}): Promise<DayAvailabilitySummary[]> {
  const qs = new URLSearchParams({
    serviceId: params.serviceId,
    addonIds: params.addonIdsKey,
    staffId: params.staffId,
    startDate: params.startDate,
    days: '14',
    manageToken: params.manageToken,
  });
  if (params.extraServiceIdsKey) {
    qs.set('extraServiceIds', params.extraServiceIdsKey);
  }
  const res = await fetch(`/api/availability?${qs.toString()}`, {
    cache: 'no-store',
    signal: params.signal,
  });
  if (params.signal?.aborted) return [];
  const data = (await res.json()) as { days?: DayAvailabilitySummary[] };
  return (data.days ?? []).filter((d) => d.hasSlots).slice(0, 6);
}

export async function patchManageBooking(
  manageToken: string,
  payload: ManagePatchRequest,
): Promise<{ ok: boolean; status: number; data: ManageBookingPayload }> {
  const res = await fetch(`/api/bookings/manage/${encodeURIComponent(manageToken)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as ManageBookingPayload;
  return { ok: res.ok, status: res.status, data };
}

export async function postManageBookingReview(
  manageToken: string,
  rating: 1 | 2 | 3 | 4 | 5,
  comment: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/bookings/manage/${encodeURIComponent(manageToken)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating, comment }),
  });
  const data = (await res.json()) as { error?: string };
  return { ok: res.ok, error: data.error };
}
