'use client';

import type { ReactNode } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { DayAvailabilitySummary } from '@/lib/availability/engine';
import { formatDateLongInTimezone } from '@/lib/format';

export type ScheduleLayout = 'month' | 'week';

export interface MonthGridCell {
  date: string;
  day: number;
  isInMonth: boolean;
  isMonthStart: boolean;
}

const WEEKDAY_LABELS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'] as const;
const monthNameFormatter = new Intl.DateTimeFormat('es-MX', { month: 'long', timeZone: 'UTC' });
const monthShortFormatter = new Intl.DateTimeFormat('es-MX', { month: 'short', timeZone: 'UTC' });

function toKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day, 12, 0, 0));
}

export function monthStartKey(dateKey: string): string {
  return `${dateKey.slice(0, 7)}-01`;
}

export function previousMonthStartKey(dateKey: string): string {
  const [year = 2026, month = 1] = dateKey.split('-').map(Number);
  return toKey(utcDate(year, month - 2, 1));
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

interface ScheduleCalendarViewProps {
  timezone: string;
  todayKey: string;
  selectedDate: string;
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
  const cells = buildMonthGrid(selectedDate);
  const [year = 2026, month = 1] = selectedDate.split('-').map(Number);
  const monthDate = utcDate(year, month - 1, 1);
  const canGoBack = monthStartKey(selectedDate) > monthStartKey(todayKey);
  const loadedEnd = availabilityDays[availabilityDays.length - 1]?.date ?? '';
  const controlsDisabled = loadingAvail || isBusy;

  return (
    <VStack className="rb-cal-layout">
      <VStack
        gap={3}
        className="rb-cal fx-busy"
        data-busy={loadingAvail ? 'true' : 'false'}
        aria-busy={loadingAvail ? 'true' : 'false'}
      >
        <HStack justify="between" align="center" gap={2}>
          <Text weight="bold" className="rb-cal-title">
            <Text color="inherit" weight="bold" className="rb-first-upper">
              {monthNameFormatter.format(monthDate)}
            </Text>{' '}
            <Text color="secondary" weight="normal">
              {year}
            </Text>
          </Text>
          <HStack gap={1} align="center">
            <button
              type="button"
              className="rb-cal-nav fx-press"
              aria-label="Mes anterior"
              disabled={!canGoBack || controlsDisabled}
              onClick={() => {
                const previous = previousMonthStartKey(selectedDate);
                onSelectDate(previous < todayKey ? todayKey : previous);
              }}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="rb-cal-nav fx-press"
              aria-label="Mes siguiente"
              disabled={!canAdvanceMonth || controlsDisabled}
              onMouseEnter={onPrefetchNextMonth}
              onFocus={onPrefetchNextMonth}
              onClick={onAdvanceMonth}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </HStack>
        </HStack>

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
      </VStack>

      <VStack gap={3} className="rb-times-col" aria-busy={loadingAvail ? 'true' : 'false'}>
        {children}
      </VStack>
    </VStack>
  );
}
