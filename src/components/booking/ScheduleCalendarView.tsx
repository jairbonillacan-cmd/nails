'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Calendar, type ISODateString } from '@astryxdesign/core/Calendar';
import type { DayAvailabilitySummary } from '@/lib/availability/engine';
import { formatDateLongInTimezone } from '@/lib/format';

export type ScheduleLayout = 'month' | 'week';

interface ScheduleCalendarViewProps {
  layoutView: ScheduleLayout;
  timezone: string;
  todayKey: string;
  selectedDate: string;
  availabilityDays: DayAvailabilitySummary[];
  availableDateSet: Set<string>;
  isBusy: boolean;
  loadingAvail: boolean;
  canAdvanceMonth: boolean;
  isViewingFutureWindow: boolean;
  onSelectDate: (date: string) => void;
  onAdvanceMonth: () => void;
  onPrefetchNextMonth?: () => void;
  onReturnToToday: () => void;
  children: ReactNode;
}

const STRIP_DAYS = 21;
const SKELETON_DAY_KEYS = [0, 1, 2, 3, 4, 5, 6] as const;

const weekdayFormatter = new Intl.DateTimeFormat('es-MX', { weekday: 'short', timeZone: 'UTC' });
const monthFormatter = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function plainDate(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00Z`);
}

export function ScheduleCalendarView({
  layoutView,
  timezone,
  todayKey,
  selectedDate,
  availabilityDays,
  availableDateSet,
  isBusy,
  loadingAvail,
  canAdvanceMonth,
  isViewingFutureWindow,
  onSelectDate,
  onAdvanceMonth,
  onPrefetchNextMonth,
  onReturnToToday,
  children,
}: ScheduleCalendarViewProps) {
  const [isMonthOpen, setIsMonthOpen] = useState(false);
  const maxDateKey = availabilityDays[availabilityDays.length - 1]?.date;
  const stripDays = availabilityDays.slice(0, STRIP_DAYS);
  const monthLabel = monthFormatter.format(plainDate(selectedDate));
  const controlsDisabled = loadingAvail || isBusy;

  const calendar = (
    <Calendar
      mode="single"
      value={selectedDate as ISODateString}
      min={todayKey as ISODateString}
      max={maxDateKey as ISODateString | undefined}
      dateConstraints={[(date) => availableDateSet.has(date.toISOString().slice(0, 10))]}
      onChange={(value) => {
        if (typeof value === 'string') {
          onSelectDate(value);
          setIsMonthOpen(false);
        }
      }}
    />
  );

  const renderWindowButtons = (touchTarget: boolean) => (
    <>
      {isViewingFutureWindow ? (
        <Button
          label="Mes actual"
          variant="ghost"
          size="md"
          style={touchTarget ? { minHeight: '2.75rem' } : undefined}
          className="fx-press"
          isDisabled={controlsDisabled}
          onClick={onReturnToToday}
        />
      ) : null}
      {canAdvanceMonth ? (
        <Button
          label="Próximo mes"
          variant="ghost"
          size="md"
          style={touchTarget ? { minHeight: '2.75rem' } : undefined}
          className="fx-press"
          isDisabled={controlsDisabled}
          onMouseEnter={onPrefetchNextMonth}
          onFocus={onPrefetchNextMonth}
          onClick={onAdvanceMonth}
        />
      ) : null}
    </>
  );

  const strip = loadingAvail ? (
    <HStack
      gap={1}
      className="rb-scroll"
      data-fade="true"
      role="status"
      aria-busy="true"
      aria-label="Cargando días disponibles"
    >
      {SKELETON_DAY_KEYS.map((item) => (
        <VStack key={item} className="rb-day-skeleton fx-shimmer" aria-hidden="true" />
      ))}
    </HStack>
  ) : (
    <HStack gap={1} className="rb-scroll" data-fade="true" role="listbox" aria-label="Próximos días">
      {stripDays.map((day) => {
        const date = plainDate(day.date);
        const isOn = day.date === selectedDate;
        return (
          <button
            key={day.date}
            type="button"
            role="option"
            className="rb-day fx-press fx-tabular"
            aria-selected={isOn}
            disabled={!day.hasSlots || isBusy}
            aria-label={`${formatDateLongInTimezone(`${day.date}T18:00:00Z`, timezone)}, ${
              day.hasSlots ? `${day.slotCount} horarios` : 'sin lugares'
            }`}
            onClick={() => onSelectDate(day.date)}
          >
            <Text color="inherit" type="supporting" className="rb-day-wd">
              {weekdayFormatter.format(date).replace('.', '')}
            </Text>
            <Text color="inherit" weight="bold" size="xl" hasTabularNumbers>
              {date.getUTCDate()}
            </Text>
            <Text color="inherit" type="supporting" className="rb-day-count rb-d" hasTabularNumbers>
              {day.hasSlots ? `${day.slotCount} libres` : 'sin lugar'}
            </Text>
          </button>
        );
      })}
    </HStack>
  );

  return (
    <>
      <VStack gap={2} className="rb-m">
        <HStack justify="between" align="center" gap={2} wrap="wrap">
          <Text weight="bold" display="block" className="rb-first-upper">
            {monthLabel}
          </Text>
          <HStack gap={1.5} align="center" wrap="wrap">
            {renderWindowButtons(true)}
            <Button
              label={isMonthOpen ? 'Ocultar mes' : 'Ver mes'}
              variant="secondary"
              size="md"
              style={{ minHeight: '2.75rem' }}
              className="fx-press"
              aria-expanded={isMonthOpen}
              isDisabled={controlsDisabled}
              onClick={() => setIsMonthOpen((open) => !open)}
            />
          </HStack>
        </HStack>
        {isMonthOpen ? (
          <VStack
            align="center"
            className="fx-busy"
            data-busy={loadingAvail ? 'true' : 'false'}
            aria-busy={loadingAvail ? 'true' : 'false'}
          >
            {calendar}
          </VStack>
        ) : (
          strip
        )}
      </VStack>

      <HStack gap={6} align="start" className="rb-schedule">
        {layoutView === 'month' ? (
          <VStack
            className="rb-d rb-calendar fx-busy"
            gap={2}
            data-busy={loadingAvail ? 'true' : 'false'}
            aria-busy={loadingAvail ? 'true' : 'false'}
          >
            {calendar}
            <HStack gap={2} justify="center" wrap="wrap">
              {renderWindowButtons(false)}
            </HStack>
          </VStack>
        ) : null}

        <VStack gap={3} className="rb-grow" aria-busy={loadingAvail ? 'true' : 'false'}>
          {layoutView === 'week' ? (
            <VStack gap={2} className="rb-d">
              <HStack justify="between" align="center" gap={2} wrap="wrap">
                <Text type="supporting" weight="semibold" color="secondary" className="rb-first-upper">
                  {monthLabel}
                </Text>
                <HStack gap={1.5} align="center">
                  {renderWindowButtons(false)}
                </HStack>
              </HStack>
              {strip}
            </VStack>
          ) : null}
          {children}
        </VStack>
      </HStack>
    </>
  );
}
