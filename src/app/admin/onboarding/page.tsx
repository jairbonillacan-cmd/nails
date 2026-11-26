'use client';

import React, { useCallback, useState } from 'react';
import NextLink from 'next/link';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Switch } from '@astryxdesign/core/Switch';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { List, ListItem } from '@astryxdesign/core/List';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Building2,
  CalendarPlus,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Globe,
  Home,
  LayoutDashboard,
  MapPin,
  Scissors,
  Store,
  Users,
  Volume2,
  Wallet,
} from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import {
  AdminConfigChip,
  AdminConfigPageHeader,
  AdminConfigSection,
} from '@/components/admin/config/AdminConfigPrimitives';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import { useBookingAlertSound } from '@/lib/hooks/useBookingAlertSound';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import { formatCurrency, formatDuration } from '@/lib/format';
import type { Service } from '@/lib/types';

type ServiceMode = 'studio' | 'home' | 'online';

interface OnboardingApiPayload {
  onboarding: {
    businessType: string;
    teamSizeTier: string;
    salonName: string;
    serviceMode: ServiceMode;
    address: string;
    soundAlertsEnabled: boolean;
    onboardingCompleted: boolean;
  };
  starterServices: Service[];
}

const TEAM_SIZE_OPTIONS = [
  'Solo yo',
  'Somos 2',
  '3 a 5',
  '6 o más',
] as const;

const DURATION_PRESETS = [
  { minutes: 45, label: '45 min' },
  { minutes: 60, label: '1 h' },
  { minutes: 90, label: '1 h 30 min' },
  { minutes: 120, label: '2 h' },
  { minutes: 150, label: '2 h 30 min' },
] as const;

const WIZARD_STEPS = [
  { id: 'salon', label: 'Tu salón', short: '1. Tu salón' },
  { id: 'spei', label: 'Anticipo SPEI', short: '2. Anticipo SPEI' },
  { id: 'shifts', label: 'Tus turnos', short: '3. Tus turnos' },
  { id: 'ready', label: '¡Lista para compartir!', short: '4. ¡Lista!' },
] as const;

function parseServiceMode(value: string): ServiceMode {
  if (value === 'home' || value === 'online') return value;
  return 'studio';
}

