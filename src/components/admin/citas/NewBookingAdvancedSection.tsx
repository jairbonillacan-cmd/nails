'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Switch } from '@astryxdesign/core/Switch';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Divider } from '@astryxdesign/core/Divider';
import { Repeat } from 'lucide-react';
import { StatusTag } from '@/components/ui';
import { formatCurrency, formatDuration, formatTimeInTimezone } from '@/lib/format';
import type { QuickSlotOption } from './NewBookingSlotStep';

export interface NewBookingAdvancedState {
  isRecurring: boolean;
  recurrenceIntervalWeeks: 2 | 3 | 4;
  recurrenceCount: number;
  useCustomOverride: boolean;
  customDuration: number;
  customPriceMxn: number;
  internalNotes: string;
  notifyWhatsapp: boolean;
  notifyEmail: boolean;
  source: 'manual' | 'walk_in';
}

export function createInitialAdvancedState(internalNotes = ''): NewBookingAdvancedState {
  return {
    isRecurring: false,
    recurrenceIntervalWeeks: 3,
    recurrenceCount: 3,
    useCustomOverride: false,
    customDuration: 120,
    customPriceMxn: 350,
    internalNotes,
    notifyWhatsapp: true,
    notifyEmail: true,
    source: 'manual',
  };
}

interface NewBookingAdvancedSectionProps {
  currency: 'MXN' | 'USD';
  timezone: string;
  selectedSlot: QuickSlotOption | null;
  catalogDurationMinutes: number;
  catalogPriceCents: number;
  activeDurationMinutes: number;
  state: NewBookingAdvancedState;
  onPatch: (patch: Partial<NewBookingAdvancedState>) => void;
  onToggleCustomOverride: (checked: boolean) => void;
}

export function NewBookingAdvancedSection({
  currency,
  timezone,
  selectedSlot,
  catalogDurationMinutes,
  catalogPriceCents,
  activeDurationMinutes,
  state,
  onPatch,
  onToggleCustomOverride,
}: NewBookingAdvancedSectionProps) {
  const activeAdvancedCount =
    (state.isRecurring ? 1 : 0) +
    (state.useCustomOverride ? 1 : 0) +
    (state.internalNotes.trim() ? 1 : 0) +
    (state.source === 'walk_in' ? 1 : 0);

  const computedEndIso = selectedSlot
    ? new Date(
        new Date(selectedSlot.startAt).getTime() + activeDurationMinutes * 60_000,
      ).toISOString()
    : null;

  return (
    <Collapsible
      className="ad-disclosure"
      defaultIsOpen={false}
      trigger={
        <HStack gap={2} align="center" wrap="wrap">
          <Text weight="semibold" size="sm">
            Más opciones
          </Text>
          <Text type="supporting" color="secondary">
            Repetir cita, precio, duración o notas internas
          </Text>
          {activeAdvancedCount > 0 ? (
            <StatusTag label={String(activeAdvancedCount)} tone="accent" hasTabularNumbers />
          ) : null}
        </HStack>
      }
    >
      <VStack gap={3} paddingBlockStart={3}>
        <VStack gap={2}>
          <Switch
            label="Repetir cita (retoque)"
            description="Agenda automáticamente la serie de retoques en el mismo horario; si una fecha está ocupada se omite."
            size="sm"
            value={state.isRecurring}
            onChange={(isRecurring) => onPatch({ isRecurring })}
          />

          {state.isRecurring ? (
            <VStack gap={2} paddingBlockStart={1}>
              <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
                <Selector
                  label="Cada cuándo"
                  size="sm"
                  value={String(state.recurrenceIntervalWeeks)}
                  onChange={(val) => {
                    if (val === '2' || val === '3' || val === '4') {
                      onPatch({ recurrenceIntervalWeeks: Number(val) as 2 | 3 | 4 });
                    }
                  }}
                  options={[
                    { value: '2', label: 'Cada 2 semanas' },
                    { value: '3', label: 'Cada 3 semanas' },
                    { value: '4', label: 'Cada 4 semanas' },
                  ]}
                />
                <NumberInput
                  label="Número de citas (2–6)"
                  value={state.recurrenceCount}
                  min={2}
                  max={6}
                  isIntegerOnly
                  onChange={(v) =>
                    onPatch({ recurrenceCount: Math.max(2, Math.min(6, Math.round(v || 2))) })
                  }
                />
              </Grid>
              <HStack gap={1.5} align="center">
                <Repeat size={13} aria-hidden="true" />
                <Text type="supporting" color="secondary" hasTabularNumbers>
                  Se agendarán {state.recurrenceCount} citas cada {state.recurrenceIntervalWeeks}{' '}
                  semanas.
                </Text>
              </HStack>
            </VStack>
          ) : null}
        </VStack>

        <Divider />

        <VStack gap={2}>
          <HStack justify="between" align="center" wrap="wrap" gap={2}>
            <Switch
              label="Cambiar precio o duración de esta cita"
              size="sm"
              value={state.useCustomOverride}
              onChange={onToggleCustomOverride}
            />
            <Text type="supporting" color="secondary" hasTabularNumbers>
              Catálogo: {formatDuration(catalogDurationMinutes)} ·{' '}
              {formatCurrency(catalogPriceCents, currency)}
            </Text>
          </HStack>

          {state.useCustomOverride ? (
            <VStack gap={2}>
              <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
                <NumberInput
                  label="Duración personalizada (min)"
                  value={state.customDuration}
                  min={15}
                  max={480}
                  onChange={(customDuration) => onPatch({ customDuration })}
                />
                <NumberInput
                  label={`Precio personalizado (${currency})`}
                  value={state.customPriceMxn}
                  min={0}
                  onChange={(customPriceMxn) => onPatch({ customPriceMxn })}
                />
              </Grid>
              {selectedSlot && computedEndIso ? (
                <Text type="supporting" color="secondary" hasTabularNumbers>
                  Horario final: {formatTimeInTimezone(selectedSlot.startAt, timezone)} –{' '}
                  {formatTimeInTimezone(computedEndIso, timezone)} (
                  {formatDuration(activeDurationMinutes)})
                </Text>
              ) : null}
            </VStack>
          ) : null}

          <TextArea
            label="Notas internas (solo equipo)"
            placeholder="Ej. Diseño largo #4, anticipo confirmado por Instagram, alergias..."
            value={state.internalNotes}
            onChange={(internalNotes) => onPatch({ internalNotes })}
            rows={2}
          />
        </VStack>

        <Divider />

        <HStack justify="between" align="center" wrap="wrap" gap={3}>
          <HStack gap={3} wrap="wrap">
            <Switch
              label="Avisar por WhatsApp"
              size="sm"
              value={state.notifyWhatsapp}
              onChange={(notifyWhatsapp) => onPatch({ notifyWhatsapp })}
            />
            <Switch
              label="Avisar por correo"
              size="sm"
              value={state.notifyEmail}
              onChange={(notifyEmail) => onPatch({ notifyEmail })}
            />
          </HStack>

          <SegmentedControl
            label="Cómo llegó"
            size="sm"
            value={state.source}
            onChange={(v) => onPatch({ source: v as 'manual' | 'walk_in' })}
          >
            <SegmentedControlItem value="manual" label="WhatsApp / Teléfono" />
            <SegmentedControlItem value="walk_in" label="Llegó sin cita" />
          </SegmentedControl>
        </HStack>
      </VStack>
    </Collapsible>
  );
}
