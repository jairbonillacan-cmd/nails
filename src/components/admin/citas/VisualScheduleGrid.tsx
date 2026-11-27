'use client';

import { useCallback, useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { ConfirmActionDialog } from '@/components/ui/ConfirmActionDialog';
import { EmptyStateCard } from '@/components/ui/EmptyStateCard';
import { StatusTag } from '@/components/ui/StatusTag';
import { equipoHref } from '@/lib/admin-links';
import { formatDateShortInTimezone, getDateKeyInTimezone } from '@/lib/format';
import { useCurrentClockTick } from '@/lib/hooks/useCurrentClockTick';
import { useScheduleDrag, type ScheduleDragProposal } from '@/lib/hooks/useScheduleDrag';
import type {
  AvailabilitySchedule,
  BookingStatus,
  BookingWithRelations,
  CashRegisterEntry,
  DateOverride,
  PaymentSplit,
  RecurringBlock,
  Service,
  StaffMember,
} from '@/lib/types';
import {
  buildScheduleDragProposalCopy,
  buildScheduleReschedulePayload,
  buildWeekScheduleDays,
  buildZonedIsoForDateAndMinutes,
  CALENDAR_END_MIN,
  CALENDAR_START_MIN,
  groupScheduleItemsByKey,
  shiftDateKey,
} from './scheduleGridGeometry';
import { ScheduleDayView, type TriggerEmptySlotInput } from './ScheduleDayView';
import type { ScheduleSharedViewContext } from './ScheduleEventCard';
import { ScheduleWeekView } from './ScheduleWeekView';

export interface CalendarEmptySlotSelection {
  readonly dateKey: string;
  readonly startMinutes: number;
  readonly startTimeHHMM: string;
  readonly startAtIso: string;
  readonly staffId: string;
  readonly staffName: string | null;
}

interface VisualScheduleGridProps {
  rangeMode: 'day' | 'week';
  dateKey: string;
  todayKey: string;
  serverNowIso: string;
  timezone: string;
  staff: StaffMember[];
  allStaffColorIndex: ReadonlyMap<string, number>;
  schedules: AvailabilitySchedule[];
  dateOverrides?: DateOverride[];
  recurringBlocks?: RecurringBlock[];
  paymentSplits?: PaymentSplit[];
  cashEntries?: CashRegisterEntry[];
  bookings: BookingWithRelations[];
  allServices: Service[];
  isSpecialistLocked?: boolean;
  busyBookingId?: string | null;
  busyStatus?: BookingStatus | null;
  reschedulingBookingId?: string | null;
  hideInternalToolbar?: boolean;
  onChangeDate: (nextDateKey: string) => void;
  onJumpToDay: (nextDateKey: string) => void;
  onOpenNewForStaff: (staffId: string, preferredDateKey?: string, preferredStartAt?: string) => void;
  onSelectEmptySlot?: (slot: CalendarEmptySlotSelection) => void;
  onSelectBooking: (booking: BookingWithRelations) => void;
  onUpdateStatus: (bookingId: string, status: BookingStatus) => void;
  onRescheduleBooking: (params: {
    bookingId: string;
    startAt: string;
    staffId: string;
    durationMinutes: number;
    summaryLabel: string;
  }) => Promise<boolean>;
  onOpenCheckout: (booking: BookingWithRelations) => void;
}

export function VisualScheduleGrid({
  rangeMode,
  dateKey,
  todayKey,
  serverNowIso,
  timezone,
  staff,
  allStaffColorIndex,
  schedules,
  dateOverrides = [],
  recurringBlocks = [],
  paymentSplits = [],
  cashEntries = [],
  bookings,
  allServices,
  isSpecialistLocked = false,
  busyBookingId = null,
  busyStatus = null,
  reschedulingBookingId = null,
  hideInternalToolbar = false,
  onChangeDate,
  onJumpToDay,
  onOpenNewForStaff,
  onSelectEmptySlot,
  onSelectBooking,
  onUpdateStatus,
  onRescheduleBooking,
  onOpenCheckout,
}: VisualScheduleGridProps) {
  const [pendingProposal, setPendingProposal] = useState<ScheduleDragProposal | null>(null);
  const nowMs = useCurrentClockTick(serverNowIso);

  const activeStaff = useMemo(
    () => staff.filter((s) => s.isActive).toSorted((a, b) => a.displayOrder - b.displayOrder),
    [staff],
  );
  const dayBookings = useMemo(
    () =>
      bookings
        .filter((b) => getDateKeyInTimezone(new Date(b.startAt), timezone) === dateKey)
        .toSorted((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()),
    [bookings, dateKey, timezone],
  );
  const weekDays = useMemo(() => buildWeekScheduleDays(bookings, dateKey, timezone, todayKey), [bookings, dateKey, timezone, todayKey]);
  const splitsByBookingId = useMemo(() => groupScheduleItemsByKey(paymentSplits, (s) => s.bookingId), [paymentSplits]);
  const cashEntriesByBookingId = useMemo(() => groupScheduleItemsByKey(cashEntries, (e) => e.bookingId), [cashEntries]);
  const serviceNameById = useMemo(() => new Map(allServices.map((s) => [s.id, s.name])), [allServices]);
  const handleDragComplete = useCallback((proposal: ScheduleDragProposal) => setPendingProposal(proposal), []);

  const drag = useScheduleDrag({
    dayStartMinutes: CALENDAR_START_MIN,
    dayEndMinutes: CALENDAR_END_MIN,
    snapMinutes: 15,
    minDurationMinutes: 30,
    maxDurationMinutes: 360,
    columnAttribute: rangeMode === 'week' ? 'data-cal-date' : 'data-cal-staff',
    allowCrossColumn: rangeMode === 'week' || !isSpecialistLocked,
    onComplete: handleDragComplete,
  });

  const handleConfirmProposal = async () => {
    if (!pendingProposal) return;
    try {
      await onRescheduleBooking(buildScheduleReschedulePayload(pendingProposal, activeStaff, timezone));
    } finally {
      setPendingProposal(null);
    }
  };

  if (activeStaff.length === 0) {
    return (
      <EmptyStateCard
        title="Sin profesionales activas en la agenda"
        description="Activa al menos una profesional en Equipo para ver el calendario del salón."
        icon={<CalendarDays size={22} aria-hidden="true" />}
        actions={<Button label="Ir a Equipo" variant="secondary" size="sm" href={equipoHref()} />}
      />
    );
  }

  const triggerEmptySlot = (params: TriggerEmptySlotInput) => {
    const startAtIso = buildZonedIsoForDateAndMinutes(params.dateKey, params.startMinutes, timezone);
    if (onSelectEmptySlot) {
      onSelectEmptySlot({ ...params, startAtIso });
      return;
    }
    onOpenNewForStaff(params.staffId, params.dateKey, startAtIso);
  };

  const shared: ScheduleSharedViewContext = {
    timezone,
    nowMs,
    allStaffColorIndex,
    splitsByBookingId,
    cashEntriesByBookingId,
    serviceNameById,
    hasEmptySlotHandler: Boolean(onSelectEmptySlot),
    busyBookingId,
    busyStatus,
    reschedulingBookingId,
    drag,
    onSelectBooking,
    onUpdateStatus,
    onOpenCheckout,
  };

  const proposalCopy = pendingProposal
    ? buildScheduleDragProposalCopy(pendingProposal, activeStaff, timezone)
    : null;
  const formattedDay = formatDateShortInTimezone(`${dateKey}T18:00:00Z`, timezone);
  const formattedWeekRange = `${formattedDay} – ${formatDateShortInTimezone(`${shiftDateKey(dateKey, 6)}T18:00:00Z`, timezone)}`;
  const visibleCount =
    rangeMode === 'week'
      ? weekDays.reduce((sum, day) => sum + day.items.length, 0)
      : dayBookings.length;

  return (
    <VStack gap={2} className="ad-cal-shell">
      {!hideInternalToolbar ? (
        <HStack className="ad-cal-bar" justify="between" align="center" wrap="wrap" gap={2}>
          <HStack gap={2} align="center" wrap="wrap">
            <HStack gap={1.5} align="center">
              <Button
                type="button"
                label={rangeMode === 'week' ? 'Semana anterior' : 'Día anterior'}
                isIconOnly
                size="sm"
                variant="secondary"
                icon={<ChevronLeft size={15} aria-hidden="true" />}
                onClick={() => onChangeDate(shiftDateKey(dateKey, rangeMode === 'week' ? -7 : -1))}
              />
              <Heading level={2} className="lk-serif ad-cal-heading">
                {rangeMode === 'week' ? formattedWeekRange : formattedDay}
              </Heading>
              <Button
                type="button"
                label={rangeMode === 'week' ? 'Semana siguiente' : 'Día siguiente'}
                isIconOnly
                size="sm"
                variant="secondary"
                icon={<ChevronRight size={15} aria-hidden="true" />}
                onClick={() => onChangeDate(shiftDateKey(dateKey, rangeMode === 'week' ? 7 : 1))}
              />
            </HStack>
            {dateKey !== todayKey ? (
              <Button type="button" label="Hoy" size="sm" variant="ghost" onClick={() => onChangeDate(todayKey)} />
            ) : null}
          </HStack>
          <StatusTag tone="neutral" hasTabularNumbers label={`${visibleCount} ${visibleCount === 1 ? 'cita' : 'citas'}`} />
        </HStack>
      ) : null}

      <VStack key={`${rangeMode}-${dateKey}`} className="ad-cal-scroll" gap={0}>
        {rangeMode === 'day' ? (
          <ScheduleDayView
            dateKey={dateKey}
            todayKey={todayKey}
            activeStaff={activeStaff}
            schedules={schedules}
            dateOverrides={dateOverrides}
            recurringBlocks={recurringBlocks}
            dayBookings={dayBookings}
            shared={shared}
            onOpenNewForStaff={onOpenNewForStaff}
            onTriggerEmptySlot={triggerEmptySlot}
          />
        ) : (
          <ScheduleWeekView
            weekDays={weekDays}
            todayKey={todayKey}
            activeStaff={activeStaff}
            dateOverrides={dateOverrides}
            recurringBlocks={recurringBlocks}
            shared={shared}
            onJumpToDay={onJumpToDay}
            onTriggerEmptySlot={triggerEmptySlot}
          />
        )}
      </VStack>

      <Text type="supporting" color="secondary" className="ad-hide-s">
        Arrastra una cita para moverla, estira su borde inferior para ajustar duración o haz clic en un horario libre para agendar o bloquear.
      </Text>

      <ConfirmActionDialog
        isOpen={Boolean(pendingProposal)}
        onOpenChange={(open) => {
          if (!open) setPendingProposal(null);
        }}
        title={proposalCopy?.title ?? 'Confirmar cambio'}
        description={proposalCopy?.description ?? ''}
        confirmLabel={proposalCopy?.confirmLabel ?? 'Confirmar'}
        variant="primary"
        isLoading={Boolean(reschedulingBookingId)}
        onConfirm={handleConfirmProposal}
      />
    </VStack>
  );
}
