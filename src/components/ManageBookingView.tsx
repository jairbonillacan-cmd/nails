'use client';

import type React from 'react';
import { useCallback, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import NextLink from 'next/link';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Banner } from '@astryxdesign/core/Banner';
import { WifiOff } from 'lucide-react';
import type { AvailableSlot, DayAvailabilitySummary } from '@/lib/availability/engine';
import { checkManagePolicyWindow } from '@/lib/availability/policy';
import {
  buildTouchUpBookingUrl,
  computeSuggestedTouchUpDateKey,
} from '@/lib/booking/recurrence';
import type { PublicLoyaltySummaryDTO, PublicSettingsDTO } from '@/lib/public-dto';
import {
  CANCELLATION_REASON_OPTIONS,
  RESCHEDULE_REASON_OPTIONS,
} from '@/lib/notifications/cascade';
import {
  formatDateLongInTimezone,
  formatDuration,
  formatTimeInTimezone,
  getDateKeyInTimezone,
} from '@/lib/format';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import { useServiceWorker } from '@/lib/hooks/useServiceWorker';
import { BookingHeader } from './booking/BookingChrome';
import { hasConfiguredDeposit } from './booking/bookingHelpers';
import { BookingSummaryCard, type SummaryRow } from './booking/BookingSummaryCard';
import { LoyaltyStampCard } from './LoyaltyStampCard';
import { CitaHero } from './cita/CitaHero';
import { CitaDepositSection } from './cita/CitaDepositSection';
import { CitaActionsPanel } from './cita/CitaActionsPanel';
import { CitaReviewCard } from './cita/CitaReviewCard';
import {
  buildPolicyHelpWhatsAppUrl,
  type CalendarAddLinks,
  type PublicManageBooking,
} from './cita/types';

const CitaDialogs = dynamic(
  () => import('./cita/CitaDialogs').then((mod) => mod.CitaDialogs),
  { ssr: false },
);

