'use client';

import { useState } from 'react';
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
  CheckCircle2,
  DollarSign,
  ExternalLink,
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
  isDisplayableProofImage,
} from './BookingCard';

interface BookingQuickPopoverProps {
  booking: BookingWithRelations | null;
  allServices: Service[];
  paymentSplits: PaymentSplit[];
  salonName: string;
  currency: 'MXN' | 'USD';
  timezone: string;
  busyStatus?: BookingStatus | null;
  isReminding: boolean;
  isRequestingReschedule: boolean;
  onClose: () => void;
  onUpdateStatus: (bookingId: string, status: BookingStatus) => Promise<boolean>;
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
  busyStatus = null,
  isReminding,
  isRequestingReschedule,
  onClose,
  onUpdateStatus,
  onOpenCheckout,
  onSendReminder,
  onRequestReschedule,
}: BookingQuickPopoverProps) {
  const [proofZoomOpen, setProofZoomOpen] = useState(false);

  if (!booking) {
    return (
      <Dialog isOpen={false} onOpenChange={() => onClose()} width={500} padding={5}>
        <VStack gap={2} />
      </Dialog>
    );
  }

  const isBusy = Boolean(busyStatus);
  const statusMeta = BOOKING_STATUS_BADGE[booking.status];
  const allowedNext: readonly BookingStatus[] = BOOKING_TRANSITIONS[booking.status];
  const extraServiceNames = (booking.extraServiceIds ?? [])
    .map((id) => allServices.find((s) => s.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const igHandle = booking.clientInstagram ?? booking.client.instagramHandle ?? null;
  const igUrl = buildInstagramProfileUrl(igHandle);
  const proofMeta = getProofBadgeMeta(booking);
  const hasDisplayableProof = isDisplayableProofImage(booking.paymentProofUrl);
  const bookingSplits = paymentSplits.filter((s) => s.bookingId === booking.id);
  const paymentSummary = computeBookingPaymentSummary(
    booking.totalPriceCents,
    bookingSplits,
  );
  const isPending = allowedNext.includes('confirmed');
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

  const handleClose = () => {
    setProofZoomOpen(false);
    onClose();
  };

  const handleStatusAction = async (nextStatus: BookingStatus) => {
    if (isBusy) return;
    await onUpdateStatus(booking.id, nextStatus);
    handleClose();
  };

  return (
    <>
      <Dialog
        isOpen={Boolean(booking)}
        onOpenChange={(open) => {
          if (!open && !isBusy) handleClose();
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
            if (!open && !isBusy) handleClose();
          }}
        />

        <VStack
          gap={3}
          paddingBlockStart={4}
          className={isBusy ? 'fx-sheet-in fx-busy' : 'fx-sheet-in'}
          aria-busy={isBusy || undefined}
        >
          <HStack gap={2} align="center" wrap="wrap">
            <Badge variant={statusMeta.variant} label={statusMeta.label} />
            {isBusy ? (
              <Text className="fx-save-pill" data-state="saving" role="status" aria-live="polite">
                Actualizando...
              </Text>
            ) : null}
            <Token size="sm" label={`Con ${booking.staff.name}`} />
            <Token size="sm" label={booking.bookingCode} />
            {igHandle && igUrl ? (
              <HStack gap={1} align="center">
                <AtSign size={13} aria-hidden="true" />
                <Link href={igUrl} isExternalLink size="sm" weight="medium">
                  {igHandle}
                </Link>
              </HStack>
            ) : null}
          </HStack>

          <VStack className="ad-surface" data-tone="subtle" data-padded="true" gap={2}>
            <Text weight="semibold" size="base">
              {booking.service.name}
              {extraServiceNames.length > 0 ? ` + ${extraServiceNames.join(' + ')}` : ''}
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

            {hasDisplayableProof && booking.paymentProofUrl ? (
              <HStack gap={3} align="center" wrap="wrap" paddingBlockStart={1}>
                <button
                  type="button"
                  className="ad-proof-thumb"
                  aria-label={`Ampliar comprobante de ${booking.client.fullName}`}
                  onClick={() => setProofZoomOpen(true)}
                >
                  <img
                    src={booking.paymentProofUrl}
                    alt={`Comprobante de anticipo de ${booking.client.fullName}`}
                  />
                </button>
                <VStack gap={0.5} className="rb-grow">
                  <Text size="sm" weight="semibold">
                    Comprobante de anticipo
                  </Text>
                  <Button
                    type="button"
                    label="Ver comprobante"
                    variant="secondary"
                    size="sm"
                    onClick={() => setProofZoomOpen(true)}
                  />
                </VStack>
              </HStack>
            ) : null}
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
                Precio y anticipo
              </Text>
              <Text weight="semibold" hasTabularNumbers>
                Total {formatCurrency(paymentSummary.totalPriceCents, currency)}
                {paymentSummary.paidCents > 0
                  ? ` · Anticipo ${formatCurrency(paymentSummary.paidCents, currency)}`
                  : ''}
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
                : `Falta cobrar ${formatCurrency(paymentSummary.remainingCents, currency)}`}
            </Text>
          </HStack>

          {booking.clientNotes ? (
            <Text type="supporting" color="secondary">
              Nota de la clienta: {booking.clientNotes}
            </Text>
          ) : null}
          {booking.internalNotes ? (
            <Text type="supporting" color="secondary">
              Nota interna: {booking.internalNotes}
            </Text>
          ) : null}

          <VStack gap={2} paddingBlockStart={1}>
            <HStack gap={2} wrap="wrap">
              {isPending ? (
                <Button
                  type="button"
                  label={busyStatus === 'confirmed' ? 'Confirmando...' : 'Confirmar'}
                  variant="primary"
                  size="md"
                  icon={<Check size={15} />}
                  isLoading={busyStatus === 'confirmed'}
                  isDisabled={isBusy}
                  onClick={() => void handleStatusAction('confirmed')}
                />
              ) : null}

              {canCollect ? (
                <Button
                  type="button"
                  label="Cobrar"
                  variant={isPending ? 'secondary' : 'primary'}
                  size="md"
                  icon={<DollarSign size={15} aria-hidden="true" />}
                  isDisabled={isBusy}
                  onClick={() => {
                    handleClose();
                    onOpenCheckout(booking);
                  }}
                />
              ) : null}

              {!isPending &&
              allowedNext.includes('completed') &&
              paymentSummary.isFullyPaid ? (
                <Button
                  type="button"
                  label={busyStatus === 'completed' ? 'Completando...' : 'Completar'}
                  variant="secondary"
                  size="md"
                  icon={<CheckCircle2 size={15} aria-hidden="true" />}
                  isLoading={busyStatus === 'completed'}
                  isDisabled={isBusy}
                  onClick={() => void handleStatusAction('completed')}
                />
              ) : null}

              <Button
                label="WhatsApp"
                variant={!isPending && !canCollect ? 'primary' : 'secondary'}
                size="md"
                icon={<MessageCircle size={15} />}
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
              />
            </HStack>
          </VStack>

          <Divider />

          <VStack gap={2}>
            <Text type="supporting" color="secondary" weight="medium">
              Otras acciones
            </Text>
            <HStack gap={1.5} wrap="wrap">
              {canRemind ? (
                <Button
                  type="button"
                  label={isRequestingReschedule ? 'Generando...' : 'Reagendar'}
                  variant="secondary"
                  size="sm"
                  icon={<CalendarClock size={14} />}
                  isLoading={isRequestingReschedule}
                  isDisabled={isBusy || isRequestingReschedule}
                  onClick={() => {
                    onRequestReschedule(booking.id);
                    handleClose();
                  }}
                />
              ) : null}

              <Button
                label="Ver clienta"
                variant="secondary"
                size="sm"
                icon={<UserRound size={14} />}
                href={clientProfileHref}
              />

              {canRemind ? (
                <Button
                  type="button"
                  label={isReminding ? 'Enviando...' : 'Recordatorio'}
                  variant="ghost"
                  size="sm"
                  icon={<Bell size={14} />}
                  isLoading={isReminding}
                  isDisabled={isBusy || isReminding}
                  onClick={() => onSendReminder(booking.id)}
                />
              ) : null}

              {allowedNext.includes('no_show') ? (
                <Button
                  type="button"
                  label={busyStatus === 'no_show' ? 'Marcando...' : 'No llegó'}
                  variant="ghost"
                  size="sm"
                  icon={<UserX size={14} />}
                  isLoading={busyStatus === 'no_show'}
                  isDisabled={isBusy}
                  onClick={() => void handleStatusAction('no_show')}
                />
              ) : null}

              {allowedNext.includes('canceled') ? (
                <Button
                  type="button"
                  label={busyStatus === 'canceled' ? 'Cancelando...' : 'Cancelar'}
                  variant="ghost"
                  size="sm"
                  icon={<Ban size={14} />}
                  isLoading={busyStatus === 'canceled'}
                  isDisabled={isBusy}
                  onClick={() => void handleStatusAction('canceled')}
                />
              ) : null}
            </HStack>
          </VStack>
        </VStack>
      </Dialog>

      {hasDisplayableProof && booking.paymentProofUrl ? (
        <Dialog
          isOpen={proofZoomOpen}
          onOpenChange={setProofZoomOpen}
          purpose="info"
          width={560}
          padding={5}
        >
          <DialogHeader
            title={`Comprobante · ${booking.client.fullName}`}
            subtitle={`${booking.bookingCode} · Anticipo ${formatCurrency(
              booking.depositAmountCents,
              currency,
            )}`}
            onOpenChange={setProofZoomOpen}
          />
          <VStack gap={3} paddingBlockStart={4}>
            <img
              src={booking.paymentProofUrl}
              alt={`Comprobante ampliado de ${booking.client.fullName}`}
              className="ad-proof-img"
            />
            <HStack justify="between" align="center" wrap="wrap" gap={2}>
              <Button
                label="Abrir imagen completa"
                variant="secondary"
                size="sm"
                icon={<ExternalLink size={14} aria-hidden="true" />}
                href={booking.paymentProofUrl}
                target="_blank"
                rel="noopener noreferrer"
              />
              {isPending ? (
                <Button
                  type="button"
                  label={busyStatus === 'confirmed' ? 'Confirmando...' : 'Confirmar cita'}
                  variant="primary"
                  size="sm"
                  icon={<Check size={14} />}
                  isLoading={busyStatus === 'confirmed'}
                  isDisabled={isBusy}
                  onClick={() => void handleStatusAction('confirmed')}
                />
              ) : null}
            </HStack>
          </VStack>
        </Dialog>
      ) : null}
    </>
  );
}
