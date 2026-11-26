'use client';

import dynamic from 'next/dynamic';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { Banner } from '@astryxdesign/core/Banner';
import { Palette } from 'lucide-react';
import { ColorSwatchPicker } from '@/components/admin/ColorSwatchPicker';
import { SkeletonBlock, StatusTag, SurfaceCard } from '@/components/ui';
import { ACCENT_PRESETS } from '@/lib/theme-presets';
import type { CornerStyle, SalonSettings, ThemeModePreference } from '@/lib/types';

function WireframePickerFallback() {
  return (
    <VStack gap={3} role="status" aria-live="polite" aria-label="Cargando selector de apariencia">
      <SkeletonBlock width="100%" height="7rem" radius={3} index={0} />
      <SkeletonBlock width="100%" height="7rem" radius={3} index={1} />
    </VStack>
  );
}

const AppearanceWireframePicker = dynamic(
  () =>
    import('@/components/admin/AppearanceWireframePicker').then(
      (mod) => mod.AppearanceWireframePicker,
    ),
  { ssr: false, loading: WireframePickerFallback },
);

interface ColorReadabilityStatus {
  lightPassesAA: boolean;
  darkPassesAA: boolean;
}

interface BookingAppearanceSectionProps {
  draft: SalonSettings;
  soundAlertsEnabled: boolean;
  colorReadability: ColorReadabilityStatus;
  onUpdateDraft: (patch: Partial<SalonSettings>) => void;
  onModeChange: (nextMode: ThemeModePreference) => void;
}

export function BookingAppearanceSection({
  draft,
  soundAlertsEnabled,
  colorReadability,
  onUpdateDraft,
  onModeChange,
}: BookingAppearanceSectionProps) {
  const colorsReadable =
    colorReadability.lightPassesAA && colorReadability.darkPassesAA;

  return (
    <SurfaceCard
      id="brand-appearance-heading"
      icon={<Palette size={16} aria-hidden="true" />}
      title="Color y apariencia de tu página"
      subtitle="Elige tu color principal, el diseño de reservas y cómo se ven tus botones."
      badge={
        <StatusTag
          tone={colorsReadable ? 'success' : 'warning'}
          label={
            colorsReadable
              ? 'Buena lectura'
              : 'Revisar contraste'
          }
        />
      }
    >
      <VStack gap={4} className="ad-card-body" paddingBlockStart={4}>
        <ColorSwatchPicker
          presets={ACCENT_PRESETS}
          selectedLight={draft.brandAccentLight}
          selectedDark={draft.brandAccentDark}
          onSelect={(preset) =>
            onUpdateDraft({
              brandAccentLight: preset.light,
              brandAccentDark: preset.dark,
            })
          }
        />

        <Grid columns={{ minWidth: 180, max: 2 }} gap={3}>
          <VStack gap={2} className="ad-subpanel">
            <HStack justify="between" align="center" gap={2} wrap="wrap">
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
              <StatusTag
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
              onChange={(v) => onUpdateDraft({ brandAccentLight: v })}
            />
          </VStack>

          <VStack gap={2} className="ad-subpanel">
            <HStack justify="between" align="center" gap={2} wrap="wrap">
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
              <StatusTag
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
              onChange={(v) => onUpdateDraft({ brandAccentDark: v })}
            />
          </VStack>
        </Grid>

        {!colorReadability.lightPassesAA ? (
          <Banner
            status="warning"
            role="status"
            title="Color muy claro, cuesta leer en modo claro"
            description="Prueba un tono un poco más oscuro para que los botones y textos se lean con claridad."
          />
        ) : null}

        {!colorReadability.darkPassesAA ? (
          <Banner
            status="warning"
            role="status"
            title="Color difícil de leer en modo oscuro"
            description="Elige un tono más luminoso para que destaque bien sobre fondo oscuro."
          />
        ) : null}

        <AppearanceWireframePicker
          publicMode={draft.defaultPublicMode}
          onPublicModeChange={(nextMode) => {
            onUpdateDraft({ defaultPublicMode: nextMode });
            onModeChange(nextMode);
          }}
          bookingLayout={draft.defaultBookingLayout}
          onBookingLayoutChange={(nextLayout) =>
            onUpdateDraft({ defaultBookingLayout: nextLayout })
          }
        />

        <Selector
          label="Forma de botones y tarjetas"
          value={draft.cornerStyle}
          onChange={(v) => {
            if (v === 'sharp' || v === 'soft' || v === 'rounded' || v === 'pill') {
              onUpdateDraft({ cornerStyle: v as CornerStyle });
            }
          }}
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
          onChange={(v) => onUpdateDraft({ soundAlertsEnabled: v })}
        />
      </VStack>
    </SurfaceCard>
  );
}
