import type {
  AvailabilitySchedule,
  Booking,
  BookingReview,
  ClientProfile,
  FunnelEventRecord,
  FunnelEventType,
  PaymentSplit,
  Service,
  StaffMember,
} from '../types';

export type ReportPeriod = '7d' | '30d' | '90d' | 'all';

export interface ExecutiveReportInput {
  bookings: readonly Booking[];
  services: readonly Service[];
  staff: readonly StaffMember[];
  schedules: readonly AvailabilitySchedule[];
  clients: readonly ClientProfile[];
  reviews: readonly BookingReview[];
  paymentSplits: readonly PaymentSplit[];
  funnelEvents?: readonly FunnelEventRecord[];
  period: ReportPeriod;
  nowMs: number;
  timezone: string;
  scopeStaffId?: string | null;
}

interface ExecutiveSummaryKpis {
  totalBookings: number;
  completedCount: number;
  noShowCount: number;
  canceledCount: number;
  totalRevenueCollectedCents: number;
  averageTicketCents: number;
  completionRatePercent: number;
  noShowRatePercent: number;
  cancellationRatePercent: number;
  averageRating: number | null;
  reviewsCount: number;
  totalTipsCents: number;
}

export type SpecialistOccupancyRow = {
  staffId: string;
  staffName: string;
  roleTitle: string;
  bookedMinutes: number;
  availableMinutes: number;
  occupancyPercent: number;
  completedCount: number;
  noShowCount: number;
  revenueCents: number;
  newClientsCount: number;
  returningClientsCount: number;
  retentionPercent: number;
};

