'use client';

import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Token } from '@astryxdesign/core/Token';
import { Ban, CalendarDays, Clock, Plus } from 'lucide-react';
import { EmptyStateCard, StatusTag, SurfaceCard } from '@/components/ui';
import type {
  AvailabilitySchedule,
  BookingStatus,
  BookingWithRelations,
  PaymentSplit,
  RecurringBlock,
  Service,
  StaffMember,
} from '@/lib/types';
import { formatDateShortInTimezone, getDateKeyInTimezone } from '@/lib/format';
import {
  buildActiveBlocksByStaff,
  buildFixedTimesByStaff,
  buildTimelineHourRows,
  buildWeekScheduleDays,
  getDayOfWeekFromDateKey,
} from './scheduleGridGeometry';
import { ScheduleBookingBlock } from './ScheduleBookingBlock';
import { ScheduleDayHeader } from './ScheduleDayHeader';

interface VisualScheduleGridProps {
  rangeMode: 'day' | 'week';
  dateKey: string;
  todayKey: string;
  timezone: string;
  staff: StaffMember[];
  allStaffColorIndex: ReadonlyMap<string, number>;
  schedules: AvailabilitySchedule[];
  recurringBlocks?: RecurringBlock[];
  paymentSplits?: PaymentSplit[];
  bookings: BookingWithRelations[];
  allServices: Service[];
  busyBookingId?: string | null;
  busyStatus?: BookingStatus | null;
  onChangeDate: (nextDateKey: string) => void;
  onJumpToDay: (nextDateKey: string) => void;
  onOpenNewForStaff: (staffId: string, preferredDateKey?: string) => void;
  onSelectBooking: (booking: BookingWithRelations) => void;
  onUpdateStatus: (bookingId: string, status: BookingStatus) => void;
  onOpenCheckout: (booking: BookingWithRelations) => void;
}

