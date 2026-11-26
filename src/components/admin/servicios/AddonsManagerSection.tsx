'use client';

import type React from 'react';
import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Switch } from '@astryxdesign/core/Switch';
import { Divider } from '@astryxdesign/core/Divider';
import { Pencil, Save, Sparkles } from 'lucide-react';
import {
  ActionRow,
  EmptyStateCard,
  StatusTag,
  SurfaceCard,
} from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import type { ServiceAddon } from '@/lib/types';

interface AddonsManagerSectionProps {
  addons: ServiceAddon[];
  currency: 'MXN' | 'USD';
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}

export function AddonsManagerSection({
  addons,
  currency,
  onRefresh,
  onError,
  onNotice,
}: AddonsManagerSectionProps) {
  const [editingAddonId, setEditingAddonId] = useState<string | null>(null);
  const [addonName, setAddonName] = useState('');
  const [addonDesc, setAddonDesc] = useState('');
  const [addonMin, setAddonMin] = useState(15);
  const [addonPrice, setAddonPrice] = useState(100);
  const [savingAddon, setSavingAddon] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const startEditingAddon = (addon: ServiceAddon) => {
    setEditingAddonId(addon.id);
    setAddonName(addon.name);
    setAddonDesc(addon.description);
    setAddonMin(addon.extraMinutes);
    setAddonPrice(Math.round(addon.extraPriceCents / 100));
  };

  const resetAddonForm = () => {
    setEditingAddonId(null);
    setAddonName('');
    setAddonDesc('');
    setAddonMin(15);
    setAddonPrice(100);
  };

  const handleSaveAddon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addonName.trim().length < 2 || savingAddon) return;
    setSavingAddon(true);
    try {
      const existingAddon = editingAddonId
        ? addons.find((item) => item.id === editingAddonId)
        : null;
      const res = await fetch('/api/admin/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'addon',
          data: {
            ...(existingAddon ? { id: existingAddon.id, isActive: existingAddon.isActive } : {}),
            name: addonName.trim(),
            description: addonDesc.trim(),
            extraMinutes: addonMin,
            extraPriceCents: Math.round(addonPrice * 100),
            appliesToAll: true,
          },
        }),
      });
      if (res.ok) {
        const wasEditing = Boolean(editingAddonId);
        await onRefresh();
        resetAddonForm();
        onNotice(wasEditing ? 'Extra guardado' : 'Extra agregado');
      } else {
        const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
        onError(errJson?.error || 'No se pudo guardar el extra.');
      }
    } finally {
      setSavingAddon(false);
    }
  };

  const handleToggleAddonActive = async (addon: ServiceAddon, checked: boolean) => {
    if (togglingId) return;
    setTogglingId(addon.id);
    try {
      const res = await fetch('/api/admin/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'addon', data: { ...addon, isActive: checked } }),
      });
      if (res.ok) {
        await onRefresh();
        onNotice(checked ? `${addon.name} activado` : `${addon.name} pausado`);
      } else {
        onError('No se pudo actualizar el estado del extra.');
      }
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <VStack key="tab-addons" className="ad-split fx-step-in" gap={5}>
      <SurfaceCard
        id="addons-catalog-heading"
        title="Extras y diseños"
        subtitle="Se suman en tiempo y precio cuando tu clienta los agrega a su cita."
        count={addons.length}
      >
        {addons.length === 0 ? (
          <VStack className="ad-empty" gap={2}>
            <EmptyStateCard
              framed={false}
              isCompact
              icon={<Sparkles size={22} aria-hidden="true" />}
              title="Aún no tienes extras"
              description="Agrega opciones como retiro, french, efecto chrome o piedrería."
            />
          </VStack>
        ) : (
          <VStack as="ul" className="ad-row-list" gap={0}>
            {addons.map((addon) => {
              const isEditingThis = editingAddonId === addon.id;
              return (
                <li
                  key={addon.id}
                  className={togglingId === addon.id ? 'fx-busy' : undefined}
                  aria-busy={togglingId === addon.id || undefined}
                >
                  <ActionRow
                    title={addon.name}
                    subtitle={addon.description || undefined}
                    isSelected={isEditingThis}
                    isMuted={!addon.isActive}
                    onClick={() => startEditingAddon(addon)}
                    status={
                      <StatusTag
                        tone="neutral"
                        label={`+${addon.extraMinutes} min · +${formatCurrency(addon.extraPriceCents, currency)}`}
                        hasTabularNumbers
                      />
                    }
                    actions={
                      <HStack gap={2} align="center">
                        <Button
                          type="button"
                          label={isEditingThis ? 'Editando' : 'Editar'}
                          variant={isEditingThis ? 'primary' : 'ghost'}
                          size="sm"
                          icon={<Pencil size={13} aria-hidden="true" />}
                          onClick={() => startEditingAddon(addon)}
                        />
                        <Switch
                          label={`Activar ${addon.name}`}
                          isLabelHidden
                          size="sm"
                          value={addon.isActive}
                          isLoading={togglingId === addon.id}
                          onChange={(checked) => void handleToggleAddonActive(addon, checked)}
                        />
                      </HStack>
                    }
                  />
                </li>
              );
            })}
          </VStack>
        )}
      </SurfaceCard>

      <SurfaceCard
        id="addon-editor-heading"
        title={editingAddonId ? 'Editar extra' : 'Agregar extra o diseño'}
        subtitle="Aparecerá como opción adicional al reservar."
        actions={
          editingAddonId ? (
            <Button
              type="button"
              label="Cancelar"
              variant="ghost"
              size="sm"
              onClick={resetAddonForm}
            />
          ) : undefined
        }
      >
        <form onSubmit={handleSaveAddon}>
          <VStack
            gap={3}
            padding={5}
            className={savingAddon ? 'fx-busy' : undefined}
            aria-busy={savingAddon || undefined}
          >
            <TextInput
              label="Nombre"
              placeholder="Ej. Efecto Aura / Piedrería"
              value={addonName}
              onChange={setAddonName}
              isRequired
            />
            <TextInput
              label="Detalle breve"
              placeholder="Qué incluye o en cuántas uñas aplica"
              value={addonDesc}
              onChange={setAddonDesc}
            />
            <Grid columns={{ minWidth: 140, max: 2 }} gap={3}>
              <NumberInput
                label="Tiempo extra (min)"
                value={addonMin}
                min={0}
                max={240}
                isIntegerOnly
                onChange={setAddonMin}
              />
              <NumberInput
                label="Precio extra (MXN)"
                value={addonPrice}
                min={0}
                onChange={setAddonPrice}
              />
            </Grid>
            <Divider />
            <Button
              type="submit"
              label={
                savingAddon
                  ? 'Guardando...'
                  : editingAddonId
                    ? 'Guardar cambios'
                    : 'Agregar extra'
              }
              variant="primary"
              icon={<Save size={15} aria-hidden="true" />}
              width="100%"
              isLoading={savingAddon}
              isDisabled={addonName.trim().length < 2 || savingAddon}
            />
          </VStack>
        </form>
      </SurfaceCard>
    </VStack>
  );
}
