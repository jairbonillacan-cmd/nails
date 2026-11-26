import type { SlotDiagnosis } from '@/lib/availability/engine';
import type { AvailabilityRule, RecurringBlock } from '@/lib/types';

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const DAYS: Array<{ dow: DayOfWeek; label: string; short: string }> = [
  { dow: 1, label: 'Lunes', short: 'Lun' },
  { dow: 2, label: 'Martes', short: 'Mar' },
  { dow: 3, label: 'Miércoles', short: 'Mié' },
  { dow: 4, label: 'Jueves', short: 'Jue' },
  { dow: 5, label: 'Viernes', short: 'Vie' },
  { dow: 6, label: 'Sábado', short: 'Sáb' },
  { dow: 0, label: 'Domingo', short: 'Dom' },
];

const WEEKDAY_SHORT_BY_DOW: Record<number, string> = {
  0: 'Dom',
  1: 'Lun',
  2: 'Mar',
  3: 'Mié',
  4: 'Jue',
  5: 'Vie',
  6: 'Sáb',
};

export const TIME_OPTIONS = Array.from({ length: 29 }, (_, i) => {
  const totalMin = 8 * 60 + i * 30;
  const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
  const mm = String(totalMin % 60).padStart(2, '0');
  return { value: `${hh}:${mm}`, label: `${hh}:${mm}` };
});

export const FIXED_TIME_OPTIONS = Array.from({ length: 57 }, (_, i) => {
  const totalMin = 8 * 60 + i * 15;
  const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
  const mm = String(totalMin % 60).padStart(2, '0');
  return { value: `${hh}:${mm}`, label: `${hh}:${mm}` };
});

const DEFAULT_FIXED_BLOCKS = ['10:00', '13:30', '16:30'];

export function formatRecurringSummary(block: RecurringBlock): string {
  const freqLabel =
    block.frequency === 'weekly'
      ? `Cada semana (${block.weekdays.map((d) => WEEKDAY_SHORT_BY_DOW[d] ?? String(d)).join(', ')})`
      : `Cada mes (día ${block.dayOfMonth ?? 1})`;
  const untilSuffix = block.untilDate ? ` · Hasta ${block.untilDate}` : '';
  return `${freqLabel} · ${block.startTime} – ${block.endTime}${untilSuffix}`;
}

export function serializeRulesCanonical(rulesList: readonly AvailabilityRule[]): string {
  const normalized = rulesList
    .map((r) => ({
      dayOfWeek: r.dayOfWeek,
      startTime: r.startTime,
      endTime: r.endTime,
      fixedStartTimes:
        r.fixedStartTimes && r.fixedStartTimes.length > 0
          ? Array.from(new Set(r.fixedStartTimes)).toSorted()
          : [],
    }))
    .toSorted(
      (a, b) =>
        a.dayOfWeek - b.dayOfWeek ||
        a.startTime.localeCompare(b.startTime) ||
        a.endTime.localeCompare(b.endTime),
    );
  return JSON.stringify(normalized);
}

export function toggleDayRule(
  prev: AvailabilityRule[],
  dow: DayOfWeek,
  enabled: boolean,
): AvailabilityRule[] {
  if (!enabled) return prev.filter((r) => r.dayOfWeek !== dow);
  return [
    ...prev,
    {
      id: `r-${dow}-${Date.now()}`,
      dayOfWeek: dow,
      startTime: '10:00',
      endTime: '19:30',
      fixedStartTimes: [...DEFAULT_FIXED_BLOCKS],
    },
  ];
}

export function switchDayRuleMode(
  prev: AvailabilityRule[],
  dow: DayOfWeek,
  mode: 'fixed' | 'continuous',
): AvailabilityRule[] {
  const dayRules = prev.filter((r) => r.dayOfWeek === dow);
  const otherRules = prev.filter((r) => r.dayOfWeek !== dow);
  if (dayRules.length === 0) return prev;
  if (mode === 'continuous') {
    return [
      ...otherRules,
      ...dayRules.map((r) => ({
        id: r.id,
        dayOfWeek: r.dayOfWeek,
        startTime: r.startTime,
        endTime: r.endTime,
      })),
    ];
  }
  const earliestStart = dayRules.map((r) => r.startTime).toSorted()[0] ?? '10:00';
  const latestEnd = dayRules.map((r) => r.endTime).toSorted().at(-1) ?? '19:30';
  const existingFixed = dayRules.flatMap((r) => r.fixedStartTimes ?? []);
  const seeded =
    existingFixed.length > 0
      ? existingFixed.filter((t) => t >= earliestStart && t < latestEnd)
      : DEFAULT_FIXED_BLOCKS.filter((t) => t >= earliestStart && t < latestEnd);
  return [
    ...otherRules,
    {
      id: dayRules[0]?.id ?? `r-${dow}-${Date.now()}`,
      dayOfWeek: dow,
      startTime: earliestStart,
      endTime: latestEnd,
      fixedStartTimes: seeded.length > 0 ? Array.from(new Set(seeded)).toSorted() : [earliestStart],
    },
  ];
}

export function addRuleFixedTime(
  prev: AvailabilityRule[],
  ruleId: string,
  timeToAdd: string,
): AvailabilityRule[] {
  if (!timeToAdd) return prev;
  return prev.map((r) => {
    if (r.id !== ruleId || timeToAdd < r.startTime || timeToAdd >= r.endTime) return r;
    return {
      ...r,
      fixedStartTimes: Array.from(new Set([...(r.fixedStartTimes ?? []), timeToAdd])).toSorted(),
    };
  });
}

