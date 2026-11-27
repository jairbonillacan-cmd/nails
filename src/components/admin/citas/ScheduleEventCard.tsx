'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import {
  Check,
  CheckCircle2,
  DollarSign,
  GripHorizontal,
  UserX,
} from 'lucide-react';
import { BookingStatusTag, StatusTag } from '@/components/ui/StatusTag';
import {
  computeBookingBalance,
  isPendingDepositStatus,
} from '@/lib/booking/balance';
import {
  canTransitionBookingStatus,
  isActiveBookingStatus,
} from '@/lib/booking/state-machine';
import {
  formatMinutes12h,
  formatTimeInTimezone,
} from '@/lib/format';
import type { useScheduleDrag } from '@/lib/hooks/useScheduleDrag';
import type {
  BookingStatus,
  BookingWithRelations,
  CashRegisterEntry,
  PaymentSplit,
} from '@/lib/types';
import {
  computeBlockGeometryPercent,
  getLocalMinutesInTimezone,
} from './scheduleGridGeometry';

type ScheduleDragController = Pick<
  ReturnType<typeof useScheduleDrag>,
  'activeDrag' | 'startDrag' | 'consumeJustDragged'
>;

export interface ScheduleSharedViewContext {
  timezone: string;
  nowMs: number;
  allStaffColorIndex: ReadonlyMap<string, number>;
  splitsByBookingId: ReadonlyMap<string, PaymentSplit[]>;
  cashEntriesByBookingId: ReadonlyMap<string, CashRegisterEntry[]>;
  serviceNameById: ReadonlyMap<string, string>;
  hasEmptySlotHandler: boolean;
  busyBookingId: string | null;
  busyStatus: BookingStatus | null;
  reschedulingBookingId: string | null;
  drag: ScheduleDragController;
  onSelectBooking: (booking: BookingWithRelations) => void;
  onUpdateStatus: (bookingId: string, status: BookingStatus) => void;
  onOpenCheckout: (booking: BookingWithRelations) => void;
}

interface ScheduleEventCardProps {
  booking: BookingWithRelations;
  columnDateKey: string;
  columnStaffId: string;
  compact?: boolean;
  timezone: string;
  nowMs: number;
  colorIdx: number;
  paymentSplits: readonly PaymentSplit[];
  cashEntries: readonly CashRegisterEntry[];
  serviceNameById: ReadonlyMap<string, string>;
  busyBookingId: string | null;
  busyStatus: BookingStatus | null;
  reschedulingBookingId: string | null;
  drag: ScheduleDragController;
  onSelectBooking: (booking: BookingWithRelations) => void;
  onUpdateStatus: (bookingId: string, status: BookingStatus) => void;
  onOpenCheckout: (booking: BookingWithRelations) => void;
}

