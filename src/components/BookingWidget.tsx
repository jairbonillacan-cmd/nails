'use client';

import type React from 'react';
import { useCallback, useMemo, useReducer, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Section } from '@astryxdesign/core/Section';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { ArrowLeft } from 'lucide-react';
import type { AvailableSlot, DayAvailabilitySummary } from '@/lib/availability/engine';
import { formatDateShortInTimezone } from '@/lib/format';
import { useCountdownTimer } from '@/lib/hooks/useCountdownTimer';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import { useRealtimeSubscription } from '@/lib/hooks/useRealtimeSubscription';
import { getOrCreateBrowserSessionToken } from '@/lib/hooks/useSessionToken';
import type {
  PublicServiceDTO,
  PublicSettingsDTO,
  PublicStaffDTO,
} from '@/lib/public-dto';
import type { BookingLayoutView, ServiceAddon } from '@/lib/types';
import { PublicShell } from './PublicShell';
import { ClientConfirmStep } from './booking/ClientConfirmStep';
import { ScheduleStep } from './booking/ScheduleStep';
import { ServiceStaffStep } from './booking/ServiceStaffStep';
import { WaitlistDialog } from './booking/WaitlistDialog';
import {
  fetchAvailabilityDays,
  requestSlotHold,
  submitBookingRequest,
  validateCouponCode,
  type AppliedCouponState,
} from './booking/bookingApi';
import {
  hasConfiguredDeposit,
  resolveDepositAmountCents,
  type ProofDeliveryMethod,
} from './booking/bookingHelpers';
import {
  bookingReducer,
  createInitialBookingFlowState,
} from './booking/bookingMachine';

interface BookingWidgetProps {
  settings: PublicSettingsDTO;
  services: PublicServiceDTO[];
  addons: ServiceAddon[];
  staff: PublicStaffDTO[];
  initialTodayKey: string;
  initialServiceSlug?: string;
  initialStaffSlug?: string;
  initialInspoNote?: string;
}

