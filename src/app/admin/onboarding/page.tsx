'use client';

import React, { useCallback, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Switch } from '@astryxdesign/core/Switch';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Stepper, Step } from '@astryxdesign/core/Stepper';
import { SelectableCard } from '@astryxdesign/core/SelectableCard';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { ToggleButton } from '@astryxdesign/core/ToggleButton';
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
  Sparkles,
  Store,
  Users,
  Volume2,
} from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
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
  { value: 'Solo yo', subtitle: 'Agenda individual y control directo' },
  { value: 'Somos 2', subtitle: 'Dos estaciones sincronizadas' },
  { value: '3 a 5', subtitle: 'Equipo boutique con turnos por especialista' },
  { value: '6 a 15', subtitle: 'Estudio en crecimiento con recepción' },
  { value: '16 o más', subtitle: 'Operación multi-especialista' },
] as const;

const DURATION_PRESETS = [
  { minutes: 15, label: '15 min' },
  { minutes: 30, label: '30 min' },
  { minutes: 45, label: '45 min' },
  { minutes: 60, label: '1 h' },
  { minutes: 90, label: '1 h 30 min' },
  { minutes: 120, label: '2 h' },
  { minutes: 150, label: '2 h 30 min' },
  { minutes: 180, label: '3 h' },
  { minutes: 240, label: '4 h' },
] as const;

const STEP_LABELS = [
  'Negocio',
  'Equipo',
  'Nombre',
  'Ubicación',
  'Servicio',
  'En vivo',
] as const;

function parseServiceMode(value: string): ServiceMode {
  if (value === 'home' || value === 'online') return value;
  return 'studio';
}

