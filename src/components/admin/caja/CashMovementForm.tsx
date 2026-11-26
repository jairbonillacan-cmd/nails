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
import type { FormSubmitResult } from '@/lib/forms/form-submit';
import { FilterPillBar, type FilterPillOption } from '@/components/ui';
import type { FormDialogControls } from '@/components/ui/FormDialog';
import { FormDialogLauncher } from '@/components/ui/FormDialogLauncher';

export type QuickEntryType = 'expense' | 'product_sale' | 'service_income';

interface CashMovementFormProps {
  onRecordCashEntry: (input: {
    entryType: QuickEntryType;
    description: string;
    amountMxn: number;
    method: PaymentMethod;
  }) => Promise<FormSubmitResult>;
}

const ENTRY_TYPE_OPTIONS: readonly FilterPillOption<QuickEntryType>[] = [
  { value: 'expense', label: 'Gasto' },
  { value: 'product_sale', label: 'Venta' },
  { value: 'service_income', label: 'Otro ingreso' },
];

const PAYMENT_METHOD_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'card', label: 'Tarjeta' },
];

function isPaymentMethod(value: string): value is PaymentMethod {
  return PAYMENT_METHOD_OPTIONS.some((option) => option.value === value);
}

export function CashMovementForm({ onRecordCashEntry }: CashMovementFormProps) {
  return (
    <FormDialogLauncher
      triggerLabel="Registrar gasto o venta"
      title="Registrar gasto o venta"
      subtitle="Lo que entra o sale de caja fuera de una cita."
      isTriggerFullWidth
    >
      {(controls) => (
        <CashMovementFormBody onRecordCashEntry={onRecordCashEntry} controls={controls} />
      )}
    </FormDialogLauncher>
  );
}

function CashMovementFormBody({
  onRecordCashEntry,
  controls,
}: CashMovementFormProps & { controls: FormDialogControls }) {
  const [entryType, setEntryType] = useState<QuickEntryType>('expense');
  const [desc, setDesc] = useState('');
  const [amountMxn, setAmountMxn] = useState(150);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const { isSubmitting } = controls;

  const handleSubmitEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc.trim()) return;
    controls.submit(() =>
      onRecordCashEntry({
        entryType,
        description: desc.trim(),
        amountMxn,
        method,
      }),
    );
  };

  return (
    <form onSubmit={handleSubmitEntry}>
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
                : 'Ej. Propina o ajuste'
          }
          value={desc}
          onChange={setDesc}
          isRequired
        />
        <Grid columns={{ minWidth: 130, max: 2 }} gap={2}>
          <NumberInput label="Monto (MXN)" value={amountMxn} min={1} onChange={setAmountMxn} />
          <Selector
            label="Forma de pago"
            value={method}
            onChange={(v) => {
              if (v && isPaymentMethod(v)) setMethod(v);
            }}
            options={PAYMENT_METHOD_OPTIONS}
          />
        </Grid>
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
            label={
              entryType === 'expense'
                ? 'Guardar gasto'
                : entryType === 'product_sale'
                  ? 'Guardar venta'
                  : 'Guardar ingreso'
            }
            variant="primary"
            icon={<Plus size={15} aria-hidden="true" />}
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !desc.trim()}
          />
        </HStack>
      </VStack>
    </form>
  );
}