export function BookingWidget({
  settings,
  services,
  addons,
  staff,
  initialTodayKey,
  initialServiceSlug,
  initialStaffSlug,
  initialInspoNote,
}: BookingWidgetProps) {
  const router = useRouter();
  const [flow, dispatch] = useReducer(
    bookingReducer,
    undefined,
    createInitialBookingFlowState,
  );

  const initialService =
    services.find((s) => s.slug === initialServiceSlug) ?? services[0] ?? null;
  const initialStaff =
    staff.find((st) => st.bookingSlug === initialStaffSlug)?.id ?? 'any';

  const [selectedServiceId, setSelectedServiceId] = useState(initialService?.id ?? '');
  const [selectedExtraServiceIds, setSelectedExtraServiceIds] = useState<string[]>([]);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState(
    staff.length === 1 && staff[0] ? staff[0].id : initialStaff,
  );

  const [layoutView, setLayoutView] = useState<BookingLayoutView>(
    settings.defaultBookingLayout || 'month',
  );
  const [timeFormat, setTimeFormat] = useState<'12h' | '24h'>('12h');
  const [selectedDate, setSelectedDate] = useState(initialTodayKey);
  const [availabilityDays, setAvailabilityDays] = useState<DayAvailabilitySummary[]>([]);
  const [loadingAvail, setLoadingAvail] = useState(true);
  const realtimePing = useEphemeralMessage(3500);

  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientInstagram, setClientInstagram] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientBirthday, setClientBirthday] = useState('');
  const [clientNotes, setClientNotes] = useState(
    initialInspoNote ? `Referencia de galería: ${initialInspoNote}` : '',
  );
  const [inspoFile, setInspoFile] = useState<File | null>(null);
  const [inspoDataUrl, setInspoDataUrl] = useState<string | null>(null);
  const [proofDeliveryMethod, setProofDeliveryMethod] =
    useState<ProofDeliveryMethod>('web_upload');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofDataUrl, setProofDataUrl] = useState<string | null>(null);

  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCouponState | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [waitlistOpen, setWaitlistOpen] = useState(false);

  const idempotencyKeyRef = useRef('');

  const selectedService = useMemo(
    () => services.find((s) => s.id === selectedServiceId) ?? services[0],
    [services, selectedServiceId],
  );
  const selectedExtraServices = useMemo(
    () =>
      services.filter(
        (srv) =>
          srv.id !== selectedService?.id && selectedExtraServiceIds.includes(srv.id),
      ),
    [services, selectedService, selectedExtraServiceIds],
  );
  const selectedServiceIdSet = useMemo(() => {
    const ids = selectedExtraServices.map((srv) => srv.id);
    if (selectedService) ids.push(selectedService.id);
    return new Set(ids);
  }, [selectedService, selectedExtraServices]);

  const compatibleAddons = useMemo(() => {
    if (!selectedService) return [];
    return addons.filter(
      (a) => a.appliesToAll || a.serviceIds.some((id) => selectedServiceIdSet.has(id)),
    );
  }, [addons, selectedService, selectedServiceIdSet]);

  const activeSelectedAddons = useMemo(
    () => compatibleAddons.filter((a) => selectedAddonIds.includes(a.id)),
    [compatibleAddons, selectedAddonIds],
  );

  const eligibleStaff = useMemo(() => {
    if (!selectedService) return staff;
    const requiredIds = Array.from(selectedServiceIdSet);
    return staff.filter(
      (st) =>
        st.serviceIds.length === 0 ||
        requiredIds.every((id) => st.serviceIds.includes(id)),
    );
  }, [staff, selectedService, selectedServiceIdSet]);

  const totalDurationMinutes = useMemo(() => {
    if (!selectedService) return 0;
    return (
      selectedService.durationMinutes +
      selectedExtraServices.reduce((sum, srv) => sum + srv.durationMinutes, 0) +
      activeSelectedAddons.reduce((sum, a) => sum + a.extraMinutes, 0)
    );
  }, [selectedService, selectedExtraServices, activeSelectedAddons]);

  const subtotalCents = useMemo(() => {
    if (!selectedService) return 0;
    return (
      selectedService.priceCents +
      selectedExtraServices.reduce((sum, srv) => sum + srv.priceCents, 0) +
      activeSelectedAddons.reduce((sum, a) => sum + a.extraPriceCents, 0)
    );
  }, [selectedService, selectedExtraServices, activeSelectedAddons]);

  const hasStartingPrice = Boolean(
    selectedService?.isStartingPrice ||
      selectedExtraServices.some((srv) => srv.isStartingPrice),
  );
  const depositAmountCents = useMemo(
    () => resolveDepositAmountCents(settings, selectedService, selectedExtraServices),
    [settings, selectedService, selectedExtraServices],
  );
  const totalPriceCents = Math.max(0, subtotalCents - (appliedCoupon?.discountCents ?? 0));

  const extraServiceKey = selectedExtraServices.map((srv) => srv.id).join(',');
  const addonKey = activeSelectedAddons.map((a) => a.id).join(',');

  const fetchAvailability = useCallback(
    async (signal?: AbortSignal) => {
      if (!selectedService) return;
      try {
        const days = await fetchAvailabilityDays({
          serviceId: selectedService.id,
          extraServiceKey,
          addonKey,
          staffId: selectedStaffId,
          startDate: initialTodayKey,
          signal,
        });
        if (days) {
          setAvailabilityDays(days);
          setSelectedDate((currentDate) => {
            const currentDay = days.find((d) => d.date === currentDate);
            if (currentDay && currentDay.hasSlots) return currentDate;
            return days.find((d) => d.hasSlots)?.date ?? currentDate;
          });
        }
      } catch {
        return;
      } finally {
        if (!signal?.aborted) setLoadingAvail(false);
      }
    },
    [selectedService, extraServiceKey, addonKey, selectedStaffId, initialTodayKey],
  );

  useExternalSync(
    `${selectedService?.id ?? ''}:${extraServiceKey}:${addonKey}:${selectedStaffId}`,
    fetchAvailability,
  );

  useRealtimeSubscription(
    useCallback(
      (evt) => {
        if (
          evt.type === 'slot_changed' ||
          evt.type === 'hold_changed' ||
          evt.type === 'schedule_changed' ||
          evt.type === 'booking_created' ||
          evt.type === 'booking_updated' ||
          evt.type === 'slot_hold_updated' ||
          evt.type === 'availability_updated'
        ) {
          realtimePing.show('Disponibilidad actualizada en tiempo real');
          void fetchAvailability();
        }
      },
      [fetchAvailability, realtimePing],
    ),
  );

  const holdRemainingSec = useCountdownTimer(
    flow.holdExpiresAt,
    useCallback(() => {
      dispatch({
        type: 'HOLD_EXPIRED',
        message:
          'Tu apartado temporal de 3 minutos expiró. Elige de nuevo un horario disponible.',
      });
      void fetchAvailability();
    }, [fetchAvailability]),
  );

  const availableDateSet = useMemo(
    () => new Set(availabilityDays.filter((d) => d.hasSlots).map((d) => d.date)),
    [availabilityDays],
  );
  const selectedDaySummary = useMemo(
    () => availabilityDays.find((d) => d.date === selectedDate) ?? null,
    [availabilityDays, selectedDate],
  );

  const handleSelectSlot = async (slot: AvailableSlot) => {
    if (!selectedService) return;
    let nextHoldId: string | null = null;
    let nextHoldExpiresAt: number | null = null;

    if (settings.enableSlotHold) {
      try {
        const result = await requestSlotHold({
          serviceId: selectedService.id,
          extraServiceIds: selectedExtraServices.map((srv) => srv.id),
          addonIds: activeSelectedAddons.map((a) => a.id),
          staffId: slot.staffId,
          startAt: slot.startAt,
          sessionToken: getOrCreateBrowserSessionToken('nails_session_tok'),
        });
        if (!result.ok) {
          dispatch({
            type: 'SLOT_CONFLICT',
            message: result.error,
            suggestions: result.suggestedSlots,
          });
          void fetchAvailability();
          return;
        }
        nextHoldId = result.holdId;
        nextHoldExpiresAt = result.holdExpiresAt;
      } catch {
        nextHoldExpiresAt = null;
      }
    }

    const keySuffix =
      typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}-${slot.staffId}`;
    idempotencyKeyRef.current = `idem-${keySuffix}`;
    dispatch({
      type: 'SELECT_SLOT_HOLD_ACQUIRED',
      slot,
      holdId: nextHoldId,
      holdExpiresAt: nextHoldExpiresAt,
    });
  };

  const handleBackToSchedule = async () => {
    dispatch({ type: 'RESET_TO_SCHEDULE' });
    await fetch('/api/slot-holds', { method: 'DELETE' });
    void fetchAvailability();
  };

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) return;
    setCouponError(null);
    const result = await validateCouponCode(couponInput, subtotalCents);
    if (!result.valid) {
      setAppliedCoupon(null);
      setCouponError(result.error);
      return;
    }
    setAppliedCoupon(result.coupon);
  };

  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedService || !flow.selectedSlot) return;

    dispatch({ type: 'START_SUBMIT' });
    const showDeposit = hasConfiguredDeposit(settings, depositAmountCents);
    const effectiveProofMethod: ProofDeliveryMethod = !showDeposit
      ? 'none'
      : proofDeliveryMethod === 'instagram_dm'
        ? 'instagram_dm'
        : proofDataUrl
          ? 'web_upload'
          : 'none';

    try {
      const result = await submitBookingRequest(idempotencyKeyRef.current, {
        serviceId: selectedService.id,
        extraServiceIds: selectedExtraServices.map((srv) => srv.id),
        addonIds: activeSelectedAddons.map((a) => a.id),
        staffId: flow.selectedSlot.staffId,
        startAt: flow.selectedSlot.startAt,
        clientName,
        clientPhone,
        clientInstagram: clientInstagram.trim() || null,
        clientEmail: clientEmail || null,
        clientBirthday: clientBirthday || null,
        clientNotes,
        inspoPhotoUrl: inspoDataUrl,
        paymentProofUrl: effectiveProofMethod === 'web_upload' ? proofDataUrl : null,
        proofDeliveryMethod: effectiveProofMethod,
        couponCode: appliedCoupon?.code || null,
        holdId: flow.holdId ?? undefined,
        sessionToken: getOrCreateBrowserSessionToken('nails_session_tok'),
      });

      if (result.kind === 'conflict') {
        dispatch({
          type: 'SLOT_CONFLICT',
          message: result.error,
          suggestions: result.suggestedSlots,
        });
        void fetchAvailability();
        return;
      }
      if (result.kind === 'error') {
        dispatch({ type: 'SUBMIT_FAILED', error: result.error });
        return;
      }

      dispatch({ type: 'SUBMIT_CONFIRMED', manageUrl: result.manageUrl });
      router.push(result.manageUrl);
    } catch {
      dispatch({ type: 'SUBMIT_FAILED', error: 'Error de conexión. Intenta nuevamente.' });
    }
  };

  return (
    <PublicShell>
      <Section variant="transparent" paddingBlock={6} paddingInline={4}>
        <VStack gap={5} maxWidth={1220} width="100%" style={{ marginInline: 'auto' }}>
          <HStack justify="between" align="center" wrap="wrap" gap={3}>
            <VStack gap={0.5}>
              <HStack gap={2} align="center">
                <StatusDot variant="success" label="Sincronizado en tiempo real" isPulsing />
                <Text type="label" color="secondary">
                  {realtimePing.message || 'Disponibilidad sincronizada al segundo'}
                </Text>
              </HStack>
              <Heading level={1}>Reserva tu cita en {settings.name}</Heading>
            </VStack>

            {flow.step === 'details' ? (
              <Button
                label="Cambiar fecha u horario"
                variant="secondary"
                icon={<ArrowLeft size={16} />}
                onClick={handleBackToSchedule}
              />
            ) : null}
          </HStack>

          {flow.conflict ? (
            <Banner
              status="warning"
              title="Horario recién ocupado"
              description={flow.conflict.message}
              isDismissable
              onDismiss={() => dispatch({ type: 'DISMISS_CONFLICT' })}
            >
              {flow.conflict.suggestions.length > 0 ? (
                <VStack gap={2} paddingBlockStart={2}>
                  <Text type="label" weight="semibold">
                    Horarios disponibles más cercanos (clic para apartar al instante):
                  </Text>
                  <HStack gap={2} wrap="wrap">
                    {flow.conflict.suggestions.map((alt) => (
                      <Button
                        key={`${alt.staffId}-${alt.startAt}`}
                        variant="primary"
                        size="sm"
                        label={`${formatDateShortInTimezone(alt.startAt, settings.timezone)} · ${
                          timeFormat === '24h' ? alt.localTime24 : alt.localTime12
                        }`}
                        onClick={() => handleSelectSlot(alt)}
                      />
                    ))}
                  </HStack>
                </VStack>
              ) : null}
            </Banner>
          ) : null}

          {flow.step === 'schedule' ? (
            <VStack gap={5}>
              <ServiceStaffStep
                settings={settings}
                services={services}
                selectedService={selectedService}
                selectedExtraServiceIds={selectedExtraServiceIds}
                compatibleAddons={compatibleAddons}
                selectedAddonIds={selectedAddonIds}
                eligibleStaff={eligibleStaff}
                selectedStaffId={selectedStaffId}
                onSelectService={(serviceId) => {
                  setSelectedServiceId(serviceId);
                  setSelectedExtraServiceIds((prev) => prev.filter((id) => id !== serviceId));
                  dispatch({ type: 'SELECTION_CHANGED' });
                }}
                onToggleExtraService={(serviceId, checked) => {
                  setSelectedExtraServiceIds((prev) =>
                    checked
                      ? Array.from(new Set([...prev, serviceId])).slice(0, 8)
                      : prev.filter((id) => id !== serviceId),
                  );
                  dispatch({ type: 'SELECTION_CHANGED' });
                }}
                onToggleAddon={(addonId, checked) => {
                  setSelectedAddonIds((prev) =>
                    checked
                      ? Array.from(new Set([...prev, addonId]))
                      : prev.filter((id) => id !== addonId),
                  );
                  dispatch({ type: 'SELECTION_CHANGED' });
                }}
                onSelectStaff={setSelectedStaffId}
              />

              <ScheduleStep
                settings={settings}
                selectedService={selectedService}
                selectedExtraServices={selectedExtraServices}
                activeSelectedAddons={activeSelectedAddons}
                totalDurationMinutes={totalDurationMinutes}
                subtotalCents={subtotalCents}
                hasStartingPrice={hasStartingPrice}
                depositAmountCents={depositAmountCents}
                layoutView={layoutView}
                timeFormat={timeFormat}
                todayKey={initialTodayKey}
                selectedDate={selectedDate}
                availabilityDays={availabilityDays}
                availableDateSet={availableDateSet}
                selectedDaySummary={selectedDaySummary}
                selectedSlot={flow.selectedSlot}
                loadingAvail={loadingAvail}
                onChangeLayoutView={setLayoutView}
                onChangeTimeFormat={setTimeFormat}
                onSelectDate={setSelectedDate}
                onSelectSlot={handleSelectSlot}
                onOpenWaitlist={() => setWaitlistOpen(true)}
              />
            </VStack>
          ) : (
            <ClientConfirmStep
              settings={settings}
              selectedService={selectedService}
              selectedExtraServices={selectedExtraServices}
              activeSelectedAddons={activeSelectedAddons}
              selectedSlot={flow.selectedSlot}
              timeFormat={timeFormat}
              totalDurationMinutes={totalDurationMinutes}
              subtotalCents={subtotalCents}
              totalPriceCents={totalPriceCents}
              hasStartingPrice={hasStartingPrice}
              depositAmountCents={depositAmountCents}
              holdRemainingSec={holdRemainingSec}
              couponInput={couponInput}
              appliedCoupon={appliedCoupon}
              couponError={couponError}
              clientName={clientName}
              clientPhone={clientPhone}
              clientInstagram={clientInstagram}
              clientEmail={clientEmail}
              clientBirthday={clientBirthday}
              clientNotes={clientNotes}
              inspoFile={inspoFile}
              inspoDataUrl={inspoDataUrl}
              proofDeliveryMethod={proofDeliveryMethod}
              proofFile={proofFile}
              submitting={flow.phase === 'submitting'}
              formError={flow.formError}
              onChangeCouponInput={setCouponInput}
              onApplyCoupon={handleApplyCoupon}
              onChangeClientName={setClientName}
              onChangeClientPhone={setClientPhone}
              onChangeClientInstagram={setClientInstagram}
              onChangeClientEmail={setClientEmail}
              onChangeClientBirthday={setClientBirthday}
              onChangeClientNotes={setClientNotes}
              onChangeInspoFile={(file, dataUrl) => {
                setInspoFile(file);
                setInspoDataUrl(dataUrl);
              }}
              onChangeProofMethod={setProofDeliveryMethod}
              onChangeProofFile={(file, dataUrl) => {
                setProofFile(file);
                setProofDataUrl(dataUrl);
              }}
              onSubmit={handleConfirmBooking}
            />
          )}
        </VStack>
      </Section>

      <WaitlistDialog
        isOpen={waitlistOpen}
        serviceId={selectedService?.id}
        selectedStaffId={selectedStaffId}
        selectedDate={selectedDate}
        onOpenChange={setWaitlistOpen}
      />
    </PublicShell>
  );
}
