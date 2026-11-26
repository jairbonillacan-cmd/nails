'use client';

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
      customTag: { label: 'Anticipo por confirmar', tone: 'warning' },
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

export function DashboardAgendaRow({
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
        <Text weight="bold" size="base" hasTabularNumbers>
          {startTimeLabel}
        </Text>
        <Text type="supporting" color="secondary" size="sm">
          {durationLabel}
        </Text>
      </VStack>

      <Text className="ad-bar" data-idx={String(colorIdx)} aria-hidden="true">
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

      <HStack align="center" justify="end" gap={2} wrap="wrap" className="ad-row-actions">
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
            variant="secondary"
            size="sm"
            isLoading={isConfirming}
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
  );
}
