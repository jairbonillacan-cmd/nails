'use client';

import dynamic from 'next/dynamic';
import NextLink from 'next/link';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Banner } from '@astryxdesign/core/Banner';
import { WifiOff } from 'lucide-react';
import {
  formatDateLongInTimezone,
  formatDuration,
  formatTimeInTimezone,
} from '@/lib/format';
import { useManageBookingActions } from '@/lib/hooks/useManageBookingActions';
import { useServiceWorker } from '@/lib/hooks/useServiceWorker';
import type { PublicLoyaltySummaryDTO, PublicSettingsDTO } from '@/lib/public-dto';
import { BookingHeader } from './booking/BookingChrome';
import { hasConfiguredDeposit } from './booking/bookingHelpers';
import { BookingSummaryCard, type SummaryRow } from './booking/BookingSummaryCard';
import { LoyaltyStampCard } from './LoyaltyStampCard';
import { CitaActionsPanel } from './cita/CitaActionsPanel';
import { CitaDepositSection } from './cita/CitaDepositSection';
import { CitaHero } from './cita/CitaHero';
import { CitaReviewCard } from './cita/CitaReviewCard';
import {
  appendManageTokenToMediaUrl,
  type CalendarAddLinks,
  type PublicManageBooking,
} from './cita/types';

const CitaDialogs = dynamic(
  () => import('./cita/CitaDialogs').then((mod) => mod.CitaDialogs),
  { ssr: false },
);

interface ManageBookingViewProps {
  initialBooking: PublicManageBooking;
  settings: PublicSettingsDTO;
  calendarLinks: CalendarAddLinks;
  whatsappUrl: string;
  manageUrl?: string;
  initialLoyaltySummary?: PublicLoyaltySummaryDTO | null;
  initialAction?: 'reschedule' | 'cancel';
  renderedAtIso?: string;
}

