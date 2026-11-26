'use client';

import React, { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Plus } from 'lucide-react';
import type { PaymentMethod } from '@/lib/types';
import { FilterPillBar, type FilterPillOption } from '@/components/ui';
import { FormDialogLauncher } from '@/components/ui/FormDialogLauncher';

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
  return (
    <FormDialogLauncher
      triggerLabel="Registrar gasto o venta"
      title="Registrar gasto o venta"
      subtitle="Lo que entra o sale de caja fuera de una cita."
      isTriggerFullWidth
    >
      {(close) => <CashMovementFormBody onRecordCashEntry={onRecordCashEntry} onDone={close} />}
    </FormDialogLauncher>
  );
}

function CashMovementFormBody({
  onRecordCashEntry,
  onDone,
}: CashMovementFormProps & { onDone: () => void }) {
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
      if (ok) onDone();
    } finally {
      setSavingEntry(false);
    }
  };

  return (
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
          <HStack gap={2} justify="end" wrap="wrap">
            <Button type="button" label="Cancelar" variant="secondary" isDisabled={savingEntry} onClick={onDone} />
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
              isLoading={savingEntry}
              isDisabled={savingEntry || !desc.trim()}
            />
          </HStack>
        </VStack>
      </form>
  );
}
