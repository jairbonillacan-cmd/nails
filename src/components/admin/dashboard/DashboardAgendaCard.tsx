'use client';

import { useState, type KeyboardEvent } from 'react';
import NextLink from 'next/link';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import {
  buildWhatsAppLink,
  formatCurrency,
  formatDuration,
  formatTimeInTimezone,
} from '@/lib/format';
import type { BookingWithRelations } from '@/lib/types';
import type { AdminOverviewPayload } from '../AdminProvider';
import type { DashboardMetrics } from './dashboardMetrics';

type DayKey = 'hoy' | 'manana';

interface DashboardAgendaCardProps {
  data: AdminOverviewPayload;
  metrics: DashboardMetrics;
  confirmingBookingId: string | null;
  onConfirmDeposit: (bookingId: string, clientName: string) => Promise<void>;
}

interface AgendaRowMeta {
  chipLabel: string;
  chipTone: 'neutral' | 'warning' | 'accent' | 'success';
  isPast: boolean;
  actionKind: 'collect' | 'validate' | 'whatsapp' | null;
}

function getAgendaRowMeta(
  booking: BookingWithRelations,
  metrics: DashboardMetrics,
  currency: 'MXN' | 'USD',
): AgendaRowMeta {
  const uncollected = metrics.uncollectedByBookingId.get(booking.id);
  const startMs = new Date(booking.startAt).getTime();
  const endMs = new Date(booking.endAt).getTime();
  const isPast = booking.status === 'completed' || endMs < metrics.serverNowMs;

  if (uncollected) {
    return {
      chipLabel: `Sin cobrar · ${formatCurrency(uncollected.remainingCents, currency)}`,
      chipTone: 'warning',
      isPast: true,
      actionKind: 'collect',
    };
  }
  if (booking.status === 'completed') {
    return {
      chipLabel: 'Pagada',
      chipTone: 'neutral',
      isPast: true,
      actionKind: null,
    };
  }
  if (booking.status === 'no_show') {
    return {
      chipLabel: 'No asistió',
      chipTone: 'neutral',
      isPast: true,
      actionKind: null,
    };
  }
  if (booking.status === 'pending_confirmation' || booking.status === 'pending_payment') {
    return {
      chipLabel: 'Anticipo por validar',
      chipTone: 'warning',
      isPast: false,
      actionKind: 'validate',
    };
  }
  if (startMs <= metrics.serverNowMs && endMs >= metrics.serverNowMs) {
    return {
      chipLabel: 'En curso',
      chipTone: 'accent',
      isPast: false,
      actionKind: 'whatsapp',
    };
  }
  return {
    chipLabel: 'Confirmada',
    chipTone: 'success',
    isPast,
    actionKind: 'whatsapp',
  };
}

