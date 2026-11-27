'use client';

import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Token } from '@astryxdesign/core/Token';
import { Link } from '@astryxdesign/core/Link';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { Banner } from '@astryxdesign/core/Banner';
import {
  AtSign,
  ExternalLink,
  History,
  Package,
  Sparkles,
  XCircle,
} from 'lucide-react';
import {
  BookingStatusTag,
  ConfirmActionDialog,
  CopyableField,
  DepositProofReviewDialog,
  StatusTag,
  SurfaceCard,
  type DepositProofReviewItem,
  type StatusTagTone,
} from '@/components/ui';
import {
  formatNailTechBadges,
  parseNailTechNotes,
} from '@/components/admin/clientas/nailTechProfile';
import { clientasHref, integracionesHref, whatsappHref } from '@/lib/admin-links';
import { computeBookingBalance } from '@/lib/booking/balance';
import { normalizeTouchUpDays } from '@/lib/booking/recurrence';
import { BOOKING_TRANSITIONS } from '@/lib/booking/state-machine';
import { useCurrentClockTick } from '@/lib/hooks/useCurrentClockTick';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import { computeClientLoyaltySummary } from '@/lib/loyalty/stamps';
import { roleCanAccess } from '@/lib/rbac';
import type {
  BookingStatus,
  BookingWithRelations,
  CashRegisterEntry,
  ClientProfile,
  LoyaltyProgram,
  LoyaltyStamp,
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
import { useAdminData } from '../AdminProvider';
import {
  buildInstagramProfileUrl,
  getProofBadgeMeta,
  isDisplayableProofImage,
} from './BookingCard';
import { BookingPopoverActions } from './BookingPopoverActions';
import { fetchActiveClientPackages } from './checkoutApi';
import type { ClientPackageSummaryRow } from './CheckoutLoyaltySection';

interface BookingQuickPopoverProps {
  booking: BookingWithRelations | null;
  allBookings?: readonly BookingWithRelations[];
  allServices: Service[];
  clients?: readonly ClientProfile[];
  loyaltyProgram?: LoyaltyProgram | null;
  loyaltyStamps?: readonly LoyaltyStamp[];
  paymentSplits: PaymentSplit[];
  cashEntries?: CashRegisterEntry[];
  serverNowIso?: string;
  noShowThreshold?: number;
  touchUpDays?: number;
  salonName: string;
  googleReviewUrl?: string | null;
  currency: 'MXN' | 'USD';
  timezone: string;
  canViewClients?: boolean;
  canManageIntegrations?: boolean;
  busyStatus?: BookingStatus | null;
  isCheckingIn?: boolean;
  isRejectingDeposit?: boolean;
  isReminding: boolean;
  isRequestingReschedule: boolean;
  onClose: () => void;
  onUpdateStatus: (bookingId: string, status: BookingStatus) => Promise<boolean>;
  onCheckIn?: (bookingId: string) => Promise<boolean>;
  onRejectDeposit?: (bookingId: string, bookingCode: string, reason?: string) => Promise<boolean>;
  onOpenCheckout: (booking: BookingWithRelations) => void;
  onScheduleRetouch?: (booking: BookingWithRelations) => void;
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
  allBookings = [],
  allServices,
  clients = [],
  loyaltyProgram = null,
  loyaltyStamps = [],
  paymentSplits,
  cashEntries = [],
  serverNowIso,
  noShowThreshold = 2,
  touchUpDays: touchUpDaysProp,
  salonName,
  googleReviewUrl = null,
  currency,
  timezone,
  canViewClients = true,
  canManageIntegrations = false,
  busyStatus = null,
  isCheckingIn = false,
  isRejectingDeposit = false,
  isReminding,
  isRequestingReschedule,
  onClose,
  onUpdateStatus,
  onCheckIn,
  onRejectDeposit,
  onOpenCheckout,
  onScheduleRetouch,
  onSendReminder,
  onRequestReschedule,
}: BookingQuickPopoverProps) {
  const { data: adminData } = useAdminData();
  const nowMs = useCurrentClockTick(serverNowIso ?? adminData?.serverNowIso ?? '');
  const canOpenWhatsAppInbox = Boolean(
    adminData && roleCanAccess(adminData.session.user.role, 'whatsapp'),
  );
  const [proofZoomOpen, setProofZoomOpen] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<
    'canceled' | 'no_show' | 'reject_deposit' | null
  >(null);
  const [actionError, setActionError] = useState<{
    bookingId: string;
    message: string;
  } | null>(null);
  const [clientPackages, setClientPackages] = useState<ClientPackageSummaryRow[]>([]);

  const packageSyncKey = booking
    ? `popover-pkg|${booking.clientId}|${booking.id}`
    : 'popover-pkg-closed';

  useExternalSync(packageSyncKey, async (signal, key) => {
    if (key === 'popover-pkg-closed' || !booking) {
      setClientPackages([]);
      return;
    }
    try {
      const timeoutSignal = AbortSignal.timeout(10_000);
      const effectiveSignal =
        typeof AbortSignal.any === 'function'
          ? AbortSignal.any([signal, timeoutSignal])
          : signal;
      const active = await fetchActiveClientPackages(
        booking.clientId,
        booking.serviceId,
        effectiveSignal,
      );
      if (!signal.aborted) setClientPackages(active);
    } catch {
      if (!signal.aborted) setClientPackages([]);
    }
  });

  const lastCompletedBooking = useMemo(() => {
    if (!booking) return null;
    const pool = allBookings.length > 0 ? allBookings : (adminData?.bookings ?? []);
    const pastVisits = pool
      .filter(
        (item) =>
          item.clientId === booking.clientId &&
          item.id !== booking.id &&
          item.status === 'completed',
      )
      .toSorted((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt));
    return pastVisits[0] ?? null;
  }, [allBookings, adminData?.bookings, booking]);

  if (!booking) {
    return (
      <Dialog isOpen={false} onOpenChange={() => onClose()} width={520} padding={5}>
        <VStack gap={2} />
      </Dialog>
    );
  }

  const resolvedClients = clients.length > 0 ? clients : (adminData?.clients ?? []);
  const fullClientProfile =
    resolvedClients.find((c) => c.id === booking.clientId) ?? booking.client;
  const parsedClientNotes = parseNailTechNotes(fullClientProfile.notes ?? '');
  const techBadges = formatNailTechBadges(parsedClientNotes.profile);
  const activeLoyaltyProgram = loyaltyProgram ?? adminData?.loyaltyProgram ?? null;
  const activeLoyaltyStamps =
    loyaltyStamps.length > 0 ? loyaltyStamps : (adminData?.loyaltyStamps ?? []);
  const loyaltySummary = activeLoyaltyProgram
    ? computeClientLoyaltySummary(activeLoyaltyProgram, activeLoyaltyStamps, booking.clientId)
    : null;
  const touchUpDays = normalizeTouchUpDays(
    touchUpDaysProp ?? adminData?.settings.landingContent?.touchUpDays,
  );

  const visibleActionError =
    actionError && actionError.bookingId === booking.id ? actionError.message : null;
  const isBusy = Boolean(busyStatus) || isRejectingDeposit || isCheckingIn;
  const allowedNext: readonly BookingStatus[] = BOOKING_TRANSITIONS[booking.status];
  const extraServiceNames = (booking.extraServiceIds ?? [])
    .map((id) => allServices.find((s) => s.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const igHandle = booking.clientInstagram ?? fullClientProfile.instagramHandle ?? null;
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
  const balance = computeBookingBalance(booking, paymentSplits, cashEntries, nowMs);
  const isPastUnclosed = balance.isPastUnclosed;
  const isPending = allowedNext.includes('confirmed');
  const canRejectProof = Boolean(isPending && hasUploadedProof && onRejectDeposit);
  const canRemind =
    booking.status === 'confirmed' ||
    booking.status === 'pending_confirmation' ||
    booking.status === 'pending_payment';
  const canCollect =
    booking.status !== 'canceled' &&
    booking.status !== 'no_show' &&
    (allowedNext.includes('completed') || balance.isUncollected || isPastUnclosed);
  const isCheckedIn =
    booking.attendanceStatus === 'confirmed' || Boolean(booking.attendanceConfirmedAt);
  const canCheckIn =
    booking.status === 'confirmed' && !isCheckedIn && Boolean(onCheckIn);

  const isCompleted = booking.status === 'completed';
  const whatsappChatHref = canOpenWhatsAppInbox
    ? whatsappHref({
        phone: booking.client.phoneE164,
        bookingId: booking.id,
      })
    : null;
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
  const clientProfileHref = clientasHref({
    clientId: booking.clientId,
    q: booking.client.phoneE164,
  });
  const headerSubtitle = `${formatDateShortInTimezone(booking.startAt, timezone)} · ${formatTimeInTimezone(booking.startAt, timezone)} – ${formatTimeInTimezone(booking.endAt, timezone)} (${formatDuration(booking.totalDurationMinutes)})`;

  const hasClientContext = Boolean(
    techBadges.length > 0 ||
      loyaltySummary ||
      clientPackages.length > 0 ||
      fullClientProfile.noShowCount > 0 ||
      lastCompletedBooking ||
      parsedClientNotes.freeNotes,
  );

  const handleClose = () => {
    setProofZoomOpen(false);
    setPendingConfirm(null);
    setActionError(null);
    onClose();
  };

  const handleStatusAction = async (nextStatus: BookingStatus): Promise<boolean> => {
    if (isBusy) return false;
    setActionError(null);
    try {
      const ok = await onUpdateStatus(booking.id, nextStatus);
      if (ok) {
        handleClose();
        return true;
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
      return false;
    } catch {
      setPendingConfirm(null);
      setProofZoomOpen(false);
      setActionError({
        bookingId: booking.id,
        message: 'Error de conexión al actualizar la cita. Intenta de nuevo.',
      });
      return false;
    }
  };

  const handleCheckInAction = async () => {
    if (isBusy || !onCheckIn) return;
    setActionError(null);
    const ok = await onCheckIn(booking.id);
    if (!ok) {
      setActionError({
        bookingId: booking.id,
        message: 'No se pudo registrar la llegada. Intenta de nuevo.',
      });
    }
  };

  const handleRejectDepositAction = async (reason?: string): Promise<boolean> => {
    if (isBusy || !onRejectDeposit) return false;
    setActionError(null);
    try {
      const ok = await onRejectDeposit(booking.id, booking.bookingCode, reason);
      setPendingConfirm(null);
      if (ok) {
        handleClose();
        return true;
      }
      setActionError({
        bookingId: booking.id,
        message: 'No se pudo rechazar el comprobante. Intenta de nuevo.',
      });
      return false;
    } catch {
      setPendingConfirm(null);
      setActionError({
        bookingId: booking.id,
        message: 'Error de conexión al rechazar el comprobante.',
      });
      return false;
    }
  };

  const proofReviewItem: DepositProofReviewItem | null = proofZoomOpen
    ? {
        bookingId: booking.id,
        bookingCode: booking.bookingCode,
        clientName: booking.client.fullName,
        clientPhone: booking.client.phoneE164,
        clientInstagram: igHandle,
        serviceName: booking.service.name,
        staffName: booking.staff.name,
        startAt: booking.startAt,
        depositAmountCents: booking.depositAmountCents,
        proofDeliveryMethod: booking.proofDeliveryMethod,
        paymentProofUrl: booking.paymentProofUrl,
      }
    : null;

  const handleDialogOpenChange = (open: boolean) => {
    if (!open && !isBusy) handleClose();
  };

  return (
    <>
      <Dialog
        isOpen={Boolean(booking)}
        onOpenChange={handleDialogOpenChange}
        purpose="info"
        width={520}
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
                  {isPastUnclosed ? (
                    <StatusTag tone="warning" showDot label="Pasada sin cerrar" />
                  ) : (
                    <BookingStatusTag
                      status={booking.status}
                      hasPaymentProof={Boolean(booking.paymentProofUrl)}
                    />
                  )}
                  {isCheckedIn ? (
                    <StatusTag tone="success" label="En salón" />
                  ) : null}
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
                          type="button"
                          label="Revisar comprobante"
                          variant="secondary"
                          size="sm"
                          icon={<ExternalLink size={14} aria-hidden="true" />}
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
                    ) : isPending && booking.depositAmountCents > 0 ? (
                      <HStack gap={2} align="center" wrap="wrap" paddingBlockStart={1}>
                        <Button
                          type="button"
                          label="Revisar anticipo"
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
                    ) : null}
                  </VStack>
                </SurfaceCard>

                {hasClientContext ? (
                  <SurfaceCard tone="subtle" padded className="ad-pop-context">
                    <VStack gap={2}>
                      <HStack justify="between" align="center" gap={2} wrap="wrap">
                        <Text type="supporting" weight="semibold" color="secondary">
                          Ficha de la clienta
                        </Text>
                        {fullClientProfile.noShowCount > 0 ? (
                          <StatusTag
                            size="sm"
                            tone={
                              fullClientProfile.noShowCount >= noShowThreshold
                                ? 'danger'
                                : 'warning'
                            }
                            label={`${fullClientProfile.noShowCount} ${
                              fullClientProfile.noShowCount === 1
                                ? 'inasistencia'
                                : 'inasistencias'
                            }`}
                            hasTabularNumbers
                          />
                        ) : (
                          <Text type="supporting" color="secondary" hasTabularNumbers>
                            0 inasistencias
                          </Text>
                        )}
                      </HStack>

                      {techBadges.length > 0 ? (
                        <HStack gap={1.5} wrap="wrap" className="ad-pop-tech-chips">
                          {techBadges.map((badge) => (
                            <StatusTag
                              key={badge.label}
                              size="sm"
                              tone={badge.tone}
                              label={badge.label}
                            />
                          ))}
                        </HStack>
                      ) : null}

                      {loyaltySummary || clientPackages.length > 0 ? (
                        <HStack gap={1.5} wrap="wrap" align="center" className="ad-pop-loyalty-row">
                          {loyaltySummary ? (
                            <StatusTag
                              size="sm"
                              tone={loyaltySummary.isRewardReady ? 'success' : 'accent'}
                              icon={<Sparkles size={12} aria-hidden="true" />}
                              label={
                                loyaltySummary.isRewardReady
                                  ? `Premio listo (${loyaltySummary.currentStamps}/${loyaltySummary.stampsRequired})`
                                  : `${loyaltySummary.currentStamps}/${loyaltySummary.stampsRequired} sellos`
                              }
                              hasTabularNumbers
                            />
                          ) : null}
                          {clientPackages.map((pkg) => (
                            <StatusTag
                              key={pkg.id}
                              size="sm"
                              tone="info"
                              icon={<Package size={12} aria-hidden="true" />}
                              label={`${pkg.packageName} · ${pkg.remainingSessions}/${pkg.totalSessions}`}
                              hasTabularNumbers
                            />
                          ))}
                        </HStack>
                      ) : null}

                      {lastCompletedBooking ? (
                        <HStack gap={1.5} align="center" wrap="wrap">
                          <History size={13} aria-hidden="true" />
                          <Text type="supporting" color="secondary" hasTabularNumbers>
                            Última visita: {lastCompletedBooking.service.name} (
                            {formatDateShortInTimezone(lastCompletedBooking.startAt, timezone)})
                          </Text>
                        </HStack>
                      ) : null}

                      {parsedClientNotes.freeNotes ? (
                        <Text type="supporting" color="secondary" className="ad-pop-note">
                          Nota de ficha: {parsedClientNotes.freeNotes}
                        </Text>
                      ) : null}
                    </VStack>
                  </SurfaceCard>
                ) : null}

                <SurfaceCard tone={balance.isFullyPaid ? 'subtle' : 'warning'} padded>
                  <HStack justify="between" align="center" wrap="wrap" gap={2}>
                    <VStack gap={0.5}>
                      <Text type="supporting" color="secondary">
                        Precio y anticipo
                      </Text>
                      <Text weight="semibold" hasTabularNumbers>
                        Total {formatCurrency(balance.totalPriceCents, currency)}
                        {balance.depositPaidCents > 0 &&
                        balance.paidCents === balance.depositPaidCents
                          ? ` · Anticipo pagado ${formatCurrency(balance.depositPaidCents, currency)}`
                          : balance.depositPaidCents > 0
                            ? ` · Pagado ${formatCurrency(balance.paidCents, currency)} (anticipo ${formatCurrency(balance.depositPaidCents, currency)})`
                            : balance.paidCents > 0
                              ? ` · Pagado ${formatCurrency(balance.paidCents, currency)}`
                              : ''}
                      </Text>
                    </VStack>
                    <StatusTag
                      label={
                        balance.isFullyPaid
                          ? 'Pagado completo'
                          : `Falta cobrar ${formatCurrency(balance.remainingCents, currency)}`
                      }
                      tone={balance.isFullyPaid ? 'success' : 'warning'}
                      hasTabularNumbers
                    />
                  </HStack>
                </SurfaceCard>

                {booking.clientNotes ? (
                  <Text type="supporting" color="secondary" className="ad-pop-note">
                    Nota de la clienta: {booking.clientNotes}
                  </Text>
                ) : null}
                {booking.internalNotes ? (
                  <Text type="supporting" color="secondary" className="ad-pop-note">
                    Nota interna: {booking.internalNotes}
                  </Text>
                ) : null}

                <BookingPopoverActions
                  allowedNext={allowedNext}
                  isPending={isPending}
                  isCompleted={isCompleted}
                  isPastUnclosed={isPastUnclosed}
                  isFullyPaid={balance.isFullyPaid}
                  canCollect={canCollect}
                  canRemind={canRemind}
                  canCheckIn={canCheckIn}
                  isCheckingIn={isCheckingIn}
                  touchUpDays={touchUpDays}
                  isBusy={isBusy}
                  busyStatus={busyStatus}
                  isReminding={isReminding}
                  isRequestingReschedule={isRequestingReschedule}
                  canViewClients={canViewClients}
                  canManageIntegrations={canManageIntegrations}
                  whatsappChatHref={whatsappChatHref}
                  waHref={waHref}
                  reviewWaHref={reviewWaHref}
                  reviewSettingsHref={integracionesHref({
                    section: 'resenas',
                    hash: 'analytics-heading',
                  })}
                  clientProfileHref={clientProfileHref}
                  onConfirm={() => void handleStatusAction('confirmed')}
                  onComplete={() => void handleStatusAction('completed')}
                  onCheckIn={canCheckIn ? () => void handleCheckInAction() : undefined}
                  onScheduleRetouch={
                    onScheduleRetouch
                      ? () => {
                          handleClose();
                          onScheduleRetouch(booking);
                        }
                      : undefined
                  }
                  onNoShowDirect={() => void handleStatusAction('no_show')}
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

      <DepositProofReviewDialog
        deposit={proofReviewItem}
        onClose={() => setProofZoomOpen(false)}
        currency={currency}
        timezone={timezone}
        canApprove={isPending}
        isApproving={busyStatus === 'confirmed'}
        isRejecting={isRejectingDeposit}
        onApprove={isPending ? () => handleStatusAction('confirmed') : undefined}
        onReject={
          canRejectProof ? (_item, reason) => handleRejectDepositAction(reason) : undefined
        }
      />

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
