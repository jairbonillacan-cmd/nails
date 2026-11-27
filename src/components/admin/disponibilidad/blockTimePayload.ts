import { formatTimeHHMM12h } from '@/lib/format';
import {
  FORM_SUBMIT_OK,
  formSubmitError,
  formSubmitResultFromResponse,
  type FormSubmitResult,
} from '@/lib/forms/form-submit';
import {
  formatMinutesHHMM,
  getDayOfWeekFromDateKey,
  parseTimeMinutes,
  shiftDateKey,
} from '@/components/admin/citas/scheduleGridGeometry';
import { FIXED_TIME_OPTIONS } from './scheduleConstants';

export type BlockTimeMode = 'closed' | 'partial' | 'special_hours';

export interface BlockTimePrefill {
  readonly mode?: BlockTimeMode;
  readonly staffId?: string;
  readonly dateKey?: string;
  readonly endDateKey?: string;
  readonly startTimeHHMM?: string;
  readonly endTimeHHMM?: string;
  readonly repeat?: boolean;
  readonly frequency?: 'weekly' | 'monthly';
  readonly weekdays?: readonly number[];
  readonly dayOfMonth?: number;
  readonly untilDate?: string;
  readonly reason?: string;
}

export interface BlockTimeDraft {
  readonly mode: BlockTimeMode;
  readonly staffId: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly repeat: boolean;
  readonly frequency: 'weekly' | 'monthly';
  readonly weekdays: readonly number[];
  readonly dayOfMonth: number;
  readonly untilDate: string;
  readonly reason: string;
  readonly publicNote: string;
  readonly redirectStaffId: string;
  readonly todayKey: string;
}

export type BlockTimeBuildResult =
  | {
      readonly ok: true;
      readonly payload: Record<string, unknown>;
      readonly notice: string;
    }
  | {
      readonly ok: false;
      readonly error: string;
    };

export const BLOCK_QUICK_REASON_PRESETS = [
  'Comida',
  'Curso',
  'Asunto personal',
  'Vacaciones',
] as const;

