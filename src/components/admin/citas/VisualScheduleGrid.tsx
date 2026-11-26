'use client';

import { useMemo } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Token } from '@astryxdesign/core/Token';
import { Link } from '@astryxdesign/core/Link';
import { Divider } from '@astryxdesign/core/Divider';
import {
  AtSign,
  Ban,
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  DollarSign,
  Plus,
} from 'lucide-react';
import { computeBookingPaymentSummary } from '@/lib/payments/splits';
import type {
  AvailabilitySchedule,
  BookingStatus,
  BookingWithRelations,
  PaymentSplit,
  RecurringBlock,
  Service,
  StaffMember,
} from '@/lib/types';
import {
  formatDateShortInTimezone,
  formatTimeInTimezone,
  getDateKeyInTimezone,
} from '@/lib/format';
import {
  BOOKING_STATUS_BADGE,
  buildInstagramProfileUrl,
  getProofBadgeMeta,
} from './BookingCard';

const TIMELINE_HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20] as const;

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [y = 2026, m = 1, d = 1] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

function getDayOfWeekFromDateKey(dateKey: string): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  const [y = 2026, m = 1, d = 1] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay() as
    | 0
    | 1
    | 2
    | 3
    | 4
    | 5
    | 6;
}

function getLocalHourInTimezone(iso: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const raw = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  return raw === 24 ? 0 : raw;
}

