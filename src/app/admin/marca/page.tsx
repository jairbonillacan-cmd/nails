'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Check, RotateCcw, Save } from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import {
  MetricGrid,
  PageHeader,
  PageSkeleton,
  SkeletonBlock,
  StatusTag,
} from '@/components/ui';
import { BrandIdentitySection } from '@/components/admin/marca/BrandIdentitySection';
import { BookingAppearanceSection } from '@/components/admin/marca/BookingAppearanceSection';
import { DepositSettingsSection } from '@/components/admin/marca/DepositSettingsSection';
import { LoyaltySettingsSection } from '@/components/admin/marca/LoyaltySettingsSection';
import { BrandGallerySection } from '@/components/admin/marca/BrandGallerySection';
import { AdvancedPoliciesSection } from '@/components/admin/marca/AdvancedPoliciesSection';
import {
  areLoyaltyProgramsEqual,
  areSettingsEqual,
  buildBrandKpis,
  buildBrandPatchPayload,
  DEFAULT_LOYALTY_PROGRAM,
} from '@/components/admin/marca/brandFormUtils';
import { LANDING_ASSETS } from '@/components/landing/landingContent';
import { useSalonAppearance } from '@/components/SalonThemeProvider';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import { checkThemeAccentContrast } from '@/lib/contrast';
import type { LoyaltyProgram, SalonSettings } from '@/lib/types';

const QrShareCard = dynamic(
  () => import('@/components/admin/QrShareCard').then((mod) => mod.QrShareCard),
  {
    ssr: false,
    loading: () => <SkeletonBlock width="100%" height="16rem" radius={3} />,
  },
);

type ActiveServiceMode = NonNullable<SalonSettings['serviceMode']>;

