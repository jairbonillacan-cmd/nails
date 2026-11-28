'use client';

import type { ReactNode } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Calendar, CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import type { DayAvailabilitySummary } from '@/lib/availability/engine';
import { formatDateLongInTimezone } from '@/lib/format';

export type ScheduleLayout = 'month' | 'week';

export interface MonthGridCell {
  date: string;
  day: number;
  isInMonth: boolean;
  isMonthStart: boolean;
}

export interface WeekStripDay {
  date: string;
  day: number;
  weekdayLabel: string;
  monthShortLabel: string;
  isMonthStart: boolean;
}

const WEEKDAY_LABELS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'] as const;
const monthNameFormatter = new Intl.DateTimeFormat('es-MX', { month: 'long', timeZone: 'UTC' });
const monthShortFormatter = new Intl.DateTimeFormat('es-MX', { month: 'short', timeZone: 'UTC' });
const DAY_MS = 86_400_000;

function toKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day, 12, 0, 0));
}

function parseDateKeyUtc(dateKey: string): Date {
  const [year = 2026, month = 1, day = 1] = dateKey.split('-').map(Number);
  return utcDate(year, month - 1, day);
}

export function shiftCalendarDateKey(dateKey: string, deltaDays: number): string {
  const base = parseDateKeyUtc(dateKey);
  return toKey(new Date(base.getTime() + deltaDays * DAY_MS));
}

export function monthStartKey(dateKey: string): string {
  return `${dateKey.slice(0, 7)}-01`;
}

export function previousMonthStartKey(dateKey: string): string {
  const [year = 2026, month = 1] = dateKey.split('-').map(Number);
  return toKey(utcDate(year, month - 2, 1));
}

export function getWeekRangeStart(selectedDate: string, todayKey: string): string {
  if (!selectedDate || selectedDate <= todayKey) return todayKey;
  const diffDays = Math.max(
    0,
    Math.floor((parseDateKeyUtc(selectedDate).getTime() - parseDateKeyUtc(todayKey).getTime()) / DAY_MS),
  );
  const pageIndex = Math.floor(diffDays / 7);
  return shiftCalendarDateKey(todayKey, pageIndex * 7);
}

export function canNavigatePreviousWeek(weekStart: string, todayKey: string): boolean {
  return weekStart > todayKey;
}

export function buildWeekStrip(params: {
  anchorDate: string;
  todayKey: string;
  daysCount?: number;
}): WeekStripDay[] {
  const count = Math.max(1, Math.min(14, params.daysCount ?? 7));
  const startKey = getWeekRangeStart(params.anchorDate, params.todayKey);
  const days: WeekStripDay[] = [];
  for (let offset = 0; offset < count; offset += 1) {
    const key = shiftCalendarDateKey(startKey, offset);
    const dt = parseDateKeyUtc(key);
    const dayNum = dt.getUTCDate();
    days.push({
      date: key,
      day: dayNum,
      weekdayLabel: WEEKDAY_LABELS[dt.getUTCDay()] ?? 'LUN',
      monthShortLabel: monthShortFormatter.format(dt).replace('.', '').toUpperCase(),
      isMonthStart: dayNum === 1,
    });
  }
  return days;
}

export function buildMonthGrid(dateKey: string): MonthGridCell[] {
  const [year = 2026, month = 1] = dateKey.split('-').map(Number);
  const first = utcDate(year, month - 1, 1);
  const daysInMonth = utcDate(year, month, 0).getUTCDate();
  const leading = first.getUTCDay();
  const cells: MonthGridCell[] = [];
  for (let i = 0; i < leading; i += 1) {
    const d = utcDate(year, month - 1, i - leading + 1);
    cells.push({ date: toKey(d), day: d.getUTCDate(), isInMonth: false, isMonthStart: false });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ date: toKey(utcDate(year, month - 1, day)), day, isInMonth: true, isMonthStart: day === 1 });
  }
  let trailing = 1;
  while (cells.length % 7 !== 0) {
    const d = utcDate(year, month, trailing);
    cells.push({ date: toKey(d), day: trailing, isInMonth: false, isMonthStart: trailing === 1 });
    trailing += 1;
  }
  return cells;
}

function formatWeekTitle(days: readonly WeekStripDay[]): { primary: string; yearLabel: string } {
  const first = days[0];
  const last = days[days.length - 1] ?? first;
  if (!first || !last) return { primary: '', yearLabel: '' };
  const firstDate = parseDateKeyUtc(first.date);
  const lastDate = parseDateKeyUtc(last.date);
  const firstYear = firstDate.getUTCFullYear();
  const lastYear = lastDate.getUTCFullYear();
  if (firstDate.getUTCMonth() === lastDate.getUTCMonth() && firstYear === lastYear) {
    return { primary: monthNameFormatter.format(firstDate), yearLabel: String(firstYear) };
  }
  const firstShort = monthShortFormatter.format(firstDate).replace('.', '');
  const lastShort = monthShortFormatter.format(lastDate).replace('.', '');
  return {
    primary: `${firstShort} – ${lastShort}`,
    yearLabel: firstYear === lastYear ? String(firstYear) : `${firstYear}/${String(lastYear).slice(-2)}`,
  };
}

