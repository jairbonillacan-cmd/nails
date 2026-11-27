'use client';

import React, { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Plus, ShoppingBag } from 'lucide-react';
import { formatCurrency, formatUnitCount } from '@/lib/format';
import type { InventoryItem, PaymentMethod, StaffMember } from '@/lib/types';
import type { FormSubmitResult } from '@/lib/forms/form-submit';
import { FilterPillBar, type FilterPillOption } from '@/components/ui';
import { FormDialog, type FormDialogControls } from '@/components/ui/FormDialog';
import { FormDialogLauncher } from '@/components/ui/FormDialogLauncher';
import type { RecordCajaEntryInput } from './cajaActions';
import { NAIL_SALON_EXPENSE_PRESETS, type CashMovementDraft } from './cajaMetrics';

type QuickEntryType = 'expense' | 'product_sale' | 'service_income';

interface CashMovementFormProps {
  inventory: readonly InventoryItem[];
  staff: readonly StaffMember[];
  currency: 'MXN' | 'USD';
  onRecordCashEntry: (input: RecordCajaEntryInput) => Promise<FormSubmitResult>;
}

const ENTRY_TYPE_OPTIONS: readonly FilterPillOption<QuickEntryType>[] = [
  { value: 'product_sale', label: 'Venta producto' },
  { value: 'expense', label: 'Gasto' },
  { value: 'service_income', label: 'Otro ingreso' },
];

const PAYMENT_METHOD_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'transfer', label: 'Transferencia' },
];

const CUSTOM_PRODUCT_VALUE = '__custom__';
const NO_STAFF_VALUE = '__none__';

function isPaymentMethod(value: string): value is PaymentMethod {
  return PAYMENT_METHOD_OPTIONS.some((option) => option.value === value);
}

export function CashMovementForm({
  inventory,
  staff,
  currency,
  onRecordCashEntry,
}: CashMovementFormProps) {
  return (
    <FormDialogLauncher
      triggerLabel="Registrar venta o gasto"
      title="Registrar venta, gasto o ingreso"
      subtitle="Vende productos del inventario con descuento automático de stock o anota movimientos libres de caja."
      isTriggerFullWidth
    >
      {(controls) => (
        <CashMovementFormBody
          inventory={inventory}
          staff={staff}
          currency={currency}
          onRecordCashEntry={onRecordCashEntry}
          controls={controls}
        />
      )}
    </FormDialogLauncher>
  );
}

export function CashMovementDraftDialog({
  draft,
  inventory,
  staff,
  currency,
  onOpenChange,
  onRecordCashEntry,
}: CashMovementFormProps & {
  draft: CashMovementDraft | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <FormDialog
      isOpen={Boolean(draft)}
      onOpenChange={onOpenChange}
      title="Registrar pago a profesional"
      subtitle="Revisa el monto, elige la forma de pago y registra el egreso directamente en caja."
    >
      {(controls) =>
        draft ? (
          <CashMovementFormBody
            inventory={inventory}
            staff={staff}
            currency={currency}
            initialDraft={draft}
            onRecordCashEntry={onRecordCashEntry}
            controls={controls}
          />
        ) : null
      }
    </FormDialog>
  );
}

