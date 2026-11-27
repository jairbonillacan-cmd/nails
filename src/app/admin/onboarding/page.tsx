'use client';

import type React from 'react';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { VStack } from '@astryxdesign/core/VStack';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { useAdminData } from '@/components/admin/AdminProvider';
import { PageHeader, PageSkeleton } from '@/components/ui';
import { OnboardingProgressCard } from '@/components/admin/onboarding/OnboardingProgressCard';
import {
  buildStaffShiftSummaries,
  INITIAL_ONBOARDING_DEPOSIT,
  INITIAL_ONBOARDING_PROFILE,
  INITIAL_ONBOARDING_SERVICE,
  OnboardingStepFormCard,
  type OnboardingDepositState,
  type OnboardingProfileState,
  type OnboardingServiceState,
} from '@/components/admin/onboarding/OnboardingStepFormCard';
import {
  postOnboardingJson,
  submitOnboardingStep,
} from '@/components/admin/onboarding/onboardingActions';
import { OnboardingStepAlerts } from '@/components/admin/onboarding/OnboardingStepAlerts';
import { parseOnboardingParams, resumenHref } from '@/lib/admin-links';
import { useBookingAlertSound } from '@/lib/hooks/useBookingAlertSound';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';

function resolveOnboardingStepIndex(step: string | undefined): number {
  const normalized = (step ?? '').trim().toLowerCase();
  if (normalized === '1' || normalized === 'spei' || normalized === 'anticipo') return 1;
  if (normalized === '2' || normalized === 'shifts' || normalized === 'turnos' || normalized === 'servicios') {
    return 2;
  }
  if (normalized === '3' || normalized === 'ready' || normalized === 'alertas') return 3;
  return 0;
}

