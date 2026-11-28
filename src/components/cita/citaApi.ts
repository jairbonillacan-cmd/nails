import type { AvailableSlot, DayAvailabilitySummary } from '@/lib/availability/engine';
import { checkManagePolicyWindow } from '@/lib/availability/policy';
import {
  buildTouchUpBookingUrl,
  computeSuggestedTouchUpDateKey,
} from '@/lib/booking/recurrence';
import { resolveTouchUpDays } from '@/lib/cita/cita-settings';
import { fetchJsonWithTimeout } from '@/lib/http/client-fetch';
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

type RescheduleAvailabilityResult =
  | { ok: true; days: DayAvailabilitySummary[] }
  | { ok: false; aborted: boolean; error: string };

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
  const res = await fetchJsonWithTimeout<ManageBookingPayload>(
    `/api/bookings/manage/${encodeURIComponent(manageToken)}`,
    {
      cache: 'no-store',
      signal,
    },
  );
  if (!res.ok || signal?.aborted) return null;
  return res.data;
}

export async function fetchRescheduleAvailability(params: {
  serviceId: string;
  extraServiceIdsKey: string;
  addonIdsKey: string;
  staffId: string;
  startDate: string;
  manageToken: string;
  signal?: AbortSignal;
}): Promise<RescheduleAvailabilityResult> {
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
  const res = await fetchJsonWithTimeout<{ days?: DayAvailabilitySummary[] }>(
    `/api/availability?${qs.toString()}`,
    {
      cache: 'no-store',
      signal: params.signal,
    },
  );
  if (!res.ok) {
    return {
      ok: false,
      aborted: res.aborted || Boolean(params.signal?.aborted),
      error: res.error,
    };
  }
  if (params.signal?.aborted) {
    return { ok: false, aborted: true, error: 'Solicitud cancelada.' };
  }
  const days = Array.isArray(res.data.days)
    ? res.data.days.filter((d) => d.hasSlots).slice(0, 6)
    : [];
  return { ok: true, days };
}

export async function patchManageBooking(
  manageToken: string,
  payload: ManagePatchRequest,
): Promise<{ ok: boolean; status: number; data: ManageBookingPayload }> {
  const res = await fetchJsonWithTimeout<ManageBookingPayload>(
    `/api/bookings/manage/${encodeURIComponent(manageToken)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  if (res.ok) {
    return { ok: true, status: res.status, data: res.data };
  }
  const resolvedError =
    res.status === 429 ? res.error : (res.data?.error || res.error);
  return {
    ok: false,
    status: res.status,
    data: {
      ...(res.data ?? {}),
      error: resolvedError,
    },
  };
}

export async function postManageBookingReview(
  manageToken: string,
  rating: 1 | 2 | 3 | 4 | 5,
  comment: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetchJsonWithTimeout<{ error?: string }>(
    `/api/bookings/manage/${encodeURIComponent(manageToken)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating, comment }),
    },
  );
  if (res.ok) return { ok: true };
  return {
    ok: false,
    error: res.status === 429 ? res.error : (res.data?.error || res.error),
  };
}
