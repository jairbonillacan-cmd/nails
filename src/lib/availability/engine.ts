import type {
  AvailabilitySchedule,
  Booking,
  CalendarConnection,
  DateOverride,
  SalonSettings,
  Service,
  ServiceAddon,
  SlotHold,
  StaffMember,
} from '../types';

type DayPeriod = 'morning' | 'afternoon' | 'evening';

export interface AvailableSlot {
  startAt: string;
  endAt: string;
  occupiedStartAt: string;
  occupiedEndAt: string;
  staffId: string;
  staffName: string;
  localTime24: string;
  localTime12: string;
  period: DayPeriod;
}

export interface DayAvailabilitySummary {
  date: string;
  hasSlots: boolean;
  slotCount: number;
  slots: AvailableSlot[];
}

export interface SlotDiagnosis {
  date: string;
  time24: string;
  staffId: string;
  staffName: string;
  isAvailable: boolean;
  reason: string;
}

export interface AvailabilityContext {
  settings: SalonSettings;
  service: Service;
  addons: ServiceAddon[];
  staffMembers: StaffMember[];
  schedules: AvailabilitySchedule[];
  dateOverrides: DateOverride[];
  bookings: Booking[];
  slotHolds: SlotHold[];
  calendarConnections: CalendarConnection[];
  now?: Date;
  callerSessionToken?: string | null;
  ignoreBookingId?: string | null;
}

const ACTIVE_BOOKING_STATUSES = new Set([
  'pending_payment',
  'pending_confirmation',
  'confirmed',
]);

function parseYmd(dateStr: string): { y: number; m: number; d: number } {
  const [y = 2026, m = 1, d = 1] = dateStr.split('-').map(Number);
  return { y, m, d };
}

function parseHm(timeStr: string): { hh: number; mm: number } {
  const [hh = 0, mm = 0] = timeStr.split(':').map(Number);
  return { hh, mm };
}

export function zonedDateTimeToUtc(
  dateStr: string,
  timeStr: string,
  timeZone: string,
): Date {
  const { y, m, d } = parseYmd(dateStr);
  const { hh, mm } = parseHm(timeStr);

  const utcGuess = Date.UTC(y, m - 1, d, hh, mm, 0, 0);
  const offset1 = getTimezoneOffsetMs(new Date(utcGuess), timeZone);
  const adjusted1 = utcGuess - offset1;

  const offset2 = getTimezoneOffsetMs(new Date(adjusted1), timeZone);
  return new Date(utcGuess - offset2);
}

function getTimezoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') === 24 ? 0 : get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

function getDayOfWeekForDateStr(dateStr: string): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  const { y, m, d } = parseYmd(dateStr);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay() as
    | 0
    | 1
    | 2
    | 3
    | 4
    | 5
    | 6;
}

