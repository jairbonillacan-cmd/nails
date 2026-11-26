'use client';

import { memo } from 'react';
import { Avatar } from '@astryxdesign/core/Avatar';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import {
  buildWhatsAppLink,
  formatCurrency,
  formatDuration,
  formatTimeInTimezone,
} from '@/lib/format';
import type { BookingWithRelations } from '@/lib/types';
import { BookingStatusTag, StatusTag } from '@/components/ui';
import type { DashboardMetrics } from './dashboardMetrics';

interface AgendaRowMeta {
  customTag?: { label: string; tone: 'neutral' | 'warning' | 'accent' | 'success' };
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
      customTag: {
        label: `Sin cobrar · ${formatCurrency(uncollected.remainingCents, currency)}`,
        tone: 'warning',
      },
      isPast: true,
      actionKind: 'collect',
    };
  }
  if (booking.status === 'completed') {
    return { customTag: { label: 'Pagada', tone: 'neutral' }, isPast: true, actionKind: null };
  }
  if (booking.status === 'no_show') {
    return { isPast: true, actionKind: null };
  }
  if (booking.status === 'pending_confirmation' || booking.status === 'pending_payment') {
    return {
      customTag: { label: 'Anticipo pendiente', tone: 'warning' },
      isPast: false,
      actionKind: 'validate',
    };
  }
  if (startMs <= metrics.serverNowMs && endMs >= metrics.serverNowMs) {
    return {
      customTag: { label: 'En curso', tone: 'accent' },
      isPast: false,
      actionKind: 'whatsapp',
    };
  }
  return { isPast, actionKind: 'whatsapp' };
}

interface DashboardAgendaRowProps {
  booking: BookingWithRelations;
  metrics: DashboardMetrics;
  salonName: string;
  currency: 'MXN' | 'USD';
  isConfirming: boolean;
  isCandidateNextUp: boolean;
  onConfirmDeposit: (bookingId: string, clientName: string) => Promise<boolean>;
}

export const DashboardAgendaRow = memo(function DashboardAgendaRow({
  booking,
  metrics,
  salonName,
  currency,
  isConfirming,
  isCandidateNextUp,
  onConfirmDeposit,
}: DashboardAgendaRowProps) {
  const meta = getAgendaRowMeta(booking, metrics, currency);
  const colorIdx = metrics.staffColorIndex.get(booking.staffId) ?? 0;
  const startTimeLabel = formatTimeInTimezone(booking.startAt, metrics.tz, true);
  const durationLabel = formatDuration(booking.totalDurationMinutes);
  const waHref = buildWhatsAppLink(
    booking.client.phoneE164,
    `Hola ${booking.client.fullName}, te confirmamos tu cita de ${booking.service.name} en ${salonName} a las ${startTimeLabel} con ${booking.staff.name}.`,
  );
  const isNextUp =
    isCandidateNextUp && !meta.isPast && !meta.customTag && booking.status === 'confirmed';

  return (
    <article
      className={isConfirming ? 'ad-row fx-busy' : 'ad-row'}
      data-past={meta.isPast ? 'true' : 'false'}
      aria-busy={isConfirming || undefined}
    >
      <VStack gap={0} className="ad-row-time">
        <Text weight="semibold" size="base" hasTabularNumbers>
          {startTimeLabel}
        </Text>
        <Text type="supporting" color="secondary" size="sm">
          {durationLabel}
        </Text>
      </VStack>

      <Text className="ad-bar" data-idx={String(colorIdx)} aria-hidden="true">
        {'\u200B'}
      </Text>

      <HStack gap={2} align="center" className="ad-row-info">
        <Avatar name={booking.client.fullName} size={24} tooltip={false} />
        <VStack gap={0} className="rb-grow">
          <HStack gap={2} align="center" wrap="wrap">
            <Text weight="semibold" size="base" maxLines={1}>
              {booking.client.fullName}
            </Text>
            <Text type="code" color="secondary" size="sm" className="ad-code-muted">
              {booking.bookingCode}
            </Text>
          </HStack>
          <Text type="supporting" color="secondary" maxLines={1}>
            {booking.service.name} · {booking.staff.name.split(' ')[0]}
          </Text>
        </VStack>
      </HStack>

      <HStack align="center" justify="end" gap={3} wrap="wrap" className="ad-row-actions">
        {!meta.isPast && booking.attendanceStatus === 'confirmed' ? (
          <StatusTag label="Confirmó" tone="success" />
        ) : !meta.isPast && booking.attendanceStatus === 'rescheduled' ? (
          <StatusTag label="Reagendó" tone="info" />
        ) : !meta.isPast && booking.reminder24hSentAt ? (
          <StatusTag label="Sin respuesta" tone="neutral" />
        ) : null}

        {isNextUp ? (
          <StatusTag label="Siguiente" tone="accent" showDot />
        ) : meta.customTag ? (
          <StatusTag
            label={meta.customTag.label}
            tone={meta.customTag.tone}
            hasTabularNumbers
            showDot
          />
        ) : (
          <BookingStatusTag
            status={booking.status}
            hasPaymentProof={Boolean(booking.paymentProofUrl)}
            showDot
          />
        )}

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
            label={isConfirming ? 'Confirmando...' : 'Confirmar'}
            variant="primary"
            size="sm"
            isLoading={isConfirming}
            isDisabled={isConfirming}
            onClick={() => void onConfirmDeposit(booking.id, booking.client.fullName)}
          />
        ) : null}

        {meta.actionKind === 'whatsapp' ? (
          <Button
            label="WhatsApp"
            variant="ghost"
            size="sm"
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
          />
        ) : null}
      </HStack>
    </article>
  );
});