export function VisualScheduleGrid({
  rangeMode,
  dateKey,
  todayKey,
  timezone,
  staff,
  allStaffColorIndex,
  schedules,
  recurringBlocks = [],
  paymentSplits = [],
  bookings,
  allServices,
  busyBookingId = null,
  busyStatus = null,
  onChangeDate,
  onJumpToDay,
  onOpenNewForStaff,
  onSelectBooking,
  onUpdateStatus,
  onOpenCheckout,
}: VisualScheduleGridProps) {
  const [showQuietHours, setShowQuietHours] = useState(false);

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
    () => buildWeekScheduleDays(bookings, todayKey, timezone),
    [bookings, todayKey, timezone],
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
  const timelineRows = useMemo(
    () =>
      buildTimelineHourRows({
        dayBookings,
        activeStaff,
        allStaffColorIndex,
        fixedTimesByStaff,
        activeBlocksByStaff,
        timezone,
        showQuietHours,
      }),
    [
      dayBookings,
      activeStaff,
      allStaffColorIndex,
      fixedTimesByStaff,
      activeBlocksByStaff,
      timezone,
      showQuietHours,
    ],
  );

  if (activeStaff.length === 0) {
    return (
      <EmptyStateCard
        title="Sin manicuristas activas en la agenda"
        description="Activa al menos una manicurista en Equipo para ver los horarios del día."
        icon={<CalendarDays size={22} aria-hidden="true" />}
        actions={<Button label="Ir a Equipo" variant="secondary" size="sm" href="/admin/equipo" />}
      />
    );
  }

  if (rangeMode === 'week') {
    return (
      <Grid
        key={`week-${todayKey}`}
        className="fx-step-in"
        columns={{ minWidth: 280, max: 3 }}
        gap={4}
        align="start"
      >
        {weekDays.map((day) => (
          <SurfaceCard
            key={day.dateKey}
            title={day.label}
            subtitle={
              day.items.length === 0
                ? 'Sin citas todavía'
                : `${day.items.length} ${day.items.length === 1 ? 'cita' : 'citas'}`
            }
            headingLevel={3}
            actions={
              <Button
                type="button"
                label="Ver día"
                size="sm"
                variant="ghost"
                onClick={() => onJumpToDay(day.dateKey)}
              />
            }
          >
            {day.items.length === 0 ? (
              <HStack className="ad-empty-agenda" justify="between" align="center" gap={2}>
                <Text type="supporting" color="secondary">
                  Día libre
                </Text>
                <Button
                  type="button"
                  label="Agendar"
                  size="sm"
                  variant="secondary"
                  icon={<Plus size={13} aria-hidden="true" />}
                  onClick={() =>
                    onOpenNewForStaff(
                      activeStaff.length === 1 ? (activeStaff[0]?.id ?? 'any') : 'any',
                      day.dateKey,
                    )
                  }
                />
              </HStack>
            ) : (
              <VStack className="ad-row-list" gap={0}>
                {day.items.map((b) => (
                  <ScheduleBookingBlock
                    key={b.id}
                    booking={b}
                    variant="compact"
                    colorIdx={allStaffColorIndex.get(b.staffId) ?? 0}
                    timezone={timezone}
                    allServices={allServices}
                    paymentSplits={paymentSplits}
                    isBusy={busyBookingId === b.id}
                    busyStatus={busyBookingId === b.id ? busyStatus : null}
                    onSelectBooking={onSelectBooking}
                    onUpdateStatus={onUpdateStatus}
                    onOpenCheckout={onOpenCheckout}
                  />
                ))}
              </VStack>
            )}
          </SurfaceCard>
        ))}
      </Grid>
    );
  }

  return (
    <VStack gap={4} key={dateKey} className="fx-step-in">
      <ScheduleDayHeader
        dateKey={dateKey}
        formattedDate={formatDateShortInTimezone(`${dateKey}T18:00:00Z`, timezone)}
        showQuietHours={showQuietHours}
        dayBookings={dayBookings}
        activeStaff={activeStaff}
        allStaffColorIndex={allStaffColorIndex}
        fixedTimesByStaff={fixedTimesByStaff}
        activeBlocksByStaff={activeBlocksByStaff}
        onChangeDate={onChangeDate}
        onToggleQuietHours={() => setShowQuietHours((prev) => !prev)}
        onOpenNewForStaff={onOpenNewForStaff}
      />

      {timelineRows.length === 0 ? (
        <EmptyStateCard
          title="Sin citas ni turnos en este día"
          description="Puedes mostrar todas las horas del día o agendar una cita directamente."
          icon={<CalendarDays size={22} aria-hidden="true" />}
          actions={
            <HStack gap={2} wrap="wrap">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                label="Ver todas las horas"
                onClick={() => setShowQuietHours(true)}
              />
              <Button
                type="button"
                size="sm"
                variant="primary"
                label="Agendar cita"
                icon={<Plus size={14} aria-hidden="true" />}
                onClick={() =>
                  onOpenNewForStaff(
                    activeStaff.length === 1 ? (activeStaff[0]?.id ?? 'any') : 'any',
                    dateKey,
                  )
                }
              />
            </HStack>
          }
        />
      ) : (
        <SurfaceCard>
          <VStack className="ad-row-list" gap={0}>
            {timelineRows.map((row) => (
              <VStack
                key={row.hour}
                className="ad-row-item"
                data-muted={row.isQuietHour ? 'true' : undefined}
                gap={2}
                align="stretch"
              >
                <HStack justify="between" align="center" gap={2} wrap="wrap" width="100%">
                  <HStack gap={1.5} align="center">
                    <Clock size={14} aria-hidden="true" />
                    <Text weight="bold" hasTabularNumbers>
                      {row.hourLabel}
                    </Text>
                  </HStack>
                  <HStack gap={1.5} wrap="wrap">
                    {row.hasFixedAtHour ? <StatusTag label="Turno" tone="neutral" /> : null}
                    {row.hasBlockAtHour ? (
                      <StatusTag label="Horario bloqueado" tone="warning" />
                    ) : null}
                  </HStack>
                </HStack>

                <Grid
                  columns={{ minWidth: 210, max: Math.max(1, activeStaff.length) }}
                  gap={2}
                  align="start"
                  width="100%"
                >
                  {row.cells.map((cell) =>
                    cell.bookings.length === 0 ? (
                      <SurfaceCard key={cell.staff.id} tone="subtle" padded>
                        <VStack gap={1.5}>
                          <HStack justify="between" align="center" gap={2}>
                            <HStack gap={1.5} align="center" className="rb-grow">
                              <Text
                                className="ad-dot"
                                data-idx={String(cell.colorIdx)}
                                aria-hidden="true"
                              >
                                {'\u200B'}
                              </Text>
                              <Text type="supporting" color="primary" hasTabularNumbers>
                                {cell.staff.name}:{' '}
                                {cell.blocks.length > 0
                                  ? 'Bloqueado'
                                  : cell.fixedTimes.length > 0
                                    ? `Libre (${cell.fixedTimes.join(', ')})`
                                    : 'Sin citas'}
                              </Text>
                            </HStack>
                            {cell.blocks.length === 0 && cell.fixedTimes.length > 0 ? (
                              <Button
                                label="Agendar"
                                size="sm"
                                variant="ghost"
                                onClick={() => onOpenNewForStaff(cell.staff.id, dateKey)}
                              />
                            ) : null}
                          </HStack>
                          {cell.blocks.map((blk) => (
                            <Token
                              key={blk.id}
                              size="sm"
                              color="orange"
                              icon={<Ban size={11} aria-hidden="true" />}
                              label={`${blk.startTime}–${blk.endTime} · ${blk.reason}`}
                            />
                          ))}
                        </VStack>
                      </SurfaceCard>
                    ) : (
                      <VStack key={cell.staff.id} gap={2}>
                        {cell.blocks.map((blk) => (
                          <Token
                            key={blk.id}
                            size="sm"
                            color="orange"
                            icon={<Ban size={11} aria-hidden="true" />}
                            label={`${blk.startTime}–${blk.endTime} · ${blk.reason}`}
                          />
                        ))}
                        {cell.bookings.map((b) => (
                          <ScheduleBookingBlock
                            key={b.id}
                            booking={b}
                            variant="detailed"
                            colorIdx={cell.colorIdx}
                            timezone={timezone}
                            allServices={allServices}
                            paymentSplits={paymentSplits}
                            staffDisplayName={cell.staff.name}
                            isBusy={busyBookingId === b.id}
                            busyStatus={busyBookingId === b.id ? busyStatus : null}
                            onSelectBooking={onSelectBooking}
                            onUpdateStatus={onUpdateStatus}
                            onOpenCheckout={onOpenCheckout}
                          />
                        ))}
                      </VStack>
                    ),
                  )}
                </Grid>
              </VStack>
            ))}
          </VStack>
        </SurfaceCard>
      )}
    </VStack>
  );
}
