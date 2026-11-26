'use client';

import React, { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { PackagePlus } from 'lucide-react';
import type { InventoryItem } from '@/lib/types';
import { SurfaceCard } from '@/components/ui';

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

const CATEGORY_OPTIONS: Array<{ value: InventoryItem['category']; label: string }> = [
  { value: 'Gel / Esmalte', label: 'Gel / Esmalte' },
  { value: 'Acrílico', label: 'Acrílico' },
  { value: 'Insumo', label: 'Material de salón' },
  { value: 'Decoración', label: 'Decoración' },
  { value: 'Reventa', label: 'Para venta' },
];

export function InventoryItemForm({ onCreateItem }: InventoryItemFormProps) {
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
      if (ok) {
        setName('');
        setSku('');
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <SurfaceCard
      id="inventory-create-heading"
      icon={<PackagePlus size={16} aria-hidden="true" />}
      title="Agregar producto"
      subtitle="Define cuándo avisarte y si también se vende a tus clientas."
      padded
    >
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
          <Button
            type="submit"
            label="Guardar producto"
            variant="primary"
            icon={<PackagePlus size={15} aria-hidden="true" />}
            width="100%"
            isLoading={creating}
            isDisabled={name.trim().length < 2 || creating}
          />
        </VStack>
      </form>
    </SurfaceCard>
  );
}
