'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Token } from '@astryxdesign/core/Token';
import { Link } from '@astryxdesign/core/Link';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { Banner } from '@astryxdesign/core/Banner';
import { AtSign, ExternalLink, XCircle } from 'lucide-react';
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
import { buildGoogleReviewWhatsAppLink } from '@/lib/notifications/review-request';
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
  googleReviewUrl?: string | null;
  currency: 'MXN' | 'USD';
  timezone: string;
  canViewClients?: boolean;
  canManageIntegrations?: boolean;
  busyStatus?: BookingStatus | null;
  isRejectingDeposit?: boolean;
  isReminding: boolean;
  isRequestingReschedule: boolean;
  onClose: () => void;
  onUpdateStatus: (bookingId: string, status: BookingStatus) => Promise<boolean>;
  onRejectDeposit?: (bookingId: string, bookingCode: string) => Promise<boolean>;
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
  googleReviewUrl = null,
  currency,
  timezone,
  canViewClients = true,
  canManageIntegrations = false,
  busyStatus = null,
  isRejectingDeposit = false,
  isReminding,
  isRequestingReschedule,
  onClose,
  onUpdateStatus,
  onRejectDeposit,
  onOpenCheckout,
  onSendReminder,
  onRequestReschedule,
}: BookingQuickPopoverProps) {
  const [proofZoomOpen, setProofZoomOpen] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<
    'canceled' | 'no_show' | 'reject_deposit' | null
  >(null);
  const [actionError, setActionError] = useState<{
    bookingId: string;
    message: string;
  } | null>(null);

  if (!booking) {
    return (
      <Dialog isOpen={false} onOpenChange={() => onClose()} width={500} padding={5}>
        <VStack gap={2} />
      </Dialog>
    );
  }

  const visibleActionError =
    actionError && actionError.bookingId === booking.id ? actionError.message : null;
  const isBusy = Boolean(busyStatus) || isRejectingDeposit;
  const allowedNext: readonly BookingStatus[] = BOOKING_TRANSITIONS[booking.status];
  const extraServiceNames = (booking.extraServiceIds ?? [])
    .map((id) => allServices.find((s) => s.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const igHandle = booking.clientInstagram ?? booking.client.instagramHandle ?? null;
  const igUrl = buildInstagramProfileUrl(igHandle);
  const proofMeta = getProofBadgeMeta(booking);
  const hasDisplayableProof = isDisplayableProofImage(
    booking.paymentProofUrl,
    booking.proofDeliveryMethod,
  );
  const hasExternalProofLink = Boolean(
    booking.paymentProofUrl &&
      !hasDisplayableProof &&
      booking.paymentProofUrl.startsWith('https://'),
  );
  const hasUploadedProof =
    booking.proofDeliveryMethod !== 'none' || Boolean(booking.paymentProofUrl);
  const paymentSummary = computeBookingPaymentSummary(
    booking.totalPriceCents,
    paymentSplits.filter((s) => s.bookingId === booking.id),
  );
  const isPending = allowedNext.includes('confirmed');
  const canRejectProof = Boolean(isPending && hasUploadedProof && onRejectDeposit);
  const canRemind =
    booking.status === 'confirmed' ||
    booking.status === 'pending_confirmation' ||
    booking.status === 'pending_payment';
  const canCollect =
    booking.status !== 'canceled' &&
    booking.status !== 'no_show' &&
    (allowedNext.includes('completed') || paymentSummary.isUncollected);

  const isCompleted = booking.status === 'completed';
  const waHref = buildWhatsAppLink(
    booking.client.phoneE164,
    `Hola ${booking.client.fullName}, te escribimos de ${salonName} sobre tu cita (${booking.bookingCode}) de ${booking.service.name} el ${formatDateShortInTimezone(booking.startAt, timezone)} a las ${formatTimeInTimezone(booking.startAt, timezone)}.`,
  );
  const reviewWaHref = isCompleted
    ? buildGoogleReviewWhatsAppLink({
        phoneE164: booking.client.phoneE164,
        clientFullName: booking.client.fullName,
        salonName,
        googleReviewUrl,
      })
    : null;
  const clientProfileHref = `/admin/clientas?q=${encodeURIComponent(booking.client.phoneE164)}`;
  const headerSubtitle = `${formatDateShortInTimezone(booking.startAt, timezone)} · ${formatTimeInTimezone(booking.startAt, timezone)} – ${formatTimeInTimezone(booking.endAt, timezone)} (${formatDuration(booking.totalDurationMinutes)})`;

  const handleClose = () => {
    setProofZoomOpen(false);
    setPendingConfirm(null);
    setActionError(null);
    onClose();
  };

  const handleStatusAction = async (nextStatus: BookingStatus) => {
    if (isBusy) return;
    setActionError(null);
    try {
      const ok = await onUpdateStatus(booking.id, nextStatus);
      if (ok) {
        handleClose();
        return;
      }
      setPendingConfirm(null);
      setProofZoomOpen(false);
      if (nextStatus !== 'canceled') {
        setActionError({
          bookingId: booking.id,
          message:
            'No se pudo actualizar el estado de la cita. Intenta de nuevo en unos segundos.',
        });
      }
    } catch {
      setPendingConfirm(null);
      setProofZoomOpen(false);
      setActionError({
        bookingId: booking.id,
        message: 'Error de conexión al actualizar la cita. Intenta de nuevo.',
      });
    }
  };

  const handleRejectDepositAction = async () => {
    if (isBusy || !onRejectDeposit) return;
    setActionError(null);
    try {
      const ok = await onRejectDeposit(booking.id, booking.bookingCode);
      setPendingConfirm(null);
      if (ok) {
        handleClose();
        return;
      }
      setActionError({
        bookingId: booking.id,
        message: 'No se pudo rechazar el comprobante. Intenta de nuevo.',
      });
    } catch {
      setPendingConfirm(null);
      setActionError({
        bookingId: booking.id,
        message: 'Error de conexión al rechazar el comprobante.',
      });
    }
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
        maxHeight="min(90dvh, calc(100dvh - 2rem))"
        padding={5}
      >
        <Layout
          header={
            <DialogHeader
              title={booking.client.fullName}
              subtitle={headerSubtitle}
              hasDivider
              onOpenChange={handleDialogOpenChange}
            />
          }
          content={
            <LayoutContent>
              <VStack
                gap={3}
                className={isBusy ? 'fx-busy' : undefined}
                aria-busy={isBusy || undefined}
              >
                {visibleActionError ? (
                  <Banner
                    status="error"
                    role="alert"
                    title={visibleActionError}
                    isDismissable
                    onDismiss={() => setActionError(null)}
                  />
                ) : null}
                <HStack gap={2} align="center" wrap="wrap">
                  <BookingStatusTag
                    status={booking.status}
                    hasPaymentProof={Boolean(booking.paymentProofUrl)}
                  />
                  {isBusy ? (
                    <Text className="fx-save-pill" data-state="saving" role="status" aria-live="polite">
                      Actualizando…
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
                        <VStack gap={1} className="rb-grow">
                          <Text size="sm" weight="semibold">
                            Comprobante de anticipo
                          </Text>
                          <HStack gap={1.5} wrap="wrap">
                            <Button
                              type="button"
                              label="Ver comprobante"
                              variant="secondary"
                              size="sm"
                              onClick={() => setProofZoomOpen(true)}
                            />
                            {canRejectProof ? (
                              <Button
                                type="button"
                                label="Rechazar comprobante"
                                variant="ghost"
                                size="sm"
                                icon={<XCircle size={14} aria-hidden="true" />}
                                isDisabled={isBusy}
                                onClick={() => setPendingConfirm('reject_deposit')}
                              />
                            ) : null}
                          </HStack>
                        </VStack>
                      </HStack>
                    ) : hasExternalProofLink && booking.paymentProofUrl ? (
                      <HStack gap={2} align="center" wrap="wrap" paddingBlockStart={1}>
                        <Button
                          label="Ver enlace del comprobante"
                          variant="secondary"
                          size="sm"
                          icon={<ExternalLink size={14} aria-hidden="true" />}
                          href={booking.paymentProofUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        />
                        {canRejectProof ? (
                          <Button
                            type="button"
                            label="Rechazar comprobante"
                            variant="ghost"
                            size="sm"
                            icon={<XCircle size={14} aria-hidden="true" />}
                            isDisabled={isBusy}
                            onClick={() => setPendingConfirm('reject_deposit')}
                          />
                        ) : null}
                      </HStack>
                    ) : canRejectProof ? (
                      <HStack gap={2} align="center" wrap="wrap" paddingBlockStart={1}>
                        <Button
                          type="button"
                          label="Rechazar comprobante"
                          variant="ghost"
                          size="sm"
                          icon={<XCircle size={14} aria-hidden="true" />}
                          isDisabled={isBusy}
                          onClick={() => setPendingConfirm('reject_deposit')}
                        />
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
                  isCompleted={isCompleted}
                  canCollect={canCollect}
                  canRemind={canRemind}
                  isFullyPaid={paymentSummary.isFullyPaid}
                  isBusy={isBusy}
                  busyStatus={busyStatus}
                  isReminding={isReminding}
                  isRequestingReschedule={isRequestingReschedule}
                  canViewClients={canViewClients}
                  canManageIntegrations={canManageIntegrations}
                  waHref={waHref}
                  reviewWaHref={reviewWaHref}
                  reviewSettingsHref="/admin/integraciones?section=resenas#analytics-heading"
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
            </LayoutContent>
          }
        />
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
          isRejecting={isRejectingDeposit}
          isBusy={isBusy}
          onConfirm={() => void handleStatusAction('confirmed')}
          onReject={
            canRejectProof
              ? () => {
                  setProofZoomOpen(false);
                  setPendingConfirm('reject_deposit');
                }
              : undefined
          }
        />
      ) : null}

      <ConfirmActionDialog
        isOpen={pendingConfirm !== null}
        onOpenChange={(open) => {
          if (!open && !isBusy) setPendingConfirm(null);
        }}
        title={
          pendingConfirm === 'reject_deposit'
            ? '¿Rechazar este comprobante?'
            : pendingConfirm === 'no_show'
              ? `¿Marcar a ${booking.client.fullName} como no asistió?`
              : `¿Cancelar la cita de ${booking.client.fullName}?`
        }
        description={
          pendingConfirm === 'reject_deposit'
            ? `Le avisaremos a ${booking.client.fullName} que no pudimos validar su comprobante para que suba uno nuevo. Su horario seguirá apartado mientras tanto.`
            : pendingConfirm === 'no_show'
              ? 'La cita quedará registrada como inasistencia (no llegó) y contará para la política de faltas.'
              : 'Se liberará este horario en la agenda y la cita cambiará a estado cancelada.'
        }
        confirmLabel={
          pendingConfirm === 'reject_deposit'
            ? 'Sí, rechazar'
            : pendingConfirm === 'no_show'
              ? 'Sí, marcar no llegó'
              : 'Sí, cancelar cita'
        }
        variant="destructive"
        isLoading={isBusy}
        onConfirm={async () => {
          if (pendingConfirm === 'reject_deposit') {
            await handleRejectDepositAction();
          } else if (pendingConfirm) {
            await handleStatusAction(pendingConfirm);
          }
        }}
      />
    </>
  );
}
