'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { TextArea } from '@astryxdesign/core/TextArea';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Switch } from '@astryxdesign/core/Switch';
import { Divider } from '@astryxdesign/core/Divider';
import { QrCode } from 'lucide-react';
import { StatusTag, SurfaceCard } from '@/components/ui';
import {
  MAX_TOUCH_UP_DAYS,
  MIN_TOUCH_UP_DAYS,
  normalizeTouchUpDays,
} from '@/lib/booking/recurrence';
import type { SalonSettings } from '@/lib/types';

interface BookingPageSettingsSectionProps {
  draft: SalonSettings;
  onUpdateDraft: (patch: Partial<SalonSettings>) => void;
}

export function BookingPageSettingsSection({
  draft,
  onUpdateDraft,
}: BookingPageSettingsSectionProps) {
  const showBookingQr = draft.landingContent.showBookingQr ?? true;
  const touchUpDays = normalizeTouchUpDays(draft.landingContent.touchUpDays);

  const patchLandingContent = (patch: Partial<SalonSettings['landingContent']>) => {
    onUpdateDraft({
      landingContent: {
        ...draft.landingContent,
        ...patch,
      },
    });
  };

  return (
    <SurfaceCard
      id="brand-booking-page-heading"
      icon={<QrCode size={16} aria-hidden="true" />}
      title="Página de tu cita"
      subtitle="Indicaciones al llegar, código QR y sugerencia de retoque que ven tus clientas en su enlace de cita (/cita)."
      badge={
        <StatusTag
          tone={showBookingQr ? 'success' : 'neutral'}
          label={showBookingQr ? 'QR visible' : 'QR oculto'}
          showDot
        />
      }
    >
      <VStack gap={4} className="ad-card-body" paddingBlockStart={4}>
        <TextArea
          label="Indicaciones al llegar"
          description="Tu clienta las ve en su página de cita (/cita) junto a la ubicación del salón y en su recordatorio de calendario."
          placeholder="Ej. Llega 5 minutos antes, sin acompañantes ni esmalte previo."
          value={draft.bookingInstructionsText}
          onChange={(v) => onUpdateDraft({ bookingInstructionsText: v })}
          rows={2}
        />

        <Divider />

        <Switch
          label="Mostrar código QR en la cita"
          description="Tus clientas lo usan para reabrir su cita rápido y hacer check-in al llegar al estudio."
          value={showBookingQr}
          onChange={(checked) => patchLandingContent({ showBookingQr: checked })}
        />

        <NumberInput
          label="Sugerir retoque cada (días)"
          description={`Controla el botón «+${touchUpDays} días» para agendar el siguiente retoque en la página de la cita y al cobrar.`}
          value={touchUpDays}
          min={MIN_TOUCH_UP_DAYS}
          max={MAX_TOUCH_UP_DAYS}
          isIntegerOnly
          onChange={(v) => patchLandingContent({ touchUpDays: normalizeTouchUpDays(v) })}
        />
      </VStack>
    </SurfaceCard>
  );
}
