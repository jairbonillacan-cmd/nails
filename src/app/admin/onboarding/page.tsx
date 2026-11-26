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
import { SelectableCard } from '@astryxdesign/core/SelectableCard';
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

const BUSINESS_TYPE_OPTIONS = [
  {
    value: 'Salón de Manicure y Uñas',
    description: 'Acrílico, Softgel, Rubber, gel semipermanente y PediSpa',
  },
  {
    value: 'Salón de Belleza',
    description: 'Servicios integrales de uñas, cabello y cuidado personal',
  },
  {
    value: 'Centro de Estética',
    description: 'Tratamientos faciales, pestañas, cejas y cabina estética',
  },
  {
    value: 'Spa',
    description: 'Rituales de bienestar, masajes, manicura y pedicura spa',
  },
  {
    value: 'Peluquería',
    description: 'Corte, colorimetría, peinado y tratamientos capilares',
  },
  {
    value: 'Barbería',
    description: 'Corte clásico, barba, perfilado y cuidado masculino',
  },
] as const;

const TEAM_SIZE_OPTIONS = [
  'Solo yo',
  'Somos 2',
  '3 a 5',
  '6 a 15',
  '16 o más',
] as const;

const DURATION_PRESETS = [
  { minutes: 30, label: '30 min' },
  { minutes: 45, label: '45 min' },
  { minutes: 60, label: '1 h' },
  { minutes: 90, label: '1 h 30 min' },
  { minutes: 120, label: '2 h' },
  { minutes: 150, label: '2 h 30 min' },
  { minutes: 180, label: '3 h' },
] as const;

