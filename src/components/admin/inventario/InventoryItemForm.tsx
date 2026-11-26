'use client';

import type React from 'react';
import { useState } from 'react';
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
import type { FormSubmitResult } from '@/lib/forms/form-submit';
import type { FormDialogControls } from '@/components/ui/FormDialog';
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
  onCreateItem: (item: NewInventoryItemInput) => Promise<FormSubmitResult>;
}

export function InventoryItemForm({ onCreateItem }: InventoryItemFormProps) {
  return (
    <FormDialogLauncher
      triggerLabel="Agregar producto"
      title="Agregar producto"
      subtitle="Cuánto tienes, cuándo avisarte y si también lo vendes."
      icon={<PackagePlus size={16} aria-hidden="true" />}
    >
      {(controls) => <InventoryItemFormBody onCreateItem={onCreateItem} controls={controls} />}
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

export function inventoryCategoryLabel(category: InventoryItem['category']): string {
  return CATEGORY_OPTIONS.find((opt) => opt.value === category)?.label ?? category;
}

function InventoryItemFormBody({
  onCreateItem,
  controls,
}: InventoryItemFormProps & { controls: FormDialogControls }) {
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState<InventoryItem['category']>('Gel / Esmalte');
  const [unit, setUnit] = useState('frasco');
  const [stock, setStock] = useState(5);
  const [minAlert, setMinAlert] = useState(2);
  const [costMxn, setCostMxn] = useState(150);
  const [retailMxn, setRetailMxn] = useState(0);
  const [isForRetail, setIsForRetail] = useState(false);
  const { isSubmitting } = controls;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return;
    const generatedCode = sku.trim() || `PROD-${String(Date.now()).slice(-4)}`;
    controls.submit(() =>
      onCreateItem({
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
      }),
    );
  };

  return (
    <form onSubmit={handleSubmit}>
      <VStack gap={3}>
        <TextInput
          label="Nombre"
          placeholder="Ej. Top coat brillante"
          value={name}
          onChange={setName}
          isRequired
        />
        <Grid columns={{ minWidth: 130, max: 2 }} gap={2}>
          <Selector
            label="Categoría"
            value={category}
            onChange={(v) => {
              const next = CATEGORY_OPTIONS.find((option) => option.value === v);
              if (next) setCategory(next.value);
            }}
            options={CATEGORY_OPTIONS}
          />
          <TextInput
            label="Se cuenta por"
            placeholder="Ej. frasco o pieza"
            value={unit}
            onChange={setUnit}
          />
        </Grid>
        <Grid columns={{ minWidth: 130, max: 2 }} gap={2}>
          <NumberInput
            label="Tienes ahora"
            value={stock}
            min={0}
            isIntegerOnly
            onChange={setStock}
          />
          <NumberInput
            label="Avisarme si quedan"
            value={minAlert}
            min={0}
            isIntegerOnly
            onChange={setMinAlert}
          />
        </Grid>
        <NumberInput
          label="Te costó (MXN)"
          value={costMxn}
          min={0}
          onChange={setCostMxn}
        />
        <Switch
          label="También lo vendo a clientas"
          description="Al venderlo se suma solo a Caja."
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
        <TextInput
          label="Código interno"
          description="Si lo dejas vacío lo creamos por ti."
          placeholder="Ej. GEL-01"
          value={sku}
          onChange={setSku}
          isOptional
        />
        <HStack gap={2} justify="end" wrap="wrap">
          <Button
            type="button"
            label="Cancelar"
            variant="secondary"
            isDisabled={isSubmitting}
            onClick={controls.close}
          />
          <Button
            type="submit"
            label="Guardar producto"
            variant="primary"
            icon={<PackagePlus size={15} aria-hidden="true" />}
            isLoading={isSubmitting}
            isDisabled={name.trim().length < 2 || isSubmitting}
          />
        </HStack>
      </VStack>
    </form>
  );
}
