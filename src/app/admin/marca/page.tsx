'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
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
  AlertTriangle,
  Award,
  Check,
  ExternalLink,
  History,
  KeyRound,
  Palette,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Store,
  Trash2,
  Wallet,
} from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import { AppearanceWireframePicker } from '@/components/admin/AppearanceWireframePicker';
import { ColorSwatchPicker } from '@/components/admin/ColorSwatchPicker';
import { LANDING_ASSETS } from '@/components/landing/landingContent';
import {
  AdminConfigChip,
  AdminConfigEmpty,
  AdminConfigPageHeader,
  AdminConfigSection,
  AdminConfigSkeleton,
} from '@/components/admin/config/AdminConfigPrimitives';
import { useSalonAppearance } from '@/components/SalonThemeProvider';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import { checkThemeAccentContrast } from '@/lib/contrast';
import { ACCENT_PRESETS } from '@/lib/theme-presets';
import {
  formatCurrency,
  formatDateShortInTimezone,
  formatTimeInTimezone,
} from '@/lib/format';
import type {
  AdminRole,
  AuditAction,
  CornerStyle,
  LoyaltyProgram,
  SalonSettings,
} from '@/lib/types';

const QrShareCard = dynamic(
  () => import('@/components/admin/QrShareCard').then((mod) => mod.QrShareCard),
  {
    ssr: false,
    loading: () => <VStack className="ad-skeleton" data-size="card" aria-hidden="true" />,
  },
);

const EmbedGeneratorCard = dynamic(
  () =>
    import('@/components/admin/config/EmbedGeneratorCard').then(
      (mod) => mod.EmbedGeneratorCard,
    ),
  {
    ssr: false,
    loading: () => <VStack className="ad-skeleton" data-size="card" aria-hidden="true" />,
  },
);

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

const ROLE_LABELS: Record<AdminRole, string> = {
  owner: 'Dueña',
  admin: 'Recepción',
  specialist: 'Manicurista',
};

const HISTORY_ACTION_META: Record<
  AuditAction,
  { label: string; tone: 'warning' | 'accent' | 'success' | 'neutral' }
> = {
  booking_canceled: { label: 'Cita cancelada', tone: 'warning' },
  booking_price_override: { label: 'Precio ajustado', tone: 'warning' },
  csv_exported: { label: 'Reporte descargado', tone: 'neutral' },
  past_booking_override: { label: 'Cita pasada editada', tone: 'warning' },
  deposit_approved: { label: 'Anticipo aprobado', tone: 'success' },
  loyalty_redeemed: { label: 'Premio canjeado', tone: 'accent' },
  media_retention_warned: { label: 'Aviso de respaldo de fotos', tone: 'warning' },
  media_retention_purged: { label: 'Fotos antiguas eliminadas', tone: 'neutral' },
};

