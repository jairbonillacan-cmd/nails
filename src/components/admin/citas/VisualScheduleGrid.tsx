'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  GripHorizontal,
  Plus,
} from 'lucide-react';
import { ConfirmActionDialog } from '@/components/ui/ConfirmActionDialog';
import { EmptyStateCard } from '@/components/ui/EmptyStateCard';
import { BookingStatusTag, StatusTag } from '@/components/ui/StatusTag';
import { isActiveBookingStatus } from '@/lib/booking/state-machine';
import {
  formatDateShortInTimezone,
  formatDuration,
  formatTimeInTimezone,
  getDateKeyInTimezone,
} from '@/lib/format';
import { useCurrentClockTick } from '@/lib/hooks/useCurrentClockTick';
import {
  useScheduleDrag,
  type ScheduleDragProposal,
} from '@/lib/hooks/useScheduleDrag';
import { computeBookingPaymentSummary } from '@/lib/payments/splits';
import type {
  AvailabilitySchedule,
  BookingStatus,
  BookingWithRelations,
  DateOverride,
  PaymentSplit,
  RecurringBlock,
  Service,
  StaffMember,
} from '@/lib/types';
import {
  buildActiveBlocksByStaff,
  buildFixedTimesByStaff,
  buildStaffOpenSlots,
  buildWeekScheduleDays,
  buildZonedIsoForDateAndMinutes,
  CALENDAR_END_MIN,
  CALENDAR_HOURS,
  CALENDAR_START_MIN,
  computeBlockGeometryPercent,
  computeNowIndicator,
  computeElapsedMinutesForDate,
  computeElapsedPercent,
  formatMinutesHHMM,
  getDayOfWeekFromDateKey,
  getLocalMinutesInTimezone,
  parseTimeMinutes,
  shiftDateKey,
  type CalendarOpenSlot,
} from './scheduleGridGeometry';

