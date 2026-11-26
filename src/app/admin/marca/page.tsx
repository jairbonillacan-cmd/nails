'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import {
  Check,
  Images,
  LayoutTemplate,
  Palette,
  RotateCcw,
  Save,
  Store,
} from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import {
  FilterPillBar,
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
import { LandingContentEditorSection } from '@/components/admin/marca/LandingContentEditorSection';
import { LandingGalleryFaqSection } from '@/components/admin/marca/LandingGalleryFaqSection';
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
type BrandEditorTab = 'portada' | 'galeria' | 'estilo' | 'negocio';

export default function AdminBrandPage() {
  const { data, loading, refresh } = useAdminData();
  const { mode, setSettingsOverride, setMode } = useSalonAppearance();
  const [activeTab, setActiveTab] = useState<BrandEditorTab>('portada');
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
    customGalleryCount: data.gallery.length,
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
        subtitle="Edita tu portada, fotos, secciones, preguntas, colores y cobro de anticipo en un solo lugar."
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
            <StatusTag label="Todo guardado" tone="success" />
          )
        }
      />

      <MetricGrid ariaLabel="Resumen de tu página" items={kpiItems} cols={4} />

      <FilterPillBar<BrandEditorTab>
        ariaLabel="Secciones del editor de Mi página"
        value={activeTab}
        onChange={setActiveTab}
        options={[
          {
            value: 'portada',
            label: 'Portada y secciones',
            icon: <LayoutTemplate size={14} aria-hidden="true" />,
          },
          {
            value: 'galeria',
            label: 'Galería y preguntas',
            count: data.gallery.length,
            icon: <Images size={14} aria-hidden="true" />,
          },
          {
            value: 'estilo',
            label: 'Colores y estilo',
            icon: <Palette size={14} aria-hidden="true" />,
          },
          {
            value: 'negocio',
            label: 'Datos, cobro y sellos',
            icon: <Store size={14} aria-hidden="true" />,
          },
        ]}
      />

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
              {activeTab === 'portada' ? (
                <LandingContentEditorSection
                  draft={draft}
                  defaultLogo={brandLogo}
                  onUpdateDraft={updateDraft}
                />
              ) : null}

              {activeTab === 'galeria' ? (
                <LandingGalleryFaqSection
                  draft={draft}
                  gallery={data.gallery}
                  activeServices={activeServices}
                  onUpdateDraft={updateDraft}
                  onRefresh={refresh}
                  onNotify={saveNotice.show}
                />
              ) : null}

              {activeTab === 'estilo' ? (
                <BookingAppearanceSection
                  draft={draft}
                  soundAlertsEnabled={soundAlertsEnabled}
                  colorReadability={colorReadability}
                  onUpdateDraft={updateDraft}
                  onModeChange={setMode}
                />
              ) : null}

              {activeTab === 'negocio' ? (
                <>
                  <BrandIdentitySection
                    draft={draft}
                    brandLogo={draft.logoUrl || brandLogo}
                    activeServiceMode={activeServiceMode}
                    onUpdateDraft={updateDraft}
                  />
                  <DepositSettingsSection
                    draft={draft}
                    isDepositEnabled={isDepositEnabled}
                    depositAmountCents={depositAmountCents}
                    depositBeneficiary={depositBeneficiary}
                    onUpdateDraft={updateDraft}
                  />
                  <LoyaltySettingsSection
                    loyaltyDraft={loyaltyDraft}
                    activeServices={activeServices}
                    currency={draft.currency}
                    onUpdateLoyaltyDraft={updateLoyaltyDraft}
                  />
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
                </>
              ) : null}
            </VStack>

            <VStack gap={4} className="ad-live-sticky">
              <BrandGallerySection
                draft={draft}
                activeServiceMode={activeServiceMode}
                isDepositEnabled={isDepositEnabled}
                depositAmountCents={depositAmountCents}
                depositBeneficiary={depositBeneficiary}
              />
              <QrShareCard appUrl={data.integration.appUrl} salonName={draft.name} />
            </VStack>
          </VStack>
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
          <HStack gap={2} align="center" wrap="wrap">
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
