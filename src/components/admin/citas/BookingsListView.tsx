'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Plus } from 'lucide-react';
import { EmptyStateCard, StatusTag } from '@/components/ui';
import type { AgendaStatusParam } from '@/lib/admin-links';
import {
  computeBookingBalance,
  isPendingDepositStatus,
} from '@/lib/booking/balance';
import { isActiveBookingStatus } from '@/lib/booking/state-machine';
import { useCurrentClockTick } from '@/lib/hooks/useCurrentClockTick';
import type {
  BookingStatus,
  BookingWithRelations,
  CashRegisterEntry,
  PaymentSplit,
  Service,
} from '@/lib/types';
import { getDateKeyInTimezone } from '@/lib/format';
import { BookingCard } from './BookingCard';

export function filterBookingsForAgendaStatus(params: {
  bookings: readonly BookingWithRelations[];
  paymentSplits: readonly PaymentSplit[];
  cashEntries: readonly CashRegisterEntry[];
  serverNowIso: string;
  nowMs?: number;
  status: AgendaStatusParam;
  search: string;
  selectedStaffFilter: string;
}): BookingWithRelations[] {
  const {
    bookings,
    paymentSplits,
    cashEntries,
    serverNowIso,
    nowMs: nowMsProp,
    status,
    search,
    selectedStaffFilter,
  } = params;
  const nowMs =
    typeof nowMsProp === 'number' && Number.isFinite(nowMsProp)
      ? nowMsProp
      : Date.parse(serverNowIso) || Date.now();
  const cleanSearch = search.trim().toLowerCase();

  const matches = bookings.filter((b) => {
    if (selectedStaffFilter !== 'all' && b.staffId !== selectedStaffFilter) {
      return false;
    }
    if (cleanSearch) {
      const ig = (b.clientInstagram ?? b.client.instagramHandle ?? '').toLowerCase();
      const hit =
        b.client.fullName.toLowerCase().includes(cleanSearch) ||
        b.service.name.toLowerCase().includes(cleanSearch) ||
        b.bookingCode.toLowerCase().includes(cleanSearch) ||
        b.client.phoneE164.toLowerCase().includes(cleanSearch) ||
        ig.includes(cleanSearch);
      if (!hit) return false;
    }
    if (status === 'all') return true;
    if (status === 'upcoming') {
      return (
        isActiveBookingStatus(b.status) &&
        Date.parse(b.endAt) >= nowMs - 86_400_000
      );
    }
    if (status === 'pending') {
      return isPendingDepositStatus(b.status);
    }
    if (status === 'uncollected') {
      return computeBookingBalance(b, paymentSplits, cashEntries, nowMs).isUncollected;
    }
    if (status === 'past') {
      return b.status === 'completed' || b.status === 'no_show';
    }
    if (status === 'completed') {
      return b.status === 'completed';
    }
    if (status === 'canceled') {
      return b.status === 'canceled';
    }
    return true;
  });

  const descending =
    status === 'past' || status === 'completed' || status === 'canceled';
  return matches.toSorted((a, b) => {
    const diff = Date.parse(a.startAt) - Date.parse(b.startAt);
    return descending ? -diff : diff;
  });
}

export function filterBookingsForListDate(params: {
  filtered: readonly BookingWithRelations[];
  status: AgendaStatusParam;
  search: string;
  dateKey: string;
  timezone: string;
}): BookingWithRelations[] {
  const { filtered, status, search, dateKey, timezone } = params;
  if (search.trim() || status !== 'upcoming') {
    return [...filtered];
  }
  return filtered.filter(
    (b) => getDateKeyInTimezone(new Date(b.startAt), timezone) === dateKey,
  );
}

