import type { AvailableSlot, DayAvailabilitySummary } from '@/lib/availability/engine';
import { fetchJsonWithTimeout } from '@/lib/http/client-fetch';
import {
  normalizeUniqueSortedIds,
  type ProofDeliveryMethod,
} from './bookingHelpers';

export interface AppliedCouponState {
  code: string;
  kind: string;
  discountCents: number;
}

export interface ActiveBookingSummary {
  bookingCode: string;
  serviceName: string;
  staffName: string;
  startAt: string;
  manageUrl: string;
}

export interface AvailabilityWindowQuery {
  serviceId: string;
  extraServiceIds: readonly string[];
  addonIds: readonly string[];
  staffId: string;
  startDate: string;
  days?: number;
  offer?: string | null;
}

export type SlotHoldResult =
  | { kind: 'held'; holdId: string | null; holdExpiresAt: number | null }
  | { kind: 'conflict'; error: string; suggestedSlots: AvailableSlot[] }
  | { kind: 'rate_limited'; error: string; retryAfterSeconds?: number }
  | { kind: 'policy'; error: string; code?: string }
  | { kind: 'unavailable'; error: string; status?: number };

const SLOT_HOLD_TIMEOUT_MS = 15_000;
const BOOKING_SUBMIT_TIMEOUT_MS = 25_000;

export async function fetchAvailabilityWindow(
  input: AvailabilityWindowQuery & { signal?: AbortSignal },
): Promise<DayAvailabilitySummary[] | null> {
  if (input.signal?.aborted) return null;
  const sortedExtras = normalizeUniqueSortedIds(
    input.extraServiceIds,
    input.serviceId,
  );
  const sortedAddons = normalizeUniqueSortedIds(input.addonIds);
  const qs = new URLSearchParams({
    serviceId: input.serviceId,
    addonIds: sortedAddons.join(','),
    startDate: input.startDate,
    days: String(input.days ?? 35),
  });
  if (sortedExtras.length > 0) {
    qs.set('extraServiceIds', sortedExtras.join(','));
  }
  if (input.staffId && input.staffId !== 'any') {
    qs.set('staffId', input.staffId);
  }
  const cleanOffer = input.offer?.trim();
  if (cleanOffer) {
    qs.set('offer', cleanOffer);
  }
  const res = await fetchJsonWithTimeout<{ days?: DayAvailabilitySummary[] }>(
    `/api/availability?${qs.toString()}`,
    {
      cache: 'no-store',
      signal: input.signal,
    },
  );
  if (input.signal?.aborted || res.aborted || !res.ok) return null;
  return Array.isArray(res.data.days) ? res.data.days : null;
}

interface SlotHoldApiResponse {
  code?: string;
  error?: string;
  disabled?: boolean;
  suggestedSlots?: AvailableSlot[];
  holdId?: string;
  hold?: { id?: string; holdId?: string; expiresAt?: string };
}

