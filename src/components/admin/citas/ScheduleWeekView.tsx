'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Badge } from '@astryxdesign/core/Badge';
import {
  formatHour12h,
  formatMinutes12h,
  formatTimeHHMM12h,
} from '@/lib/format';
import type {
  CashRegisterEntry,
  DateOverride,
  PaymentSplit,
  RecurringBlock,
  StaffMember,
} from '@/lib/types';
import {
  buildActiveBlocksByStaff,
  CALENDAR_HOURS,
  computeBlockGeometryPercent,
  computeElapsedMinutesForDate,
  computeElapsedPercent,
  computeNowIndicator,
  formatMinutesHHMM,
  getDayOfWeekFromDateKey,
  parseTimeMinutes,
  type WeekScheduleDay,
} from './scheduleGridGeometry';
import type { TriggerEmptySlotInput } from './ScheduleDayView';
import {
  ScheduleEventCard,
  type ScheduleSharedViewContext,
} from './ScheduleEventCard';

const EMPTY_PAYMENT_SPLITS: readonly PaymentSplit[] = [];
const EMPTY_CASH_ENTRIES: readonly CashRegisterEntry[] = [];

interface ScheduleWeekViewProps {
  weekDays: readonly WeekScheduleDay[];
  todayKey: string;
  activeStaff: readonly StaffMember[];
  dateOverrides: readonly DateOverride[];
  recurringBlocks: readonly RecurringBlock[];
  shared: ScheduleSharedViewContext;
  onJumpToDay: (nextDateKey: string) => void;
  onTriggerEmptySlot: (input: TriggerEmptySlotInput) => void;
}

export function ScheduleWeekView({
  weekDays,
  todayKey,
  activeStaff,
  dateOverrides,
  recurringBlocks,
  shared,
  onJumpToDay,
  onTriggerEmptySlot,
}: ScheduleWeekViewProps) {
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
  const singleStaff = activeStaff.length === 1 ? (activeStaff[0] ?? null) : null;

  return (
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
                {formatHour12h(hour)}
              </Text>
            </VStack>
          ))}
        </VStack>

        {weekDays.map((day) => {
          const dayNow = computeNowIndicator(nowMs, day.dateKey, todayKey, timezone);
          const dayElapsedPct = computeElapsedPercent(
            computeElapsedMinutesForDate(nowMs, day.dateKey, todayKey, timezone),
          );
          const dayDow = getDayOfWeekFromDateKey(day.dateKey);
          const dayBlocksByStaff = buildActiveBlocksByStaff(
            activeStaff,
            recurringBlocks,
            day.dateKey,
            dayDow,
          );
          const weekDayBlockMap = new Map<
            string,
            { startTime: string; endTime: string; reason: string; staffNames: string[] }
          >();
          for (const st of activeStaff) {
            for (const blk of dayBlocksByStaff.get(st.id) ?? []) {
              const key = `${blk.startTime}|${blk.endTime}|${blk.reason}`;
              const existing = weekDayBlockMap.get(key);
              const firstName = st.name.split(' ')[0] ?? st.name;
              if (existing) {
                existing.staffNames.push(firstName);
              } else {
                weekDayBlockMap.set(key, {
                  startTime: blk.startTime,
                  endTime: blk.endTime,
                  reason: blk.reason,
                  staffNames: [firstName],
                });
              }
            }
          }
          const weekDayBlocks = Array.from(weekDayBlockMap.values());
          const closedStaffOverrides = activeStaff
            .map((st) =>
              dateOverrides.find(
                (ov) =>
                  ov.overrideDate === day.dateKey &&
                  ov.isUnavailable &&
                  (ov.staffId === 'all' || ov.staffId === st.id),
              ),
            )
            .filter((ov): ov is DateOverride => Boolean(ov));
          const allStaffClosedOverride =
            closedStaffOverrides.length === activeStaff.length
              ? (closedStaffOverrides[0] ?? null)
              : null;
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
              {CALENDAR_HOURS.map((hour) => {
                const hourHHMM = formatMinutesHHMM(hour * 60);
                const hourLabel = formatTimeHHMM12h(hourHHMM);
                return (
                  <button
                    key={hour}
                    type="button"
                    className="ad-cal-hour-slot"
                    aria-label={
                      hasEmptySlotHandler
                        ? `Opciones el ${day.dateKey} a las ${hourLabel}`
                        : `Agendar el ${day.dateKey} a las ${hourLabel}`
                    }
                    onClick={() =>
                      onTriggerEmptySlot({
                        dateKey: day.dateKey,
                        startMinutes: hour * 60,
                        startTimeHHMM: hourHHMM,
                        staffId: singleStaff?.id ?? 'any',
                        staffName: singleStaff?.name ?? null,
                      })
                    }
                  >
                    <Text type="supporting" className="ad-cal-slot-hover-hint">
                      + {hourLabel}
                    </Text>
                  </button>
                );
              })}

              {dayElapsedPct > 0 ? (
                <VStack
                  className="ad-cal-past"
                  style={{ height: `${dayElapsedPct}%` }}
                  aria-hidden="true"
                  gap={0}
                />
              ) : null}

              {allStaffClosedOverride ? (
                <VStack
                  className="ad-cal-block"
                  style={{ top: '0%', height: '100%' }}
                  gap={0.5}
                >
                  <Text type="supporting" weight="semibold" maxLines={2}>
                    Cerrado · {allStaffClosedOverride.reason || 'Día bloqueado'}
                  </Text>
                </VStack>
              ) : null}

              {!allStaffClosedOverride
                ? weekDayBlocks.map((blk) => {
                    const blkStart = parseTimeMinutes(blk.startTime);
                    const blkEnd = parseTimeMinutes(blk.endTime);
                    const geo = computeBlockGeometryPercent(
                      blkStart,
                      Math.max(30, blkEnd - blkStart),
                    );
                    const prefix =
                      activeStaff.length > 1 && blk.staffNames.length < activeStaff.length
                        ? `${blk.staffNames.join(', ')} · `
                        : '';
                    return (
                      <VStack
                        key={`${day.dateKey}-${blk.startTime}-${blk.endTime}-${blk.reason}`}
                        className="ad-cal-block"
                        style={{
                          top: `${geo.topPct}%`,
                          height: `${geo.heightPct}%`,
                        }}
                        gap={0}
                      >
                        <Text type="supporting" weight="semibold" maxLines={1}>
                          {prefix}
                          {blk.reason}
                        </Text>
                      </VStack>
                    );
                  })
                : null}

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
                    {formatMinutes12h(drag.activeDrag.targetStartMinutes)}
                  </Text>
                </VStack>
              ) : null}

              {day.items.map((booking) => (
                <ScheduleEventCard
                  key={booking.id}
                  booking={booking}
                  columnDateKey={day.dateKey}
                  columnStaffId={booking.staffId}
                  compact
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