export function removeRuleFixedTime(
  prev: AvailabilityRule[],
  ruleId: string,
  timeToRemove: string,
): AvailabilityRule[] {
  return prev.map((r) => {
    if (r.id !== ruleId) return r;
    const remaining = (r.fixedStartTimes ?? []).filter((t) => t !== timeToRemove);
    return { ...r, fixedStartTimes: remaining.length > 0 ? remaining : [r.startTime] };
  });
}

export function updateRuleTimeBoundary(
  prev: AvailabilityRule[],
  ruleId: string,
  field: 'startTime' | 'endTime',
  val: string,
): AvailabilityRule[] {
  return prev.map((r) => {
    if (r.id !== ruleId) return r;
    const nextStart = field === 'startTime' ? val : r.startTime;
    const nextEnd = field === 'endTime' ? val : r.endTime;
    if (nextStart >= nextEnd) return r;
    if (!r.fixedStartTimes || r.fixedStartTimes.length === 0) {
      return { ...r, startTime: nextStart, endTime: nextEnd };
    }
    const inWindow = r.fixedStartTimes.filter((t) => t >= nextStart && t < nextEnd);
    return {
      ...r,
      startTime: nextStart,
      endTime: nextEnd,
      fixedStartTimes: inWindow.length > 0 ? inWindow : [nextStart],
    };
  });
}

export function copyDayRulesToWeekdays(
  prev: AvailabilityRule[],
  sourceDow: DayOfWeek,
): AvailabilityRule[] {
  const sourceRules = prev.filter((r) => r.dayOfWeek === sourceDow);
  const targets: Array<1 | 2 | 3 | 4 | 5> = [1, 2, 3, 4, 5];
  const kept = prev.filter((r) => !targets.includes(r.dayOfWeek as 1 | 2 | 3 | 4 | 5));
  const copied = targets.flatMap((d) =>
    sourceRules.map((sr, i) => ({
      ...sr,
      id: `r-copy-${d}-${i}-${Date.now()}`,
      dayOfWeek: d,
      ...(sr.fixedStartTimes ? { fixedStartTimes: [...sr.fixedStartTimes] } : {}),
    })),
  );
  return [...kept, ...copied];
}

export function addDaysToYmd(baseYmd: string, offsetDays: number): string {
  const [y = 2026, m = 1, d = 1] = baseYmd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + offsetDays, 12, 0, 0, 0)).toISOString().slice(0, 10);
}

export function groupDiagnosticSlotsByPeriod(
  slots: readonly SlotDiagnosis[],
): Array<{ key: string; label: string; items: SlotDiagnosis[] }> {
  const bucketOf = (time24: string) => {
    const [hh = 0] = time24.split(':').map(Number);
    return hh < 12 ? 'morning' : hh < 18 ? 'afternoon' : 'evening';
  };
  return [
    { key: 'morning', label: 'Mañana', items: slots.filter((d) => bucketOf(d.time24) === 'morning') },
    { key: 'afternoon', label: 'Tarde', items: slots.filter((d) => bucketOf(d.time24) === 'afternoon') },
    { key: 'evening', label: 'Noche', items: slots.filter((d) => bucketOf(d.time24) === 'evening') },
  ].filter((g) => g.items.length > 0);
}

export function explainSlotInPlainSpanish(slot: SlotDiagnosis): string {
  if (slot.isAvailable) {
    return 'Esta hora está libre y tus clientas sí la pueden ver y reservar.';
  }
  const raw = slot.reason.trim();
  if (/^Bloqueo recurrente:/i.test(raw)) {
    const detail = raw.replace(/^Bloqueo recurrente:\s*/i, '').trim();
    return detail
      ? `Tienes un descanso fijo programado a esta hora (${detail}).`
      : 'Tienes un descanso fijo programado a esta hora.';
  }
  if (/^Bloqueo recurrente$/i.test(raw)) return 'Tienes un descanso fijo programado a esta hora.';
  if (/^Día bloqueado por excepción/i.test(raw)) {
    const match = /\(([^)]+)\)/.exec(raw);
    const note = match?.[1]?.trim();
    return note && note !== 'Sin motivo'
      ? `Este día está marcado como cerrado (${note}).`
      : 'Este día está marcado como cerrado en vacaciones y días cerrados.';
  }
  if (/cambio de horario/i.test(raw)) return 'Esta hora no existe ese día por el cambio de horario.';
  if (/sin horario laboral configurado/i.test(raw)) {
    return `${slot.staffName} no tiene turno activado este día de la semana.`;
  }
  if (/Fuera de horario laboral/i.test(raw)) {
    return 'El servicio se pasa de la hora de cierre o queda fuera del horario de ese día.';
  }
  if (/Fuera de los horarios fijos/i.test(raw)) {
    return 'No es uno de los turnos fijos que elegiste para este día.';
  }
  if (/cuadrícula de intervalos/i.test(raw)) {
    return 'Esta hora no coincide con los espacios configurados para citas.';
  }
  if (/Menor al aviso mínimo/i.test(raw)) {
    return 'Falta muy poco tiempo para esta hora y ya cerró el límite para reservar.';
  }
  if (/Excede el límite máximo/i.test(raw)) {
    return 'Esa fecha está muy lejos; todavía no se abre la agenda para ese día.';
  }
  if (/^Ocupado por cita/i.test(raw)) {
    return `${raw.replace(/^Ocupado por cita/i, 'Ya hay una cita agendada')}.`;
  }
  if (/Apartado temporalmente/i.test(raw)) {
    return 'Otra clienta está reservando este horario justo ahora.';
  }
  if (/Google Calendar/i.test(raw)) {
    return 'Aparece un compromiso ocupado en Google Calendar a esta hora.';
  }
  if (/Profesional inactiva/i.test(raw)) {
    return `${slot.staffName} está pausada o no tiene asignado este servicio en Equipo.`;
  }
  return raw || 'Esta hora no está disponible por ahora.';
}
