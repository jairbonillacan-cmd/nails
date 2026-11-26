'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { Token } from '@astryxdesign/core/Token';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import {
  Award,
  ExternalLink,
  Palette,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Store,
  Wallet,
} from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import { AppearanceWireframePicker } from '@/components/admin/AppearanceWireframePicker';
import { ColorSwatchPicker } from '@/components/admin/ColorSwatchPicker';
import { QrShareCard } from '@/components/admin/QrShareCard';
import {
  AdminConfigChip,
  AdminConfigEmpty,
  AdminConfigKpiStrip,
  AdminConfigPageHeader,
  AdminConfigSection,
  AdminConfigSkeleton,
  type AdminConfigKpiItem,
} from '@/components/admin/config/AdminConfigPrimitives';
import { useSalonAppearance } from '@/components/SalonThemeProvider';
import { checkThemeAccentContrast } from '@/lib/contrast';
import { ACCENT_PRESETS } from '@/lib/theme-presets';
import {
  formatCurrency,
  formatDateShortInTimezone,
  formatTimeInTimezone,
} from '@/lib/format';
import type {
  AuditAction,
  CornerStyle,
  LoyaltyProgram,
  SalonSettings,
} from '@/lib/types';

type ActiveServiceMode = NonNullable<SalonSettings['serviceMode']>;

const DEFAULT_LOYALTY_PROGRAM: LoyaltyProgram = {
  id: 'loy-laikona-default',
  isActive: true,
  name: 'Tarjeta de Sellos LAIKONA',
  stampsRequired: 8,
  rewardType: 'percent_discount',
  rewardServiceId: null,
  discountPercent: 50,
  maxDiscountCents: 25000,
  validDays: 90,
};

const AUDIT_ACTION_META: Record<
  AuditAction,
  { label: string; tone: 'warning' | 'accent' | 'success' | 'neutral' }
> = {
  booking_canceled: { label: 'Cancelación', tone: 'warning' },
  booking_price_override: { label: 'Ajuste precio', tone: 'warning' },
  csv_exported: { label: 'Exportación CSV', tone: 'neutral' },
  past_booking_override: { label: 'Edición pasada', tone: 'warning' },
  deposit_approved: { label: 'Anticipo aprobado', tone: 'success' },
  loyalty_redeemed: { label: 'Premio canjeado', tone: 'accent' },
};

function serviceModeLabel(mode: ActiveServiceMode | undefined): string {
  if (mode === 'home') return 'A domicilio';
  if (mode === 'online') return 'Solo en línea';
  return 'En estudio';
}

function areSettingsEqual(a: SalonSettings, b: SalonSettings): boolean {
  return (
    a.name === b.name &&
    a.tagline === b.tagline &&
    a.address === b.address &&
    (a.city ?? '') === (b.city ?? '') &&
    a.mapsUrl === b.mapsUrl &&
    a.instagramHandle === b.instagramHandle &&
    (a.instagramUrl ?? '') === (b.instagramUrl ?? '') &&
    (a.sisterStudioHandle ?? '') === (b.sisterStudioHandle ?? '') &&
    a.whatsappNumber === b.whatsappNumber &&
    a.brandAccentLight === b.brandAccentLight &&
    a.brandAccentDark === b.brandAccentDark &&
    a.defaultPublicMode === b.defaultPublicMode &&
    a.cornerStyle === b.cornerStyle &&
    a.defaultBookingLayout === b.defaultBookingLayout &&
    Boolean(a.optimizeContinuousSlots) === Boolean(b.optimizeContinuousSlots) &&
    a.enableSlotHold === b.enableSlotHold &&
    a.slotHoldMinutes === b.slotHoldMinutes &&
    a.minBookingNoticeMinutes === b.minBookingNoticeMinutes &&
    a.minCancelHours === b.minCancelHours &&
    a.cancellationPolicyText === b.cancellationPolicyText &&
    a.paymentMode === b.paymentMode &&
    a.depositBankName === b.depositBankName &&
    (a.depositBeneficiary ?? a.depositAccountHolder) ===
      (b.depositBeneficiary ?? b.depositAccountHolder) &&
    a.depositClabe === b.depositClabe &&
    (a.depositAmountCents ?? 20000) === (b.depositAmountCents ?? 20000) &&
    a.depositInstructions === b.depositInstructions &&
    (a.serviceMode ?? 'studio') === (b.serviceMode ?? 'studio') &&
    (a.soundAlertsEnabled ?? true) === (b.soundAlertsEnabled ?? true) &&
    (a.lockPastBookings ?? true) === (b.lockPastBookings ?? true) &&
    (a.maxActiveBookingsPerClient ?? 3) === (b.maxActiveBookingsPerClient ?? 3) &&
    (a.privacyPolicyVersion ?? '2026-11') === (b.privacyPolicyVersion ?? '2026-11') &&
    a.landingContent.heroTitle === b.landingContent.heroTitle &&
    a.landingContent.heroSubtitle === b.landingContent.heroSubtitle
  );
}

