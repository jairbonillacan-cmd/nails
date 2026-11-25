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
import { Divider } from '@astryxdesign/core/Divider';
import { Token } from '@astryxdesign/core/Token';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Palette, Save } from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import { useSalonAppearance } from '@/components/SalonThemeProvider';
import { ACCENT_PRESETS } from '@/lib/theme-presets';
import type {
  BookingLayoutView,
  CornerStyle,
  SalonSettings,
  ThemeModePreference,
} from '@/lib/types';

export default function AdminBrandPage() {
  const { data, refresh } = useAdminData();
  const { setSettingsOverride, setMode } = useSalonAppearance();
  const [draftOverride, setDraftOverride] = useState<SalonSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  if (!data) return null;

  const draft = draftOverride ?? data.settings;

  const updateDraft = (patch: Partial<SalonSettings>) => {
    const next = { ...draft, ...patch };
    setDraftOverride(next);
    setSettingsOverride(next);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/admin/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (res.ok) {
        setSavedMsg('Personalización de marca y tema Astryx guardada y publicada.');
        await refresh();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <VStack gap={5}>
      <HStack justify="between" align="center" wrap="wrap" gap={3}>
        <VStack gap={0.5}>
          <Heading level={1}>Marca, Tema Astryx y Landing</Heading>
          <Text color="secondary">
            Personaliza el 100% de la identidad del salón. Los cambios de color y esquinas se ven en vivo con el sistema de temas de Astryx.
          </Text>
        </VStack>
        <Button
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

      <Grid columns={{ minWidth: 320, max: 2 }} gap={5} align="start">
        <form onSubmit={handleSave}>
          <VStack gap={4}>
            <Card padding={5}>
              <VStack gap={3}>
                <Heading level={3}>Identidad y Contacto</Heading>
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
                <TextInput
                  label="Dirección física"
                  value={draft.address}
                  onChange={(v) => updateDraft({ address: v })}
                />
                <Grid columns={2} gap={3}>
                  <TextInput
                    label="WhatsApp del salón (+52...)"
                    value={draft.whatsappNumber}
                    onChange={(v) => updateDraft({ whatsappNumber: v })}
                  />
                  <TextInput
                    label="Instagram"
                    value={draft.instagramHandle}
                    onChange={(v) => updateDraft({ instagramHandle: v })}
                  />
                </Grid>
                <TextInput
                  label="Link de Google Maps"
                  value={draft.mapsUrl}
                  onChange={(v) => updateDraft({ mapsUrl: v })}
                />
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
                <Heading level={3}>Textos de la Landing, Políticas y Anti-Colisión</Heading>
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

                <Divider />
                <Heading level={4}>Datos bancarios SPEI (Anticipos manuales)</Heading>
                <Grid columns={2} gap={2}>
                  <TextInput
                    label="Banco"
                    value={draft.depositBankName}
                    onChange={(v) => updateDraft({ depositBankName: v })}
                  />
                  <TextInput
                    label="Titular"
                    value={draft.depositAccountHolder}
                    onChange={(v) => updateDraft({ depositAccountHolder: v })}
                  />
                </Grid>
                <TextInput
                  label="CLABE Interbancaria"
                  value={draft.depositClabe}
                  onChange={(v) => updateDraft({ depositClabe: v })}
                />
              </VStack>
            </Card>
          </VStack>
        </form>

        <Card variant="muted" padding={5}>
          <VStack gap={4}>
            <HStack justify="between" align="center">
              <Text type="label" color="accent" weight="semibold">
                VISTA PREVIA EN VIVO DEL SITIO PÚBLICO
              </Text>
              <StatusDot variant="success" label="Aplicando tema en vivo" isPulsing />
            </HStack>

            <Card padding={5} elevation="low">
              <VStack gap={3}>
                <HStack justify="between" align="center">
                  <Text weight="bold">{draft.name}</Text>
                  <Button label="Agendar cita" variant="primary" size="sm" href="/reservar" />
                </HStack>
                <Divider />
                <VStack gap={1.5}>
                  <Token size="sm" label={draft.landingContent.heroEyebrow} />
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
                <Text type="supporting" color="secondary">
                  {draft.address} · {draft.instagramHandle}
                </Text>
              </VStack>
            </Card>
          </VStack>
        </Card>
      </Grid>
    </VStack>
  );
}