const EMPTY_PAYMENT_SPLITS: readonly PaymentSplit[] = [];
const EMPTY_BOOKINGS: readonly BookingWithRelations[] = [];
const EMPTY_OPEN_SLOTS: readonly CalendarOpenSlot[] = [];

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
  bookings: BookingWithRelations[];
  allServices: Service[];
  isSpecialistLocked?: boolean;
  busyBookingId?: string | null;
  busyStatus?: BookingStatus | null;
  reschedulingBookingId?: string | null;
  rangeControls?: ReactNode;
  staffControls?: ReactNode;
  onChangeDate: (nextDateKey: string) => void;
  onJumpToDay: (nextDateKey: string) => void;
  onOpenNewForStaff: (
    staffId: string,
    preferredDateKey?: string,
    preferredStartAt?: string,
  ) => void;
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
  bookings,
  allServices,
  isSpecialistLocked = false,
  busyBookingId = null,
  busyStatus = null,
  reschedulingBookingId = null,
  rangeControls,
  staffControls,
  onChangeDate,
  onJumpToDay,
  onOpenNewForStaff,
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

  const weekDays = useMemo(
    () => buildWeekScheduleDays(bookings, dateKey, timezone, todayKey),
    [bookings, dateKey, timezone, todayKey],
  );

  const dow = getDayOfWeekFromDateKey(dateKey);
  const activeBlocksByStaff = useMemo(
    () => buildActiveBlocksByStaff(activeStaff, recurringBlocks, dateKey, dow),
    [activeStaff, recurringBlocks, dateKey, dow],
  );
  const fixedTimesByStaff = useMemo(
    () => buildFixedTimesByStaff(activeStaff, schedules, dow),
    [activeStaff, schedules, dow],
  );
  const unavailableOverrideByStaffId = useMemo(() => {
    const map = new Map<string, DateOverride>();
    for (const ov of dateOverrides) {
      if (ov.overrideDate !== dateKey || !ov.isUnavailable) continue;
      if (ov.staffId === 'all') {
        for (const st of activeStaff) {
          if (!map.has(st.id)) map.set(st.id, ov);
        }
      } else {
        map.set(ov.staffId, ov);
      }
    }
    return map;
  }, [activeStaff, dateOverrides, dateKey]);

  const splitsByBookingId = useMemo(() => {
    const map = new Map<string, PaymentSplit[]>();
    for (const split of paymentSplits) {
      const existing = map.get(split.bookingId);
      if (existing) {
        existing.push(split);
      } else {
        map.set(split.bookingId, [split]);
      }
    }
    return map;
  }, [paymentSplits]);

  const serviceNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const service of allServices) {
      map.set(service.id, service.name);
    }
    return map;
  }, [allServices]);

  const dayBookingsByStaffId = useMemo(() => {
    const map = new Map<string, BookingWithRelations[]>();
    for (const booking of dayBookings) {
      const existing = map.get(booking.staffId);
      if (existing) {
        existing.push(booking);
      } else {
        map.set(booking.staffId, [booking]);
      }
    }
    return map;
  }, [dayBookings]);

  const activeBookingCountByStaffId = useMemo(() => {
    const map = new Map<string, number>();
    for (const booking of dayBookings) {
      if (booking.status === 'canceled') continue;
      map.set(booking.staffId, (map.get(booking.staffId) ?? 0) + 1);
    }
    return map;
  }, [dayBookings]);

  const elapsedMinutes = computeElapsedMinutesForDate(nowMs, dateKey, todayKey, timezone);
  const elapsedPct = computeElapsedPercent(elapsedMinutes);

  const openSlotsByStaffId = useMemo(() => {
    const map = new Map<string, CalendarOpenSlot[]>();
    for (const st of activeStaff) {
      if (unavailableOverrideByStaffId.has(st.id)) {
        map.set(st.id, []);
        continue;
      }
      const staffBookings = dayBookingsByStaffId.get(st.id) ?? EMPTY_BOOKINGS;
      const staffBlocks = activeBlocksByStaff.get(st.id) ?? [];
      const fixedTimes = fixedTimesByStaff.get(st.id) ?? [];
      map.set(
        st.id,
        buildStaffOpenSlots({
          fixedTimes,
          staffBookings,
          staffBlocks,
          timezone,
          notBeforeMinutes: elapsedMinutes,
        }),
      );
    }
    return map;
  }, [
    activeStaff,
    unavailableOverrideByStaffId,
    dayBookingsByStaffId,
    activeBlocksByStaff,
    fixedTimesByStaff,
    timezone,
    elapsedMinutes,
  ]);

  const nowIndicator = useMemo(
    () => computeNowIndicator(nowMs, dateKey, todayKey, timezone),
    [nowMs, dateKey, todayKey, timezone],
  );

  const handleDragComplete = useCallback((proposal: ScheduleDragProposal) => {
    setPendingProposal(proposal);
  }, []);

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
    const nextStartIso = buildZonedIsoForDateAndMinutes(
      pendingProposal.targetDateKey,
      pendingProposal.targetStartMinutes,
      timezone,
    );
    const targetStaffName =
      activeStaff.find((st) => st.id === pendingProposal.targetStaffId)?.name ??
      pendingProposal.booking.staff.name;
    const nextTime = formatMinutesHHMM(pendingProposal.targetStartMinutes);
    const summaryLabel =
      pendingProposal.mode === 'resize'
        ? `Duración ajustada a ${formatDuration(pendingProposal.targetDurationMinutes)}`
        : `Cita movida a ${nextTime} con ${targetStaffName}`;
    try {
      await onRescheduleBooking({
        bookingId: pendingProposal.booking.id,
        startAt: nextStartIso,
        staffId: pendingProposal.targetStaffId,
        durationMinutes: pendingProposal.targetDurationMinutes,
        summaryLabel,
      });
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
        actions={<Button label="Ir a Equipo" variant="secondary" size="sm" href="/admin/equipo" />}
      />
    );
  }

  const proposalCopy = pendingProposal
    ? (() => {
        const origTime = formatMinutesHHMM(pendingProposal.originalStartMinutes);
        const nextTime = formatMinutesHHMM(pendingProposal.targetStartMinutes);
        const origStaff =
          activeStaff.find((st) => st.id === pendingProposal.originalStaffId)?.name ??
          pendingProposal.booking.staff.name;
        const nextStaff =
          activeStaff.find((st) => st.id === pendingProposal.targetStaffId)?.name ?? origStaff;
        const nextDateLabel = formatDateShortInTimezone(
          `${pendingProposal.targetDateKey}T18:00:00Z`,
          timezone,
        );
        if (pendingProposal.mode === 'resize') {
          return {
            title: `¿Ajustar duración de ${pendingProposal.booking.client.fullName}?`,
            description: `${pendingProposal.booking.service.name} cambiará de ${formatDuration(pendingProposal.originalDurationMinutes)} a ${formatDuration(pendingProposal.targetDurationMinutes)} (${origTime} – ${formatMinutesHHMM(pendingProposal.targetStartMinutes + pendingProposal.targetDurationMinutes)}).`,
            confirmLabel: 'Guardar duración',
          };
        }
        return {
          title: `¿Mover cita de ${pendingProposal.booking.client.fullName}?`,
          description: `De ${origTime} (${origStaff}) a ${nextDateLabel} ${nextTime} con ${nextStaff} (${formatDuration(pendingProposal.targetDurationMinutes)}).`,
          confirmLabel: 'Confirmar movimiento',
        };
      })()
    : null;

  const formattedDay = formatDateShortInTimezone(`${dateKey}T18:00:00Z`, timezone);
  const weekEndKey = shiftDateKey(dateKey, 6);
  const formattedWeekRange = `${formatDateShortInTimezone(`${dateKey}T18:00:00Z`, timezone)} – ${formatDateShortInTimezone(`${weekEndKey}T18:00:00Z`, timezone)}`;

  const renderBookingEvent = (
    booking: BookingWithRelations,
    columnDateKey: string,
    columnStaffId: string,
    compact = false,
  ) => {
    const startMin = getLocalMinutesInTimezone(booking.startAt, timezone);
    const durationMin = Math.max(30, booking.totalDurationMinutes);
    const isThisDragging =
      drag.activeDrag?.bookingId === booking.id && drag.activeDrag.isDragging;
    const effectiveStart =
      isThisDragging && drag.activeDrag ? drag.activeDrag.targetStartMinutes : startMin;
    const effectiveDuration =
      isThisDragging && drag.activeDrag ? drag.activeDrag.targetDurationMinutes : durationMin;
    const geo = computeBlockGeometryPercent(effectiveStart, effectiveDuration);
    const colorIdx = allStaffColorIndex.get(booking.staffId) ?? 0;
    const isBusy =
      busyBookingId === booking.id || reschedulingBookingId === booking.id;
    const canDrag = isActiveBookingStatus(booking.status) && !isBusy;
    const isPending =
      booking.status === 'pending_confirmation' || booking.status === 'pending_payment';
    const paymentSummary = computeBookingPaymentSummary(
      booking.totalPriceCents,
      splitsByBookingId.get(booking.id) ?? EMPTY_PAYMENT_SPLITS,
    );
    const canCollect =
      booking.status === 'confirmed' ||
      (booking.status === 'completed' && paymentSummary.isUncollected);
    const extraNames = (booking.extraServiceIds ?? [])
      .map((id) => serviceNameById.get(id))
      .filter((n): n is string => Boolean(n));

    return (
      <article
        key={booking.id}
        className={`ad-cal-event${isBusy ? ' fx-busy' : ''}${isThisDragging ? ' ad-cal-event-dragging' : ''}`}
        data-idx={String(colorIdx)}
        data-status={booking.status}
        data-draggable={canDrag ? 'true' : 'false'}
        aria-busy={isBusy || undefined}
        style={{
          top: `${geo.topPct}%`,
          height: `${geo.heightPct}%`,
        }}
        onPointerDown={(event) => {
          if (!canDrag || event.button !== 0 || event.pointerType === 'touch') return;
          if ((event.target as HTMLElement).closest('button[data-no-drag="true"]')) return;
          const colEl = event.currentTarget.closest<HTMLElement>('.ad-cal-col-body');
          if (!colEl) return;
          drag.startDrag({
            mode: 'move',
            booking,
            pointerX: event.clientX,
            pointerY: event.clientY,
            originDateKey: columnDateKey,
            originStaffId: columnStaffId,
            originStartMinutes: startMin,
            originDurationMinutes: durationMin,
            columnContainer: colEl,
          });
        }}
      >
        <button
          type="button"
          className="ad-cal-event-trigger"
          onClick={() => {
            if (drag.consumeJustDragged()) return;
            onSelectBooking(booking);
          }}
        >
          <VStack gap={0.5} align="start" width="100%">
            <HStack justify="between" align="center" gap={1} width="100%">
              <Text size="sm" weight="semibold" hasTabularNumbers className="ad-cal-event-time">
                {isThisDragging
                  ? `${formatMinutesHHMM(effectiveStart)} – ${formatMinutesHHMM(effectiveStart + effectiveDuration)}`
                  : `${formatTimeInTimezone(booking.startAt, timezone, true)} – ${formatTimeInTimezone(booking.endAt, timezone, true)}`}
              </Text>
              {!compact ? (
                <HStack gap={1} align="center" wrap="wrap">
                  <BookingStatusTag
                    status={booking.status}
                    hasPaymentProof={Boolean(booking.paymentProofUrl)}
                    showDot
                  />
                  {isActiveBookingStatus(booking.status) &&
                  booking.attendanceStatus === 'confirmed' ? (
                    <StatusTag tone="success" label="Confirmó" />
                  ) : isActiveBookingStatus(booking.status) &&
                    booking.attendanceStatus === 'rescheduled' ? (
                    <StatusTag tone="accent" label="Reagendó" />
                  ) : null}
                </HStack>
              ) : null}
            </HStack>

            <Text weight="semibold" size="sm" maxLines={1} className="ad-cal-event-client">
              {booking.client.fullName}
            </Text>

            <Text type="supporting" color="secondary" maxLines={1} className="ad-cal-event-service">
              {booking.service.name}
              {extraNames.length > 0 ? ` + ${extraNames.join(' + ')}` : ''}
              {compact ? ` · ${booking.staff.name.split(' ')[0]}` : ''}
            </Text>
          </VStack>
        </button>

        {!compact && durationMin >= 60 ? (
          <HStack gap={1} className="ad-cal-event-actions">
            {isPending ? (
              <Button
                type="button"
                data-no-drag="true"
                label={busyBookingId === booking.id && busyStatus === 'confirmed' ? '…' : 'Confirmar'}
                size="sm"
                variant="primary"
                icon={<Check size={12} aria-hidden="true" />}
                isLoading={busyBookingId === booking.id && busyStatus === 'confirmed'}
                isDisabled={isBusy}
                onClick={() => onUpdateStatus(booking.id, 'confirmed')}
              />
            ) : canCollect ? (
              <Button
                type="button"
                data-no-drag="true"
                label="Cobrar"
                size="sm"
                variant="secondary"
                icon={<DollarSign size={12} aria-hidden="true" />}
                isDisabled={isBusy}
                onClick={() => onOpenCheckout(booking)}
              />
            ) : null}
          </HStack>
        ) : null}

        {canDrag ? (
          <button
            type="button"
            className="ad-cal-resize-handle"
            aria-label={`Cambiar duración de la cita de ${booking.client.fullName}`}
            title="Arrastra para cambiar duración"
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.stopPropagation();
              const colEl = event.currentTarget.closest<HTMLElement>('.ad-cal-col-body');
              if (!colEl) return;
              drag.startDrag({
                mode: 'resize',
                booking,
                pointerX: event.clientX,
                pointerY: event.clientY,
                originDateKey: columnDateKey,
                originStaffId: columnStaffId,
                originStartMinutes: startMin,
                originDurationMinutes: durationMin,
                columnContainer: colEl,
              });
            }}
          >
            <GripHorizontal size={12} aria-hidden="true" />
          </button>
        ) : null}
      </article>
    );
  };

  const visibleBookingsCount =
    rangeMode === 'week'
      ? weekDays.reduce((sum, day) => sum + day.items.length, 0)
      : dayBookings.length;

  return (
    <VStack gap={2} className="ad-cal-shell">
      <HStack
        className="ad-cal-bar"
        justify="between"
        align="center"
        wrap="wrap"
        gap={2}
      >
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
          {rangeControls ? (
            rangeControls
          ) : dateKey !== todayKey ? (
            <Button
              type="button"
              label="Hoy"
              size="sm"
              variant="ghost"
              onClick={() => onChangeDate(todayKey)}
            />
          ) : null}
        </HStack>

        <HStack gap={2} align="center" wrap="wrap">
          {staffControls}
          <StatusTag
            tone="neutral"
            hasTabularNumbers
            label={`${visibleBookingsCount} ${visibleBookingsCount === 1 ? 'cita' : 'citas'}`}
          />
        </HStack>
      </HStack>

      <VStack key={`${rangeMode}-${dateKey}`} className="ad-cal-view ad-cal-scroll" gap={0}>
        {rangeMode === 'day' ? (
          <VStack
            className="ad-cal-grid"
            data-mode="day"
            style={{
              ['--ad-cal-cols' as string]: String(activeStaff.length),
            }}
            gap={0}
          >
            <HStack className="ad-cal-head-row" gap={0} align="stretch">
              <VStack className="ad-cal-gutter-head" justify="center" align="center">
                <Text type="supporting" color="secondary" size="sm">
                  Hora
                </Text>
              </VStack>
              {activeStaff.map((st) => {
                const count = activeBookingCountByStaffId.get(st.id) ?? 0;
                const colorIdx = allStaffColorIndex.get(st.id) ?? 0;
                const fixedTimes = fixedTimesByStaff.get(st.id) ?? [];
                const closedOverride = unavailableOverrideByStaffId.get(st.id) ?? null;
                return (
                  <HStack
                    key={st.id}
                    className="ad-cal-col-head"
                    justify="between"
                    align="center"
                    gap={2}
                  >
                    <VStack gap={0.5} className="rb-grow">
                      <HStack gap={1.5} align="center">
                        <Text className="ad-dot" data-idx={String(colorIdx)} aria-hidden="true">
                          {'\u200B'}
                        </Text>
                        <Text weight="semibold" size="sm">
                          {st.name}
                        </Text>
                        <Badge variant="neutral" label={String(count)} />
                      </HStack>
                      <Text type="supporting" color="secondary" maxLines={1} hasTabularNumbers>
                        {closedOverride
                          ? `Cerrado · ${closedOverride.reason || 'Día bloqueado'}`
                          : fixedTimes.length > 0
                            ? fixedTimes.join(' · ')
                            : st.roleTitle.trim() || 'Nail Artist'}
                      </Text>
                    </VStack>
                    <Button
                      type="button"
                      label={`Agendar con ${st.name}`}
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      icon={<Plus size={14} aria-hidden="true" />}
                      onClick={() => onOpenNewForStaff(st.id, dateKey)}
                    />
                  </HStack>
                );
              })}
            </HStack>

            <HStack className="ad-cal-body-row" gap={0} align="stretch">
              <VStack className="ad-cal-gutter" gap={0}>
                {CALENDAR_HOURS.map((hour) => (
                  <VStack key={hour} className="ad-cal-gutter-hour" justify="start">
                    <Text type="supporting" color="secondary" hasTabularNumbers className="ad-cal-hour-label">
                      {`${String(hour).padStart(2, '0')}:00`}
                    </Text>
                  </VStack>
                ))}
                {nowIndicator.visible ? (
                  <Text
                    className="ad-cal-now-pill"
                    hasTabularNumbers
                    style={{ top: `${nowIndicator.topPct}%` }}
                  >
                    {nowIndicator.label}
                  </Text>
                ) : null}
              </VStack>

              {activeStaff.map((st) => {
                const staffBookings = dayBookingsByStaffId.get(st.id) ?? EMPTY_BOOKINGS;
                const staffBlocks = activeBlocksByStaff.get(st.id) ?? [];
                const openSlots = openSlotsByStaffId.get(st.id) ?? EMPTY_OPEN_SLOTS;
                const closedOverride = unavailableOverrideByStaffId.get(st.id) ?? null;
                const isDropTarget =
                  Boolean(drag.activeDrag?.isDragging) &&
                  drag.activeDrag?.targetStaffId === st.id &&
                  drag.activeDrag?.targetDateKey === dateKey;
                const dropGhostGeo =
                  isDropTarget && drag.activeDrag
                    ? computeBlockGeometryPercent(
                        drag.activeDrag.targetStartMinutes,
                        drag.activeDrag.targetDurationMinutes,
                      )
                    : null;

                return (
                  <VStack
                    key={st.id}
                    className="ad-cal-col-body"
                    data-cal-staff={st.id}
                    data-drop-active={isDropTarget ? 'true' : 'false'}
                    gap={0}
                  >
                    {CALENDAR_HOURS.map((hour) => (
                      <button
                        key={hour}
                        type="button"
                        className="ad-cal-hour-slot"
                        disabled={Boolean(closedOverride)}
                        aria-label={
                          closedOverride
                            ? `${st.name} sin disponibilidad (${closedOverride.reason || 'Día bloqueado'})`
                            : `Agendar con ${st.name} a las ${String(hour).padStart(2, '0')}:00`
                        }
                        onClick={() =>
                          onOpenNewForStaff(
                            st.id,
                            dateKey,
                            buildZonedIsoForDateAndMinutes(dateKey, hour * 60, timezone),
                          )
                        }
                      >
                        {!closedOverride ? (
                          <Text type="supporting" className="ad-cal-slot-hover-hint">
                            + {`${String(hour).padStart(2, '0')}:00`}
                          </Text>
                        ) : null}
                      </button>
                    ))}

                    {elapsedPct > 0 ? (
                      <VStack
                        className="ad-cal-past"
                        style={{ height: `${elapsedPct}%` }}
                        aria-hidden="true"
                        gap={0}
                      />
                    ) : null}

                    {closedOverride ? (
                      <VStack
                        className="ad-cal-block"
                        style={{ top: '0%', height: '100%' }}
                        gap={0.5}
                      >
                        <Text type="supporting" weight="semibold" maxLines={2}>
                          Cerrado · {closedOverride.reason || 'Día bloqueado'}
                        </Text>
                      </VStack>
                    ) : null}

                    {staffBlocks.map((blk) => {
                      const blkStart = parseTimeMinutes(blk.startTime);
                      const blkEnd = parseTimeMinutes(blk.endTime);
                      const geo = computeBlockGeometryPercent(
                        blkStart,
                        Math.max(30, blkEnd - blkStart),
                      );
                      return (
                        <VStack
                          key={blk.id}
                          className="ad-cal-block"
                          style={{
                            top: `${geo.topPct}%`,
                            height: `${geo.heightPct}%`,
                          }}
                          gap={0}
                        >
                          <Text type="supporting" weight="semibold" maxLines={1}>
                            {blk.startTime}–{blk.endTime} · {blk.reason}
                          </Text>
                        </VStack>
                      );
                    })}

                    {openSlots
                      .filter((slot) => slot.isFixedTurn)
                      .map((slot) => (
                        <button
                          key={`open-${st.id}-${slot.timeHHMM}`}
                          type="button"
                          className="ad-cal-open-slot"
                          style={{
                            top: `${slot.topPct}%`,
                            height: `${slot.heightPct}%`,
                          }}
                          onClick={() =>
                            onOpenNewForStaff(
                              st.id,
                              dateKey,
                              buildZonedIsoForDateAndMinutes(
                                dateKey,
                                slot.startMinutes,
                                timezone,
                              ),
                            )
                          }
                        >
                          <HStack justify="between" align="center" width="100%" gap={1}>
                            <Text size="sm" weight="medium" hasTabularNumbers>
                              {slot.timeHHMM} · Libre
                            </Text>
                            <Plus size={13} aria-hidden="true" />
                          </HStack>
                        </button>
                      ))}

                    {nowIndicator.visible ? (
                      <VStack
                        className="ad-cal-now-line"
                        style={{ top: `${nowIndicator.topPct}%` }}
                        aria-hidden="true"
                        gap={0}
                      />
                    ) : null}

                    {dropGhostGeo && drag.activeDrag ? (
                      <VStack
                        className="ad-cal-drop-ghost"
                        style={{
                          top: `${dropGhostGeo.topPct}%`,
                          height: `${dropGhostGeo.heightPct}%`,
                        }}
                        aria-hidden="true"
                        gap={0}
                      >
                        <Text size="sm" weight="semibold" hasTabularNumbers>
                          {formatMinutesHHMM(drag.activeDrag.targetStartMinutes)} –{' '}
                          {formatMinutesHHMM(
                            drag.activeDrag.targetStartMinutes +
                              drag.activeDrag.targetDurationMinutes,
                          )}
                        </Text>
                      </VStack>
                    ) : null}

                    {staffBookings.map((booking) =>
                      renderBookingEvent(booking, dateKey, st.id, false),
                    )}
                  </VStack>
                );
              })}
            </HStack>
          </VStack>
        ) : (
          <VStack
            className="ad-cal-grid"
            data-mode="week"
            style={{
              ['--ad-cal-cols' as string]: '7',
            }}
            gap={0}
          >
            <HStack className="ad-cal-head-row" gap={0} align="stretch">
              <VStack className="ad-cal-gutter-head" justify="center" align="center">
                <Text type="supporting" color="secondary" size="sm">
                  Hora
                </Text>
              </VStack>
              {weekDays.map((day) => (
                <button
                  key={day.dateKey}
                  type="button"
                  className="ad-cal-col-head ad-cal-week-day-btn"
                  data-today={day.isToday ? 'true' : 'false'}
                  onClick={() => onJumpToDay(day.dateKey)}
                >
                  <HStack justify="between" align="center" width="100%" gap={1}>
                    <VStack gap={0} align="start">
                      <Text type="supporting" color="secondary" className="ad-cal-week-wd">
                        {day.shortDay}
                      </Text>
                      <Text weight="semibold" size="base" hasTabularNumbers>
                        {day.dayNum}
                      </Text>
                    </VStack>
                    {day.items.length > 0 ? (
                      <Badge variant="neutral" label={String(day.items.length)} />
                    ) : null}
                  </HStack>
                </button>
              ))}
            </HStack>

            <HStack className="ad-cal-body-row" gap={0} align="stretch">
              <VStack className="ad-cal-gutter" gap={0}>
                {CALENDAR_HOURS.map((hour) => (
                  <VStack key={hour} className="ad-cal-gutter-hour" justify="start">
                    <Text type="supporting" color="secondary" hasTabularNumbers className="ad-cal-hour-label">
                      {`${String(hour).padStart(2, '0')}:00`}
                    </Text>
                  </VStack>
                ))}
              </VStack>

              {weekDays.map((day) => {
                const dayNow = computeNowIndicator(nowMs, day.dateKey, todayKey, timezone);
                const dayElapsedPct = computeElapsedPercent(
                  computeElapsedMinutesForDate(nowMs, day.dateKey, todayKey, timezone),
                );
                const isDropTarget =
                  Boolean(drag.activeDrag?.isDragging) &&
                  drag.activeDrag?.targetDateKey === day.dateKey;
                const dropGhostGeo =
                  isDropTarget && drag.activeDrag
                    ? computeBlockGeometryPercent(
                        drag.activeDrag.targetStartMinutes,
                        drag.activeDrag.targetDurationMinutes,
                      )
                    : null;

                return (
                  <VStack
                    key={day.dateKey}
                    className="ad-cal-col-body"
                    data-cal-date={day.dateKey}
                    data-today={day.isToday ? 'true' : 'false'}
                    data-drop-active={isDropTarget ? 'true' : 'false'}
                    gap={0}
                  >
                    {CALENDAR_HOURS.map((hour) => (
                      <button
                        key={hour}
                        type="button"
                        className="ad-cal-hour-slot"
                        aria-label={`Agendar el ${day.dateKey} a las ${String(hour).padStart(2, '0')}:00`}
                        onClick={() =>
                          onOpenNewForStaff(
                            activeStaff.length === 1 ? (activeStaff[0]?.id ?? 'any') : 'any',
                            day.dateKey,
                            buildZonedIsoForDateAndMinutes(day.dateKey, hour * 60, timezone),
                          )
                        }
                      >
                        <Text type="supporting" className="ad-cal-slot-hover-hint">
                          + {`${String(hour).padStart(2, '0')}:00`}
                        </Text>
                      </button>
                    ))}

                    {dayElapsedPct > 0 ? (
                      <VStack
                        className="ad-cal-past"
                        style={{ height: `${dayElapsedPct}%` }}
                        aria-hidden="true"
                        gap={0}
                      />
                    ) : null}

                    {dayNow.visible ? (
                      <VStack
                        className="ad-cal-now-line"
                        style={{ top: `${dayNow.topPct}%` }}
                        aria-hidden="true"
                        gap={0}
                      />
                    ) : null}

                    {dropGhostGeo && drag.activeDrag ? (
                      <VStack
                        className="ad-cal-drop-ghost"
                        style={{
                          top: `${dropGhostGeo.topPct}%`,
                          height: `${dropGhostGeo.heightPct}%`,
                        }}
                        aria-hidden="true"
                        gap={0}
                      >
                        <Text size="sm" weight="semibold" hasTabularNumbers>
                          {formatMinutesHHMM(drag.activeDrag.targetStartMinutes)}
                        </Text>
                      </VStack>
                    ) : null}

                    {day.items.map((booking) =>
                      renderBookingEvent(booking, day.dateKey, booking.staffId, true),
                    )}
                  </VStack>
                );
              })}
            </HStack>
          </VStack>
        )}
      </VStack>

      <Text type="supporting" color="secondary" className="ad-hide-s">
        Arrastra una cita para moverla, estira su borde inferior para ajustar duración o haz clic en un hueco libre.
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
