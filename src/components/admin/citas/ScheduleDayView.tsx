'use client';

import { useMemo } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Plus } from 'lucide-react';
import {
  formatHour12h,
  formatMinutes12h,
  formatTimeHHMM12h,
} from '@/lib/format';
import type {
  AvailabilitySchedule,
  BookingWithRelations,
  CashRegisterEntry,
  DateOverride,
  PaymentSplit,
  RecurringBlock,
  StaffMember,
} from '@/lib/types';
import {
  buildActiveBlocksByStaff,
  buildFixedTimesByStaff,
  buildStaffOpenSlots,
  CALENDAR_HOURS,
  computeBlockGeometryPercent,
  computeElapsedMinutesForDate,
  computeElapsedPercent,
  computeNowIndicator,
  formatMinutesHHMM,
  getDayOfWeekFromDateKey,
  groupScheduleItemsByKey,
  parseTimeMinutes,
  type CalendarOpenSlot,
} from './scheduleGridGeometry';
import {
  ScheduleEventCard,
  type ScheduleSharedViewContext,
} from './ScheduleEventCard';

const EMPTY_PAYMENT_SPLITS: readonly PaymentSplit[] = [];
const EMPTY_CASH_ENTRIES: readonly CashRegisterEntry[] = [];
const EMPTY_BOOKINGS: readonly BookingWithRelations[] = [];
const EMPTY_OPEN_SLOTS: readonly CalendarOpenSlot[] = [];

export interface TriggerEmptySlotInput {
  readonly dateKey: string;
  readonly startMinutes: number;
  readonly startTimeHHMM: string;
  readonly staffId: string;
  readonly staffName: string | null;
}

interface ScheduleDayViewProps {
  dateKey: string;
  todayKey: string;
  activeStaff: readonly StaffMember[];
  schedules: readonly AvailabilitySchedule[];
  dateOverrides: readonly DateOverride[];
  recurringBlocks: readonly RecurringBlock[];
  dayBookings: readonly BookingWithRelations[];
  shared: ScheduleSharedViewContext;
  onOpenNewForStaff: (staffId: string, preferredDateKey?: string) => void;
  onTriggerEmptySlot: (input: TriggerEmptySlotInput) => void;
}