export function DashboardAgendaCard({
  data,
  metrics,
  confirmingBookingId,
  onConfirmDeposit,
}: DashboardAgendaCardProps) {
  const [day, setDay] = useState<DayKey>('hoy');
  const [selectedStaffId, setSelectedStaffId] = useState<string>('all');

  const tz = metrics.tz;
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

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      setDay((prev) => (prev === 'hoy' ? 'manana' : 'hoy'));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setDay('hoy');
    } else if (event.key === 'End') {
      event.preventDefault();
      setDay('manana');
    }
  };

  let nowInsertIndex = -1;
  if (day === 'hoy' && filteredBookings.length > 0) {
    const firstFutureIdx = filteredBookings.findIndex(
      (booking) => new Date(booking.startAt).getTime() > metrics.serverNowMs,
    );
    nowInsertIndex = firstFutureIdx === -1 ? filteredBookings.length : firstFutureIdx;
  }

  const artistSummaryParts: string[] = [];
  for (const member of metrics.activeStaff) {
    const count = dayList.filter((booking) => booking.staffId === member.id).length;
    if (count > 0) {
      artistSummaryParts.push(`${member.name.split(' ')[0]} ${count}`);
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
          day === 'manana' ? `Mañana: ${dayList.length} citas` : null,
          artistSummaryParts.join(' · '),
          pendingForDay > 0
            ? `${pendingForDay} anticipo${pendingForDay === 1 ? '' : 's'} por validar`
            : null,
        ]
          .filter(Boolean)
          .join(' · ');

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
    <VStack as="section" className="ad-card" aria-labelledby="ad-ag" gap={0}>
      <HStack justify="between" align="center" gap={3} wrap="wrap" className="ad-card-head">
        <Heading level={2} id="ad-ag" className="lk-serif ad-h2">
          Agenda
        </Heading>

        <HStack role="tablist" aria-label="Día de la agenda" className="ad-tablist" gap={1}>
          <button
            type="button"
            id="ad-tab-hoy"
            role="tab"
            aria-selected={day === 'hoy'}
            aria-controls="ad-agenda-panel"
            tabIndex={day === 'hoy' ? 0 : -1}
            className="ad-tab fx-press"
            onClick={() => setDay('hoy')}
            onKeyDown={handleTabKeyDown}
          >
            Hoy{metrics.todayBookings.length > 0 ? ` (${metrics.todayBookings.length})` : ''}
          </button>
          <button
            type="button"
            id="ad-tab-manana"
            role="tab"
            aria-selected={day === 'manana'}
            aria-controls="ad-agenda-panel"
            tabIndex={day === 'manana' ? 0 : -1}
            className="ad-tab fx-press"
            onClick={() => setDay('manana')}
            onKeyDown={handleTabKeyDown}
          >
            Mañana{metrics.tomorrowBookings.length > 0 ? ` (${metrics.tomorrowBookings.length})` : ''}
          </button>
        </HStack>
      </HStack>

      {!isSpecialist && metrics.activeStaff.length > 1 ? (
        <HStack gap={2} wrap="wrap" className="ad-filter-bar" aria-label="Filtrar por artista">
          <button
            type="button"
            className="ad-pill ad-artist-pill fx-press"
            data-on={effectiveStaffId === 'all' ? 'true' : 'false'}
            aria-pressed={effectiveStaffId === 'all'}
            onClick={() => setSelectedStaffId('all')}
          >
            <Text className="ad-dot" data-idx="all" aria-hidden="true">
              {'\u200B'}
            </Text>
            <Text color="inherit" size="sm" weight="semibold">
              Todas
            </Text>
          </button>
          {metrics.activeStaff.map((member) => {
            const colorIdx = metrics.staffColorIndex.get(member.id) ?? 0;
            const isSelected = effectiveStaffId === member.id;
            return (
              <button
                key={member.id}
                type="button"
                className="ad-pill ad-artist-pill fx-press"
                data-on={isSelected ? 'true' : 'false'}
                aria-pressed={isSelected}
                onClick={() => setSelectedStaffId(member.id)}
              >
                <Text className="ad-dot" data-idx={String(colorIdx)} aria-hidden="true">
                  {'\u200B'}
                </Text>
                <Text color="inherit" size="sm" weight="semibold">
                  {member.name.split(' ')[0]}
                </Text>
              </button>
            );
          })}
        </HStack>
      ) : null}

      <VStack
        key={`${day}-${effectiveStaffId}`}
        id="ad-agenda-panel"
        role="tabpanel"
        aria-labelledby={day === 'hoy' ? 'ad-tab-hoy' : 'ad-tab-manana'}
        className="fx-step-in"
        gap={0}
      >
        {filteredBookings.length === 0 ? (
          <VStack gap={3} className="ad-empty-agenda">
            <Text color="secondary">
              {day === 'hoy' && effectiveStaffId === 'all'
                ? 'No tienes citas programadas para hoy.'
                : effectiveStaffId === 'all'
                  ? 'No hay citas programadas para mañana.'
                  : 'Sin citas para esta artista en este día.'}
            </Text>
            <HStack gap={2} wrap="wrap">
              {day === 'hoy' &&
              effectiveStaffId === 'all' &&
              metrics.tomorrowBookings.length > 0 ? (
                <Button
                  type="button"
                  label={`Ver citas de mañana (${metrics.tomorrowBookings.length})`}
                  variant="secondary"
                  size="sm"
                  onClick={() => setDay('manana')}
                />
              ) : null}
              <Button label="Agendar cita" variant="ghost" size="sm" href="/admin/citas?new=1" />
            </HStack>
          </VStack>
        ) : (
          <>
            {filteredBookings.map((booking, index) => {
              const meta = getAgendaRowMeta(booking, metrics, currency);
              const colorIdx = metrics.staffColorIndex.get(booking.staffId) ?? 0;
              const startTimeLabel = formatTimeInTimezone(booking.startAt, tz, true);
              const durationLabel = formatDuration(booking.totalDurationMinutes);
              const waHref = buildWhatsAppLink(
                booking.client.phoneE164,
                `Hola ${booking.client.fullName}, te confirmamos tu cita de ${booking.service.name} en ${data.settings.name} a las ${startTimeLabel} con ${booking.staff.name}.`,
              );
              const isConfirming = confirmingBookingId === booking.id;

              return (
                <VStack key={booking.id} gap={0}>
                  {nowInsertIndex === index ? renderNowLine() : null}
                  <article className="ad-row" data-past={meta.isPast ? 'true' : 'false'}>
                    <VStack gap={0} className="ad-row-time">
                      <Text weight="bold" size="base" hasTabularNumbers>
                        {startTimeLabel}
                      </Text>
                      <Text type="supporting" color="secondary" size="sm">
                        {durationLabel}
                      </Text>
                    </VStack>

                    <Text
                      className="ad-bar"
                      data-idx={String(colorIdx)}
                      aria-hidden="true"
                    >
                      {'\u200B'}
                    </Text>

                    <VStack gap={0.5} className="ad-row-info">
                      <Text weight="semibold" maxLines={1}>
                        {booking.client.fullName}
                      </Text>
                      <Text type="supporting" color="secondary" maxLines={1}>
                        {booking.service.name} · con {booking.staff.name.split(' ')[0]}
                      </Text>
                    </VStack>

                    <HStack
                      align="center"
                      justify="end"
                      gap={2}
                      wrap="wrap"
                      className="ad-row-actions"
                    >
                      <Text
                        color="inherit"
                        className="ad-chip"
                        data-tone={meta.chipTone}
                        hasTabularNumbers
                      >
                        {meta.chipLabel}
                      </Text>

                      {meta.actionKind === 'collect' ? (
                        <Button
                          label="Cobrar"
                          variant="secondary"
                          size="sm"
                          href={`/admin/citas?collect=${booking.id}`}
                        />
                      ) : null}

                      {meta.actionKind === 'validate' ? (
                        <Button
                          type="button"
                          label={isConfirming ? 'Validando...' : 'Validar'}
                          variant="secondary"
                          size="sm"
                          isDisabled={isConfirming}
                          onClick={() => void onConfirmDeposit(booking.id, booking.client.fullName)}
                        />
                      ) : null}

                      {meta.actionKind === 'whatsapp' ? (
                        <Button
                          label="WhatsApp"
                          variant="secondary"
                          size="sm"
                          href={waHref}
                          target="_blank"
                          rel="noopener noreferrer"
                        />
                      ) : null}
                    </HStack>
                  </article>
                </VStack>
              );
            })}
            {nowInsertIndex === filteredBookings.length ? renderNowLine() : null}
          </>
        )}
      </VStack>

      <HStack justify="between" align="center" gap={3} wrap="wrap" className="ad-card-foot">
        <Text type="supporting" color="secondary">
          {footerSummary}
        </Text>
        <NextLink href="/admin/citas" className="ad-inline-link">
          Abrir agenda completa →
        </NextLink>
      </HStack>
    </VStack>
  );
}
