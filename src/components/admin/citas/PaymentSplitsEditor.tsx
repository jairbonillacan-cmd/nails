'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Selector } from '@astryxdesign/core/Selector';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Switch } from '@astryxdesign/core/Switch';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { ArrowLeftRight, Banknote, CreditCard, Plus, Trash2 } from 'lucide-react';
import { StatusTag, SurfaceCard } from '@/components/ui';
import type { InventoryItem, PaymentSplitMethod, StaffMember } from '@/lib/types';
import { formatCurrency, formatPaymentSplitMethodLabel } from '@/lib/format';

export interface SplitRowDraft {
  id: string;
  method: PaymentSplitMethod;
  amountMxn: number;
  reference: string;
}

export type TipPreset = '0' | '50' | '100' | 'other';

const SPLIT_METHOD_OPTIONS: Array<{ value: PaymentSplitMethod; label: string }> = [
  { value: 'cash', label: formatPaymentSplitMethodLabel('cash') },
  { value: 'transfer', label: formatPaymentSplitMethodLabel('transfer') },
  { value: 'card', label: formatPaymentSplitMethodLabel('card') },
  { value: 'giftcard', label: formatPaymentSplitMethodLabel('giftcard') },
];

const QUICK_METHODS: ReadonlyArray<{
  value: 'cash' | 'transfer' | 'card';
  label: string;
}> = [
  { value: 'cash', label: formatPaymentSplitMethodLabel('cash') },
  { value: 'transfer', label: formatPaymentSplitMethodLabel('transfer') },
  { value: 'card', label: formatPaymentSplitMethodLabel('card') },
];

const TIP_PILLS: ReadonlyArray<{ id: TipPreset; label: string }> = [
  { id: '0', label: '$0' },
  { id: '50', label: '$50' },
  { id: '100', label: '$100' },
  { id: 'other', label: 'Otra' },
];

interface PaymentSplitsEditorProps {
  currency: 'MXN' | 'USD';
  submitting: boolean;
  isSplitMode: boolean;
  singleMethod: 'cash' | 'transfer' | 'card';
  rows: SplitRowDraft[];
  tipPreset: TipPreset;
  tipMxn: number;
  tipStaffId: string;
  bookingStaffId: string;
  activeStaff: StaffMember[];
  retailItems: InventoryItem[];
  extraItemId: string;
  extraQuantity: number;
  selectedExtraItem: InventoryItem | null;
  extraTotalCents: number;
  onChangeSingleMethod: (method: 'cash' | 'transfer' | 'card') => void;
  onToggleSplitMode: (checked: boolean) => void;
  onAddSplitRow: () => void;
  onUpdateRow: (id: string, patch: Partial<SplitRowDraft>) => void;
  onRemoveRow: (id: string) => void;
  onSelectTipPreset: (preset: TipPreset) => void;
  onChangeTipMxn: (amount: number) => void;
  onChangeTipStaffId: (staffId: string) => void;
  onChangeExtraItemId: (itemId: string) => void;
  onChangeExtraQuantity: (quantity: number) => void;
}

