'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import {
  Check,
  Gift,
  Images,
  LayoutTemplate,
  Palette,
  RotateCcw,
  Save,
  SlidersHorizontal,
} from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import { AdminAccessGuard } from '@/components/admin/AdminAccessGuard';
import {
  FilterPillBar,
  PageHeader,
  PageSkeleton,
  SkeletonBlock,
  StatusTag,
  SurfaceCard,
} from '@/components/ui';
import { BrandIdentitySection } from '@/components/admin/marca/BrandIdentitySection';
import { BrandGallerySection } from '@/components/admin/marca/BrandGallerySection';
import { LandingContentEditorSection } from '@/components/admin/marca/LandingContentEditorSection';
import {
  areSettingsEqual,
  buildBrandPatchPayload,
  DEFAULT_LOYALTY_PROGRAM,
} from '@/components/admin/marca/brandFormUtils';
import { LANDING_ASSETS } from '@/components/landing/landingContent';
import { useSalonAppearance } from '@/components/SalonThemeProvider';
import {
  ajustesHref,
  fidelizacionHref,
  marcaHref,
  parseMarcaParams,
  type MarcaLinkParams,
} from '@/lib/admin-links';
import { checkThemeAccentContrast } from '@/lib/contrast';
import { invalidateAdminDomain } from '@/lib/hooks/useAdminCache';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import { fetchJsonWithTimeout } from '@/lib/http/client-fetch';
import { roleCanAccess } from '@/lib/rbac';
import type { SalonSettings } from '@/lib/types';

const LandingGalleryFaqSection = dynamic(
  () =>
    import('@/components/admin/marca/LandingGalleryFaqSection').then(
      (mod) => mod.LandingGalleryFaqSection,
    ),
  {
    ssr: false,
    loading: () => <SkeletonBlock width="100%" height="24rem" radius={3} />,
  },
);

const BookingAppearanceSection = dynamic(
  () =>
    import('@/components/admin/marca/BookingAppearanceSection').then(
      (mod) => mod.BookingAppearanceSection,
    ),
  {
    ssr: false,
    loading: () => <SkeletonBlock width="100%" height="20rem" radius={3} />,
  },
);

const EmbedGeneratorCard = dynamic(
  () =>
    import('@/components/admin/config/EmbedGeneratorCard').then(
      (mod) => mod.EmbedGeneratorCard,
    ),
  {
    ssr: false,
    loading: () => <SkeletonBlock width="100%" height="12rem" radius={3} />,
  },
);

const QrShareCard = dynamic(
  () => import('@/components/admin/QrShareCard').then((mod) => mod.QrShareCard),
  {
    ssr: false,
    loading: () => <SkeletonBlock width="100%" height="16rem" radius={3} />,
  },
);

type ActiveServiceMode = NonNullable<SalonSettings['serviceMode']>;
type BrandEditorTab = 'portada' | 'galeria' | 'estilo';

function resolveLegacyMarcaRedirect(params: MarcaLinkParams): string | null {
  const tab = params.tab?.toLowerCase();
  const focus = params.focus?.toLowerCase();
  if (
    tab === 'cobro' ||
    tab === 'cobros' ||
    tab === 'clabe' ||
    tab === 'pagos' ||
    tab === 'anticipo' ||
    focus === 'clabe' ||
    focus === 'cobro'
  ) {
    return ajustesHref({ tab: 'cobro', focus: params.focus });
  }
  if (
    tab === 'politicas' ||
    tab === 'políticas' ||
    tab === 'datos' ||
    tab === 'reservas' ||
    tab === 'negocio' ||
    focus === 'noshow' ||
    focus === 'politicas'
  ) {
    return ajustesHref({ tab: 'politicas', focus: params.focus });
  }
  if (
    tab === 'seguridad' ||
    tab === 'pin' ||
    tab === 'auditoria' ||
    focus === 'pin'
  ) {
    return ajustesHref({ tab: 'seguridad', focus: params.focus });
  }
  if (
    tab === 'sellos' ||
    tab === 'fidelizacion' ||
    tab === 'lealtad' ||
    focus === 'sellos'
  ) {
    return fidelizacionHref({ tab: 'sellos' });
  }
  return null;
}

