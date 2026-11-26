'use client';

import React, { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Plus } from 'lucide-react';
import type { PaymentMethod } from '@/lib/types';
import { FilterPillBar, SurfaceCard, type FilterPillOption } from '@/components/ui';

export type QuickEntryType = 'expense' | 'product_sale' | 'service_income';

interface CashMovementFormProps {
  onRecordCashEntry: (input: {
    entryType: QuickEntryType;
    description: string;
    amountMxn: number;
    method: PaymentMethod;
  }) => Promise<boolean>;
}

const ENTRY_TYPE_OPTIONS: readonly FilterPillOption<QuickEntryType>[] = [
  { value: 'expense', label: 'Registrar gasto' },
  { value: 'product_sale', label: 'Registrar venta' },
  { value: 'service_income', label: 'Otro ingreso' },
];

export function CashMovementForm({ onRecordCashEntry }: CashMovementFormProps) {
  const [entryType, setEntryType] = useState<QuickEntryType>('expense');
  const [desc, setDesc] = useState('');
  const [amountMxn, setAmountMxn] = useState(150);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [savingEntry, setSavingEntry] = useState(false);

  const handleSubmitEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc.trim() || savingEntry) return;
    setSavingEntry(true);
    try {
      const ok = await onRecordCashEntry({
        entryType,
        description: desc.trim(),
        amountMxn,
        method,
      });
      if (ok) {
        setDesc('');
      }
    } finally {
      setSavingEntry(false);
    }
  };

  return (
    <SurfaceCard title="Registrar gasto o venta" headingLevel={3} padded>
      <form onSubmit={(e) => void handleSubmitEntry(e)}>
        <VStack gap={3}>
          <FilterPillBar
            ariaLabel="Tipo de movimiento"
            mode="pills"
            size="sm"
            value={entryType}
            options={ENTRY_TYPE_OPTIONS}
            onChange={setEntryType}
          />
          <TextInput
            label="Descripción"
            placeholder={
              entryType === 'expense'
                ? 'Ej. Compra de limas y acetona'
                : entryType === 'product_sale'
                  ? 'Ej. Aceite de cutícula'
                  : 'Ej. Ajuste o ingreso adicional'
            }
            value={desc}
            onChange={setDesc}
            isRequired
          />
          <Grid columns={{ minWidth: 130, max: 2 }} gap={2}>
            <NumberInput
              label="Monto (MXN)"
              value={amountMxn}
              min={1}
              onChange={setAmountMxn}
            />
            <Selector
              label="Forma de pago"
              value={method}
              onChange={(v) => v && setMethod(v as PaymentMethod)}
              options={[
                { value: 'cash', label: 'Efectivo' },
                { value: 'transfer', label: 'Transferencia SPEI' },
                { value: 'card', label: 'Tarjeta' },
              ]}
            />
          </Grid>
          <Button
            type="submit"
            label={
              entryType === 'expense'
                ? 'Guardar gasto'
                : entryType === 'product_sale'
                  ? 'Guardar venta'
                  : 'Guardar ingreso'
            }
            variant="primary"
            icon={<Plus size={15} aria-hidden="true" />}
            width="100%"
            isLoading={savingEntry}
            isDisabled={savingEntry || !desc.trim()}
          />
        </VStack>
      </form>
    </SurfaceCard>
  );
}