export default function AdminOnboardingPage() {
  const { data, loading, refresh } = useAdminData();
  const { playBookingChime, requestBrowserNotifications, notificationPermission } =
    useBookingAlertSound();
  const feedback = useEphemeralMessage(4000);
  const copyFeedback = useEphemeralMessage(2500);

  const [stepIndex, setStepIndex] = useState(0);
  const [maxReachedStep, setMaxReachedStep] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notifDialogOpen, setNotifDialogOpen] = useState(false);

  const [businessType, setBusinessType] = useState('Salón de Manicure y Uñas');
  const [teamSizeTier, setTeamSizeTier] = useState('3 a 5');
  const [salonName, setSalonName] = useState('LAIKONA NAILS');
  const [serviceMode, setServiceMode] = useState<ServiceMode>('studio');
  const [address, setAddress] = useState('Puebla, México');
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState(true);

  const [depositEnabledDraft, setDepositEnabledDraft] = useState<boolean | null>(null);
  const [depositAmountDraft, setDepositAmountDraft] = useState<number | null>(null);
  const [depositBankDraft, setDepositBankDraft] = useState<string | null>(null);
  const [depositHolderDraft, setDepositHolderDraft] = useState<string | null>(null);
  const [depositClabeDraft, setDepositClabeDraft] = useState<string | null>(null);
  const [instagramDraft, setInstagramDraft] = useState<string | null>(null);

  const [starterServices, setStarterServices] = useState<Service[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [serviceName, setServiceName] = useState('Rubber');
  const [servicePriceMxn, setServicePriceMxn] = useState(350);
  const [serviceDurationMinutes, setServiceDurationMinutes] = useState(120);
  const [serviceIsStartingPrice, setServiceIsStartingPrice] = useState(true);

  const isOwner = data?.session.user.role === 'owner';

  const loadOnboarding = useCallback(
    async (signal: AbortSignal) => {
      if (!isOwner) {
        setHydrated(true);
        return;
      }
      try {
        const res = await fetch('/api/admin/onboarding', {
          cache: 'no-store',
          signal,
        });
        if (signal.aborted) return;
        if (res.ok) {
          const payload = (await res.json()) as OnboardingApiPayload;
          if (payload.onboarding.businessType) {
            setBusinessType(payload.onboarding.businessType);
          }
          if (payload.onboarding.teamSizeTier) {
            setTeamSizeTier(payload.onboarding.teamSizeTier);
          }
          if (payload.onboarding.salonName) {
            setSalonName(payload.onboarding.salonName);
          }
          setServiceMode(payload.onboarding.serviceMode);
          if (payload.onboarding.address) {
            setAddress(payload.onboarding.address);
          }
          setSoundAlertsEnabled(payload.onboarding.soundAlertsEnabled);
          setStarterServices(payload.starterServices);
          const firstService = payload.starterServices[0];
          if (firstService) {
            setSelectedServiceId(firstService.id);
            setServiceName(firstService.name);
            setServicePriceMxn(Math.round(firstService.priceCents / 100));
            setServiceDurationMinutes(firstService.durationMinutes);
            setServiceIsStartingPrice(firstService.isStartingPrice ?? true);
          }
        }
      } catch {
        return;
      } finally {
        if (!signal.aborted) {
          setHydrated(true);
        }
      }
    },
    [isOwner],
  );

  useExternalSync(
    isOwner ? 'admin-onboarding-owner' : 'admin-onboarding-skip',
    loadOnboarding,
  );

  if (loading || !data) {
    return (
      <VStack className="ad-page ad-wizard-shell" role="status" aria-label="Cargando guía inicial">
        <VStack gap={2} className="ad-page-head">
          <Text className="ad-skeleton" data-size="title" aria-hidden="true">
            {'\u200B'}
          </Text>
          <Text className="ad-skeleton" data-size="line" data-width="mid" aria-hidden="true">
            {'\u200B'}
          </Text>
        </VStack>
        <Text className="ad-skeleton" data-size="row" aria-hidden="true">
          {'\u200B'}
        </Text>
        <Text className="ad-skeleton" data-size="hero" aria-hidden="true">
          {'\u200B'}
        </Text>
      </VStack>
    );
  }

  if (!isOwner) {
    return (
      <VStack className="ad-page ad-wizard-shell">
        <Banner
          status="warning"
          title="Solo disponible para la Dueña"
          description="La guía inicial del salón solo puede ser editada desde la cuenta de Dueña."
          endContent={
            <Button label="Volver al inicio" variant="secondary" size="sm" href="/admin" />
          }
        />
      </VStack>
    );
  }

  const depositEnabled = depositEnabledDraft ?? data.settings.paymentMode !== 'none';
  const depositAmountMxn =
    depositAmountDraft ?? Math.round((data.settings.depositAmountCents ?? 20000) / 100);
  const depositBank = depositBankDraft ?? data.settings.depositBankName;
  const depositHolder =
    depositHolderDraft ?? (data.settings.depositBeneficiary ?? data.settings.depositAccountHolder);
  const depositClabe = depositClabeDraft ?? data.settings.depositClabe;
  const instagramHandle = instagramDraft ?? data.settings.instagramHandle;

  const persistOnboarding = async (payload: {
    businessType?: string;
    teamSizeTier?: string;
    salonName?: string;
    serviceMode?: ServiceMode;
    address?: string;
    soundAlertsEnabled?: boolean;
    onboardingCompleted?: boolean;
    starterService?: {
      id?: string;
      name: string;
      priceCents: number;
      durationMinutes: number;
      isStartingPrice?: boolean;
    };
  }): Promise<boolean> => {
    setSaving(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/admin/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setErrorMessage(body.error || 'No se pudo guardar este paso.');
        return false;
      }
      await refresh();
      return true;
    } catch {
      setErrorMessage('Error de conexión al guardar.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const persistSpeiStep = async (): Promise<boolean> => {
    setSaving(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/admin/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMode: depositEnabled ? 'manual_transfer' : 'none',
          depositAmountCents: Math.max(0, Math.round(depositAmountMxn * 100)),
          depositBankName: depositBank.trim(),
          depositBeneficiary: depositHolder.trim(),
          depositAccountHolder: depositHolder.trim(),
          depositClabe: depositClabe.trim(),
          instagramHandle: instagramHandle.trim(),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setErrorMessage(body.error || 'No se pudieron guardar los datos del anticipo.');
        return false;
      }
      await refresh();
      return true;
    } catch {
      setErrorMessage('Error de conexión al guardar el anticipo.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const advanceToStep = (nextStep: number) => {
    setStepIndex(nextStep);
    setMaxReachedStep((prev) => Math.max(prev, nextStep));
  };

  const handleBack = () => {
    setErrorMessage(null);
    setStepIndex((prev) => Math.max(0, prev - 1));
  };

  const handleStepSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (stepIndex === 0) {
      const trimmedName = salonName.trim();
      if (trimmedName.length < 2) {
        setErrorMessage('Escribe al menos 2 letras para el nombre de tu salón.');
        return;
      }
      const ok = await persistOnboarding({
        businessType,
        teamSizeTier,
        salonName: trimmedName,
        serviceMode,
        address: address.trim(),
      });
      if (ok) advanceToStep(1);
      return;
    }

    if (stepIndex === 1) {
      const ok = await persistSpeiStep();
      if (ok) advanceToStep(2);
      return;
    }

    if (stepIndex === 2) {
      const trimmedService = serviceName.trim();
      if (trimmedService.length < 2) {
        setErrorMessage('Escribe el nombre de tu servicio principal.');
        return;
      }
      const ok = await persistOnboarding({
        businessType,
        teamSizeTier,
        salonName: salonName.trim() || data.settings.name,
        serviceMode,
        address: address.trim(),
        soundAlertsEnabled,
        onboardingCompleted: true,
        starterService: {
          id: selectedServiceId ?? undefined,
          name: trimmedService,
          priceCents: Math.max(0, Math.round(servicePriceMxn * 100)),
          durationMinutes: serviceDurationMinutes,
          isStartingPrice: serviceIsStartingPrice,
        },
      });
      if (ok) {
        advanceToStep(3);
        setNotifDialogOpen(true);
      }
    }
  };

  const handleActivateNotifications = async () => {
    const permission = await requestBrowserNotifications();
    await playBookingChime();
    setSoundAlertsEnabled(true);
    await persistOnboarding({
      soundAlertsEnabled: true,
      onboardingCompleted: true,
    });
    setNotifDialogOpen(false);
    if (permission === 'granted') {
      feedback.show('Avisos y sonido de nuevas citas activados.');
    } else if (permission === 'denied') {
      feedback.show('Sonido activado. Puedes activar las notificaciones desde tu navegador.');
    } else {
      feedback.show('Sonido de nuevas citas activado.');
    }
  };

  const handleTestChime = async () => {
    const played = await playBookingChime();
    feedback.show(
      played
        ? 'Sonido de nueva cita reproducido.'
        : 'Tu navegador bloqueó el audio por ahora.',
    );
  };

  const handleCopyBookingLink = async () => {
    const base = (
      data.integration.appUrl.trim() ||
      (typeof window !== 'undefined' ? window.location.origin : '')
    ).replace(/\/+$/, '');
    const bookingUrl = `${base}/reservar`;
    try {
      await navigator.clipboard.writeText(bookingUrl);
      copyFeedback.show('Link de citas copiado');
    } catch {
      copyFeedback.show(`Comparte ${bookingUrl}`);
    }
  };

  const handleSelectStarterService = (srv: Service) => {
    setSelectedServiceId(srv.id);
    setServiceName(srv.name);
    setServicePriceMxn(Math.round(srv.priceCents / 100));
    setServiceDurationMinutes(srv.durationMinutes);
    setServiceIsStartingPrice(srv.isStartingPrice ?? false);
  };

  const displaySalonName = salonName.trim() || data.settings.name;
  const activeStepMeta = WIZARD_STEPS[stepIndex] ?? WIZARD_STEPS[0];

  const staffShiftSummaries = data.staff.filter((s) => s.isActive).map((st) => {
    const sched = data.schedules.find((sc) => sc.staffId === st.id);
    const fixedTimes = Array.from(
      new Set((sched?.rules ?? []).flatMap((r) => r.fixedStartTimes ?? [])),
    ).toSorted();
    return {
      id: st.id,
      name: st.name,
      summary: fixedTimes.length > 0 ? fixedTimes.join(' · ') : 'Horario abierto',
    };
  });

  return (
    <VStack className="ad-page ad-wizard-shell">
      <AdminConfigPageHeader
        eyebrow={`En 2 minutos · Paso ${stepIndex + 1} de ${WIZARD_STEPS.length}`}
        title="Guía inicial"
        subtitle="Cuatro pasos cortitos para dejar listo tu salón y empezar a compartir tu link."
        actions={
          <Button
            label="Ir al inicio"
            variant="ghost"
            size="sm"
            href="/admin"
            icon={<LayoutDashboard size={15} aria-hidden="true" />}
          />
        }
      />

      <AdminConfigSection padded>
        <VStack gap={3}>
          <HStack justify="between" align="center" gap={2} wrap="wrap">
            <Text weight="semibold" size="sm">
              {activeStepMeta.label}
            </Text>
            <Text type="supporting" color="secondary" className="fx-tabular" hasTabularNumbers>
              Paso {stepIndex + 1} de {WIZARD_STEPS.length}
            </Text>
          </HStack>

          <ProgressBar
            label="Avance de guía inicial"
            isLabelHidden
            value={stepIndex + 1}
            max={WIZARD_STEPS.length}
            variant={stepIndex === 3 ? 'success' : 'accent'}
          />

          <HStack as="nav" aria-label="Pasos de la guía inicial" gap={1.5} wrap="wrap">
            {WIZARD_STEPS.map((step, idx) => {
              const isCurrent = idx === stepIndex;
              const isCompleted = idx < stepIndex || stepIndex === 3;
              const canJump = idx <= maxReachedStep;

              return (
                <button
                  key={step.id}
                  type="button"
                  className="ad-pill fx-press"
                  data-on={isCurrent ? 'true' : 'false'}
                  aria-current={isCurrent ? 'step' : undefined}
                  aria-disabled={!canJump}
                  onClick={() => {
                    if (canJump) {
                      setErrorMessage(null);
                      setStepIndex(idx);
                    }
                  }}
                >
                  {isCompleted && !isCurrent ? (
                    <Check size={13} aria-hidden="true" className="fx-pop" />
                  ) : null}
                  <Text color="inherit" size="sm" weight="semibold">
                    {step.short}
                  </Text>
                </button>
              );
            })}
          </HStack>
        </VStack>
      </AdminConfigSection>

      {errorMessage ? (
        <Banner
          status="error"
          role="alert"
          title={errorMessage}
          isDismissable
          onDismiss={() => setErrorMessage(null)}
        />
      ) : null}

      {feedback.message ? (
        <Banner status="success" role="status" title={feedback.message} />
      ) : null}

      {!hydrated ? (
        <AdminConfigSection padded>
          <VStack gap={3} role="status" aria-label="Cargando datos del salón">
            <Text className="ad-skeleton" data-size="title" aria-hidden="true">
              {'\u200B'}
            </Text>
            <Text className="ad-skeleton" data-size="line" data-width="long" aria-hidden="true">
              {'\u200B'}
            </Text>
            <Text className="ad-skeleton" data-size="card" aria-hidden="true">
              {'\u200B'}
            </Text>
          </VStack>
        </AdminConfigSection>
      ) : stepIndex < 3 ? (
        <form onSubmit={handleStepSubmit}>
          <AdminConfigSection padded>
            <VStack key={`wizard-step-${stepIndex}`} gap={5} className="fx-step-in">
              {stepIndex === 0 ? (
                <VStack gap={4}>
                  <VStack gap={1}>
                    <Heading level={2} className="lk-serif ad-h2">
                      1. Cuéntanos de tu salón
                    </Heading>
                    <Text color="secondary">
                      Estos datos aparecen en tu página de reservas para que tus clientas te reconozcan al instante.
                    </Text>
                  </VStack>

                  <TextInput
                    label="Nombre de tu salón"
                    value={salonName}
                    onChange={setSalonName}
                    isRequired
                    autoComplete="organization"
                    placeholder="LAIKONA NAILS"
                    startIcon={<Building2 size={16} aria-hidden="true" />}
                  />

                  <VStack gap={2}>
                    <HStack gap={1.5} align="center">
                      <Users size={15} aria-hidden="true" />
                      <Text type="label" weight="semibold">
                        ¿Cuántas personas atienden?
                      </Text>
                    </HStack>
                    <HStack gap={1.5} wrap="wrap" role="group" aria-label="Tamaño del equipo">
                      {TEAM_SIZE_OPTIONS.map((tier) => {
                        const isSelected = teamSizeTier === tier;
                        return (
                          <button
                            key={tier}
                            type="button"
                            className="ad-pill fx-press"
                            data-on={isSelected ? 'true' : 'false'}
                            aria-pressed={isSelected}
                            onClick={() => setTeamSizeTier(tier)}
                          >
                            {tier}
                          </button>
                        );
                      })}
                    </HStack>
                  </VStack>

                  <VStack gap={1.5}>
                    <Text type="label" weight="semibold">
                      ¿Dónde atiendes?
                    </Text>
                    <SegmentedControl
                      label="Dónde atiendes"
                      layout="fill"
                      value={serviceMode}
                      onChange={(val) => setServiceMode(parseServiceMode(val))}
                    >
                      <SegmentedControlItem
                        value="studio"
                        label="En mi estudio"
                        icon={<Store size={15} aria-hidden="true" />}
                      />
                      <SegmentedControlItem
                        value="home"
                        label="A domicilio"
                        icon={<Home size={15} aria-hidden="true" />}
                      />
                      <SegmentedControlItem
                        value="online"
                        label="En línea"
                        icon={<Globe size={15} aria-hidden="true" />}
                      />
                    </SegmentedControl>
                  </VStack>

                  <TextInput
                    label={
                      serviceMode === 'online'
                        ? 'Ciudad o referencia'
                        : 'Dirección o colonia y ciudad'
                    }
                    description="Puedes poner solo tu colonia y compartir la dirección exacta al confirmar."
                    value={address}
                    onChange={setAddress}
                    autoComplete="street-address"
                    placeholder="Calle 25 Sur 1904, Col. Volcanes, Puebla"
                    startIcon={<MapPin size={16} aria-hidden="true" />}
                  />
                </VStack>
              ) : null}

              {stepIndex === 1 ? (
                <VStack gap={4}>
                  <VStack gap={1}>
                    <Heading level={2} className="lk-serif ad-h2">
                      2. Configura tu anticipo SPEI
                    </Heading>
                    <Text color="secondary">
                      Así evitas cancelaciones de último minuto y tus clientas copian tu CLABE en un toque.
                    </Text>
                  </VStack>

                  <Switch
                    label="Pedir anticipo para apartar cita"
                    description="Las clientas suben su comprobante o te lo mandan por Instagram."
                    value={depositEnabled}
                    onChange={setDepositEnabledDraft}
                  />

                  {depositEnabled ? (
                    <VStack gap={3}>
                      <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
                        <NumberInput
                          label="Monto de anticipo (MXN)"
                          value={depositAmountMxn}
                          min={0}
                          step={50}
                          isIntegerOnly
                          onChange={setDepositAmountDraft}
                        />
                        <TextInput
                          label="Banco"
                          placeholder="Mercado Pago"
                          value={depositBank}
                          onChange={setDepositBankDraft}
                        />
                      </Grid>
                      <TextInput
                        label="Titular de la cuenta"
                        placeholder="Karla Patricia Carrillo Rodríguez"
                        value={depositHolder}
                        onChange={setDepositHolderDraft}
                      />
                      <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
                        <TextInput
                          label="Cuenta CLABE"
                          placeholder="7229 6901 3959 779869"
                          value={depositClabe}
                          onChange={setDepositClabeDraft}
                        />
                        <TextInput
                          label="Instagram para comprobantes"
                          placeholder="@laikona.nailsss"
                          value={instagramHandle}
                          onChange={setInstagramDraft}
                        />
                      </Grid>
                    </VStack>
                  ) : (
                    <VStack className="ad-subpanel" gap={1}>
                      <HStack gap={2} align="center">
                        <Wallet size={16} aria-hidden="true" />
                        <Text weight="semibold" size="sm">
                          Sin anticipo por ahora
                        </Text>
                      </HStack>
                      <Text type="supporting" color="secondary">
                        Puedes activarlo después cuando quieras desde Mi página.
                      </Text>
                    </VStack>
                  )}
                </VStack>
              ) : null}

              {stepIndex === 2 ? (
                <VStack gap={4}>
                  <VStack gap={1}>
                    <Heading level={2} className="lk-serif ad-h2">
                      3. Revisa tus turnos y tu servicio estrella
                    </Heading>
                    <Text color="secondary">
                      Confirma el servicio que más te piden y revisa los turnos fijos de tu equipo.
                    </Text>
                  </VStack>

                  {staffShiftSummaries.length > 0 ? (
                    <VStack className="ad-subpanel" gap={2}>
                      <HStack justify="between" align="center" wrap="wrap" gap={2}>
                        <HStack gap={1.5} align="center">
                          <Clock size={15} aria-hidden="true" />
                          <Text weight="semibold" size="sm">
                            Turnos activos del salón
                          </Text>
                        </HStack>
                        <NextLink href="/admin/disponibilidad" className="ad-inline-link">
                          Cambiar turnos →
                        </NextLink>
                      </HStack>
                      <VStack gap={1}>
                        {staffShiftSummaries.map((st) => (
                          <HStack key={st.id} justify="between" align="center" gap={2} wrap="wrap">
                            <Text size="sm" weight="medium">
                              {st.name}
                            </Text>
                            <Text type="supporting" color="secondary" hasTabularNumbers>
                              {st.summary}
                            </Text>
                          </HStack>
                        ))}
                      </VStack>
                    </VStack>
                  ) : null}

                  {starterServices.length > 1 ? (
                    <VStack gap={1.5}>
                      <Text type="label" color="secondary">
                        Elige tu servicio estrella para revisar su precio:
                      </Text>
                      <HStack gap={1.5} wrap="wrap">
                        {starterServices.map((srv) => {
                          const isSelected = selectedServiceId === srv.id;
                          return (
                            <button
                              key={srv.id}
                              type="button"
                              className="ad-pill fx-press"
                              data-on={isSelected ? 'true' : 'false'}
                              aria-pressed={isSelected}
                              onClick={() => handleSelectStarterService(srv)}
                            >
                              {srv.name}
                            </button>
                          );
                        })}
                      </HStack>
                    </VStack>
                  ) : null}

                  <Grid columns={{ minWidth: 200, max: 2 }} gap={4}>
                    <TextInput
                      label="Servicio estrella"
                      value={serviceName}
                      onChange={setServiceName}
                      isRequired
                      placeholder="Ej. Rubber"
                      startIcon={<Scissors size={16} aria-hidden="true" />}
                    />
                    <NumberInput
                      label="Precio (MXN)"
                      value={servicePriceMxn}
                      onChange={setServicePriceMxn}
                      min={0}
                      max={100000}
                      step={10}
                      units="MXN"
                      isIntegerOnly
                    />
                  </Grid>

                  <Switch
                    label='Precio "Desde"'
                    description='Muestra "Desde $..." si el total cambia según el largo o diseño.'
                    value={serviceIsStartingPrice}
                    onChange={setServiceIsStartingPrice}
                  />

                  <VStack gap={2}>
                    <Text type="label" weight="semibold">
                      Duración ({formatDuration(serviceDurationMinutes)})
                    </Text>
                    <HStack gap={1.5} wrap="wrap" role="group" aria-label="Duración">
                      {DURATION_PRESETS.map((preset) => {
                        const isSelected = serviceDurationMinutes === preset.minutes;
                        return (
                          <button
                            key={preset.minutes}
                            type="button"
                            className="ad-pill fx-press"
                            data-on={isSelected ? 'true' : 'false'}
                            aria-pressed={isSelected}
                            onClick={() => setServiceDurationMinutes(preset.minutes)}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </HStack>
                  </VStack>
                </VStack>
              ) : null}

              <Divider />

              <HStack justify="between" align="center" wrap="wrap" gap={3}>
                <Button
                  type="button"
                  label="Atrás"
                  variant="secondary"
                  icon={<ArrowLeft size={16} aria-hidden="true" />}
                  isDisabled={stepIndex === 0 || saving}
                  onClick={handleBack}
                />
                <Button
                  type="submit"
                  label={stepIndex === 2 ? 'Terminar y dejar listo' : 'Siguiente'}
                  variant="primary"
                  isLoading={saving}
                  endContent={<ArrowRight size={16} aria-hidden="true" />}
                />
              </HStack>
            </VStack>
          </AdminConfigSection>
        </form>
      ) : (
        <AdminConfigSection padded>
          <VStack key="wizard-step-live" gap={5} className="fx-step-in">
            <VStack gap={2}>
              <HStack gap={2} align="center">
                <StatusDot variant="success" label="Lista para compartir" isPulsing />
                <AdminConfigChip tone="success" label="¡Todo listo!" className="fx-pop" />
              </HStack>
              <Heading level={2} className="lk-serif ad-h2">
                ¡{displaySalonName} está lista para recibir citas!
              </Heading>
              <Text color="secondary">
                Ya puedes pegar tu link en Instagram, enviarlo por WhatsApp o imprimir tu QR para el mostrador.
              </Text>
            </VStack>

            <HStack
              className="ad-subpanel"
              justify="between"
              align="center"
              wrap="wrap"
              gap={3}
            >
              <VStack gap={0.5} className="rb-grow">
                <Text weight="semibold" size="sm">
                  Tu link de citas
                </Text>
                <Text type="supporting" color="secondary">
                  Compártelo en tu biografía de Instagram o por WhatsApp.
                </Text>
              </VStack>
              <HStack gap={2} wrap="wrap">
                <Button
                  type="button"
                  label={copyFeedback.message ? 'Link copiado' : 'Copiar link'}
                  variant="primary"
                  size="sm"
                  icon={
                    copyFeedback.message ? (
                      <Check size={14} aria-hidden="true" className="fx-pop" />
                    ) : (
                      <Copy size={14} aria-hidden="true" />
                    )
                  }
                  onClick={() => void handleCopyBookingLink()}
                />
                <Button
                  label="Abrir mi agenda"
                  variant="secondary"
                  size="sm"
                  href="/reservar"
                />
              </HStack>
            </HStack>

            <VStack as="ul" className="ad-surface ad-row-list" gap={0}>
              <li className="ad-row-item">
                <HStack gap={2} align="center" className="rb-grow">
                  <CheckCircle2 size={18} aria-hidden="true" />
                  <VStack gap={0.5} className="rb-grow">
                    <Text weight="semibold" size="sm">
                      Salón configurado
                    </Text>
                    <Text type="supporting" color="secondary">
                      {displaySalonName} · {address || 'Puebla, México'}
                    </Text>
                  </VStack>
                </HStack>
                <AdminConfigChip tone="success" label="Listo" />
              </li>

              <li className="ad-row-item">
                <HStack gap={2} align="center" className="rb-grow">
                  <CheckCircle2 size={18} aria-hidden="true" />
                  <VStack gap={0.5} className="rb-grow">
                    <Text weight="semibold" size="sm">
                      Anticipo SPEI
                    </Text>
                    <Text type="supporting" color="secondary" hasTabularNumbers>
                      {depositEnabled
                        ? `${formatCurrency(
                            Math.round(depositAmountMxn * 100),
                            data.settings.currency,
                          )} · ${depositBank || 'Transferencia'}`
                        : 'Sin anticipo obligatorio'}
                    </Text>
                  </VStack>
                </HStack>
                <AdminConfigChip tone="success" label="Listo" />
              </li>

              <li className="ad-row-item">
                <HStack gap={2} align="center" className="rb-grow">
                  <CheckCircle2 size={18} aria-hidden="true" />
                  <VStack gap={0.5} className="rb-grow">
                    <Text weight="semibold" size="sm">
                      Turnos y servicio estrella
                    </Text>
                    <Text type="supporting" color="secondary">
                      {serviceName.trim() || 'Rubber'} · {formatDuration(serviceDurationMinutes)}
                    </Text>
                  </VStack>
                </HStack>
                <AdminConfigChip tone="success" label="Listo" />
              </li>
            </VStack>

            <HStack
              className="ad-subpanel"
              justify="between"
              align="center"
              wrap="wrap"
              gap={3}
            >
              <HStack gap={2} align="center" className="rb-grow">
                <Bell size={18} aria-hidden="true" />
                <VStack gap={0.5} className="rb-grow">
                  <Text weight="semibold" size="sm">
                    Sonido de nuevas citas
                  </Text>
                  <Text type="supporting" color="secondary">
                    {soundAlertsEnabled
                      ? 'Te avisará con un sonido suave cuando llegue una reserva.'
                      : 'Sonido en silencio por ahora.'}{' '}
                    Notificaciones:{' '}
                    {notificationPermission === 'granted'
                      ? 'activas'
                      : notificationPermission === 'denied'
                        ? 'bloqueadas'
                        : 'pendientes'}
                    .
                  </Text>
                </VStack>
              </HStack>
              <HStack gap={2} wrap="wrap">
                <Button
                  type="button"
                  label="Probar sonido"
                  variant="secondary"
                  size="sm"
                  icon={<Volume2 size={15} aria-hidden="true" />}
                  onClick={() => void handleTestChime()}
                />
                <Button
                  type="button"
                  label="Activar avisos"
                  variant="secondary"
                  size="sm"
                  icon={<Bell size={15} aria-hidden="true" />}
                  onClick={() => setNotifDialogOpen(true)}
                />
              </HStack>
            </HStack>

            <Divider />

            <HStack justify="between" align="center" wrap="wrap" gap={3}>
              <Button
                type="button"
                label="Editar pasos anteriores"
                variant="ghost"
                icon={<ArrowLeft size={15} aria-hidden="true" />}
                onClick={() => setStepIndex(2)}
              />
              <HStack gap={2} wrap="wrap">
                <Button
                  label="Ir al inicio"
                  variant="secondary"
                  href="/admin"
                  icon={<LayoutDashboard size={16} aria-hidden="true" />}
                />
                <Button
                  label="Agendar primera cita"
                  variant="primary"
                  href="/admin/citas?new=1"
                  icon={<CalendarPlus size={16} aria-hidden="true" />}
                />
              </HStack>
            </HStack>
          </VStack>
        </AdminConfigSection>
      )}

      <Dialog
        isOpen={notifDialogOpen}
        onOpenChange={setNotifDialogOpen}
        width={480}
        padding={5}
        purpose="info"
      >
        <VStack gap={4}>
          <DialogHeader
            title="Entérate al instante cuando agenden"
            subtitle="Recibe avisos suaves mientras trabajas en mesa"
            onOpenChange={setNotifDialogOpen}
          />
          <List hasDividers>
            <ListItem
              label="Nuevas citas y cambios"
              description={
                <Text type="supporting" color="secondary">
                  Aviso inmediato cuando una clienta reserva, cambia de hora o cancela.
                </Text>
              }
              startContent={<CalendarPlus size={17} aria-hidden="true" />}
            />
            <ListItem
              label="Anticipos listos para revisar"
              description={
                <Text type="supporting" color="secondary">
                  Ve al instante cuando una clienta sube su comprobante SPEI.
                </Text>
              }
              startContent={<Bell size={17} aria-hidden="true" />}
            />
            <ListItem
              label="Timbre suave de nueva cita"
              description={
                <Text type="supporting" color="secondary">
                  Puedes silenciarlo cuando quieras desde el menú del salón.
                </Text>
              }
              startContent={<Volume2 size={17} aria-hidden="true" />}
            />
          </List>
          <HStack justify="end" gap={2} wrap="wrap">
            <Button
              type="button"
              label="Ahora no"
              variant="secondary"
              onClick={() => setNotifDialogOpen(false)}
            />
            <Button
              type="button"
              label="Activar avisos"
              variant="primary"
              icon={<Bell size={15} aria-hidden="true" />}
              isLoading={saving}
              onClick={() => void handleActivateNotifications()}
            />
          </HStack>
        </VStack>
      </Dialog>
    </VStack>
  );
}