const WIZARD_STEPS = [
  { id: 'studio', label: 'Tu estudio', short: '1. Tu estudio' },
  { id: 'location', label: 'Ubicación', short: '2. Ubicación' },
  { id: 'service', label: 'Servicio estrella', short: '3. Servicio' },
  { id: 'live', label: 'En vivo', short: '4. En vivo' },
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
      <VStack className="ad-page ad-wizard-shell" role="status" aria-label="Cargando asistente">
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
          title="Acceso exclusivo de Dueña (Owner)"
          description="El asistente de configuración inicial del estudio solo puede ser editado por la cuenta de Dueña."
          endContent={
            <Button label="Volver al inicio" variant="secondary" size="sm" href="/admin" />
          }
        />
      </VStack>
    );
  }

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
      setErrorMessage('Error de conexión al guardar la configuración.');
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
        setErrorMessage('Ingresa al menos 2 caracteres para el nombre de tu negocio.');
        return;
      }
      const ok = await persistOnboarding({
        businessType,
        teamSizeTier,
        salonName: trimmedName,
      });
      if (ok) advanceToStep(1);
      return;
    }

    if (stepIndex === 1) {
      const ok = await persistOnboarding({
        serviceMode,
        address: address.trim(),
      });
      if (ok) advanceToStep(2);
      return;
    }

    if (stepIndex === 2) {
      const trimmedService = serviceName.trim();
      if (trimmedService.length < 2) {
        setErrorMessage('Escribe el nombre de tu servicio principal (mínimo 2 caracteres).');
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
      feedback.show('¡Notificaciones del navegador y sonido de agenda activados!');
    } else if (permission === 'denied') {
      feedback.show(
        'Sonido de agenda activado. Puedes habilitar avisos del navegador en los permisos del sitio.',
      );
    } else {
      feedback.show('Sonido especial de nuevas citas activado.');
    }
  };

  const handleTestChime = async () => {
    const played = await playBookingChime();
    feedback.show(
      played
        ? 'Sonido especial de nueva cita reproducido.'
        : 'Tu navegador no permitió reproducir audio en este momento.',
    );
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

  return (
    <VStack className="ad-page ad-wizard-shell">
      <AdminConfigPageHeader
        eyebrow={`Configuración inicial · Paso ${stepIndex + 1} de ${WIZARD_STEPS.length}`}
        title="Configura tu estudio en minutos"
        subtitle="Cuatro pasos breves para dejar lista tu identidad, ubicación, servicio estrella y página de reservas."
        actions={
          <Button
            label="Salir al panel"
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
            label="Avance de configuración inicial"
            isLabelHidden
            value={stepIndex + 1}
            max={WIZARD_STEPS.length}
            variant={stepIndex === 3 ? 'success' : 'accent'}
          />

          <HStack
            as="nav"
            aria-label="Pasos de configuración inicial"
            gap={1.5}
            wrap="wrap"
          >
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
          <VStack gap={3} role="status" aria-label="Cargando configuración actual">
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
                      Cuéntanos sobre tu estudio
                    </Heading>
                    <Text color="secondary">
                      Define el nombre que verán tus clientas, el giro principal y el tamaño de tu equipo.
                    </Text>
                  </VStack>

                  <TextInput
                    label="Nombre de tu negocio"
                    description="Así aparecerá en tu página de reservas, WhatsApp y recordatorios."
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
                        Tamaño del equipo
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

                  <VStack gap={2}>
                    <Text type="label" weight="semibold">
                      Giro principal del estudio
                    </Text>
                    <Grid columns={{ minWidth: 200, max: 3 }} gap={3}>
                      {BUSINESS_TYPE_OPTIONS.map((opt) => {
                        const isSelected = businessType === opt.value;
                        return (
                          <SelectableCard
                            key={opt.value}
                            label={opt.value}
                            isSelected={isSelected}
                            onChange={() => setBusinessType(opt.value)}
                            padding={4}
                          >
                            <VStack gap={1.5}>
                              <HStack justify="between" align="center">
                                <Store size={17} aria-hidden="true" />
                                {isSelected ? (
                                  <AdminConfigChip
                                    tone="accent"
                                    label="Elegido"
                                    className="fx-pop"
                                  />
                                ) : null}
                              </HStack>
                              <Text weight="semibold" size="sm">
                                {opt.value}
                              </Text>
                              <Text type="supporting" color="secondary">
                                {opt.description}
                              </Text>
                            </VStack>
                          </SelectableCard>
                        );
                      })}
                    </Grid>
                  </VStack>

                  <VStack className="ad-subpanel" gap={1}>
                    <Text type="label" color="secondary">
                      Vista previa para tus clientas
                    </Text>
                    <Heading level={3} className="lk-serif ad-h3">
                      {displaySalonName}
                    </Heading>
                    <Text type="supporting" color="secondary">
                      {businessType} · Equipo: {teamSizeTier}
                    </Text>
                  </VStack>
                </VStack>
              ) : null}

              {stepIndex === 1 ? (
                <VStack gap={4}>
                  <VStack gap={1}>
                    <Heading level={2} className="lk-serif ad-h2">
                      ¿Dónde te encuentran tus clientas?
                    </Heading>
                    <Text color="secondary">
                      Define cómo atiendes tus citas y la dirección o zona visible en tu página pública.
                    </Text>
                  </VStack>

                  <VStack gap={1.5}>
                    <Text type="label" weight="semibold">
                      Modalidad de atención
                    </Text>
                    <SegmentedControl
                      label="Modalidad de atención"
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
                        label="Solo en línea"
                        icon={<Globe size={15} aria-hidden="true" />}
                      />
                    </SegmentedControl>
                  </VStack>

                  <TextInput
                    label={
                      serviceMode === 'online'
                        ? 'Zona horaria o referencia de atención'
                        : 'Dirección o colonia y ciudad'
                    }
                    description="Puedes mostrar solo la colonia y compartir la ubicación exacta al confirmar el anticipo."
                    value={address}
                    onChange={setAddress}
                    autoComplete="street-address"
                    placeholder="Calle 25 Sur 1904, Col. Volcanes, Puebla"
                    startIcon={<MapPin size={16} aria-hidden="true" />}
                  />

                  <HStack
                    className="ad-subpanel"
                    justify="between"
                    align="center"
                    gap={3}
                    wrap="wrap"
                  >
                    <HStack gap={2} align="center" className="rb-grow">
                      <Wallet size={17} aria-hidden="true" />
                      <VStack gap={0.5} className="rb-grow">
                        <Text weight="semibold" size="sm">
                          Anticipo SPEI y perfil de Instagram
                        </Text>
                        <Text type="supporting" color="secondary" hasTabularNumbers>
                          {formatCurrency(
                            data.settings.depositAmountCents ?? 20000,
                            data.settings.currency,
                          )}{' '}
                          · {data.settings.depositBankName || 'Mercado Pago'} ·{' '}
                          {data.settings.instagramHandle || '@laikona.nailsss'}
                        </Text>
                      </VStack>
                    </HStack>
                    <NextLink href="/admin/marca" className="ad-inline-link">
                      Ajustar en Marca →
                    </NextLink>
                  </HStack>
                </VStack>
              ) : null}

              {stepIndex === 2 ? (
                <VStack gap={4}>
                  <VStack gap={1}>
                    <Heading level={2} className="lk-serif ad-h2">
                      Confirma tu servicio estrella
                    </Heading>
                    <Text color="secondary">
                      Ajusta precio aproximado y duración; después podrás gestionar tu catálogo completo en Servicios.
                    </Text>
                  </VStack>

                  {starterServices.length > 1 ? (
                    <VStack gap={1.5}>
                      <Text type="label" color="secondary">
                        Servicios en tu catálogo (elige uno para ajustar o crea uno nuevo)
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
                        <button
                          type="button"
                          className="ad-pill fx-press"
                          data-on={selectedServiceId === null ? 'true' : 'false'}
                          aria-pressed={selectedServiceId === null}
                          onClick={() => {
                            setSelectedServiceId(null);
                            setServiceName('');
                            setServicePriceMxn(350);
                            setServiceDurationMinutes(120);
                            setServiceIsStartingPrice(true);
                          }}
                        >
                          + Nuevo servicio
                        </button>
                      </HStack>
                    </VStack>
                  ) : null}

                  <Grid columns={{ minWidth: 200, max: 2 }} gap={4}>
                    <TextInput
                      label="Nombre del servicio"
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
                    label="Precio desde"
                    description='Mostrar "Desde $..." para servicios cuyo costo final depende del largo o diseño'
                    value={serviceIsStartingPrice}
                    onChange={setServiceIsStartingPrice}
                  />

                  <VStack gap={2}>
                    <HStack gap={1.5} align="center">
                      <Clock size={15} aria-hidden="true" />
                      <Text type="label" weight="semibold">
                        Duración aproximada ({formatDuration(serviceDurationMinutes)})
                      </Text>
                    </HStack>
                    <HStack gap={1.5} wrap="wrap" role="group" aria-label="Duración aproximada">
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

                  <HStack
                    className="ad-subpanel"
                    justify="between"
                    align="center"
                    wrap="wrap"
                    gap={2}
                  >
                    <VStack gap={0.5}>
                      <Text type="label" color="secondary">
                        Así lo verán tus clientas
                      </Text>
                      <Text weight="semibold">{serviceName.trim() || 'Tu servicio'}</Text>
                      <Text type="supporting" color="secondary">
                        Duración aprox. {formatDuration(serviceDurationMinutes)}
                      </Text>
                    </VStack>
                    <AdminConfigChip
                      tone="accent"
                      label={`${serviceIsStartingPrice ? 'Desde ' : ''}${formatCurrency(
                        Math.max(0, Math.round(servicePriceMxn * 100)),
                        data.settings.currency,
                      )}`}
                      hasTabularNumbers
                    />
                  </HStack>
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
                  label={stepIndex === 2 ? 'Finalizar y activar página' : 'Continuar'}
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
                <StatusDot variant="success" label="En vivo" isPulsing />
                <AdminConfigChip tone="success" label="En vivo" className="fx-pop" />
              </HStack>
              <Heading level={2} className="lk-serif ad-h2">
                ¡{displaySalonName} está en vivo!
              </Heading>
              <Text color="secondary">
                Tu página de reservas, calendario por especialista y aviso de anticipo SPEI ya están listos para recibir citas.
              </Text>
            </VStack>

            <VStack as="ul" className="ad-surface ad-row-list" gap={0}>
              <li className="ad-row-item">
                <HStack gap={2} align="center" className="rb-grow">
                  <CheckCircle2 size={18} aria-hidden="true" />
                  <VStack gap={0.5} className="rb-grow">
                    <Text weight="semibold" size="sm">
                      Estudio configurado
                    </Text>
                    <Text type="supporting" color="secondary">
                      {displaySalonName} · {businessType} ({teamSizeTier})
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
                      Calendario y servicio estrella listos
                    </Text>
                    <Text type="supporting" color="secondary">
                      Turnos fijos activos · Servicio destacado: {serviceName.trim() || 'Rubber'}
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
                      Página de reservas activa
                    </Text>
                    <Text type="supporting" color="secondary" hasTabularNumbers>
                      Disponible 24/7 en /reservar con anticipo de{' '}
                      {formatCurrency(
                        data.settings.depositAmountCents ?? 20000,
                        data.settings.currency,
                      )}
                    </Text>
                  </VStack>
                </HStack>
                <NextLink href="/reservar" className="ad-inline-link">
                  Ver /reservar →
                </NextLink>
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
                    Alertas y sonido de nuevas citas
                  </Text>
                  <Text type="supporting" color="secondary">
                    {soundAlertsEnabled
                      ? 'Sonido especial activo al recibir reservas.'
                      : 'Sonido desactivado por ahora.'}{' '}
                    Permiso del navegador:{' '}
                    {notificationPermission === 'granted'
                      ? 'concedido'
                      : notificationPermission === 'denied'
                        ? 'bloqueado'
                        : 'pendiente'}
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
                  label="Configurar avisos"
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
                  label="Ir al panel"
                  variant="secondary"
                  href="/admin"
                  icon={<LayoutDashboard size={16} aria-hidden="true" />}
                />
                <Button
                  label="Crear tu primera cita"
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
            title="Entérate al instante cuando te agenden"
            subtitle="Recibe avisos inmediatos en tu panel mientras atiendes en mesa"
            onOpenChange={setNotifDialogOpen}
          />
          <List hasDividers>
            <ListItem
              label="Nuevas citas y cambios en agenda"
              description={
                <Text type="supporting" color="secondary">
                  Aviso inmediato cuando una clienta reserva, reagenda o cancela.
                </Text>
              }
              startContent={<CalendarPlus size={17} aria-hidden="true" />}
            />
            <ListItem
              label="Anticipos recibidos por validar"
              description={
                <Text type="supporting" color="secondary">
                  Identifica al instante transferencias SPEI y comprobantes enviados.
                </Text>
              }
              startContent={<Bell size={17} aria-hidden="true" />}
            />
            <ListItem
              label="Sonido especial cuando reservan en tu página"
              description={
                <Text type="supporting" color="secondary">
                  Timbre suave de dos tonos reproducible desde el navegador, silenciable cuando quieras.
                </Text>
              }
              startContent={<Volume2 size={17} aria-hidden="true" />}
            />
          </List>
          <HStack justify="end" gap={2} wrap="wrap">
            <Button
              type="button"
              label="Quizá después"
              variant="secondary"
              onClick={() => setNotifDialogOpen(false)}
            />
            <Button
              type="button"
              label="Activar notificaciones"
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