function addDaysToDateStr(dateStr: string, days: number): string {
  const { y, m, d } = parseYmd(dateStr);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

function parseTimeToMinutes(timeStr: string): number {
  const { hh, mm } = parseHm(timeStr);
  return hh * 60 + mm;
}

function minutesToTimeStr(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatTime12h(time24: string): string {
  const { hh, mm } = parseHm(time24);
  const period = hh >= 12 ? 'p.m.' : 'a.m.';
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${hour12}:${String(mm).padStart(2, '0')} ${period}`;
}

function getDayPeriod(time24: string): DayPeriod {
  const { hh } = parseHm(time24);
  if (hh < 12) return 'morning';
  if (hh < 18) return 'afternoon';
  return 'evening';
}

export function rangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function computeServiceTotals(service: Service, selectedAddons: ServiceAddon[]) {
  const extraMinutes = selectedAddons.reduce((sum, a) => sum + a.extraMinutes, 0);
  const extraPriceCents = selectedAddons.reduce((sum, a) => sum + a.extraPriceCents, 0);
  return {
    totalDurationMinutes: service.durationMinutes + extraMinutes,
    subtotalCents: service.priceCents + extraPriceCents,
    bufferBeforeMinutes: service.bufferBeforeMinutes,
    bufferAfterMinutes: service.bufferAfterMinutes,
  };
}

interface BusyInterval {
  startMs: number;
  endMs: number;
  reason: string;
}

function getStaffWorkingWindows(
  staffId: string,
  dateStr: string,
  schedules: AvailabilitySchedule[],
  dateOverrides: DateOverride[],
): Array<{ startMin: number; endMin: number }> {
  const override = dateOverrides.find(
    (o) => o.staffId === staffId && o.overrideDate === dateStr,
  );
  if (override) {
    if (override.isUnavailable || !override.startTime || !override.endTime) {
      return [];
    }
    return [
      {
        startMin: parseTimeToMinutes(override.startTime),
        endMin: parseTimeToMinutes(override.endTime),
      },
    ];
  }

  const schedule =
    schedules.find((s) => s.staffId === staffId && s.isDefault) ??
    schedules.find((s) => s.staffId === staffId);
  if (!schedule) return [];

  const dow = getDayOfWeekForDateStr(dateStr);
  return schedule.rules
    .filter((r) => r.dayOfWeek === dow)
    .map((r) => ({
      startMin: parseTimeToMinutes(r.startTime),
      endMin: parseTimeToMinutes(r.endTime),
    }))
    .sort((a, b) => a.startMin - b.startMin);
}

function getStaffBusyIntervals(
  staffId: string,
  bookings: Booking[],
  slotHolds: SlotHold[],
  calendarConnections: CalendarConnection[],
  nowMs: number,
  callerSessionToken?: string | null,
  ignoreBookingId?: string | null,
): BusyInterval[] {
  const busy: BusyInterval[] = [];

  for (const b of bookings) {
    if (b.staffId !== staffId) continue;
    if (ignoreBookingId && b.id === ignoreBookingId) continue;
    if (!ACTIVE_BOOKING_STATUSES.has(b.status)) continue;
    busy.push({
      startMs: new Date(b.occupiedStartAt).getTime(),
      endMs: new Date(b.occupiedEndAt).getTime(),
      reason: `Ocupado por cita ${b.bookingCode}`,
    });
  }

  for (const h of slotHolds) {
    if (h.staffId !== staffId) continue;
    if (new Date(h.expiresAt).getTime() <= nowMs) continue;
    if (callerSessionToken && h.sessionToken === callerSessionToken) continue;
    busy.push({
      startMs: new Date(h.startAt).getTime(),
      endMs: new Date(h.endAt).getTime(),
      reason: 'Apartado temporalmente por otra clienta (3 min)',
    });
  }

  const conn = calendarConnections.find((c) => c.staffId === staffId && c.isConnected);
  if (conn?.externalBusyBlocks?.length) {
    for (const blk of conn.externalBusyBlocks) {
      busy.push({
        startMs: new Date(blk.startAt).getTime(),
        endMs: new Date(blk.endAt).getTime(),
        reason: blk.summary || 'Conflicto en Google Calendar',
      });
    }
  }

  return busy;
}

export function getAvailableSlotsForDate(
  ctx: AvailabilityContext,
  dateStr: string,
  preferredStaffId?: string | null,
): AvailableSlot[] {
  const now = ctx.now ?? new Date();
  const nowMs = now.getTime();
  const minNoticeMs = nowMs + ctx.settings.minBookingNoticeMinutes * 60_000;
  const maxFutureMs = nowMs + ctx.settings.maxBookingDaysAhead * 86_400_000;
  const tz = ctx.settings.timezone || 'America/Mexico_City';

  const { totalDurationMinutes, bufferBeforeMinutes, bufferAfterMinutes } =
    computeServiceTotals(ctx.service, ctx.addons);
  const step = ctx.settings.slotIntervalMinutes || 30;

  const candidateStaff = preferredStaffId
    ? ctx.staffMembers.filter((s) => s.id === preferredStaffId)
    : ctx.staffMembers;

  const slotsByTime = new Map<string, AvailableSlot>();

  for (const staff of candidateStaff) {
    const windows = getStaffWorkingWindows(
      staff.id,
      dateStr,
      ctx.schedules,
      ctx.dateOverrides,
    );
    if (windows.length === 0) continue;

    const busy = getStaffBusyIntervals(
      staff.id,
      ctx.bookings,
      ctx.slotHolds,
      ctx.calendarConnections,
      nowMs,
      ctx.callerSessionToken,
      ctx.ignoreBookingId,
    );

    for (const win of windows) {
      for (
        let cursor = win.startMin;
        cursor + totalDurationMinutes <= win.endMin;
        cursor += step
      ) {
        const time24 = minutesToTimeStr(cursor);
        const startDate = zonedDateTimeToUtc(dateStr, time24, tz);
        const startMs = startDate.getTime();
        const endMs = startMs + totalDurationMinutes * 60_000;
        const occStartMs = startMs - bufferBeforeMinutes * 60_000;
        const occEndMs = endMs + bufferAfterMinutes * 60_000;

        if (startMs < minNoticeMs || startMs > maxFutureMs) continue;

        const hasConflict = busy.some((b) =>
          rangesOverlap(occStartMs, occEndMs, b.startMs, b.endMs),
        );
        if (hasConflict) continue;

        const slotKey = preferredStaffId ? `${staff.id}:${startMs}` : `${startMs}`;
        if (!slotsByTime.has(slotKey)) {
          slotsByTime.set(slotKey, {
            startAt: new Date(startMs).toISOString(),
            endAt: new Date(endMs).toISOString(),
            occupiedStartAt: new Date(occStartMs).toISOString(),
            occupiedEndAt: new Date(occEndMs).toISOString(),
            staffId: staff.id,
            staffName: staff.name,
            localTime24: time24,
            localTime12: formatTime12h(time24),
            period: getDayPeriod(time24),
          });
        }
      }
    }
  }

  return Array.from(slotsByTime.values()).sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );
}

export function getAvailabilityForRange(
  ctx: AvailabilityContext,
  startDateStr: string,
  daysCount: number,
  preferredStaffId?: string | null,
): DayAvailabilitySummary[] {
  const results: DayAvailabilitySummary[] = [];
  for (let i = 0; i < daysCount; i++) {
    const date = addDaysToDateStr(startDateStr, i);
    const slots = getAvailableSlotsForDate(ctx, date, preferredStaffId);
    results.push({
      date,
      hasSlots: slots.length > 0,
      slotCount: slots.length,
      slots,
    });
  }
  return results;
}

export function findNearestAvailableSlots(
  ctx: AvailabilityContext,
  targetStartIso: string,
  preferredStaffId?: string | null,
  limit = 3,
): AvailableSlot[] {
  const targetMs = new Date(targetStartIso).getTime();
  const tz = ctx.settings.timezone || 'America/Mexico_City';
  const targetDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(targetMs));

  const candidates: AvailableSlot[] = [];
  for (let offset = 0; offset <= 7; offset++) {
    const d = addDaysToDateStr(targetDateStr, offset);
    candidates.push(...getAvailableSlotsForDate(ctx, d, preferredStaffId));
    if (candidates.length >= limit * 3) break;
  }

  return candidates
    .sort(
      (a, b) =>
        Math.abs(new Date(a.startAt).getTime() - targetMs) -
        Math.abs(new Date(b.startAt).getTime() - targetMs),
    )
    .slice(0, limit);
}

export function diagnoseDateSlots(
  ctx: AvailabilityContext,
  dateStr: string,
  staffId: string,
): SlotDiagnosis[] {
  const staff = ctx.staffMembers.find((s) => s.id === staffId);
  if (!staff) return [];

  const now = ctx.now ?? new Date();
  const nowMs = now.getTime();
  const minNoticeMs = nowMs + ctx.settings.minBookingNoticeMinutes * 60_000;
  const tz = ctx.settings.timezone || 'America/Mexico_City';

  const override = ctx.dateOverrides.find(
    (o) => o.staffId === staffId && o.overrideDate === dateStr,
  );
  const windows = getStaffWorkingWindows(
    staffId,
    dateStr,
    ctx.schedules,
    ctx.dateOverrides,
  );
  const busy = getStaffBusyIntervals(
    staffId,
    ctx.bookings,
    ctx.slotHolds,
    ctx.calendarConnections,
    nowMs,
    ctx.callerSessionToken,
    ctx.ignoreBookingId,
  );
  const { totalDurationMinutes, bufferBeforeMinutes, bufferAfterMinutes } =
    computeServiceTotals(ctx.service, ctx.addons);

  const diagnostics: SlotDiagnosis[] = [];

  for (let cursor = 9 * 60; cursor <= 20 * 60; cursor += 60) {
    const time24 = minutesToTimeStr(cursor);
    const startMs = zonedDateTimeToUtc(dateStr, time24, tz).getTime();
    const endMs = startMs + totalDurationMinutes * 60_000;
    const occStartMs = startMs - bufferBeforeMinutes * 60_000;
    const occEndMs = endMs + bufferAfterMinutes * 60_000;

    if (override?.isUnavailable) {
      diagnostics.push({
        date: dateStr,
        time24,
        staffId,
        staffName: staff.name,
        isAvailable: false,
        reason: `Día bloqueado por excepción (${override.reason || 'Sin motivo'})`,
      });
      continue;
    }

    const fitsWindow = windows.some(
      (w) => cursor >= w.startMin && cursor + totalDurationMinutes <= w.endMin,
    );
    if (!fitsWindow) {
      diagnostics.push({
        date: dateStr,
        time24,
        staffId,
        staffName: staff.name,
        isAvailable: false,
        reason:
          windows.length === 0
            ? 'Día sin horario laboral configurado'
            : 'Fuera de horario laboral o choca con hora de descanso',
      });
      continue;
    }

    if (startMs < minNoticeMs) {
      diagnostics.push({
        date: dateStr,
        time24,
        staffId,
        staffName: staff.name,
        isAvailable: false,
        reason: `Menor al aviso mínimo (${ctx.settings.minBookingNoticeMinutes} min)`,
      });
      continue;
    }

    const conflict = busy.find((b) =>
      rangesOverlap(occStartMs, occEndMs, b.startMs, b.endMs),
    );
    if (conflict) {
      diagnostics.push({
        date: dateStr,
        time24,
        staffId,
        staffName: staff.name,
        isAvailable: false,
        reason: conflict.reason,
      });
      continue;
    }

    diagnostics.push({
      date: dateStr,
      time24,
      staffId,
      staffName: staff.name,
      isAvailable: true,
      reason: 'Disponible',
    });
  }

  return diagnostics;
}
