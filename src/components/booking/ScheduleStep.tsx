'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Calendar, type ISODateString } from '@astryxdesign/core/Calendar';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import type { AvailableSlot, DayAvailabilitySummary, DayPeriod } from '@/lib/availability/engine';
import { formatDateLongInTimezone } from '@/lib/format';
import type { PublicSettingsDTO } from '@/lib/public-dto';

export type ScheduleLayout = 'month' | 'week';

interface ScheduleStepProps {
  settings: PublicSettingsDTO;
  layoutView: ScheduleLayout;
  timeFormat: '12h' | '24h';
  todayKey: string;
  selectedDate: string;
  availabilityDays: DayAvailabilitySummary[];
  availableDateSet: Set<string>;
  selectedDaySummary: DayAvailabilitySummary | null;
  selectedSlot: AvailableSlot | null;
  pinnedStaffName: string | null;
  isBusy: boolean;
  loadingAvail: boolean;
  canAdvanceMonth: boolean;
  isViewingFutureWindow: boolean;
  onChangeLayoutView: (view: ScheduleLayout) => void;
  onChangeTimeFormat: (format: '12h' | '24h') => void;
  onSelectDate: (date: string) => void;
  onSelectSlot: (slot: AvailableSlot) => void;
  onShowAllStaff: () => void;
  onRedirectStaff: (staffId: string) => void;
  onAdvanceMonth: () => void;
  onReturnToToday: () => void;
  onOpenWaitlist: () => void;
}

const PERIOD_LABELS: ReadonlyArray<{ period: DayPeriod; label: string }> = [
  { period: 'morning', label: 'Mañana' },
  { period: 'afternoon', label: 'Tarde' },
  { period: 'evening', label: 'Noche' },
];

const STRIP_DAYS = 21;

const weekdayFormatter = new Intl.DateTimeFormat('es-MX', { weekday: 'short', timeZone: 'UTC' });
const monthFormatter = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortDayFormatter = new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });

