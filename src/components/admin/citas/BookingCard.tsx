'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Card } from '@astryxdesign/core/Card';
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
  DollarSign,
  MessageCircle,
  UserRound,
  UserX,
} from 'lucide-react';
import { computeBookingPaymentSummary } from '@/lib/payments/splits';
import type {
  BookingStatus,
  BookingWithRelations,
  PaymentSplit,
  Service,
} from '@/lib/types';
import {
  buildWhatsAppLink,
  formatCurrency,
  formatDateShortInTimezone,
  formatDuration,
  formatTimeInTimezone,
} from '@/lib/format';

export const BOOKING_STATUS_BADGE: Record<
  BookingStatus,
  { label: string; variant: 'success' | 'warning' | 'error' | 'info' | 'neutral' }
> = {
  confirmed: { label: 'Confirmada', variant: 'success' },
  pending_confirmation: { label: 'Por confirmar', variant: 'warning' },
  pending_payment: { label: 'Anticipo pendiente', variant: 'warning' },
  completed: { label: 'Completada', variant: 'info' },
  canceled: { label: 'Cancelada', variant: 'error' },
  no_show: { label: 'No asistió', variant: 'error' },
};

const IG_SAFE_RE = /^[a-zA-Z0-9._]{1,30}$/;

export function buildInstagramProfileUrl(handle?: string | null): string | null {
  if (!handle) return null;
  const cleaned = handle.trim().replace(/^@+/, '');
  if (!cleaned || !IG_SAFE_RE.test(cleaned)) return null;
  return `https://www.instagram.com/${cleaned}/`;
}

export function getProofBadgeMeta(
  booking: BookingWithRelations,
): { label: string; color: 'green' | 'orange' | 'purple' | 'gray' } | null {
  if (booking.proofDeliveryMethod === 'web_upload' || booking.paymentProofUrl) {
    return { label: 'Comprobante en web', color: 'green' };
  }
  if (booking.proofDeliveryMethod === 'instagram_dm') {
    return { label: 'Comprobante por IG DM', color: 'purple' };
  }
  if (booking.depositAmountCents > 0) {
    return { label: 'Sin comprobante aún', color: 'orange' };
  }
  return null;
}

interface BookingCardProps {
  booking: BookingWithRelations;
  allServices: Service[];
  paymentSplits?: PaymentSplit[];
  salonName: string;
  currency: 'MXN' | 'USD';
  timezone: string;
  isReminding: boolean;
  onSelectBooking?: (booking: BookingWithRelations) => void;
  onUpdateStatus: (bookingId: string, status: BookingStatus) => void;
  onOpenCheckout: (booking: BookingWithRelations) => void;
  onSendReminder: (bookingId: string) => void;
}