function pickFirstAvailableOrFallback(
  startDate: string,
  daysCount: number,
  availableDateSet: ReadonlySet<string>,
): string {
  for (let offset = 0; offset < daysCount; offset += 1) {
    const candidate = shiftCalendarDateKey(startDate, offset);
    if (availableDateSet.has(candidate)) return candidate;
  }
  return startDate;
}

interface ScheduleCalendarViewProps {
  timezone: string;
  todayKey: string;
  selectedDate: string;
  layout?: ScheduleLayout;
  canSwitchLayout?: boolean;
  onChangeLayout?: (layout: ScheduleLayout) => void;
  availabilityDays: DayAvailabilitySummary[];
  availableDateSet: Set<string>;
  isBusy: boolean;
  loadingAvail: boolean;
  canAdvanceMonth: boolean;
  onSelectDate: (date: string) => void;
  onAdvanceMonth: () => void;
  onPrefetchNextMonth?: () => void;
  children: ReactNode;
}

export function ScheduleCalendarView({
  timezone,
  todayKey,
  selectedDate,
  layout = 'month',
  canSwitchLayout = false,
  onChangeLayout,
  availabilityDays,
  availableDateSet,
  isBusy,
  loadingAvail,
  canAdvanceMonth,
  onSelectDate,
  onAdvanceMonth,
  onPrefetchNextMonth,
  children,
}: ScheduleCalendarViewProps) {
  const isWeekLayout = layout === 'week';
  const cells = isWeekLayout ? [] : buildMonthGrid(selectedDate);
  const weekDays = isWeekLayout
    ? buildWeekStrip({ anchorDate: selectedDate, todayKey, daysCount: 7 })
    : [];
  const weekStart = weekDays[0]?.date ?? todayKey;
  const nextWeekStart = shiftCalendarDateKey(weekStart, 7);
  const prevWeekStart = shiftCalendarDateKey(weekStart, -7);
  const [year = 2026, month = 1] = selectedDate.split('-').map(Number);
  const monthDate = utcDate(year, month - 1, 1);
  const loadedEnd = availabilityDays[availabilityDays.length - 1]?.date ?? '';
  const canGoBackMonth = monthStartKey(selectedDate) > monthStartKey(todayKey);
  const canGoBackWeek = canNavigatePreviousWeek(weekStart, todayKey);
  const nextWeekNeedsFetch = Boolean(loadedEnd) && nextWeekStart > loadedEnd;
  const canGoNextWeek = !nextWeekNeedsFetch || canAdvanceMonth;
  const controlsDisabled = loadingAvail || isBusy;
  const weekTitle = isWeekLayout ? formatWeekTitle(weekDays) : null;

  const handlePrevPeriod = () => {
    if (isWeekLayout) {
      const clampedStart = prevWeekStart < todayKey ? todayKey : prevWeekStart;
      onSelectDate(pickFirstAvailableOrFallback(clampedStart, 7, availableDateSet));
      return;
    }
    const previous = previousMonthStartKey(selectedDate);
    onSelectDate(previous < todayKey ? todayKey : previous);
  };

  const handleNextPeriod = () => {
    if (isWeekLayout) {
      if (nextWeekNeedsFetch) {
        onAdvanceMonth();
        return;
      }
      onSelectDate(pickFirstAvailableOrFallback(nextWeekStart, 7, availableDateSet));
      return;
    }
    onAdvanceMonth();
  };

  return (
    <VStack className="rb-cal-layout" data-layout={layout}>
      <VStack
        gap={isWeekLayout ? 2 : 3}
        className="rb-cal fx-busy"
        data-layout={layout}
        data-busy={loadingAvail ? 'true' : 'false'}
        aria-busy={loadingAvail ? 'true' : 'false'}
      >
        <HStack justify="between" align="center" gap={2} wrap="wrap">
          <Text weight="bold" className="rb-cal-title">
            <Text color="inherit" weight="bold" className="rb-first-upper">
              {isWeekLayout && weekTitle ? weekTitle.primary : monthNameFormatter.format(monthDate)}
            </Text>{' '}
            <Text color="secondary" weight="normal">
              {isWeekLayout && weekTitle ? weekTitle.yearLabel : year}
            </Text>
          </Text>
          <HStack gap={1} align="center">
            {canSwitchLayout && onChangeLayout ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rb-layout-toggle fx-press"
                label={isWeekLayout ? 'Ver mes' : 'Ver semana'}
                icon={
                  isWeekLayout ? (
                    <Calendar size={14} aria-hidden="true" />
                  ) : (
                    <CalendarRange size={14} aria-hidden="true" />
                  )
                }
                isDisabled={controlsDisabled}
                onClick={() => onChangeLayout(isWeekLayout ? 'month' : 'week')}
              />
            ) : null}
            <button
              type="button"
              className="rb-cal-nav fx-press"
              aria-label={isWeekLayout ? 'Semana anterior' : 'Mes anterior'}
              disabled={(isWeekLayout ? !canGoBackWeek : !canGoBackMonth) || controlsDisabled}
              onClick={handlePrevPeriod}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="rb-cal-nav fx-press"
              aria-label={isWeekLayout ? 'Semana siguiente' : 'Mes siguiente'}
              disabled={(isWeekLayout ? !canGoNextWeek : !canAdvanceMonth) || controlsDisabled}
              onMouseEnter={nextWeekNeedsFetch || !isWeekLayout ? onPrefetchNextMonth : undefined}
              onFocus={nextWeekNeedsFetch || !isWeekLayout ? onPrefetchNextMonth : undefined}
              onClick={handleNextPeriod}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </HStack>
        </HStack>

        {isWeekLayout ? (
          <ol className="rb-cal-grid rb-week-grid" aria-label="Días de la semana">
            {weekDays.map((cell) => {
              const isAvailable = availableDateSet.has(cell.date);
              const isSelected = cell.date === selectedDate;
              const isPast = cell.date < todayKey;
              const state = isSelected ? 'selected' : isAvailable && !isPast ? 'available' : 'off';
              return (
                <li key={cell.date} className="rb-week-cell">
                  <button
                    type="button"
                    className="rb-cal-day rb-week-day fx-press fx-tabular"
                    data-state={state}
                    data-today={cell.date === todayKey ? 'true' : 'false'}
                    aria-pressed={isSelected}
                    aria-label={`${formatDateLongInTimezone(`${cell.date}T18:00:00Z`, timezone)}${
                      state === 'off' ? ', sin lugares' : ''
                    }`}
                    disabled={state === 'off' || isBusy}
                    onClick={() => onSelectDate(cell.date)}
                  >
                    <Text color="inherit" className="rb-week-wd">
                      {cell.isMonthStart ? cell.monthShortLabel : cell.weekdayLabel}
                    </Text>
                    <Text color="inherit" weight={state === 'off' ? 'normal' : 'bold'} hasTabularNumbers>
                      {cell.day}
                    </Text>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <>
            <ol className="rb-cal-grid" aria-hidden="true">
              {WEEKDAY_LABELS.map((label) => (
                <li key={label} className="rb-cal-wd">
                  {label}
                </li>
              ))}
            </ol>

            <ol className="rb-cal-grid" aria-label="Días del mes">
              {cells.map((cell) => {
                const isAvailable = availableDateSet.has(cell.date);
                const isSelected = cell.date === selectedDate;
                const isPast = cell.date < todayKey;
                const isLoaded = cell.date <= loadedEnd;
                const showCell = cell.isInMonth || (cell.date > selectedDate && isLoaded);
                if (!showCell) {
                  return <li key={cell.date} className="rb-cal-cell" aria-hidden="true" />;
                }
                const state = isSelected ? 'selected' : isAvailable && !isPast ? 'available' : 'off';
                return (
                  <li key={cell.date} className="rb-cal-cell">
                    <button
                      type="button"
                      className="rb-cal-day fx-press fx-tabular"
                      data-state={state}
                      data-today={cell.date === todayKey ? 'true' : 'false'}
                      aria-pressed={isSelected}
                      aria-label={`${formatDateLongInTimezone(`${cell.date}T18:00:00Z`, timezone)}${
                        state === 'off' ? ', sin lugares' : ''
                      }`}
                      disabled={state === 'off' || isBusy}
                      onClick={() => onSelectDate(cell.date)}
                    >
                      {cell.isMonthStart && !cell.isInMonth ? (
                        <Text color="inherit" className="rb-cal-mon">
                          {monthShortFormatter.format(utcDate(year, month, 1)).replace('.', '').toUpperCase()}
                        </Text>
                      ) : null}
                      <Text color="inherit" weight={state === 'off' ? 'normal' : 'bold'} hasTabularNumbers>
                        {cell.day}
                      </Text>
                    </button>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </VStack>

      <VStack gap={3} className="rb-times-col" aria-busy={loadingAvail ? 'true' : 'false'}>
        {children}
      </VStack>
    </VStack>
  );
}