function plainDate(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00Z`);
}

function staffCountLabel(slot: AvailableSlot): string {
  const count = slot.availableStaffIds.length;
  return count === 1 ? '1 artista' : `${count} artistas`;
}

export function ScheduleStep({
  settings,
  layoutView,
  timeFormat,
  todayKey,
  selectedDate,
  availabilityDays,
  availableDateSet,
  selectedDaySummary,
  selectedSlot,
  pinnedStaffName,
  isBusy,
  loadingAvail,
  canAdvanceMonth,
  isViewingFutureWindow,
  onChangeLayoutView,
  onChangeTimeFormat,
  onSelectDate,
  onSelectSlot,
  onShowAllStaff,
  onRedirectStaff,
  onAdvanceMonth,
  onReturnToToday,
  onOpenWaitlist,
}: ScheduleStepProps) {
  const [isMonthOpen, setIsMonthOpen] = useState(false);
  const timezone = settings.timezone || 'America/Mexico_City';
  const slots = selectedDaySummary?.slots ?? [];
  const maxDateKey = availabilityDays[availabilityDays.length - 1]?.date;
  const stripDays = availabilityDays.slice(0, STRIP_DAYS);
  const isRangeEmpty =
    !loadingAvail && availabilityDays.length > 0 && availabilityDays.every((day) => day.slotCount === 0);
  const nextOpenDay = availabilityDays.find((day) => day.date > selectedDate && day.hasSlots) ?? null;
  const redirectStaffId = selectedDaySummary?.redirectStaffId ?? null;
  const redirectStaffName = selectedDaySummary?.redirectStaffName ?? null;
  const publicNote = selectedDaySummary?.publicNote?.trim() || null;
  const monthLabel = monthFormatter.format(plainDate(selectedDate));

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

  const strip = (
    <HStack gap={1} className="rb-scroll" role="listbox" aria-label="Próximos días">
      {stripDays.map((day) => {
        const date = plainDate(day.date);
        const isOn = day.date === selectedDate;
        return (
          <button
            key={day.date}
            type="button"
            role="option"
            className="rb-day"
            aria-selected={isOn}
            disabled={!day.hasSlots}
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
            <Text color="inherit" type="supporting" className="rb-day-count rb-d">
              {day.hasSlots ? `${day.slotCount} libres` : 'sin lugar'}
            </Text>
          </button>
        );
      })}
    </HStack>
  );

  return (
    <VStack gap={4} className="rb-enter">
      <HStack justify="between" align="end" wrap="wrap" gap={3}>
        <VStack gap={0.5}>
          <Heading level={2} className="lk-serif rb-h2">
            ¿Cuándo?
          </Heading>
          <Text color="secondary">
            Hora de Puebla · {pinnedStaffName ? `horarios de ${pinnedStaffName}` : 'horarios de todo el equipo'}
          </Text>
        </VStack>
        <HStack gap={2} wrap="wrap" align="center">
          <SegmentedControl
            label="Vista de calendario"
            size="sm"
            value={layoutView}
            onChange={(value) => onChangeLayoutView(value === 'week' ? 'week' : 'month')}
            className="rb-d"
          >
            <SegmentedControlItem value="month" label="Mes" />
            <SegmentedControlItem value="week" label="Semana" />
          </SegmentedControl>
          <SegmentedControl
            label="Formato de hora"
            size="sm"
            value={timeFormat}
            onChange={(value) => onChangeTimeFormat(value === '24h' ? '24h' : '12h')}
          >
            <SegmentedControlItem value="12h" label="12h" />
            <SegmentedControlItem value="24h" label="24h" />
          </SegmentedControl>
        </HStack>
      </HStack>

      {pinnedStaffName ? (
        <HStack justify="between" align="center" gap={2} wrap="wrap" className="rb-note">
          <Text>
            Estás viendo solo los horarios de <Text weight="semibold">{pinnedStaffName}</Text>.
          </Text>
          <Button label="Ver todo el equipo" variant="secondary" size="sm" onClick={onShowAllStaff} />
        </HStack>
      ) : null}

      {publicNote || redirectStaffId ? (
        <Banner
          status="info"
          title={publicNote ? 'Aviso del salón para esta fecha' : 'Horario especial en esta fecha'}
          description={
            publicNote ||
            (redirectStaffName
              ? `Revisa los horarios disponibles con ${redirectStaffName}.`
              : 'Prueba otra fecha disponible.')
          }
          endContent={
            redirectStaffId && redirectStaffName ? (
              <Button
                variant="primary"
                size="sm"
                label={`Ver horarios de ${redirectStaffName}`}
                onClick={() => onRedirectStaff(redirectStaffId)}
              />
            ) : undefined
          }
        />
      ) : null}

      {isRangeEmpty ? (
        <VStack gap={3} padding={5} className="rb-empty">
          <Text weight="bold">Sin lugares en estas fechas</Text>
          <Text color="secondary">
            Revisa el próximo mes o anótate en la lista de espera y te avisamos si se libera algo.
          </Text>
          <HStack gap={2} wrap="wrap">
            {canAdvanceMonth ? <Button label="Ver próximo mes" variant="primary" onClick={onAdvanceMonth} /> : null}
            <Button label="Lista de espera" variant="secondary" onClick={onOpenWaitlist} />
            {isViewingFutureWindow ? <Button label="Volver a hoy" variant="ghost" onClick={onReturnToToday} /> : null}
          </HStack>
        </VStack>
      ) : (
        <>
          <VStack gap={2} className="rb-m">
            <HStack justify="between" align="center">
              <Text weight="bold" display="block" className="rb-first-upper">
                {monthLabel}
              </Text>
              <Button
                label={isMonthOpen ? 'Ocultar mes' : 'Ver mes'}
                variant="secondary"
                size="sm"
                aria-expanded={isMonthOpen}
                onClick={() => setIsMonthOpen((open) => !open)}
              />
            </HStack>
            {isMonthOpen ? <VStack align="center">{calendar}</VStack> : strip}
          </VStack>

          <HStack gap={6} align="start" className="rb-schedule">
            {layoutView === 'month' ? (
              <VStack className="rb-d rb-calendar" gap={2}>
                {calendar}
                <HStack gap={2} justify="center" wrap="wrap">
                  {isViewingFutureWindow ? (
                    <Button label="Mes actual" variant="ghost" size="sm" onClick={onReturnToToday} />
                  ) : null}
                  {canAdvanceMonth ? (
                    <Button label="Próximo mes" variant="ghost" size="sm" onClick={onAdvanceMonth} />
                  ) : null}
                </HStack>
              </VStack>
            ) : null}

            <VStack gap={3} className="rb-grow">
              {layoutView === 'week' ? <VStack className="rb-d">{strip}</VStack> : null}
              <Text weight="bold" display="block" className="rb-first-upper">
                {formatDateLongInTimezone(`${selectedDate}T18:00:00Z`, timezone)}
              </Text>

              {loadingAvail ? (
                <ProgressBar label="Buscando horarios libres" isIndeterminate />
              ) : slots.length > 0 ? (
                <VStack gap={3}>
                  {PERIOD_LABELS.map(({ period, label }) => {
                    const periodSlots = slots.filter((slot) => slot.period === period);
                    if (periodSlots.length === 0) return null;
                    return (
                      <VStack key={period} gap={1.5}>
                        <Text type="supporting" color="secondary" weight="semibold">
                          {label}
                        </Text>
                        <ul className="rb-slots" aria-label={`Horarios de la ${label.toLowerCase()}`}>
                          {periodSlots.map((slot) => {
                            const time = timeFormat === '24h' ? slot.localTime24 : slot.localTime12;
                            const isOn =
                              selectedSlot?.startAt === slot.startAt &&
                              (pinnedStaffName ? selectedSlot.staffId === slot.staffId : true);
                            const who = pinnedStaffName ? null : staffCountLabel(slot);
                            return (
                              <li key={`${slot.staffId}-${slot.startAt}`}>
                                <button
                                  type="button"
                                  className="rb-slot"
                                  aria-pressed={isOn}
                                  disabled={isBusy}
                                  aria-label={`${time}${who ? `, ${who} libres` : ''}`}
                                  onClick={() => onSelectSlot(slot)}
                                >
                                  <Text color="inherit" weight="bold" hasTabularNumbers>
                                    {time}
                                  </Text>
                                  {who ? (
                                    <Text color="inherit" type="supporting" className="rb-slot-sub">
                                      {who}
                                    </Text>
                                  ) : null}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </VStack>
                    );
                  })}
                  <HStack justify="between" align="center" gap={2} wrap="wrap" className="rb-waitlist">
                    <Text type="supporting" color="secondary">
                      ¿No ves la hora que buscas?
                    </Text>
                    <Button label="Lista de espera" variant="ghost" size="sm" onClick={onOpenWaitlist} />
                  </HStack>
                </VStack>
              ) : (
                <VStack gap={3} padding={4} className="rb-empty">
                  <Text weight="bold">Sin lugares este día</Text>
                  {nextOpenDay ? (
                    <Text color="secondary">
                      El próximo con lugar es el {formatDateLongInTimezone(`${nextOpenDay.date}T18:00:00Z`, timezone)}.
                    </Text>
                  ) : null}
                  <HStack gap={2} wrap="wrap">
                    {nextOpenDay ? (
                      <Button
                        label={`Ir al ${shortDayFormatter.format(plainDate(nextOpenDay.date)).replace('.', '')}`}
                        variant="primary"
                        onClick={() => onSelectDate(nextOpenDay.date)}
                      />
                    ) : canAdvanceMonth ? (
                      <Button label="Ver próximo mes" variant="primary" onClick={onAdvanceMonth} />
                    ) : null}
                    <Button label="Lista de espera" variant="secondary" onClick={onOpenWaitlist} />
                  </HStack>
                </VStack>
              )}
            </VStack>
          </HStack>
        </>
      )}
    </VStack>
  );
}
