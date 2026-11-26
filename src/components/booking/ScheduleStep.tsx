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
  pinnedStaffSchedule: string | null;
  pendingSlotKey: string | null;
  isBusy: boolean;
  loadingAvail: boolean;
  isRevalidating?: boolean;
  canAdvanceMonth: boolean;
  isViewingFutureWindow: boolean;
  onChangeLayoutView: (view: ScheduleLayout) => void;
  onChangeTimeFormat: (format: '12h' | '24h') => void;
  onSelectDate: (date: string) => void;
  onSelectSlot: (slot: AvailableSlot) => void;
  onShowAllStaff: () => void;
  onRedirectStaff: (staffId: string) => void;
  onAdvanceMonth: () => void;
  onPrefetchNextMonth?: () => void;
  onReturnToToday: () => void;
  onOpenWaitlist: () => void;
}

const PERIOD_LABELS: ReadonlyArray<{ period: DayPeriod; label: string }> = [
  { period: 'morning', label: 'Mañana' },
  { period: 'afternoon', label: 'Tarde' },
  { period: 'evening', label: 'Noche' },
];

const STRIP_DAYS = 21;
const SKELETON_DAY_KEYS = [0, 1, 2, 3, 4, 5, 6] as const;
const SKELETON_GROUP_KEYS = [0, 1] as const;
const SKELETON_SLOT_KEYS = [0, 1, 2] as const;

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
  pinnedStaffSchedule,
  pendingSlotKey,
  isBusy,
  loadingAvail,
  isRevalidating = false,
  canAdvanceMonth,
  isViewingFutureWindow,
  onChangeLayoutView,
  onChangeTimeFormat,
  onSelectDate,
  onSelectSlot,
  onShowAllStaff,
  onRedirectStaff,
  onAdvanceMonth,
  onPrefetchNextMonth,
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
    <VStack gap={4} className="fx-step-in">
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
            size="md"
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
          <VStack gap={0} className="rb-grow">
            <Text>
              Estás viendo solo los horarios de <Text weight="semibold">{pinnedStaffName}</Text>.
            </Text>
            {pinnedStaffSchedule ? (
              <Text type="supporting" color="secondary" hasTabularNumbers>
                Turnos fijos · {pinnedStaffSchedule}
              </Text>
            ) : null}
          </VStack>
          <Button
            label="Ver todo el equipo"
            variant="secondary"
            size="md"
            className="fx-press"
            isDisabled={loadingAvail || isBusy}
            onClick={onShowAllStaff}
          />
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
                size="md"
                className="fx-press"
                isDisabled={loadingAvail || isBusy}
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
            {canAdvanceMonth ? (
              <Button
                label="Ver próximo mes"
                variant="primary"
                className="fx-press"
                onMouseEnter={onPrefetchNextMonth}
                onFocus={onPrefetchNextMonth}
                onClick={onAdvanceMonth}
              />
            ) : null}
            <Button label="Lista de espera" variant="secondary" className="fx-press" onClick={onOpenWaitlist} />
            {isViewingFutureWindow ? (
              <Button label="Volver a hoy" variant="ghost" className="fx-press" onClick={onReturnToToday} />
            ) : null}
          </HStack>
        </VStack>
      ) : (
        <>
          <VStack gap={2} className="rb-m">
            <HStack justify="between" align="center" gap={2} wrap="wrap">
              <Text weight="bold" display="block" className="rb-first-upper">
                {monthLabel}
              </Text>
              <HStack gap={1.5} align="center" wrap="wrap">
                {isViewingFutureWindow ? (
                  <Button
                    label="Mes actual"
                    variant="ghost"
                    size="md"
                    style={{ minHeight: '2.75rem' }}
                    className="fx-press"
                    isDisabled={loadingAvail || isBusy}
                    onClick={onReturnToToday}
                  />
                ) : null}
                {canAdvanceMonth ? (
                  <Button
                    label="Próximo mes"
                    variant="ghost"
                    size="md"
                    style={{ minHeight: '2.75rem' }}
                    className="fx-press"
                    isDisabled={loadingAvail || isBusy}
                    onMouseEnter={onPrefetchNextMonth}
                    onFocus={onPrefetchNextMonth}
                    onClick={onAdvanceMonth}
                  />
                ) : null}
                <Button
                  label={isMonthOpen ? 'Ocultar mes' : 'Ver mes'}
                  variant="secondary"
                  size="md"
                  style={{ minHeight: '2.75rem' }}
                  className="fx-press"
                  aria-expanded={isMonthOpen}
                  isDisabled={loadingAvail || isBusy}
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
                  {isViewingFutureWindow ? (
                    <Button
                      label="Mes actual"
                      variant="ghost"
                      size="md"
                      className="fx-press"
                      isDisabled={loadingAvail || isBusy}
                      onClick={onReturnToToday}
                    />
                  ) : null}
                  {canAdvanceMonth ? (
                    <Button
                      label="Próximo mes"
                      variant="ghost"
                      size="md"
                      className="fx-press"
                      isDisabled={loadingAvail || isBusy}
                      onMouseEnter={onPrefetchNextMonth}
                      onFocus={onPrefetchNextMonth}
                      onClick={onAdvanceMonth}
                    />
                  ) : null}
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
                      {isViewingFutureWindow ? (
                        <Button
                          label="Mes actual"
                          variant="ghost"
                          size="md"
                          className="fx-press"
                          isDisabled={loadingAvail || isBusy}
                          onClick={onReturnToToday}
                        />
                      ) : null}
                      {canAdvanceMonth ? (
                        <Button
                          label="Próximo mes"
                          variant="ghost"
                          size="md"
                          className="fx-press"
                          isDisabled={loadingAvail || isBusy}
                          onMouseEnter={onPrefetchNextMonth}
                          onFocus={onPrefetchNextMonth}
                          onClick={onAdvanceMonth}
                        />
                      ) : null}
                    </HStack>
                  </HStack>
                  {strip}
                </VStack>
              ) : null}

              <HStack justify="between" align="center" gap={2} wrap="wrap">
                <Text weight="bold" display="block" className="rb-first-upper">
                  {formatDateLongInTimezone(`${selectedDate}T18:00:00Z`, timezone)}
                </Text>
                {loadingAvail || isRevalidating ? (
                  <Text
                    type="supporting"
                    className="fx-save-pill"
                    data-state="saving"
                    role="status"
                    aria-live="polite"
                  >
                    {loadingAvail ? 'Buscando horarios…' : 'Actualizando horarios…'}
                  </Text>
                ) : null}
              </HStack>

              {loadingAvail ? (
                <VStack gap={3} aria-busy="true" role="status" aria-label="Cargando horarios libres">
                  <Text className="rb-sr-only">Buscando horarios libres…</Text>
                  {SKELETON_GROUP_KEYS.map((group) => (
                    <VStack key={group} gap={1.5} aria-hidden="true">
                      <VStack className="sk-bar" data-size="xs" data-w="25" />
                      <VStack className="rb-skeleton-slots">
                        {SKELETON_SLOT_KEYS.map((item) => (
                          <VStack key={item} className="rb-slot-skeleton fx-shimmer" />
                        ))}
                      </VStack>
                    </VStack>
                  ))}
                </VStack>
              ) : slots.length > 0 ? (
                <VStack key={selectedDate} gap={3} className="fx-step-in">
                  {PERIOD_LABELS.map(({ period, label }) => {
                    const periodSlots = slots.filter((slot) => slot.period === period);
                    if (periodSlots.length === 0) return null;
                    return (
                      <VStack key={period} gap={1.5}>
                        <Text type="supporting" color="secondary" weight="semibold">
                          {label}
                        </Text>
                        <ul className="rb-slots fx-stagger" aria-label={`Horarios de la ${label.toLowerCase()}`}>
                          {periodSlots.map((slot) => {
                            const slotKey = `${slot.staffId}-${slot.startAt}`;
                            const time = timeFormat === '24h' ? slot.localTime24 : slot.localTime12;
                            const isPending = pendingSlotKey === slotKey;
                            const isOn =
                              selectedSlot?.startAt === slot.startAt &&
                              (pinnedStaffName ? selectedSlot.staffId === slot.staffId : true);
                            const who = pinnedStaffName ? null : staffCountLabel(slot);
                            const subLabel = isPending ? 'Apartando…' : who;
                            return (
                              <li key={slotKey}>
                                <button
                                  type="button"
                                  className={
                                    isPending
                                      ? 'rb-slot fx-press fx-tabular fx-busy'
                                      : 'rb-slot fx-press fx-tabular'
                                  }
                                  aria-pressed={isOn || isPending}
                                  aria-busy={isPending ? 'true' : undefined}
                                  disabled={isBusy}
                                  aria-label={
                                    isPending
                                      ? `Apartando ${time}`
                                      : `${time}${who ? `, ${who} libres` : ''}`
                                  }
                                  onClick={() => onSelectSlot(slot)}
                                >
                                  <Text color="inherit" weight="bold" hasTabularNumbers>
                                    {time}
                                  </Text>
                                  {subLabel ? (
                                    <Text color="inherit" type="supporting" className="rb-slot-sub">
                                      {subLabel}
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
                    <Button label="Lista de espera" variant="ghost" size="md" className="fx-press" onClick={onOpenWaitlist} />
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
                        className="fx-press"
                        onClick={() => onSelectDate(nextOpenDay.date)}
                      />
                    ) : canAdvanceMonth ? (
                      <Button
                        label="Ver próximo mes"
                        variant="primary"
                        className="fx-press"
                        onMouseEnter={onPrefetchNextMonth}
                        onFocus={onPrefetchNextMonth}
                        onClick={onAdvanceMonth}
                      />
                    ) : null}
                    <Button
                      label="Lista de espera"
                      variant="secondary"
                      className="fx-press"
                      onClick={onOpenWaitlist}
                    />
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
