'use client';

import React, { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { Banner } from '@astryxdesign/core/Banner';
import { Badge } from '@astryxdesign/core/Badge';
import { Divider } from '@astryxdesign/core/Divider';
import { Token } from '@astryxdesign/core/Token';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { List, ListItem } from '@astryxdesign/core/List';
import { Award, ExternalLink, Palette, Save, ShieldCheck } from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import { QrShareCard } from '@/components/admin/QrShareCard';
import { useSalonAppearance } from '@/components/SalonThemeProvider';
import { ACCENT_PRESETS } from '@/lib/theme-presets';
import {
  formatCurrency,
  formatDateShortInTimezone,
  formatTimeInTimezone,
} from '@/lib/format';
import type {
  AuditAction,
  BookingLayoutView,
  CornerStyle,
  LoyaltyProgram,
  SalonSettings,
  ThemeModePreference,
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
  { label: string; variant: 'warning' | 'info' | 'success' | 'error' | 'neutral' }
> = {
  booking_canceled: { label: 'Cancelación', variant: 'error' },
  booking_price_override: { label: 'Ajuste precio', variant: 'warning' },
  csv_exported: { label: 'Exportación CSV', variant: 'info' },
  past_booking_override: { label: 'Edición pasada', variant: 'warning' },
  deposit_approved: { label: 'Anticipo aprobado', variant: 'success' },
  loyalty_redeemed: { label: 'Premio canjeado', variant: 'success' },
};

function serviceModeLabel(mode: ActiveServiceMode | undefined): string {
  if (mode === 'home') return 'A domicilio';
  if (mode === 'online') return 'Solo en línea';
  return 'En estudio';
}

export default function AdminBrandPage() {
  const { data, refresh } = useAdminData();
  const { setSettingsOverride, setMode } = useSalonAppearance();
  const [draftOverride, setDraftOverride] = useState<SalonSettings | null>(null);
  const [loyaltyOverride, setLoyaltyOverride] = useState<LoyaltyProgram | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!data) return null;

  const draft = draftOverride ?? data.settings;
  const loyaltyDraft = loyaltyOverride ?? data.loyaltyProgram ?? DEFAULT_LOYALTY_PROGRAM;
  const tz = draft.timezone || 'America/Mexico_City';

  const depositAmountCents = draft.depositAmountCents ?? 20000;
  const depositBeneficiary = draft.depositBeneficiary ?? draft.depositAccountHolder;
  const activeServiceMode: ActiveServiceMode = draft.serviceMode ?? 'studio';
  const soundAlertsEnabled = draft.soundAlertsEnabled ?? true;
  const lockPastBookings = draft.lockPastBookings ?? true;
  const maxActiveBookingsPerClient = draft.maxActiveBookingsPerClient ?? 3;
  const privacyPolicyVersion = draft.privacyPolicyVersion ?? '2026-11';
  const activeServices = data.services.filter((s) => s.isActive);

  const updateDraft = (patch: Partial<SalonSettings>) => {
    const next = { ...draft, ...patch };
    setDraftOverride(next);
    setSettingsOverride(next);
  };

  const updateLoyaltyDraft = (patch: Partial<LoyaltyProgram>) => {
    setLoyaltyOverride({ ...loyaltyDraft, ...patch });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
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
                ? loyaltyDraft.rewardServiceId ?? activeServices[0]?.id ?? null
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
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErrorMsg(json.error || 'No se pudieron guardar los cambios de marca.');
        return;
      }
      setSavedMsg('Marca, tarjeta de sellos, blindaje operativo y anticipo SPEI guardados.');
      await refresh();
    } catch {
      setErrorMsg('Error de conexión al guardar la configuración.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <VStack gap={5}>
      <HStack justify="between" align="center" wrap="wrap" gap={3}>
        <VStack gap={0.5}>
          <Heading level={1}>Marca, Fidelidad, QR y Políticas</Heading>
          <Text color="secondary">
            Personaliza tu identidad, tarjeta digital de sellos, código QR, blindaje operativo y datos SPEI.
          </Text>
        </VStack>
        <Button
          type="button"
          label="Guardar cambios"
          variant="primary"
          icon={<Save size={15} />}
          isLoading={saving}
          onClick={handleSave}
        />
      </HStack>

      {savedMsg ? (
        <Banner
          status="success"
          title={savedMsg}
          isDismissable
          onDismiss={() => setSavedMsg(null)}
        />
      ) : null}

      {errorMsg ? (
        <Banner
          status="error"
          title={errorMsg}
          isDismissable
          onDismiss={() => setErrorMsg(null)}
        />
      ) : null}

      <Grid columns={{ minWidth: 320, max: 2 }} gap={5} align="start">
        <form onSubmit={handleSave}>
          <VStack gap={4}>
            <Card padding={5}>
              <VStack gap={3}>
                <Heading level={3}>Identidad, Instagram y Sede</Heading>
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
                <Grid columns={{ minWidth: 180, max: 2 }} gap={3}>
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
                <Grid columns={{ minWidth: 180, max: 2 }} gap={3}>
                  <TextInput
                    label="Estudio hermano / sede"
                    placeholder="@lumiere.beautymx"
                    value={draft.sisterStudioHandle ?? ''}
                    onChange={(v) => updateDraft({ sisterStudioHandle: v })}
                    isOptional
                  />
                  <TextInput
                    label="Ciudad"
                    placeholder="Puebla, México"
                    value={draft.city ?? ''}
                    onChange={(v) => updateDraft({ city: v })}
                    isOptional
                  />
                </Grid>
                <TextInput
                  label="Dirección física"
                  value={draft.address}
                  onChange={(v) => updateDraft({ address: v })}
                />
                <Grid columns={{ minWidth: 180, max: 2 }} gap={3}>
                  <TextInput
                    label="WhatsApp del salón (+52...)"
                    value={draft.whatsappNumber}
                    onChange={(v) => updateDraft({ whatsappNumber: v })}
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
                  label="Link de Google Maps"
                  value={draft.mapsUrl}
                  onChange={(v) => updateDraft({ mapsUrl: v })}
                />
                <Switch
                  label="Sonido de alertas cuando lleguen nuevas citas en la agenda"
                  value={soundAlertsEnabled}
                  onChange={(v) => updateDraft({ soundAlertsEnabled: v })}
                />
              </VStack>
            </Card>

            <Card padding={5}>
              <VStack gap={3}>
                <HStack gap={2} align="center">
                  <Award size={18} aria-hidden="true" />
                  <Heading level={3}>Tarjeta Digital de Sellos</Heading>
                </HStack>
                <Text type="supporting" color="secondary">
                  Suma 1 sello automático por día al completar y cobrar cada cita. Visible para tus clientas en su enlace personal /cita/[token].
                </Text>
                <Switch
                  label="Activar programa de sellos de fidelidad"
                  value={loyaltyDraft.isActive}
                  onChange={(v) => updateLoyaltyDraft({ isActive: v })}
                />
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
            </Card>

            <Card padding={5}>
              <VStack gap={3}>
                <HStack gap={2} align="center">
                  <ShieldCheck size={18} aria-hidden="true" />
                  <Heading level={3}>Blindaje Operativo y Privacidad (LFPDPPP)</Heading>
                </HStack>
                <Switch
                  label="Bloquear edición o cancelación de citas pasadas"
                  description="Evita modificaciones retroactivas de recepcionistas o especialistas; solo la Dueña puede sobreescribir dejando registro en bitácora."
                  value={lockPastBookings}
                  onChange={(v) => updateDraft({ lockPastBookings: v })}
                />
                <Grid columns={{ minWidth: 180, max: 2 }} gap={3}>
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
                    icon={<ExternalLink size={14} />}
                    href="/aviso-de-privacidad"
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                </HStack>
              </VStack>
            </Card>

            <Card padding={5}>
              <VStack gap={3}>
                <HStack gap={2} align="center">
                  <Palette size={18} aria-hidden="true" />
                  <Heading level={3}>Tema Astryx y Apariencia</Heading>
                </HStack>
                <Text type="supporting" color="secondary">
                  Elige una paleta editorial preajustada o escribe los tonos exactos de la marca del salón:
                </Text>
                <HStack gap={1.5} wrap="wrap">
                  {ACCENT_PRESETS.map((p) => (
                    <Button
                      key={p.label}
                      type="button"
                      size="sm"
                      variant={
                        draft.brandAccentLight.toLowerCase() === p.light.toLowerCase()
                          ? 'primary'
                          : 'secondary'
                      }
                      label={p.label}
                      onClick={() =>
                        updateDraft({
                          brandAccentLight: p.light,
                          brandAccentDark: p.dark,
                        })
                      }
                    />
                  ))}
                </HStack>

                <Grid columns={2} gap={3}>
                  <TextInput
                    label="Color acento (Modo Claro)"
                    value={draft.brandAccentLight}
                    onChange={(v) => updateDraft({ brandAccentLight: v })}
                  />
                  <TextInput
                    label="Color acento (Modo Oscuro)"
                    value={draft.brandAccentDark}
                    onChange={(v) => updateDraft({ brandAccentDark: v })}
                  />
                </Grid>

                <Grid columns={3} gap={2}>
                  <Selector
                    label="Esquinas"
                    value={draft.cornerStyle}
                    onChange={(v) => v && updateDraft({ cornerStyle: v as CornerStyle })}
                    options={[
                      { value: 'sharp', label: 'Rectas' },
                      { value: 'soft', label: 'Editorial (Suaves)' },
                      { value: 'rounded', label: 'Redondeadas' },
                      { value: 'pill', label: 'Píldora' },
                    ]}
                  />
                  <Selector
                    label="Modo público"
                    value={draft.defaultPublicMode}
                    onChange={(v) => {
                      if (v) {
                        updateDraft({ defaultPublicMode: v as ThemeModePreference });
                        setMode(v as ThemeModePreference);
                      }
                    }}
                    options={[
                      { value: 'light', label: 'Claro' },
                      { value: 'dark', label: 'Oscuro' },
                      { value: 'system', label: 'Sistema' },
                    ]}
                  />
                  <Selector
                    label="Vista inicial agenda"
                    value={draft.defaultBookingLayout}
                    onChange={(v) =>
                      v && updateDraft({ defaultBookingLayout: v as BookingLayoutView })
                    }
                    options={[
                      { value: 'month', label: 'Mes' },
                      { value: 'week', label: 'Semana' },
                      { value: 'column', label: 'Columnas' },
                    ]}
                  />
                </Grid>
              </VStack>
            </Card>

            <Card padding={5}>
              <VStack gap={3}>
                <Heading level={3}>Anticipo SPEI (Mercado Pago), Políticas y Landing</Heading>
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

                <Divider />

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
                <Grid columns={3} gap={2}>
                  <NumberInput
                    label="Aviso mín. cita (min)"
                    value={draft.minBookingNoticeMinutes}
                    min={0}
                    onChange={(v) => updateDraft({ minBookingNoticeMinutes: v })}
                  />
                  <NumberInput
                    label="Límite cancelar (hrs)"
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
                  label="Activar bloqueo temporal (slot hold) mientras la clienta llena sus datos"
                  value={draft.enableSlotHold}
                  onChange={(v) => updateDraft({ enableSlotHold: v })}
                />
              </VStack>
            </Card>
          </VStack>
        </form>

        <VStack gap={4}>
          <Card variant="muted" padding={5}>
            <VStack gap={4}>
              <HStack justify="between" align="center" wrap="wrap" gap={2}>
                <Text type="label" color="accent" weight="semibold">
                  VISTA PREVIA EN VIVO DEL SITIO PÚBLICO
                </Text>
                <StatusDot variant="success" label="Aplicando tema en vivo" isPulsing />
              </HStack>

              <Card padding={5} elevation="low">
                <VStack gap={3}>
                  <HStack justify="between" align="center" wrap="wrap" gap={2}>
                    <VStack gap={0}>
                      <Text weight="bold">{draft.name}</Text>
                      <Text type="supporting" color="secondary">
                        {draft.city || 'Puebla, México'}
                        {draft.sisterStudioHandle ? ` · ${draft.sisterStudioHandle}` : ''}
                      </Text>
                    </VStack>
                    <Button label="Agendar cita" variant="primary" size="sm" href="/reservar" />
                  </HStack>
                  <Divider />
                  <VStack gap={1.5}>
                    <HStack gap={1.5} wrap="wrap">
                      <Token size="sm" label={draft.landingContent.heroEyebrow} />
                      <Badge variant="neutral" label={serviceModeLabel(activeServiceMode)} />
                    </HStack>
                    <Heading level={2}>{draft.landingContent.heroTitle}</Heading>
                    <Text type="supporting" color="secondary">
                      {draft.landingContent.heroSubtitle}
                    </Text>
                  </VStack>
                  <HStack gap={2}>
                    <Button label="Agendar ahora" variant="primary" size="sm" href="/reservar" />
                    <Button label="Ver servicios" variant="secondary" size="sm" href="/" />
                  </HStack>
                  <Divider />
                  <Card variant="muted" padding={3}>
                    <VStack gap={1}>
                      <HStack justify="between" align="center" wrap="wrap" gap={2}>
                        <Text type="label" color="accent" weight="semibold">
                          ANTICIPO SPEI ({formatCurrency(depositAmountCents, draft.currency)})
                        </Text>
                        <Badge variant="info" label={draft.depositBankName || 'Mercado Pago'} />
                      </HStack>
                      <Text type="supporting">Titular: {depositBeneficiary}</Text>
                      <Text type="code" weight="semibold">
                        CLABE: {draft.depositClabe}
                      </Text>
                    </VStack>
                  </Card>
                  <Text type="supporting" color="secondary">
                    {draft.address} · {draft.instagramHandle}
                  </Text>
                </VStack>
              </Card>
            </VStack>
          </Card>

          <QrShareCard appUrl={data.integration.appUrl} salonName={draft.name} />

          {data.session.user.role === 'owner' ? (
            <Card padding={5}>
              <VStack gap={3}>
                <HStack justify="between" align="center" wrap="wrap" gap={2}>
                  <HStack gap={2} align="center">
                    <ShieldCheck size={18} aria-hidden="true" />
                    <Heading level={3}>Bitácora de auditoría</Heading>
                  </HStack>
                  <Badge variant="neutral" label={String(data.recentAuditLogs.length)} />
                </HStack>
                <Text type="supporting" color="secondary">
                  Registro automático de cancelaciones, ajustes de precio, aprobaciones de anticipo, canjes de sellos y exportaciones CSV (solo visible para Dueña).
                </Text>
                {data.recentAuditLogs.length === 0 ? (
                  <Text type="supporting" color="secondary">
                    Sin eventos registrados en la bitácora todavía.
                  </Text>
                ) : (
                  <List hasDividers>
                    {data.recentAuditLogs.slice(0, 12).map((entry) => {
                      const meta = AUDIT_ACTION_META[entry.action];
                      return (
                        <ListItem
                          key={entry.id}
                          label={`${meta.label} · ${entry.entityType} (${entry.entityId})`}
                          description={
                            <Text type="supporting" color="secondary">
                              {entry.actorEmail} ({entry.actorRole}) ·{' '}
                              {formatDateShortInTimezone(entry.createdAt, tz)}{' '}
                              {formatTimeInTimezone(entry.createdAt, tz)}
                            </Text>
                          }
                          endContent={<Badge variant={meta.variant} label={meta.label} />}
                        />
                      );
                    })}
                  </List>
                )}
              </VStack>
            </Card>
          ) : null}
        </VStack>
      </Grid>
    </VStack>
  );
}