interface HeatmapCell {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  dayShort: string;
  dayLabel: string;
  hour: number;
  hourLabel: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

interface HeatmapDayRow {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  dayShort: string;
  dayLabel: string;
  cells: HeatmapCell[];
}

export interface DemandHeatmap {
  hours: number[];
  days: HeatmapDayRow[];
  maxCount: number;
  totalBookings: number;
  peakSlot: HeatmapCell | null;
  quietSlot: HeatmapCell | null;
}

export interface ServiceProfitabilityRow {
  serviceId: string;
  serviceName: string;
  bookingsCount: number;
  revenueCents: number;
  totalMinutes: number;
  revenuePerMinuteCents: number;
}

interface CancellationReasonRow {
  reason: string;
  count: number;
  sharePercent: number;
}

interface FunnelStageRow {
  eventType: FunnelEventType;
  label: string;
  sessionsCount: number;
  stepConversionPercent: number;
  shareOfTopPercent: number;
}

export interface BookingFunnelSummary {
  totalSessions: number;
  confirmedSessions: number;
  overallConversionPercent: number;
  stages: FunnelStageRow[];
}

export interface ExecutiveReport {
  period: ReportPeriod;
  rangeStartDate: string;
  rangeEndDate: string;
  summary: ExecutiveSummaryKpis;
  specialistOccupancy: SpecialistOccupancyRow[];
  heatmap: DemandHeatmap;
  serviceProfitability: ServiceProfitabilityRow[];
  cancellationReasons: CancellationReasonRow[];
  funnel: BookingFunnelSummary;
}

const FUNNEL_STAGE_DEFS: ReadonlyArray<{ eventType: FunnelEventType; label: string }> = [
  { eventType: 'page_view', label: 'Visitaron /reservar' },
  { eventType: 'booking_started', label: 'Eligieron servicio' },
  { eventType: 'slot_held', label: 'Apartaron horario' },
  { eventType: 'details_completed', label: 'Completaron datos' },
  { eventType: 'deposit_submitted', label: 'Adjuntaron comprobante' },
  { eventType: 'booking_confirmed', label: 'Confirmaron cita' },
];

export function buildFunnelSummary(
  events: readonly FunnelEventRecord[],
  period: ReportPeriod,
  nowMs: number,
  timezone: string,
): BookingFunnelSummary {
  const tz = resolveTimezone(timezone);
  const safeNowMs = Number.isFinite(nowMs) ? nowMs : 0;
  const todayKey = getZonedDateAndHour(safeNowMs, tz).dateKey;
  const minMs = period === 'all' ? -Infinity : safeNowMs - PERIOD_DAYS[period] * DAY_MS;

  const sessionsByStage = new Map<FunnelEventType, Set<string>>();
  for (const def of FUNNEL_STAGE_DEFS) {
    sessionsByStage.set(def.eventType, new Set<string>());
  }
  const allSessions = new Set<string>();

  for (const event of events) {
    const createdMs = Date.parse(event.createdAt);
    if (!Number.isFinite(createdMs)) continue;
    if (period !== 'all') {
      const eventDateKey = getZonedDateAndHour(createdMs, tz).dateKey;
      if (createdMs < minMs || eventDateKey > todayKey) continue;
    }
    const sid = event.sessionId.trim();
    if (!sid) continue;
    allSessions.add(sid);
    sessionsByStage.get(event.eventType)?.add(sid);
  }

  const topCount = Math.max(
    sessionsByStage.get('page_view')?.size ?? 0,
    sessionsByStage.get('booking_started')?.size ?? 0,
    allSessions.size,
  );

  let previousCount = 0;
  const stages: FunnelStageRow[] = FUNNEL_STAGE_DEFS.map((def, idx) => {
    const count = sessionsByStage.get(def.eventType)?.size ?? 0;
    const stepConversionPercent =
      idx === 0
        ? count > 0
          ? 100
          : 0
        : previousCount > 0
          ? Math.min(100, Math.round((count / previousCount) * 100))
          : 0;
    const shareOfTopPercent =
      topCount > 0 ? Math.min(100, Math.round((count / topCount) * 100)) : 0;
    if (count > 0 || idx === 0) {
      previousCount = count;
    }
    return {
      eventType: def.eventType,
      label: def.label,
      sessionsCount: count,
      stepConversionPercent,
      shareOfTopPercent,
    };
  });

  const confirmedSessions = sessionsByStage.get('booking_confirmed')?.size ?? 0;
  const overallConversionPercent =
    topCount > 0 ? Math.min(100, Math.round((confirmedSessions / topCount) * 100)) : 0;

  return {
    totalSessions: allSessions.size,
    confirmedSessions,
    overallConversionPercent,
    stages,
  };
}

const DAY_MS = 86_400_000;
const HEATMAP_HOURS: readonly number[] = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const DEFAULT_TIMEZONE = 'America/Mexico_City';

const WEEKDAYS_MON_FIRST: ReadonlyArray<{
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  dayShort: string;
  dayLabel: string;
}> = [
  { dayOfWeek: 1, dayShort: 'Lun', dayLabel: 'Lunes' },
  { dayOfWeek: 2, dayShort: 'Mar', dayLabel: 'Martes' },
  { dayOfWeek: 3, dayShort: 'Mié', dayLabel: 'Miércoles' },
  { dayOfWeek: 4, dayShort: 'Jue', dayLabel: 'Jueves' },
  { dayOfWeek: 5, dayShort: 'Vie', dayLabel: 'Viernes' },
  { dayOfWeek: 6, dayShort: 'Sáb', dayLabel: 'Sábado' },
  { dayOfWeek: 0, dayShort: 'Dom', dayLabel: 'Domingo' },
];

const PERIOD_DAYS: Record<Exclude<ReportPeriod, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

function resolveTimezone(timezone: string): string {
  const trimmed = timezone.trim();
  if (!trimmed) return DEFAULT_TIMEZONE;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: trimmed }).resolvedOptions();
    return trimmed;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function getZonedDateAndHour(
  ms: number,
  timeZone: string,
): { dateKey: string; hour: number; dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6 } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));

  let year = 2026;
  let month = 1;
  let day = 1;
  let hour = 0;

  for (const part of parts) {
    if (part.type === 'year') year = Number(part.value);
    else if (part.type === 'month') month = Number(part.value);
    else if (part.type === 'day') day = Number(part.value);
    else if (part.type === 'hour') hour = Number(part.value);
  }

  const normalizedHour = hour === 24 ? 0 : hour;
  const dateKey = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay() as
    | 0
    | 1
    | 2
    | 3
    | 4
    | 5
    | 6;

  return { dateKey, hour: normalizedHour, dayOfWeek };
}

function parseYmd(dateKey: string): { y: number; m: number; d: number } {
  const [y = 2026, m = 1, d = 1] = dateKey.split('-').map(Number);
  return { y, m, d };
}

function addDaysToDateKey(dateKey: string, deltaDays: number): string {
  const { y, m, d } = parseYmd(dateKey);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

function getDayOfWeekForDateKey(dateKey: string): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  const { y, m, d } = parseYmd(dateKey);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay() as
    | 0
    | 1
    | 2
    | 3
    | 4
    | 5
    | 6;
}

