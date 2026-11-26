'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Token } from '@astryxdesign/core/Token';
import { Link } from '@astryxdesign/core/Link';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { AtSign } from 'lucide-react';
import {
  BookingStatusTag,
  ConfirmActionDialog,
  CopyableField,
  StatusTag,
  SurfaceCard,
  type StatusTagTone,
} from '@/components/ui';
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
  buildInstagramProfileUrl,
  getProofBadgeMeta,
  isDisplayableProofImage,
} from './BookingCard';
import { BookingPopoverActions } from './BookingPopoverActions';
import { BookingProofModal } from './BookingProofModal';

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

const PROOF_COLOR_TO_TONE: Record<'green' | 'orange' | 'purple' | 'gray', StatusTagTone> = {
  green: 'success',
  orange: 'warning',
  purple: 'accent',
  gray: 'neutral',
};

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
  const [pendingConfirm, setPendingConfirm] = useState<'canceled' | 'no_show' | null>(null);

  if (!booking) {
    return (
      <Dialog isOpen={false} onOpenChange={() => onClose()} width={500} padding={5}>
        <VStack gap={2} />
      </Dialog>
    );
  }

  const isBusy = Boolean(busyStatus);
  const allowedNext: readonly BookingStatus[] = BOOKING_TRANSITIONS[booking.status];
  const extraServiceNames = (booking.extraServiceIds ?? [])
    .map((id) => allServices.find((s) => s.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const igHandle = booking.clientInstagram ?? booking.client.instagramHandle ?? null;
  const igUrl = buildInstagramProfileUrl(igHandle);
  const proofMeta = getProofBadgeMeta(booking);
  const hasDisplayableProof = isDisplayableProofImage(booking.paymentProofUrl);
  const paymentSummary = computeBookingPaymentSummary(
    booking.totalPriceCents,
    paymentSplits.filter((s) => s.bookingId === booking.id),
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
    `Hola ${booking.client.fullName}, te escribimos de ${salonName} sobre tu cita (${booking.bookingCode}) de ${booking.service.name} el ${formatDateShortInTimezone(booking.startAt, timezone)} a las ${formatTimeInTimezone(booking.startAt, timezone)}.`,
  );
  const clientProfileHref = `/admin/clientas?q=${encodeURIComponent(booking.client.phoneE164)}`;
  const headerSubtitle = `${formatDateShortInTimezone(booking.startAt, timezone)} · ${formatTimeInTimezone(booking.startAt, timezone)} – ${formatTimeInTimezone(booking.endAt, timezone)} (${formatDuration(booking.totalDurationMinutes)})`;

  const handleClose = () => {
    setProofZoomOpen(false);
    setPendingConfirm(null);
    onClose();
  };

  const handleStatusAction = async (nextStatus: BookingStatus) => {
    if (isBusy) return;
    await onUpdateStatus(booking.id, nextStatus);
    handleClose();
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (!open && !isBusy) handleClose();
  };

  return (
    <>
      <Dialog
        isOpen={Boolean(booking)}
        onOpenChange={handleDialogOpenChange}
        purpose="info"
        width={500}
        padding={5}
      >
        <DialogHeader
          title={booking.client.fullName}
          subtitle={headerSubtitle}
          onOpenChange={handleDialogOpenChange}
        />

        <VStack
          gap={3}
          paddingBlockStart={4}
          className={isBusy ? 'fx-sheet-in fx-busy' : 'fx-sheet-in'}
          aria-busy={isBusy || undefined}
        >
          <HStack gap={2} align="center" wrap="wrap">
            <BookingStatusTag
              status={booking.status}
              hasPaymentProof={Boolean(booking.paymentProofUrl)}
            />
            {isBusy ? (
              <Text className="fx-save-pill" data-state="saving" role="status" aria-live="polite">
                Actualizando...
              </Text>
            ) : null}
            <Token size="sm" label={`Con ${booking.staff.name}`} />
            <Token size="sm" label={booking.bookingCode} />
            {proofMeta ? (
              <StatusTag label={proofMeta.label} tone={PROOF_COLOR_TO_TONE[proofMeta.color]} />
            ) : null}
            {igHandle && igUrl ? (
              <HStack gap={1} align="center">
                <AtSign size={13} aria-hidden="true" />
                <Link href={igUrl} isExternalLink size="sm" weight="medium">
                  {igHandle}
                </Link>
              </HStack>
            ) : null}
          </HStack>

          <SurfaceCard tone="subtle" padded>
            <VStack gap={2}>
              <Text weight="semibold" size="base">
                {booking.service.name}
                {extraServiceNames.length > 0 ? ` + ${extraServiceNames.join(' + ')}` : ''}
              </Text>
              {booking.addons.length > 0 ? (
                <Text type="supporting" color="secondary">
                  Extras: {booking.addons.map((a) => a.name).join(', ')}
                </Text>
              ) : null}
              <CopyableField
                label="WhatsApp"
                value={booking.client.phoneE164}
                monospace
                iconOnly
                copyLabel="Copiar WhatsApp"
                feedbackMessage="Número de WhatsApp copiado"
              />
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
          </SurfaceCard>

          <SurfaceCard tone={paymentSummary.isFullyPaid ? 'subtle' : 'warning'} padded>
            <HStack justify="between" align="center" wrap="wrap" gap={2}>
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
              <StatusTag
                label={
                  paymentSummary.isFullyPaid
                    ? 'Pagado completo'
                    : `Falta cobrar ${formatCurrency(paymentSummary.remainingCents, currency)}`
                }
                tone={paymentSummary.isFullyPaid ? 'success' : 'warning'}
                hasTabularNumbers
              />
            </HStack>
          </SurfaceCard>

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

          <BookingPopoverActions
            allowedNext={allowedNext}
            isPending={isPending}
            canCollect={canCollect}
            canRemind={canRemind}
            isFullyPaid={paymentSummary.isFullyPaid}
            isBusy={isBusy}
            busyStatus={busyStatus}
            isReminding={isReminding}
            isRequestingReschedule={isRequestingReschedule}
            waHref={waHref}
            clientProfileHref={clientProfileHref}
            onConfirm={() => void handleStatusAction('confirmed')}
            onComplete={() => void handleStatusAction('completed')}
            onCheckout={() => {
              handleClose();
              onOpenCheckout(booking);
            }}
            onReschedule={() => {
              onRequestReschedule(booking.id);
              handleClose();
            }}
            onRemind={() => onSendReminder(booking.id)}
            onRequestNoShow={() => setPendingConfirm('no_show')}
            onRequestCancel={() => setPendingConfirm('canceled')}
          />
        </VStack>
      </Dialog>

      {hasDisplayableProof && booking.paymentProofUrl ? (
        <BookingProofModal
          isOpen={proofZoomOpen}
          onOpenChange={setProofZoomOpen}
          clientName={booking.client.fullName}
          bookingCode={booking.bookingCode}
          depositAmountCents={booking.depositAmountCents}
          currency={currency}
          paymentProofUrl={booking.paymentProofUrl}
          canConfirm={isPending}
          isConfirming={busyStatus === 'confirmed'}
          isBusy={isBusy}
          onConfirm={() => void handleStatusAction('confirmed')}
        />
      ) : null}

      <ConfirmActionDialog
        isOpen={pendingConfirm !== null}
        onOpenChange={(open) => {
          if (!open && !isBusy) setPendingConfirm(null);
        }}
        title={
          pendingConfirm === 'no_show'
            ? `¿Marcar a ${booking.client.fullName} como no asistió?`
            : `¿Cancelar la cita de ${booking.client.fullName}?`
        }
        description={
          pendingConfirm === 'no_show'
            ? 'La cita quedará registrada como inasistencia (no llegó) y contará para la política de faltas.'
            : 'Se liberará este horario en la agenda y la cita cambiará a estado cancelada.'
        }
        confirmLabel={pendingConfirm === 'no_show' ? 'Sí, marcar no llegó' : 'Sí, cancelar cita'}
        variant="destructive"
        isLoading={isBusy}
        onConfirm={async () => {
          if (pendingConfirm) await handleStatusAction(pendingConfirm);
        }}
      />
    </>
  );
}