function parseTimeMinutes(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function doesRecurringBlockApplyOnDate(
  block: RecurringBlock,
  dateKey: string,
  dow: number,
): boolean {
  if (!block.isActive) return false;
  if (block.untilDate && dateKey > block.untilDate) return false;
  if (block.frequency === 'weekly') {
    return block.weekdays.includes(dow);
  }
  const dayOfMonth = Number(dateKey.slice(8, 10));
  return block.dayOfMonth === dayOfMonth;
}

function doesBlockOverlapHour(block: RecurringBlock, hour: number): boolean {
  const startMin = parseTimeMinutes(block.startTime);
  const endMin = parseTimeMinutes(block.endTime);
  const hourStart = hour * 60;
  const hourEnd = (hour + 1) * 60;
  return startMin < hourEnd && endMin > hourStart;
}

interface VisualScheduleGridProps {
  dateKey: string;
  todayKey: string;
  timezone: string;
  staff: StaffMember[];
  schedules: AvailabilitySchedule[];
  recurringBlocks?: RecurringBlock[];
  paymentSplits?: PaymentSplit[];
  bookings: BookingWithRelations[];
  allServices: Service[];
  remindingBookingId: string | null;
  onChangeDate: (nextDateKey: string) => void;
  onOpenNewForStaff: (staffId: string) => void;
  onSelectBooking: (booking: BookingWithRelations) => void;
  onUpdateStatus: (bookingId: string, status: BookingStatus) => void;
  onOpenCheckout: (booking: BookingWithRelations) => void;
  onSendReminder: (bookingId: string) => void;
}

export function VisualScheduleGrid({
  dateKey,
  todayKey,
  timezone,
  staff,
  schedules,
  recurringBlocks = [],
  paymentSplits = [],
  bookings,
  allServices,
  remindingBookingId,
  onChangeDate,
  onOpenNewForStaff,
  onSelectBooking,
  onUpdateStatus,
  onOpenCheckout,
  onSendReminder,
}: VisualScheduleGridProps) {
  const activeStaff = useMemo(
    () => staff.filter((s) => s.isActive).toSorted((a, b) => a.displayOrder - b.displayOrder),
    [staff],
  );

  const staffColorIndex = useMemo(() => {
    const map = new Map<string, number>();
    activeStaff.forEach((st, idx) => {
      map.set(st.id, idx % 4);
    });
    return map;
  }, [activeStaff]);

  const dayBookings = useMemo(
    () =>
      bookings
        .filter((b) => getDateKeyInTimezone(new Date(b.startAt), timezone) === dateKey)
        .toSorted((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()),
    [bookings, dateKey, timezone],
  );

  const dow = getDayOfWeekFromDateKey(dateKey);

  const activeBlocksByStaff = useMemo(() => {
    const map = new Map<string, RecurringBlock[]>();
    for (const st of activeStaff) {
      map.set(
        st.id,
        recurringBlocks.filter(
          (b) => b.staffId === st.id && doesRecurringBlockApplyOnDate(b, dateKey, dow),
        ),
      );
    }
    return map;
  }, [activeStaff, recurringBlocks, dateKey, dow]);

  const fixedTimesByStaff = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const st of activeStaff) {
      const sched = schedules.find((sc) => sc.staffId === st.id && sc.isDefault);
      const times = (sched?.rules ?? [])
        .filter((r) => r.dayOfWeek === dow)
        .flatMap((r) => r.fixedStartTimes ?? [])
        .toSorted();
      map.set(st.id, Array.from(new Set(times)));
    }
    return map;
  }, [activeStaff, schedules, dow]);

  const formattedDate = formatDateShortInTimezone(`${dateKey}T18:00:00Z`, timezone);
  const tomorrowKey = shiftDateKey(todayKey, 1);

  return (
    <VStack gap={4} key={dateKey} className="fx-step-in">
      <HStack className="ad-surface" data-padded="true" justify="between" align="center" wrap="wrap" gap={3}>
        <HStack gap={2} align="center" wrap="wrap">
          <Button
            label="Día anterior"
            isIconOnly
            size="sm"
            variant="secondary"
            icon={<ChevronLeft size={15} />}
            onClick={() => onChangeDate(shiftDateKey(dateKey, -1))}
          />
          <Heading level={2} className="lk-serif ad-h2">
            {formattedDate}
          </Heading>
          <Button
            label="Día siguiente"
            isIconOnly
            size="sm"
            variant="secondary"
            icon={<ChevronRight size={15} />}
            onClick={() => onChangeDate(shiftDateKey(dateKey, 1))}
          />
          <button
            type="button"
            className="ad-pill fx-press"
            data-on={dateKey === todayKey ? 'true' : 'false'}
            aria-pressed={dateKey === todayKey}
            onClick={() => onChangeDate(todayKey)}
          >
            Hoy
          </button>
          <button
            type="button"
            className="ad-pill fx-press"
            data-on={dateKey === tomorrowKey ? 'true' : 'false'}
            aria-pressed={dateKey === tomorrowKey}
            onClick={() => onChangeDate(tomorrowKey)}
          >
            Mañana
          </button>
        </HStack>

        <HStack gap={2} align="center">
          <Text
            color="inherit"
            className="ad-chip"
            data-tone={dayBookings.length > 0 ? 'accent' : 'neutral'}
            hasTabularNumbers
          >
            {dayBookings.length} {dayBookings.length === 1 ? 'cita' : 'citas'}
          </Text>
        </HStack>
      </HStack>

      <Grid
        className="fx-stagger"
        columns={{ minWidth: 210, max: Math.max(1, activeStaff.length) }}
        gap={3}
      >
        {activeStaff.map((st) => {
          const staffDayCount = dayBookings.filter((b) => b.staffId === st.id).length;
          const fixedTimes = fixedTimesByStaff.get(st.id) ?? [];
          const staffDayBlocks = activeBlocksByStaff.get(st.id) ?? [];
          const colorIdx = staffColorIndex.get(st.id) ?? 0;
          return (
            <VStack
              key={st.id}
              className="ad-surface"
              data-padded="true"
              data-tone="subtle"
              gap={1.5}
            >
              <HStack justify="between" align="center" gap={2}>
                <VStack gap={0.5} className="rb-grow">
                  <HStack gap={1.5} align="center">
                    <Text className="ad-dot" data-idx={String(colorIdx)} aria-hidden="true">
                      {'\u200B'}
                    </Text>
                    <Heading level={3} className="lk-serif ad-h3">
                      {st.name}
                    </Heading>
                    <Text color="inherit" className="ad-chip" data-tone="neutral" hasTabularNumbers>
                      {staffDayCount}
                    </Text>
                  </HStack>
                  <Text type="supporting" color="secondary" hasTabularNumbers>
                    {fixedTimes.length > 0
                      ? `Turnos: ${fixedTimes.join(' · ')}`
                      : st.roleTitle}
                  </Text>
                </VStack>
                <Button
                  label={`Agendar con ${st.name}`}
                  isIconOnly
                  size="sm"
                  variant="secondary"
                  icon={<Plus size={14} />}
                  onClick={() => onOpenNewForStaff(st.id)}
                />
              </HStack>
              {staffDayBlocks.length > 0 ? (
                <HStack gap={1} wrap="wrap">
                  {staffDayBlocks.map((blk) => (
                    <Token
                      key={blk.id}
                      size="sm"
                      color="orange"
                      icon={<Ban size={11} />}
                      label={`${blk.startTime}–${blk.endTime} ${blk.reason}`}
                    />
                  ))}
                </HStack>
              ) : null}
            </VStack>
          );
        })}
      </Grid>

      <VStack className="ad-surface" gap={0}>
        <VStack className="ad-row-list" gap={0}>
          {TIMELINE_HOURS.map((hour) => {
            const hourLabel = `${String(hour).padStart(2, '0')}:00`;
            const bookingsAtHour = dayBookings.filter(
              (b) => getLocalHourInTimezone(b.startAt, timezone) === hour,
            );
            const hasFixedAtHour = activeStaff.some((st) =>
              (fixedTimesByStaff.get(st.id) ?? []).some((t) => Number(t.slice(0, 2)) === hour),
            );
            const hasBlockAtHour = activeStaff.some((st) =>
              (activeBlocksByStaff.get(st.id) ?? []).some((blk) =>
                doesBlockOverlapHour(blk, hour),
              ),
            );
            const isQuietHour =
              bookingsAtHour.length === 0 && !hasFixedAtHour && !hasBlockAtHour;

            return (
              <VStack
                key={hour}
                className="ad-row-item"
                data-muted={isQuietHour ? 'true' : undefined}
                gap={2}
                align="stretch"
              >
                <HStack justify="between" align="center" gap={2} wrap="wrap" width="100%">
                  <HStack gap={1.5} align="center">
                    <Clock size={14} aria-hidden="true" />
                    <Text weight="bold" hasTabularNumbers>
                      {hourLabel}
                    </Text>
                  </HStack>
                  <HStack gap={1.5} wrap="wrap">
                    {hasFixedAtHour ? (
                      <Text color="inherit" className="ad-chip" data-tone="neutral">
                        Turno fijo
                      </Text>
                    ) : null}
                    {hasBlockAtHour ? (
                      <Text color="inherit" className="ad-chip" data-tone="warning">
                        Bloqueo recurrente
                      </Text>
                    ) : null}
                  </HStack>
                </HStack>

                <Grid
                  columns={{ minWidth: 210, max: Math.max(1, activeStaff.length) }}
                  gap={2}
                  align="start"
                  width="100%"
                >
                  {activeStaff.map((st) => {
                    const cellBookings = bookingsAtHour.filter((b) => b.staffId === st.id);
                    const staffFixedInHour = (fixedTimesByStaff.get(st.id) ?? []).filter(
                      (t) => Number(t.slice(0, 2)) === hour,
                    );
                    const cellBlocks = (activeBlocksByStaff.get(st.id) ?? []).filter(
                      (blk) => doesBlockOverlapHour(blk, hour),
                    );
                    const colorIdx = staffColorIndex.get(st.id) ?? 0;

                    if (cellBookings.length === 0) {
                      return (
                        <VStack
                          key={st.id}
                          className="ad-surface"
                          data-tone="subtle"
                          data-padded="true"
                          gap={1.5}
                        >
                          <HStack justify="between" align="center" gap={2}>
                            <HStack gap={1.5} align="center" className="rb-grow">
                              <Text
                                className="ad-dot"
                                data-idx={String(colorIdx)}
                                aria-hidden="true"
                              >
                                {'\u200B'}
                              </Text>
                              <Text type="supporting" color="secondary" hasTabularNumbers>
                                {st.name}:{' '}
                                {cellBlocks.length > 0
                                  ? 'Bloqueado'
                                  : staffFixedInHour.length > 0
                                    ? `Libre (${staffFixedInHour.join(', ')})`
                                    : 'Sin citas'}
                              </Text>
                            </HStack>
                            {cellBlocks.length === 0 && staffFixedInHour.length > 0 ? (
                              <Button
                                label="Agendar"
                                size="sm"
                                variant="ghost"
                                onClick={() => onOpenNewForStaff(st.id)}
                              />
                            ) : null}
                          </HStack>
                          {cellBlocks.map((blk) => (
                            <Token
                              key={blk.id}
                              size="sm"
                              color="orange"
                              icon={<Ban size={11} />}
                              label={`${blk.startTime}–${blk.endTime} · ${blk.reason}`}
                            />
                          ))}
                        </VStack>
                      );
                    }

                    return (
                      <VStack key={st.id} gap={2}>
                        {cellBlocks.map((blk) => (
                          <Token
                            key={blk.id}
                            size="sm"
                            color="orange"
                            icon={<Ban size={11} />}
                            label={`${blk.startTime}–${blk.endTime} · ${blk.reason}`}
                          />
                        ))}
                        {cellBookings.map((b) => {
                          const statusMeta = BOOKING_STATUS_BADGE[b.status];
                          const igHandle =
                            b.clientInstagram ?? b.client.instagramHandle ?? null;
                          const igUrl = buildInstagramProfileUrl(igHandle);
                          const proofMeta = getProofBadgeMeta(b);
                          const extraNames = (b.extraServiceIds ?? [])
                            .map((id) => allServices.find((s) => s.id === id)?.name)
                            .filter((n): n is string => Boolean(n));
                          const paymentSummary = computeBookingPaymentSummary(
                            b.totalPriceCents,
                            paymentSplits.filter((s) => s.bookingId === b.id),
                          );
                          const canRemind =
                            b.status === 'confirmed' ||
                            b.status === 'pending_confirmation' ||
                            b.status === 'pending_payment';
                          const canCollect =
                            b.status === 'confirmed' ||
                            (b.status === 'completed' && paymentSummary.isUncollected);

                          return (
                            <VStack
                              key={b.id}
                              as="article"
                              className="ad-surface fx-card-lift"
                              data-padded="true"
                              gap={2}
                            >
                              <HStack justify="between" align="center" gap={1.5} wrap="wrap">
                                <HStack gap={1.5} align="center">
                                  <Text
                                    className="ad-dot"
                                    data-idx={String(colorIdx)}
                                    aria-hidden="true"
                                  >
                                    {'\u200B'}
                                  </Text>
                                  <Text weight="semibold" size="sm" hasTabularNumbers>
                                    {formatTimeInTimezone(b.startAt, timezone, true)} –{' '}
                                    {formatTimeInTimezone(b.endAt, timezone, true)}
                                  </Text>
                                </HStack>
                                <Badge
                                  variant={statusMeta.variant}
                                  label={statusMeta.label}
                                />
                              </HStack>

                              <VStack gap={0.5} align="start">
                                <button
                                  type="button"
                                  className="ad-inline-link fx-press"
                                  onClick={() => onSelectBooking(b)}
                                  style={{
                                    border: 0,
                                    background: 'transparent',
                                    padding: 0,
                                    font: 'inherit',
                                    textAlign: 'start',
                                    cursor: 'pointer',
                                    color: 'var(--color-text-primary)',
                                  }}
                                >
                                  <Text weight="semibold" size="base">
                                    {b.client.fullName}
                                  </Text>
                                </button>

                                <Text type="supporting" color="secondary">
                                  {b.service.name}
                                  {extraNames.length > 0
                                    ? ` + ${extraNames.join(' + ')}`
                                    : ''}{' '}
                                  · {st.name}
                                </Text>
                              </VStack>

                              <HStack gap={1.5} align="center" wrap="wrap">
                                {igHandle && igUrl ? (
                                  <HStack gap={1} align="center">
                                    <AtSign size={12} aria-hidden="true" />
                                    <Link href={igUrl} isExternalLink size="sm">
                                      {igHandle}
                                    </Link>
                                  </HStack>
                                ) : null}
                                {proofMeta ? (
                                  <Token
                                    size="sm"
                                    color={proofMeta.color}
                                    label={proofMeta.label}
                                  />
                                ) : null}
                                {b.status !== 'canceled' &&
                                b.status !== 'no_show' &&
                                paymentSummary.isUncollected ? (
                                  <Text color="inherit" className="ad-chip" data-tone="warning">
                                    Por cobrar
                                  </Text>
                                ) : null}
                              </HStack>

                              <Divider />

                              <HStack gap={1.5} wrap="wrap">
                                <Button
                                  label="Gestionar"
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => onSelectBooking(b)}
                                />
                                {b.status === 'pending_confirmation' ||
                                b.status === 'pending_payment' ? (
                                  <Button
                                    label="Confirmar"
                                    size="sm"
                                    variant="primary"
                                    icon={<Check size={13} />}
                                    onClick={() => onUpdateStatus(b.id, 'confirmed')}
                                  />
                                ) : null}
                                {canCollect ? (
                                  <Button
                                    label="Cobrar"
                                    size="sm"
                                    variant="primary"
                                    icon={<DollarSign size={13} aria-hidden="true" />}
                                    onClick={() => onOpenCheckout(b)}
                                  />
                                ) : null}
                                {canRemind ? (
                                  <Button
                                    label="Recordatorio"
                                    size="sm"
                                    variant="secondary"
                                    icon={<Bell size={13} />}
                                    isLoading={remindingBookingId === b.id}
                                    onClick={() => onSendReminder(b.id)}
                                  />
                                ) : null}
                              </HStack>
                            </VStack>
                          );
                        })}
                      </VStack>
                    );
                  })}
                </Grid>
              </VStack>
            );
          })}
        </VStack>
      </VStack>
    </VStack>
  );
}
