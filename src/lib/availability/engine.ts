import type {
  AvailabilitySchedule,
  Booking,
  CalendarConnection,
  DateOverride,
  RecurringBlock,
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
  availableStaffIds: string[];
}

export interface DayAvailabilitySummary {
  date: string;
  hasSlots: boolean;
  slotCount: number;
  slots: AvailableSlot[];
  publicNote?: string;
  redirectStaffId?: string | null;
  redirectStaffName?: string | null;
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
  extraServices?: Service[];
  addons: ServiceAddon[];
  staffMembers: StaffMember[];
  schedules: AvailabilitySchedule[];
  dateOverrides: DateOverride[];
  recurringBlocks?: RecurringBlock[];
  bookings: Booking[];
  slotHolds: SlotHold[];
  calendarConnections: CalendarConnection[];
  now?: Date;
  callerSessionToken?: string | null;
  ignoreBookingId?: string | null;
}

export type SlotRejectionCode =
  | 'OUTSIDE_HOURS'
  | 'PAST_OR_NOTICE'
  | 'BEYOND_MAX_DAYS'
  | 'STAFF_INELIGIBLE'
  | 'SLOT_TAKEN'
  | 'INVALID_ALIGNMENT';

export interface AssertSlotBookableParams {
  startAt: string;
  staffId: string;
  now?: Date;
  ignoreBookingId?: string;
  ignoreHoldSessionToken?: string;
}

export type AssertSlotBookableResult =
  | { ok: true; slot: AvailableSlot }
  | {
      ok: false;
      code: SlotRejectionCode;
      message: string;
      suggestedSlots: AvailableSlot[];
    };

const ACTIVE_BOOKING_STATUSES = new Set([
  'pending_payment',
  'pending_confirmation',
  'confirmed',
]);

const zonedPartsFormatterCache = new Map<string, Intl.DateTimeFormat>();
const dateKeyFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getZonedPartsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = zonedPartsFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    zonedPartsFormatterCache.set(timeZone, formatter);
  }
  return formatter;
}

function getDateKeyFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = dateKeyFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dateKeyFormatterCache.set(timeZone, formatter);
  }
  return formatter;
}

function getZonedParts(
  date: Date,
  timeZone: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = getZonedPartsFormatter(timeZone).formatToParts(date);
  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;
  let second = 0;

  for (const part of parts) {
    if (part.type === 'year') year = Number(part.value);
    else if (part.type === 'month') month = Number(part.value);
    else if (part.type === 'day') day = Number(part.value);
    else if (part.type === 'hour') hour = Number(part.value);
    else if (part.type === 'minute') minute = Number(part.value);
    else if (part.type === 'second') second = Number(part.value);
  }

  return {
    year,
    month,
    day,
    hour: hour === 24 ? 0 : hour,
    minute,
    second,
  };
}

function parseYmd(dateStr: string): { y: number; m: number; d: number } {
  const [y = 2026, m = 1, d = 1] = dateStr.split('-').map(Number);
  return { y, m, d };
}

function parseHm(timeStr: string): { hh: number; mm: number } {
  const [hh = 0, mm = 0] = timeStr.split(':').map(Number);
  return { hh, mm };
}

