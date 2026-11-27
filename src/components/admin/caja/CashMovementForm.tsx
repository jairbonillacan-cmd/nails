'use client';

import type React from 'react';
import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Banknote, Minus, Plus, ShoppingBag } from 'lucide-react';
import { formatCurrency, formatUnitCount } from '@/lib/format';
import type { CashRegisterEntry, InventoryItem, PaymentMethod, StaffMember } from '@/lib/types';
import type { FormSubmitResult } from '@/lib/forms/form-submit';
import { FilterPillBar, type FilterPillOption } from '@/components/ui';
import { FormDialog } from '@/components/ui/FormDialog';
import type { RecordCajaEntryInput } from './cajaActions';
import {
  suggestQuickAmounts,
  type CommissionPayoutDraft,
} from './cajaMetrics';
import { paymentMethodLabel } from './cajaTypes';

type QuickEntryType = 'expense' | 'product_sale' | 'service_income';

const ENTRY_TYPE_OPTIONS: readonly FilterPillOption<QuickEntryType>[] = [
  { value: 'product_sale', label: 'Venta' },
  { value: 'expense', label: 'Gasto' },
  { value: 'service_income', label: 'Otro ingreso' },
];

const PAYMENT_METHOD_OPTIONS: readonly FilterPillOption<PaymentMethod>[] = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'transfer', label: 'Transferencia' },
];

const CUSTOM_PRODUCT_VALUE = '__custom__';
const NO_STAFF_VALUE = '__none__';
const MOVEMENT_FORM_ID = 'caja-movement-form';
const PAYOUT_FORM_ID = 'caja-payout-form';

interface CashMovementDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  inventory: readonly InventoryItem[];
  staff: readonly StaffMember[];
  currency: 'MXN' | 'USD';
  expenseCategories: readonly string[];
  retailCommissionPercent: number;
  recentEntries: readonly CashRegisterEntry[];
  initialProductId?: string | null;
  onRecordCashEntry: (input: RecordCajaEntryInput) => Promise<FormSubmitResult>;
}

