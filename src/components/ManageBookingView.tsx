'use client';

import type React from 'react';
import { useCallback, useState } from 'react';
import NextLink from 'next/link';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Banner } from '@astryxdesign/core/Banner';
import type { AvailableSlot, DayAvailabilitySummary } from '@/lib/availability/engine';
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
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import { BookingHeader } from './booking/BookingChrome';
import { BookingSummaryCard, type SummaryRow } from './booking/BookingSummaryCard';
import { LoyaltyStampCard } from './LoyaltyStampCard';
import { CitaHero } from './cita/CitaHero';
import { CitaDepositSection } from './cita/CitaDepositSection';
import { CitaActionsPanel } from './cita/CitaActionsPanel';
import { CitaDialogs } from './cita/CitaDialogs';
import { CitaReviewCard } from './cita/CitaReviewCard';
import type { CalendarAddLinks, PublicManageBooking } from './cita/types';

interface ManageBookingViewProps {
  initialBooking: PublicManageBooking;
  settings: PublicSettingsDTO;
  calendarLinks: CalendarAddLinks;
  whatsappUrl: string;
  manageUrl?: string;
  initialLoyaltySummary?: PublicLoyaltySummaryDTO | null;
  initialAction?: 'reschedule' | 'cancel';
}

export function ManageBookingView({
  initialBooking,
  settings,
  calendarLinks: initialCalendarLinks,
  whatsappUrl: initialWhatsappUrl,
  manageUrl: initialManageUrl,
  initialLoyaltySummary = null,
  initialAction,
}: ManageBookingViewProps) {
  const [booking, setBooking] = useState<PublicManageBooking>(initialBooking);
  const [calendarLinks, setCalendarLinks] = useState<CalendarAddLinks>(initialCalendarLinks);
  const [whatsappUrl, setWhatsappUrl] = useState(initialWhatsappUrl);
  const [manageUrl, setManageUrl] = useState(
    initialManageUrl || `/cita/${initialBooking.manageToken}`,
  );
  const [loyaltySummary, setLoyaltySummary] =
    useState<PublicLoyaltySummaryDTO | null>(initialLoyaltySummary);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

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

  const tz = settings.timezone || 'America/Mexico_City';
  const canModify = !['canceled', 'completed', 'no_show'].includes(booking.status);

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
      if (!rescheduleOpen || !canModify) return;
      await loadRescheduleSlots(signal);
    },
    [canModify, loadRescheduleSlots, rescheduleOpen],
  );

  useExternalSync(
    rescheduleOpen && canModify
      ? `reschedule:${booking.id}:${booking.serviceId}:${extraServiceIdsKey}:${addonIdsKey}:${booking.staffId}`
      : 'reschedule:closed',
    syncRescheduleSlots,
  );

  const openReschedule = () => {
    setActionError(null);
    setLoadingSlots(true);
    setRescheduleOpen(true);
  };

  const handleUploadProof = async (dataUrl: string): Promise<boolean> => {
    setUploadingProof(true);
    setActionError(null);
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
        error?: string;
      };
      if (!res.ok) {
        setActionError(data.error || 'No se pudo subir el comprobante.');
        return false;
      }
      if (data.booking) setBooking(data.booking);
      if (data.calendarLinks) setCalendarLinks(data.calendarLinks);
      if (data.whatsappUrl) setWhatsappUrl(data.whatsappUrl);
      setActionSuccess('¡Listo! Recibimos tu comprobante de anticipo. En breve te confirmamos.');
      return true;
    } catch {
      setActionError('Error de conexión al subir el comprobante. Intenta de nuevo.');
      return false;
    } finally {
      setUploadingProof(false);
    }
  };

  const handleConfirmReschedule = async (slot: AvailableSlot) => {
    setBusy(true);
    setActionError(null);
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
        error?: string;
      };
      if (!res.ok) {
        setActionError(data.error || 'No se pudo reagendar.');
        return;
      }
      if (data.booking) setBooking(data.booking);
      if (data.calendarLinks) setCalendarLinks(data.calendarLinks);
      if (data.whatsappUrl) setWhatsappUrl(data.whatsappUrl);
      setRescheduleOpen(false);
      setActionSuccess('¡Tu cita fue reagendada y tu calendario actualizado!');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmCancel = async () => {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/bookings/manage/${encodeURIComponent(booking.manageToken)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'cancel',
            reason: cancelReason,
          }),
        },
      );
      const data = (await res.json()) as {
        booking?: PublicManageBooking;
        calendarLinks?: CalendarAddLinks;
        whatsappUrl?: string;
        error?: string;
      };
      if (!res.ok) {
        setActionError(data.error || 'No se pudo cancelar la cita.');
        return;
      }
      if (data.booking) setBooking(data.booking);
      if (data.calendarLinks) setCalendarLinks(data.calendarLinks);
      if (data.whatsappUrl) setWhatsappUrl(data.whatsappUrl);
      setCancelOpen(false);
      setActionSuccess('Cita cancelada correctamente. El espacio se liberó al instante.');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(
        `/api/bookings/manage/${encodeURIComponent(booking.manageToken)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rating, comment: reviewComment }),
        },
      );
      if (res.ok) {
        setReviewSaved(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const extraServices = booking.extraServices ?? [];
  const serviceNames = [booking.service.name, ...extraServices.map((srv) => srv.name)].join(' + ');
  const addonsSummary = booking.addons.map((a) => a.name).join(' · ') || 'Sin extras';
  const hasStartingPrice = Boolean(
    booking.service.isStartingPrice || extraServices.some((srv) => srv.isStartingPrice),
  );
  const hasPaymentProof = Boolean(booking.paymentProofUrl?.trim());
  const depositSummaryLabel =
    booking.status === 'confirmed' || booking.status === 'completed'
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

  const year = settings.updatedAt.slice(0, 4);

  return (
    <VStack className="lk-root rb-root">
      <BookingHeader salonName={settings.name} whatsappUrl={whatsappUrl} />

      <CitaHero
        status={booking.status}
        bookingCode={booking.bookingCode}
        salonName={settings.name}
        hasPaymentProof={hasPaymentProof}
      />

      <VStack as="main" gap={4} className="rb-wrap rb-main ck-wrap">
        {actionSuccess ? (
          <Banner
            status="success"
            title={actionSuccess}
            isDismissable
            onDismiss={() => setActionSuccess(null)}
          />
        ) : null}
        {actionError ? (
          <Banner
            status="error"
            title="Aviso sobre tu cita"
            description={actionError}
            isDismissable
            onDismiss={() => setActionError(null)}
          />
        ) : null}

        <VStack className="ck-layout">
          <VStack gap={4} className="ck-main-col">
            <CitaDepositSection
              booking={booking}
              settings={settings}
              timezone={tz}
              isUploading={uploadingProof}
              onUploadProof={handleUploadProof}
            />

            <CitaActionsPanel
              booking={booking}
              settings={settings}
              calendarLinks={calendarLinks}
              whatsappUrl={whatsappUrl}
              manageUrl={manageUrl}
              canModify={canModify}
              onOpenReschedule={openReschedule}
              onOpenCancel={() => {
                setActionError(null);
                setCancelOpen(true);
              }}
            />

            {loyaltySummary ? (
              <LoyaltyStampCard
                loyaltySummary={loyaltySummary}
                studioName={settings.name}
              />
            ) : null}

            {booking.status === 'completed' ? (
              <CitaReviewCard
                salonName={settings.name}
                googleReviewUrl={settings.googleReviewUrl}
                rating={rating}
                reviewComment={reviewComment}
                reviewSaved={reviewSaved}
                busy={busy}
                onChangeRating={setRating}
                onChangeComment={setReviewComment}
                onSubmit={(e) => void handleSubmitReview(e)}
              />
            ) : null}
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
            <NextLink className="ck-footer-link" href="/reservar">
              Agendar otra cita
            </NextLink>
            <NextLink className="ck-footer-link" href="/aviso-de-privacidad">
              Aviso de privacidad
            </NextLink>
          </HStack>
        </HStack>
      </VStack>

      <CitaDialogs
        timezone={tz}
        minCancelHours={settings.minCancelHours}
        busy={busy}
        rescheduleOpen={rescheduleOpen}
        rescheduleReasonChoice={rescheduleReasonChoice}
        rescheduleReason={rescheduleReason}
        rescheduleDays={rescheduleDays}
        loadingSlots={loadingSlots}
        cancelOpen={cancelOpen}
        cancelReasonChoice={cancelReasonChoice}
        cancelReason={cancelReason}
        onRescheduleOpenChange={setRescheduleOpen}
        onSelectRescheduleChip={handleSelectRescheduleChip}
        onChangeRescheduleReason={setRescheduleReason}
        onConfirmReschedule={(slot) => void handleConfirmReschedule(slot)}
        onCancelOpenChange={setCancelOpen}
        onSelectCancelChip={handleSelectCancelChip}
        onChangeCancelReason={setCancelReason}
        onConfirmCancel={() => void handleConfirmCancel()}
      />
    </VStack>
  );
}