export async function requestSlotHold(input: {
  serviceId: string;
  extraServiceIds: string[];
  addonIds: string[];
  staffId: string;
  startAt: string;
  waitlistOfferToken?: string | null;
}): Promise<SlotHoldResult> {
  const cleanOffer = input.waitlistOfferToken?.trim();
  const payload = {
    serviceId: input.serviceId,
    extraServiceIds: input.extraServiceIds,
    addonIds: input.addonIds,
    staffId: input.staffId,
    startAt: input.startAt,
    ...(cleanOffer ? { waitlistOfferToken: cleanOffer } : {}),
  };
  const res = await fetchJsonWithTimeout<SlotHoldApiResponse>('/api/slot-holds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeoutMs: SLOT_HOLD_TIMEOUT_MS,
  });

  if (!res.ok) {
    if (res.reason === 'timeout') {
      return {
        kind: 'unavailable',
        error: 'El apartado de horario tardó demasiado en responder. Intenta de nuevo.',
      };
    }
    if (res.reason === 'network' || res.reason === 'aborted') {
      return {
        kind: 'unavailable',
        error:
          'No pudimos apartar tu horario por un problema de conexión. Revisa tu internet e intenta de nuevo.',
      };
    }

    const data =
      res.data && typeof res.data === 'object' && !Array.isArray(res.data) ? res.data : null;

    if (res.status === 409) {
      return {
        kind: 'conflict',
        error:
          data?.error ||
          'Ese horario acaba de ser tomado por otra clienta. Elige uno de los horarios disponibles más cercanos:',
        suggestedSlots: Array.isArray(data?.suggestedSlots) ? data.suggestedSlots : [],
      };
    }

    if (res.status === 429) {
      return {
        kind: 'rate_limited',
        error: data?.error || res.error,
        ...(res.retryAfterSeconds ? { retryAfterSeconds: res.retryAfterSeconds } : {}),
      };
    }

    if (res.status === 400 || res.status === 422) {
      return {
        kind: 'policy',
        error:
          data?.error ||
          'No se pudo apartar ese horario con las opciones seleccionadas. Elige otro horario o intenta de nuevo.',
        ...(typeof data?.code === 'string' ? { code: data.code } : {}),
      };
    }

    return {
      kind: 'unavailable',
      status: res.status,
      error:
        data?.error ||
        (res.reason === 'invalid_json' && res.status >= 200 && res.status < 300
          ? 'El servidor devolvió una respuesta inesperada al apartar tu horario. Intenta de nuevo.'
          : res.error ||
            'No pudimos apartar tu horario en este momento. Intenta de nuevo en unos segundos.'),
    };
  }

  const data =
    res.data && typeof res.data === 'object' && !Array.isArray(res.data) ? res.data : null;

  if (!data) {
    return {
      kind: 'unavailable',
      status: res.status,
      error:
        'El servidor devolvió una respuesta inesperada al apartar tu horario. Intenta de nuevo.',
    };
  }

  if (data.disabled === true) {
    return { kind: 'held', holdId: null, holdExpiresAt: null };
  }

  const holdId =
    typeof data.hold?.id === 'string'
      ? data.hold.id
      : typeof data.holdId === 'string'
        ? data.holdId
        : typeof data.hold?.holdId === 'string'
          ? data.hold.holdId
          : null;
  const rawExpiresMs =
    typeof data.hold?.expiresAt === 'string' ? Date.parse(data.hold.expiresAt) : Number.NaN;
  const holdExpiresAt = Number.isFinite(rawExpiresMs) ? rawExpiresMs : null;

  if (!holdId || holdExpiresAt === null) {
    return {
      kind: 'unavailable',
      status: res.status,
      error:
        'No recibimos confirmación del apartado de horario. Intenta de nuevo en unos segundos.',
    };
  }

  return { kind: 'held', holdId, holdExpiresAt };
}

export async function validateCouponCode(
  code: string,
  subtotalCents: number,
): Promise<{ valid: true; coupon: AppliedCouponState } | { valid: false; error: string }> {
  const res = await fetchJsonWithTimeout<{
    valid?: boolean;
    code?: string;
    kind?: string;
    discountCents?: number;
    error?: string;
  }>('/api/coupons/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, subtotalCents }),
  });
  if (!res.ok) {
    return {
      valid: false,
      error: res.status === 429 ? res.error : (res.data?.error || res.error || 'Cupón no válido'),
    };
  }
  if (!res.data.valid || !res.data.code) {
    return { valid: false, error: res.data.error || 'Cupón no válido' };
  }
  return {
    valid: true,
    coupon: {
      code: res.data.code,
      kind: res.data.kind ?? 'percent',
      discountCents: res.data.discountCents ?? 0,
    },
  };
}

function parseActiveBookings(raw: unknown): ActiveBookingSummary[] {
  if (!Array.isArray(raw)) return [];
  const items: ActiveBookingSummary[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (
      typeof record.bookingCode === 'string' &&
      typeof record.serviceName === 'string' &&
      typeof record.staffName === 'string' &&
      typeof record.startAt === 'string' &&
      typeof record.manageUrl === 'string'
    ) {
      items.push({
        bookingCode: record.bookingCode,
        serviceName: record.serviceName,
        staffName: record.staffName,
        startAt: record.startAt,
        manageUrl: record.manageUrl,
      });
    }
  }
  return items;
}

