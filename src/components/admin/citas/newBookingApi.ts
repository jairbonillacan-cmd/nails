import type { AvailableSlot } from '@/lib/availability/engine';
import { formatDateShortInTimezone } from '@/lib/format';
import type { QuickSlotOption } from './NewBookingSlotStep';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateNewBookingInput(params: {
  serviceId: string;
  selectedSlot: QuickSlotOption | null;
  clientName: string;
  clientPhone: string;
}): string | null {
  if (!params.serviceId || !params.selectedSlot) {
    return 'Elige un horario disponible para guardar la cita.';
  }
  if (params.clientName.trim().length < 2) {
    return 'Escribe el nombre completo de la clienta.';
  }
  if (params.clientPhone.replace(/\D/g, '').length < 10) {
    return 'Escribe un WhatsApp válido de al menos 10 dígitos.';
  }
  return null;
}

export async function fetchNewBookingRangeSlots(
  params: {
    serviceId: string;
    extraServiceIds: readonly string[];
    addonIds: readonly string[];
    staffId: string;
    startDate: string;
    days?: number;
    limit?: number;
  },
  signal: AbortSignal,
): Promise<{ slots: QuickSlotOption[]; error: string | null }> {
  const days = Math.max(1, Math.min(45, Math.round(params.days ?? 14)));
  const limit = Math.max(1, Math.min(48, Math.round(params.limit ?? 16)));
  const qs = new URLSearchParams({
    mode: 'range',
    serviceId: params.serviceId,
    days: String(days),
  });
  if (params.startDate && ISO_DATE_RE.test(params.startDate)) {
    qs.set('startDate', params.startDate);
  }
  const cleanExtras = params.extraServiceIds.filter((id) => id !== params.serviceId);
  if (cleanExtras.length > 0) qs.set('extraServiceIds', cleanExtras.join(','));
  if (params.addonIds.length > 0) qs.set('addonIds', params.addonIds.join(','));
  if (params.staffId && params.staffId !== 'any') qs.set('staffId', params.staffId);

  const timeoutSignal = AbortSignal.timeout(15_000);
  const fetchSignal =
    typeof AbortSignal.any === 'function'
      ? AbortSignal.any([signal, timeoutSignal])
      : signal;

  const res = await fetch(`/api/availability?${qs.toString()}`, { signal: fetchSignal });
  if (signal.aborted) return { slots: [], error: null };
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    return {
      slots: [],
      error: err?.error || 'No se pudieron consultar horarios disponibles.',
    };
  }

  const json = (await res.json()) as {
    days?: Array<{ date: string; slots: AvailableSlot[] }>;
  };
  if (signal.aborted) return { slots: [], error: null };

  const flattened: QuickSlotOption[] = [];
  for (const day of json.days ?? []) {
    for (const slot of day.slots) {
      flattened.push({ ...slot, date: day.date });
      if (flattened.length >= limit) {
        return { slots: flattened, error: null };
      }
    }
  }
  return { slots: flattened, error: null };
}

export type SubmitAdminBookingResult =
  | { ok: true; message: string; description?: string }
  | { ok: false; pinRequired: true; pinError: string | null }
  | { ok: false; pinRequired: false; error: string };

export async function submitAdminBookingRequest(params: {
  serviceId: string;
  extraServiceIds: string[];
  addonIds: string[];
  staffId: string;
  startAt: string;
  clientName: string;
  clientPhone: string;
  clientInstagram: string | null;
  internalNotes?: string;
  useCustomOverride: boolean;
  customDuration: number;
  customPriceCents: number;
  isRecurring: boolean;
  recurrenceIntervalWeeks: 2 | 3 | 4;
  recurrenceCount: number;
  ownerPin?: string;
  notifyEmail: boolean;
  notifyWhatsapp: boolean;
  source: 'manual' | 'walk_in';
  timezone: string;
}): Promise<SubmitAdminBookingResult> {
  const clampedCount = Math.max(2, Math.min(6, Math.round(params.recurrenceCount || 2)));
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (params.ownerPin) headers['x-owner-pin'] = params.ownerPin;

  let res: Response;
  try {
    res = await fetch('/api/admin/bookings', {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        serviceId: params.serviceId,
        extraServiceIds: params.extraServiceIds,
        addonIds: params.addonIds,
        staffId: params.staffId,
        startAt: params.startAt,
        clientName: params.clientName,
        clientPhone: params.clientPhone,
        clientInstagram: params.clientInstagram,
        internalNotes: params.internalNotes,
        ...(params.useCustomOverride
          ? {
              customDurationMinutes: Math.max(15, Math.min(480, Math.round(params.customDuration))),
              customPriceCents: params.customPriceCents,
            }
          : {}),
        ...(params.isRecurring
          ? { recurrence: { intervalWeeks: params.recurrenceIntervalWeeks, count: clampedCount } }
          : {}),
        ...(params.ownerPin ? { ownerPin: params.ownerPin } : {}),
        notifyEmail: params.notifyEmail,
        notifyWhatsapp: params.notifyWhatsapp,
        source: params.source,
        forceConfirmed: true,
      }),
    });
  } catch (err) {
    const isTimeout =
      err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    return {
      ok: false,
      pinRequired: false,
      error: isTimeout
        ? 'El registro de la cita tardó demasiado. Intenta de nuevo en unos segundos.'
        : 'Sin conexión. No se pudo guardar la cita.',
    };
  }

  if (!res.ok) {
    const errJson = (await res.json().catch(() => null)) as {
      error?: string;
      code?: string;
    } | null;
    if (
      res.status === 403 &&
      (errJson?.code === 'OWNER_PIN_REQUIRED' || errJson?.code === 'OWNER_PIN_INVALID')
    ) {
      return {
        ok: false,
        pinRequired: true,
        pinError:
          errJson.code === 'OWNER_PIN_INVALID'
            ? errJson.error || 'PIN de autorización incorrecto.'
            : null,
      };
    }
    return {
      ok: false,
      pinRequired: false,
      error: errJson?.error || 'No se pudo guardar la cita.',
    };
  }

  const okJson = (await res.json().catch(() => null)) as {
    bookings?: Array<{ bookingCode?: string; startAt?: string }>;
    skippedConflicts?: Array<{ startAt?: string; dateKey?: string; reason?: string }>;
  } | null;

  if (!params.isRecurring) {
    return { ok: true, message: 'Cita agendada correctamente.' };
  }

  const createdCount = okJson?.bookings?.length ?? 1;
  const skipped = okJson?.skippedConflicts ?? [];
  if (skipped.length > 0) {
    const skippedDates = skipped
      .map((item) =>
        item.startAt
          ? formatDateShortInTimezone(item.startAt, params.timezone)
          : item.dateKey || 'Fecha ocupada',
      )
      .join(', ');
    return {
      ok: true,
      message: `Retoques agendados: ${createdCount} de ${clampedCount} citas (${skipped.length} fecha${skipped.length === 1 ? '' : 's'} ocupada${skipped.length === 1 ? '' : 's'}).`,
      description: `Fechas omitidas por disponibilidad: ${skippedDates}.`,
    };
  }

  return {
    ok: true,
    message: `Retoques agendados: ${createdCount} citas cada ${params.recurrenceIntervalWeeks} semanas.`,
  };
}