export default function AdminOnboardingPage() {
  const { data, refresh } = useAdminData();
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

  useExternalSync(isOwner ? 'admin-onboarding-owner' : 'admin-onboarding-skip', loadOnboarding);

  if (!data) return null;

  if (!isOwner) {
    return (
      <VStack gap={4} maxWidth={680} width="100%" style={{ marginInline: 'auto' }}>
        <Banner
          status="warning"
          title="Acceso exclusivo de Dueña (Owner)"
          description="El asistente de configuración inicial del estudio solo puede ser editado por la cuenta de Dueña."
          endContent={<Button label="Volver al inicio" variant="secondary" size="sm" href="/admin" />}
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
      const ok = await persistOnboarding({ businessType });
      if (ok) advanceToStep(1);
      return;
    }

    if (stepIndex === 1) {
      const ok = await persistOnboarding({ teamSizeTier });
      if (ok) advanceToStep(2);
      return;
    }

    if (stepIndex === 2) {
      const trimmedName = salonName.trim();
      if (trimmedName.length < 2) {
        setErrorMessage('Ingresa al menos 2 caracteres para el nombre de tu negocio.');
        return;
      }
      const ok = await persistOnboarding({ salonName: trimmedName });
      if (ok) advanceToStep(3);
      return;
    }

    if (stepIndex === 3) {
      const ok = await persistOnboarding({
        serviceMode,
        address: address.trim(),
      });
      if (ok) advanceToStep(4);
      return;
    }

    if (stepIndex === 4) {
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
        advanceToStep(5);
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

  return (
    <VStack gap={5} maxWidth={860} width="100%" style={{ marginInline: 'auto' }}>
      <HStack justify="between" align="center" wrap="wrap" gap={3}>
        <VStack gap={0.5}>
          <HStack gap={2} align="center">
            <Sparkles size={18} aria-hidden="true" />
            <Text type="label" color="secondary">
              Asistente inicial · 6 pasos
            </Text>
          </HStack>
          <Heading level={1}>Configura tu estudio en minutos</Heading>
        </VStack>
        <Button
          label="Salir al panel"
          variant="ghost"
          size="sm"
          href="/admin"
          icon={<LayoutDashboard size={15} />}
        />
      </HStack>

      <Card padding={4}>
        <VStack gap={3}>
          <ProgressBar
            label="Avance de configuración inicial"
            value={stepIndex + 1}
            max={STEP_LABELS.length}
            hasValueLabel
            formatValueLabel={(val, max) => `Paso ${val} de ${max}`}
            variant={stepIndex === 5 ? 'success' : 'accent'}
          />
          <Stepper
            activeStep={stepIndex}
            onStepClick={(idx) => {
              if (idx <= maxReachedStep) {
                setErrorMessage(null);
                setStepIndex(idx);
              }
            }}
            label="Pasos de configuración de LAIKONA NAILS"
            density="compact"
          >
            {STEP_LABELS.map((stepLabel, idx) => (
              <Step
                key={stepLabel}
                step={idx}
                label={stepLabel}
                isDisabled={idx > maxReachedStep}
                status={idx < stepIndex || stepIndex === 5 ? 'success' : undefined}
              />
            ))}
          </Stepper>
        </VStack>
      </Card>

      {errorMessage ? (
        <Banner status="error" title={errorMessage} />
      ) : null}

      {feedback.message ? (
        <Banner status="success" title={feedback.message} />
      ) : null}

      {!hydrated ? (
        <Card padding={6}>
          <VStack gap={3}>
            <Text color="secondary">Cargando datos actuales del estudio...</Text>
            <ProgressBar label="Cargando configuración" isIndeterminate />
          </VStack>
        </Card>
      ) : stepIndex < 5 ? (
        <form onSubmit={handleStepSubmit}>
          <Card padding={6}>
            <VStack gap={5}>
              {stepIndex === 0 ? (
                <VStack gap={4}>
                  <VStack gap={1}>
                    <Heading level={2}>¿Qué tipo de negocio tienes?</Heading>
                    <Text color="secondary">
                      Adaptamos tu agenda, mensajes y catálogo al giro principal de tu estudio.
                    </Text>
                  </VStack>
                  <Grid columns={{ minWidth: 220, max: 3 }} gap={3}>
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
                          <VStack gap={2}>
                            <HStack justify="between" align="center">
                              <Store size={18} aria-hidden="true" />
                              {isSelected ? (
                                <Badge variant="success" label="Elegido" />
                              ) : null}
                            </HStack>
                            <Text weight="semibold">{opt.value}</Text>
                            <Text type="supporting" color="secondary">
                              {opt.description}
                            </Text>
                          </VStack>
                        </SelectableCard>
                      );
                    })}
                  </Grid>
                </VStack>
              ) : null}

              {stepIndex === 1 ? (
                <VStack gap={4}>
                  <VStack gap={1}>
                    <Heading level={2}>¿Cuántas profesionales trabajan ahí?</Heading>
                    <Text color="secondary">
                      Así preparamos tus agendas individuales, comisiones y roles de acceso.
                    </Text>
                  </VStack>
                  <Grid columns={{ minWidth: 200, max: 3 }} gap={3}>
                    {TEAM_SIZE_OPTIONS.map((opt) => {
                      const isSelected = teamSizeTier === opt.value;
                      return (
                        <SelectableCard
                          key={opt.value}
                          label={opt.value}
                          isSelected={isSelected}
                          onChange={() => setTeamSizeTier(opt.value)}
                          padding={4}
                        >
                          <VStack gap={1.5}>
                            <HStack justify="between" align="center">
                              <Users size={18} aria-hidden="true" />
                              {isSelected ? <Check size={16} aria-hidden="true" /> : null}
                            </HStack>
                            <Text weight="semibold">{opt.value}</Text>
                            <Text type="supporting" color="secondary">
                              {opt.subtitle}
                            </Text>
                          </VStack>
                        </SelectableCard>
                      );
                    })}
                  </Grid>
                </VStack>
              ) : null}

              {stepIndex === 2 ? (
                <VStack gap={4}>
                  <VStack gap={1}>
                    <Heading level={2}>¿Cómo se llama tu negocio?</Heading>
                    <Text color="secondary">
                      Esto es lo que verán tus clientas al agendar y en sus recordatorios.
                    </Text>
                  </VStack>
                  <TextInput
                    label="Nombre de tu negocio"
                    description="Esto es lo que verán tus clientas al agendar"
                    value={salonName}
                    onChange={setSalonName}
                    isRequired
                    autoComplete="organization"
                    placeholder="LAIKONA NAILS"
                    startIcon={<Building2 size={16} aria-hidden="true" />}
                  />
                  <Card variant="muted" padding={4}>
                    <VStack gap={1}>
                      <Text type="label" color="secondary">
                        Vista previa para tus clientas
                      </Text>
                      <Heading level={3}>{displaySalonName}</Heading>
                      <Text type="supporting" color="secondary">
                        {businessType} · Equipo: {teamSizeTier}
                      </Text>
                    </VStack>
                  </Card>
                </VStack>
              ) : null}

              {stepIndex === 3 ? (
                <VStack gap={4}>
                  <VStack gap={1}>
                    <Heading level={2}>¿Dónde te encuentran tus clientas?</Heading>
                    <Text color="secondary">
                      Define cómo recibes tus citas y la dirección o ciudad visible en tu página.
                    </Text>
                  </VStack>
                  <VStack gap={1.5}>
                    <Text type="label">Modalidad de atención</Text>
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
                        : 'Dirección o ciudad (Puebla)'
                    }
                    description="Puedes mostrar solo la zona y compartir la ubicación exacta al confirmar el anticipo."
                    value={address}
                    onChange={setAddress}
                    autoComplete="street-address"
                    placeholder="Puebla, México · Con @lumiere.beautymx"
                    startIcon={<MapPin size={16} aria-hidden="true" />}
                  />
                </VStack>
              ) : null}

              {stepIndex === 4 ? (
                <VStack gap={4}>
                  <VStack gap={1}>
                    <Heading level={2}>Agrega o confirma tu servicio más popular</Heading>
                    <Text color="secondary">
                      Confirma precio aproximado y duración; después podrás editar todo tu menú en
                      Servicios.
                    </Text>
                  </VStack>

                  {starterServices.length > 1 ? (
                    <VStack gap={1.5}>
                      <Text type="label" color="secondary">
                        Servicios actuales en tu catálogo (toca para ajustar o crea uno nuevo)
                      </Text>
                      <HStack gap={2} wrap="wrap">
                        {starterServices.map((srv) => (
                          <ToggleButton
                            key={srv.id}
                            size="sm"
                            label={srv.name}
                            isPressed={selectedServiceId === srv.id}
                            onPressedChange={() => handleSelectStarterService(srv)}
                          />
                        ))}
                        <ToggleButton
                          size="sm"
                          label="+ Nuevo servicio"
                          isPressed={selectedServiceId === null}
                          onPressedChange={() => {
                            setSelectedServiceId(null);
                            setServiceName('');
                            setServicePriceMxn(350);
                            setServiceDurationMinutes(120);
                            setServiceIsStartingPrice(true);
                          }}
                        />
                      </HStack>
                    </VStack>
                  ) : null}

                  <Grid columns={{ minWidth: 240, max: 2 }} gap={4}>
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
                      <Text type="label">
                        Duración aproximada ({formatDuration(serviceDurationMinutes)})
                      </Text>
                    </HStack>
                    <HStack gap={2} wrap="wrap">
                      {DURATION_PRESETS.map((preset) => (
                        <ToggleButton
                          key={preset.minutes}
                          size="sm"
                          label={preset.label}
                          isPressed={serviceDurationMinutes === preset.minutes}
                          onPressedChange={() => setServiceDurationMinutes(preset.minutes)}
                        />
                      ))}
                    </HStack>
                  </VStack>

                  <Card variant="muted" padding={4}>
                    <HStack justify="between" align="center" wrap="wrap" gap={2}>
                      <VStack gap={0.5}>
                        <Text type="label" color="secondary">
                          Así lo verán tus clientas
                        </Text>
                        <Text weight="semibold">{serviceName.trim() || 'Tu servicio'}</Text>
                        <Text type="supporting" color="secondary">
                          Duración aprox. {formatDuration(serviceDurationMinutes)}
                        </Text>
                      </VStack>
                      <Badge
                        variant="info"
                        label={`${serviceIsStartingPrice ? 'Desde ' : ''}${formatCurrency(
                          Math.max(0, Math.round(servicePriceMxn * 100)),
                          data.settings.currency,
                        )}`}
                      />
                    </HStack>
                  </Card>
                </VStack>
              ) : null}

              <Divider />

              <HStack justify="between" align="center" wrap="wrap" gap={3}>
                <Button
                  type="button"
                  label="Atrás"
                  variant="secondary"
                  icon={<ArrowLeft size={16} />}
                  isDisabled={stepIndex === 0 || saving}
                  onClick={handleBack}
                />
                <Button
                  type="submit"
                  label={stepIndex === 4 ? 'Finalizar y activar página' : 'Continuar'}
                  variant="primary"
                  isLoading={saving}
                  endContent={<ArrowRight size={16} />}
                />
              </HStack>
            </VStack>
          </Card>
        </form>
      ) : (
        <Card padding={6}>
          <VStack gap={5}>
            <VStack gap={2}>
              <HStack gap={2} align="center">
                <StatusDot variant="success" label="En vivo" isPulsing />
                <Text type="label" weight="semibold">
                  En vivo
                </Text>
              </HStack>
              <Heading level={2}>¡{displaySalonName} está en vivo!</Heading>
              <Text color="secondary">
                Tu página de reservas, calendario por especialista y aviso de anticipo SPEI ya están
                activos para recibir citas.
              </Text>
            </VStack>

            <List hasDividers>
              <ListItem
                label="Cuenta creada"
                description={
                  <Text type="supporting" color="secondary">
                    {displaySalonName} · {businessType} ({teamSizeTier})
                  </Text>
                }
                startContent={<CheckCircle2 size={18} aria-hidden="true" />}
                endContent={<Badge variant="success" label="Listo" />}
              />
              <ListItem
                label="Calendario listo"
                description={
                  <Text type="supporting" color="secondary">
                    Bloques fijos activos para Karla, Paty y Tere · Servicio destacado:{' '}
                    {serviceName.trim() || 'Rubber'}
                  </Text>
                }
                startContent={<CheckCircle2 size={18} aria-hidden="true" />}
                endContent={<Badge variant="success" label="Listo" />}
              />
              <ListItem
                label="Página de reservas activa"
                description={
                  <Text type="supporting" color="secondary">
                    Disponible 24/7 en /reservar con anticipo de{' '}
                    {formatCurrency(
                      data.settings.depositAmountCents ?? 20000,
                      data.settings.currency,
                    )}
                  </Text>
                }
                startContent={<CheckCircle2 size={18} aria-hidden="true" />}
                endContent={<Badge variant="success" label="En vivo" />}
                href="/reservar"
              />
            </List>

            <Card variant="muted" padding={4}>
              <HStack justify="between" align="center" wrap="wrap" gap={3}>
                <HStack gap={2} align="center">
                  <Bell size={18} aria-hidden="true" />
                  <VStack gap={0.5}>
                    <Text weight="semibold">Alertas y sonido de nuevas citas</Text>
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
                    icon={<Volume2 size={15} />}
                    onClick={() => void handleTestChime()}
                  />
                  <Button
                    type="button"
                    label="Configurar notificaciones"
                    variant="secondary"
                    size="sm"
                    icon={<Bell size={15} />}
                    onClick={() => setNotifDialogOpen(true)}
                  />
                </HStack>
              </HStack>
            </Card>

            <Divider />

            <HStack justify="between" align="center" wrap="wrap" gap={3}>
              <Button
                type="button"
                label="Editar pasos anteriores"
                variant="ghost"
                icon={<ArrowLeft size={15} />}
                onClick={() => setStepIndex(4)}
              />
              <HStack gap={2} wrap="wrap">
                <Button
                  label="Ir al panel"
                  variant="secondary"
                  href="/admin"
                  icon={<LayoutDashboard size={16} />}
                />
                <Button
                  label="Crear tu primera cita"
                  variant="primary"
                  href="/admin/citas?new=1"
                  icon={<CalendarPlus size={16} />}
                />
              </HStack>
            </HStack>
          </VStack>
        </Card>
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
                  Timbre suave de dos tonos reproducible desde el navegador, silenciable cuando
                  quieras.
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
              icon={<Bell size={15} />}
              isLoading={saving}
              onClick={() => void handleActivateNotifications()}
            />
          </HStack>
        </VStack>
      </Dialog>
    </VStack>
  );
}