export function ScheduleDayView({
  dateKey,
  todayKey,
  activeStaff,
  schedules,
  dateOverrides,
  recurringBlocks,
  dayBookings,
  shared,
  onOpenNewForStaff,
  onTriggerEmptySlot,
}: ScheduleDayViewProps) {
  const {
    timezone,
    nowMs,
    allStaffColorIndex,
    splitsByBookingId,
    cashEntriesByBookingId,
    serviceNameById,
    hasEmptySlotHandler,
    busyBookingId,
    busyStatus,
    reschedulingBookingId,
    drag,
    onSelectBooking,
    onUpdateStatus,
    onOpenCheckout,
  } = shared;
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

  const dayBookingsByStaffId = useMemo(
    () => groupScheduleItemsByKey(dayBookings, (b) => b.staffId),
    [dayBookings],
  );
  const activeBookingCountByStaffId = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of dayBookings) {
      if (b.status !== 'canceled') map.set(b.staffId, (map.get(b.staffId) ?? 0) + 1);
    }
    return map;
  }, [dayBookings]);

  const elapsedMinutes = computeElapsedMinutesForDate(nowMs, dateKey, todayKey, timezone);
  const elapsedPct = computeElapsedPercent(elapsedMinutes);
  const nowIndicator = useMemo(
    () => computeNowIndicator(nowMs, dateKey, todayKey, timezone),
    [nowMs, dateKey, todayKey, timezone],
  );

  const openSlotsByStaffId = useMemo(() => {
    const map = new Map<string, CalendarOpenSlot[]>();
    for (const st of activeStaff) {
      if (unavailableOverrideByStaffId.has(st.id)) {
        map.set(st.id, []);
        continue;
      }
      map.set(
        st.id,
        buildStaffOpenSlots({
          fixedTimes: fixedTimesByStaff.get(st.id) ?? [],
          staffBookings: dayBookingsByStaffId.get(st.id) ?? EMPTY_BOOKINGS,
          staffBlocks: activeBlocksByStaff.get(st.id) ?? [],
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

  return (
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
                      ? fixedTimes.map(formatTimeHHMM12h).join(' · ')
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
                {formatHour12h(hour)}
              </Text>
            </VStack>
          ))}
          {nowIndicator.visible ? (
            <Text
              className="ad-cal-now-pill"
              hasTabularNumbers
              style={{ top: `${nowIndicator.topPct}%` }}
            >
              {formatTimeHHMM12h(nowIndicator.label)}
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
              {CALENDAR_HOURS.map((hour) => {
                const hourHHMM = formatMinutesHHMM(hour * 60);
                const hourLabel = formatTimeHHMM12h(hourHHMM);
                return (
                  <button
                    key={hour}
                    type="button"
                    className="ad-cal-hour-slot"
                    disabled={Boolean(closedOverride)}
                    aria-label={
                      closedOverride
                        ? `${st.name} sin disponibilidad (${closedOverride.reason || 'Día bloqueado'})`
                        : hasEmptySlotHandler
                          ? `Opciones para ${st.name} a las ${hourLabel}`
                          : `Agendar con ${st.name} a las ${hourLabel}`
                    }
                    onClick={() =>
                      onTriggerEmptySlot({
                        dateKey,
                        startMinutes: hour * 60,
                        startTimeHHMM: hourHHMM,
                        staffId: st.id,
                        staffName: st.name,
                      })
                    }
                  >
                    {!closedOverride ? (
                      <Text type="supporting" className="ad-cal-slot-hover-hint">
                        + {hourLabel}
                      </Text>
                    ) : null}
                  </button>
                );
              })}

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
                      {formatTimeHHMM12h(blk.startTime)}–{formatTimeHHMM12h(blk.endTime)} · {blk.reason}
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
                      onTriggerEmptySlot({
                        dateKey,
                        startMinutes: slot.startMinutes,
                        startTimeHHMM: slot.timeHHMM,
                        staffId: st.id,
                        staffName: st.name,
                      })
                    }
                  >
                    <HStack justify="between" align="center" width="100%" gap={1}>
                      <Text size="sm" weight="medium" hasTabularNumbers>
                        {formatTimeHHMM12h(slot.timeHHMM)} · Libre
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
                    {formatMinutes12h(drag.activeDrag.targetStartMinutes)} –{' '}
                    {formatMinutes12h(
                      drag.activeDrag.targetStartMinutes +
                        drag.activeDrag.targetDurationMinutes,
                    )}
                  </Text>
                </VStack>
              ) : null}

              {staffBookings.map((booking) => (
                <ScheduleEventCard
                  key={booking.id}
                  booking={booking}
                  columnDateKey={dateKey}
                  columnStaffId={st.id}
                  compact={false}
                  timezone={timezone}
                  nowMs={nowMs}
                  colorIdx={allStaffColorIndex.get(booking.staffId) ?? 0}
                  paymentSplits={splitsByBookingId.get(booking.id) ?? EMPTY_PAYMENT_SPLITS}
                  cashEntries={cashEntriesByBookingId.get(booking.id) ?? EMPTY_CASH_ENTRIES}
                  serviceNameById={serviceNameById}
                  busyBookingId={busyBookingId}
                  busyStatus={busyStatus}
                  reschedulingBookingId={reschedulingBookingId}
                  drag={drag}
                  onSelectBooking={onSelectBooking}
                  onUpdateStatus={onUpdateStatus}
                  onOpenCheckout={onOpenCheckout}
                />
              ))}
            </VStack>
          );
        })}
      </HStack>
    </VStack>
  );
}
