import type {
  AvailabilitySchedule,
  BookingWithRelations,
  RecurringBlock,
  StaffMember,
} from '@/lib/types';
import { formatDateShortInTimezone, getDateKeyInTimezone } from '@/lib/format';

const CALENDAR_START_HOUR = 9;
const CALENDAR_END_HOUR = 20;
export const CALENDAR_START_MIN = CALENDAR_START_HOUR * 60;
export const CALENDAR_END_MIN = CALENDAR_END_HOUR * 60;
const CALENDAR_TOTAL_MIN = CALENDAR_END_MIN - CALENDAR_START_MIN;
export const CALENDAR_HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19] as const;

interface WeekScheduleDay {
  dateKey: string;
  label: string;
  shortDay: string;
  dayNum: string;
  isToday: boolean;
  items: BookingWithRelations[];
}

export interface CalendarOpenSlot {
  timeHHMM: string;
  startMinutes: number;
  durationMinutes: number;
  topPct: number;
  heightPct: number;
  isFixedTurn: boolean;
}

export interface CalendarNowIndicator {
  visible: boolean;
  topPct: number;
  label: string;
}

export function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [y = 2026, m = 1, d = 1] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

export function getDayOfWeekFromDateKey(dateKey: string): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  const [y = 2026, m = 1, d = 1] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay() as
    | 0
    | 1
    | 2
    | 3
    | 4
    | 5
    | 6;
}

