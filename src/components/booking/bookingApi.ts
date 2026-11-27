import type { AvailableSlot, DayAvailabilitySummary } from '@/lib/availability/engine';
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
}

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
  const res = await fetch(`/api/availability?${qs.toString()}`, {
    cache: 'no-store',
    signal: input.signal,
  });
  if (input.signal?.aborted || !res.ok) return null;
  const json = (await res.json()) as { days?: DayAvailabilitySummary[] };
  if (input.signal?.aborted) return null;
  return Array.isArray(json.days) ? json.days : null;
}

export async function requestSlotHold(input: {
  serviceId: string;
  extraServiceIds: string[];
  addonIds: string[];
  staffId: string;
  startAt: string;
  sessionToken: string;
}): Promise<
  | { ok: true; holdId: string | null; holdExpiresAt: number | null }
  | { ok: false; status: number; error: string; suggestedSlots: AvailableSlot[] }
> {
  const res = await fetch('/api/slot-holds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = (await res.json()) as {
    error?: string;
    suggestedSlots?: AvailableSlot[];
    holdId?: string;
    hold?: { id?: string; holdId?: string; expiresAt?: string };
  };
  if (res.status === 409) {
    return {
      ok: false,
      status: 409,
      error:
        data.error ||
        'Ese horario acaba de ser tomado por otra clienta. Elige uno de los horarios disponibles más cercanos:',
      suggestedSlots: data.suggestedSlots ?? [],
    };
  }
  const holdId =
    typeof data.hold?.id === 'string'
      ? data.hold.id
      : typeof data.holdId === 'string'
        ? data.holdId
        : typeof data.hold?.holdId === 'string'
          ? data.hold.holdId
          : null;
  const holdExpiresAt = data.hold?.expiresAt
    ? new Date(data.hold.expiresAt).getTime()
    : null;
  return { ok: true, holdId, holdExpiresAt };
}

export async function validateCouponCode(
  code: string,
  subtotalCents: number,
): Promise<{ valid: true; coupon: AppliedCouponState } | { valid: false; error: string }> {
  const res = await fetch('/api/coupons/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, subtotalCents }),
  });
  const data = (await res.json()) as {
    valid?: boolean;
    code?: string;
    kind?: string;
    discountCents?: number;
    error?: string;
  };
  if (!res.ok || !data.valid || !data.code) {
    return { valid: false, error: data.error || 'Cupón no válido' };
  }
  return {
    valid: true,
    coupon: {
      code: data.code,
      kind: data.kind ?? 'percent',
      discountCents: data.discountCents ?? 0,
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

const BOOKING_SUBMIT_TIMEOUT_MS = 25_000;

function createSubmitAbortSignal(): AbortSignal | undefined {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(BOOKING_SUBMIT_TIMEOUT_MS);
  }
  return undefined;
}

function isAbortOrTimeoutError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.name === 'AbortError' || err.name === 'TimeoutError';
  }
  return false;
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
    sessionToken: string;
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
  let res: Response;
  try {
    res = await fetch('/api/bookings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(payload),
      signal: createSubmitAbortSignal(),
    });
  } catch (err) {
    if (isAbortOrTimeoutError(err)) {
      return {
        kind: 'error',
        code: 'REQUEST_TIMEOUT',
        error:
          'La solicitud tardó demasiado en responder. Revisa tu conexión o consulta «Mis citas» antes de intentar de nuevo.',
      };
    }
    return {
      kind: 'error',
      code: 'NETWORK_ERROR',
      error: 'Error de conexión. Revisa tu internet e intenta nuevamente.',
    };
  }

  let data: {
    code?: string;
    error?: string;
    suggestedSlots?: AvailableSlot[];
    activeBookings?: unknown;
    manageUrl?: string;
    booking?: { manageToken?: string };
  } | null = null;
  try {
    data = (await res.json()) as {
      code?: string;
      error?: string;
      suggestedSlots?: AvailableSlot[];
      activeBookings?: unknown;
      manageUrl?: string;
      booking?: { manageToken?: string };
    };
  } catch {
    data = null;
  }

  if (!data) {
    return {
      kind: 'error',
      code: res.ok ? 'INVALID_RESPONSE' : `HTTP_${res.status}`,
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
  if (!res.ok) {
    return {
      kind: 'error',
      code: data.code,
      error: data.error || 'No se pudo completar la cita. Revisa tus datos.',
    };
  }
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
