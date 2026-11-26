'use client';

import React, { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { PackagePlus } from 'lucide-react';
import type { InventoryItem } from '@/lib/types';
import { FormDialogLauncher } from '@/components/ui/FormDialogLauncher';

export interface NewInventoryItemInput {
  sku: string;
  name: string;
  category: InventoryItem['category'];
  unit: string;
  stockQuantity: number;
  minStockAlert: number;
  costCents: number;
  retailPriceCents: number;
  isForRetail: boolean;
  isActive: true;
}

interface InventoryItemFormProps {
  onCreateItem: (item: NewInventoryItemInput) => Promise<boolean>;
}

export function InventoryItemForm({ onCreateItem }: InventoryItemFormProps) {
  return (
    <FormDialogLauncher
      triggerLabel="Agregar producto"
      title="Agregar producto"
      subtitle="Cuánto tienes, cuándo avisarte y si también lo vendes."
      icon={<PackagePlus size={16} aria-hidden="true" />}
    >
      {(close) => <InventoryItemFormBody onCreateItem={onCreateItem} onDone={close} />}
    </FormDialogLauncher>
  );
}

const CATEGORY_OPTIONS: Array<{ value: InventoryItem['category']; label: string }> = [
  { value: 'Gel / Esmalte', label: 'Gel / Esmalte' },
  { value: 'Acrílico', label: 'Acrílico' },
  { value: 'Insumo', label: 'Material de salón' },
  { value: 'Decoración', label: 'Decoración' },
  { value: 'Reventa', label: 'Para venta' },
];

function InventoryItemFormBody({
  onCreateItem,
  onDone,
}: InventoryItemFormProps & { onDone: () => void }) {
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState<InventoryItem['category']>('Gel / Esmalte');
  const [unit, setUnit] = useState('frasco');
  const [stock, setStock] = useState(5);
  const [minAlert, setMinAlert] = useState(2);
  const [costMxn, setCostMxn] = useState(150);
  const [retailMxn, setRetailMxn] = useState(0);
  const [isForRetail, setIsForRetail] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2 || creating) return;
    setCreating(true);
    try {
      const generatedCode = sku.trim() || `PROD-${String(Date.now()).slice(-4)}`;
      const ok = await onCreateItem({
        sku: generatedCode,
        name: name.trim(),
        category,
        unit: unit.trim() || 'pieza',
        stockQuantity: stock,
        minStockAlert: minAlert,
        costCents: Math.round(costMxn * 100),
        retailPriceCents: isForRetail ? Math.round(retailMxn * 100) : 0,
        isForRetail,
        isActive: true,
      });
      if (ok) onDone();
    } finally {
      setCreating(false);
    }
  };

  return (
      <form onSubmit={(e) => void handleSubmit(e)}>
        <VStack gap={3}>
          <TextInput
            label="Nombre"
            placeholder="Ej. Top Coat Gloss Sin Capa"
            value={name}
            onChange={setName}
            isRequired
          />
          <Grid columns={{ minWidth: 130, max: 2 }} gap={2}>
            <TextInput
              label="Código"
              placeholder="Ej. GEL-01"
              value={sku}
              onChange={setSku}
              isOptional
            />
            <Selector
              label="Categoría"
              value={category}
              onChange={(v) => v && setCategory(v as InventoryItem['category'])}
              options={CATEGORY_OPTIONS}
            />
          </Grid>
          <Grid columns={{ minWidth: 96, max: 3 }} gap={2}>
            <NumberInput
              label="Cantidad"
              value={stock}
              min={0}
              isIntegerOnly
              onChange={setStock}
            />
            <NumberInput
              label="Avisar en"
              value={minAlert}
              min={0}
              isIntegerOnly
              onChange={setMinAlert}
            />
            <TextInput label="Unidad" value={unit} onChange={setUnit} />
          </Grid>
          <NumberInput
            label="Precio de compra (MXN)"
            value={costMxn}
            min={0}
            onChange={setCostMxn}
          />
          <Switch
            label="También se vende a clientas (se suma directo a Caja)"
            value={isForRetail}
            onChange={setIsForRetail}
          />
          {isForRetail ? (
            <NumberInput
              label="Precio de venta (MXN)"
              value={retailMxn}
              min={0}
              onChange={setRetailMxn}
            />
          ) : null}
          <HStack gap={2} justify="end" wrap="wrap">
            <Button type="button" label="Cancelar" variant="secondary" isDisabled={creating} onClick={onDone} />
            <Button
              type="submit"
              label="Guardar producto"
              variant="primary"
              icon={<PackagePlus size={15} aria-hidden="true" />}
              isLoading={creating}
              isDisabled={name.trim().length < 2 || creating}
            />
          </HStack>
        </VStack>
      </form>
  );
}
