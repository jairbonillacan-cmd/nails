'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Token } from '@astryxdesign/core/Token';
import { Link } from '@astryxdesign/core/Link';
import { Divider } from '@astryxdesign/core/Divider';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import {
  AtSign,
  Ban,
  Bell,
  CalendarClock,
  Check,
  DollarSign,
  MessageCircle,
  UserRound,
  UserX,
} from 'lucide-react';
import { BOOKING_TRANSITIONS } from '@/lib/booking/state-machine';
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
import {
  BOOKING_STATUS_BADGE,
  buildInstagramProfileUrl,
  getProofBadgeMeta,
} from './BookingCard';

interface BookingQuickPopoverProps {
  booking: BookingWithRelations | null;
  allServices: Service[];
  paymentSplits: PaymentSplit[];
  salonName: string;
  currency: 'MXN' | 'USD';
  timezone: string;
  isReminding: boolean;
  isRequestingReschedule: boolean;
  onClose: () => void;
  onUpdateStatus: (bookingId: string, status: BookingStatus) => void;
  onOpenCheckout: (booking: BookingWithRelations) => void;
  onSendReminder: (bookingId: string) => void;
  onRequestReschedule: (bookingId: string) => void;
}

export function BookingQuickPopover({
  booking,
  allServices,
  paymentSplits,
  salonName,
  currency,
  timezone,
  isReminding,
  isRequestingReschedule,
  onClose,
  onUpdateStatus,
  onOpenCheckout,
  onSendReminder,
  onRequestReschedule,
}: BookingQuickPopoverProps) {
  if (!booking) {
    return (
      <Dialog isOpen={false} onOpenChange={() => onClose()} width={480} padding={5}>
        <VStack gap={2} />
      </Dialog>
    );
  }

  const statusMeta = BOOKING_STATUS_BADGE[booking.status];
  const allowedNext: readonly BookingStatus[] = BOOKING_TRANSITIONS[booking.status];
  const extraServiceNames = (booking.extraServiceIds ?? [])
    .map((id) => allServices.find((s) => s.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const igHandle = booking.clientInstagram ?? booking.client.instagramHandle ?? null;
  const igUrl = buildInstagramProfileUrl(igHandle);
  const proofMeta = getProofBadgeMeta(booking);
  const bookingSplits = paymentSplits.filter((s) => s.bookingId === booking.id);
  const paymentSummary = computeBookingPaymentSummary(
    booking.totalPriceCents,
    bookingSplits,
  );
  const canRemind =
    booking.status === 'confirmed' ||
    booking.status === 'pending_confirmation' ||
    booking.status === 'pending_payment';
  const canCollect =
    booking.status !== 'canceled' &&
    booking.status !== 'no_show' &&
    (allowedNext.includes('completed') || paymentSummary.isUncollected);

  const waHref = buildWhatsAppLink(
    booking.client.phoneE164,
    `Hola ${booking.client.fullName}, te escribimos de ${salonName} sobre tu cita (${booking.bookingCode}) de ${booking.service.name} el ${formatDateShortInTimezone(
      booking.startAt,
      timezone,
    )} a las ${formatTimeInTimezone(booking.startAt, timezone)}.`,
  );

  const clientProfileHref = `/admin/clientas?q=${encodeURIComponent(
    booking.client.phoneE164,
  )}`;

  return (
    <Dialog
      isOpen={Boolean(booking)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      purpose="info"
      width={500}
      padding={5}
    >
      <DialogHeader
        title={booking.client.fullName}
        subtitle={`${formatDateShortInTimezone(booking.startAt, timezone)} · ${formatTimeInTimezone(
          booking.startAt,
          timezone,
        )} – ${formatTimeInTimezone(booking.endAt, timezone)} (${formatDuration(
          booking.totalDurationMinutes,
        )})`}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      />

      <VStack gap={3} paddingBlockStart={4} className="fx-sheet-in">
        <HStack gap={2} align="center" wrap="wrap">
          <Badge variant={statusMeta.variant} label={statusMeta.label} />
          <Token size="sm" label={booking.bookingCode} />
          <Token size="sm" color="default" label={booking.staff.name} />
          {igHandle && igUrl ? (
            <HStack gap={1} align="center">
              <AtSign size={13} aria-hidden="true" />
              <Link href={igUrl} isExternalLink size="sm" weight="medium">
                {igHandle}
              </Link>
            </HStack>
          ) : null}
        </HStack>

        <VStack className="ad-surface" data-tone="subtle" data-padded="true" gap={1.5}>
          <Text weight="semibold">
            {booking.service.name}
            {extraServiceNames.length > 0 ? ` + ${extraServiceNames.join(' + ')}` : ''}
          </Text>
          <Text type="supporting" color="secondary" hasTabularNumbers>
            {formatDateShortInTimezone(booking.startAt, timezone)} ·{' '}
            {formatTimeInTimezone(booking.startAt, timezone, true)} –{' '}
            {formatTimeInTimezone(booking.endAt, timezone, true)} (
            {formatDuration(booking.totalDurationMinutes)})
          </Text>
          {booking.addons.length > 0 ? (
            <Text type="supporting" color="secondary">
              Extras: {booking.addons.map((a) => a.name).join(', ')}
            </Text>
          ) : null}
          <HStack gap={2} align="center" wrap="wrap">
            <Text type="supporting" color="secondary" hasTabularNumbers>
              WhatsApp: {booking.client.phoneE164}
            </Text>
            {proofMeta ? (
              <Token size="sm" color={proofMeta.color} label={proofMeta.label} />
            ) : null}
          </HStack>
        </VStack>

        <HStack
          className="ad-surface"
          data-tone={paymentSummary.isFullyPaid ? 'subtle' : 'warning'}
          data-padded="true"
          justify="between"
          align="center"
          wrap="wrap"
          gap={2}
        >
          <VStack gap={0.5}>
            <Text type="supporting" color="secondary">
              Total / Anticipo / Saldo
            </Text>
            <Text weight="semibold" hasTabularNumbers>
              Total {formatCurrency(paymentSummary.totalPriceCents, currency)} · Pagado{' '}
              {formatCurrency(paymentSummary.paidCents, currency)}
            </Text>
          </VStack>
          <Text
            color="inherit"
            className="ad-chip"
            data-tone={paymentSummary.isFullyPaid ? 'success' : 'warning'}
            hasTabularNumbers
          >
            {paymentSummary.isFullyPaid
              ? 'Pagado completo'
              : `Saldo ${formatCurrency(paymentSummary.remainingCents, currency)}`}
          </Text>
        </HStack>

        {booking.clientNotes ? (
          <Text type="supporting" color="secondary">
            Nota clienta: {booking.clientNotes}
          </Text>
        ) : null}
        {booking.internalNotes ? (
          <Text type="supporting" color="secondary">
            Nota interna: {booking.internalNotes}
          </Text>
        ) : null}

        <Divider />

        <HStack gap={2} wrap="wrap">
          {allowedNext.includes('confirmed') ? (
            <Button
              label="Confirmar cita"
              variant="primary"
              size="sm"
              icon={<Check size={14} />}
              onClick={() => {
                onUpdateStatus(booking.id, 'confirmed');
                onClose();
              }}
            />
          ) : null}

          {canCollect ? (
            <Button
              label="Cobrar"
              variant="primary"
              size="sm"
              icon={<DollarSign size={14} aria-hidden="true" />}
              onClick={() => {
                onClose();
                onOpenCheckout(booking);
              }}
            />
          ) : null}

          {allowedNext.includes('no_show') ? (
            <Button
              label="No asistió"
              variant="secondary"
              size="sm"
              icon={<UserX size={14} />}
              onClick={() => {
                onUpdateStatus(booking.id, 'no_show');
                onClose();
              }}
            />
          ) : null}

          {allowedNext.includes('canceled') ? (
            <Button
              label="Cancelar cita"
              variant="ghost"
              size="sm"
              icon={<Ban size={14} />}
              onClick={() => {
                onUpdateStatus(booking.id, 'canceled');
                onClose();
              }}
            />
          ) : null}
        </HStack>

        <HStack gap={2} wrap="wrap">
          <Button
            label="Hablar por WhatsApp"
            variant="secondary"
            size="sm"
            icon={<MessageCircle size={14} />}
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
          />
          {canRemind ? (
            <Button
              label="Enviar recordatorio"
              variant="secondary"
              size="sm"
              icon={<Bell size={14} />}
              isLoading={isReminding}
              onClick={() => onSendReminder(booking.id)}
            />
          ) : null}
          {canRemind ? (
            <Button
              label="Solicitar reprogramación"
              variant="secondary"
              size="sm"
              icon={<CalendarClock size={14} />}
              isLoading={isRequestingReschedule}
              onClick={() => {
                onRequestReschedule(booking.id);
                onClose();
              }}
            />
          ) : null}
          <Button
            label="Ver ficha"
            variant="ghost"
            size="sm"
            icon={<UserRound size={14} />}
            href={clientProfileHref}
          />
        </HStack>
      </VStack>
    </Dialog>
  );
}
