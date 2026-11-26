import type {
  AvailabilitySchedule,
  BookingWithRelations,
  RecurringBlock,
  StaffMember,
} from '@/lib/types';
import { formatDateShortInTimezone, getDateKeyInTimezone } from '@/lib/format';

const TIMELINE_HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20] as const;

interface WeekScheduleDay {
  dateKey: string;
  label: string;
  items: BookingWithRelations[];
}

interface TimelineStaffCell {
  staff: StaffMember;
  colorIdx: number;
  bookings: BookingWithRelations[];
  fixedTimes: string[];
  blocks: RecurringBlock[];
}

interface TimelineHourRow {
  hour: number;
  hourLabel: string;
  hasFixedAtHour: boolean;
  hasBlockAtHour: boolean;
  isQuietHour: boolean;
  cells: TimelineStaffCell[];
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

function getLocalHourInTimezone(iso: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const raw = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  return raw === 24 ? 0 : raw;
}

function parseTimeMinutes(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 60 + m;
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

function doesBlockOverlapHour(block: RecurringBlock, hour: number): boolean {
  const startMin = parseTimeMinutes(block.startTime);
  const endMin = parseTimeMinutes(block.endTime);
  const hourStart = hour * 60;
  const hourEnd = (hour + 1) * 60;
  return startMin < hourEnd && endMin > hourStart;
}

export function buildWeekScheduleDays(
  bookings: readonly BookingWithRelations[],
  todayKey: string,
  timezone: string,
): WeekScheduleDay[] {
  const tomorrowKey = shiftDateKey(todayKey, 1);
  return Array.from({ length: 7 }, (_, idx) => {
    const key = shiftDateKey(todayKey, idx);
    const dayItems = bookings
      .filter((b) => getDateKeyInTimezone(new Date(b.startAt), timezone) === key)
      .toSorted((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    const prefix = key === todayKey ? 'Hoy · ' : key === tomorrowKey ? 'Mañana · ' : '';
    return {
      dateKey: key,
      label: `${prefix}${formatDateShortInTimezone(`${key}T18:00:00Z`, timezone)}`,
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

export function buildTimelineHourRows(params: {
  dayBookings: readonly BookingWithRelations[];
  activeStaff: readonly StaffMember[];
  allStaffColorIndex: ReadonlyMap<string, number>;
  fixedTimesByStaff: ReadonlyMap<string, string[]>;
  activeBlocksByStaff: ReadonlyMap<string, RecurringBlock[]>;
  timezone: string;
  showQuietHours: boolean;
}): TimelineHourRow[] {
  const {
    dayBookings,
    activeStaff,
    allStaffColorIndex,
    fixedTimesByStaff,
    activeBlocksByStaff,
    timezone,
    showQuietHours,
  } = params;

  const rows: TimelineHourRow[] = [];

  for (const hour of TIMELINE_HOURS) {
    const bookingsAtHour = dayBookings.filter(
      (b) => getLocalHourInTimezone(b.startAt, timezone) === hour,
    );
    const hasFixedAtHour = activeStaff.some((st) =>
      (fixedTimesByStaff.get(st.id) ?? []).some((t) => Number(t.slice(0, 2)) === hour),
    );
    const hasBlockAtHour = activeStaff.some((st) =>
      (activeBlocksByStaff.get(st.id) ?? []).some((blk) => doesBlockOverlapHour(blk, hour)),
    );
    const isQuietHour = bookingsAtHour.length === 0 && !hasFixedAtHour && !hasBlockAtHour;

    if (isQuietHour && !showQuietHours) {
      continue;
    }

    const cells: TimelineStaffCell[] = activeStaff.map((st) => ({
      staff: st,
      colorIdx: allStaffColorIndex.get(st.id) ?? 0,
      bookings: bookingsAtHour.filter((b) => b.staffId === st.id),
      fixedTimes: (fixedTimesByStaff.get(st.id) ?? []).filter(
        (t) => Number(t.slice(0, 2)) === hour,
      ),
      blocks: (activeBlocksByStaff.get(st.id) ?? []).filter((blk) =>
        doesBlockOverlapHour(blk, hour),
      ),
    }));

    rows.push({
      hour,
      hourLabel: `${String(hour).padStart(2, '0')}:00`,
      hasFixedAtHour,
      hasBlockAtHour,
      isQuietHour,
      cells,
    });
  }

  return rows;
}