function isValidManageUrl(url: string): boolean {
  const trimmed = url.trim();
  return trimmed.startsWith('/cita/') && trimmed.length > '/cita/'.length;
}

export async function submitBookingRequest(
  idempotencyKey: string,
  payload: {
    serviceId: string;
    extraServiceIds: string[];
    addonIds: string[];
    staffId: string;
    startAt: string;
    clientName: string;
    clientPhone: string;
    clientInstagram: string | null;
    clientEmail: string | null;
    clientBirthday: string | null;
    clientNotes: string;
    inspoPhotoUrl: string | null;
    paymentProofUrl: string | null;
    proofDeliveryMethod: ProofDeliveryMethod;
    couponCode: string | null;
    holdId?: string;
    privacyConsentAccepted: boolean;
    marketingOptIn: boolean;
    waitlistOfferToken?: string;
  },
): Promise<
  | { kind: 'ok'; manageUrl: string }
  | { kind: 'conflict'; error: string; suggestedSlots: AvailableSlot[] }
  | {
      kind: 'error';
      error: string;
      code?: string;
      activeBookings?: ActiveBookingSummary[];
    }
> {
  const res = await fetchJsonWithTimeout<{
    code?: string;
    error?: string;
    suggestedSlots?: AvailableSlot[];
    activeBookings?: unknown;
    manageUrl?: string;
    booking?: { manageToken?: string };
  }>('/api/bookings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(payload),
    timeoutMs: BOOKING_SUBMIT_TIMEOUT_MS,
  });

  if (!res.ok) {
    if (res.reason === 'timeout') {
      return {
        kind: 'error',
        code: 'REQUEST_TIMEOUT',
        error:
          'La solicitud tardó demasiado en responder. Revisa tu conexión o consulta «Mis citas» antes de intentar de nuevo.',
      };
    }
    if (res.reason === 'network' || res.reason === 'aborted') {
      return {
        kind: 'error',
        code: 'NETWORK_ERROR',
        error: 'Error de conexión. Revisa tu internet e intenta nuevamente.',
      };
    }

    const data = res.data;
    if (!data) {
      return {
        kind: 'error',
        code: res.status >= 200 && res.status < 300 ? 'INVALID_RESPONSE' : `HTTP_${res.status}`,
        error:
          'El servidor tardó demasiado o devolvió una respuesta inesperada. Intenta nuevamente en unos segundos.',
      };
    }

    if (res.status === 409 && data.code === 'SLOT_TAKEN') {
      return {
        kind: 'conflict',
        error:
          data.error ||
          '¡Ups! Otra clienta confirmó ese exacto horario segundos antes. Tus datos y foto siguen guardados — elige otro horario en 1 clic:',
        suggestedSlots: data.suggestedSlots ?? [],
      };
    }
    if (res.status === 409 && data.code === 'MAX_ACTIVE_BOOKINGS') {
      return {
        kind: 'error',
        code: 'MAX_ACTIVE_BOOKINGS',
        error:
          data.error ||
          'Ya alcanzaste el límite de citas activas simultáneas. Reprograma una de tus citas existentes abajo o escríbenos por WhatsApp.',
        activeBookings: parseActiveBookings(data.activeBookings),
      };
    }
    if (res.status === 400 && data.code === 'PRIVACY_CONSENT_REQUIRED') {
      return {
        kind: 'error',
        code: 'PRIVACY_CONSENT_REQUIRED',
        error:
          data.error ||
          'Debes aceptar el Aviso de Privacidad para completar tu reserva.',
      };
    }
    return {
      kind: 'error',
      code: data.code,
      error: data.error || res.error || 'No se pudo completar la cita. Revisa tus datos.',
    };
  }

  const data = res.data;
  const resolvedManageUrl =
    data.manageUrl || (data.booking?.manageToken ? `/cita/${data.booking.manageToken}` : '');
  if (!isValidManageUrl(resolvedManageUrl)) {
    return {
      kind: 'error',
      code: 'MISSING_MANAGE_URL',
      error:
        'Tu cita se registró, pero no recibimos el enlace de seguimiento. Consúltala en «Mis citas».',
    };
  }
  return {
    kind: 'ok',
    manageUrl: resolvedManageUrl,
  };
}
