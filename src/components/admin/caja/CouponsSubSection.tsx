'use client';

import type React from 'react';
import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Table } from '@astryxdesign/core/Table';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Gift } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import type { Coupon } from '@/lib/types';
import type { FormSubmitResult } from '@/lib/forms/form-submit';
import { EmptyStateCard, StatusTag, SurfaceCard } from '@/components/ui';
import type { FormDialogControls } from '@/components/ui/FormDialog';
import { FormDialogLauncher } from '@/components/ui/FormDialogLauncher';

type CouponKind = 'coupon' | 'gift_card';
type CouponDiscountType = 'percent' | 'fixed_cents';

type CreateCouponHandler = (input: {
  code: string;
  kind: CouponKind;
  discountType: CouponDiscountType;
  value: number;
  recipient: string;
}) => Promise<FormSubmitResult>;

interface CouponsSubSectionProps {
  coupons: readonly Coupon[];
  currency: 'MXN' | 'USD';
  onCreateCoupon: CreateCouponHandler;
}

const COUPON_KIND_OPTIONS: Array<{ value: CouponKind; label: string }> = [
  { value: 'coupon', label: 'Cupón de descuento' },
  { value: 'gift_card', label: 'Tarjeta de regalo con saldo' },
];

const DISCOUNT_TYPE_OPTIONS: Array<{ value: CouponDiscountType; label: string }> = [
  { value: 'percent', label: 'Porcentaje (%)' },
  { value: 'fixed_cents', label: 'Cantidad fija en pesos' },
];

function CouponFormBody({
  onCreateCoupon,
  controls,
}: {
  onCreateCoupon: CreateCouponHandler;
  controls: FormDialogControls;
}) {
  const [cpCode, setCpCode] = useState('');
  const [cpKind, setCpKind] = useState<CouponKind>('coupon');
  const [cpDiscountType, setCpDiscountType] = useState<CouponDiscountType>('percent');
  const [cpValue, setCpValue] = useState(15);
  const [cpRecipient, setCpRecipient] = useState('');
  const { isSubmitting } = controls;
  const isMoney = cpKind === 'gift_card' || cpDiscountType === 'fixed_cents';

  const handleCouponSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cpCode.trim()) return;
    controls.submit(() =>
      onCreateCoupon({
        code: cpCode.trim(),
        kind: cpKind,
        discountType: cpDiscountType,
        value: cpValue,
        recipient: cpRecipient.trim(),
      }),
    );
  };

  return (
    <form onSubmit={handleCouponSubmit}>
      <VStack gap={3}>
        <TextInput
          label="Código"
          description="La palabra que tu clienta escribe al agendar."
          placeholder="Ej. CUMPLE20"
          value={cpCode}
          onChange={setCpCode}
          isRequired
        />
        <Selector
          label="Tipo"
          value={cpKind}
          onChange={(v) => {
            const next = COUPON_KIND_OPTIONS.find((option) => option.value === v);
            if (next) setCpKind(next.value);
          }}
          options={COUPON_KIND_OPTIONS}
        />
        {cpKind === 'coupon' ? (
          <Selector
            label="Descuento en"
            value={cpDiscountType}
            onChange={(v) => {
              const next = DISCOUNT_TYPE_OPTIONS.find((option) => option.value === v);
              if (next) setCpDiscountType(next.value);
            }}
            options={DISCOUNT_TYPE_OPTIONS}
          />
        ) : null}
        <NumberInput
          label={
            cpKind === 'gift_card' ? 'Saldo de la tarjeta (MXN)' : isMoney ? 'Descuento (MXN)' : 'Descuento (%)'
          }
          value={cpValue}
          min={1}
          max={isMoney ? undefined : 100}
          onChange={setCpValue}
        />
        <TextInput
          label="Para quién es"
          placeholder="Ej. Regalo para Ana"
          value={cpRecipient}
          onChange={setCpRecipient}
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
            label="Crear código"
            variant="primary"
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !cpCode.trim()}
          />
        </HStack>
      </VStack>
    </form>
  );
}

export function CouponsSubSection({
  coupons,
  currency,
  onCreateCoupon,
}: CouponsSubSectionProps) {
  return (
    <VStack gap={0}>
      <SurfaceCard
        title="Cupones y tarjetas de regalo"
        subtitle="Códigos de descuento y tarjetas con saldo que tus clientas pueden usar al agendar."
        count={coupons.length}
        actions={
          <FormDialogLauncher
            triggerLabel="Crear código"
            title="Crear cupón o tarjeta de regalo"
            subtitle="Tus clientas lo escriben al agendar y se descuenta solo."
            triggerVariant="secondary"
            triggerSize="sm"
          >
            {(controls) => <CouponFormBody onCreateCoupon={onCreateCoupon} controls={controls} />}
          </FormDialogLauncher>
        }
      >
        {coupons.length === 0 ? (
          <VStack padding={4}>
            <EmptyStateCard
              framed={false}
              isCompact
              title="Sin cupones activos"
              description="Usa el botón Crear código para hacer el primero."
            />
          </VStack>
        ) : (
          <VStack className="ad-table-scroll" gap={0}>
            <Table
              idKey="id"
              hasHover
              data={[...coupons]}
              columns={[
                {
                  key: 'code',
                  header: 'Código',
                  renderCell: (c) => (
                    <HStack gap={1.5} align="center">
                      <Gift size={14} aria-hidden="true" />
                      <Text type="code" weight="semibold">
                        {c.code}
                      </Text>
                    </HStack>
                  ),
                },
                {
                  key: 'kind',
                  header: 'Tipo',
                  renderCell: (c) => (
                    <StatusTag
                      tone={c.kind === 'gift_card' ? 'accent' : 'neutral'}
                      label={c.kind === 'gift_card' ? 'Tarjeta de regalo' : 'Cupón'}
                    />
                  ),
                },
                {
                  key: 'discountValue',
                  header: 'Beneficio / Saldo',
                  renderCell: (c) => (
                    <Text hasTabularNumbers>
                      {c.kind === 'gift_card'
                        ? `Saldo: ${formatCurrency(c.remainingBalanceCents ?? 0, currency)}`
                        : c.discountType === 'percent'
                          ? `${c.discountValue}%`
                          : formatCurrency(c.discountValue, currency)}
                    </Text>
                  ),
                },
                {
                  key: 'usedCount',
                  header: 'Usos',
                  renderCell: (c) => (
                    <Text hasTabularNumbers>
                      {c.usedCount}
                      {c.maxUses ? ` / ${c.maxUses}` : ''}
                    </Text>
                  ),
                },
              ]}
            />
          </VStack>
        )}
      </SurfaceCard>

    </VStack>
  );
}
