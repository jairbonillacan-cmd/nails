'use client';

import type React from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { Divider } from '@astryxdesign/core/Divider';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Save, SlidersHorizontal } from 'lucide-react';
import { StatusTag } from '@/components/ui';
import type { Service } from '@/lib/types';

interface CategoryOption {
  value: string;
  label: string;
}

interface ServiceEditorPanelProps {
  draft: Partial<Service>;
  categoryOptions: readonly CategoryOption[];
  defaultDepositCents: number;
  hasCleanupTime: boolean;
  hasCustomAdvancedValues: boolean;
  isDirty: boolean;
  saving: boolean;
  onChangeDraft: (next: Partial<Service>) => void;
  onToggleCleanupTime: (checked: boolean) => void;
  onCancel: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function ServiceEditorPanel({
  draft,
  categoryOptions,
  defaultDepositCents,
  hasCleanupTime,
  hasCustomAdvancedValues,
  isDirty,
  saving,
  onChangeDraft,
  onToggleCleanupTime,
  onCancel,
  onSubmit,
}: ServiceEditorPanelProps) {
  return (
      <form onSubmit={onSubmit}>
        <VStack
          gap={3}
          className={saving ? 'fx-busy' : undefined}
          aria-busy={saving || undefined}
        >
          <TextInput
            label="Nombre"
            placeholder="Ej. Rubber / Uñas acrílicas"
            value={draft.name || ''}
            onChange={(v) => onChangeDraft({ ...draft, name: v })}
            isRequired
          />

          <VStack gap={2}>
            <Grid columns={{ minWidth: 140, max: 2 }} gap={3}>
              <NumberInput
                label="Precio (MXN)"
                value={(draft.priceCents ?? 0) / 100}
                min={0}
                onChange={(v) =>
                  onChangeDraft({ ...draft, priceCents: Math.round(v * 100) })
                }
              />
              <NumberInput
                label="Duración (min)"
                value={draft.durationMinutes ?? 60}
                min={15}
                max={480}
                isIntegerOnly
                onChange={(v) => onChangeDraft({ ...draft, durationMinutes: v })}
              />
            </Grid>
            <Switch
              label='Precio "Desde"'
              description='Muestra "Desde $..." si el precio varía por largo o diseño.'
              size="sm"
              value={Boolean(draft.isStartingPrice)}
              onChange={(v) => onChangeDraft({ ...draft, isStartingPrice: v })}
            />
          </VStack>

          <Selector
            label="Categoría"
            value={draft.categoryId ?? ''}
            onChange={(v) => onChangeDraft({ ...draft, categoryId: v || null })}
            options={[...categoryOptions]}
          />

          <Divider />

          <Collapsible
            className="ad-disclosure"
            defaultIsOpen={false}
            trigger={
              <HStack justify="between" align="center" gap={2} width="100%">
                <HStack gap={2} align="center">
                  <SlidersHorizontal size={14} aria-hidden="true" />
                  <Text weight="semibold" size="sm">
                    Más opciones
                  </Text>
                </HStack>
                <Text type="supporting" color="secondary">
                  {hasCustomAdvancedValues ? 'Personalizado' : 'Limpieza, anticipo, link privado'}
                </Text>
              </HStack>
            }
          >
            <VStack gap={3} paddingBlockStart={3}>
              <TextArea
                label="Descripción"
                placeholder="Cuenta qué incluye la técnica para ahorrar preguntas por mensaje."
                value={draft.description || ''}
                onChange={(v) => onChangeDraft({ ...draft, description: v })}
                rows={2}
              />

              <Divider />

              <VStack gap={2}>
                <Switch
                  label="Tiempo de limpieza entre citas"
                  description="Bloquea minutos extra antes o después de este servicio para limpiar tu mesa."
                  value={hasCleanupTime}
                  onChange={onToggleCleanupTime}
                />
                {hasCleanupTime ? (
                  <Grid columns={{ minWidth: 140, max: 2 }} gap={2}>
                    <NumberInput
                      label="Antes de la cita (min)"
                      value={draft.bufferBeforeMinutes ?? 0}
                      min={0}
                      max={120}
                      isIntegerOnly
                      onChange={(v) =>
                        onChangeDraft({ ...draft, bufferBeforeMinutes: v })
                      }
                    />
                    <NumberInput
                      label="Después de la cita (min)"
                      value={draft.bufferAfterMinutes ?? 0}
                      min={0}
                      max={120}
                      isIntegerOnly
                      onChange={(v) =>
                        onChangeDraft({ ...draft, bufferAfterMinutes: v })
                      }
                    />
                  </Grid>
                ) : null}
              </VStack>

              <Divider />

              <VStack gap={2}>
                <Switch
                  label="Anticipo distinto"
                  description="Pide un monto específico de anticipo para este servicio."
                  value={Boolean(draft.depositRequired)}
                  onChange={(v) => onChangeDraft({ ...draft, depositRequired: v })}
                />
                {draft.depositRequired ? (
                  <NumberInput
                    label="Monto de anticipo (MXN)"
                    value={(draft.depositAmountCents ?? defaultDepositCents) / 100}
                    min={0}
                    onChange={(v) =>
                      onChangeDraft({
                        ...draft,
                        depositAmountCents: Math.round(v * 100),
                      })
                    }
                  />
                ) : null}
              </VStack>

              <Divider />

              <Switch
                label="Solo con link privado"
                description="No se ve en tu página pública; solo pueden reservar quienes tengan su link."
                value={Boolean(draft.isPrivate)}
                onChange={(v) => onChangeDraft({ ...draft, isPrivate: v })}
              />

              <Switch
                label="Permitir foto de inspiración"
                value={Boolean(draft.allowInspoPhoto)}
                onChange={(v) => onChangeDraft({ ...draft, allowInspoPhoto: v })}
              />

              <Switch
                label="Confirmar manualmente antes de aprobar"
                value={Boolean(draft.requiresConfirmation)}
                onChange={(v) =>
                  onChangeDraft({ ...draft, requiresConfirmation: v })
                }
              />
            </VStack>
          </Collapsible>

          <HStack gap={2} justify="end" align="center" wrap="wrap">
            {isDirty && !saving ? <StatusTag label="Sin guardar" tone="warning" className="fx-pop" /> : null}
            <Button type="button" label="Cancelar" variant="secondary" isDisabled={saving} onClick={onCancel} />
            <Button
              type="submit"
              label={saving ? 'Guardando...' : draft.id ? 'Guardar cambios' : 'Crear servicio'}
              variant="primary"
              icon={<Save size={15} aria-hidden="true" />}
              isLoading={saving}
              isDisabled={!isDirty || saving}
            />
          </HStack>
        </VStack>
      </form>
  );
}