export function PaymentSplitsEditor({
  currency,
  submitting,
  isSplitMode,
  singleMethod,
  rows,
  tipPreset,
  tipMxn,
  tipStaffId,
  bookingStaffId,
  activeStaff,
  retailItems,
  extraItemId,
  extraQuantity,
  selectedExtraItem,
  extraTotalCents,
  onChangeSingleMethod,
  onToggleSplitMode,
  onAddSplitRow,
  onUpdateRow,
  onRemoveRow,
  onSelectTipPreset,
  onChangeTipMxn,
  onChangeTipStaffId,
  onChangeExtraItemId,
  onChangeExtraQuantity,
}: PaymentSplitsEditorProps) {
  return (
    <VStack gap={4}>
      {!isSplitMode ? (
        <VStack gap={2}>
          <Text weight="semibold">¿Cómo paga?</Text>
          <section aria-label="Método de pago" className="ad-pay-grid">
            {QUICK_METHODS.map((option) => {
              const isSelected = singleMethod === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className="ad-pay-tile"
                  data-selected={isSelected ? 'true' : 'false'}
                  aria-pressed={isSelected}
                  disabled={submitting}
                  onClick={() => onChangeSingleMethod(option.value)}
                >
                  {option.value === 'cash' ? (
                    <Banknote size={22} aria-hidden="true" />
                  ) : option.value === 'transfer' ? (
                    <ArrowLeftRight size={22} aria-hidden="true" />
                  ) : (
                    <CreditCard size={22} aria-hidden="true" />
                  )}
                  <Text size="sm" weight="semibold" color="inherit">
                    {option.label}
                  </Text>
                </button>
              );
            })}
          </section>
        </VStack>
      ) : (
        <VStack gap={3}>
          <HStack justify="between" align="center" gap={2}>
            <Text weight="semibold">Métodos de pago</Text>
            <Button
              type="button"
              label="Agregar método"
              variant="secondary"
              size="sm"
              icon={<Plus size={13} aria-hidden="true" />}
              onClick={onAddSplitRow}
            />
          </HStack>

          {rows.map((row, idx) => (
            <SurfaceCard key={row.id} tone="subtle" padded>
              <VStack gap={2}>
                <HStack justify="between" align="center">
                  <Text type="supporting" weight="semibold" color="secondary">
                    Pago #{idx + 1}
                  </Text>
                  {rows.length > 1 ? (
                    <Button
                      type="button"
                      label="Quitar pago"
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 size={14} aria-hidden="true" />}
                      onClick={() => onRemoveRow(row.id)}
                    />
                  ) : null}
                </HStack>
                <Grid columns={{ minWidth: 160, max: 2 }} gap={2}>
                  <Selector
                    label="Método de pago"
                    value={row.method}
                    onChange={(val) =>
                      val && onUpdateRow(row.id, { method: val as PaymentSplitMethod })
                    }
                    options={SPLIT_METHOD_OPTIONS}
                  />
                  <NumberInput
                    label={`Monto (${currency})`}
                    value={row.amountMxn}
                    min={0}
                    onChange={(val) => onUpdateRow(row.id, { amountMxn: val || 0 })}
                  />
                </Grid>
                <TextInput
                  label="Referencia o folio (opcional)"
                  placeholder="Ejemplo: folio de terminal o transferencia"
                  value={row.reference}
                  autoCapitalize="none"
                  hasAutoCorrect={false}
                  hasSpellCheck={false}
                  onChange={(val) => onUpdateRow(row.id, { reference: val })}
                />
              </VStack>
            </SurfaceCard>
          ))}
        </VStack>
      )}

      <VStack gap={2}>
        <Text weight="semibold">Propina (opcional)</Text>
        <section aria-label="Propina rápida" className="ad-tip-pills">
          {TIP_PILLS.map((pill) => (
            <button
              key={pill.id}
              type="button"
              className="ad-pill fx-press"
              data-on={tipPreset === pill.id ? 'true' : 'false'}
              aria-pressed={tipPreset === pill.id}
              onClick={() => onSelectTipPreset(pill.id)}
            >
              {pill.label}
            </button>
          ))}
        </section>

        {tipPreset === 'other' ? (
          <NumberInput
            label={`Monto de propina (${currency})`}
            value={tipMxn}
            min={0}
            onChange={(val) => onChangeTipMxn(val || 0)}
          />
        ) : null}

        {tipMxn > 0 && activeStaff.length > 1 ? (
          <Selector
            label="Propina para"
            size="sm"
            value={tipStaffId || bookingStaffId}
            onChange={(val) => val && onChangeTipStaffId(val)}
            options={activeStaff.map((s) => ({ value: s.id, label: s.name }))}
          />
        ) : null}
      </VStack>

      <SurfaceCard tone="subtle" padded>
        <Switch
          label="Dividir en varios métodos"
          description="Úsalo si paga con dos métodos, tarjeta de regalo o quieres anotar un folio."
          size="sm"
          value={isSplitMode}
          onChange={onToggleSplitMode}
        />
      </SurfaceCard>

      {retailItems.length > 0 ? (
        <Collapsible
          className="ad-disclosure"
          defaultIsOpen={false}
          trigger={
            <HStack gap={2} align="center">
              <Text weight="semibold" size="sm">
                Agregar producto (opcional)
              </Text>
              {selectedExtraItem ? (
                <StatusTag
                  label={`+${formatCurrency(extraTotalCents, currency)}`}
                  tone="accent"
                  hasTabularNumbers
                />
              ) : null}
            </HStack>
          }
        >
          <VStack paddingBlockStart={2} gap={2}>
            <Grid columns={selectedExtraItem ? { minWidth: 160, max: 2 } : 1} gap={2}>
              <Selector
                label="Producto de tienda"
                value={extraItemId}
                onChange={(val) => val && onChangeExtraItemId(val)}
                options={[
                  { value: 'none', label: 'Sin producto adicional' },
                  ...retailItems.map((item) => ({
                    value: item.id,
                    label: `${item.name} · ${formatCurrency(
                      item.retailPriceCents,
                      currency,
                    )} (Disponibles: ${item.stockQuantity})`,
                  })),
                ]}
              />
              {selectedExtraItem ? (
                <NumberInput
                  label="Cantidad"
                  value={extraQuantity}
                  min={1}
                  max={Math.max(1, selectedExtraItem.stockQuantity)}
                  onChange={(val) => onChangeExtraQuantity(val || 1)}
                />
              ) : null}
            </Grid>
          </VStack>
        </Collapsible>
      ) : null}
    </VStack>
  );
}