export function CashMovementDialog({
  isOpen,
  onOpenChange,
  inventory,
  staff,
  currency,
  expenseCategories,
  retailCommissionPercent,
  recentEntries,
  initialProductId = null,
  onRecordCashEntry,
}: CashMovementDialogProps) {
  const [entryType, setEntryType] = useState<QuickEntryType>('product_sale');
  const [selectedProductId, setSelectedProductId] = useState<string>(() => {
    if (
      initialProductId &&
      inventory.some(
        (item) =>
          item.id === initialProductId && item.isActive && item.retailPriceCents > 0,
      )
    ) {
      return initialProductId;
    }
    return CUSTOM_PRODUCT_VALUE;
  });
  const [quantity, setQuantity] = useState<number>(1);
  const [desc, setDesc] = useState('');
  const [amountMxn, setAmountMxn] = useState<number>(0);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [staffId, setStaffId] = useState<string>(NO_STAFF_VALUE);

  const sellableProducts = useMemo(
    () =>
      inventory
        .filter((item) => item.isActive && item.retailPriceCents > 0)
        .toSorted(
          (a, b) =>
            Number(b.stockQuantity > 0) - Number(a.stockQuantity > 0) ||
            Number(b.isForRetail) - Number(a.isForRetail) ||
            a.name.localeCompare(b.name, 'es'),
        ),
    [inventory],
  );

  const activeStaff = useMemo(
    () => staff.filter((member) => member.isActive),
    [staff],
  );

  const selectedProduct =
    entryType === 'product_sale' && selectedProductId !== CUSTOM_PRODUCT_VALUE
      ? (sellableProducts.find((item) => item.id === selectedProductId) ?? null)
      : null;

  const productOptions = useMemo(
    () => [
      ...sellableProducts.map((item) => ({
        value: item.id,
        label: item.name,
        description:
          item.stockQuantity > 0
            ? `${formatCurrency(item.retailPriceCents, currency)} · Quedan ${formatUnitCount(item.stockQuantity, item.unit)}`
            : `${formatCurrency(item.retailPriceCents, currency)} · Sin stock`,
        disabled: item.stockQuantity <= 0,
      })),
      {
        value: CUSTOM_PRODUCT_VALUE,
        label: 'Otro producto (sin inventario)',
        description: 'Escribes el concepto y el monto; no descuenta stock',
      },
    ],
    [sellableProducts, currency],
  );

  const staffOptions = useMemo(
    () => [
      { value: NO_STAFF_VALUE, label: 'Sin profesional asignada' },
      ...activeStaff.map((member) => ({ value: member.id, label: member.name })),
    ],
    [activeStaff],
  );

  const quickAmounts = useMemo(
    () => suggestQuickAmounts(recentEntries, entryType),
    [recentEntries, entryType],
  );

  const maxInventoryQty = selectedProduct
    ? Math.max(1, Math.floor(selectedProduct.stockQuantity))
    : 99;
  const safeQuantity = Math.max(1, Math.min(maxInventoryQty, Math.round(quantity || 1)));
  const productTotalCents = selectedProduct
    ? Math.round(selectedProduct.retailPriceCents * safeQuantity)
    : 0;
  const manualAmountCents = Math.max(0, Math.round((amountMxn || 0) * 100));
  const impactCents = selectedProduct ? productTotalCents : manualAmountCents;

  const handleEntryTypeChange = (next: QuickEntryType) => {
    setEntryType(next);
    if (next !== 'product_sale') {
      setSelectedProductId(CUSTOM_PRODUCT_VALUE);
      setQuantity(1);
    }
  };

  const canSubmit = selectedProduct
    ? selectedProduct.stockQuantity >= safeQuantity
    : desc.trim().length > 0 && manualAmountCents > 0;

  const submitLabel =
    entryType === 'expense'
      ? manualAmountCents > 0
        ? `Guardar gasto de ${formatCurrency(manualAmountCents, currency)}`
        : 'Guardar gasto'
      : impactCents > 0
        ? `Cobrar ${formatCurrency(impactCents, currency)}`
        : entryType === 'product_sale'
          ? 'Guardar venta'
          : 'Guardar ingreso';

  const assignedStaffId = staffId === NO_STAFF_VALUE ? null : staffId;
  const assignedStaffName = assignedStaffId
    ? (activeStaff.find((member) => member.id === assignedStaffId)?.name ?? null)
    : null;

  const impactLines: string[] = [];
  if (entryType === 'expense') {
    impactLines.push(
      `Sale ${formatCurrency(impactCents, currency)} de caja (${paymentMethodLabel(method)}).`,
    );
    if (method === 'cash') impactLines.push('Se resta del efectivo esperado en el corte de hoy.');
  } else {
    impactLines.push(
      `Entra ${formatCurrency(impactCents, currency)} a caja (${paymentMethodLabel(method)}).`,
    );
    if (selectedProduct) {
      const remaining = Math.max(0, selectedProduct.stockQuantity - safeQuantity);
      impactLines.push(
        `Inventario: −${formatUnitCount(safeQuantity, selectedProduct.unit)} (quedan ${formatUnitCount(remaining, selectedProduct.unit)}).`,
      );
    }
    if (entryType === 'product_sale' && assignedStaffName && impactCents > 0) {
      impactLines.push(
        `Comisión retail ${retailCommissionPercent}% para ${assignedStaffName}: ${formatCurrency(Math.round((impactCents * retailCommissionPercent) / 100), currency)}.`,
      );
    }
  }

  return (
    <FormDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Registrar movimiento"
      subtitle="Venta de mostrador, gasto del salón u otro ingreso fuera de cita."
      submitFooter={{
        formId: MOVEMENT_FORM_ID,
        submitLabel,
        submitIcon:
          entryType === 'expense' ? (
            <Minus size={15} aria-hidden="true" />
          ) : (
            <Plus size={15} aria-hidden="true" />
          ),
        isSubmitDisabled: !canSubmit,
      }}
    >
      {(controls) => {
        const handleSubmit = (e: React.FormEvent) => {
          e.preventDefault();
          if (!canSubmit) return;
          if (selectedProduct) {
            controls.submit(() =>
              onRecordCashEntry({
                entryType: 'product_sale',
                description:
                  desc.trim() || `Venta en caja: ${selectedProduct.name} (x${safeQuantity})`,
                amountMxn: productTotalCents / 100,
                method,
                staffId: assignedStaffId,
                inventoryItemId: selectedProduct.id,
                inventoryQuantity: safeQuantity,
                productName: selectedProduct.name,
              }),
            );
            return;
          }
          controls.submit(() =>
            onRecordCashEntry({
              entryType,
              description: desc.trim(),
              amountMxn: manualAmountCents / 100,
              method,
              staffId: assignedStaffId,
            }),
          );
        };

        return (
          <form id={MOVEMENT_FORM_ID} onSubmit={handleSubmit}>
            <VStack gap={4}>
              <FilterPillBar
                ariaLabel="Tipo de movimiento"
                mode="segmented"
                size="sm"
                value={entryType}
                options={ENTRY_TYPE_OPTIONS}
                onChange={handleEntryTypeChange}
              />

              {entryType === 'product_sale' && sellableProducts.length > 0 ? (
                <Selector
                  label="Producto"
                  value={selectedProductId}
                  onChange={(next) => {
                    setSelectedProductId(next || CUSTOM_PRODUCT_VALUE);
                    setQuantity(1);
                  }}
                  options={productOptions}
                  hasSearch={sellableProducts.length > 5}
                  searchPlaceholder="Buscar producto..."
                  startIcon={<ShoppingBag size={14} aria-hidden="true" />}
                />
              ) : null}

              {entryType === 'expense' && expenseCategories.length > 0 ? (
                <VStack gap={1.5}>
                  <Text type="supporting" color="secondary">
                    Categoría rápida
                  </Text>
                  <HStack gap={1.5} wrap="wrap" role="group" aria-label="Categorías de gasto">
                    {expenseCategories.map((preset) => (
                      <Button
                        key={preset}
                        type="button"
                        label={preset}
                        variant={desc === preset ? 'primary' : 'secondary'}
                        size="sm"
                        className="ad-caja-preset-chip"
                        aria-pressed={desc === preset}
                        onClick={() => setDesc(preset)}
                      />
                    ))}
                  </HStack>
                </VStack>
              ) : null}

              {selectedProduct ? (
                <NumberInput
                  label={`Cantidad (${selectedProduct.unit})`}
                  description={`${formatCurrency(selectedProduct.retailPriceCents, currency)} c/u`}
                  value={safeQuantity}
                  min={1}
                  max={maxInventoryQty}
                  isIntegerOnly
                  onChange={setQuantity}
                />
              ) : (
                <>
                  <TextInput
                    label={entryType === 'expense' ? 'Concepto del gasto' : 'Concepto'}
                    placeholder={
                      entryType === 'expense'
                        ? 'Ej. Compra de limas y acetona'
                        : entryType === 'product_sale'
                          ? 'Ej. Aceite de cutícula'
                          : 'Ej. Servicio sin cita o ajuste'
                    }
                    value={desc}
                    onChange={setDesc}
                    isRequired
                  />
                  <VStack gap={1.5}>
                    <NumberInput
                      label={`Monto (${currency})`}
                      value={amountMxn}
                      min={0}
                      onChange={setAmountMxn}
                    />
                    <HStack gap={1.5} wrap="wrap" role="group" aria-label="Montos frecuentes">
                      {quickAmounts.map((amount) => (
                        <Button
                          key={amount}
                          type="button"
                          label={formatCurrency(amount * 100, currency)}
                          variant={amountMxn === amount ? 'primary' : 'secondary'}
                          size="sm"
                          className="ad-caja-preset-chip"
                          aria-pressed={amountMxn === amount}
                          onClick={() => setAmountMxn(amount)}
                        />
                      ))}
                    </HStack>
                  </VStack>
                </>
              )}

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

              {activeStaff.length > 0 ? (
                <Selector
                  label={entryType === 'product_sale' ? 'Profesional que vendió' : 'Profesional'}
                  isOptional
                  value={staffId}
                  onChange={(v) => setStaffId(v || NO_STAFF_VALUE)}
                  options={staffOptions}
                />
              ) : null}

              {selectedProduct ? (
                <TextInput
                  label="Nota"
                  placeholder="Ej. Venta al terminar servicio"
                  value={desc}
                  onChange={setDesc}
                  isOptional
                />
              ) : null}

              <VStack
                className="ad-subpanel ad-caja-impact"
                data-tone={entryType === 'expense' ? 'out' : 'in'}
                gap={1}
                role="status"
                aria-live="polite"
              >
                <HStack justify="between" align="center" gap={2}>
                  <Text type="supporting" color="secondary">
                    {entryType === 'expense' ? 'Sale de caja' : 'Total a cobrar'}
                  </Text>
                  <Text weight="bold" hasTabularNumbers>
                    {entryType === 'expense' ? '−' : '+'}
                    {formatCurrency(impactCents, currency)}
                  </Text>
                </HStack>
                {impactLines.map((line) => (
                  <Text key={line} type="supporting" color="secondary" hasTabularNumbers>
                    {line}
                  </Text>
                ))}
              </VStack>
            </VStack>
          </form>
        );
      }}
    </FormDialog>
  );
}

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
