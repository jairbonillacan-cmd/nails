'use client';

import { memo } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { EmptyStateCard } from '@/components/ui/EmptyStateCard';
import { FilterPillBar } from '@/components/ui/FilterPillBar';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import type { AvailableSlot, DayAvailabilitySummary } from '@/lib/availability/engine';
import { formatDateLongInTimezone } from '@/lib/format';
import type { PublicSettingsDTO } from '@/lib/public-dto';
import { ScheduleCalendarView, type ScheduleLayout } from './ScheduleCalendarView';

export type { ScheduleLayout };

export interface ScheduleStepProps {
  settings: PublicSettingsDTO;
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
  availabilityError?: string | null;
  onRetryAvailability?: () => void;
  canAdvanceMonth: boolean;
  isViewingFutureWindow: boolean;
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

const weekdayShortFormatter = new Intl.DateTimeFormat('es-MX', { weekday: 'short', timeZone: 'UTC' });
const TIME_FORMAT_OPTIONS = [{ value: '12h', label: '12h' }, { value: '24h', label: '24h' }] as const;
const SKELETON_GROUP_KEYS = [0, 1] as const;
const SKELETON_SLOT_KEYS = [0, 1, 2] as const;
const shortDayFormatter = new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });

function plainDate(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00Z`);
}

function staffCountLabel(slot: AvailableSlot): string {
  const count = slot.availableStaffIds.length;
  return count === 1 ? '1 profesional' : `${count} profesionales`;
}

interface ScheduleSlotItemProps {
  slot: AvailableSlot;
  timeFormat: '12h' | '24h';
  pinnedStaffName: string | null;
  isPending: boolean;
  isOn: boolean;
  isBusy: boolean;
  onSelectSlot: (slot: AvailableSlot) => void;
}

const ScheduleSlotItem = memo(function ScheduleSlotItem({
  slot,
  timeFormat,
  pinnedStaffName,
  isPending,
  isOn,
  isBusy,
  onSelectSlot,
}: ScheduleSlotItemProps) {
  const time = timeFormat === '24h' ? slot.localTime24 : slot.localTime12;
  const who = pinnedStaffName ? null : staffCountLabel(slot);
  const freeSuffix = slot.availableStaffIds.length === 1 ? 'libre' : 'libres';
  return (
    <li>
      <button
        type="button"
        className={isPending ? 'rb-time fx-press fx-tabular fx-busy' : 'rb-time fx-press fx-tabular'}
        aria-pressed={isOn || isPending}
        aria-busy={isPending ? 'true' : undefined}
        disabled={isBusy}
        aria-label={isPending ? `Apartando ${time}` : `${time}${who ? `, ${who} ${freeSuffix}` : ''}`}
        onClick={() => onSelectSlot(slot)}
      >
        <Text color="inherit" className="rb-time-dot" aria-hidden="true">{'​'}</Text>
        <Text color="inherit" weight="semibold" hasTabularNumbers>
          {isPending ? 'Apartando…' : time}
        </Text>
      </button>
    </li>
  );
});

export function ScheduleStep({
  settings,
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
  availabilityError = null,
  onRetryAvailability,
  canAdvanceMonth,
  isViewingFutureWindow,
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
  const timezone = settings.timezone || 'America/Mexico_City';
  const slots = selectedDaySummary?.slots ?? [];
  const isRangeEmpty =
    !loadingAvail &&
    !availabilityError &&
    availabilityDays.length > 0 &&
    availabilityDays.every((day) => day.slotCount === 0);
  const isColdLoadError = Boolean(availabilityError) && !loadingAvail && availabilityDays.length === 0;
  const nextOpenDay = availabilityDays.find((day) => day.date > selectedDate && day.hasSlots) ?? null;
  const redirectStaffId = selectedDaySummary?.redirectStaffId ?? null;
  const redirectStaffName = selectedDaySummary?.redirectStaffName ?? null;
  const publicNote = selectedDaySummary?.publicNote?.trim() || null;

  return (
    <VStack gap={4} className="fx-step-in">
      <VStack gap={0.5}>
        <Heading level={2} className="lk-serif rb-h2">¿Cuándo?</Heading>
        <Text color="secondary">
          Hora de Puebla · {pinnedStaffName ? `horarios de ${pinnedStaffName}` : 'horarios de todo el equipo'}
        </Text>
      </VStack>

      {pinnedStaffName ? (
        <SurfaceCard tone="subtle" padded className="rb-note">
          <HStack justify="between" align="center" gap={2} wrap="wrap">
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
        </SurfaceCard>
      ) : null}

      {availabilityError && !loadingAvail ? (
        <Banner
          status="error"
          role="alert"
          title={availabilityError}
          description="Puede ser la señal. Intenta otra vez en un momento."
          endContent={
            onRetryAvailability ? (
              <Button
                type="button"
                variant="primary"
                size="md"
                className="fx-press"
                label="Reintentar"
                isLoading={isRevalidating}
                isDisabled={isRevalidating}
                onClick={onRetryAvailability}
              />
            ) : undefined
          }
        />
      ) : null}

      {publicNote || redirectStaffId ? (
        <Banner
          status="info"
          title={publicNote ? 'Aviso del salón para esta fecha' : 'Horario especial en esta fecha'}
          description={
            publicNote ||
            (redirectStaffName ? `Revisa los horarios disponibles con ${redirectStaffName}.` : 'Prueba otra fecha disponible.')
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

      {isColdLoadError ? null : isRangeEmpty ? (
        <EmptyStateCard
          title="Sin lugares en estas fechas"
          description="Revisa el próximo mes o anótate en la lista de espera y te avisamos si se libera algo."
          className="rb-empty"
          actions={
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
          }
        />
      ) : (
        <ScheduleCalendarView
          timezone={timezone}
          todayKey={todayKey}
          selectedDate={selectedDate}
          availabilityDays={availabilityDays}
          availableDateSet={availableDateSet}
          isBusy={isBusy}
          loadingAvail={loadingAvail}
          canAdvanceMonth={canAdvanceMonth}
          onSelectDate={onSelectDate}
          onAdvanceMonth={onAdvanceMonth}
          onPrefetchNextMonth={onPrefetchNextMonth}
        >
          <HStack justify="between" align="center" gap={2}>
            <Text weight="bold" className="rb-times-day" hasTabularNumbers>
              <Text color="inherit" weight="bold">
                {weekdayShortFormatter.format(plainDate(selectedDate)).replace('.', '')}
              </Text>{' '}
              <Text color="secondary" weight="bold">
                {plainDate(selectedDate).getUTCDate()}
              </Text>
            </Text>
            <FilterPillBar
              ariaLabel="Formato de hora"
              mode="segmented"
              size="sm"
              value={timeFormat}
              options={TIME_FORMAT_OPTIONS}
              onChange={(value) => onChangeTimeFormat(value === '24h' ? '24h' : '12h')}
            />
          </HStack>
          {isRevalidating && !loadingAvail ? (
            <Text type="supporting" className="fx-save-pill" data-state="saving" role="status" aria-live="polite">
              Actualizando horarios…
            </Text>
          ) : null}

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
              <ul
                className="rb-times fx-stagger"
                aria-label={`Horarios disponibles para ${formatDateLongInTimezone(`${selectedDate}T18:00:00Z`, timezone)}`}
              >
                {slots.map((slot) => {
                  const slotKey = `${slot.staffId}-${slot.startAt}`;
                  const isOn =
                    selectedSlot?.startAt === slot.startAt &&
                    (pinnedStaffName ? selectedSlot.staffId === slot.staffId : true);
                  return (
                    <ScheduleSlotItem
                      key={slotKey}
                      slot={slot}
                      timeFormat={timeFormat}
                      pinnedStaffName={pinnedStaffName}
                      isPending={pendingSlotKey === slotKey}
                      isOn={isOn}
                      isBusy={isBusy}
                      onSelectSlot={onSelectSlot}
                    />
                  );
                })}
              </ul>
              <HStack justify="between" align="center" gap={2} wrap="wrap" className="rb-waitlist">
                <Text type="supporting" color="secondary">¿No ves tu hora?</Text>
                <Button label="Lista de espera" variant="ghost" size="sm" className="fx-press" onClick={onOpenWaitlist} />
              </HStack>
            </VStack>
          ) : (
            <EmptyStateCard
              title="Sin lugares este día"
              description={
                nextOpenDay
                  ? `El próximo con lugar es el ${formatDateLongInTimezone(`${nextOpenDay.date}T18:00:00Z`, timezone)}.`
                  : undefined
              }
              className="rb-empty"
              isCompact
              actions={
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
                  <Button label="Lista de espera" variant="secondary" className="fx-press" onClick={onOpenWaitlist} />
                </HStack>
              }
            />
          )}
        </ScheduleCalendarView>
      )}
    </VStack>
  );
}