function friendlyEntityLabel(entityType: string): string {
  const lower = entityType.toLowerCase();
  if (lower === 'booking') return 'Cita';
  if (lower === 'client') return 'Clienta';
  if (lower === 'report' || lower === 'cash') return 'Reporte';
  if (lower === 'settings') return 'Ajustes';
  if (lower === 'loyalty') return 'Sellos';
  if (lower === 'media_asset') return 'Comprobante o foto';
  return 'Registro';
}

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
    (a.noShowDepositThreshold ?? 2) === (b.noShowDepositThreshold ?? 2) &&
    Boolean(a.ownerPinEnabled) === Boolean(b.ownerPinEnabled) &&
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
  const { mode, setSettingsOverride, setMode } = useSalonAppearance();
  const [draftOverride, setDraftOverride] = useState<SalonSettings | null>(null);
  const [loyaltyOverride, setLoyaltyOverride] = useState<LoyaltyProgram | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const saveNotice = useEphemeralMessage(3500);

  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  const [pinSuccessMsg, setPinSuccessMsg] = useState<string | null>(null);
  const [pinErrorMsg, setPinErrorMsg] = useState<string | null>(null);

  if (loading || !data) {
    return <AdminConfigSkeleton kpiCount={0} withSplit />;
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
          noShowDepositThreshold: Math.max(1, Math.min(5, Math.round(noShowDepositThreshold))),
          ownerPinEnabled: hasOwnerPin ? ownerPinEnabled : false,
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

  const handleSaveOwnerPin = async () => {
    if (pinSaving) return;
    setPinErrorMsg(null);
    setPinSuccessMsg(null);
    if (!/^\d{4,6}$/.test(newPin)) {
      setPinErrorMsg('El PIN debe tener entre 4 y 6 números.');
      return;
    }
    if (newPin !== confirmPin) {
      setPinErrorMsg('Los dos PIN no coinciden.');
      return;
    }
    setPinSaving(true);
    try {
      const res = await fetch('/api/admin/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerPin: newPin,
          ownerPinEnabled: true,
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setPinErrorMsg(json?.error || 'No se pudo guardar el PIN de dueña.');
        return;
      }
      await refresh();
      setNewPin('');
      setConfirmPin('');
      setDraftOverride((prev) => (prev ? { ...prev, ownerPinEnabled: true } : null));
      setPinSuccessMsg(
        hasOwnerPin
          ? 'PIN de dueña actualizado y activado.'
          : 'PIN de dueña creado y activado.',
      );
      saveNotice.show('PIN guardado');
    } catch {
      setPinErrorMsg('Error de conexión al guardar el PIN.');
    } finally {
      setPinSaving(false);
    }
  };

  const handleClearOwnerPin = async () => {
    if (pinSaving) return;
    setPinErrorMsg(null);
    setPinSuccessMsg(null);
    setPinSaving(true);
    try {
      const res = await fetch('/api/admin/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clearOwnerPin: true,
          ownerPinEnabled: false,
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setPinErrorMsg(json?.error || 'No se pudo borrar el PIN.');
        return;
      }
      await refresh();
      setNewPin('');
      setConfirmPin('');
      setDraftOverride((prev) => (prev ? { ...prev, ownerPinEnabled: false } : null));
      setPinSuccessMsg('PIN de dueña borrado y desactivado.');
      saveNotice.show('PIN borrado');
    } catch {
      setPinErrorMsg('Error de conexión al borrar el PIN.');
    } finally {
      setPinSaving(false);
    }
  };

  const handleToggleOwnerPin = (nextEnabled: boolean) => {
    setPinErrorMsg(null);
    setPinSuccessMsg(null);
    if (nextEnabled && !hasOwnerPin) {
      setPinErrorMsg('Primero crea un PIN de 4 a 6 números y pulsa "Guardar PIN".');
      return;
    }
    updateDraft({ ownerPinEnabled: nextEnabled });
  };

  return (
    <VStack className="ad-page">
      <AdminConfigPageHeader
        eyebrow="Tu salón en internet"
        title="Mi página"
        subtitle="Personaliza el nombre, logo y color de tu salón, descarga tu QR y ajusta tu tarjeta de sellos."
        meta={
          saving || pinSaving ? (
            <Text className="fx-save-pill" data-state="saving" role="status" aria-live="polite">
              Guardando...
            </Text>
          ) : saveNotice.message ? (
            <Text className="fx-save-pill" data-state="saved" role="status" aria-live="polite">
              <Check size={12} aria-hidden="true" />
              {saveNotice.message}
            </Text>
          ) : null
        }
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
            <AdminConfigChip label="Todo guardado" tone="success" />
          )
        }
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
              <AdminConfigSection
                id="brand-identity-heading"
                icon={<Store size={16} aria-hidden="true" />}
                title="Nombre, logo y color del salón"
                subtitle="Así aparece tu estudio en tu página de reservas y en tus recordatorios."
                badge={
                  <AdminConfigChip
                    tone={colorsReadable ? 'success' : 'warning'}
                    label={
                      colorsReadable
                        ? 'Lectura de colores: Se lee súper bien'
                        : 'Lectura de colores: Color muy claro, cuesta leer'
                    }
                  />
                }
              >
                <VStack gap={4} className="ad-card-body" paddingBlockStart={4}>
                  <HStack
                    className="ad-subpanel"
                    justify="between"
                    align="center"
                    gap={3}
                    wrap="wrap"
                  >
                    <HStack gap={3} align="center">
                      <img
                        src={brandLogo}
                        alt={draft.name}
                        width={118}
                        height={34}
                        className="ad-logo"
                      />
                      <VStack gap={0}>
                        <Text weight="semibold" size="sm">
                          Logo del salón
                        </Text>
                        <Text type="supporting" color="secondary">
                          Se adapta solo a modo claro y oscuro.
                        </Text>
                      </VStack>
                    </HStack>
                    <Button
                      label="Ver mi página"
                      variant="secondary"
                      size="sm"
                      icon={<ExternalLink size={14} aria-hidden="true" />}
                      href="/"
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  </HStack>

                  <TextInput
                    label="Nombre del salón"
                    value={draft.name}
                    onChange={(v) => updateDraft({ name: v })}
                    isRequired
                  />
                  <TextInput
                    label="Frase corta debajo del nombre"
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
                      label="WhatsApp del salón (+52...)"
                      value={draft.whatsappNumber}
                      onChange={(v) => updateDraft({ whatsappNumber: v })}
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
                      label="Dónde atiendes"
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
                    label="Dirección del salón"
                    value={draft.address}
                    onChange={(v) => updateDraft({ address: v })}
                  />
                  <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
                    <TextInput
                      label="Link de Google Maps"
                      value={draft.mapsUrl}
                      onChange={(v) => updateDraft({ mapsUrl: v })}
                    />
                    <TextInput
                      label="Link de Instagram"
                      placeholder="https://www.instagram.com/laikona.nailsss/"
                      value={draft.instagramUrl ?? ''}
                      onChange={(v) => updateDraft({ instagramUrl: v })}
                      isOptional
                    />
                  </Grid>

                  <Divider />

                  <VStack gap={3}>
                    <HStack justify="between" align="center" wrap="wrap" gap={2}>
                      <HStack gap={1.5} align="center">
                        <Palette size={15} aria-hidden="true" />
                        <Text weight="semibold" size="sm">
                          Color de tu página
                        </Text>
                      </HStack>
                      <AdminConfigChip
                        tone={colorsReadable ? 'success' : 'warning'}
                        label={
                          colorsReadable
                            ? 'Se lee súper bien'
                            : 'Color muy claro, cuesta leer'
                        }
                      />
                    </HStack>

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
                            tone={colorReadability.lightPassesAA ? 'success' : 'warning'}
                            label={
                              colorReadability.lightPassesAA
                                ? 'Se lee súper bien'
                                : 'Color muy claro, cuesta leer'
                            }
                          />
                        </HStack>
                        <TextInput
                          label="Color principal en modo claro"
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
                            tone={colorReadability.darkPassesAA ? 'success' : 'warning'}
                            label={
                              colorReadability.darkPassesAA
                                ? 'Se lee súper bien'
                                : 'Color muy claro, cuesta leer'
                            }
                          />
                        </HStack>
                        <TextInput
                          label="Color principal en modo oscuro"
                          isLabelHidden
                          size="sm"
                          value={draft.brandAccentDark}
                          onChange={(v) => updateDraft({ brandAccentDark: v })}
                        />
                      </VStack>
                    </Grid>

                    {!colorReadability.lightPassesAA ? (
                      <Banner
                        status="warning"
                        title="Color muy claro, cuesta leer en modo claro"
                        description="Prueba un tono un poco más oscuro para que los botones y textos se lean con claridad."
                      />
                    ) : null}

                    {!colorReadability.darkPassesAA ? (
                      <Banner
                        status="warning"
                        title="Color difícil de leer en modo oscuro"
                        description="Elige un tono más luminoso para que destaque bien sobre fondo oscuro."
                      />
                    ) : null}

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
                      label="Forma de botones y tarjetas"
                      value={draft.cornerStyle}
                      onChange={(v) => v && updateDraft({ cornerStyle: v as CornerStyle })}
                      options={[
                        { value: 'sharp', label: 'Rectas' },
                        { value: 'soft', label: 'Suaves' },
                        { value: 'rounded', label: 'Redondeadas' },
                        { value: 'pill', label: 'Muy redondeadas' },
                      ]}
                    />

                    <Switch
                      label="Sonar un aviso cuando llegue una cita nueva"
                      value={soundAlertsEnabled}
                      onChange={(v) => updateDraft({ soundAlertsEnabled: v })}
                    />
                  </VStack>
                </VStack>
              </AdminConfigSection>

              <AdminConfigSection
                id="brand-loyalty-heading"
                icon={<Award size={16} aria-hidden="true" />}
                title="Tarjeta de sellos"
                subtitle="Suma 1 sello al cobrar cada cita; tus clientas la ven en su celular sin bajar ninguna app."
                actions={
                  <Switch
                    label="Activar tarjeta de sellos"
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
                        label="Sellos para ganar premio (3 a 10)"
                        value={loyaltyDraft.stampsRequired}
                        min={3}
                        max={10}
                        isIntegerOnly
                        onChange={(v) => updateLoyaltyDraft({ stampsRequired: v })}
                      />
                      <Selector
                        label="Premio al completar"
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
                          label="Descuento máximo (MXN)"
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
                      Activa el interruptor de arriba para premiar a tus clientas frecuentes.
                    </Text>
                  </VStack>
                )}
              </AdminConfigSection>

              <AdminConfigSection
                id="brand-spei-heading"
                icon={<Wallet size={16} aria-hidden="true" />}
                title="Anticipo por transferencia (SPEI)"
                subtitle="Datos bancarios que ven tus clientas para apartar su cita."
                actions={
                  <Switch
                    label="Pedir anticipo SPEI"
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
                        label="Titular de la cuenta"
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
                        label="Indicaciones para enviar el comprobante"
                        value={draft.depositInstructions}
                        onChange={(v) => updateDraft({ depositInstructions: v })}
                        rows={2}
                      />
                    </VStack>
                  ) : (
                    <Text type="supporting" color="secondary">
                      Sin anticipo: tus clientas agendan directo sin subir comprobante.
                    </Text>
                  )}
                </VStack>
              </AdminConfigSection>
            </VStack>

            <VStack gap={4}>
              <AdminConfigSection
                tone="subtle"
                padded
                icon={<Sparkles size={16} aria-hidden="true" />}
                title="Vista previa en vivo"
                subtitle="Así ven tu salón tus clientas mientras cambias los colores."
                badge={<StatusDot variant="success" label="Vista previa activa" isPulsing />}
              >
                <VStack className="ad-surface fx-card-lift" data-padded="true" gap={3}>
                  <HStack justify="between" align="center" wrap="wrap" gap={2}>
                    <HStack gap={2} align="center">
                      <img
                        src={brandLogo}
                        alt=""
                        width={88}
                        height={25}
                        className="ad-logo-sm"
                      />
                      <VStack gap={0}>
                        <Text weight="bold" size="sm">
                          {draft.name}
                        </Text>
                        <Text type="supporting" color="secondary">
                          {draft.city || 'Puebla, México'}
                        </Text>
                      </VStack>
                    </HStack>
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
            </VStack>
          </VStack>

          <Collapsible
            className="ad-disclosure"
            defaultIsOpen={false}
            trigger={
              <HStack justify="between" align="center" gap={2} width="100%" wrap="wrap">
                <HStack gap={2} align="center">
                  <SlidersHorizontal size={15} aria-hidden="true" />
                  <VStack gap={0}>
                    <Text weight="semibold" size="base">
                      Reglas del salón y opciones avanzadas
                    </Text>
                    <Text type="supporting" color="secondary">
                      Política si no llegan, límite de citas, PIN de dueña, otra web e historial de cambios.
                    </Text>
                  </VStack>
                </HStack>
                <AdminConfigChip label="Opcional" tone="neutral" />
              </HStack>
            }
          >
            <VStack gap={4} paddingBlockStart={4}>
              <VStack className="ad-config-grid-equal" gap={4}>
                <AdminConfigSection
                  id="brand-rules-heading"
                  icon={<ShieldCheck size={16} aria-hidden="true" />}
                  title="Textos, límites y tiempos de reserva"
                  subtitle="Reglas de cancelación, límite de citas por clienta y aviso de privacidad."
                >
                  <VStack gap={3} className="ad-card-body" paddingBlockStart={4}>
                    <TextInput
                      label="Título principal de tu portada"
                      value={draft.landingContent.heroTitle}
                      onChange={(v) =>
                        updateDraft({
                          landingContent: { ...draft.landingContent, heroTitle: v },
                        })
                      }
                    />
                    <TextArea
                      label="Descripción de tu portada"
                      value={draft.landingContent.heroSubtitle}
                      onChange={(v) =>
                        updateDraft({
                          landingContent: { ...draft.landingContent, heroSubtitle: v },
                        })
                      }
                      rows={2}
                    />
                    <TextArea
                      label="Regla de cancelación y cambios"
                      value={draft.cancellationPolicyText}
                      onChange={(v) => updateDraft({ cancellationPolicyText: v })}
                      rows={2}
                    />
                    <Grid columns={{ minWidth: 110, max: 3 }} gap={2}>
                      <NumberInput
                        label="Anticipación mín. (min)"
                        value={draft.minBookingNoticeMinutes}
                        min={0}
                        onChange={(v) => updateDraft({ minBookingNoticeMinutes: v })}
                      />
                      <NumberInput
                        label="Cancelar antes (hrs)"
                        value={draft.minCancelHours}
                        min={0}
                        onChange={(v) => updateDraft({ minCancelHours: v })}
                      />
                      <NumberInput
                        label="Apartado temporal (min)"
                        value={draft.slotHoldMinutes}
                        min={1}
                        max={15}
                        onChange={(v) => updateDraft({ slotHoldMinutes: v })}
                      />
                    </Grid>
                    <Switch
                      label="Guardar el lugar unos minutos mientras la clienta termina de agendar"
                      value={draft.enableSlotHold}
                      onChange={(v) => updateDraft({ enableSlotHold: v })}
                    />

                    <Divider />

                    <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
                      <NumberInput
                        label="Máximo de citas activas por clienta (1 a 10)"
                        value={maxActiveBookingsPerClient}
                        min={1}
                        max={10}
                        isIntegerOnly
                        onChange={(v) => updateDraft({ maxActiveBookingsPerClient: v })}
                      />
                      <TextInput
                        label="Versión del Aviso de Privacidad"
                        value={privacyPolicyVersion}
                        onChange={(v) => updateDraft({ privacyPolicyVersion: v })}
                        placeholder="2026-11"
                      />
                    </Grid>
                    <Switch
                      label="Proteger citas pasadas contra cambios"
                      description="Solo la Dueña podrá editar o cancelar citas que ya pasaron."
                      value={lockPastBookings}
                      onChange={(v) => updateDraft({ lockPastBookings: v })}
                    />
                    <Switch
                      label="Aprovechar huecos en días con horario libre"
                      description="No cambia tus turnos fijos; solo acomoda espacios en horario libre."
                      value={optimizeContinuousSlots}
                      onChange={(v) => updateDraft({ optimizeContinuousSlots: v })}
                    />
                    <HStack justify="between" align="center" wrap="wrap" gap={2}>
                      <Text type="supporting" color="secondary">
                        Tus clientas aceptan tu aviso al reservar su cita.
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

                <VStack gap={4}>
                  {isOwner ? (
                    <AdminConfigSection
                      id="brand-noshow-policy-heading"
                      icon={<AlertTriangle size={16} aria-hidden="true" />}
                      title="Política si no llegan"
                      subtitle="Pide anticipo obligatorio en automático a clientas que han faltado sin avisar."
                      badge={
                        <AdminConfigChip
                          tone={flaggedNoShowClientsCount > 0 ? 'warning' : 'success'}
                          label={
                            flaggedNoShowClientsCount > 0
                              ? `${flaggedNoShowClientsCount} clienta${flaggedNoShowClientsCount === 1 ? '' : 's'} con aviso`
                              : 'Sin clientas marcadas'
                          }
                          hasTabularNumbers
                        />
                      }
                    >
                      <VStack gap={3} className="ad-card-body" paddingBlockStart={4}>
                        <NumberInput
                          label="¿Después de cuántas faltas pedir anticipo obligatorio? (1 a 5)"
                          description="Cuando una clienta llega a este número de inasistencias, el sistema siempre le pedirá anticipo."
                          value={noShowDepositThreshold}
                          min={1}
                          max={5}
                          isIntegerOnly
                          onChange={(v) =>
                            updateDraft({
                              noShowDepositThreshold: Math.max(
                                1,
                                Math.min(5, Math.round(v || 2)),
                              ),
                            })
                          }
                        />
                        <HStack
                          className="ad-subpanel"
                          justify="between"
                          align="center"
                          wrap="wrap"
                          gap={2}
                        >
                          <Text type="supporting" color="secondary" hasTabularNumbers>
                            Con {noShowDepositThreshold} o más faltas → se pide anticipo obligatorio.
                          </Text>
                          <AdminConfigChip
                            tone="accent"
                            label={`Límite: ${noShowDepositThreshold} falta${noShowDepositThreshold === 1 ? '' : 's'}`}
                            hasTabularNumbers
                          />
                        </HStack>
                      </VStack>
                    </AdminConfigSection>
                  ) : null}

                  {isOwner ? (
                    <AdminConfigSection
                      id="brand-owner-pin-heading"
                      icon={<KeyRound size={16} aria-hidden="true" />}
                      title="PIN de dueña"
                      subtitle="Protege cancelaciones, cambios manuales de precio y descargas de reportes."
                      badge={
                        <AdminConfigChip
                          tone={
                            hasOwnerPin && ownerPinEnabled
                              ? 'success'
                              : hasOwnerPin
                                ? 'neutral'
                                : 'warning'
                          }
                          label={
                            hasOwnerPin && ownerPinEnabled
                              ? 'Activo'
                              : hasOwnerPin
                                ? 'Pausado'
                                : 'Sin configurar'
                          }
                        />
                      }
                    >
                      <VStack
                        gap={3}
                        className={pinSaving ? 'ad-card-body fx-busy' : 'ad-card-body'}
                        paddingBlockStart={4}
                        aria-busy={pinSaving || undefined}
                      >
                        {pinSuccessMsg ? (
                          <Banner
                            status="success"
                            role="status"
                            title={pinSuccessMsg}
                            isDismissable
                            onDismiss={() => setPinSuccessMsg(null)}
                          />
                        ) : null}
                        {pinErrorMsg ? (
                          <Banner
                            status="error"
                            role="alert"
                            title={pinErrorMsg}
                            isDismissable
                            onDismiss={() => setPinErrorMsg(null)}
                          />
                        ) : null}

                        <Switch
                          label="Pedir PIN de dueña en acciones importantes"
                          description="Lo pedirá al cancelar citas, cambiar precios a mano o descargar reportes."
                          value={ownerPinEnabled}
                          onChange={handleToggleOwnerPin}
                        />

                        <Divider />

                        <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
                          <TextInput
                            type="password"
                            label={hasOwnerPin ? 'Nuevo PIN (4 a 6 números)' : 'Crear PIN (4 a 6 números)'}
                            placeholder="••••"
                            inputMode="numeric"
                            autoComplete="new-password"
                            containerClassName="ad-pin-input"
                            value={newPin}
                            onChange={(val) => setNewPin(val.replace(/\D/g, '').slice(0, 6))}
                          />
                          <TextInput
                            type="password"
                            label="Repite el PIN"
                            placeholder="••••"
                            inputMode="numeric"
                            autoComplete="new-password"
                            containerClassName="ad-pin-input"
                            value={confirmPin}
                            onChange={(val) => setConfirmPin(val.replace(/\D/g, '').slice(0, 6))}
                          />
                        </Grid>

                        <Text type="supporting" color="secondary">
                          Tu PIN se guarda protegido y nunca se muestra en pantalla.
                        </Text>

                        <HStack gap={2} wrap="wrap">
                          <Button
                            type="button"
                            label={
                              pinSaving
                                ? 'Guardando PIN...'
                                : hasOwnerPin
                                  ? 'Cambiar PIN'
                                  : 'Guardar PIN'
                            }
                            variant="primary"
                            size="sm"
                            icon={<KeyRound size={14} aria-hidden="true" />}
                            isLoading={pinSaving}
                            isDisabled={pinSaving || newPin.length < 4 || confirmPin.length < 4}
                            onClick={() => void handleSaveOwnerPin()}
                          />
                          {hasOwnerPin ? (
                            <Button
                              type="button"
                              label={pinSaving ? 'Borrando...' : 'Quitar PIN'}
                              variant="ghost"
                              size="sm"
                              icon={<Trash2 size={14} aria-hidden="true" />}
                              isLoading={pinSaving}
                              isDisabled={pinSaving}
                              onClick={() => void handleClearOwnerPin()}
                            />
                          ) : null}
                        </HStack>
                      </VStack>
                    </AdminConfigSection>
                  ) : null}
                </VStack>
              </VStack>

              <EmbedGeneratorCard
                appUrl={data.integration.appUrl}
                salonName={draft.name}
                accentColor={draft.brandAccentLight}
                services={data.services}
                staff={data.staff}
              />

              {isOwner ? (
                <AdminConfigSection
                  id="brand-history-heading"
                  icon={<History size={16} aria-hidden="true" />}
                  title="Historial de cambios"
                  subtitle="Cancelaciones, ajustes de precio, anticipos aprobados y premios canjeados."
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
                      icon={<History size={22} aria-hidden="true" />}
                      title="Aún no hay movimientos registrados"
                      description="Cada cambio importante quedará guardado aquí con fecha y quién lo hizo."
                    />
                  ) : (
                    <VStack as="ul" className="ad-row-list" gap={0}>
                      {data.recentAuditLogs.slice(0, 12).map((entry) => {
                        const meta = HISTORY_ACTION_META[entry.action];
                        const roleLabel = ROLE_LABELS[entry.actorRole] ?? 'Equipo';
                        return (
                          <li key={entry.id} className="ad-row-item">
                            <VStack gap={0.5} className="rb-grow">
                              <Text weight="semibold" size="sm">
                                {meta.label} · {friendlyEntityLabel(entry.entityType)}
                              </Text>
                              <Text type="supporting" color="secondary" hasTabularNumbers>
                                {entry.actorEmail} ({roleLabel}) ·{' '}
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
          </Collapsible>
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
            <AdminConfigChip label="Sin guardar" tone="warning" />
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
