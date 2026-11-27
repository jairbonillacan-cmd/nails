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
import { Check, Trash2 } from 'lucide-react';
import { formatDateShortInTimezone, formatTimeInTimezone } from '@/lib/format';
import type { CashRegisterEntry, PaymentMethod, StaffMember } from '@/lib/types';
import type { FormSubmitResult } from '@/lib/forms/form-submit';
import { FilterPillBar, type FilterPillOption } from '@/components/ui';
import { FormDialog, type FormDialogControls } from '@/components/ui/FormDialog';
import type { UpdateCajaCashEntryInput } from './cajaActions';

type EditableEntryType = 'expense' | 'product_sale' | 'service_income';

const EDIT_ENTRY_TYPE_OPTIONS: readonly FilterPillOption<EditableEntryType>[] = [
  { value: 'product_sale', label: 'Venta' },
  { value: 'expense', label: 'Gasto' },
  { value: 'service_income', label: 'Otro ingreso' },
];

const PAYMENT_METHOD_OPTIONS: readonly FilterPillOption<PaymentMethod>[] = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'transfer', label: 'Transferencia' },
];

const NO_STAFF_VALUE = '__none__';
const MANUAL_CASH_EDIT_FORM_ID = 'caja-manual-cash-edit-form';

function resolveEditableType(entryType: CashRegisterEntry['entryType']): EditableEntryType {
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
  tz: string;
  expenseCategories: readonly string[];
  onOpenChange: (open: boolean) => void;
  onRequestDelete: (entry: CashRegisterEntry) => void;
  onUpdateEntry: (entryId: string, input: UpdateCajaCashEntryInput) => Promise<FormSubmitResult>;
}

function ManualCashEditFormBody({
  entry,
  staff,
  currency,
  tz,
  expenseCategories,
  onUpdateEntry,
  controls,
}: {
  entry: CashRegisterEntry;
  staff: readonly StaffMember[];
  currency: 'MXN' | 'USD';
  tz: string;
  expenseCategories: readonly string[];
  onUpdateEntry: (entryId: string, input: UpdateCajaCashEntryInput) => Promise<FormSubmitResult>;
  controls: FormDialogControls;
}) {
  const [entryType, setEntryType] = useState<EditableEntryType>(() =>
    resolveEditableType(entry.entryType),
  );
  const [description, setDescription] = useState(entry.description);
  const [amountMxn, setAmountMxn] = useState<number>(() =>
    Number((Math.abs(entry.amountCents) / 100).toFixed(2)),
  );
  const [tipMxn, setTipMxn] = useState<number>(() =>
    Number((Math.max(0, entry.tipCents) / 100).toFixed(2)),
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
        .map((member) => ({ value: member.id, label: member.name })),
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
        tipMxn: entryType === 'expense' ? 0 : Math.max(0, tipMxn || 0),
      }),
    );
  };

  return (
    <form id={MANUAL_CASH_EDIT_FORM_ID} onSubmit={handleSubmit}>
      <VStack gap={4}>
        <Text type="supporting" color="secondary" hasTabularNumbers>
          Registró {entry.recordedBy} · {formatDateShortInTimezone(entry.occurredAt, tz)}{' '}
          {formatTimeInTimezone(entry.occurredAt, tz)}
        </Text>

        <FilterPillBar
          ariaLabel="Tipo de movimiento"
          mode="segmented"
          size="sm"
          value={entryType}
          options={EDIT_ENTRY_TYPE_OPTIONS}
          onChange={setEntryType}
        />

        {entryType === 'expense' && expenseCategories.length > 0 ? (
          <HStack gap={1.5} wrap="wrap" role="group" aria-label="Categorías de gasto">
            {expenseCategories.map((preset) => (
              <Button
                key={preset}
                type="button"
                label={preset}
                variant={description === preset ? 'primary' : 'secondary'}
                size="sm"
                className="ad-caja-preset-chip"
                aria-pressed={description === preset}
                onClick={() => setDescription(preset)}
              />
            ))}
          </HStack>
        ) : null}

        <TextInput label="Concepto" value={description} onChange={setDescription} isRequired />

        <Grid columns={{ minWidth: 130, max: 2 }} gap={3}>
          <NumberInput
            label={`Monto (${currency})`}
            value={amountMxn}
            min={0}
            onChange={setAmountMxn}
          />
          {entryType !== 'expense' ? (
            <NumberInput
              label={`Propina (${currency})`}
              value={tipMxn}
              min={0}
              onChange={setTipMxn}
            />
          ) : null}
        </Grid>

        <VStack gap={1.5}>
          <Text size="sm" weight="semibold">
            Forma de pago
          </Text>
          <FilterPillBar
            ariaLabel="Forma de pago"
            mode="segmented"
            size="sm"
            value={method}
            options={PAYMENT_METHOD_OPTIONS}
            onChange={setMethod}
          />
        </VStack>

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
  tz,
  expenseCategories,
  onOpenChange,
  onRequestDelete,
  onUpdateEntry,
}: ManualCashEditDialogProps) {
  return (
    <FormDialog
      isOpen={Boolean(entry)}
      onOpenChange={onOpenChange}
      title="Editar movimiento"
      subtitle="Solo los movimientos manuales (fuera de cita) se pueden corregir."
      submitFooter={{
        formId: MANUAL_CASH_EDIT_FORM_ID,
        submitLabel: 'Guardar cambios',
        submitIcon: <Check size={14} aria-hidden="true" />,
        secondaryAction: entry ? (
          <Button
            type="button"
            label="Eliminar"
            variant="ghost"
            className="ad-caja-delete-btn"
            icon={<Trash2 size={14} aria-hidden="true" />}
            onClick={() => onRequestDelete(entry)}
          />
        ) : undefined,
      }}
    >
      {(controls) =>
        entry ? (
          <ManualCashEditFormBody
            entry={entry}
            staff={staff}
            currency={currency}
            tz={tz}
            expenseCategories={expenseCategories}
            onUpdateEntry={onUpdateEntry}
            controls={controls}
          />
        ) : null
      }
    </FormDialog>
  );
}