function appendManageTokenToMediaUrl(
  url: string | null,
  manageToken: string,
): string | null {
  const trimmed = url?.trim() ?? '';
  if (!trimmed) return null;
  const cleanToken = manageToken.trim();
  if (!trimmed.startsWith('/api/media/') || !cleanToken) {
    return url;
  }
  if (/(?:^|[?&])token=/.test(trimmed)) {
    return trimmed;
  }
  const separator = trimmed.includes('?') ? '&' : '?';
  return `${trimmed}${separator}token=${encodeURIComponent(cleanToken)}`;
}

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
  const [booking, setBooking] = useState<PublicManageBooking>(initialBooking);
  const [calendarLinks, setCalendarLinks] = useState<CalendarAddLinks>(initialCalendarLinks);
  const [whatsappUrl, setWhatsappUrl] = useState(initialWhatsappUrl);
  const [manageUrl, setManageUrl] = useState(
    initialManageUrl || `/cita/${initialBooking.manageToken}`,
  );
  const [loyaltySummary, setLoyaltySummary] =
    useState<PublicLoyaltySummaryDTO | null>(initialLoyaltySummary);
  const [nowMs, setNowMs] = useState<number>(() => {
    const parsed = renderedAtIso ? new Date(renderedAtIso).getTime() : Number.NaN;
    if (!Number.isNaN(parsed)) return parsed;
    const updated = new Date(initialBooking.updatedAt).getTime();
    return Number.isNaN(updated) ? 0 : updated;
  });

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionErrorCode, setActionErrorCode] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [conflictSlots, setConflictSlots] = useState<AvailableSlot[]>([]);
  const [submittingSlotStartAt, setSubmittingSlotStartAt] = useState<string | null>(null);

  const actionLockRef = useRef(false);
  const proofLockRef = useRef(false);
  const proofSavedFeedback = useEphemeralMessage(4200);

  const initialCanModify = !['canceled', 'completed', 'no_show'].includes(
    initialBooking.status,
  );
  const [cancelOpen, setCancelOpen] = useState(
    initialAction === 'cancel' && initialCanModify,
  );
  const [cancelReasonChoice, setCancelReasonChoice] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);

  const [rescheduleOpen, setRescheduleOpen] = useState(
    initialAction === 'reschedule' && initialCanModify,
  );
  const [rescheduleReasonChoice, setRescheduleReasonChoice] = useState<string | null>(null);
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [rescheduleDays, setRescheduleDays] = useState<DayAvailabilitySummary[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(
    initialAction === 'reschedule' && initialCanModify,
  );

  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5>(
    initialBooking.review?.rating ?? 5,
  );
  const [reviewComment, setReviewComment] = useState(
    initialBooking.review?.comment ?? '',
  );
  const [reviewSaved, setReviewSaved] = useState(Boolean(initialBooking.review));
  const [hasExistingReview, setHasExistingReview] = useState(Boolean(initialBooking.review));

  const { isOffline } = useServiceWorker({ register: false });
  const tz = settings.timezone || 'America/Mexico_City';
  const canModify = !['canceled', 'completed', 'no_show'].includes(booking.status);

  const reschedulePolicy = checkManagePolicyWindow({
    startAtIso: booking.startAt,
    nowMs,
    minHours: settings.minRescheduleHours,
    action: 'reschedule',
  });
  const cancelPolicy = checkManagePolicyWindow({
    startAtIso: booking.startAt,
    nowMs,
    minHours: settings.minCancelHours,
    action: 'cancel',
  });

  const policyHelpWhatsappUrl = buildPolicyHelpWhatsAppUrl({
    booking,
    settings,
    minHours: Math.max(settings.minCancelHours, settings.minRescheduleHours),
    fallbackUrl: whatsappUrl,
  });

  const suggestedTouchUpDate = computeSuggestedTouchUpDateKey({
    startAt: booking.startAt,
    daysAhead: 21,
    timezone: tz,
  });
  const touchUpUrl = buildTouchUpBookingUrl({
    serviceSlug: booking.service.slug,
    staffSlug: booking.staff.bookingSlug,
    suggestedDateKey: suggestedTouchUpDate,
  });

  const handleSelectCancelChip = (option: string) => {
    setCancelReasonChoice(option);
    if (option === 'Otro') {
      if (CANCELLATION_REASON_OPTIONS.some((preset) => preset === cancelReason.trim())) {
        setCancelReason('');
      }
      return;
    }
    setCancelReason(option);
  };

  const handleSelectRescheduleChip = (option: string) => {
    setRescheduleReasonChoice(option);
    if (option === 'Otro') {
      if (RESCHEDULE_REASON_OPTIONS.some((preset) => preset === rescheduleReason.trim())) {
        setRescheduleReason('');
      }
      return;
    }
    setRescheduleReason(option);
  };

  const syncManageState = useCallback(
    async (signal: AbortSignal) => {
      setNowMs(Date.now());
      try {
        const res = await fetch(
          `/api/bookings/manage/${encodeURIComponent(initialBooking.manageToken)}`,
          { cache: 'no-store', signal },
        );
        if (!res.ok || signal.aborted) return;
        const data = (await res.json()) as {
          booking?: PublicManageBooking;
          calendarLinks?: CalendarAddLinks;
          whatsappUrl?: string;
          manageUrl?: string;
          loyaltySummary?: PublicLoyaltySummaryDTO | null;
        };
        if (signal.aborted) return;
        if (data.booking) setBooking(data.booking);
        if (data.calendarLinks) setCalendarLinks(data.calendarLinks);
        if (data.whatsappUrl) setWhatsappUrl(data.whatsappUrl);
        if (data.manageUrl) setManageUrl(data.manageUrl);
        if ('loyaltySummary' in data) {
          setLoyaltySummary(data.loyaltySummary ?? null);
        }
      } catch {
        return;
      }
    },
    [initialBooking.manageToken],
  );

  useExternalSync(initialBooking.manageToken, syncManageState);

  const extraServiceIdsKey = (booking.extraServiceIds ?? []).join(',');
  const addonIdsKey = booking.addons.map((a) => a.addonId).join(',');

  const loadRescheduleSlots = useCallback(
    async (signal?: AbortSignal) => {
      setLoadingSlots(true);
      try {
        const startDate = getDateKeyInTimezone(new Date(), tz);
        const qs = new URLSearchParams({
          serviceId: booking.serviceId,
          addonIds: addonIdsKey,
          staffId: booking.staffId,
          startDate,
          days: '14',
          manageToken: booking.manageToken,
        });
        if (extraServiceIdsKey) {
          qs.set('extraServiceIds', extraServiceIdsKey);
        }
        const res = await fetch(`/api/availability?${qs.toString()}`, {
          cache: 'no-store',
          signal,
        });
        if (signal?.aborted) return;
        const data = (await res.json()) as { days?: DayAvailabilitySummary[] };
        if (signal?.aborted) return;
        setRescheduleDays((data.days ?? []).filter((d) => d.hasSlots).slice(0, 6));
      } catch {
        return;
      } finally {
        if (!signal?.aborted) {
          setLoadingSlots(false);
        }
      }
    },
    [
      addonIdsKey,
      booking.manageToken,
      booking.serviceId,
      booking.staffId,
      extraServiceIdsKey,
      tz,
    ],
  );

  const syncRescheduleSlots = useCallback(
    async (signal: AbortSignal) => {
      if (!rescheduleOpen || !canModify || !reschedulePolicy.allowed) {
        setLoadingSlots(false);
        return;
      }
      await loadRescheduleSlots(signal);
    },
    [canModify, loadRescheduleSlots, rescheduleOpen, reschedulePolicy.allowed],
  );

  useExternalSync(
    rescheduleOpen && canModify && reschedulePolicy.allowed
      ? `reschedule:${booking.id}:${booking.serviceId}:${extraServiceIdsKey}:${addonIdsKey}:${booking.staffId}`
      : 'reschedule:closed',
    syncRescheduleSlots,
  );

  const openReschedule = () => {
    const freshNow = Date.now();
    setNowMs(freshNow);
    setActionError(null);
    setActionErrorCode(null);
    setConflictSlots([]);
    const allowedNow = checkManagePolicyWindow({
      startAtIso: booking.startAt,
      nowMs: freshNow,
      minHours: settings.minRescheduleHours,
      action: 'reschedule',
    }).allowed;
    setLoadingSlots(allowedNow);
    setRescheduleOpen(true);
  };

  const openCancel = () => {
    setNowMs(Date.now());
    setActionError(null);
    setActionErrorCode(null);
    setCancelOpen(true);
  };

  const handleUploadProof = async (dataUrl: string): Promise<boolean> => {
    if (proofLockRef.current || uploadingProof) return false;
    proofLockRef.current = true;
    setUploadingProof(true);
    setActionError(null);
    setActionErrorCode(null);
    try {
      const res = await fetch(
        `/api/bookings/manage/${encodeURIComponent(booking.manageToken)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'upload_proof',
            paymentProofUrl: dataUrl,
          }),
        },
      );
      const data = (await res.json()) as {
        booking?: PublicManageBooking;
        calendarLinks?: CalendarAddLinks;
        whatsappUrl?: string;
        manageUrl?: string;
        error?: string;
      };
      if (!res.ok) {
        setActionError(data.error || 'No se pudo subir el comprobante.');
        return false;
      }
      if (data.booking) setBooking(data.booking);
      if (data.calendarLinks) setCalendarLinks(data.calendarLinks);
      if (data.whatsappUrl) setWhatsappUrl(data.whatsappUrl);
      if (data.manageUrl) setManageUrl(data.manageUrl);
      proofSavedFeedback.show('Comprobante guardado ✓');
      setActionSuccess('¡Listo! Recibimos tu comprobante de anticipo. En breve te confirmamos.');
      return true;
    } catch {
      setActionError('Error de conexión al subir el comprobante. Intenta de nuevo.');
      return false;
    } finally {
      setUploadingProof(false);
      proofLockRef.current = false;
    }
  };

  const handleConfirmReschedule = async (slot: AvailableSlot) => {
    if (actionLockRef.current || busy) return;
    actionLockRef.current = true;
    setBusy(true);
    setSubmittingSlotStartAt(slot.startAt);
    setActionError(null);
    setActionErrorCode(null);
    try {
      const res = await fetch(
        `/api/bookings/manage/${encodeURIComponent(booking.manageToken)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'reschedule',
            newStartAt: slot.startAt,
            newStaffId: slot.staffId,
            reason: rescheduleReason.trim() || undefined,
          }),
        },
      );
      const data = (await res.json()) as {
        booking?: PublicManageBooking;
        calendarLinks?: CalendarAddLinks;
        whatsappUrl?: string;
        manageUrl?: string;
        code?: string;
        error?: string;
        suggestedSlots?: AvailableSlot[];
      };
      if (!res.ok) {
        if (res.status === 409 || data.code === 'SLOT_TAKEN') {
          setActionErrorCode('SLOT_TAKEN');
          setActionError(
            data.error ||
              'Ese horario acaba de ocuparse. Elige una de las alternativas cercanas disponibles.',
          );
          setConflictSlots(
            Array.isArray(data.suggestedSlots) ? data.suggestedSlots.slice(0, 4) : [],
          );
          void loadRescheduleSlots();
          return;
        }
        if (data.code === 'POLICY_WINDOW') {
          setNowMs(Date.now());
          setActionErrorCode('POLICY_WINDOW');
        }
        setActionError(data.error || 'No se pudo reagendar.');
        return;
      }
      if (data.booking) setBooking(data.booking);
      if (data.calendarLinks) setCalendarLinks(data.calendarLinks);
      if (data.whatsappUrl) setWhatsappUrl(data.whatsappUrl);
      if (data.manageUrl) setManageUrl(data.manageUrl);
      setNowMs(Date.now());
      setConflictSlots([]);
      setRescheduleReasonChoice(null);
      setRescheduleReason('');
      setRescheduleOpen(false);
      setActionSuccess(
        '¡Listo! Tu cita fue reagendada y tus enlaces de calendario y WhatsApp se actualizaron.',
      );
    } catch {
      setActionError('Error de conexión al reagendar. Intenta nuevamente.');
    } finally {
      setBusy(false);
      setSubmittingSlotStartAt(null);
      actionLockRef.current = false;
    }
  };

  const handleConfirmCancel = async () => {
    if (actionLockRef.current || busy) return;
    actionLockRef.current = true;
    setBusy(true);
    setActionError(null);
    setActionErrorCode(null);
    try {
      const res = await fetch(
        `/api/bookings/manage/${encodeURIComponent(booking.manageToken)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'cancel',
            reason: cancelReason.trim() || undefined,
          }),
        },
      );
      const data = (await res.json()) as {
        booking?: PublicManageBooking;
        calendarLinks?: CalendarAddLinks;
        whatsappUrl?: string;
        manageUrl?: string;
        code?: string;
        error?: string;
      };
      if (!res.ok) {
        if (data.code === 'POLICY_WINDOW') {
          setNowMs(Date.now());
          setActionErrorCode('POLICY_WINDOW');
        }
        setActionError(data.error || 'No se pudo cancelar la cita.');
        return;
      }
      if (data.booking) setBooking(data.booking);
      if (data.calendarLinks) setCalendarLinks(data.calendarLinks);
      if (data.whatsappUrl) setWhatsappUrl(data.whatsappUrl);
      if (data.manageUrl) setManageUrl(data.manageUrl);
      setCancelOpen(false);
      setCancelReasonChoice(null);
      setCancelReason('');
      setActionSuccess(
        booking.couponCode
          ? `Cita cancelada correctamente. El horario quedó libre y tu código ${booking.couponCode} fue liberado.`
          : 'Cita cancelada correctamente. El espacio se liberó al instante.',
      );
    } catch {
      setActionError('Error de conexión al cancelar la cita. Intenta nuevamente.');
    } finally {
      setBusy(false);
      actionLockRef.current = false;
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actionLockRef.current || busy) return;
    actionLockRef.current = true;
    setBusy(true);
    setReviewError(null);
    try {
      const res = await fetch(
        `/api/bookings/manage/${encodeURIComponent(booking.manageToken)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rating, comment: reviewComment }),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setReviewError(data.error || 'No se pudo guardar tu calificación. Intenta de nuevo.');
        return;
      }
      setReviewSaved(true);
      setHasExistingReview(true);
    } catch {
      setReviewError('Error de conexión al guardar tu calificación. Intenta de nuevo.');
    } finally {
      setBusy(false);
      actionLockRef.current = false;
    }
  };

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

  const loyaltyCardElement = loyaltySummary ? (
    <LoyaltyStampCard loyaltySummary={loyaltySummary} studioName={settings.name} />
  ) : null;

  const displayBooking: PublicManageBooking = {
    ...booking,
    paymentProofUrl: appendManageTokenToMediaUrl(
      booking.paymentProofUrl,
      booking.manageToken,
    ),
    inspoPhotoUrl: appendManageTokenToMediaUrl(
      booking.inspoPhotoUrl,
      booking.manageToken,
    ),
  };

  const year = settings.updatedAt.slice(0, 4);

  return (
    <VStack className="lk-root rb-root">
      <BookingHeader salonName={settings.name} whatsappUrl={whatsappUrl} />

      <CitaHero
        status={booking.status}
        bookingCode={booking.bookingCode}
        salonName={settings.name}
        hasPaymentProof={hasPaymentProof}
        requiresDeposit={requiresDeposit}
      />

      <VStack as="main" gap={4} className="rb-wrap rb-main ck-wrap">
        {isOffline ? (
          <HStack
            role="status"
            aria-live="polite"
            align="center"
            gap={2}
            className="pt-offline-pill"
            data-inline="true"
          >
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
        {actionSuccess ? (
          <VStack className="fx-fade-up">
            <Banner
              status="success"
              title={actionSuccess}
              isDismissable
              onDismiss={() => setActionSuccess(null)}
            />
          </VStack>
        ) : null}
        {actionError && !rescheduleOpen && !cancelOpen ? (
          <VStack className="fx-fade-up">
            <Banner
              status="error"
              title="Aviso sobre tu cita"
              description={actionError}
              isDismissable
              onDismiss={() => {
                setActionError(null);
                setActionErrorCode(null);
              }}
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
                  rating={rating}
                  reviewComment={reviewComment}
                  reviewSaved={reviewSaved}
                  hasExistingReview={hasExistingReview}
                  errorMessage={reviewError}
                  busy={busy}
                  onChangeRating={setRating}
                  onChangeComment={setReviewComment}
                  onEditReview={() => {
                    setReviewError(null);
                    setReviewSaved(false);
                  }}
                  onCancelEdit={() => {
                    setReviewError(null);
                    setReviewSaved(true);
                  }}
                  onSubmit={(e) => void handleSubmitReview(e)}
                />
                {loyaltyCardElement}
                <CitaActionsPanel
                  booking={displayBooking}
                  settings={settings}
                  calendarLinks={calendarLinks}
                  whatsappUrl={whatsappUrl}
                  policyHelpWhatsappUrl={policyHelpWhatsappUrl}
                  manageUrl={manageUrl}
                  touchUpUrl={touchUpUrl}
                  canModify={canModify}
                  rescheduleWindowAllowed={reschedulePolicy.allowed}
                  cancelWindowAllowed={cancelPolicy.allowed}
                  onOpenReschedule={openReschedule}
                  onOpenCancel={openCancel}
                />
              </>
            ) : (
              <>
                <CitaDepositSection
                  booking={displayBooking}
                  settings={settings}
                  timezone={tz}
                  isUploading={uploadingProof}
                  justUploadedMessage={proofSavedFeedback.message}
                  onUploadProof={handleUploadProof}
                />

                <CitaActionsPanel
                  booking={displayBooking}
                  settings={settings}
                  calendarLinks={calendarLinks}
                  whatsappUrl={whatsappUrl}
                  policyHelpWhatsappUrl={policyHelpWhatsappUrl}
                  manageUrl={manageUrl}
                  touchUpUrl={touchUpUrl}
                  canModify={canModify}
                  rescheduleWindowAllowed={reschedulePolicy.allowed}
                  cancelWindowAllowed={cancelPolicy.allowed}
                  loyaltySlot={loyaltyCardElement}
                  onOpenReschedule={openReschedule}
                  onOpenCancel={openCancel}
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

      {rescheduleOpen || cancelOpen ? (
        <CitaDialogs
          timezone={tz}
          minCancelHours={settings.minCancelHours}
          minRescheduleHours={settings.minRescheduleHours}
          rescheduleWindowAllowed={reschedulePolicy.allowed}
          cancelWindowAllowed={cancelPolicy.allowed}
          policyHelpWhatsappUrl={policyHelpWhatsappUrl}
          couponCode={booking.couponCode}
          busy={busy}
          submittingSlotStartAt={submittingSlotStartAt}
          errorMessage={actionError}
          errorCode={actionErrorCode}
          conflictSlots={conflictSlots}
          rescheduleOpen={rescheduleOpen}
          rescheduleReasonChoice={rescheduleReasonChoice}
          rescheduleReason={rescheduleReason}
          rescheduleDays={rescheduleDays}
          loadingSlots={loadingSlots}
          cancelOpen={cancelOpen}
          cancelReasonChoice={cancelReasonChoice}
          cancelReason={cancelReason}
          onRescheduleOpenChange={(open) => {
            if (!open) {
              setActionError(null);
              setActionErrorCode(null);
              setConflictSlots([]);
            }
            setRescheduleOpen(open);
          }}
          onSelectRescheduleChip={handleSelectRescheduleChip}
          onChangeRescheduleReason={setRescheduleReason}
          onConfirmReschedule={(slot) => void handleConfirmReschedule(slot)}
          onCancelOpenChange={(open) => {
            if (!open) {
              setActionError(null);
              setActionErrorCode(null);
            }
            setCancelOpen(open);
          }}
          onSelectCancelChip={handleSelectCancelChip}
          onChangeCancelReason={setCancelReason}
          onConfirmCancel={() => void handleConfirmCancel()}
        />
      ) : null}
    </VStack>
  );
}