function resolvePublicBrandTab(tab: string | undefined): BrandEditorTab {
  const cleaned = tab?.toLowerCase();
  if (cleaned === 'galeria') return 'galeria';
  if (cleaned === 'estilo') return 'estilo';
  return 'portada';
}

export default function AdminBrandPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const parsedParams = parseMarcaParams(searchParams);
  const legacyRedirectHref = resolveLegacyMarcaRedirect(parsedParams);
  const { data, loading, refresh } = useAdminData();
  const { mode, setSettingsOverride } = useSalonAppearance();

  const urlTab = parsedParams.tab ?? '';
  const [prevUrlTab, setPrevUrlTab] = useState(urlTab);
  const [activeTab, setActiveTab] = useState<BrandEditorTab>(() =>
    resolvePublicBrandTab(parsedParams.tab),
  );
  if (prevUrlTab !== urlTab) {
    setPrevUrlTab(urlTab);
    if (!legacyRedirectHref && parsedParams.tab) {
      setActiveTab(resolvePublicBrandTab(parsedParams.tab));
    }
  }

  useExternalSync(`marca-redirect|${legacyRedirectHref ?? ''}`, async (signal) => {
    if (signal.aborted || !legacyRedirectHref) return;
    router.replace(legacyRedirectHref);
  });

  const [draftOverride, setDraftOverride] = useState<SalonSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const saveNotice = useEphemeralMessage(3500);

  if (legacyRedirectHref || loading || !data) {
    return (
      <PageSkeleton
        kpiCount={0}
        withSplit
        ariaLabel={
          legacyRedirectHref
            ? 'Abriendo la sección correspondiente'
            : 'Cargando configuración de página y marca'
        }
      />
    );
  }

  const baseSettings = data.settings;
  const baseLoyalty = data.loyaltyProgram ?? DEFAULT_LOYALTY_PROGRAM;
  const draft = draftOverride ?? baseSettings;
  const depositAmountCents = draft.depositAmountCents ?? 0;
  const depositBeneficiary = draft.depositBeneficiary ?? draft.depositAccountHolder;
  const activeServiceMode: ActiveServiceMode = draft.serviceMode ?? 'studio';
  const soundAlertsEnabled = draft.soundAlertsEnabled ?? true;
  const hasOwnerPin = Boolean(baseSettings.hasOwnerPin);
  const activeServices = data.services.filter((s) => s.isActive);
  const isDepositEnabled = draft.paymentMode !== 'none';
  const canAccessSettings = roleCanAccess(data.session.user.role, 'settings');
  const canAccessLoyalty = roleCanAccess(data.session.user.role, 'loyalty');
  const brandLogo = mode === 'dark' ? LANDING_ASSETS.logoWhite : LANDING_ASSETS.logoBlack;

  const colorReadability = checkThemeAccentContrast({
    accentLight: draft.brandAccentLight,
    accentDark: draft.brandAccentDark,
  });

  const isBrandDirty = !areSettingsEqual(draft, baseSettings);

  const updateDraft = (patch: Partial<SalonSettings>) => {
    const next = { ...draft, ...patch };
    setDraftOverride(next);
    setSettingsOverride(next);
  };

  const discardChanges = () => {
    setDraftOverride(null);
    setSettingsOverride(baseSettings);
    setErrorMsg(null);
  };

  const submitSave = async () => {
    if (!isBrandDirty || saving) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const result = await fetchJsonWithTimeout('/api/admin/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          buildBrandPatchPayload({
            draft,
            loyaltyDraft: baseLoyalty,
            activeServices,
            hasOwnerPin,
          }),
        ),
      });
      if (!result.ok) {
        setErrorMsg(result.error || 'No se pudieron guardar los cambios.');
        return;
      }
      invalidateAdminDomain('settings');
      await refresh();
      setDraftOverride(null);
      saveNotice.show('Cambios guardados');
    } finally {
      setSaving(false);
    }
  };

  const handleChangeTab = (nextTab: BrandEditorTab) => {
    setActiveTab(nextTab);
    router.replace(marcaHref({ tab: nextTab === 'portada' ? undefined : nextTab }), {
      scroll: false,
    });
  };

  return (
    <AdminAccessGuard role={data.session.user.role} section="brand" sectionLabel="Mi página">
      <VStack className="ad-page">
        <PageHeader
          title="Mi página"
          subtitle="Tu escaparate público: portada, identidad, galería, colores y QR."
          meta={
            saving ? (
              <Text className="fx-save-pill" data-state="saving" role="status" aria-live="polite">
                Guardando…
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
                  label={saving ? 'Guardando…' : 'Guardar cambios'}
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

        <FilterPillBar<BrandEditorTab>
          ariaLabel="Secciones del editor de Mi página"
          className="ad-scroll-row"
          value={activeTab}
          onChange={handleChangeTab}
          options={[
            {
              value: 'portada',
              label: 'Portada e identidad',
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
              label: 'Colores, estilo y web',
              icon: <Palette size={14} aria-hidden="true" />,
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
                  <>
                    <LandingContentEditorSection
                      draft={draft}
                      defaultLogo={brandLogo}
                      onUpdateDraft={updateDraft}
                    />
                    <BrandIdentitySection
                      draft={draft}
                      brandLogo={draft.logoUrl || brandLogo}
                      activeServiceMode={activeServiceMode}
                      onUpdateDraft={updateDraft}
                    />
                  </>
                ) : null}

                {activeTab === 'galeria' ? (
                  <LandingGalleryFaqSection
                    draft={draft}
                    gallery={data.gallery}
                    activeServices={activeServices}
                    onUpdateDraft={updateDraft}
                    onRefresh={async () => {
                      invalidateAdminDomain('settings');
                      await refresh();
                    }}
                    onNotify={saveNotice.show}
                  />
                ) : null}

                {activeTab === 'estilo' ? (
                  <>
                    <BookingAppearanceSection
                      draft={draft}
                      soundAlertsEnabled={soundAlertsEnabled}
                      colorReadability={colorReadability}
                      onUpdateDraft={updateDraft}
                    />
                    <EmbedGeneratorCard
                      appUrl={data.integration.appUrl}
                      salonName={draft.name}
                      accentColor={draft.brandAccentLight}
                      services={data.services}
                      staff={data.staff}
                    />
                  </>
                ) : null}

                {canAccessSettings || canAccessLoyalty ? (
                  <SurfaceCard padded>
                    <HStack justify="between" align="center" wrap="wrap" gap={3}>
                      <VStack gap={0.5} className="rb-grow">
                        <Text weight="semibold" size="sm">
                          ¿Buscas cobros, políticas o tarjeta de sellos?
                        </Text>
                        <Text type="supporting" color="secondary">
                          Ahora tienen su propio espacio para mantener tu página pública más ordenada.
                        </Text>
                      </VStack>
                      <HStack gap={2} wrap="wrap">
                        {canAccessSettings ? (
                          <Button
                            label="Ajustes del salón"
                            variant="secondary"
                            size="sm"
                            icon={<SlidersHorizontal size={14} aria-hidden="true" />}
                            href={ajustesHref()}
                          />
                        ) : null}
                        {canAccessLoyalty ? (
                          <Button
                            label="Fidelización"
                            variant="ghost"
                            size="sm"
                            icon={<Gift size={14} aria-hidden="true" />}
                            href={fidelizacionHref({ tab: 'sellos' })}
                          />
                        ) : null}
                      </HStack>
                    </HStack>
                  </SurfaceCard>
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
                label={saving ? 'Guardando…' : 'Guardar cambios'}
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
    </AdminAccessGuard>
  );
}
