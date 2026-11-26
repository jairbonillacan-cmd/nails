'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Plus } from 'lucide-react';
import { EmptyStateCard, StatusTag } from '@/components/ui';
import type {
  BookingStatus,
  BookingWithRelations,
  PaymentSplit,
  Service,
} from '@/lib/types';
import { getDateKeyInTimezone } from '@/lib/format';
import { BookingCard } from './BookingCard';
import type { AgendaRange } from './BookingsFiltersBar';
import { shiftDateKey } from './scheduleGridGeometry';

export function filterBookingsForTab(params: {
  bookings: readonly BookingWithRelations[];
  serverNowIso: string;
  tab: string;
  search: string;
  selectedStaffFilter: string;
}): BookingWithRelations[] {
  const { bookings, serverNowIso, tab, search, selectedStaffFilter } = params;
  const nowMs = new Date(serverNowIso).getTime();
  return bookings
    .filter((b) => {
      if (selectedStaffFilter !== 'all' && b.staffId !== selectedStaffFilter) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const ig = (b.clientInstagram ?? b.client.instagramHandle ?? '').toLowerCase();
        const hit =
          b.client.fullName.toLowerCase().includes(q) ||
          b.service.name.toLowerCase().includes(q) ||
          b.bookingCode.toLowerCase().includes(q) ||
          b.client.phoneE164.includes(q) ||
          ig.includes(q);
        if (!hit) return false;
      }
      if (tab === 'upcoming') {
        return (
          ['confirmed', 'pending_confirmation', 'pending_payment'].includes(b.status) &&
          new Date(b.endAt).getTime() >= nowMs - 86_400_000
        );
      }
      if (tab === 'unconfirmed') {
        return b.status === 'pending_confirmation' || b.status === 'pending_payment';
      }
      if (tab === 'past') {
        return b.status === 'completed' || b.status === 'no_show';
      }
      if (tab === 'canceled') {
        return b.status === 'canceled';
      }
      return true;
    })
    .toSorted((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
}

export function filterBookingsForListRange(params: {
  tabFiltered: readonly BookingWithRelations[];
  tab: string;
  search: string;
  agendaRange: AgendaRange;
  todayKey: string;
  timezone: string;
}): BookingWithRelations[] {
  const { tabFiltered, tab, search, agendaRange, todayKey, timezone } = params;
  if (search.trim() || tab !== 'upcoming') {
    return [...tabFiltered];
  }
  const tomorrowKey = shiftDateKey(todayKey, 1);
  const weekEndKey = shiftDateKey(todayKey, 6);
  return tabFiltered.filter((b) => {
    const bookingDateKey = getDateKeyInTimezone(new Date(b.startAt), timezone);
    if (agendaRange === 'today') return bookingDateKey === todayKey;
    if (agendaRange === 'tomorrow') return bookingDateKey === tomorrowKey;
    return bookingDateKey >= todayKey && bookingDateKey <= weekEndKey;
  });
}

interface BookingsListViewProps {
  bookings: BookingWithRelations[];
  tab: string;
  agendaRange: AgendaRange;
  search: string;
  allServices: Service[];
  paymentSplits: PaymentSplit[];
  salonName: string;
  currency: 'MXN' | 'USD';
  timezone: string;
  noShowThreshold: number;
  busyBookingId: string | null;
  busyStatus: BookingStatus | null;
  requestingRescheduleId: string | null;
  onSelectRangeWeek: () => void;
  onOpenNewBooking: () => void;
  onSelectBooking: (booking: BookingWithRelations) => void;
  onUpdateStatus: (bookingId: string, status: BookingStatus) => void;
  onOpenCheckout: (booking: BookingWithRelations) => void;
  onRequestReschedule: (bookingId: string) => void;
}

export function BookingsListView({
  bookings,
  tab,
  agendaRange,
  search,
  allServices,
  paymentSplits,
  salonName,
  currency,
  timezone,
  noShowThreshold,
  busyBookingId,
  busyStatus,
  requestingRescheduleId,
  onSelectRangeWeek,
  onOpenNewBooking,
  onSelectBooking,
  onUpdateStatus,
  onOpenCheckout,
  onRequestReschedule,
}: BookingsListViewProps) {
  if (bookings.length === 0) {
    return (
      <EmptyStateCard
        key={`${tab}-${agendaRange}-empty`}
        className="fx-step-in"
        isCompact
        title="No hay citas en esta vista"
        description={
          tab === 'upcoming' && agendaRange !== 'week' && !search.trim()
            ? 'Puedes ver toda la semana o agendar una nueva cita.'
            : 'Puedes agendar una nueva cita o ajustar los filtros.'
        }
        actions={
          <HStack gap={2} wrap="wrap" justify="center">
            {tab === 'upcoming' && agendaRange !== 'week' && !search.trim() ? (
              <Button
                label="Ver toda la semana"
                variant="secondary"
                size="sm"
                onClick={onSelectRangeWeek}
              />
            ) : null}
            <Button
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
    <VStack gap={3} key={`${tab}-${agendaRange}-list`} className="fx-step-in">
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
              salonName={salonName}
              currency={currency}
              timezone={timezone}
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
