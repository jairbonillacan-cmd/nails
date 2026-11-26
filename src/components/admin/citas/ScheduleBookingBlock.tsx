'use client';

import { memo, type CSSProperties } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Link } from '@astryxdesign/core/Link';
import { Divider } from '@astryxdesign/core/Divider';
import { AtSign, Check, DollarSign } from 'lucide-react';
import { BookingStatusTag, StatusTag, type StatusTagTone } from '@/components/ui';
import { computeBookingPaymentSummary } from '@/lib/payments/splits';
import type {
  BookingStatus,
  BookingWithRelations,
  PaymentSplit,
  Service,
} from '@/lib/types';
import { formatTimeInTimezone } from '@/lib/format';
import { buildInstagramProfileUrl, getProofBadgeMeta } from './BookingCard';

interface ScheduleBookingBlockProps {
  booking: BookingWithRelations;
  variant: 'compact' | 'detailed';
  colorIdx: number;
  timezone: string;
  allServices: Service[];
  paymentSplits: PaymentSplit[];
  staffDisplayName?: string;
  isBusy: boolean;
  busyStatus: BookingStatus | null;
  onSelectBooking: (booking: BookingWithRelations) => void;
  onUpdateStatus: (bookingId: string, status: BookingStatus) => void;
  onOpenCheckout: (booking: BookingWithRelations) => void;
}

const CLIENT_TRIGGER_STYLE: CSSProperties = {
  border: 0,
  background: 'transparent',
  padding: 0,
  font: 'inherit',
  textAlign: 'start',
  cursor: 'pointer',
  color: 'var(--color-text-primary)',
};

const PROOF_COLOR_TO_TONE: Record<'green' | 'orange' | 'purple' | 'gray', StatusTagTone> = {
  green: 'success',
  orange: 'warning',
  purple: 'accent',
  gray: 'neutral',
};