export function getLocalMinutesInTimezone(iso: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const rawHour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

export function formatMinutesHHMM(totalMinutes: number): string {
  const safe = Math.max(0, Math.min(24 * 60 - 1, Math.round(totalMinutes)));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function parseTimeMinutes(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function getTimezoneOffsetMinutesAtUtc(utcMs: number, timeZone: string): number {
  const dt = new Date(utcMs);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(dt);
  const year = Number(parts.find((p) => p.type === 'year')?.value ?? '2026');
  const month = Number(parts.find((p) => p.type === 'month')?.value ?? '1');
  const day = Number(parts.find((p) => p.type === 'day')?.value ?? '1');
  const rawHour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const second = Number(parts.find((p) => p.type === 'second')?.value ?? '0');
  const asUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  return Math.round((asUtcMs - utcMs) / 60_000);
}

export function buildZonedIsoForDateAndMinutes(
  dateKey: string,
  totalMinutes: number,
  timeZone: string,
): string {
  const [y = 2026, m = 1, d = 1] = dateKey.split('-').map(Number);
  const h = Math.floor(totalMinutes / 60);
  const min = totalMinutes % 60;
  const wallAsUtcMs = Date.UTC(y, m - 1, d, h, min, 0);
  const firstOffset = getTimezoneOffsetMinutesAtUtc(wallAsUtcMs, timeZone);
  const firstGuessMs = wallAsUtcMs - firstOffset * 60_000;
  const refinedOffset = getTimezoneOffsetMinutesAtUtc(firstGuessMs, timeZone);
  return new Date(wallAsUtcMs - refinedOffset * 60_000).toISOString();
}

export function computeBlockGeometryPercent(
  startMinutes: number,
  durationMinutes: number,
): { topPct: number; heightPct: number } {
  const clampedStart = Math.max(CALENDAR_START_MIN, Math.min(CALENDAR_END_MIN - 15, startMinutes));
  const clampedEnd = Math.max(
    clampedStart + 15,
    Math.min(CALENDAR_END_MIN, startMinutes + Math.max(15, durationMinutes)),
  );
  const topPct = ((clampedStart - CALENDAR_START_MIN) / CALENDAR_TOTAL_MIN) * 100;
  const heightPct = ((clampedEnd - clampedStart) / CALENDAR_TOTAL_MIN) * 100;
  return {
    topPct: Number(topPct.toFixed(3)),
    heightPct: Number(heightPct.toFixed(3)),
  };
}

export function computeNowIndicator(
  nowMs: number,
  dateKey: string,
  todayKey: string,
  timeZone: string,
): CalendarNowIndicator {
  if (!nowMs || dateKey !== todayKey) {
    return { visible: false, topPct: 0, label: '' };
  }
  const nowMinutes = getLocalMinutesInTimezone(new Date(nowMs).toISOString(), timeZone);
  if (nowMinutes < CALENDAR_START_MIN || nowMinutes > CALENDAR_END_MIN) {
    return { visible: false, topPct: 0, label: '' };
  }
  const topPct = ((nowMinutes - CALENDAR_START_MIN) / CALENDAR_TOTAL_MIN) * 100;
  return {
    visible: true,
    topPct: Number(topPct.toFixed(3)),
    label: formatMinutesHHMM(nowMinutes),
  };
}

function doesRecurringBlockApplyOnDate(
  block: RecurringBlock,
  dateKey: string,
  dow: number,
): boolean {
  if (!block.isActive) return false;
  if (block.untilDate && dateKey > block.untilDate) return false;
  if (block.frequency === 'weekly') {
    return block.weekdays.includes(dow);
  }
  const dayOfMonth = Number(dateKey.slice(8, 10));
  return block.dayOfMonth === dayOfMonth;
}

export function buildStaffOpenSlots(params: {
  fixedTimes: readonly string[];
  staffBookings: readonly BookingWithRelations[];
  staffBlocks: readonly RecurringBlock[];
  timezone: string;
}): CalendarOpenSlot[] {
  const { fixedTimes, staffBookings, staffBlocks, timezone } = params;
  const busyIntervals: Array<{ start: number; end: number }> = [];

  for (const booking of staffBookings) {
    if (booking.status === 'canceled' || booking.status === 'no_show') continue;
    const start = getLocalMinutesInTimezone(booking.startAt, timezone);
    const end = start + Math.max(15, booking.totalDurationMinutes);
    busyIntervals.push({ start, end });
  }
  for (const blk of staffBlocks) {
    busyIntervals.push({
      start: parseTimeMinutes(blk.startTime),
      end: parseTimeMinutes(blk.endTime),
    });
  }

  const isFree = (startMin: number, durationMin: number) =>
    !busyIntervals.some(
      (interval) => interval.start < startMin + durationMin && interval.end > startMin,
    );

  const slots: CalendarOpenSlot[] = [];
  const usedStarts = new Set<number>();

  for (const hhmm of fixedTimes) {
    const startMin = parseTimeMinutes(hhmm);
    if (startMin < CALENDAR_START_MIN || startMin >= CALENDAR_END_MIN) continue;
    const duration = 90;
    if (isFree(startMin, 45)) {
      const geo = computeBlockGeometryPercent(startMin, duration);
      slots.push({
        timeHHMM: hhmm,
        startMinutes: startMin,
        durationMinutes: duration,
        topPct: geo.topPct,
        heightPct: geo.heightPct,
        isFixedTurn: true,
      });
      usedStarts.add(startMin);
    }
  }

  if (slots.length === 0) {
    for (const hour of CALENDAR_HOURS) {
      const startMin = hour * 60;
      if (usedStarts.has(startMin)) continue;
      if (isFree(startMin, 60)) {
        const geo = computeBlockGeometryPercent(startMin, 60);
        slots.push({
          timeHHMM: formatMinutesHHMM(startMin),
          startMinutes: startMin,
          durationMinutes: 60,
          topPct: geo.topPct,
          heightPct: geo.heightPct,
          isFixedTurn: false,
        });
      }
    }
  }

  return slots;
}

export function buildWeekScheduleDays(
  bookings: readonly BookingWithRelations[],
  anchorDateKey: string,
  timezone: string,
  todayKey = anchorDateKey,
): WeekScheduleDay[] {
  const tomorrowKey = shiftDateKey(todayKey, 1);
  const shortWeekdayFmt = new Intl.DateTimeFormat('es-MX', {
    timeZone: timezone,
    weekday: 'short',
  });
  return Array.from({ length: 7 }, (_, idx) => {
    const key = shiftDateKey(anchorDateKey, idx);
    const dayItems = bookings
      .filter((b) => getDateKeyInTimezone(new Date(b.startAt), timezone) === key)
      .toSorted((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    const prefix = key === todayKey ? 'Hoy · ' : key === tomorrowKey ? 'Mañana · ' : '';
    const sampleDate = new Date(`${key}T18:00:00Z`);
    const shortDay = shortWeekdayFmt.format(sampleDate).replace(/\.$/, '');
    const dayNum = String(Number(key.slice(8, 10)));
    return {
      dateKey: key,
      label: `${prefix}${formatDateShortInTimezone(`${key}T18:00:00Z`, timezone)}`,
      shortDay,
      dayNum,
      isToday: key === todayKey,
      items: dayItems,
    };
  });
}

export function buildActiveBlocksByStaff(
  activeStaff: readonly StaffMember[],
  recurringBlocks: readonly RecurringBlock[],
  dateKey: string,
  dow: number,
): Map<string, RecurringBlock[]> {
  const map = new Map<string, RecurringBlock[]>();
  for (const st of activeStaff) {
    map.set(
      st.id,
      recurringBlocks.filter(
        (b) => b.staffId === st.id && doesRecurringBlockApplyOnDate(b, dateKey, dow),
      ),
    );
  }
  return map;
}

export function buildFixedTimesByStaff(
  activeStaff: readonly StaffMember[],
  schedules: readonly AvailabilitySchedule[],
  dow: number,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const st of activeStaff) {
    const sched = schedules.find((sc) => sc.staffId === st.id && sc.isDefault);
    const times = (sched?.rules ?? [])
      .filter((r) => r.dayOfWeek === dow)
      .flatMap((r) => r.fixedStartTimes ?? [])
      .toSorted();
    map.set(st.id, Array.from(new Set(times)));
  }
  return map;
}