export default function AdminOnboardingPage() {
  const { data, loading, refresh } = useAdminData();
  const searchParams = useSearchParams();
  const initialStep = resolveOnboardingStepIndex(parseOnboardingParams(searchParams).step);
  const { playBookingChime, requestBrowserNotifications, notificationPermission } =
    useBookingAlertSound();
  const feedback = useEphemeralMessage(4000);

  const [stepIndex, setStepIndex] = useState(initialStep);
  const [maxReachedStep, setMaxReachedStep] = useState(initialStep);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notifDialogOpen, setNotifDialogOpen] = useState(false);

  const [profileDraft, setProfileDraft] = useState<Partial<OnboardingProfileState>>({});
  const [depositDraft, setDepositDraft] = useState<OnboardingDepositState>(INITIAL_ONBOARDING_DEPOSIT);
  const [serviceDraftOverrides, setServiceDraftOverrides] = useState<
    Partial<OnboardingServiceState>
  >({});

  const isOwner = data?.session.user.role === 'owner';

  if (loading || !data) {
    return (
      <PageSkeleton
        kpiCount={0}
        withSplit={false}
        ariaLabel="Cargando guía inicial"
        className="ad-wizard-shell"
      />
    );
  }

  if (!isOwner) {
    return (
      <VStack className="ad-page ad-wizard-shell">
        <Banner
          status="warning"
          role="status"
          title="Solo disponible para la Dueña"
          description="La guía inicial del salón solo puede ser editada desde la cuenta de Dueña."
          endContent={<Button label="Volver al inicio" variant="secondary" size="sm" href={resumenHref()} />}
        />
      </VStack>
    );
  }

  const starterServices = data.services.filter((s) => s.isActive).slice(0, 5);
  const firstStarter = starterServices[0];
  const profile: OnboardingProfileState = {
    businessType: data.settings.businessType || INITIAL_ONBOARDING_PROFILE.businessType,
    teamSizeTier: data.settings.teamSizeTier || INITIAL_ONBOARDING_PROFILE.teamSizeTier,
    salonName: data.settings.name || INITIAL_ONBOARDING_PROFILE.salonName,
    serviceMode: data.settings.serviceMode ?? INITIAL_ONBOARDING_PROFILE.serviceMode,
    address: data.settings.address || INITIAL_ONBOARDING_PROFILE.address,
    soundAlertsEnabled:
      data.settings.soundAlertsEnabled ?? INITIAL_ONBOARDING_PROFILE.soundAlertsEnabled,
    ...profileDraft,
  };
  const serviceDraft: OnboardingServiceState = {
    ...(firstStarter
      ? {
          id: firstStarter.id,
          name: firstStarter.name,
          priceMxn: Math.round(firstStarter.priceCents / 100),
          durationMinutes: firstStarter.durationMinutes,
          isStartingPrice: firstStarter.isStartingPrice ?? true,
        }
      : INITIAL_ONBOARDING_SERVICE),
    ...serviceDraftOverrides,
  };

  const depositEnabled = depositDraft.enabled ?? data.settings.paymentMode !== 'none';
  const depositAmountMxn =
    depositDraft.amountMxn ?? Math.round((data.settings.depositAmountCents ?? 20000) / 100);
  const depositBank = depositDraft.bank ?? data.settings.depositBankName;
  const depositHolder =
    depositDraft.holder ?? (data.settings.depositBeneficiary ?? data.settings.depositAccountHolder);
  const depositClabe = depositDraft.clabe ?? data.settings.depositClabe;
  const instagramHandle = depositDraft.instagram ?? data.settings.instagramHandle;

  const handleStepSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSaving(true);
    try {
      const result = await submitOnboardingStep({
        stepIndex,
        profile,
        fallbackSalonName: data.settings.name,
        currentPaymentMode: data.settings.paymentMode,
        depositEnabled,
        depositAmountMxn,
        depositBank,
        depositHolder,
        depositClabe,
        instagramHandle,
        serviceDraft,
      });
      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }
      await refresh();
      setStepIndex(result.nextStep);
      setMaxReachedStep((prev) => Math.max(prev, result.nextStep));
      if (result.openNotifDialog) {
        setNotifDialogOpen(true);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleActivateNotifications = async () => {
    setErrorMessage(null);
    const permission = await requestBrowserNotifications();
    await playBookingChime();
    setSaving(true);
    try {
      const res = await postOnboardingJson(
        '/api/admin/onboarding',
        'POST',
        { soundAlertsEnabled: true, onboardingCompleted: true },
        'No se pudieron guardar las alertas.',
      );
      if (!res.ok) {
        setErrorMessage(res.error);
        return;
      }
      setProfileDraft((prev) => ({ ...prev, soundAlertsEnabled: true }));
      await refresh();
    } finally {
      setSaving(false);
    }
    setNotifDialogOpen(false);
    feedback.show(
      permission === 'granted'
        ? 'Avisos y sonido de nuevas citas activados.'
        : permission === 'denied'
          ? 'Sonido activado. Si quieres avisos en pantalla, actívalos en los permisos de tu celular o computadora.'
          : 'Sonido de nuevas citas activado.',
    );
  };

  const effectiveMaxReachedStep = data.settings.onboardingCompleted ? 3 : maxReachedStep;

  const baseOrigin = (
    data.integration.appUrl.trim() ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://laikona.nails')
  ).replace(/\/+$/, '');

  return (
    <VStack className="ad-page ad-wizard-shell">
      <PageHeader
        title="Guía inicial"
        subtitle="Cuatro pasos para dejar listo tu salón."
      />

      <OnboardingProgressCard
        stepIndex={stepIndex}
        maxReachedStep={effectiveMaxReachedStep}
        onSelectStep={(idx) => {
          setErrorMessage(null);
          setStepIndex(idx);
        }}
      />

      {errorMessage ? (
        <Banner status="error" role="alert" title={errorMessage} isDismissable onDismiss={() => setErrorMessage(null)} />
      ) : null}

      {feedback.message ? <Banner status="success" role="status" title={feedback.message} /> : null}

      {stepIndex < 3 ? (
        <OnboardingStepFormCard
          stepIndex={stepIndex}
          saving={saving}
          profile={profile}
          depositEnabled={depositEnabled}
          depositAmountMxn={depositAmountMxn}
          depositBank={depositBank}
          depositHolder={depositHolder}
          depositClabe={depositClabe}
          instagramHandle={instagramHandle}
          staffShiftSummaries={buildStaffShiftSummaries(data.staff, data.schedules)}
          starterServices={starterServices}
          serviceDraft={serviceDraft}
          currency={data.settings.currency}
          onPatchProfile={(patch) => setProfileDraft((p) => ({ ...p, ...patch }))}
          onPatchDeposit={(patch) => setDepositDraft((d) => ({ ...d, ...patch }))}
          onPatchService={(patch) => setServiceDraftOverrides((s) => ({ ...s, ...patch }))}
          onSelectStarterService={(srv) =>
            setServiceDraftOverrides({
              id: srv.id,
              name: srv.name,
              priceMxn: Math.round(srv.priceCents / 100),
              durationMinutes: srv.durationMinutes,
              isStartingPrice: srv.isStartingPrice ?? false,
            })
          }
          onBack={() => {
            setErrorMessage(null);
            setStepIndex((prev) => Math.max(0, prev - 1));
          }}
          onSubmit={handleStepSubmit}
        />
      ) : (
        <OnboardingStepAlerts
          displaySalonName={profile.salonName.trim() || data.settings.name}
          address={profile.address}
          bookingUrl={`${baseOrigin}/reservar`}
          depositEnabled={depositEnabled}
          depositAmountMxn={depositAmountMxn}
          depositBank={depositBank}
          currency={data.settings.currency}
          serviceName={serviceDraft.name}
          serviceDurationMinutes={serviceDraft.durationMinutes}
          soundAlertsEnabled={profile.soundAlertsEnabled}
          notificationPermission={notificationPermission}
          notifDialogOpen={notifDialogOpen}
          saving={saving}
          onSetNotifDialogOpen={setNotifDialogOpen}
          onTestChime={() =>
            void playBookingChime().then((played) =>
              feedback.show(
                played
                  ? 'Sonido de nueva cita reproducido.'
                  : 'Tu dispositivo silenció el audio por ahora. Sube el volumen o intenta de nuevo.',
              ),
            )
          }
          onActivateNotifications={() => void handleActivateNotifications()}
          onBackToSteps={() => setStepIndex(2)}
        />
      )}
    </VStack>
  );
}
