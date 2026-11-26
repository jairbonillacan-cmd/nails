import { zonedDateTimeToUtc } from '../availability/engine';
import { getDateKeyInTimezone } from '../format';

export type RecurrenceIntervalWeeks = 2 | 3 | 4;

export interface RecurrenceDateOccurrence {
  index: number;
  startAt: string;
  dateKey: string;
}

function getLocalTime24InTimezone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const rawHour = Number(parts.find((p) => p.type === 'hour')?.value ?? '10');
  const rawMinute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const hh = String(rawHour === 24 ? 0 : rawHour).padStart(2, '0');
  const mm = String(rawMinute).padStart(2, '0');
  return `${hh}:${mm}`;
}

function shiftCalendarDateKey(dateKey: string, deltaDays: number): string {
  const [y = 2026, m = 1, d = 1] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

export function generateRecurrenceDates(params: {
  startAt: string;
  intervalWeeks: RecurrenceIntervalWeeks;
  count: number;
  timezone: string;
}): RecurrenceDateOccurrence[] {
  const baseDate = new Date(params.startAt);
  if (Number.isNaN(baseDate.getTime())) {
    throw new Error('Fecha de inicio inválida para serie recurrente.');
  }

  const validIntervals: readonly RecurrenceIntervalWeeks[] = [2, 3, 4];
  if (!validIntervals.includes(params.intervalWeeks)) {
    throw new Error('La frecuencia recurrente debe ser de 2, 3 o 4 semanas.');
  }

  if (!Number.isInteger(params.count) || params.count < 2 || params.count > 6) {
    throw new Error('La serie recurrente debe contener entre 2 y 6 citas.');
  }

  const tz = params.timezone.trim() || 'America/Mexico_City';
  const baseDateKey = getDateKeyInTimezone(baseDate, tz);
  const localTime24 = getLocalTime24InTimezone(baseDate, tz);

  const occurrences: RecurrenceDateOccurrence[] = [];
  for (let i = 0; i < params.count; i += 1) {
    if (i === 0) {
      occurrences.push({
        index: 0,
        startAt: baseDate.toISOString(),
        dateKey: baseDateKey,
      });
      continue;
    }
    const nextDateKey = shiftCalendarDateKey(baseDateKey, i * params.intervalWeeks * 7);
    const utcDate = zonedDateTimeToUtc(nextDateKey, localTime24, tz);
    occurrences.push({
      index: i,
      startAt: utcDate.toISOString(),
      dateKey: nextDateKey,
    });
  }

  return occurrences;
}

export function computeSuggestedTouchUpDateKey(params: {
  startAt: string;
  daysAhead?: number;
  timezone: string;
}): string {
  const baseDate = new Date(params.startAt);
  const tz = params.timezone.trim() || 'America/Mexico_City';
  const safeBase = Number.isNaN(baseDate.getTime()) ? new Date() : baseDate;
  const daysAhead =
    typeof params.daysAhead === 'number' && Number.isFinite(params.daysAhead)
      ? Math.max(1, Math.round(params.daysAhead))
      : 21;
  const baseKey = getDateKeyInTimezone(safeBase, tz);
  return shiftCalendarDateKey(baseKey, daysAhead);
}

export function buildTouchUpBookingUrl(params: {
  serviceSlug: string;
  staffSlug?: string | null;
  suggestedDateKey?: string | null;
}): string {
  const cleanService = params.serviceSlug.trim();
  const basePath = cleanService
    ? `/reservar/${encodeURIComponent(cleanService)}`
    : '/reservar';
  const query = new URLSearchParams();
  const cleanStaff = params.staffSlug?.trim();
  const cleanDate = params.suggestedDateKey?.trim();
  if (cleanStaff) {
    query.set('staff', cleanStaff);
  }
  if (cleanDate && /^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
    query.set('date', cleanDate);
  }
  const qs = query.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