export function ManageBookingView({
  initialBooking,
  settings,
  calendarLinks: initialCalendarLinks,
  whatsappUrl: initialWhatsappUrl,
  manageUrl: initialManageUrl,
  initialLoyaltySummary = null,
  initialAction,
  renderedAtIso,
}: ManageBookingViewProps) {
  const { isOffline } = useServiceWorker({ register: false });
  const manage = useManageBookingActions({
    initialBooking,
    settings,
    initialCalendarLinks,
    initialWhatsappUrl,
    initialManageUrl,
    initialLoyaltySummary,
    initialAction,
    renderedAtIso,
  });

  const { booking, tz } = manage;
  const extraServices = booking.extraServices ?? [];
  const serviceNames = [booking.service.name, ...extraServices.map((srv) => srv.name)].join(' + ');
  const addonsSummary = booking.addons.map((a) => a.name).join(' · ') || 'Sin extras';
  const hasStartingPrice = Boolean(
    booking.service.isStartingPrice || extraServices.some((srv) => srv.isStartingPrice),
  );
  const hasPaymentProof = Boolean(booking.paymentProofUrl?.trim());
  const requiresDeposit = hasConfiguredDeposit(settings, booking.depositAmountCents);
  const depositSummaryLabel =
    booking.status === 'canceled'
      ? 'Anticipo (cita cancelada)'
      : booking.status === 'confirmed' || booking.status === 'completed'
        ? 'Anticipo verificado'
        : hasPaymentProof
          ? 'Anticipo en revisión'
          : 'Anticipo para apartar';

  const summaryRows: SummaryRow[] = [
    {
      key: 'service',
      label: 'Servicio',
      value: serviceNames,
      sub: addonsSummary,
      mark: '1',
      isDone: true,
    },
    {
      key: 'when',
      label: 'Fecha y hora',
      value: `${formatDateLongInTimezone(booking.startAt, tz)} · ${formatTimeInTimezone(booking.startAt, tz)} – ${formatTimeInTimezone(booking.endAt, tz)}`,
      sub: settings.address,
      mark: '2',
      isDone: true,
    },
    {
      key: 'staff',
      label: 'Artista',
      value: booking.staff.name,
      sub: booking.client.fullName,
      mark: '3',
      isDone: true,
    },
    {
      key: 'duration',
      label: 'Duración',
      value: formatDuration(booking.totalDurationMinutes),
      sub: null,
      mark: 'clock',
      isDone: true,
    },
  ];

  const loyaltyCardElement = manage.loyaltySummary ? (
    <LoyaltyStampCard loyaltySummary={manage.loyaltySummary} studioName={settings.name} />
  ) : null;

  const displayBooking: PublicManageBooking = {
    ...booking,
    paymentProofUrl: appendManageTokenToMediaUrl(booking.paymentProofUrl, booking.manageToken),
    inspoPhotoUrl: appendManageTokenToMediaUrl(booking.inspoPhotoUrl, booking.manageToken),
  };

  const year = settings.updatedAt.slice(0, 4);

  return (
    <VStack className="lk-root rb-root">
      <BookingHeader salonName={settings.name} whatsappUrl={manage.whatsappUrl} />

      <CitaHero
        status={booking.status}
        bookingCode={booking.bookingCode}
        salonName={settings.name}
        hasPaymentProof={hasPaymentProof}
        requiresDeposit={requiresDeposit}
      />

      <VStack as="main" gap={4} className="rb-wrap rb-main ck-wrap">
        {isOffline ? (
          <HStack role="status" aria-live="polite" align="center" gap={2} className="pt-offline-pill" data-inline="true">
            <WifiOff size={15} aria-hidden="true" />
            <Text type="supporting" color="inherit" weight="semibold">
              Sin conexión · Mostrando copia guardada de tu cita
            </Text>
          </HStack>
        ) : null}

        {booking.noShowPolicyEnforced &&
        (booking.status === 'pending_confirmation' || booking.status === 'pending_payment') ? (
          <VStack className="fx-fade-up">
            <Banner
              status="info"
              title="Anticipo requerido por política de puntualidad"
              description="Para asegurar tu horario y cuidar la agenda de tu artista, se solicitó anticipo automático en esta cita."
            />
          </VStack>
        ) : null}

        {manage.actionSuccess ? (
          <VStack className="fx-fade-up">
            <Banner
              status="success"
              title={manage.actionSuccess}
              isDismissable
              onDismiss={manage.dismissActionSuccess}
            />
          </VStack>
        ) : null}

        {manage.actionError && !manage.rescheduleOpen && !manage.cancelOpen ? (
          <VStack className="fx-fade-up">
            <Banner
              status="error"
              title="Aviso sobre tu cita"
              description={manage.actionError}
              isDismissable
              onDismiss={manage.dismissActionError}
            />
          </VStack>
        ) : null}

        <VStack className="ck-layout">
          <VStack gap={4} className="ck-main-col">
            {booking.status === 'completed' ? (
              <>
                <CitaReviewCard
                  salonName={settings.name}
                  googleReviewUrl={settings.googleReviewUrl}
                  rating={manage.rating}
                  reviewComment={manage.reviewComment}
                  reviewSaved={manage.reviewSaved}
                  hasExistingReview={manage.hasExistingReview}
                  errorMessage={manage.reviewError}
                  busy={manage.busy}
                  onChangeRating={manage.setRating}
                  onChangeComment={manage.setReviewComment}
                  onEditReview={manage.startEditReview}
                  onCancelEdit={manage.cancelEditReview}
                  onSubmit={(e) => void manage.handleSubmitReview(e)}
                />
                {loyaltyCardElement}
                <CitaActionsPanel
                  booking={displayBooking}
                  settings={settings}
                  calendarLinks={manage.calendarLinks}
                  whatsappUrl={manage.whatsappUrl}
                  policyHelpWhatsappUrl={manage.policyHelpWhatsappUrl}
                  manageUrl={manage.manageUrl}
                  touchUpUrl={manage.touchUpUrl}
                  canModify={manage.canModify}
                  rescheduleWindowAllowed={manage.reschedulePolicy.allowed}
                  cancelWindowAllowed={manage.cancelPolicy.allowed}
                  onOpenReschedule={manage.openReschedule}
                  onOpenCancel={manage.openCancel}
                />
              </>
            ) : (
              <>
                <CitaDepositSection
                  booking={displayBooking}
                  settings={settings}
                  timezone={tz}
                  isUploading={manage.uploadingProof}
                  justUploadedMessage={manage.proofSavedMessage}
                  onUploadProof={manage.handleUploadProof}
                />
                <CitaActionsPanel
                  booking={displayBooking}
                  settings={settings}
                  calendarLinks={manage.calendarLinks}
                  whatsappUrl={manage.whatsappUrl}
                  policyHelpWhatsappUrl={manage.policyHelpWhatsappUrl}
                  manageUrl={manage.manageUrl}
                  touchUpUrl={manage.touchUpUrl}
                  canModify={manage.canModify}
                  rescheduleWindowAllowed={manage.reschedulePolicy.allowed}
                  cancelWindowAllowed={manage.cancelPolicy.allowed}
                  loyaltySlot={loyaltyCardElement}
                  onOpenReschedule={manage.openReschedule}
                  onOpenCancel={manage.openCancel}
                />
              </>
            )}
          </VStack>

          <VStack as="aside" className="ck-aside" aria-labelledby="ck-summary-aside">
            <BookingSummaryCard
              currency={settings.currency}
              rows={summaryRows}
              totalPriceCents={booking.totalPriceCents}
              hasStartingPrice={hasStartingPrice}
              discountCents={booking.discountCents}
              depositAmountCents={booking.depositAmountCents}
              depositLabel={depositSummaryLabel}
              codeBadge={booking.bookingCode}
              holdRemainingSec={0}
              holdTotalSec={0}
              headingId="ck-summary-aside"
            />
          </VStack>
        </VStack>
      </VStack>

      <VStack as="footer" className="ck-footer">
        <HStack justify="between" align="center" wrap="wrap" gap={3} className="rb-wrap">
          <Text type="supporting" color="secondary">
            © {year} {settings.name} · {settings.address}
          </Text>
          <HStack gap={4} wrap="wrap">
            <NextLink className="ck-footer-link" href="/">
              Inicio
            </NextLink>
            <NextLink className="ck-footer-link" href="/mis-citas">
              Mis citas
            </NextLink>
            <NextLink className="ck-footer-link" href="/reservar">
              Agendar otra cita
            </NextLink>
            <NextLink className="ck-footer-link" href="/aviso-de-privacidad">
              Aviso de privacidad
            </NextLink>
          </HStack>
        </HStack>
      </VStack>

      {manage.rescheduleOpen || manage.cancelOpen ? (
        <CitaDialogs
          timezone={tz}
          minCancelHours={settings.minCancelHours}
          minRescheduleHours={settings.minRescheduleHours}
          rescheduleWindowAllowed={manage.reschedulePolicy.allowed}
          cancelWindowAllowed={manage.cancelPolicy.allowed}
          policyHelpWhatsappUrl={manage.policyHelpWhatsappUrl}
          couponCode={booking.couponCode}
          busy={manage.busy}
          submittingSlotStartAt={manage.submittingSlotStartAt}
          errorMessage={manage.actionError}
          errorCode={manage.actionErrorCode}
          conflictSlots={manage.conflictSlots}
          rescheduleOpen={manage.rescheduleOpen}
          rescheduleReasonChoice={manage.rescheduleReasonChoice}
          rescheduleReason={manage.rescheduleReason}
          rescheduleDays={manage.rescheduleDays}
          loadingSlots={manage.loadingSlots}
          cancelOpen={manage.cancelOpen}
          cancelReasonChoice={manage.cancelReasonChoice}
          cancelReason={manage.cancelReason}
          onRescheduleOpenChange={manage.handleRescheduleOpenChange}
          onSelectRescheduleChip={manage.handleSelectRescheduleChip}
          onChangeRescheduleReason={manage.setRescheduleReason}
          onConfirmReschedule={(slot) => void manage.handleConfirmReschedule(slot)}
          onCancelOpenChange={manage.handleCancelOpenChange}
          onSelectCancelChip={manage.handleSelectCancelChip}
          onChangeCancelReason={manage.setCancelReason}
          onConfirmCancel={() => manage.handleConfirmCancel()}
        />
      ) : null}
    </VStack>
  );
}