function getTimezoneOffsetMs(date: Date, timeZone: string): number {
  const { year, month, day, hour, minute, second } = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

function resolveZonedDateTime(
  dateStr: string,
  timeStr: string,
  timeZone: string,
): { date: Date; existsInZone: boolean } {
  const { y, m, d } = parseYmd(dateStr);
  const { hh, mm } = parseHm(timeStr);

  const utcGuess = Date.UTC(y, m - 1, d, hh, mm, 0, 0);
  const offset1 = getTimezoneOffsetMs(new Date(utcGuess), timeZone);
  const adjusted1 = utcGuess - offset1;

  const offset2 = getTimezoneOffsetMs(new Date(adjusted1), timeZone);
  if (offset2 === offset1) {
    return { date: new Date(adjusted1), existsInZone: true };
  }

  const adjusted2 = utcGuess - offset2;
  const offset3 = getTimezoneOffsetMs(new Date(adjusted2), timeZone);
  if (offset3 === offset2) {
    return { date: new Date(adjusted2), existsInZone: true };
  }

  return { date: new Date(Math.max(adjusted1, adjusted2)), existsInZone: false };
}

export function zonedDateTimeToUtc(
  dateStr: string,
  timeStr: string,
  timeZone: string,
): Date {
  return resolveZonedDateTime(dateStr, timeStr, timeZone).date;
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

const HH_MM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function getRequiredServiceIds(ctx: AvailabilityContext): string[] {
  if (!ctx.extraServices || ctx.extraServices.length === 0) {
    return [ctx.service.id];
  }
  return [ctx.service.id, ...ctx.extraServices.map((s) => s.id)];
}

function isStaffEligibleForServices(
  staff: StaffMember,
  requiredServiceIds: readonly string[],
): boolean {
  if (!staff.isActive) return false;
  if (staff.serviceIds.length === 0) return true;
  return requiredServiceIds.every((id) => staff.serviceIds.includes(id));
}

export function rangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function computeServiceTotals(
  service: Service,
  selectedAddons: ServiceAddon[],
  extraServices: Service[] = [],
) {
  const extraServiceMinutes = extraServices.reduce(
    (sum, s) => sum + s.durationMinutes,
    0,
  );
  const extraServicePriceCents = extraServices.reduce(
    (sum, s) => sum + s.priceCents,
    0,
  );
  const extraMinutes = selectedAddons.reduce((sum, a) => sum + a.extraMinutes, 0);
  const extraPriceCents = selectedAddons.reduce((sum, a) => sum + a.extraPriceCents, 0);
  const bufferBeforeMinutes = extraServices.reduce(
    (max, s) => Math.max(max, s.bufferBeforeMinutes),
    service.bufferBeforeMinutes,
  );
  const bufferAfterMinutes = extraServices.reduce(
    (max, s) => Math.max(max, s.bufferAfterMinutes),
    service.bufferAfterMinutes,
  );
  return {
    totalDurationMinutes: service.durationMinutes + extraServiceMinutes + extraMinutes,
    subtotalCents: service.priceCents + extraServicePriceCents + extraPriceCents,
    bufferBeforeMinutes,
    bufferAfterMinutes,
  };
}

interface BusyInterval {
  startMs: number;
  endMs: number;
  reason: string;
}

interface RawWorkingWindow {
  startMin: number;
  endMin: number;
  fixedStartMinutes: number[] | null;
}

interface ResolvedWindow {
  startMin: number;
  endMin: number;
  startMs: number;
  endMs: number;
  fixedStartMinutes: number[] | null;
}

function parseFixedStartMinutes(
  fixedStartTimes: string[] | undefined,
  startMin: number,
  endMin: number,
): number[] | null {
  if (!fixedStartTimes || fixedStartTimes.length === 0) {
    return null;
  }
  const unique = new Set<number>();
  for (const raw of fixedStartTimes) {
    const trimmed = raw.trim();
    if (!HH_MM_RE.test(trimmed)) continue;
    const mins = parseTimeToMinutes(trimmed);
    if (mins >= startMin && mins < endMin) {
      unique.add(mins);
    }
  }
  return Array.from(unique).sort((a, b) => a - b);
}

function getWindowCandidateCursors(
  win: ResolvedWindow,
  totalDurationMinutes: number,
  step: number,
  optimizedAnchors?: ReadonlySet<number>,
): number[] {
  if (win.fixedStartMinutes !== null) {
    return win.fixedStartMinutes.filter(
      (cursor) => cursor + totalDurationMinutes <= win.endMin,
    );
  }
  const cursorSet = new Set<number>();
  for (
    let cursor = win.startMin;
    cursor + totalDurationMinutes <= win.endMin;
    cursor += step
  ) {
    cursorSet.add(cursor);
  }
  if (optimizedAnchors && optimizedAnchors.size > 0) {
    for (const anchor of optimizedAnchors) {
      if (anchor >= win.startMin && anchor + totalDurationMinutes <= win.endMin) {
        cursorSet.add(anchor);
      }
    }
  }
  return Array.from(cursorSet).toSorted((a, b) => a - b);
}

function isCursorAlignedToWindow(
  win: ResolvedWindow,
  cursor: number,
  step: number,
  optimizedAnchors?: ReadonlySet<number>,
): boolean {
  if (win.fixedStartMinutes !== null) {
    return win.fixedStartMinutes.includes(cursor);
  }
  if ((cursor - win.startMin) % step === 0) {
    return true;
  }
  return optimizedAnchors?.has(cursor) ?? false;
}

function getOptimizedContinuousAnchors(
  staffId: string,
  dateStr: string,
  tz: string,
  bookings: readonly Booking[],
  ignoreBookingId: string | null | undefined,
  dayResolver: DayTimeResolver,
): Set<number> {
  const anchors = new Set<number>();
  for (const b of bookings) {
    if (b.staffId !== staffId) continue;
    if (ignoreBookingId && b.id === ignoreBookingId) continue;
    if (!ACTIVE_BOOKING_STATUSES.has(b.status)) continue;
    const occEndMs = new Date(b.occupiedEndAt).getTime();
    if (Number.isNaN(occEndMs) || occEndMs % 60_000 !== 0) continue;
    const occEndDate = new Date(occEndMs);
    if (getDateKeyFormatter(tz).format(occEndDate) !== dateStr) continue;
    const parts = getZonedParts(occEndDate, tz);
    if (parts.second !== 0) continue;
    const anchorMin = parts.hour * 60 + parts.minute;
    const resolved = dayResolver.resolve(anchorMin);
    if (resolved.existsInZone && resolved.ms === occEndMs) {
      anchors.add(anchorMin);
    }
  }
  return anchors;
}

function getStaffWorkingWindows(
  staffId: string,
  dateStr: string,
  schedules: AvailabilitySchedule[],
  dateOverrides: DateOverride[],
): RawWorkingWindow[] {
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
        fixedStartMinutes: null,
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
    .map((r) => {
      const startMin = parseTimeToMinutes(r.startTime);
      const endMin = parseTimeToMinutes(r.endTime);
      return {
        startMin,
        endMin,
        fixedStartMinutes: parseFixedStartMinutes(r.fixedStartTimes, startMin, endMin),
      };
    })
    .sort((a, b) => a.startMin - b.startMin);
}

interface DayTimeResolver {
  resolve(minutesFromMidnight: number): { ms: number; existsInZone: boolean };
}

const MAX_DAY_RESOLVER_CACHE = 512;
const dayResolverCache = new Map<string, DayTimeResolver>();

function createDayTimeResolver(dateStr: string, timeZone: string): DayTimeResolver {
  const cacheKey = `${timeZone}|${dateStr}`;
  const cached = dayResolverCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const dayStart = resolveZonedDateTime(dateStr, '00:00', timeZone);
  const dayEnd = resolveZonedDateTime(dateStr, '24:00', timeZone);
  const dayStartMs = dayStart.date.getTime();
  const dayEndMs = dayEnd.date.getTime();

  let resolver: DayTimeResolver;
  if (
    dayStart.existsInZone &&
    dayEnd.existsInZone &&
    dayEndMs - dayStartMs === 86_400_000 &&
    getTimezoneOffsetMs(dayStart.date, timeZone) ===
      getTimezoneOffsetMs(dayEnd.date, timeZone)
  ) {
    resolver = {
      resolve(minutesFromMidnight: number) {
        return {
          ms: dayStartMs + minutesFromMidnight * 60_000,
          existsInZone: true,
        };
      },
    };
  } else {
    const perMinuteCache = new Map<number, { ms: number; existsInZone: boolean }>();
    resolver = {
      resolve(minutesFromMidnight: number) {
        const hit = perMinuteCache.get(minutesFromMidnight);
        if (hit) {
          return hit;
        }
        const resolved = resolveZonedDateTime(
          dateStr,
          minutesToTimeStr(minutesFromMidnight),
          timeZone,
        );
        const entry = {
          ms: resolved.date.getTime(),
          existsInZone: resolved.existsInZone,
        };
        perMinuteCache.set(minutesFromMidnight, entry);
        return entry;
      },
    };
  }

  if (dayResolverCache.size >= MAX_DAY_RESOLVER_CACHE) {
    dayResolverCache.clear();
  }
  dayResolverCache.set(cacheKey, resolver);
  return resolver;
}

function resolveWindowsForDate(
  windows: RawWorkingWindow[],
  dayResolver: DayTimeResolver,
): ResolvedWindow[] {
  return windows.map((w) => ({
    startMin: w.startMin,
    endMin: w.endMin,
    startMs: dayResolver.resolve(w.startMin).ms,
    endMs: dayResolver.resolve(w.endMin).ms,
    fixedStartMinutes: w.fixedStartMinutes,
  }));
}

function doesRecurringBlockApplyToDate(
  block: RecurringBlock,
  dateStr: string,
): boolean {
  if (!block.isActive) return false;
  if (block.untilDate && dateStr > block.untilDate) return false;
  if (block.frequency === 'weekly') {
    const dow = getDayOfWeekForDateStr(dateStr);
    return block.weekdays.includes(dow);
  }
  const { d } = parseYmd(dateStr);
  return block.dayOfMonth !== null && block.dayOfMonth === d;
}

function getStaffBusyIntervals(
  staffId: string,
  bookings: Booking[],
  slotHolds: SlotHold[],
  calendarConnections: CalendarConnection[],
  nowMs: number,
  callerSessionToken?: string | null,
  ignoreBookingId?: string | null,
  dateStr?: string,
  dayResolver?: DayTimeResolver,
  recurringBlocks?: RecurringBlock[],
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

  if (dateStr && dayResolver && recurringBlocks?.length) {
    for (const block of recurringBlocks) {
      if (block.staffId !== staffId) continue;
      if (!doesRecurringBlockApplyToDate(block, dateStr)) continue;
      const startMin = parseTimeToMinutes(block.startTime);
      const endMin = parseTimeToMinutes(block.endTime);
      if (endMin <= startMin) continue;
      const startMs = dayResolver.resolve(startMin).ms;
      const endMs = dayResolver.resolve(endMin).ms;
      if (endMs <= startMs) continue;
      const cleanReason = block.reason.trim();
      busy.push({
        startMs,
        endMs,
        reason: cleanReason ? `Bloqueo recurrente: ${cleanReason}` : 'Bloqueo recurrente',
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
    computeServiceTotals(ctx.service, ctx.addons, ctx.extraServices ?? []);
  const step = ctx.settings.slotIntervalMinutes || 30;
  const requiredServiceIds = getRequiredServiceIds(ctx);

  const eligibleStaff = ctx.staffMembers.filter((s) =>
    isStaffEligibleForServices(s, requiredServiceIds),
  );
  const candidateStaff = preferredStaffId
    ? eligibleStaff.filter((s) => s.id === preferredStaffId)
    : eligibleStaff;

  const slotsByTime = new Map<string, AvailableSlot>();
  const dayResolver = createDayTimeResolver(dateStr, tz);

  for (const staff of candidateStaff) {
    const rawWindows = getStaffWorkingWindows(
      staff.id,
      dateStr,
      ctx.schedules,
      ctx.dateOverrides,
    );
    if (rawWindows.length === 0) continue;

    const windows = resolveWindowsForDate(rawWindows, dayResolver);
    const busy = getStaffBusyIntervals(
      staff.id,
      ctx.bookings,
      ctx.slotHolds,
      ctx.calendarConnections,
      nowMs,
      ctx.callerSessionToken,
      ctx.ignoreBookingId,
      dateStr,
      dayResolver,
      ctx.recurringBlocks,
    );

    const optimizedAnchors = ctx.settings.optimizeContinuousSlots
      ? getOptimizedContinuousAnchors(
          staff.id,
          dateStr,
          tz,
          ctx.bookings,
          ctx.ignoreBookingId,
          dayResolver,
        )
      : undefined;

    for (const win of windows) {
      const cursors = getWindowCandidateCursors(
        win,
        totalDurationMinutes,
        step,
        optimizedAnchors,
      );
      for (const cursor of cursors) {
        const resolved = dayResolver.resolve(cursor);
        if (!resolved.existsInZone) continue;

        const startMs = resolved.ms;
        const endMs = startMs + totalDurationMinutes * 60_000;
        if (startMs < win.startMs || endMs > win.endMs) continue;

        const occStartMs = startMs - bufferBeforeMinutes * 60_000;
        const occEndMs = endMs + bufferAfterMinutes * 60_000;

        if (startMs < minNoticeMs || startMs > maxFutureMs) continue;

        const hasConflict = busy.some((b) =>
          rangesOverlap(occStartMs, occEndMs, b.startMs, b.endMs),
        );
        if (hasConflict) continue;

        const slotKey = preferredStaffId ? `${staff.id}:${startMs}` : `${startMs}`;
        const existing = slotsByTime.get(slotKey);
        if (existing) {
          existing.availableStaffIds.push(staff.id);
        } else {
          const time24 = minutesToTimeStr(cursor);
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
            availableStaffIds: [staff.id],
          });
        }
      }
    }
  }

  return Array.from(slotsByTime.values()).sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );
}

function resolveDayOverrideMetadata(
  ctx: AvailabilityContext,
  date: string,
  eligibleStaffIds: ReadonlySet<string>,
  preferredStaffId: string | null | undefined,
  hasSlots: boolean,
): Pick<DayAvailabilitySummary, 'publicNote' | 'redirectStaffId' | 'redirectStaffName'> {
  if (preferredStaffId) {
    const override = ctx.dateOverrides.find(
      (o) => o.staffId === preferredStaffId && o.overrideDate === date,
    );
    if (!override) return {};
    const publicNote = override.publicNote?.trim() || undefined;
    const redirectStaff = override.redirectStaffId
      ? ctx.staffMembers.find(
          (s) => s.id === override.redirectStaffId && s.isActive && s.id !== override.staffId,
        )
      : undefined;
    return {
      ...(publicNote ? { publicNote } : {}),
      ...(redirectStaff
        ? { redirectStaffId: redirectStaff.id, redirectStaffName: redirectStaff.name }
        : {}),
    };
  }

  const matchingOverrides = ctx.dateOverrides.filter(
    (o) => o.overrideDate === date && eligibleStaffIds.has(o.staffId),
  );
  if (matchingOverrides.length === 0) return {};
  if (hasSlots && matchingOverrides.length < eligibleStaffIds.size) return {};

  const noteOverride = matchingOverrides.find((o) => Boolean(o.publicNote?.trim()));
  const publicNote = noteOverride?.publicNote?.trim() || undefined;
  const redirectOverride = !hasSlots
    ? matchingOverrides.find((o) => Boolean(o.redirectStaffId))
    : undefined;
  const redirectStaff = redirectOverride?.redirectStaffId
    ? ctx.staffMembers.find(
        (s) =>
          s.id === redirectOverride.redirectStaffId &&
          s.isActive &&
          s.id !== redirectOverride.staffId,
      )
    : undefined;

  return {
    ...(publicNote ? { publicNote } : {}),
    ...(redirectStaff
      ? { redirectStaffId: redirectStaff.id, redirectStaffName: redirectStaff.name }
      : {}),
  };
}

export function getAvailabilityForRange(
  ctx: AvailabilityContext,
  startDateStr: string,
  daysCount: number,
  preferredStaffId?: string | null,
): DayAvailabilitySummary[] {
  const requiredServiceIds = getRequiredServiceIds(ctx);
  const eligibleStaffIds = new Set(
    ctx.staffMembers
      .filter((s) => isStaffEligibleForServices(s, requiredServiceIds))
      .map((s) => s.id),
  );
  const results: DayAvailabilitySummary[] = [];
  for (let i = 0; i < daysCount; i++) {
    const date = addDaysToDateStr(startDateStr, i);
    const slots = getAvailableSlotsForDate(ctx, date, preferredStaffId);
    const hasSlots = slots.length > 0;
    const meta = resolveDayOverrideMetadata(
      ctx,
      date,
      eligibleStaffIds,
      preferredStaffId,
      hasSlots,
    );
    results.push({
      date,
      hasSlots,
      slotCount: slots.length,
      slots,
      ...meta,
    });
  }
  return results;
}

export function findEarliestAvailableSlots(
  ctx: AvailabilityContext,
  startDate: string,
  days: number,
  limit = 5,
  staffId?: string | null,
): AvailableSlot[] {
  const safeDays = Math.max(1, Math.min(90, Math.floor(days)));
  const safeLimit = Math.max(1, Math.floor(limit));
  const found: AvailableSlot[] = [];

  for (let offset = 0; offset < safeDays && found.length < safeLimit; offset += 1) {
    const date = addDaysToDateStr(startDate, offset);
    const daySlots = getAvailableSlotsForDate(ctx, date, staffId);
    for (const slot of daySlots) {
      found.push(slot);
      if (found.length >= safeLimit) break;
    }
  }

  return found;
}

export function findNearestAvailableSlots(
  ctx: AvailabilityContext,
  targetStartIso: string,
  preferredStaffId?: string | null,
  limit = 3,
): AvailableSlot[] {
  const targetMs = new Date(targetStartIso).getTime();
  if (Number.isNaN(targetMs)) return [];
  const tz = ctx.settings.timezone || 'America/Mexico_City';
  const targetDateStr = getDateKeyFormatter(tz).format(new Date(targetMs));

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

export function assertSlotBookable(
  ctx: AvailabilityContext,
  params: AssertSlotBookableParams,
): AssertSlotBookableResult {
  const effectiveNow = params.now ?? ctx.now ?? new Date();
  const effectiveCtx: AvailabilityContext = {
    ...ctx,
    now: effectiveNow,
    ignoreBookingId:
      params.ignoreBookingId !== undefined ? params.ignoreBookingId : ctx.ignoreBookingId,
    callerSessionToken:
      params.ignoreHoldSessionToken !== undefined
        ? params.ignoreHoldSessionToken
        : ctx.callerSessionToken,
  };

  const nowMs = effectiveNow.getTime();
  const minNoticeMs = nowMs + effectiveCtx.settings.minBookingNoticeMinutes * 60_000;
  const maxFutureMs = nowMs + effectiveCtx.settings.maxBookingDaysAhead * 86_400_000;
  const tz = effectiveCtx.settings.timezone || 'America/Mexico_City';
  const startMs = new Date(params.startAt).getTime();

  const requiredServiceIds = getRequiredServiceIds(effectiveCtx);
  const staff = effectiveCtx.staffMembers.find((s) => s.id === params.staffId);
  if (!staff || !isStaffEligibleForServices(staff, requiredServiceIds)) {
    const fallbackIso =
      Number.isNaN(startMs) || startMs < nowMs
        ? effectiveNow.toISOString()
        : new Date(startMs).toISOString();
    return {
      ok: false,
      code: 'STAFF_INELIGIBLE',
      message: 'La profesional seleccionada no está disponible para este servicio.',
      suggestedSlots: findNearestAvailableSlots(effectiveCtx, fallbackIso, null, 3),
    };
  }

  if (Number.isNaN(startMs)) {
    return {
      ok: false,
      code: 'INVALID_ALIGNMENT',
      message: 'La fecha u hora seleccionada no es válida.',
      suggestedSlots: findNearestAvailableSlots(
        effectiveCtx,
        effectiveNow.toISOString(),
        params.staffId,
        3,
      ),
    };
  }

  const dateStr = getDateKeyFormatter(tz).format(new Date(startMs));
  const availableSlots = getAvailableSlotsForDate(effectiveCtx, dateStr, params.staffId);
  const matched = availableSlots.find(
    (s) => new Date(s.startAt).getTime() === startMs && s.staffId === params.staffId,
  );
  if (matched) {
    return { ok: true, slot: matched };
  }

  const suggestionAnchorIso =
    startMs < nowMs || startMs > maxFutureMs
      ? effectiveNow.toISOString()
      : new Date(startMs).toISOString();
  const suggestedSlots = findNearestAvailableSlots(
    effectiveCtx,
    suggestionAnchorIso,
    params.staffId,
    3,
  );

  if (startMs < minNoticeMs) {
    return {
      ok: false,
      code: 'PAST_OR_NOTICE',
      message:
        startMs <= nowMs
          ? 'No es posible reservar en una fecha u hora pasada.'
          : `El horario seleccionado no cumple con el aviso mínimo (${effectiveCtx.settings.minBookingNoticeMinutes} min).`,
      suggestedSlots,
    };
  }

  if (startMs > maxFutureMs) {
    return {
      ok: false,
      code: 'BEYOND_MAX_DAYS',
      message: `La fecha excede el límite máximo de ${effectiveCtx.settings.maxBookingDaysAhead} días de anticipación.`,
      suggestedSlots,
    };
  }

  const rawWindows = getStaffWorkingWindows(
    params.staffId,
    dateStr,
    effectiveCtx.schedules,
    effectiveCtx.dateOverrides,
  );
  if (rawWindows.length === 0) {
    return {
      ok: false,
      code: 'OUTSIDE_HOURS',
      message: 'No hay horario laboral disponible para esta fecha.',
      suggestedSlots,
    };
  }

  const { totalDurationMinutes } = computeServiceTotals(
    effectiveCtx.service,
    effectiveCtx.addons,
    effectiveCtx.extraServices ?? [],
  );
  const step = effectiveCtx.settings.slotIntervalMinutes || 30;
  const localParts = getZonedParts(new Date(startMs), tz);
  const localMin = localParts.hour * 60 + localParts.minute;
  const endMs = startMs + totalDurationMinutes * 60_000;
  const dayResolver = createDayTimeResolver(dateStr, tz);
  const windows = resolveWindowsForDate(rawWindows, dayResolver);

  const fittingWindows = windows.filter(
    (w) =>
      localMin >= w.startMin &&
      localMin + totalDurationMinutes <= w.endMin &&
      startMs >= w.startMs &&
      endMs <= w.endMs,
  );

  if (fittingWindows.length === 0) {
    return {
      ok: false,
      code: 'OUTSIDE_HOURS',
      message:
        'El horario seleccionado está fuera del horario laboral o no alcanza la duración del servicio.',
      suggestedSlots,
    };
  }

  const optimizedAnchors = effectiveCtx.settings.optimizeContinuousSlots
    ? getOptimizedContinuousAnchors(
        params.staffId,
        dateStr,
        tz,
        effectiveCtx.bookings,
        effectiveCtx.ignoreBookingId,
        dayResolver,
      )
    : undefined;

  const subSecondMs = ((startMs % 1000) + 1000) % 1000;
  const canonicalTime = dayResolver.resolve(localMin);
  const isAlignedToWindow =
    localParts.second === 0 &&
    subSecondMs === 0 &&
    canonicalTime.existsInZone &&
    canonicalTime.ms === startMs &&
    fittingWindows.some((w) => isCursorAlignedToWindow(w, localMin, step, optimizedAnchors));

  if (!isAlignedToWindow) {
    const usesFixedTimes = fittingWindows.some((w) => w.fixedStartMinutes !== null);
    return {
      ok: false,
      code: 'INVALID_ALIGNMENT',
      message: usesFixedTimes
        ? 'El horario debe coincidir con uno de los horarios fijos disponibles.'
        : `El horario debe estar alineado al intervalo de agenda (${step} min).`,
      suggestedSlots,
    };
  }

  return {
    ok: false,
    code: 'SLOT_TAKEN',
    message: 'Ese horario ya está ocupado o apartado temporalmente.',
    suggestedSlots,
  };
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
  const maxFutureMs = nowMs + ctx.settings.maxBookingDaysAhead * 86_400_000;
  const tz = ctx.settings.timezone || 'America/Mexico_City';
  const step = ctx.settings.slotIntervalMinutes || 30;
  const isEligible = isStaffEligibleForServices(staff, getRequiredServiceIds(ctx));

  const override = ctx.dateOverrides.find(
    (o) => o.staffId === staffId && o.overrideDate === dateStr,
  );
  const rawWindows = getStaffWorkingWindows(
    staffId,
    dateStr,
    ctx.schedules,
    ctx.dateOverrides,
  );
  const dayResolver = createDayTimeResolver(dateStr, tz);
  const windows = resolveWindowsForDate(rawWindows, dayResolver);
  const busy = getStaffBusyIntervals(
    staffId,
    ctx.bookings,
    ctx.slotHolds,
    ctx.calendarConnections,
    nowMs,
    ctx.callerSessionToken,
    ctx.ignoreBookingId,
    dateStr,
    dayResolver,
    ctx.recurringBlocks,
  );
  const { totalDurationMinutes, bufferBeforeMinutes, bufferAfterMinutes } =
    computeServiceTotals(ctx.service, ctx.addons, ctx.extraServices ?? []);

  const availableTimeSet = new Set(
    getAvailableSlotsForDate(ctx, dateStr, staffId).map((s) => s.localTime24),
  );

  const optimizedAnchors = ctx.settings.optimizeContinuousSlots
    ? getOptimizedContinuousAnchors(
        staffId,
        dateStr,
        tz,
        ctx.bookings,
        ctx.ignoreBookingId,
        dayResolver,
      )
    : undefined;

  const candidateMinutes = new Set<number>();
  for (let cursor = 9 * 60; cursor <= 20 * 60; cursor += step) {
    candidateMinutes.add(cursor);
  }
  for (const w of rawWindows) {
    if (w.fixedStartMinutes !== null) {
      for (const fixedMin of w.fixedStartMinutes) {
        if (fixedMin >= 0 && fixedMin < 24 * 60) {
          candidateMinutes.add(fixedMin);
        }
      }
    } else {
      for (let cursor = w.startMin; cursor <= w.endMin; cursor += step) {
        if (cursor >= 0 && cursor < 24 * 60) {
          candidateMinutes.add(cursor);
        }
      }
      if (optimizedAnchors) {
        for (const anchor of optimizedAnchors) {
          if (anchor >= w.startMin && anchor <= w.endMin) {
            candidateMinutes.add(anchor);
          }
        }
      }
    }
  }

  const sortedMinutes = Array.from(candidateMinutes).sort((a, b) => a - b);
  const diagnostics: SlotDiagnosis[] = [];

  for (const cursor of sortedMinutes) {
    const time24 = minutesToTimeStr(cursor);

    if (!isEligible) {
      diagnostics.push({
        date: dateStr,
        time24,
        staffId,
        staffName: staff.name,
        isAvailable: false,
        reason: 'Profesional inactiva o no realiza este servicio',
      });
      continue;
    }

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

    const resolved = dayResolver.resolve(cursor);
    if (!resolved.existsInZone) {
      diagnostics.push({
        date: dateStr,
        time24,
        staffId,
        staffName: staff.name,
        isAvailable: false,
        reason: 'Hora inexistente por cambio de horario (DST)',
      });
      continue;
    }

    const startMs = resolved.ms;
    const endMs = startMs + totalDurationMinutes * 60_000;
    const occStartMs = startMs - bufferBeforeMinutes * 60_000;
    const occEndMs = endMs + bufferAfterMinutes * 60_000;

    const fittingWindows = windows.filter(
      (w) =>
        cursor >= w.startMin &&
        cursor + totalDurationMinutes <= w.endMin &&
        startMs >= w.startMs &&
        endMs <= w.endMs,
    );
    if (fittingWindows.length === 0) {
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

    const isAligned = fittingWindows.some((w) =>
      isCursorAlignedToWindow(w, cursor, step, optimizedAnchors),
    );
    if (!isAligned) {
      const usesFixedTimes = fittingWindows.some((w) => w.fixedStartMinutes !== null);
      diagnostics.push({
        date: dateStr,
        time24,
        staffId,
        staffName: staff.name,
        isAvailable: false,
        reason: usesFixedTimes
          ? 'Fuera de los horarios fijos configurados'
          : `Fuera de la cuadrícula de intervalos (${step} min)`,
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

    if (startMs > maxFutureMs) {
      diagnostics.push({
        date: dateStr,
        time24,
        staffId,
        staffName: staff.name,
        isAvailable: false,
        reason: `Excede el límite máximo de anticipación (${ctx.settings.maxBookingDaysAhead} días)`,
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

    const isAvailable = availableTimeSet.has(time24);
    diagnostics.push({
      date: dateStr,
      time24,
      staffId,
      staffName: staff.name,
      isAvailable,
      reason: isAvailable ? 'Disponible' : 'No disponible',
    });
  }

  return diagnostics;
}