export default function AdminBrandPage() {
  const { data, loading, refresh } = useAdminData();
  const { mode, setSettingsOverride, setMode } = useSalonAppearance();
  const [draftOverride, setDraftOverride] = useState<SalonSettings | null>(null);
  const [loyaltyOverride, setLoyaltyOverride] = useState<LoyaltyProgram | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const saveNotice = useEphemeralMessage(3500);

  if (loading || !data) {
    return (
      <PageSkeleton
        kpiCount={4}
        withSplit
        ariaLabel="Cargando configuración de página y marca"
      />
    );
  }

  const baseSettings = data.settings;
  const baseLoyalty = data.loyaltyProgram ?? DEFAULT_LOYALTY_PROGRAM;
  const draft = draftOverride ?? baseSettings;
  const loyaltyDraft = loyaltyOverride ?? baseLoyalty;
  const tz = draft.timezone || 'America/Mexico_City';

  const depositAmountCents = draft.depositAmountCents ?? 20000;
  const depositBeneficiary = draft.depositBeneficiary ?? draft.depositAccountHolder;
  const activeServiceMode: ActiveServiceMode = draft.serviceMode ?? 'studio';
  const soundAlertsEnabled = draft.soundAlertsEnabled ?? true;
  const noShowDepositThreshold = draft.noShowDepositThreshold ?? 2;
  const ownerPinEnabled = Boolean(draft.ownerPinEnabled);
  const hasOwnerPin = Boolean(baseSettings.hasOwnerPin);
  const flaggedNoShowClientsCount = data.clients.filter(
    (c) => c.noShowCount >= noShowDepositThreshold,
  ).length;
  const activeServices = data.services.filter((s) => s.isActive);
  const isDepositEnabled = draft.paymentMode !== 'none';
  const isOwner = data.session.user.role === 'owner';
  const brandLogo = mode === 'dark' ? LANDING_ASSETS.logoWhite : LANDING_ASSETS.logoBlack;

  const colorReadability = checkThemeAccentContrast({
    accentLight: draft.brandAccentLight,
    accentDark: draft.brandAccentDark,
  });
  const colorsReadable = colorReadability.lightPassesAA && colorReadability.darkPassesAA;

  const isBrandDirty =
    !areSettingsEqual(draft, baseSettings) ||
    !areLoyaltyProgramsEqual(loyaltyDraft, baseLoyalty);

  const kpiItems = buildBrandKpis({
    colorsReadable,
    isDepositEnabled,
    depositAmountCents,
    draft,
    loyaltyDraft,
    hasOwnerPin,
    ownerPinEnabled,
    noShowDepositThreshold,
  });

  const updateDraft = (patch: Partial<SalonSettings>) => {
    const next = { ...draft, ...patch };
    setDraftOverride(next);
    setSettingsOverride(next);
  };

  const updateLoyaltyDraft = (patch: Partial<LoyaltyProgram>) => {
    setLoyaltyOverride({ ...loyaltyDraft, ...patch });
  };

  const discardChanges = () => {
    setDraftOverride(null);
    setLoyaltyOverride(null);
    setSettingsOverride(baseSettings);
    setErrorMsg(null);
  };

  const submitSave = async () => {
    if (!isBrandDirty || saving) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/admin/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          buildBrandPatchPayload({ draft, loyaltyDraft, activeServices, hasOwnerPin }),
        ),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setErrorMsg(json?.error || 'No se pudieron guardar los cambios.');
        return;
      }
      await refresh();
      setDraftOverride(null);
      setLoyaltyOverride(null);
      saveNotice.show('Cambios guardados');
    } catch {
      setErrorMsg('Error de conexión al guardar tus cambios.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <VStack className="ad-page">
      <PageHeader
        eyebrow="Tu salón en internet"
        title="Mi página"
        subtitle="Personaliza el nombre, logo y color de tu salón, descarga tu QR y ajusta tu tarjeta de sellos."
        meta={
          saving ? (
            <Text className="fx-save-pill" data-state="saving" role="status" aria-live="polite">
              Guardando...
            </Text>
          ) : saveNotice.message ? (
            <Text className="fx-save-pill" data-state="saved" role="status" aria-live="polite">
              <Check size={12} aria-hidden="true" />
              {saveNotice.message}
            </Text>
          ) : undefined
        }
        actions={
          isBrandDirty ? (
            <HStack gap={2} align="center" wrap="wrap">
              <StatusTag label="Cambios sin guardar" tone="warning" className="fx-pop" />
              <Button
                type="button"
                label="Descartar"
                variant="ghost"
                size="sm"
                icon={<RotateCcw size={14} aria-hidden="true" />}
                isDisabled={saving}
                onClick={discardChanges}
              />
              <Button
                type="button"
                label={saving ? 'Guardando...' : 'Guardar cambios'}
                variant="primary"
                icon={<Save size={15} aria-hidden="true" />}
                isLoading={saving}
                isDisabled={saving}
                onClick={() => void submitSave()}
              />
            </HStack>
          ) : (
            <StatusTag label="Todo guardado" tone="success" showDot />
          )
        }
      />

      <MetricGrid ariaLabel="Resumen de tu página" items={kpiItems} cols={4} />

      {errorMsg ? (
        <Banner
          status="error"
          role="alert"
          title={errorMsg}
          isDismissable
          onDismiss={() => setErrorMsg(null)}
        />
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submitSave();
        }}
      >
        <VStack
          gap={5}
          className={saving ? 'fx-busy' : undefined}
          aria-busy={saving || undefined}
        >
          <VStack className="ad-config-grid" gap={5}>
            <VStack gap={4}>
              <BrandIdentitySection
                draft={draft}
                brandLogo={brandLogo}
                activeServiceMode={activeServiceMode}
                onUpdateDraft={updateDraft}
              />
              <BookingAppearanceSection
                draft={draft}
                soundAlertsEnabled={soundAlertsEnabled}
                colorReadability={colorReadability}
                onUpdateDraft={updateDraft}
                onModeChange={setMode}
              />
              <LoyaltySettingsSection
                loyaltyDraft={loyaltyDraft}
                activeServices={activeServices}
                currency={draft.currency}
                onUpdateLoyaltyDraft={updateLoyaltyDraft}
              />
              <DepositSettingsSection
                draft={draft}
                isDepositEnabled={isDepositEnabled}
                depositAmountCents={depositAmountCents}
                depositBeneficiary={depositBeneficiary}
                onUpdateDraft={updateDraft}
              />
            </VStack>

            <VStack gap={4}>
              <BrandGallerySection
                draft={draft}
                brandLogo={brandLogo}
                activeServiceMode={activeServiceMode}
                isDepositEnabled={isDepositEnabled}
                depositAmountCents={depositAmountCents}
                depositBeneficiary={depositBeneficiary}
              />
              <QrShareCard appUrl={data.integration.appUrl} salonName={draft.name} />
            </VStack>
          </VStack>

          <AdvancedPoliciesSection
            draft={draft}
            isOwner={isOwner}
            timezone={tz}
            appUrl={data.integration.appUrl}
            services={data.services}
            staff={data.staff}
            recentAuditLogs={data.recentAuditLogs}
            flaggedNoShowClientsCount={flaggedNoShowClientsCount}
            hasOwnerPin={hasOwnerPin}
            onUpdateDraft={updateDraft}
            onSyncOwnerPinEnabled={(enabled) => updateDraft({ ownerPinEnabled: enabled })}
            onRefresh={refresh}
            onNotify={saveNotice.show}
          />
        </VStack>
      </form>

      {isBrandDirty ? (
        <HStack
          className="ad-sticky-bar fx-sheet-in"
          justify="between"
          align="center"
          gap={3}
          wrap="wrap"
          role="region"
          aria-label="Cambios sin guardar"
        >
          <HStack gap={2} align="center">
            <StatusTag label="Sin guardar" tone="warning" />
            <Text size="sm" weight="medium">
              Tienes cambios pendientes en Mi página.
            </Text>
          </HStack>
          <HStack gap={2} align="center" wrap="wrap">
            <Button
              type="button"
              label="Descartar"
              variant="ghost"
              size="sm"
              icon={<RotateCcw size={14} aria-hidden="true" />}
              isDisabled={saving}
              onClick={discardChanges}
            />
            <Button
              type="button"
              label={saving ? 'Guardando...' : 'Guardar cambios'}
              variant="primary"
              size="sm"
              icon={<Save size={14} aria-hidden="true" />}
              isLoading={saving}
              isDisabled={saving}
              onClick={() => void submitSave()}
            />
          </HStack>
        </HStack>
      ) : null}
    </VStack>
  );
}
