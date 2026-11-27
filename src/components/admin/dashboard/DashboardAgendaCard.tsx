'use client';

import { useState } from 'react';
import NextLink from 'next/link';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Plus } from 'lucide-react';
import {
  EmptyStateCard,
  FilterPillBar,
  SurfaceCard,
  type FilterPillOption,
} from '@/components/ui';
import type { AdminOverviewPayload } from '../AdminProvider';
import type { DashboardMetrics } from './dashboardMetrics';
import { DashboardAgendaRow } from './DashboardAgendaRow';

type DayKey = 'hoy' | 'manana';

interface DashboardAgendaCardProps {
  data: AdminOverviewPayload;
  metrics: DashboardMetrics;
  confirmingBookingId: string | null;
  onConfirmDeposit: (bookingId: string, clientName: string) => Promise<boolean>;
}

export function DashboardAgendaCard({
  data,
  metrics,
  confirmingBookingId,
  onConfirmDeposit,
}: DashboardAgendaCardProps) {
  const [selectedDay, setSelectedDay] = useState<DayKey | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('all');

  const autoShowingTomorrow =
    selectedDay === null &&
    metrics.todayBookings.length === 0 &&
    metrics.tomorrowBookings.length > 0;
  const day: DayKey = selectedDay ?? (autoShowingTomorrow ? 'manana' : 'hoy');

  const currency = data.settings.currency;
  const isSpecialist = data.session.user.role === 'specialist';
  const dayList = day === 'hoy' ? metrics.todayBookings : metrics.tomorrowBookings;

  const effectiveStaffId =
    selectedStaffId !== 'all' &&
    !metrics.activeStaff.some((member) => member.id === selectedStaffId)
      ? 'all'
      : selectedStaffId;

  const filteredBookings = dayList.filter(
    (booking) => effectiveStaffId === 'all' || booking.staffId === effectiveStaffId,
  );

  let nowInsertIndex = -1;
  if (day === 'hoy' && filteredBookings.length > 0) {
    const firstFutureIdx = filteredBookings.findIndex(
      (booking) => new Date(booking.startAt).getTime() > metrics.serverNowMs,
    );
    nowInsertIndex = firstFutureIdx === -1 ? filteredBookings.length : firstFutureIdx;
  }

  const staffSummaryParts: string[] = [];
  for (const member of metrics.activeStaff) {
    const count = dayList.filter((booking) => booking.staffId === member.id).length;
    if (count > 0) {
      staffSummaryParts.push(`${member.name.split(' ')[0]} ${count}`);
    }
  }
  const pendingForDay = dayList.filter(
    (booking) =>
      booking.status === 'pending_confirmation' || booking.status === 'pending_payment',
  ).length;

  const footerSummary =
    dayList.length === 0
      ? day === 'hoy'
        ? metrics.tomorrowBookings.length > 0
          ? `Sin citas hoy · ${metrics.tomorrowBookings.length} para mañana`
          : 'Sin citas agendadas para hoy'
        : 'Sin citas agendadas para mañana'
      : [
          day === 'manana'
            ? `Mañana: ${dayList.length} ${dayList.length === 1 ? 'cita' : 'citas'}`
            : null,
          staffSummaryParts.join(' · '),
          pendingForDay > 0
            ? `${pendingForDay} anticipo${pendingForDay === 1 ? '' : 's'} por confirmar`
            : null,
        ]
          .filter(Boolean)
          .join(' · ');

  const dayOptions: FilterPillOption<DayKey>[] = [
    {
      value: 'hoy',
      label: 'Hoy',
      count: metrics.todayBookings.length > 0 ? metrics.todayBookings.length : undefined,
    },
    {
      value: 'manana',
      label: 'Mañana',
      count: metrics.tomorrowBookings.length > 0 ? metrics.tomorrowBookings.length : undefined,
    },
  ];

  const staffOptions: FilterPillOption<string>[] = [
    {
      value: 'all',
      label: 'Todas',
      icon: (
        <Text className="ad-dot" data-idx="all" aria-hidden="true">
          {'\u200B'}
        </Text>
      ),
    },
    ...metrics.activeStaff.map((member) => {
      const colorIdx = metrics.staffColorIndex.get(member.id) ?? 0;
      const memberCount = dayList.filter((booking) => booking.staffId === member.id).length;
      return {
        value: member.id,
        label: member.name.split(' ')[0] ?? member.name,
        count: memberCount > 0 ? memberCount : undefined,
        icon: (
          <Text className="ad-dot" data-idx={String(colorIdx)} aria-hidden="true">
            {'\u200B'}
          </Text>
        ),
      };
    }),
  ];

  const renderNowLine = () => (
    <HStack className="ad-now" align="center" gap={2} aria-label="Hora actual">
      <Text color="accent" weight="bold" size="sm" className="ad-now-label">
        Ahora
      </Text>
      <Text className="ad-now-rule" aria-hidden="true">
        {'\u200B'}
      </Text>
    </HStack>
  );

  return (
    <SurfaceCard
      id="ad-ag"
      title="Agenda del día"
      subtitle={
        day === 'hoy'
          ? `${metrics.headerDateLabel} · Horarios en vivo`
          : autoShowingTomorrow
            ? 'Sin citas hoy · Mostrando tu agenda de mañana'
            : 'Vista anticipada de mañana'
      }
      className="ad-card"
      actions={
        <FilterPillBar
          ariaLabel="Día de la agenda"
          mode="segmented"
          size="sm"
          value={day}
          options={dayOptions}
          onChange={setSelectedDay}
        />
      }
      footer={
        <>
          <Text type="supporting" color="secondary">
            {footerSummary}
          </Text>
          <NextLink href="/admin/citas" className="ad-inline-link">
            Ver agenda completa ›
          </NextLink>
        </>
      }
    >
      {!isSpecialist && metrics.activeStaff.length > 1 ? (
        <HStack className="ad-filter-bar" align="center">
          <FilterPillBar
            ariaLabel="Filtrar por profesional"
            mode="pills"
            size="sm"
            value={effectiveStaffId}
            options={staffOptions}
            onChange={setSelectedStaffId}
          />
        </HStack>
      ) : null}

      {filteredBookings.length > 0 ? (
        <HStack className="ad-tbl-head ad-row ad-hide-s" aria-hidden="true">
          <Text className="ad-tbl-th">Hora</Text>
          <Text className="ad-tbl-th">Clienta y servicio</Text>
          <Text className="ad-tbl-th ad-tbl-th-end">Estado y acción</Text>
        </HStack>
      ) : null}

      <VStack
        key={`${day}-${effectiveStaffId}`}
        className={filteredBookings.length === 0 ? 'fx-step-in ad-card-empty-center' : 'fx-step-in ad-agenda-list'}
        gap={0}
      >
        {filteredBookings.length === 0 ? (
          <VStack padding={5}>
            <EmptyStateCard
              framed={false}
              isCompact
              title={
                day === 'hoy' && effectiveStaffId === 'all'
                  ? 'No tienes citas programadas para hoy.'
                  : effectiveStaffId === 'all'
                    ? 'No hay citas programadas para mañana.'
                    : 'Sin citas para esta profesional en este día.'
              }
              actions={
                <HStack gap={2} wrap="wrap">
                  {day === 'hoy' &&
                  effectiveStaffId === 'all' &&
                  metrics.tomorrowBookings.length > 0 ? (
                    <Button
                      type="button"
                      label={`Ver citas de mañana (${metrics.tomorrowBookings.length})`}
                      variant="secondary"
                      size="sm"
                      onClick={() => setSelectedDay('manana')}
                    />
                  ) : null}
                  <Button
                    label="Nueva cita"
                    variant="primary"
                    size="sm"
                    icon={<Plus size={14} aria-hidden="true" />}
                    href="/admin/citas?new=1"
                  />
                </HStack>
              }
            />
          </VStack>
        ) : (
          <>
            {filteredBookings.map((booking, index) => (
              <VStack key={booking.id} gap={0}>
                {nowInsertIndex === index ? renderNowLine() : null}
                <DashboardAgendaRow
                  booking={booking}
                  metrics={metrics}
                  salonName={data.settings.name}
                  currency={currency}
                  isConfirming={confirmingBookingId === booking.id}
                  isCandidateNextUp={day === 'hoy' && nowInsertIndex === index}
                  onConfirmDeposit={onConfirmDeposit}
                />
              </VStack>
            ))}
            {nowInsertIndex === filteredBookings.length ? renderNowLine() : null}
          </>
        )}
      </VStack>
    </SurfaceCard>
  );
}