export const ScheduleBookingBlock = memo(function ScheduleBookingBlock({
  booking: b,
  variant,
  colorIdx,
  timezone,
  allServices,
  paymentSplits,
  staffDisplayName,
  isBusy,
  busyStatus,
  onSelectBooking,
  onUpdateStatus,
  onOpenCheckout,
}: ScheduleBookingBlockProps) {
  const paymentSummary = computeBookingPaymentSummary(
    b.totalPriceCents,
    paymentSplits.filter((s) => s.bookingId === b.id),
  );
  const isPending =
    b.status === 'pending_confirmation' || b.status === 'pending_payment';
  const canCollect =
    b.status === 'confirmed' ||
    (b.status === 'completed' && paymentSummary.isUncollected);

  if (variant === 'compact') {
    return (
      <VStack
        className={isBusy ? 'ad-row-item fx-busy' : 'ad-row-item'}
        aria-busy={isBusy || undefined}
        gap={2}
        align="stretch"
      >
        <HStack justify="between" align="center" gap={2} width="100%" wrap="wrap">
          <HStack gap={1.5} align="center">
            <Text className="ad-dot" data-idx={String(colorIdx)} aria-hidden="true">
              {'\u200B'}
            </Text>
            <Text weight="bold" size="sm" hasTabularNumbers>
              {formatTimeInTimezone(b.startAt, timezone, true)}
            </Text>
          </HStack>
          <BookingStatusTag status={b.status} hasPaymentProof={Boolean(b.paymentProofUrl)} />
        </HStack>

        <VStack gap={0.5} width="100%" align="start">
          <button
            type="button"
            className="ad-inline-link fx-press"
            disabled={isBusy}
            onClick={() => onSelectBooking(b)}
            style={CLIENT_TRIGGER_STYLE}
          >
            <Text weight="semibold">{b.client.fullName}</Text>
          </button>
          <Text type="supporting" color="secondary">
            {b.service.name} · con {b.staff.name}
          </Text>
        </VStack>

        <HStack gap={1.5} wrap="wrap" width="100%">
          {isPending ? (
            <Button
              type="button"
              label={isBusy && busyStatus === 'confirmed' ? 'Confirmando...' : 'Confirmar'}
              size="sm"
              variant="primary"
              icon={<Check size={13} aria-hidden="true" />}
              isLoading={isBusy && busyStatus === 'confirmed'}
              isDisabled={isBusy}
              onClick={() => onUpdateStatus(b.id, 'confirmed')}
            />
          ) : canCollect ? (
            <Button
              type="button"
              label="Cobrar"
              size="sm"
              variant="primary"
              icon={<DollarSign size={13} aria-hidden="true" />}
              isDisabled={isBusy}
              onClick={() => onOpenCheckout(b)}
            />
          ) : null}
          <Button
            type="button"
            label="Ver opciones"
            size="sm"
            variant="secondary"
            isDisabled={isBusy}
            onClick={() => onSelectBooking(b)}
          />
        </HStack>
      </VStack>
    );
  }

  const igHandle = b.clientInstagram ?? b.client.instagramHandle ?? null;
  const igUrl = buildInstagramProfileUrl(igHandle);
  const proofMeta = getProofBadgeMeta(b);
  const extraNames = (b.extraServiceIds ?? [])
    .map((id) => allServices.find((s) => s.id === id)?.name)
    .filter((n): n is string => Boolean(n));

  return (
    <VStack
      as="article"
      className={isBusy ? 'ad-surface fx-card-lift fx-busy' : 'ad-surface fx-card-lift'}
      data-padded="true"
      aria-busy={isBusy || undefined}
      gap={2}
    >
      <HStack justify="between" align="center" gap={1.5} wrap="wrap">
        <HStack gap={1.5} align="center">
          <Text className="ad-dot" data-idx={String(colorIdx)} aria-hidden="true">
            {'\u200B'}
          </Text>
          <Text weight="semibold" size="sm" hasTabularNumbers>
            {formatTimeInTimezone(b.startAt, timezone, true)} –{' '}
            {formatTimeInTimezone(b.endAt, timezone, true)}
          </Text>
        </HStack>
        <BookingStatusTag status={b.status} hasPaymentProof={Boolean(b.paymentProofUrl)} />
      </HStack>

      <VStack gap={0.5} align="start">
        <button
          type="button"
          className="ad-inline-link fx-press"
          disabled={isBusy}
          onClick={() => onSelectBooking(b)}
          style={CLIENT_TRIGGER_STYLE}
        >
          <Text weight="semibold" size="base">
            {b.client.fullName}
          </Text>
        </button>

        <Text type="supporting" color="secondary">
          {b.service.name}
          {extraNames.length > 0 ? ` + ${extraNames.join(' + ')}` : ''} ·{' '}
          {staffDisplayName ?? b.staff.name}
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
          <StatusTag label={proofMeta.label} tone={PROOF_COLOR_TO_TONE[proofMeta.color]} />
        ) : null}
        {b.status !== 'canceled' &&
        b.status !== 'no_show' &&
        paymentSummary.isUncollected ? (
          <StatusTag label="Falta cobrar" tone="warning" />
        ) : null}
      </HStack>

      <Divider />

      <HStack gap={1.5} wrap="wrap">
        {isPending ? (
          <Button
            type="button"
            label={isBusy && busyStatus === 'confirmed' ? 'Confirmando...' : 'Confirmar'}
            size="sm"
            variant="primary"
            icon={<Check size={13} aria-hidden="true" />}
            isLoading={isBusy && busyStatus === 'confirmed'}
            isDisabled={isBusy}
            onClick={() => onUpdateStatus(b.id, 'confirmed')}
          />
        ) : null}
        {canCollect ? (
          <Button
            type="button"
            label="Cobrar"
            size="sm"
            variant="primary"
            icon={<DollarSign size={13} aria-hidden="true" />}
            isDisabled={isBusy}
            onClick={() => onOpenCheckout(b)}
          />
        ) : null}
        <Button
          type="button"
          label="Ver opciones"
          size="sm"
          variant="secondary"
          isDisabled={isBusy}
          onClick={() => onSelectBooking(b)}
        />
      </HStack>
    </VStack>
  );
});