interface BookingsListViewProps {
  bookings: BookingWithRelations[];
  status: AgendaStatusParam;
  dateKey: string;
  search: string;
  allServices: Service[];
  paymentSplits: PaymentSplit[];
  cashEntries?: CashRegisterEntry[];
  serverNowIso: string;
  salonName: string;
  currency: 'MXN' | 'USD';
  timezone: string;
  noShowThreshold: number;
  canViewClients?: boolean;
  busyBookingId: string | null;
  busyStatus: BookingStatus | null;
  requestingRescheduleId: string | null;
  onSelectWeekView: () => void;
  onResetFilters?: () => void;
  onOpenNewBooking: () => void;
  onSelectBooking: (booking: BookingWithRelations) => void;
  onUpdateStatus: (bookingId: string, status: BookingStatus) => void;
  onOpenCheckout: (booking: BookingWithRelations) => void;
  onRequestReschedule: (bookingId: string) => void;
}

export function BookingsListView({
  bookings,
  status,
  dateKey,
  search,
  allServices,
  paymentSplits,
  cashEntries = [],
  serverNowIso,
  salonName,
  currency,
  timezone,
  noShowThreshold,
  canViewClients = true,
  busyBookingId,
  busyStatus,
  requestingRescheduleId,
  onSelectWeekView,
  onResetFilters,
  onOpenNewBooking,
  onSelectBooking,
  onUpdateStatus,
  onOpenCheckout,
  onRequestReschedule,
}: BookingsListViewProps) {
  const nowMs = useCurrentClockTick(serverNowIso);

  if (bookings.length === 0) {
    const hasFilter = Boolean(search.trim()) || status !== 'upcoming';
    return (
      <EmptyStateCard
        key={`${status}-${dateKey}-empty`}
        headingLevel={2}
        isCompact
        title="No hay citas en esta vista"
        description={
          hasFilter
            ? 'Prueba limpiando los filtros o revisando otra fecha.'
            : 'No hay citas para este día. Puedes ver toda la semana o agendar una nueva cita.'
        }
        actions={
          <HStack gap={2} wrap="wrap" justify="center">
            {hasFilter && onResetFilters ? (
              <Button
                type="button"
                label="Ver próximas"
                variant="secondary"
                size="sm"
                onClick={onResetFilters}
              />
            ) : null}
            {!hasFilter ? (
              <Button
                type="button"
                label="Ver semana"
                variant="secondary"
                size="sm"
                onClick={onSelectWeekView}
              />
            ) : null}
            <Button
              type="button"
              label="Nueva cita"
              variant="primary"
              size="sm"
              icon={<Plus size={14} aria-hidden="true" />}
              onClick={onOpenNewBooking}
            />
          </HStack>
        }
      />
    );
  }

  return (
    <VStack gap={3} key={`${status}-${dateKey}-list`}>
      {bookings.map((b) => {
        const isRisk =
          b.client.noShowCount >= noShowThreshold || Boolean(b.noShowPolicyEnforced);
        return (
          <VStack key={b.id} gap={1.5}>
            {isRisk ? (
              <HStack gap={2} align="center" wrap="wrap">
                <StatusTag
                  label={`${b.client.noShowCount} inasistencias previas`}
                  tone="warning"
                  hasTabularNumbers
                />
                <Text type="supporting" color="secondary">
                  Anticipo obligatorio activo para {b.client.fullName}.
                </Text>
              </HStack>
            ) : null}
            <BookingCard
              booking={b}
              allServices={allServices}
              paymentSplits={paymentSplits}
              cashEntries={cashEntries}
              nowMs={nowMs}
              salonName={salonName}
              currency={currency}
              timezone={timezone}
              canViewClients={canViewClients}
              busyStatus={busyBookingId === b.id ? busyStatus : null}
              isRequestingReschedule={requestingRescheduleId === b.id}
              onSelectBooking={onSelectBooking}
              onUpdateStatus={onUpdateStatus}
              onOpenCheckout={onOpenCheckout}
              onRequestReschedule={onRequestReschedule}
            />
          </VStack>
        );
      })}
    </VStack>
  );
}
