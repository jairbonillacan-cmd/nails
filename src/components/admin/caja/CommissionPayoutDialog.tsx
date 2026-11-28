'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Banknote } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import type { PaymentMethod } from '@/lib/types';
import type { FormSubmitResult } from '@/lib/forms/form-submit';
import { FilterPillBar, type FilterPillOption } from '@/components/ui';
import { FormDialog } from '@/components/ui/FormDialog';
import type { RecordCajaEntryInput } from './cajaActions';
import type { CommissionPayoutDraft } from './cajaMetrics';

const PAYMENT_METHOD_OPTIONS: readonly FilterPillOption<PaymentMethod>[] = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'transfer', label: 'Transferencia' },
];

const PAYOUT_FORM_ID = 'caja-payout-form';

interface CommissionPayoutDialogProps {
  draft: CommissionPayoutDraft;
  currency: 'MXN' | 'USD';
  onOpenChange: (open: boolean) => void;
  onRecordCashEntry: (input: RecordCajaEntryInput) => Promise<FormSubmitResult>;
}

export function CommissionPayoutDialog({
  draft,
  currency,
  onOpenChange,
  onRecordCashEntry,
}: CommissionPayoutDialogProps) {
  const [method, setMethod] = useState<PaymentMethod>(draft.method);
  const [amountMxn, setAmountMxn] = useState<number>(draft.amountMxn);
  const [note, setNote] = useState('');
  const amountCents = Math.max(0, Math.round((amountMxn || 0) * 100));
  const isPartial = amountCents !== draft.totalCents;

  const rows: Array<{ label: string; cents: number }> = [
    { label: 'Comisión por servicios', cents: draft.serviceCommissionCents },
    { label: 'Comisión por productos', cents: draft.retailCommissionCents },
    { label: 'Otras comisiones', cents: draft.otherCommissionCents },
    { label: 'Propinas', cents: draft.tipsCents },
  ].filter((row) => row.cents > 0 || row.label === 'Comisión por servicios');

  return (
    <FormDialog
      isOpen
      onOpenChange={onOpenChange}
      title={`Pagar a ${draft.staffName}`}
      subtitle={`Comisiones y propinas · ${draft.periodLabel}. Se registra como gasto en caja.`}
      submitFooter={{
        formId: PAYOUT_FORM_ID,
        submitLabel: `Registrar pago de ${formatCurrency(amountCents, currency)}`,
        submitIcon: <Banknote size={15} aria-hidden="true" />,
        isSubmitDisabled: amountCents <= 0,
      }}
    >
      {(controls) => (
        <form
          id={PAYOUT_FORM_ID}
          onSubmit={(e) => {
            e.preventDefault();
            if (amountCents <= 0) return;
            const cleanNote = note.trim();
            controls.submit(() =>
              onRecordCashEntry({
                entryType: 'expense',
                description: cleanNote ? `${draft.description} · ${cleanNote}` : draft.description,
                amountMxn: amountCents / 100,
                method,
                staffId: draft.staffId,
              }),
            );
          }}
        >
          <VStack gap={4}>
            <VStack className="ad-subpanel ad-caja-reconcile" gap={0}>
              {rows.map((row) => (
                <HStack key={row.label} justify="between" align="center" className="ad-kv-row">
                  <Text type="supporting" color="secondary">
                    {row.label}
                  </Text>
                  <Text weight="medium" hasTabularNumbers>
                    {formatCurrency(row.cents, currency)}
                  </Text>
                </HStack>
              ))}
              <HStack justify="between" align="center" className="ad-kv-row">
                <Text weight="semibold">Total a entregar</Text>
                <Text weight="bold" hasTabularNumbers>
                  {formatCurrency(draft.totalCents, currency)}
                </Text>
              </HStack>
            </VStack>

            <VStack gap={3}>
              <NumberInput
                label={`Monto que entregas (${currency})`}
                description={isPartial ? 'Pago parcial o ajustado' : 'Total calculado'}
                value={amountMxn}
                min={0}
                onChange={setAmountMxn}
              />
              <VStack gap={1.5}>
                <Text size="sm" weight="semibold">
                  Forma de pago
                </Text>
                <FilterPillBar
                  ariaLabel="Forma de pago del pago a profesional"
                  mode="segmented"
                  size="sm"
                  value={method}
                  options={PAYMENT_METHOD_OPTIONS}
                  onChange={setMethod}
                />
              </VStack>
            </VStack>

            <TextInput
              label="Nota"
              placeholder="Ej. Pago quincenal"
              value={note}
              onChange={setNote}
              isOptional
            />
          </VStack>
        </form>
      )}
    </FormDialog>
  );
}