function diffCalendarDaysInclusive(startKey: string, endKey: string): number {
  const start = parseYmd(startKey);
  const end = parseYmd(endKey);
  const startUtc = Date.UTC(start.y, start.m - 1, start.d, 12, 0, 0);
  const endUtc = Date.UTC(end.y, end.m - 1, end.d, 12, 0, 0);
  const diff = Math.round((endUtc - startUtc) / DAY_MS);
  return Math.max(1, diff + 1);
}

function parseTimeToMinutes(timeStr: string): number {
  const [hhRaw, mmRaw] = timeStr.split(':');
  const hh = Number(hhRaw);
  const mm = Number(mmRaw);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
  return Math.max(0, Math.min(24 * 60, hh * 60 + mm));
}

function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function computeHeatmapLevel(count: number, maxCount: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || maxCount <= 0) return 0;
  const ratio = count / maxCount;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

function computeAvailableMinutesForRange(
  schedule: AvailabilitySchedule | undefined,
  startKey: string,
  dayCount: number,
): number {
  if (!schedule || schedule.rules.length === 0 || dayCount <= 0) return 0;

  const minutesByWeekday = new Map<number, number>();
  for (const rule of schedule.rules) {
    const span = Math.max(
      0,
      parseTimeToMinutes(rule.endTime) - parseTimeToMinutes(rule.startTime),
    );
    minutesByWeekday.set(
      rule.dayOfWeek,
      (minutesByWeekday.get(rule.dayOfWeek) ?? 0) + span,
    );
  }

  let total = 0;
  const fullWeeks = Math.floor(dayCount / 7);
  if (fullWeeks > 0) {
    let weeklyMinutes = 0;
    for (const mins of minutesByWeekday.values()) {
      weeklyMinutes += mins;
    }
    total += fullWeeks * weeklyMinutes;
  }

  const remainderDays = dayCount % 7;
  const startDow = getDayOfWeekForDateKey(startKey);
  for (let offset = 0; offset < remainderDays; offset += 1) {
    const dow = (startDow + offset) % 7;
    total += minutesByWeekday.get(dow) ?? 0;
  }

  return total;
}

function buildWorkingSlotKeySet(
  schedules: readonly AvailabilitySchedule[],
): Set<string> {
  const keys = new Set<string>();
  for (const schedule of schedules) {
    for (const rule of schedule.rules) {
      const startMin = parseTimeToMinutes(rule.startTime);
      const endMin = parseTimeToMinutes(rule.endTime);
      if (endMin <= startMin) continue;
      for (const hour of HEATMAP_HOURS) {
        const hourStart = hour * 60;
        const hourEnd = (hour + 1) * 60;
        if (hourStart < endMin && hourEnd > startMin) {
          keys.add(`${rule.dayOfWeek}:${hour}`);
        }
      }
    }
  }
  return keys;
}