function diffDateKeysDays(fromKey: string, toKey: string): number {
  const [fy = 2026, fm = 1, fd = 1] = fromKey.split('-').map(Number);
  const [ty = 2026, tm = 1, td = 1] = toKey.split('-').map(Number);
  const fromUtc = Date.UTC(fy, fm - 1, fd, 12, 0, 0);
  const toUtc = Date.UTC(ty, tm - 1, td, 12, 0, 0);
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

function collectWeekdaysInRange(startDate: string, endDate: string): number[] {
  const span = Math.max(0, Math.min(6, diffDateKeysDays(startDate, endDate)));
  const set = new Set<number>();
  for (let offset = 0; offset <= span; offset += 1) {
    set.add(getDayOfWeekFromDateKey(shiftDateKey(startDate, offset)));
  }
  return Array.from(set).toSorted((a, b) => a - b);
}

export function buildBlockTimeOptions(
  startHHMM: string,
  endHHMM: string,
): Array<{ value: string; label: string }> {
  const startMin = parseTimeMinutes(startHHMM);
  const endMin = parseTimeMinutes(endHHMM);
  const minBound = Math.max(0, Math.min(8 * 60, Math.floor(startMin / 15) * 15));
  const maxBound = Math.min(23 * 60 + 45, Math.max(22 * 60, Math.ceil(endMin / 15) * 15));
  if (minBound === 8 * 60 && maxBound === 22 * 60) {
    return FIXED_TIME_OPTIONS;
  }
  const options: Array<{ value: string; label: string }> = [];
  for (let m = minBound; m <= maxBound; m += 15) {
    const value = formatMinutesHHMM(m);
    options.push({ value, label: formatTimeHHMM12h(value) });
  }
  return options;
}

export function clampBlockOptionTime(
  value: string | undefined,
  options: readonly { value: string; label: string }[],
  fallback: string,
): string {
  if (!value) return fallback;
  return options.some((opt) => opt.value === value) ? value : fallback;
}

export function buildBlockTimePayload(draft: BlockTimeDraft): BlockTimeBuildResult {
  const staffId = draft.staffId.trim();
  if (!staffId) {
    return { ok: false, error: 'Selecciona una profesional.' };
  }
  const startDate = draft.startDate.trim();
  const effectiveEndDate =
    draft.endDate.trim() && draft.endDate.trim() >= startDate ? draft.endDate.trim() : startDate;

  if (!startDate) {
    return { ok: false, error: 'Selecciona una fecha válida.' };
  }

  const cleanReason = draft.reason.trim();
  const cleanPublicNote = draft.publicNote.trim();
  const cleanRedirect = draft.redirectStaffId.trim() || null;

  if (draft.mode === 'closed' || draft.mode === 'special_hours') {
    const isClosed = draft.mode === 'closed';
    if (!isClosed && draft.startTime >= draft.endTime) {
      return { ok: false, error: 'La hora de apertura debe ser anterior a la hora de cierre.' };
    }
    const defaultSingleReason = isClosed ? 'Día cerrado' : 'Horario especial';
    const defaultRangeReason = isClosed ? 'Vacaciones / Días cerrados' : 'Horario especial';
    const reason =
      cleanReason || (startDate === effectiveEndDate ? defaultSingleReason : defaultRangeReason);

    if (startDate === effectiveEndDate) {
      return {
        ok: true,
        payload: {
          staffId,
          overrideDate: startDate,
          isUnavailable: isClosed,
          startTime: isClosed ? null : draft.startTime,
          endTime: isClosed ? null : draft.endTime,
          reason,
          ...(cleanPublicNote ? { publicNote: cleanPublicNote } : {}),
          redirectStaffId: cleanRedirect,
        },
        notice: isClosed
          ? `Día ${startDate} bloqueado (${reason})`
          : `Horario especial guardado (${startDate})`,
      };
    }

    const totalDays = diffDateKeysDays(startDate, effectiveEndDate) + 1;
    return {
      ok: true,
      payload: {
        kind: 'override_range',
        staffId,
        startDate,
        endDate: effectiveEndDate,
        isClosed,
        startTime: isClosed ? null : draft.startTime,
        endTime: isClosed ? null : draft.endTime,
        reason,
        ...(cleanPublicNote ? { publicNote: cleanPublicNote } : {}),
        redirectStaffId: cleanRedirect,
      },
      notice: isClosed
        ? `Bloqueo guardado del ${startDate} al ${effectiveEndDate} (${totalDays} días)`
        : `Horario especial guardado (${totalDays} días)`,
    };
  }

  if (draft.startTime >= draft.endTime) {
    return { ok: false, error: 'La hora de inicio debe ser anterior a la hora de fin.' };
  }

  const partialReason = cleanReason || (draft.repeat ? 'Descanso' : 'Horario bloqueado');

  if (draft.repeat) {
    const uniqueWeekdays = Array.from(new Set(draft.weekdays)).toSorted((a, b) => a - b);
    if (draft.frequency === 'weekly' && uniqueWeekdays.length === 0) {
      return { ok: false, error: 'Elige al menos un día de la semana para repetir el bloqueo.' };
    }
    return {
      ok: true,
      payload: {
        kind: 'recurring_block',
        staffId,
        reason: partialReason,
        frequency: draft.frequency,
        weekdays: draft.frequency === 'weekly' ? uniqueWeekdays : [],
        dayOfMonth:
          draft.frequency === 'monthly'
            ? Math.max(1, Math.min(31, Math.round(draft.dayOfMonth || 1)))
            : null,
        startTime: draft.startTime,
        endTime: draft.endTime,
        untilDate: draft.untilDate.trim() || null,
        isActive: true,
      },
      notice: `Bloqueo ${formatTimeHHMM12h(draft.startTime)}–${formatTimeHHMM12h(draft.endTime)} guardado`,
    };
  }

  const spanDays = diffDateKeysDays(startDate, effectiveEndDate) + 1;
  if (spanDays === 1) {
    const daysAhead = diffDateKeysDays(draft.todayKey || startDate, startDate);
    const useMonthly = daysAhead >= 7 && daysAhead < 28;
    return {
      ok: true,
      payload: {
        kind: 'recurring_block',
        staffId,
        reason: partialReason,
        frequency: useMonthly ? 'monthly' : 'weekly',
        weekdays: useMonthly ? [] : [getDayOfWeekFromDateKey(startDate)],
        dayOfMonth: useMonthly ? Number(startDate.slice(8, 10)) || 1 : null,
        startTime: draft.startTime,
        endTime: draft.endTime,
        untilDate: startDate,
        isActive: true,
      },
      notice: `Horario bloqueado ${formatTimeHHMM12h(draft.startTime)}–${formatTimeHHMM12h(draft.endTime)}`,
    };
  }

  return {
    ok: true,
    payload: {
      kind: 'recurring_block',
      staffId,
      reason: partialReason,
      frequency: 'weekly',
      weekdays: collectWeekdaysInRange(startDate, effectiveEndDate),
      dayOfMonth: null,
      startTime: draft.startTime,
      endTime: draft.endTime,
      untilDate: effectiveEndDate,
      isActive: true,
    },
    notice: `Horario ${formatTimeHHMM12h(draft.startTime)}–${formatTimeHHMM12h(draft.endTime)} bloqueado hasta ${effectiveEndDate}`,
  };
}

export async function submitBlockTimeRequest(
  draft: BlockTimeDraft,
  onSaved: (notice: string) => Promise<void>,
): Promise<FormSubmitResult> {
  const built = buildBlockTimePayload(draft);
  if (!built.ok) {
    return formSubmitError(built.error);
  }
  try {
    const res = await fetch('/api/admin/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(built.payload),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return formSubmitResultFromResponse(res, 'No se pudo guardar el bloqueo.');
    }
    await onSaved(built.notice);
    return FORM_SUBMIT_OK;
  } catch {
    return formSubmitError('Sin conexión o tiempo de espera agotado. Intenta de nuevo.');
  }
}
