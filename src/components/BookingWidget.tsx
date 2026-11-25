'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Section } from '@astryxdesign/core/Section';
import { Card } from '@astryxdesign/core/Card';
import { SelectableCard } from '@astryxdesign/core/SelectableCard';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Token } from '@astryxdesign/core/Token';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Calendar, type ISODateString } from '@astryxdesign/core/Calendar';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { FileInput } from '@astryxdesign/core/FileInput';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Divider } from '@astryxdesign/core/Divider';
import { Avatar } from '@astryxdesign/core/Avatar';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { AspectRatio } from '@astryxdesign/core/AspectRatio';
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  Check,
  Clock,
  Columns3,
  Globe,
  Grid2x2,
  MapPin,
  ShieldAlert,
  Sparkles,
  Tag,
  Timer,
  Users,
} from 'lucide-react';
import type {
  BookingLayoutView,
  ServiceAddon,
} from '@/lib/types';
import type {
  PublicServiceDTO,
  PublicSettingsDTO,
  PublicStaffDTO,
} from '@/lib/public-dto';
import type { AvailableSlot, DayAvailabilitySummary } from '@/lib/availability/engine';
import {
  formatCurrency,
  formatDateLongInTimezone,
  formatDateShortInTimezone,
  formatDuration,
} from '@/lib/format';
import { PublicShell } from './PublicShell';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import { useRealtimeSubscription } from '@/lib/hooks/useRealtimeSubscription';
import { useCountdownTimer } from '@/lib/hooks/useCountdownTimer';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import { getOrCreateBrowserSessionToken } from '@/lib/hooks/useSessionToken';

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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
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

  const initialService =
    services.find((s) => s.slug === initialServiceSlug) ?? services[0] ?? null;
  const initialStaff =
    staff.find((st) => st.bookingSlug === initialStaffSlug)?.id ?? 'any';

  const [selectedServiceId, setSelectedServiceId] = useState<string>(
    initialService?.id ?? '',
  );
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>(
    staff.length === 1 && staff[0] ? staff[0].id : initialStaff,
  );

  const [layoutView, setLayoutView] = useState<BookingLayoutView>(
    settings.defaultBookingLayout || 'month',
  );
  const [timeFormat, setTimeFormat] = useState<'12h' | '24h'>('12h');

  const todayKey = initialTodayKey;
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);
  const [availabilityDays, setAvailabilityDays] = useState<DayAvailabilitySummary[]>([]);
  const [loadingAvail, setLoadingAvail] = useState<boolean>(true);
  const realtimePing = useEphemeralMessage(3500);

  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [holdId, setHoldId] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<number | null>(null);
  const [step, setStep] = useState<'schedule' | 'details'>('schedule');

  const [conflictBanner, setConflictBanner] = useState<{
    message: string;
    suggestions: AvailableSlot[];
  } | null>(null);

  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientBirthday, setClientBirthday] = useState('');
  const [clientNotes, setClientNotes] = useState(
    initialInspoNote ? `Referencia de galería: ${initialInspoNote}` : '',
  );
  const [inspoFile, setInspoFile] = useState<File | null>(null);
  const [inspoDataUrl, setInspoDataUrl] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofDataUrl, setProofDataUrl] = useState<string | null>(null);

  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    kind: string;
    discountCents: number;
  } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [waitlistName, setWaitlistName] = useState('');
  const [waitlistPhone, setWaitlistPhone] = useState('');
  const [waitlistWindow, setWaitlistWindow] = useState<'morning' | 'afternoon' | 'any'>('any');
  const [waitlistSent, setWaitlistSent] = useState(false);

  const idempotencyKeyRef = useRef<string>('');

  const selectedService = useMemo(
    () => services.find((s) => s.id === selectedServiceId) ?? services[0],
    [services, selectedServiceId],
  );

  const compatibleAddons = useMemo(() => {
    if (!selectedService) return [];
    return addons.filter(
      (a) => a.appliesToAll || a.serviceIds.includes(selectedService.id),
    );
  }, [addons, selectedService]);

  const activeSelectedAddons = useMemo(
    () => compatibleAddons.filter((a) => selectedAddonIds.includes(a.id)),
    [compatibleAddons, selectedAddonIds],
  );

  const eligibleStaff = useMemo(() => {
    if (!selectedService) return staff;
    return staff.filter(
      (st) => st.serviceIds.length === 0 || st.serviceIds.includes(selectedService.id),
    );
  }, [staff, selectedService]);

  const totalDurationMinutes = useMemo(() => {
    if (!selectedService) return 0;
    return (
      selectedService.durationMinutes +
      activeSelectedAddons.reduce((sum, a) => sum + a.extraMinutes, 0)
    );
  }, [selectedService, activeSelectedAddons]);

  const subtotalCents = useMemo(() => {
    if (!selectedService) return 0;
    return (
      selectedService.priceCents +
      activeSelectedAddons.reduce((sum, a) => sum + a.extraPriceCents, 0)
    );
  }, [selectedService, activeSelectedAddons]);

  const totalPriceCents = Math.max(
    0,
    subtotalCents - (appliedCoupon?.discountCents ?? 0),
  );

  const addonKey = activeSelectedAddons.map((a) => a.id).join(',');

  const fetchAvailability = useCallback(
    async (signal?: AbortSignal) => {
      if (!selectedService) return;
      try {
        const qs = new URLSearchParams({
          serviceId: selectedService.id,
          addonIds: addonKey,
          startDate: todayKey,
          days: '35',
        });
        if (selectedStaffId && selectedStaffId !== 'any') {
          qs.set('staffId', selectedStaffId);
        }
        const res = await fetch(`/api/availability?${qs.toString()}`, {
          cache: 'no-store',
          signal,
        });
        if (signal?.aborted) return;
        const json = (await res.json()) as { days?: DayAvailabilitySummary[] };
        if (Array.isArray(json.days)) {
          const days = json.days;
          setAvailabilityDays(days);
          setSelectedDate((currentDate) => {
            const currentDay = days.find((d) => d.date === currentDate);
            if (currentDay && currentDay.hasSlots) return currentDate;
            const firstOpen = days.find((d) => d.hasSlots);
            return firstOpen ? firstOpen.date : currentDate;
          });
        }
      } catch {
        return;
      } finally {
        if (!signal?.aborted) {
          setLoadingAvail(false);
        }
      }
    },
    [selectedService, addonKey, selectedStaffId, todayKey],
  );

  const availSyncKey = `${selectedService?.id ?? ''}:${addonKey}:${selectedStaffId}`;
  useExternalSync(availSyncKey, fetchAvailability);

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
    holdExpiresAt,
    useCallback(() => {
      setHoldId(null);
      setHoldExpiresAt(null);
      setConflictBanner({
        message:
          'Tu apartado temporal de 3 minutos expiró. Elige de nuevo un horario disponible.',
        suggestions: [],
      });
      setStep('schedule');
      void fetchAvailability();
    }, [fetchAvailability]),
  );

  const availableDateSet = useMemo(() => {
    return new Set(availabilityDays.filter((d) => d.hasSlots).map((d) => d.date));
  }, [availabilityDays]);

  const selectedDaySummary = useMemo(
    () => availabilityDays.find((d) => d.date === selectedDate) ?? null,
    [availabilityDays, selectedDate],
  );

  const groupedSlots = useMemo(() => {
    const list = selectedDaySummary?.slots ?? [];
    return {
      morning: list.filter((s) => s.period === 'morning'),
      afternoon: list.filter((s) => s.period === 'afternoon'),
      evening: list.filter((s) => s.period === 'evening'),
    };
  }, [selectedDaySummary]);

  const weekWindowDays = useMemo(() => {
    const idx = availabilityDays.findIndex((d) => d.date === selectedDate);
    const start = idx >= 0 ? idx : 0;
    return availabilityDays.slice(start, start + 6);
  }, [availabilityDays, selectedDate]);

  const handleToggleAddon = (addonId: string, checked: boolean) => {
    setSelectedAddonIds((prev) =>
      checked ? Array.from(new Set([...prev, addonId])) : prev.filter((id) => id !== addonId),
    );
    setSelectedSlot(null);
    setHoldId(null);
    setHoldExpiresAt(null);
  };

  const handleSelectSlot = async (slot: AvailableSlot) => {
    if (!selectedService) return;
    setConflictBanner(null);
    setFormError(null);

    let nextHoldId: string | null = null;
    if (settings.enableSlotHold) {
      try {
        const sessionToken = getOrCreateBrowserSessionToken('nails_session_tok');
        const res = await fetch('/api/slot-holds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serviceId: selectedService.id,
            addonIds: activeSelectedAddons.map((a) => a.id),
            staffId: slot.staffId,
            startAt: slot.startAt,
            sessionToken,
          }),
        });
        const data = await res.json();
        if (res.status === 409) {
          setHoldId(null);
          setHoldExpiresAt(null);
          setConflictBanner({
            message:
              data.error ||
              'Ese horario acaba de ser tomado por otra clienta. Elige uno de los horarios disponibles más cercanos:',
            suggestions: data.suggestedSlots || [],
          });
          void fetchAvailability();
          return;
        }
        const resolvedHoldId =
          typeof data.hold?.id === 'string'
            ? data.hold.id
            : typeof data.holdId === 'string'
              ? data.holdId
              : typeof data.hold?.holdId === 'string'
                ? data.hold.holdId
                : null;
        if (resolvedHoldId) {
          nextHoldId = resolvedHoldId;
        }
        if (data.hold?.expiresAt) {
          setHoldExpiresAt(new Date(data.hold.expiresAt).getTime());
        } else {
          setHoldExpiresAt(null);
        }
      } catch {
        setHoldExpiresAt(null);
      }
    } else {
      setHoldExpiresAt(null);
    }

    setHoldId(nextHoldId);
    setSelectedSlot(slot);
    const keySuffix =
      typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}-${slot.staffId}`;
    idempotencyKeyRef.current = `idem-${keySuffix}`;
    setStep('details');
  };

  const handleBackToSchedule = async () => {
    setStep('schedule');
    setHoldId(null);
    setHoldExpiresAt(null);
    await fetch('/api/slot-holds', {
      method: 'DELETE',
    });
    void fetchAvailability();
  };

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) return;
    setCouponError(null);
    const res = await fetch('/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: couponInput, subtotalCents }),
    });
    const data = await res.json();
    if (!res.ok || !data.valid) {
      setAppliedCoupon(null);
      setCouponError(data.error || 'Cupón no válido');
      return;
    }
    setAppliedCoupon({
      code: data.code,
      kind: data.kind,
      discountCents: data.discountCents,
    });
  };

  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedService || !selectedSlot) return;

    setFormError(null);
    setConflictBanner(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKeyRef.current,
        },
        body: JSON.stringify({
          serviceId: selectedService.id,
          addonIds: activeSelectedAddons.map((a) => a.id),
          staffId: selectedSlot.staffId,
          startAt: selectedSlot.startAt,
          clientName,
          clientPhone,
          clientEmail: clientEmail || null,
          clientBirthday: clientBirthday || null,
          clientNotes,
          inspoPhotoUrl: inspoDataUrl,
          paymentProofUrl: proofDataUrl,
          couponCode: appliedCoupon?.code || null,
          holdId: holdId ?? undefined,
          sessionToken: getOrCreateBrowserSessionToken('nails_session_tok'),
        }),
      });

      const data = await res.json();

      if (res.status === 409 && data.code === 'SLOT_TAKEN') {
        setConflictBanner({
          message:
            data.error ||
            '¡Ups! Otra clienta confirmó ese exacto horario segundos antes. Tus datos y foto siguen guardados — elige otro horario en 1 clic:',
          suggestions: data.suggestedSlots || [],
        });
        setHoldId(null);
        setHoldExpiresAt(null);
        void fetchAvailability();
        return;
      }

      if (!res.ok) {
        setFormError(data.error || 'No se pudo completar la cita. Revisa tus datos.');
        return;
      }

      router.push(data.manageUrl || `/cita/${data.booking.manageToken}`);
    } catch {
      setFormError('Error de conexión. Intenta nuevamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedService) return;
    const res = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serviceId: selectedService.id,
        preferredStaffId: selectedStaffId === 'any' ? null : selectedStaffId,
        desiredDate: selectedDate,
        preferredWindow: waitlistWindow,
        clientName: waitlistName,
        clientPhoneE164: waitlistPhone,
        notes: 'Solicitado desde agenda web',
      }),
    });
    if (res.ok) {
      setWaitlistSent(true);
    }
  };

  const renderSlotButton = (slot: AvailableSlot, compact = false) => {
    const label = timeFormat === '24h' ? slot.localTime24 : slot.localTime12;
    const isSelected =
      selectedSlot?.startAt === slot.startAt && selectedSlot?.staffId === slot.staffId;
    return (
      <Button
        key={`${slot.staffId}-${slot.startAt}`}
        label={label}
        variant={isSelected ? 'primary' : 'secondary'}
        size={compact ? 'sm' : 'md'}
        width="100%"
        icon={<StatusDot variant="success" label="Disponible" />}
        onClick={() => handleSelectSlot(slot)}
      />
    );
  };

  const maxDateKey = availabilityDays[availabilityDays.length - 1]?.date;

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

            {step === 'details' ? (
              <Button
                label="Cambiar fecha u horario"
                variant="secondary"
                icon={<ArrowLeft size={16} />}
                onClick={handleBackToSchedule}
              />
            ) : null}
          </HStack>

          {conflictBanner ? (
            <Banner
              status="warning"
              title="Horario recién ocupado"
              description={conflictBanner.message}
              isDismissable
              onDismiss={() => setConflictBanner(null)}
            >
              {conflictBanner.suggestions.length > 0 ? (
                <VStack gap={2} paddingBlockStart={2}>
                  <Text type="label" weight="semibold">
                    Horarios disponibles más cercanos (clic para apartar al instante):
                  </Text>
                  <HStack gap={2} wrap="wrap">
                    {conflictBanner.suggestions.map((alt) => (
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

          {step === 'schedule' ? (
            <VStack gap={5}>

              <Card padding={5}>
                <VStack gap={4}>
                  <VStack gap={1}>
                    <Text type="label" color="accent" weight="semibold">
                      1. ELIGE TU SERVICIO Y EXTRAS
                    </Text>
                    <Heading level={2}>Personaliza tu set</Heading>
                  </VStack>

                  <Grid columns={{ minWidth: 220, max: 3 }} gap={3}>
                    {services.map((srv) => (
                      <SelectableCard
                        key={srv.id}
                        label={srv.name}
                        isSelected={selectedService?.id === srv.id}
                        padding={3}
                        onChange={() => {
                          setSelectedServiceId(srv.id);
                          setSelectedSlot(null);
                          setHoldId(null);
                          setHoldExpiresAt(null);
                        }}
                      >
                        <VStack gap={1}>
                          <HStack justify="between" align="start" gap={2}>
                            <Text weight="semibold">{srv.name}</Text>
                            <Text weight="semibold" hasTabularNumbers>
                              {formatCurrency(srv.priceCents, settings.currency)}
                            </Text>
                          </HStack>
                          <Text type="supporting" color="secondary">
                            {formatDuration(srv.durationMinutes)}
                            {srv.depositRequired
                              ? ` · Anticipo ${formatCurrency(srv.depositAmountCents, settings.currency)}`
                              : ''}
                          </Text>
                        </VStack>
                      </SelectableCard>
                    ))}
                  </Grid>

                  {compatibleAddons.length > 0 ? (
                    <>
                      <Divider />
                      <VStack gap={2}>
                        <HStack justify="between" align="center" wrap="wrap" gap={2}>
                          <Text type="label" weight="semibold">
                            Extras opcionales (ajustan tiempo y total automáticamente)
                          </Text>
                          {activeSelectedAddons.length > 0 ? (
                            <Badge
                              variant="info"
                              label={`${activeSelectedAddons.length} seleccionados`}
                            />
                          ) : null}
                        </HStack>
                        <Grid columns={{ minWidth: 240, max: 3 }} gap={2}>
                          {compatibleAddons.map((addon) => (
                            <Card key={addon.id} variant="muted" padding={3}>
                              <CheckboxInput
                                label={`${addon.name} (+${addon.extraMinutes} min · +${formatCurrency(
                                  addon.extraPriceCents,
                                  settings.currency,
                                )})`}
                                description={addon.description}
                                value={selectedAddonIds.includes(addon.id)}
                                onChange={(checked) => handleToggleAddon(addon.id, checked)}
                              />
                            </Card>
                          ))}
                        </Grid>
                      </VStack>
                    </>
                  ) : null}

                  {eligibleStaff.length > 1 ? (
                    <>
                      <Divider />
                      <VStack gap={2}>
                        <HStack gap={1.5} align="center">
                          <Users size={16} aria-hidden="true" />
                          <Text type="label" weight="semibold">
                            Especialista
                          </Text>
                        </HStack>
                        <HStack gap={2} wrap="wrap">
                          <SelectableCard
                            label="Cualquier especialista disponible"
                            isSelected={selectedStaffId === 'any'}
                            padding={3}
                            onChange={() => setSelectedStaffId('any')}
                          >
                            <HStack gap={2} align="center">
                              <Sparkles size={16} aria-hidden="true" />
                              <VStack gap={0}>
                                <Text weight="medium">Sin preferencia</Text>
                                <Text type="supporting" color="secondary">
                                  Más horarios libres
                                </Text>
                              </VStack>
                            </HStack>
                          </SelectableCard>
                          {eligibleStaff.map((st) => (
                            <SelectableCard
                              key={st.id}
                              label={st.name}
                              isSelected={selectedStaffId === st.id}
                              padding={3}
                              onChange={() => setSelectedStaffId(st.id)}
                            >
                              <HStack gap={2} align="center">
                                <Avatar name={st.name} src={st.avatarUrl ?? undefined} size="sm" />
                                <VStack gap={0}>
                                  <Text weight="medium">{st.name}</Text>
                                  <Text type="supporting" color="secondary">
                                    {st.roleTitle}
                                  </Text>
                                </VStack>
                              </HStack>
                            </SelectableCard>
                          ))}
                        </HStack>
                      </VStack>
                    </>
                  ) : null}
                </VStack>
              </Card>

              <Card padding={5} elevation="low">
                <VStack gap={4}>
                  <HStack justify="between" align="center" wrap="wrap" gap={3}>
                    <VStack gap={0.5}>
                      <Text type="label" color="accent" weight="semibold">
                        2. ELIGE DÍA Y HORA DISPONIBLE
                      </Text>
                      <Heading level={2}>Agenda en vivo</Heading>
                    </VStack>

                    <HStack gap={2} wrap="wrap" align="center">
                      <SegmentedControl
                        label="Formato de hora"
                        size="sm"
                        value={timeFormat}
                        onChange={(v) => setTimeFormat(v as '12h' | '24h')}
                      >
                        <SegmentedControlItem value="12h" label="12h" />
                        <SegmentedControlItem value="24h" label="24h" />
                      </SegmentedControl>

                      <SegmentedControl
                        label="Vista de calendario"
                        size="sm"
                        value={layoutView}
                        onChange={(v) => setLayoutView(v as BookingLayoutView)}
                      >
                        <SegmentedControlItem
                          value="month"
                          label="Mes"
                          icon={<CalendarIcon size={14} />}
                        />
                        <SegmentedControlItem
                          value="week"
                          label="Semana"
                          icon={<Grid2x2 size={14} />}
                        />
                        <SegmentedControlItem
                          value="column"
                          label="Columnas"
                          icon={<Columns3 size={14} />}
                        />
                      </SegmentedControl>
                    </HStack>
                  </HStack>

                  <Divider />

                  {layoutView === 'month' ? (
                    <Grid columns={{ minWidth: 235, max: 3 }} gap={4} align="start">

                      <Card variant="muted" padding={4}>
                        <VStack gap={3}>
                          <VStack gap={0.5}>
                            <Text type="supporting" color="secondary">
                              {settings.name}
                            </Text>
                            <Heading level={3}>{selectedService?.name}</Heading>
                          </VStack>

                          <VStack gap={1.5}>
                            <HStack gap={2} align="center">
                              <Clock size={15} aria-hidden="true" />
                              <Text weight="medium">
                                {formatDuration(totalDurationMinutes)}
                              </Text>
                            </HStack>
                            <HStack gap={2} align="center">
                              <Tag size={15} aria-hidden="true" />
                              <Text weight="semibold" hasTabularNumbers>
                                {formatCurrency(subtotalCents, settings.currency)}
                              </Text>
                            </HStack>
                            <HStack gap={2} align="center">
                              <MapPin size={15} aria-hidden="true" />
                              <Text type="supporting" color="secondary">
                                {settings.address}
                              </Text>
                            </HStack>
                            <HStack gap={2} align="center">
                              <Globe size={15} aria-hidden="true" />
                              <Text type="supporting" color="secondary">
                                {settings.timezone}
                              </Text>
                            </HStack>
                          </VStack>

                          {activeSelectedAddons.length > 0 ? (
                            <>
                              <Divider />
                              <VStack gap={1}>
                                <Text type="label" weight="semibold">
                                  Extras incluidos
                                </Text>
                                {activeSelectedAddons.map((a) => (
                                  <HStack key={a.id} justify="between" gap={2}>
                                    <Text type="supporting">{a.name}</Text>
                                    <Text type="supporting" hasTabularNumbers>
                                      +{a.extraMinutes}m
                                    </Text>
                                  </HStack>
                                ))}
                              </VStack>
                            </>
                          ) : null}

                          {selectedService?.depositRequired ? (
                            <Banner
                              status="info"
                              title={`Anticipo requerido: ${formatCurrency(
                                selectedService.depositAmountCents,
                                settings.currency,
                              )}`}
                              description="Puedes enviar tu comprobante SPEI en el siguiente paso."
                            />
                          ) : null}
                        </VStack>
                      </Card>

                      <VStack gap={2} align="center">
                        <Calendar
                          mode="single"
                          value={selectedDate as ISODateString}
                          min={todayKey as ISODateString}
                          max={maxDateKey as ISODateString | undefined}
                          dateConstraints={[
                            (date) => {
                              const key = date.toISOString().slice(0, 10);
                              return availableDateSet.has(key);
                            },
                          ]}
                          onChange={(val) => {
                            if (typeof val === 'string') setSelectedDate(val);
                          }}
                        />
                        <Text type="supporting" color="secondary">
                          Los días habilitados muestran horarios libres reales.
                        </Text>
                      </VStack>

                      <VStack gap={3}>
                        <HStack justify="between" align="center">
                          <Heading level={3}>
                            {formatDateShortInTimezone(`${selectedDate}T18:00:00Z`, settings.timezone)}
                          </Heading>
                          {selectedDaySummary ? (
                            <Token
                              size="sm"
                              label={`${selectedDaySummary.slotCount} horarios`}
                            />
                          ) : null}
                        </HStack>

                        {loadingAvail ? (
                          <ProgressBar
                            label="Consultando disponibilidad real"
                            isIndeterminate
                          />
                        ) : selectedDaySummary && selectedDaySummary.slots.length > 0 ? (
                          <VStack gap={3} height={420} isScrollable>
                            {groupedSlots.morning.length > 0 ? (
                              <VStack gap={1.5}>
                                <Text type="label" color="secondary">
                                  Mañana
                                </Text>
                                <Grid columns={2} gap={2}>
                                  {groupedSlots.morning.map((s) => renderSlotButton(s))}
                                </Grid>
                              </VStack>
                            ) : null}

                            {groupedSlots.afternoon.length > 0 ? (
                              <VStack gap={1.5}>
                                <Text type="label" color="secondary">
                                  Tarde
                                </Text>
                                <Grid columns={2} gap={2}>
                                  {groupedSlots.afternoon.map((s) => renderSlotButton(s))}
                                </Grid>
                              </VStack>
                            ) : null}

                            {groupedSlots.evening.length > 0 ? (
                              <VStack gap={1.5}>
                                <Text type="label" color="secondary">
                                  Noche
                                </Text>
                                <Grid columns={2} gap={2}>
                                  {groupedSlots.evening.map((s) => renderSlotButton(s))}
                                </Grid>
                              </VStack>
                            ) : null}
                          </VStack>
                        ) : (
                          <EmptyState
                            isCompact
                            title="Sin lugares este día"
                            description="Prueba otra fecha o apúntate en lista de espera para avisarte si se libera un espacio."
                            actions={
                              <Button
                                label="Unirme a lista de espera"
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  setWaitlistSent(false);
                                  setWaitlistOpen(true);
                                }}
                              />
                            }
                          />
                        )}

                        <Divider />
                        <HStack justify="between" align="center">
                          <Text type="supporting" color="secondary">
                            ¿Buscas otra hora ese día?
                          </Text>
                          <Button
                            label="Lista de espera"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setWaitlistSent(false);
                              setWaitlistOpen(true);
                            }}
                          />
                        </HStack>
                      </VStack>
                    </Grid>
                  ) : (

                    <VStack gap={3}>
                      <HStack justify="between" align="center" wrap="wrap" gap={2}>
                        <Text type="supporting" color="secondary">
                          {layoutView === 'column'
                            ? 'Vista en columnas: compara horarios disponibles de varios días al instante.'
                            : 'Vista semanal: elige cualquier bloque libre de la semana.'}
                        </Text>
                        <HStack gap={2}>
                          <Button
                            label="Días anteriores"
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              const idx = availabilityDays.findIndex(
                                (d) => d.date === selectedDate,
                              );
                              if (idx > 0) {
                                const prevDay = availabilityDays[Math.max(0, idx - 5)];
                                if (prevDay) setSelectedDate(prevDay.date);
                              }
                            }}
                          />
                          <Button
                            label="Siguientes días"
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              const idx = availabilityDays.findIndex(
                                (d) => d.date === selectedDate,
                              );
                              const nextIdx = Math.min(
                                availabilityDays.length - 1,
                                Math.max(0, idx) + 5,
                              );
                              if (availabilityDays[nextIdx]) {
                                setSelectedDate(availabilityDays[nextIdx].date);
                              }
                            }}
                          />
                        </HStack>
                      </HStack>

                      <Grid columns={{ minWidth: 160, max: 6 }} gap={3}>
                        {weekWindowDays.map((day) => (
                          <Card key={day.date} variant="muted" padding={3}>
                            <VStack gap={2}>
                              <VStack gap={0}>
                                <Text weight="semibold">
                                  {formatDateShortInTimezone(
                                    `${day.date}T18:00:00Z`,
                                    settings.timezone,
                                  )}
                                </Text>
                                <Text type="supporting" color="secondary">
                                  {day.slotCount} libres
                                </Text>
                              </VStack>
                              <Divider />
                              {day.slots.length > 0 ? (
                                <VStack gap={1.5} height={340} isScrollable>
                                  {day.slots.map((slot) => renderSlotButton(slot, true))}
                                </VStack>
                              ) : (
                                <Text type="supporting" color="secondary">
                                  Sin disponibilidad
                                </Text>
                              )}
                            </VStack>
                          </Card>
                        ))}
                      </Grid>
                    </VStack>
                  )}
                </VStack>
              </Card>
            </VStack>
          ) : (

            <Grid columns={{ minWidth: 320, max: 2 }} gap={5} align="start">

              <Card variant="muted" padding={5}>
                <VStack gap={4}>
                  {holdRemainingSec > 0 ? (
                    <VStack gap={1.5}>
                      <HStack justify="between" align="center">
                        <HStack gap={1.5} align="center">
                          <Timer size={16} aria-hidden="true" />
                          <Text weight="semibold">Horario apartado para ti</Text>
                        </HStack>
                        <Badge
                          variant="info"
                          label={`${Math.floor(holdRemainingSec / 60)}:${String(
                            holdRemainingSec % 60,
                          ).padStart(2, '0')}`}
                        />
                      </HStack>
                      <ProgressBar
                        label="Tiempo restante de apartado"
                        value={holdRemainingSec}
                        max={(settings.slotHoldMinutes || 3) * 60}
                        variant="accent"
                      />
                      <Text type="supporting" color="secondary">
                        Nadie más puede tomar este espacio mientras completas tus datos.
                      </Text>
                    </VStack>
                  ) : null}

                  <Divider />

                  <VStack gap={2}>
                    <Heading level={3}>{selectedService?.name}</Heading>
                    {selectedSlot ? (
                      <VStack gap={1}>
                        <Text weight="medium">
                          {formatDateLongInTimezone(selectedSlot.startAt, settings.timezone)}
                        </Text>
                        <Text color="accent" weight="semibold">
                          {timeFormat === '24h'
                            ? selectedSlot.localTime24
                            : selectedSlot.localTime12}{' '}
                          · {formatDuration(totalDurationMinutes)}
                        </Text>
                        <Text type="supporting" color="secondary">
                          Especialista: {selectedSlot.staffName}
                        </Text>
                      </VStack>
                    ) : null}
                  </VStack>

                  {activeSelectedAddons.length > 0 ? (
                    <VStack gap={1}>
                      <Text type="label" weight="semibold">
                        Extras
                      </Text>
                      {activeSelectedAddons.map((a) => (
                        <HStack key={a.id} justify="between">
                          <Text type="supporting">{a.name}</Text>
                          <Text type="supporting" hasTabularNumbers>
                            +{formatCurrency(a.extraPriceCents, settings.currency)}
                          </Text>
                        </HStack>
                      ))}
                    </VStack>
                  ) : null}

                  <Divider />

                  <VStack gap={2}>
                    <HStack gap={2} align="end">
                      <TextInput
                        label="Cupón o Gift Card"
                        placeholder="Ej. BIENVENIDA10 o GIFT500"
                        value={couponInput}
                        onChange={setCouponInput}
                        isOptional
                      />
                      <Button
                        label="Aplicar"
                        variant="secondary"
                        onClick={handleApplyCoupon}
                      />
                    </HStack>
                    {couponError ? (
                      <Text type="supporting" color="secondary">
                        {couponError}
                      </Text>
                    ) : null}
                    {appliedCoupon ? (
                      <Banner
                        status="success"
                        title={`Código ${appliedCoupon.code} aplicado`}
                        description={`Descuento de ${formatCurrency(
                          appliedCoupon.discountCents,
                          settings.currency,
                        )}`}
                      />
                    ) : null}
                  </VStack>

                  <Divider />

                  <VStack gap={1}>
                    <HStack justify="between">
                      <Text color="secondary">Subtotal</Text>
                      <Text hasTabularNumbers>
                        {formatCurrency(subtotalCents, settings.currency)}
                      </Text>
                    </HStack>
                    {appliedCoupon ? (
                      <HStack justify="between">
                        <Text color="accent">Descuento ({appliedCoupon.code})</Text>
                        <Text color="accent" hasTabularNumbers>
                          -{formatCurrency(appliedCoupon.discountCents, settings.currency)}
                        </Text>
                      </HStack>
                    ) : null}
                    <HStack justify="between">
                      <Text weight="bold" size="lg">
                        Total estimado
                      </Text>
                      <Text weight="bold" size="lg" hasTabularNumbers>
                        {formatCurrency(totalPriceCents, settings.currency)}
                      </Text>
                    </HStack>
                  </VStack>

                  <Banner
                    status="info"
                    title="Política de cancelación"
                    description={settings.cancellationPolicyText}
                  />
                </VStack>
              </Card>

              <Card padding={5}>
                <form onSubmit={handleConfirmBooking}>
                  <VStack gap={4}>
                    <VStack gap={0.5}>
                      <Text type="label" color="accent" weight="semibold">
                        3. CONFIRMA TUS DATOS
                      </Text>
                      <Heading level={2}>Sin crear cuenta ni contraseña</Heading>
                      <Text type="supporting" color="secondary">
                        Te enviaremos tu confirmación, invitación de calendario y link personal para reagendar o cancelar.
                      </Text>
                    </VStack>

                    {formError ? (
                      <Banner
                        status="error"
                        title="No pudimos registrar la cita"
                        description={formError}
                        icon={<ShieldAlert size={18} />}
                      />
                    ) : null}

                    <TextInput
                      label="Nombre completo"
                      placeholder="Ej. Sofía Ramírez"
                      value={clientName}
                      onChange={setClientName}
                      isRequired
                    />

                    <Grid columns={{ minWidth: 200, max: 2 }} gap={3}>
                      <TextInput
                        label="WhatsApp (México +52)"
                        type="tel"
                        placeholder="55 1234 5678"
                        value={clientPhone}
                        onChange={setClientPhone}
                        isRequired
                      />
                      <TextInput
                        label="Correo electrónico"
                        type="email"
                        placeholder="tu@correo.com"
                        description="Para enviarte invitación .ics al calendario"
                        value={clientEmail}
                        onChange={setClientEmail}
                        isOptional
                      />
                    </Grid>

                    <TextInput
                      label="Fecha de cumpleaños (YYYY-MM-DD)"
                      placeholder="1997-08-15"
                      description="Para enviarte cortesías en tu mes"
                      value={clientBirthday}
                      onChange={setClientBirthday}
                      isOptional
                    />

                    <TextArea
                      label="Notas sobre tu diseño o alergias"
                      placeholder="Ej. Forma almendra corta, tono nude lechoso, traigo gel previo..."
                      value={clientNotes}
                      onChange={setClientNotes}
                      isOptional
                      rows={3}
                    />

                    {selectedService?.allowInspoPhoto ? (
                      <VStack gap={2}>
                        <FileInput
                          label="Foto de inspiración (inspo)"
                          description="Sube una imagen de referencia para que tu nail artist la tenga lista."
                          mode="dropzone"
                          accept="image/*"
                          maxSize={2_000_000}
                          isOptional
                          value={inspoFile}
                          onChange={async (f) => {
                            const file = Array.isArray(f) ? f[0] ?? null : f;
                            setInspoFile(file);
                            if (file) {
                              const url = await readFileAsDataUrl(file);
                              setInspoDataUrl(url);
                            } else {
                              setInspoDataUrl(null);
                            }
                          }}
                        />
                        {inspoDataUrl ? (
                          <AspectRatio ratio={16 / 9} fit="cover">
                            <img
                              src={inspoDataUrl}
                              alt="Vista previa de referencia"
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                borderRadius: 'var(--radius-inner)',
                              }}
                            />
                          </AspectRatio>
                        ) : null}
                      </VStack>
                    ) : null}

                    {selectedService?.depositRequired &&
                    settings.paymentMode === 'manual_transfer' ? (
                      <Card variant="muted" padding={4}>
                        <VStack gap={3}>
                          <Heading level={4}>
                            Anticipo por transferencia SPEI ({formatCurrency(
                              selectedService.depositAmountCents,
                              settings.currency,
                            )})
                          </Heading>
                          <Text type="supporting" color="secondary">
                            {settings.depositInstructions}
                          </Text>
                          <VStack gap={0.5}>
                            <Text type="supporting">
                              Banco: {settings.depositBankName} · Titular:{' '}
                              {settings.depositAccountHolder}
                            </Text>
                            <Text type="code" weight="semibold">
                              CLABE: {settings.depositClabe}
                            </Text>
                          </VStack>
                          <FileInput
                            label="Adjuntar comprobante de transferencia"
                            accept="image/*,.pdf"
                            maxSize={2_000_000}
                            isOptional
                            value={proofFile}
                            onChange={async (f) => {
                              const file = Array.isArray(f) ? f[0] ?? null : f;
                              setProofFile(file);
                              if (file) {
                                const url = await readFileAsDataUrl(file);
                                setProofDataUrl(url);
                              } else {
                                setProofDataUrl(null);
                              }
                            }}
                          />
                        </VStack>
                      </Card>
                    ) : null}

                    <Button
                      type="submit"
                      variant="primary"
                      size="lg"
                      width="100%"
                      isLoading={submitting}
                      icon={<Check size={18} />}
                      label={
                        selectedService?.requiresConfirmation ||
                        selectedService?.depositRequired
                          ? 'Solicitar y apartar horario'
                          : 'Confirmar mi cita ahora'
                      }
                    />
                  </VStack>
                </form>
              </Card>
            </Grid>
          )}
        </VStack>
      </Section>

      <Dialog isOpen={waitlistOpen} onOpenChange={setWaitlistOpen} width={460} padding={5}>
        <DialogHeader
          title="Lista de espera"
          subtitle={`Te avisaremos por WhatsApp si se libera un espacio el ${selectedDate}.`}
          onOpenChange={setWaitlistOpen}
        />
        {waitlistSent ? (
          <VStack gap={4} paddingBlockStart={4}>
            <Banner
              status="success"
              title="¡Te anotamos en la lista de espera!"
              description="En cuanto se libere un espacio compatible te escribiremos de inmediato."
            />
            <Button
              label="Cerrar"
              variant="primary"
              width="100%"
              onClick={() => setWaitlistOpen(false)}
            />
          </VStack>
        ) : (
          <form onSubmit={handleSubmitWaitlist}>
            <VStack gap={3} paddingBlockStart={4}>
              <TextInput
                label="Tu nombre"
                value={waitlistName}
                onChange={setWaitlistName}
                isRequired
              />
              <TextInput
                label="Tu WhatsApp"
                type="tel"
                placeholder="55 1234 5678"
                value={waitlistPhone}
                onChange={setWaitlistPhone}
                isRequired
              />
              <SegmentedControl
                label="Horario preferido"
                value={waitlistWindow}
                onChange={(v) =>
                  setWaitlistWindow(v as 'morning' | 'afternoon' | 'any')
                }
              >
                <SegmentedControlItem value="morning" label="Mañana" />
                <SegmentedControlItem value="afternoon" label="Tarde" />
                <SegmentedControlItem value="any" label="Cualquiera" />
              </SegmentedControl>
              <Button
                type="submit"
                label="Anotarme en lista de espera"
                variant="primary"
                width="100%"
              />
            </VStack>
          </form>
        )}
      </Dialog>
    </PublicShell>
  );
}