export function buildExecutiveReport(input: ExecutiveReportInput): ExecutiveReport {
  const tz = resolveTimezone(input.timezone);
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : 0;
  const todayZoned = getZonedDateAndHour(nowMs, tz);
  const todayKey = todayZoned.dateKey;
  const scopeId = input.scopeStaffId?.trim() || null;

  const scopedBookingsAll = scopeId
    ? input.bookings.filter((b) => b.staffId === scopeId)
    : input.bookings;

  const scopedBookingIdSetAll = new Set(scopedBookingsAll.map((b) => b.id));

  const scopedStaffBase = scopeId
    ? input.staff.filter((s) => s.id === scopeId)
    : input.staff;

  const scopedSchedules = scopeId
    ? input.schedules.filter((sc) => sc.staffId === scopeId)
    : input.schedules;

  const scopedReviewsAll = scopeId
    ? input.reviews.filter(
        (r) =>
          r.staffId === scopeId ||
          (r.staffId === null && scopedBookingIdSetAll.has(r.bookingId)),
      )
    : input.reviews;

  const knownClientIds = new Set(input.clients.map((c) => c.id));

  const bookingMetaById = new Map<
    string,
    { startMs: number; dateKey: string; hour: number; dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6 }
  >();
  for (const booking of scopedBookingsAll) {
    const startMs = Date.parse(booking.startAt);
    if (!Number.isFinite(startMs)) continue;
    const zoned = getZonedDateAndHour(startMs, tz);
    bookingMetaById.set(booking.id, {
      startMs,
      dateKey: zoned.dateKey,
      hour: zoned.hour,
      dayOfWeek: zoned.dayOfWeek,
    });
  }

  let rangeStartDate = todayKey;
  let rangeEndDate = todayKey;
  let periodBookings: Booking[] = [];

  if (input.period === 'all') {
    periodBookings = scopedBookingsAll.filter((b) => bookingMetaById.has(b.id));
    if (periodBookings.length > 0) {
      let minKey = todayKey;
      let maxKey = todayKey;
      for (const b of periodBookings) {
        const meta = bookingMetaById.get(b.id);
        if (!meta) continue;
        if (meta.dateKey < minKey) minKey = meta.dateKey;
        if (meta.dateKey > maxKey) maxKey = meta.dateKey;
      }
      rangeStartDate = minKey;
      rangeEndDate = maxKey;
    } else {
      rangeStartDate = addDaysToDateKey(todayKey, -29);
      rangeEndDate = todayKey;
    }
  } else {
    const days = PERIOD_DAYS[input.period];
    const minMs = nowMs - days * DAY_MS;
    rangeStartDate = addDaysToDateKey(todayKey, -(days - 1));
    rangeEndDate = todayKey;
    periodBookings = scopedBookingsAll.filter((b) => {
      const meta = bookingMetaById.get(b.id);
      if (!meta) return false;
      return meta.startMs >= minMs && meta.dateKey <= todayKey;
    });
  }

  const periodBookingIds = new Set(periodBookings.map((b) => b.id));
  const rangeDayCount = diffCalendarDaysInclusive(rangeStartDate, rangeEndDate);

  const paidByBookingId = new Map<string, number>();
  let totalRevenueCollectedCents = 0;
  let totalTipsCents = 0;

  for (const split of input.paymentSplits) {
    if (!periodBookingIds.has(split.bookingId)) continue;
    if (Number.isFinite(split.amountCents) && split.amountCents > 0) {
      const amt = Math.round(split.amountCents);
      paidByBookingId.set(
        split.bookingId,
        (paidByBookingId.get(split.bookingId) ?? 0) + amt,
      );
      totalRevenueCollectedCents += amt;
    }
    if (Number.isFinite(split.tipCents) && split.tipCents > 0) {
      const tipAppliesToScope =
        !scopeId || split.tipStaffId === null || split.tipStaffId === scopeId;
      if (tipAppliesToScope) {
        totalTipsCents += Math.round(split.tipCents);
      }
    }
  }

  let completedCount = 0;
  let noShowCount = 0;
  let canceledCount = 0;
  let paidBookingsCount = 0;

  for (const booking of periodBookings) {
    if (booking.status === 'completed') completedCount += 1;
    else if (booking.status === 'no_show') noShowCount += 1;
    else if (booking.status === 'canceled') canceledCount += 1;

    if ((paidByBookingId.get(booking.id) ?? 0) > 0) {
      paidBookingsCount += 1;
    }
  }

  const closedCount = completedCount + noShowCount + canceledCount;
  const averageTicketCents =
    paidBookingsCount > 0
      ? Math.round(totalRevenueCollectedCents / paidBookingsCount)
      : 0;
  const completionRatePercent =
    closedCount > 0 ? Math.round((completedCount / closedCount) * 100) : 0;
  const noShowRatePercent =
    closedCount > 0 ? Math.round((noShowCount / closedCount) * 100) : 0;
  const cancellationRatePercent =
    closedCount > 0 ? Math.round((canceledCount / closedCount) * 100) : 0;

  const periodReviews = scopedReviewsAll.filter((r) => {
    if (input.period === 'all') return true;
    if (periodBookingIds.has(r.bookingId)) return true;
    const createdMs = Date.parse(r.createdAt);
    if (!Number.isFinite(createdMs)) return false;
    const days = PERIOD_DAYS[input.period];
    const minMs = nowMs - days * DAY_MS;
    const createdZoned = getZonedDateAndHour(createdMs, tz);
    return createdMs >= minMs && createdZoned.dateKey <= todayKey;
  });

  const reviewsCount = periodReviews.length;
  const averageRating =
    reviewsCount > 0
      ? Number(
          (
            periodReviews.reduce((sum, r) => sum + r.rating, 0) / reviewsCount
          ).toFixed(1),
        )
      : null;

  const summary: ExecutiveSummaryKpis = {
    totalBookings: periodBookings.length,
    completedCount,
    noShowCount,
    canceledCount,
    totalRevenueCollectedCents,
    averageTicketCents,
    completionRatePercent,
    noShowRatePercent,
    cancellationRatePercent,
    averageRating,
    reviewsCount,
    totalTipsCents,
  };

  const staffClientVisitCounts = new Map<string, Map<string, number>>();
  for (const booking of scopedBookingsAll) {
    if (booking.status === 'canceled' || booking.status === 'no_show') continue;
    let perClient = staffClientVisitCounts.get(booking.staffId);
    if (!perClient) {
      perClient = new Map<string, number>();
      staffClientVisitCounts.set(booking.staffId, perClient);
    }
    const clientKey = knownClientIds.has(booking.clientId)
      ? booking.clientId
      : booking.clientId;
    perClient.set(clientKey, (perClient.get(clientKey) ?? 0) + 1);
  }

  const periodStaffIds = new Set(periodBookings.map((b) => b.staffId));
  const includedStaff = scopedStaffBase
    .filter((s) => (scopeId ? s.id === scopeId : s.isActive || periodStaffIds.has(s.id)))
    .toSorted((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, 'es'));

  const specialistOccupancy: SpecialistOccupancyRow[] = includedStaff.map((member) => {
    const memberSchedule =
      scopedSchedules.find((sc) => sc.staffId === member.id && sc.isDefault) ??
      scopedSchedules.find((sc) => sc.staffId === member.id);

    const availableMinutes = computeAvailableMinutesForRange(
      memberSchedule,
      rangeStartDate,
      rangeDayCount,
    );

    let bookedMinutes = 0;
    let memberCompleted = 0;
    let memberNoShow = 0;
    let revenueCents = 0;
    const periodClients = new Set<string>();

    for (const booking of periodBookings) {
      if (booking.staffId !== member.id) continue;
      if (booking.status === 'completed') memberCompleted += 1;
      else if (booking.status === 'no_show') memberNoShow += 1;

      revenueCents += paidByBookingId.get(booking.id) ?? 0;

      if (booking.status !== 'canceled' && booking.status !== 'no_show') {
        bookedMinutes += Math.max(0, Math.round(booking.totalDurationMinutes));
        periodClients.add(booking.clientId);
      }
    }

    const visitMap = staffClientVisitCounts.get(member.id);
    let newClientsCount = 0;
    let returningClientsCount = 0;

    for (const clientId of periodClients) {
      const totalVisits = visitMap?.get(clientId) ?? 1;
      if (totalVisits >= 2) {
        returningClientsCount += 1;
      } else {
        newClientsCount += 1;
      }
    }

    const totalClients = newClientsCount + returningClientsCount;
    const retentionPercent =
      totalClients > 0 ? Math.round((returningClientsCount / totalClients) * 100) : 0;
    const occupancyPercent =
      availableMinutes > 0
        ? Math.min(100, Math.round((bookedMinutes / availableMinutes) * 100))
        : 0;

    return {
      staffId: member.id,
      staffName: member.name,
      roleTitle: member.roleTitle,
      bookedMinutes,
      availableMinutes,
      occupancyPercent,
      completedCount: memberCompleted,
      noShowCount: memberNoShow,
      revenueCents,
      newClientsCount,
      returningClientsCount,
      retentionPercent,
    };
  });

  const heatmapCounts = new Map<string, number>();
  let heatmapTotalBookings = 0;

  for (const booking of periodBookings) {
    if (booking.status === 'canceled' || booking.status === 'no_show') continue;
    const meta = bookingMetaById.get(booking.id);
    if (!meta) continue;
    if (meta.hour < 9 || meta.hour > 20) continue;
    const key = `${meta.dayOfWeek}:${meta.hour}`;
    heatmapCounts.set(key, (heatmapCounts.get(key) ?? 0) + 1);
    heatmapTotalBookings += 1;
  }

  let maxHeatmapCount = 0;
  for (const count of heatmapCounts.values()) {
    if (count > maxHeatmapCount) maxHeatmapCount = count;
  }

  const workingSlotKeys = buildWorkingSlotKeySet(scopedSchedules);
  let peakSlot: HeatmapCell | null = null;
  let quietWorkingCandidate: HeatmapCell | null = null;
  let quietFallbackCandidate: HeatmapCell | null = null;

  const heatmapDays: HeatmapDayRow[] = WEEKDAYS_MON_FIRST.map((day) => {
    const cells: HeatmapCell[] = HEATMAP_HOURS.map((hour) => {
      const key = `${day.dayOfWeek}:${hour}`;
      const count = heatmapCounts.get(key) ?? 0;
      const cell: HeatmapCell = {
        dayOfWeek: day.dayOfWeek,
        dayShort: day.dayShort,
        dayLabel: day.dayLabel,
        hour,
        hourLabel: formatHourLabel(hour),
        count,
        level: computeHeatmapLevel(count, maxHeatmapCount),
      };

      if (count > 0 && (!peakSlot || count > peakSlot.count)) {
        peakSlot = cell;
      }

      if (workingSlotKeys.has(key)) {
        if (!quietWorkingCandidate || count < quietWorkingCandidate.count) {
          quietWorkingCandidate = cell;
        }
      }

      if (day.dayOfWeek !== 0 && hour >= 10 && hour <= 19) {
        if (!quietFallbackCandidate || count < quietFallbackCandidate.count) {
          quietFallbackCandidate = cell;
        }
      }

      return cell;
    });

    return {
      dayOfWeek: day.dayOfWeek,
      dayShort: day.dayShort,
      dayLabel: day.dayLabel,
      cells,
    };
  });

  const heatmap: DemandHeatmap = {
    hours: [...HEATMAP_HOURS],
    days: heatmapDays,
    maxCount: maxHeatmapCount,
    totalBookings: heatmapTotalBookings,
    peakSlot,
    quietSlot:
      heatmapTotalBookings > 0
        ? (quietWorkingCandidate ?? quietFallbackCandidate)
        : null,
  };

  const serviceNameById = new Map<string, string>();
  for (const srv of input.services) {
    serviceNameById.set(srv.id, srv.name);
  }

  const serviceBuckets = new Map<
    string,
    { serviceId: string; serviceName: string; bookingsCount: number; revenueCents: number; totalMinutes: number }
  >();

  for (const booking of periodBookings) {
    if (booking.status !== 'completed' && booking.status !== 'confirmed') continue;
    const paid = paidByBookingId.get(booking.id) ?? 0;
    const attributedRevenue =
      booking.status === 'completed'
        ? paid > 0
          ? paid
          : Math.max(0, Math.round(booking.totalPriceCents))
        : Math.max(0, Math.round(booking.totalPriceCents));
    const duration = Math.max(0, Math.round(booking.totalDurationMinutes));

    const existing = serviceBuckets.get(booking.serviceId) ?? {
      serviceId: booking.serviceId,
      serviceName: serviceNameById.get(booking.serviceId) ?? 'Servicio',
      bookingsCount: 0,
      revenueCents: 0,
      totalMinutes: 0,
    };

    existing.bookingsCount += 1;
    existing.revenueCents += attributedRevenue;
    existing.totalMinutes += duration;
    serviceBuckets.set(booking.serviceId, existing);
  }

  const serviceProfitability: ServiceProfitabilityRow[] = Array.from(serviceBuckets.values())
    .map((bucket) => ({
      serviceId: bucket.serviceId,
      serviceName: bucket.serviceName,
      bookingsCount: bucket.bookingsCount,
      revenueCents: bucket.revenueCents,
      totalMinutes: bucket.totalMinutes,
      revenuePerMinuteCents:
        bucket.totalMinutes > 0
          ? Math.round(bucket.revenueCents / bucket.totalMinutes)
          : 0,
    }))
    .toSorted(
      (a, b) =>
        b.revenuePerMinuteCents - a.revenuePerMinuteCents ||
        b.revenueCents - a.revenueCents ||
        a.serviceName.localeCompare(b.serviceName, 'es'),
    );

  const reasonBuckets = new Map<string, { reason: string; count: number }>();
  for (const booking of periodBookings) {
    if (booking.status !== 'canceled') continue;
    const raw = (booking.cancellationReason ?? '').trim();
    const display = raw.length > 0 ? raw : 'Sin motivo especificado';
    const key = display.toLowerCase();
    const bucket = reasonBuckets.get(key);
    if (bucket) {
      bucket.count += 1;
    } else {
      reasonBuckets.set(key, { reason: display, count: 1 });
    }
  }

  const cancellationReasons: CancellationReasonRow[] = Array.from(reasonBuckets.values())
    .map((bucket) => ({
      reason: bucket.reason,
      count: bucket.count,
      sharePercent:
        canceledCount > 0 ? Math.round((bucket.count / canceledCount) * 100) : 0,
    }))
    .toSorted(
      (a, b) => b.count - a.count || a.reason.localeCompare(b.reason, 'es'),
    );

  const funnel = buildFunnelSummary(
    scopeId ? [] : (input.funnelEvents ?? []),
    input.period,
    nowMs,
    tz,
  );

  return {
    period: input.period,
    rangeStartDate,
    rangeEndDate,
    summary,
    specialistOccupancy,
    heatmap,
    serviceProfitability,
    cancellationReasons,
    funnel,
  };
}
