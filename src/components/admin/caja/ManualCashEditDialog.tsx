'use client';

import type React from 'react';
import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Check } from 'lucide-react';
import type { CashRegisterEntry, PaymentMethod, StaffMember } from '@/lib/types';
import type { FormSubmitResult } from '@/lib/forms/form-submit';
import { FilterPillBar, type FilterPillOption } from '@/components/ui';
import { FormDialog, type FormDialogControls } from '@/components/ui/FormDialog';
import type { UpdateCajaCashEntryInput } from './cajaActions';
import { NAIL_SALON_EXPENSE_PRESETS } from './cajaMetrics';

type EditableEntryType = 'expense' | 'product_sale' | 'service_income';

const EDIT_ENTRY_TYPE_OPTIONS: readonly FilterPillOption<EditableEntryType>[] = [
  { value: 'expense', label: 'Gasto' },
  { value: 'product_sale', label: 'Venta producto' },
  { value: 'service_income', label: 'Otro ingreso' },
];

const PAYMENT_METHOD_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'transfer', label: 'Transferencia' },
];

const NO_STAFF_VALUE = '__none__';
const MANUAL_CASH_EDIT_FORM_ID = 'caja-manual-cash-edit-form';

function resolveEditableType(
  entryType: CashRegisterEntry['entryType'],
): EditableEntryType {
  if (entryType === 'expense') return 'expense';
  if (entryType === 'product_sale') return 'product_sale';
  return 'service_income';
}

function resolveEditableMethod(method: PaymentMethod): PaymentMethod {
  if (method === 'cash' || method === 'card' || method === 'transfer') return method;
  return 'cash';
}

interface ManualCashEditDialogProps {
  entry: CashRegisterEntry | null;
  staff: readonly StaffMember[];
  currency: 'MXN' | 'USD';
  onOpenChange: (open: boolean) => void;
  onUpdateEntry: (
    entryId: string,
    input: UpdateCajaCashEntryInput,
  ) => Promise<FormSubmitResult>;
}

function ManualCashEditFormBody({
  entry,
  staff,
  currency,
  onUpdateEntry,
  controls,
}: {
  entry: CashRegisterEntry;
  staff: readonly StaffMember[];
  currency: 'MXN' | 'USD';
  onUpdateEntry: (
    entryId: string,
    input: UpdateCajaCashEntryInput,
  ) => Promise<FormSubmitResult>;
  controls: FormDialogControls;
}) {
  const [entryType, setEntryType] = useState<EditableEntryType>(() =>
    resolveEditableType(entry.entryType),
  );
  const [description, setDescription] = useState(entry.description);
  const [amountMxn, setAmountMxn] = useState<number>(() =>
    Number((Math.abs(entry.amountCents) / 100).toFixed(2)),
  );
  const [method, setMethod] = useState<PaymentMethod>(() =>
    resolveEditableMethod(entry.paymentMethod),
  );
  const [staffId, setStaffId] = useState<string>(entry.staffId ?? NO_STAFF_VALUE);

  const staffOptions = useMemo(
    () => [
      { value: NO_STAFF_VALUE, label: 'Sin profesional asignada' },
      ...staff
        .filter((member) => member.isActive || member.id === entry.staffId)
        .map((member) => ({
          value: member.id,
          label: member.name,
        })),
    ],
    [staff, entry.staffId],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || amountMxn <= 0) return;
    controls.submit(() =>
      onUpdateEntry(entry.id, {
        entryType,
        description: description.trim(),
        amountMxn,
        method,
        staffId: staffId === NO_STAFF_VALUE ? null : staffId,
      }),
    );
  };

  return (
    <form id={MANUAL_CASH_EDIT_FORM_ID} onSubmit={handleSubmit}>
      <VStack gap={3}>
        <FilterPillBar
          ariaLabel="Tipo de movimiento"
          mode="pills"
          size="sm"
          value={entryType}
          options={EDIT_ENTRY_TYPE_OPTIONS}
          onChange={setEntryType}
        />

        {entryType === 'expense' ? (
          <VStack gap={1.5}>
            <Text type="supporting" color="secondary">
              Categorías rápidas del salón
            </Text>
            <HStack gap={1.5} wrap="wrap">
              {NAIL_SALON_EXPENSE_PRESETS.map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  label={preset}
                  variant="secondary"
                  size="sm"
                  className="ad-caja-preset-chip"
                  onClick={() => setDescription(preset)}
                />
              ))}
            </HStack>
          </VStack>
        ) : null}

        <TextInput
          label="Descripción"
          value={description}
          onChange={setDescription}
          isRequired
        />

        <Grid columns={{ minWidth: 130, max: 2 }} gap={2}>
          <NumberInput
            label={`Monto (${currency})`}
            value={amountMxn}
            min={1}
            onChange={setAmountMxn}
          />
          <Selector
            label="Forma de pago"
            value={method}
            onChange={(v) => {
              if (v === 'cash' || v === 'card' || v === 'transfer') setMethod(v);
            }}
            options={PAYMENT_METHOD_OPTIONS}
          />
        </Grid>

        {staffOptions.length > 1 ? (
          <Selector
            label="Profesional"
            isOptional
            value={staffId}
            onChange={(v) => setStaffId(v || NO_STAFF_VALUE)}
            options={staffOptions}
          />
        ) : null}
      </VStack>
    </form>
  );
}

export function ManualCashEditDialog({
  entry,
  staff,
  currency,
  onOpenChange,
  onUpdateEntry,
}: ManualCashEditDialogProps) {
  return (
    <FormDialog
      isOpen={Boolean(entry)}
      onOpenChange={onOpenChange}
      title="Editar movimiento manual"
      subtitle="Solo los movimientos manuales fuera de cita pueden modificarse."
      submitFooter={{
        formId: MANUAL_CASH_EDIT_FORM_ID,
        submitLabel: 'Guardar cambios',
        submitIcon: <Check size={14} aria-hidden="true" />,
      }}
    >
      {(controls) =>
        entry ? (
          <ManualCashEditFormBody
            entry={entry}
            staff={staff}
            currency={currency}
            onUpdateEntry={onUpdateEntry}
            controls={controls}
          />
        ) : null
      }
    </FormDialog>
  );
}