export function BookingCard({
  booking: b,
  allServices,
  paymentSplits = [],
  salonName,
  currency,
  timezone,
  isReminding,
  onSelectBooking,
  onUpdateStatus,
  onOpenCheckout,
  onSendReminder,
}: BookingCardProps) {
  const meta = BOOKING_STATUS_BADGE[b.status];
  const extraServiceNames = (b.extraServiceIds ?? [])
    .map((id) => allServices.find((s) => s.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const igHandle = b.clientInstagram ?? b.client.instagramHandle ?? null;
  const igUrl = buildInstagramProfileUrl(igHandle);
  const proofMeta = getProofBadgeMeta(b);
  const bookingSplits = paymentSplits.filter((s) => s.bookingId === b.id);
  const paymentSummary = computeBookingPaymentSummary(b.totalPriceCents, bookingSplits);
  const canRemind =
    b.status === 'confirmed' ||
    b.status === 'pending_confirmation' ||
    b.status === 'pending_payment';
  const canCollect =
    b.status === 'confirmed' ||
    (b.status === 'completed' && paymentSummary.isUncollected);

  const waHref = buildWhatsAppLink(
    b.client.phoneE164,
    `Hola ${b.client.fullName}, te escribimos de ${salonName} sobre tu cita (${b.bookingCode}) de ${b.service.name} el ${formatDateShortInTimezone(
      b.startAt,
      timezone,
    )} a las ${formatTimeInTimezone(b.startAt, timezone)}.`,
  );

  return (
    <Card padding={4}>
      <VStack gap={3}>
        <HStack justify="between" align="start" wrap="wrap" gap={2}>
          <VStack gap={1}>
            <HStack gap={2} align="center" wrap="wrap">
              <Text weight="semibold" size="lg">
                {b.client.fullName}
              </Text>
              <Badge variant={meta.variant} label={meta.label} />
              {b.status !== 'canceled' && b.status !== 'no_show' ? (
                <Badge
                  variant={paymentSummary.isFullyPaid ? 'success' : 'warning'}
                  label={
                    paymentSummary.isFullyPaid
                      ? 'Pagado'
                      : `Saldo ${formatCurrency(paymentSummary.remainingCents, currency)}`
                  }
                />
              ) : null}
              <Token size="sm" label={b.bookingCode} />
              <Token
                size="sm"
                color={b.source === 'whatsapp' ? 'green' : 'default'}
                label={
                  b.source === 'whatsapp'
                    ? 'WhatsApp'
                    : b.source === 'walk_in'
                      ? 'Walk-in'
                      : b.source === 'manual'
                        ? 'Manual'
                        : 'Web'
                }
              />
            </HStack>

            <Text weight="medium">
              {b.service.name}
              {extraServiceNames.length > 0 ? ` + ${extraServiceNames.join(' + ')}` : ''}
              {b.addons.length > 0
                ? ` · Extras: ${b.addons.map((a) => a.name).join(', ')}`
                : ''}
            </Text>

            <Text type="supporting" color="secondary">
              {formatDateShortInTimezone(b.startAt, timezone)} ·{' '}
              {formatTimeInTimezone(b.startAt, timezone)} –{' '}
              {formatTimeInTimezone(b.endAt, timezone)} (
              {formatDuration(b.totalDurationMinutes)}) · Especialista: {b.staff.name}
            </Text>

            <HStack gap={2} align="center" wrap="wrap">
              {igHandle && igUrl ? (
                <HStack gap={1} align="center">
                  <AtSign size={13} aria-hidden="true" />
                  <Link href={igUrl} isExternalLink size="sm" weight="medium">
                    {igHandle}
                  </Link>
                </HStack>
              ) : null}
              {proofMeta ? (
                <Token size="sm" color={proofMeta.color} label={proofMeta.label} />
              ) : null}
              {b.depositAmountCents > 0 ? (
                <Token
                  size="sm"
                  color="default"
                  label={`Anticipo ${formatCurrency(b.depositAmountCents, currency)}`}
                />
              ) : null}
            </HStack>

            {b.clientNotes ? (
              <Text type="supporting" color="secondary">
                Nota clienta: {b.clientNotes}
              </Text>
            ) : null}
            {b.internalNotes ? (
              <Text type="supporting" color="secondary">
                Nota interna: {b.internalNotes}
              </Text>
            ) : null}
          </VStack>

          <VStack align="end" gap={1}>
            <Text weight="bold" size="lg" hasTabularNumbers>
              {formatCurrency(b.totalPriceCents, currency)}
            </Text>
            <Text type="supporting" color="secondary">
              {b.client.phoneE164}
            </Text>
          </VStack>
        </HStack>

        <Divider />

        <HStack gap={2} wrap="wrap" justify="between" align="center">
          <HStack gap={1.5} wrap="wrap">
            {b.status === 'pending_confirmation' || b.status === 'pending_payment' ? (
              <Button
                label="Confirmar"
                variant="primary"
                size="sm"
                icon={<Check size={14} />}
                onClick={() => onUpdateStatus(b.id, 'confirmed')}
              />
            ) : null}
            {canCollect ? (
              <Button
                label="$ Cobrar"
                variant="primary"
                size="sm"
                icon={<DollarSign size={14} />}
                onClick={() => onOpenCheckout(b)}
              />
            ) : null}
            {onSelectBooking ? (
              <Button
                label="Gestionar"
                variant="secondary"
                size="sm"
                onClick={() => onSelectBooking(b)}
              />
            ) : null}
            {canRemind ? (
              <Button
                label="Enviar recordatorio"
                variant="secondary"
                size="sm"
                icon={<Bell size={14} />}
                isLoading={isReminding}
                onClick={() => onSendReminder(b.id)}
              />
            ) : null}
            {b.status === 'confirmed' ? (
              <Button
                label="No asistió"
                variant="secondary"
                size="sm"
                icon={<UserX size={14} />}
                onClick={() => onUpdateStatus(b.id, 'no_show')}
              />
            ) : null}
            {b.status !== 'canceled' &&
            b.status !== 'completed' &&
            b.status !== 'no_show' ? (
              <Button
                label="Cancelar"
                variant="ghost"
                size="sm"
                icon={<Ban size={14} />}
                onClick={() => onUpdateStatus(b.id, 'canceled')}
              />
            ) : null}
          </HStack>

          <HStack gap={1.5} wrap="wrap">
            <Button
              label="WhatsApp"
              variant="secondary"
              size="sm"
              icon={<MessageCircle size={14} />}
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
            />
            <Button
              label="Ver ficha"
              variant="ghost"
              size="sm"
              icon={<UserRound size={14} />}
              href={`/admin/clientas?q=${encodeURIComponent(b.client.phoneE164)}`}
            />
            <Button
              label="Link clienta"
              variant="ghost"
              size="sm"
              href={`/cita/${b.manageToken}`}
            />
          </HStack>
        </HStack>
      </VStack>
    </Card>
  );
}