export function ScheduleEventCard({
  booking,
  columnDateKey,
  columnStaffId,
  compact = false,
  timezone,
  nowMs,
  colorIdx,
  paymentSplits,
  cashEntries,
  serviceNameById,
  busyBookingId,
  busyStatus,
  reschedulingBookingId,
  drag,
  onSelectBooking,
  onUpdateStatus,
  onOpenCheckout,
}: ScheduleEventCardProps) {
  const startMin = getLocalMinutesInTimezone(booking.startAt, timezone);
  const durationMin = Math.max(30, booking.totalDurationMinutes);
  const isThisDragging =
    drag.activeDrag?.bookingId === booking.id && drag.activeDrag.isDragging;
  const effectiveStart =
    isThisDragging && drag.activeDrag ? drag.activeDrag.targetStartMinutes : startMin;
  const effectiveDuration =
    isThisDragging && drag.activeDrag ? drag.activeDrag.targetDurationMinutes : durationMin;
  const geo = computeBlockGeometryPercent(effectiveStart, effectiveDuration);
  const isBusy =
    busyBookingId === booking.id || reschedulingBookingId === booking.id;
  const canDrag = isActiveBookingStatus(booking.status) && !isBusy;
  const isPending = isPendingDepositStatus(booking.status);
  const balance = computeBookingBalance(booking, paymentSplits, cashEntries, nowMs);
  const isPastUnclosed = balance.isPastUnclosed;
  const canCollect =
    booking.status === 'confirmed' ||
    (booking.status === 'completed' && balance.isUncollected) ||
    isPastUnclosed;
  const canMarkCompleted = canTransitionBookingStatus(booking.status, 'completed');
  const canMarkNoShow = canTransitionBookingStatus(booking.status, 'no_show');
  const extraNames = (booking.extraServiceIds ?? [])
    .map((id) => serviceNameById.get(id))
    .filter((n): n is string => Boolean(n));

  return (
    <article
      className={`ad-cal-event${isBusy ? ' fx-busy' : ''}${isThisDragging ? ' ad-cal-event-dragging' : ''}`}
      data-idx={String(colorIdx)}
      data-status={booking.status}
      data-past-unclosed={isPastUnclosed ? 'true' : undefined}
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
                ? `${formatMinutes12h(effectiveStart)} – ${formatMinutes12h(effectiveStart + effectiveDuration)}`
                : `${formatTimeInTimezone(booking.startAt, timezone)} – ${formatTimeInTimezone(booking.endAt, timezone)}`}
            </Text>
            {!compact ? (
              <HStack gap={1} align="center" wrap="wrap">
                {isPastUnclosed ? (
                  <StatusTag tone="warning" showDot label="Pasada sin cerrar" />
                ) : (
                  <BookingStatusTag
                    status={booking.status}
                    hasPaymentProof={Boolean(booking.paymentProofUrl)}
                    showDot
                  />
                )}
                {isActiveBookingStatus(booking.status) &&
                booking.attendanceStatus === 'confirmed' ? (
                  <StatusTag tone="success" label="Confirmó" />
                ) : isActiveBookingStatus(booking.status) &&
                  booking.attendanceStatus === 'rescheduled' ? (
                  <StatusTag tone="accent" label="Reagendó" />
                ) : null}
              </HStack>
            ) : isPastUnclosed ? (
              <StatusTag tone="warning" label="Pasada sin cerrar" />
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
        <HStack gap={1} wrap="wrap" className="ad-cal-event-actions">
          {isPastUnclosed ? (
            <>
              {canCollect ? (
                <Button
                  type="button"
                  data-no-drag="true"
                  label="Cobrar"
                  size="sm"
                  variant="primary"
                  icon={<DollarSign size={12} aria-hidden="true" />}
                  isDisabled={isBusy}
                  onClick={() => onOpenCheckout(booking)}
                />
              ) : null}
              {canMarkCompleted ? (
                <Button
                  type="button"
                  data-no-drag="true"
                  label={busyBookingId === booking.id && busyStatus === 'completed' ? '…' : 'Terminada'}
                  size="sm"
                  variant="secondary"
                  icon={<CheckCircle2 size={12} aria-hidden="true" />}
                  isLoading={busyBookingId === booking.id && busyStatus === 'completed'}
                  isDisabled={isBusy}
                  onClick={() => onUpdateStatus(booking.id, 'completed')}
                />
              ) : null}
              {canMarkNoShow ? (
                <Button
                  type="button"
                  data-no-drag="true"
                  label={busyBookingId === booking.id && busyStatus === 'no_show' ? '…' : 'No llegó'}
                  size="sm"
                  variant="ghost"
                  icon={<UserX size={12} aria-hidden="true" />}
                  isLoading={busyBookingId === booking.id && busyStatus === 'no_show'}
                  isDisabled={isBusy}
                  onClick={() => onUpdateStatus(booking.id, 'no_show')}
                />
              ) : null}
              {isPending ? (
                <Button
                  type="button"
                  data-no-drag="true"
                  label={busyBookingId === booking.id && busyStatus === 'confirmed' ? '…' : 'Confirmar'}
                  size="sm"
                  variant="secondary"
                  icon={<Check size={12} aria-hidden="true" />}
                  isLoading={busyBookingId === booking.id && busyStatus === 'confirmed'}
                  isDisabled={isBusy}
                  onClick={() => onUpdateStatus(booking.id, 'confirmed')}
                />
              ) : null}
            </>
          ) : isPending ? (
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
}