function CashMovementFormBody({
  inventory,
  staff,
  currency,
  initialDraft,
  onRecordCashEntry,
  controls,
}: CashMovementFormProps & {
  initialDraft?: CashMovementDraft;
  controls: FormDialogControls;
}) {
  const [entryType, setEntryType] = useState<QuickEntryType>(
    initialDraft?.entryType ?? 'product_sale',
  );
  const [selectedProductId, setSelectedProductId] = useState<string>(CUSTOM_PRODUCT_VALUE);
  const [quantity, setQuantity] = useState<number>(1);
  const [desc, setDesc] = useState(initialDraft?.description ?? '');
  const [amountMxn, setAmountMxn] = useState(initialDraft?.amountMxn ?? 150);
  const [method, setMethod] = useState<PaymentMethod>(initialDraft?.method ?? 'cash');
  const [staffId, setStaffId] = useState<string>(initialDraft?.staffId ?? NO_STAFF_VALUE);
  const { isSubmitting } = controls;

  const sellableProducts = useMemo(
    () =>
      inventory
        .filter((item) => item.isActive && item.retailPriceCents > 0)
        .toSorted(
          (a, b) =>
            Number(b.isForRetail) - Number(a.isForRetail) ||
            a.name.localeCompare(b.name, 'es'),
        ),
    [inventory],
  );

  const activeStaff = useMemo(
    () =>
      staff.filter(
        (member) => member.isActive || member.id === initialDraft?.staffId,
      ),
    [staff, initialDraft?.staffId],
  );

  const selectedProduct = useMemo(
    () =>
      entryType === 'product_sale' && selectedProductId !== CUSTOM_PRODUCT_VALUE
        ? (sellableProducts.find((item) => item.id === selectedProductId) ?? null)
        : null,
    [entryType, selectedProductId, sellableProducts],
  );

  const productOptions = useMemo(
    () => [
      {
        value: CUSTOM_PRODUCT_VALUE,
        label: 'Venta libre (monto manual)',
        description: 'Registra el cobro sin descontar stock del inventario',
      },
      ...sellableProducts.map((item) => ({
        value: item.id,
        label: item.name,
        description:
          item.stockQuantity > 0
            ? `${formatCurrency(item.retailPriceCents, currency)} · Disponible: ${formatUnitCount(item.stockQuantity, item.unit)}`
            : `${formatCurrency(item.retailPriceCents, currency)} · Sin stock`,
        disabled: item.stockQuantity <= 0,
      })),
    ],
    [sellableProducts, currency],
  );

  const staffOptions = useMemo(
    () => [
      { value: NO_STAFF_VALUE, label: 'Sin profesional asignada' },
      ...activeStaff.map((member) => ({
        value: member.id,
        label: member.name,
      })),
    ],
    [activeStaff],
  );

  const maxInventoryQty = selectedProduct
    ? Math.max(1, Math.floor(selectedProduct.stockQuantity))
    : 99;
  const safeQuantity = Math.max(1, Math.min(maxInventoryQty, Math.round(quantity || 1)));
  const productTotalCents = selectedProduct
    ? Math.round(selectedProduct.retailPriceCents * safeQuantity)
    : 0;

  const handleEntryTypeChange = (next: QuickEntryType) => {
    setEntryType(next);
    if (next !== 'product_sale') {
      setSelectedProductId(CUSTOM_PRODUCT_VALUE);
      setQuantity(1);
    }
  };

  const handleSelectProduct = (nextId: string | null) => {
    const resolved = nextId || CUSTOM_PRODUCT_VALUE;
    setSelectedProductId(resolved);
    setQuantity(1);
    const matched = sellableProducts.find((item) => item.id === resolved);
    if (matched) {
      setAmountMxn(Number((matched.retailPriceCents / 100).toFixed(2)));
    }
  };

  const canSubmit = selectedProduct
    ? selectedProduct.stockQuantity >= safeQuantity
    : desc.trim().length > 0 && amountMxn > 0;

  const handleSubmitEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const assignedStaffId = staffId === NO_STAFF_VALUE ? null : staffId;

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
        amountMxn,
        method,
        staffId: assignedStaffId,
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
          onChange={handleEntryTypeChange}
        />

        {entryType === 'expense' ? (
          <VStack gap={1.5}>
            <Text type="supporting" color="secondary">
              Gastos frecuentes del salón
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
                  onClick={() => setDesc(preset)}
                />
              ))}
            </HStack>
          </VStack>
        ) : null}

        {entryType === 'product_sale' && sellableProducts.length > 0 ? (
          <Selector
            label="Producto del inventario"
            value={selectedProductId}
            onChange={handleSelectProduct}
            options={productOptions}
            hasSearch={sellableProducts.length > 5}
            searchPlaceholder="Buscar producto..."
            startIcon={<ShoppingBag size={14} aria-hidden="true" />}
          />
        ) : null}

        {selectedProduct ? (
          <>
            <Grid columns={{ minWidth: 130, max: 2 }} gap={2}>
              <NumberInput
                label={`Cantidad (${selectedProduct.unit})`}
                value={safeQuantity}
                min={1}
                max={maxInventoryQty}
                onChange={setQuantity}
              />
              <Selector
                label="Forma de pago"
                value={method}
                onChange={(v) => {
                  if (v && isPaymentMethod(v)) setMethod(v);
                }}
                options={PAYMENT_METHOD_OPTIONS}
              />
            </Grid>

            <VStack className="ad-subpanel" gap={1}>
              <HStack justify="between" align="center" gap={2}>
                <Text type="supporting" color="secondary">
                  Total a cobrar
                </Text>
                <Text weight="bold" hasTabularNumbers>
                  {formatCurrency(productTotalCents, currency)}
                </Text>
              </HStack>
              <Text type="supporting" color="secondary" hasTabularNumbers>
                Descuenta {formatUnitCount(safeQuantity, selectedProduct.unit)} del
                inventario y registra la venta en caja automáticamente.
              </Text>
            </VStack>

            {activeStaff.length > 0 ? (
              <Selector
                label="Profesional que vendió"
                isOptional
                value={staffId}
                onChange={(v) => setStaffId(v || NO_STAFF_VALUE)}
                options={staffOptions}
              />
            ) : null}

            <TextInput
              label="Nota de venta"
              placeholder="Ej. Venta adicional al terminar servicio"
              value={desc}
              onChange={setDesc}
              isOptional
            />
          </>
        ) : (
          <>
            <TextInput
              label="Descripción"
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
                  if (v && isPaymentMethod(v)) setMethod(v);
                }}
                options={PAYMENT_METHOD_OPTIONS}
              />
            </Grid>
            {activeStaff.length > 0 ? (
              <Selector
                label={entryType === 'expense' ? 'Profesional (opcional)' : 'Profesional'}
                isOptional
                value={staffId}
                onChange={(v) => setStaffId(v || NO_STAFF_VALUE)}
                options={staffOptions}
              />
            ) : null}
          </>
        )}

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
                : selectedProduct
                  ? `Cobrar ${formatCurrency(productTotalCents, currency)}`
                  : entryType === 'product_sale'
                    ? 'Guardar venta'
                    : 'Guardar ingreso'
            }
            variant="primary"
            icon={<Plus size={15} aria-hidden="true" />}
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !canSubmit}
          />
        </HStack>
      </VStack>
    </form>
  );
}
