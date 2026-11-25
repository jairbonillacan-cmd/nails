import type { AvailableSlot, DayAvailabilitySummary } from '@/lib/availability/engine';
import type { ProofDeliveryMethod } from './bookingHelpers';

export interface AppliedCouponState {
  code: string;
  kind: string;
  discountCents: number;
}

export async function fetchAvailabilityDays(input: {
  serviceId: string;
  extraServiceKey: string;
  addonKey: string;
  staffId: string;
  startDate: string;
  signal?: AbortSignal;
}): Promise<DayAvailabilitySummary[] | null> {
  const qs = new URLSearchParams({
    serviceId: input.serviceId,
    addonIds: input.addonKey,
    startDate: input.startDate,
    days: '35',
  });
  if (input.extraServiceKey) {
    qs.set('extraServiceIds', input.extraServiceKey);
  }
  if (input.staffId && input.staffId !== 'any') {
    qs.set('staffId', input.staffId);
  }
  const res = await fetch(`/api/availability?${qs.toString()}`, {
    cache: 'no-store',
    signal: input.signal,
  });
  if (input.signal?.aborted) return null;
  const json = (await res.json()) as { days?: DayAvailabilitySummary[] };
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
  },
): Promise<
  | { kind: 'ok'; manageUrl: string }
  | { kind: 'conflict'; error: string; suggestedSlots: AvailableSlot[] }
  | { kind: 'error'; error: string; code?: string }
> {
  const res = await fetch('/api/bookings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as {
    code?: string;
    error?: string;
    suggestedSlots?: AvailableSlot[];
    manageUrl?: string;
    booking?: { manageToken?: string };
  };
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
        'Ya alcanzaste el límite de citas activas simultáneas. Reagenda o cancela una cita desde tu link personal o escríbenos por WhatsApp.',
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
  return {
    kind: 'ok',
    manageUrl: data.manageUrl || `/cita/${data.booking?.manageToken ?? ''}`,
  };
}