function areLoyaltyProgramsEqual(a: LoyaltyProgram, b: LoyaltyProgram): boolean {
  return (
    a.isActive === b.isActive &&
    a.name === b.name &&
    a.stampsRequired === b.stampsRequired &&
    a.rewardType === b.rewardType &&
    a.rewardServiceId === b.rewardServiceId &&
    a.discountPercent === b.discountPercent &&
    a.maxDiscountCents === b.maxDiscountCents &&
    a.validDays === b.validDays
  );
}

export default function AdminBrandPage() {
  const { data, loading, refresh } = useAdminData();
  const { setSettingsOverride, setMode } = useSalonAppearance();
  const [draftOverride, setDraftOverride] = useState<SalonSettings | null>(null);
  const [loyaltyOverride, setLoyaltyOverride] = useState<LoyaltyProgram | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (loading || !data) {
    return <AdminConfigSkeleton kpiCount={4} withSplit />;
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
  const lockPastBookings = draft.lockPastBookings ?? true;
  const optimizeContinuousSlots = draft.optimizeContinuousSlots ?? false;
  const maxActiveBookingsPerClient = draft.maxActiveBookingsPerClient ?? 3;
  const privacyPolicyVersion = draft.privacyPolicyVersion ?? '2026-11';
  const activeServices = data.services.filter((s) => s.isActive);
  const isDepositEnabled = draft.paymentMode !== 'none';
  const isOwner = data.session.user.role === 'owner';

  const contrast = checkThemeAccentContrast({
    accentLight: draft.brandAccentLight,
    accentDark: draft.brandAccentDark,
  });
  const contrastBothPass = contrast.lightPassesAA && contrast.darkPassesAA;

  const isBrandDirty =
    !areSettingsEqual(draft, baseSettings) ||
    !areLoyaltyProgramsEqual(loyaltyDraft, baseLoyalty);

  const kpiItems: AdminConfigKpiItem[] = [
    {
      id: 'wcag-ratio',
      label: 'Contraste WCAG AA',
      value: `${contrast.lightRatio.toFixed(1)}:1`,
      sub: contrastBothPass
        ? `Oscuro ${contrast.darkRatio.toFixed(1)}:1 · Aprobado`
        : `Oscuro ${contrast.darkRatio.toFixed(1)}:1 · Revisar`,
      tone: contrastBothPass ? 'success' : 'warning',
    },
    {
      id: 'spei-deposit',
      label: 'Anticipo SPEI',
      value: isDepositEnabled
        ? formatCurrency(depositAmountCents, draft.currency)
        : 'Inactivo',
      sub: isDepositEnabled ? draft.depositBankName || 'Transferencia' : 'Reserva directa',
    },
    {
      id: 'loyalty-card',
      label: 'Tarjeta de sellos',
      value: loyaltyDraft.isActive ? `${loyaltyDraft.stampsRequired} sellos` : 'Pausada',
      sub: loyaltyDraft.isActive
        ? loyaltyDraft.rewardType === 'percent_discount'
          ? `${loyaltyDraft.discountPercent ?? 50}% de descuento`
          : 'Servicio gratis'
        : 'Programa desactivado',
    },
    {
      id: 'audit-count',
      label: 'Auditoría',
      value: String(data.recentAuditLogs.length),
      sub: isOwner ? 'Eventos registrados' : 'Visible solo para Dueña',
    },
  ];

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
    if (!isBrandDirty) return;
    setSaving(true);
    setErrorMsg(null);
    setSavedMsg(null);
    try {
      const res = await fetch('/api/admin/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...draft,
          depositBeneficiary,
          depositAccountHolder: depositBeneficiary,
          depositAmountCents,
          serviceMode: activeServiceMode,
          soundAlertsEnabled,
          lockPastBookings,
          optimizeContinuousSlots,
          maxActiveBookingsPerClient,
          privacyPolicyVersion: privacyPolicyVersion.trim() || '2026-11',
          loyaltyProgram: {
            id: loyaltyDraft.id,
            isActive: loyaltyDraft.isActive,
            name: loyaltyDraft.name.trim() || DEFAULT_LOYALTY_PROGRAM.name,
            stampsRequired: Math.max(3, Math.min(10, Math.round(loyaltyDraft.stampsRequired))),
            rewardType: loyaltyDraft.rewardType,
            rewardServiceId:
              loyaltyDraft.rewardType === 'free_service'
                ? (loyaltyDraft.rewardServiceId ?? activeServices[0]?.id ?? null)
                : null,
            discountPercent:
              loyaltyDraft.rewardType === 'percent_discount'
                ? Math.max(1, Math.min(100, Math.round(loyaltyDraft.discountPercent ?? 50)))
                : null,
            maxDiscountCents:
              loyaltyDraft.rewardType === 'percent_discount'
                ? loyaltyDraft.maxDiscountCents
                : null,
            validDays: loyaltyDraft.validDays,
          },
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setErrorMsg(json?.error || 'No se pudieron guardar los cambios de marca.');
        return;
      }
      setDraftOverride(null);
      setLoyaltyOverride(null);
      setSavedMsg('Marca, tarjeta de sellos, blindaje operativo y anticipo SPEI guardados.');
      await refresh();
    } catch {
      setErrorMsg('Error de conexión al guardar la configuración.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <VStack className="ad-page">
      <AdminConfigPageHeader
        eyebrow="Estudio e identidad"
        title="Página y marca"
        subtitle="Personaliza tu paleta con validador WCAG 2.1 AA en vivo, diseño de agenda, tarjeta digital de sellos, QR descargable y políticas del estudio."
        actions={
          isBrandDirty ? (
            <HStack gap={2} align="center" wrap="wrap">
              <AdminConfigChip
                label="Cambios sin guardar"
                tone="warning"
                className="fx-pop"
              />
              <Button
                type="button"
                label="Descartar"
                variant="ghost"
                size="sm"
                icon={<RotateCcw size={14} aria-hidden="true" />}
                onClick={discardChanges}
              />
              <Button
                type="button"
                label="Guardar cambios"
                variant="primary"
                icon={<Save size={15} aria-hidden="true" />}
                isLoading={saving}
                isDisabled={saving}
                onClick={() => void submitSave()}
              />
            </HStack>
          ) : (
            <AdminConfigChip label="Todo guardado" tone="success" />
          )
        }
      />

      <AdminConfigKpiStrip ariaLabel="Resumen de marca y políticas" items={kpiItems} cols={4} />

      {savedMsg ? (
        <Banner
          status="success"
          role="status"
          title={savedMsg}
          isDismissable
          onDismiss={() => setSavedMsg(null)}
        />
      ) : null}

      {errorMsg ? (
        <Banner
          status="error"
          role="alert"
          title={errorMsg}
          isDismissable
          onDismiss={() => setErrorMsg(null)}
        />
      ) : null}

      <VStack className="ad-config-grid" gap={5}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitSave();
          }}
        >
          <VStack gap={4}>
            <AdminConfigSection
              id="brand-identity-heading"
              icon={<Store size={16} aria-hidden="true" />}
              title="Identidad, Instagram y sede"
              subtitle="Datos visibles en tu portada, /reservar, /links y correos."
            >
              <VStack gap={3} className="ad-card-body" paddingBlockStart={4}>
                <TextInput
                  label="Nombre del salón"
                  value={draft.name}
                  onChange={(v) => updateDraft({ name: v })}
                  isRequired
                />
                <TextInput
                  label="Tagline / Subtítulo"
                  value={draft.tagline}
                  onChange={(v) => updateDraft({ tagline: v })}
                />
                <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
                  <TextInput
                    label="Instagram del salón"
                    placeholder="@laikona.nailsss"
                    value={draft.instagramHandle}
                    onChange={(v) => updateDraft({ instagramHandle: v })}
                  />
                  <TextInput
                    label="URL de Instagram"
                    placeholder="https://www.instagram.com/laikona.nailsss/"
                    value={draft.instagramUrl ?? ''}
                    onChange={(v) => updateDraft({ instagramUrl: v })}
                    isOptional
                  />
                </Grid>
                <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
                  <TextInput
                    label="Ciudad"
                    placeholder="Puebla, México"
                    value={draft.city ?? ''}
                    onChange={(v) => updateDraft({ city: v })}
                    isOptional
                  />
                  <Selector
                    label="Modalidad de atención"
                    value={activeServiceMode}
                    onChange={(v) =>
                      v && updateDraft({ serviceMode: v as ActiveServiceMode })
                    }
                    options={[
                      { value: 'studio', label: 'En mi estudio' },
                      { value: 'home', label: 'A domicilio' },
                      { value: 'online', label: 'Solo en línea' },
                    ]}
                  />
                </Grid>
                <TextInput
                  label="Dirección física"
                  value={draft.address}
                  onChange={(v) => updateDraft({ address: v })}
                />
                <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
                  <TextInput
                    label="WhatsApp del salón (+52...)"
                    value={draft.whatsappNumber}
                    onChange={(v) => updateDraft({ whatsappNumber: v })}
                  />
                  <TextInput
                    label="Link de Google Maps"
                    value={draft.mapsUrl}
                    onChange={(v) => updateDraft({ mapsUrl: v })}
                  />
                </Grid>
                <Switch
                  label="Sonido de alertas cuando lleguen nuevas citas en la agenda"
                  value={soundAlertsEnabled}
                  onChange={(v) => updateDraft({ soundAlertsEnabled: v })}
                />
              </VStack>
            </AdminConfigSection>

            <AdminConfigSection
              id="brand-theme-heading"
              icon={<Palette size={16} aria-hidden="true" />}
              title="Tema Astryx, contraste WCAG AA y apariencia"
              subtitle="Elige una paleta preajustada o define tonos propios validando lectura 2.1 AA en vivo."
            >
              <VStack gap={4} className="ad-card-body" paddingBlockStart={4}>
                <ColorSwatchPicker
                  presets={ACCENT_PRESETS}
                  selectedLight={draft.brandAccentLight}
                  selectedDark={draft.brandAccentDark}
                  onSelect={(preset) =>
                    updateDraft({
                      brandAccentLight: preset.light,
                      brandAccentDark: preset.dark,
                    })
                  }
                />

                <Grid columns={{ minWidth: 180, max: 2 }} gap={3}>
                  <VStack gap={2} className="ad-subpanel">
                    <HStack justify="between" align="center" gap={2}>
                      <HStack gap={1.5} align="center">
                        <Text
                          className="ad-swatch"
                          style={{ backgroundColor: draft.brandAccentLight }}
                          aria-hidden="true"
                        >
                          {'\u200B'}
                        </Text>
                        <Text weight="semibold" size="sm">
                          Modo claro
                        </Text>
                      </HStack>
                      <AdminConfigChip
                        tone={contrast.lightPassesAA ? 'success' : 'warning'}
                        label={
                          contrast.lightPassesAA
                            ? `${contrast.lightRatio.toFixed(2)}:1 · AA`
                            : `${contrast.lightRatio.toFixed(2)}:1 · Revisar`
                        }
                        hasTabularNumbers
                      />
                    </HStack>
                    <TextInput
                      label="Color acento (Modo Claro)"
                      isLabelHidden
                      size="sm"
                      value={draft.brandAccentLight}
                      onChange={(v) => updateDraft({ brandAccentLight: v })}
                    />
                  </VStack>

                  <VStack gap={2} className="ad-subpanel">
                    <HStack justify="between" align="center" gap={2}>
                      <HStack gap={1.5} align="center">
                        <Text
                          className="ad-swatch"
                          style={{ backgroundColor: draft.brandAccentDark }}
                          aria-hidden="true"
                        >
                          {'\u200B'}
                        </Text>
                        <Text weight="semibold" size="sm">
                          Modo oscuro
                        </Text>
                      </HStack>
                      <AdminConfigChip
                        tone={contrast.darkPassesAA ? 'success' : 'warning'}
                        label={
                          contrast.darkPassesAA
                            ? `${contrast.darkRatio.toFixed(2)}:1 · AA`
                            : `${contrast.darkRatio.toFixed(2)}:1 · Revisar`
                        }
                        hasTabularNumbers
                      />
                    </HStack>
                    <TextInput
                      label="Color acento (Modo Oscuro)"
                      isLabelHidden
                      size="sm"
                      value={draft.brandAccentDark}
                      onChange={(v) => updateDraft({ brandAccentDark: v })}
                    />
                  </VStack>
                </Grid>

                {contrast.lightWarning ? (
                  <Banner
                    status="warning"
                    title="Contraste insuficiente en modo claro"
                    description={contrast.lightWarning}
                  />
                ) : null}

                {contrast.darkWarning ? (
                  <Banner
                    status="warning"
                    title="Contraste insuficiente en modo oscuro"
                    description={contrast.darkWarning}
                  />
                ) : null}

                <Divider />

                <AppearanceWireframePicker
                  publicMode={draft.defaultPublicMode}
                  onPublicModeChange={(nextMode) => {
                    updateDraft({ defaultPublicMode: nextMode });
                    setMode(nextMode);
                  }}
                  bookingLayout={draft.defaultBookingLayout}
                  onBookingLayoutChange={(nextLayout) =>
                    updateDraft({ defaultBookingLayout: nextLayout })
                  }
                />

                <Selector
                  label="Estilo de esquinas"
                  value={draft.cornerStyle}
                  onChange={(v) => v && updateDraft({ cornerStyle: v as CornerStyle })}
                  options={[
                    { value: 'sharp', label: 'Rectas' },
                    { value: 'soft', label: 'Editorial (Suaves)' },
                    { value: 'rounded', label: 'Redondeadas' },
                    { value: 'pill', label: 'Píldora' },
                  ]}
                />
              </VStack>
            </AdminConfigSection>

            <AdminConfigSection
              id="brand-loyalty-heading"
              icon={<Award size={16} aria-hidden="true" />}
              title="Tarjeta Digital de Sellos"
              subtitle="Suma 1 sello automático por día al cobrar citas; visible en /cita/[token] sin app."
              actions={
                <Switch
                  label="Activar programa de sellos"
                  isLabelHidden
                  value={loyaltyDraft.isActive}
                  onChange={(v) => updateLoyaltyDraft({ isActive: v })}
                />
              }
            >
              {loyaltyDraft.isActive ? (
                <VStack gap={3} className="ad-card-body" paddingBlockStart={4}>
                  <TextInput
                    label="Nombre de la tarjeta"
                    value={loyaltyDraft.name}
                    onChange={(v) => updateLoyaltyDraft({ name: v })}
                    placeholder="Tarjeta de Sellos LAIKONA"
                  />
                  <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
                    <NumberInput
                      label="Sellos requeridos (3–10)"
                      value={loyaltyDraft.stampsRequired}
                      min={3}
                      max={10}
                      isIntegerOnly
                      onChange={(v) => updateLoyaltyDraft({ stampsRequired: v })}
                    />
                    <Selector
                      label="Tipo de recompensa"
                      value={loyaltyDraft.rewardType}
                      onChange={(v) => {
                        if (v === 'free_service' || v === 'percent_discount') {
                          updateLoyaltyDraft({ rewardType: v });
                        }
                      }}
                      options={[
                        { value: 'percent_discount', label: '% de descuento' },
                        { value: 'free_service', label: 'Servicio gratis' },
                      ]}
                    />
                  </Grid>

                  {loyaltyDraft.rewardType === 'percent_discount' ? (
                    <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
                      <NumberInput
                        label="Descuento (%)"
                        value={loyaltyDraft.discountPercent ?? 50}
                        min={1}
                        max={100}
                        units="%"
                        isIntegerOnly
                        onChange={(v) => updateLoyaltyDraft({ discountPercent: v })}
                      />
                      <NumberInput
                        label="Tope máximo (MXN)"
                        value={
                          loyaltyDraft.maxDiscountCents !== null
                            ? Math.round(loyaltyDraft.maxDiscountCents / 100)
                            : 250
                        }
                        min={0}
                        units="MXN"
                        isIntegerOnly
                        onChange={(v) =>
                          updateLoyaltyDraft({
                            maxDiscountCents: Math.max(0, Math.round(v * 100)),
                          })
                        }
                      />
                    </Grid>
                  ) : (
                    <Selector
                      label="Servicio incluido en el premio"
                      value={loyaltyDraft.rewardServiceId ?? activeServices[0]?.id ?? ''}
                      onChange={(v) => updateLoyaltyDraft({ rewardServiceId: v || null })}
                      options={activeServices.map((srv) => ({
                        value: srv.id,
                        label: `${srv.name} (${formatCurrency(srv.priceCents, draft.currency)})`,
                      }))}
                    />
                  )}
                </VStack>
              ) : (
                <VStack className="ad-card-body" paddingBlockStart={4}>
                  <Text type="supporting" color="secondary">
                    Activa el interruptor superior para ofrecer recompensas automáticas por visitas frecuentes.
                  </Text>
                </VStack>
              )}
            </AdminConfigSection>

            <AdminConfigSection
              id="brand-spei-heading"
              icon={<Wallet size={16} aria-hidden="true" />}
              title="Anticipo SPEI y políticas de portada"
              subtitle="Solicita transferencia de apartado y comprobante web o por Instagram DM."
              actions={
                <Switch
                  label="Activar anticipo SPEI"
                  isLabelHidden
                  value={isDepositEnabled}
                  onChange={(enabled) =>
                    updateDraft({
                      paymentMode: enabled ? 'manual_transfer' : 'none',
                    })
                  }
                />
              }
            >
              <VStack gap={3} className="ad-card-body" paddingBlockStart={4}>
                {isDepositEnabled ? (
                  <VStack gap={3}>
                    <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
                      <NumberInput
                        label="Monto de anticipo (MXN)"
                        value={Math.round(depositAmountCents / 100)}
                        min={0}
                        onChange={(v) =>
                          updateDraft({ depositAmountCents: Math.max(0, Math.round(v * 100)) })
                        }
                      />
                      <TextInput
                        label="Banco"
                        placeholder="Mercado Pago"
                        value={draft.depositBankName}
                        onChange={(v) => updateDraft({ depositBankName: v })}
                      />
                    </Grid>
                    <TextInput
                      label="Titular / Beneficiario"
                      placeholder="Karla Patricia Carrillo Rodríguez"
                      value={depositBeneficiary}
                      onChange={(v) =>
                        updateDraft({ depositBeneficiary: v, depositAccountHolder: v })
                      }
                    />
                    <TextInput
                      label="Cuenta CLABE"
                      placeholder="7229 6901 3959 779869"
                      value={draft.depositClabe}
                      onChange={(v) => updateDraft({ depositClabe: v })}
                    />
                    <TextArea
                      label="Instrucciones de anticipo"
                      value={draft.depositInstructions}
                      onChange={(v) => updateDraft({ depositInstructions: v })}
                      rows={2}
                    />
                  </VStack>
                ) : (
                  <Text type="supporting" color="secondary">
                    Sin anticipo obligatorio: las clientas reservan sin comprobante bancario.
                  </Text>
                )}

                <Divider />

                <Collapsible
                  defaultIsOpen={false}
                  trigger={
                    <HStack gap={2} align="center">
                      <SlidersHorizontal size={14} aria-hidden="true" />
                      <Text weight="semibold" size="sm">
                        Textos de portada, cancelación y tiempos de reserva
                      </Text>
                    </HStack>
                  }
                >
                  <VStack gap={3} paddingBlockStart={3}>
                    <TextInput
                      label="Titular principal (Hero)"
                      value={draft.landingContent.heroTitle}
                      onChange={(v) =>
                        updateDraft({
                          landingContent: { ...draft.landingContent, heroTitle: v },
                        })
                      }
                    />
                    <TextArea
                      label="Subtítulo del Hero"
                      value={draft.landingContent.heroSubtitle}
                      onChange={(v) =>
                        updateDraft({
                          landingContent: { ...draft.landingContent, heroSubtitle: v },
                        })
                      }
                      rows={2}
                    />
                    <TextArea
                      label="Política de cancelación"
                      value={draft.cancellationPolicyText}
                      onChange={(v) => updateDraft({ cancellationPolicyText: v })}
                      rows={2}
                    />
                    <Grid columns={{ minWidth: 110, max: 3 }} gap={2}>
                      <NumberInput
                        label="Aviso mín. (min)"
                        value={draft.minBookingNoticeMinutes}
                        min={0}
                        onChange={(v) => updateDraft({ minBookingNoticeMinutes: v })}
                      />
                      <NumberInput
                        label="Cancelar (hrs)"
                        value={draft.minCancelHours}
                        min={0}
                        onChange={(v) => updateDraft({ minCancelHours: v })}
                      />
                      <NumberInput
                        label="Apartado (min)"
                        value={draft.slotHoldMinutes}
                        min={1}
                        max={15}
                        onChange={(v) => updateDraft({ slotHoldMinutes: v })}
                      />
                    </Grid>
                    <Switch
                      label="Activar bloqueo temporal (slot hold) mientras la clienta llena sus datos"
                      value={draft.enableSlotHold}
                      onChange={(v) => updateDraft({ enableSlotHold: v })}
                    />
                  </VStack>
                </Collapsible>
              </VStack>
            </AdminConfigSection>

            <AdminConfigSection
              id="brand-security-heading"
              icon={<ShieldCheck size={16} aria-hidden="true" />}
              title="Blindaje operativo y privacidad (LFPDPPP)"
              subtitle="Controles anti-fraude, límites de reservas y aviso de privacidad vigente."
            >
              <VStack gap={3} className="ad-card-body" paddingBlockStart={4}>
                <Switch
                  label="Bloquear edición o cancelación de citas pasadas"
                  description="Evita modificaciones retroactivas de recepcionistas o especialistas; solo la Dueña puede sobreescribir dejando registro en bitácora."
                  value={lockPastBookings}
                  onChange={(v) => updateDraft({ lockPastBookings: v })}
                />
                <Switch
                  label="Optimizar franjas en modo Rango continuo"
                  description="Ancla horarios al fin real de citas existentes sin alterar turnos fijos."
                  value={optimizeContinuousSlots}
                  onChange={(v) => updateDraft({ optimizeContinuousSlots: v })}
                />
                <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
                  <NumberInput
                    label="Máx. citas activas por clienta (1–10)"
                    value={maxActiveBookingsPerClient}
                    min={1}
                    max={10}
                    isIntegerOnly
                    onChange={(v) => updateDraft({ maxActiveBookingsPerClient: v })}
                  />
                  <TextInput
                    label="Versión Aviso de Privacidad"
                    value={privacyPolicyVersion}
                    onChange={(v) => updateDraft({ privacyPolicyVersion: v })}
                    placeholder="2026-11"
                  />
                </Grid>
                <HStack justify="between" align="center" wrap="wrap" gap={2}>
                  <Text type="supporting" color="secondary">
                    Las clientas aceptan tu aviso vigente antes de confirmar en /reservar.
                  </Text>
                  <Button
                    label="Ver Aviso de Privacidad"
                    variant="secondary"
                    size="sm"
                    icon={<ExternalLink size={14} aria-hidden="true" />}
                    href="/aviso-de-privacidad"
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                </HStack>
              </VStack>
            </AdminConfigSection>
          </VStack>
        </form>

        <VStack gap={4}>
          <AdminConfigSection
            tone="subtle"
            padded
            icon={<Sparkles size={16} aria-hidden="true" />}
            title="Vista previa en vivo"
            subtitle="Tu identidad se actualiza al instante mientras editas."
            badge={<StatusDot variant="success" label="Aplicando tema en vivo" isPulsing />}
          >
            <VStack className="ad-surface fx-card-lift" data-padded="true" gap={3}>
              <HStack justify="between" align="center" wrap="wrap" gap={2}>
                <VStack gap={0}>
                  <Text weight="bold">{draft.name}</Text>
                  <Text type="supporting" color="secondary">
                    {draft.city || 'Puebla, México'}
                  </Text>
                </VStack>
                <Button label="Agendar cita" variant="primary" size="sm" href="/reservar" />
              </HStack>
              <Divider />
              <VStack gap={1.5}>
                <HStack gap={1.5} wrap="wrap">
                  <Token size="sm" label={draft.landingContent.heroEyebrow} />
                  <AdminConfigChip
                    tone="neutral"
                    label={serviceModeLabel(activeServiceMode)}
                  />
                </HStack>
                <Heading level={3} className="lk-serif ad-h2">
                  {draft.landingContent.heroTitle}
                </Heading>
                <Text type="supporting" color="secondary">
                  {draft.landingContent.heroSubtitle}
                </Text>
              </VStack>
              <HStack gap={2} wrap="wrap">
                <Button label="Agendar ahora" variant="primary" size="sm" href="/reservar" />
                <Button label="Ver servicios" variant="secondary" size="sm" href="/" />
              </HStack>
              {isDepositEnabled ? (
                <VStack className="ad-subpanel" gap={1.5}>
                  <HStack justify="between" align="center" wrap="wrap" gap={2}>
                    <Text type="label" color="accent" weight="semibold" hasTabularNumbers>
                      ANTICIPO SPEI ({formatCurrency(depositAmountCents, draft.currency)})
                    </Text>
                    <AdminConfigChip
                      tone="neutral"
                      label={draft.depositBankName || 'Mercado Pago'}
                    />
                  </HStack>
                  <Text type="supporting">Titular: {depositBeneficiary}</Text>
                  <Text className="ad-code-pill">CLABE: {draft.depositClabe}</Text>
                </VStack>
              ) : null}
              <Text type="supporting" color="secondary">
                {draft.address} · {draft.instagramHandle}
              </Text>
            </VStack>
          </AdminConfigSection>

          <QrShareCard appUrl={data.integration.appUrl} salonName={draft.name} />

          {isOwner ? (
            <AdminConfigSection
              id="brand-audit-heading"
              icon={<ShieldCheck size={16} aria-hidden="true" />}
              title="Bitácora de auditoría"
              subtitle="Cancelaciones, ajustes de precio, anticipos, canjes de sellos y exportaciones CSV (solo Dueña)."
              badge={
                <AdminConfigChip
                  label={String(data.recentAuditLogs.length)}
                  tone="neutral"
                  hasTabularNumbers
                />
              }
            >
              {data.recentAuditLogs.length === 0 ? (
                <AdminConfigEmpty
                  icon={<ShieldCheck size={22} aria-hidden="true" />}
                  title="Sin eventos registrados todavía"
                  description="Cada operación sensible quedará auditada aquí automáticamente con fecha y usuario."
                />
              ) : (
                <VStack as="ul" className="ad-row-list" gap={0}>
                  {data.recentAuditLogs.slice(0, 12).map((entry) => {
                    const meta = AUDIT_ACTION_META[entry.action];
                    return (
                      <li key={entry.id} className="ad-row-item">
                        <VStack gap={0.5} className="rb-grow">
                          <Text weight="semibold" size="sm">
                            {meta.label} · {entry.entityType} ({entry.entityId})
                          </Text>
                          <Text type="supporting" color="secondary" hasTabularNumbers>
                            {entry.actorEmail} ({entry.actorRole}) ·{' '}
                            {formatDateShortInTimezone(entry.createdAt, tz)}{' '}
                            {formatTimeInTimezone(entry.createdAt, tz)}
                          </Text>
                        </VStack>
                        <AdminConfigChip label={meta.label} tone={meta.tone} />
                      </li>
                    );
                  })}
                </VStack>
              )}
            </AdminConfigSection>
          ) : null}
        </VStack>
      </VStack>

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
            <AdminConfigChip label="Sin guardar" tone="warning" />
            <Text size="sm" weight="medium">
              Tienes cambios pendientes en tu marca, sellos o políticas.
            </Text>
          </HStack>
          <HStack gap={2} align="center" wrap="wrap">
            <Button
              type="button"
              label="Descartar"
              variant="ghost"
              size="sm"
              icon={<RotateCcw size={14} aria-hidden="true" />}
              onClick={discardChanges}
            />
            <Button
              type="button"
              label="Guardar cambios"
              variant="primary"
              size="sm"
              icon={<Save size={14} aria-hidden="true" />}
              isLoading={saving}
              onClick={() => void submitSave()}
            />
          </HStack>
        </HStack>
      ) : null}
    </VStack>
  );
}
