'use client';

import React, { useState } from 'react';
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
import { EmptyStateCard, StatusTag, SurfaceCard } from '@/components/ui';
import { FormDialogLauncher } from '@/components/ui/FormDialogLauncher';

interface CouponsSubSectionProps {
  coupons: readonly Coupon[];
  currency: 'MXN' | 'USD';
  onCreateCoupon: (input: {
    code: string;
    kind: 'coupon' | 'gift_card';
    discountType: 'percent' | 'fixed_cents';
    value: number;
    recipient: string;
  }) => Promise<boolean>;
}

export function CouponsSubSection({
  coupons,
  currency,
  onCreateCoupon,
}: CouponsSubSectionProps) {
  const [cpCode, setCpCode] = useState('');
  const [cpKind, setCpKind] = useState<'coupon' | 'gift_card'>('coupon');
  const [cpDiscountType, setCpDiscountType] = useState<'percent' | 'fixed_cents'>('percent');
  const [cpValue, setCpValue] = useState(15);
  const [cpRecipient, setCpRecipient] = useState('');
  const [cpSaving, setCpSaving] = useState(false);

  const handleCouponSubmit = async (e: React.FormEvent, onDone: () => void) => {
    e.preventDefault();
    if (!cpCode.trim() || cpSaving) return;
    setCpSaving(true);
    try {
      const ok = await onCreateCoupon({
        code: cpCode.trim(),
        kind: cpKind,
        discountType: cpDiscountType,
        value: cpValue,
        recipient: cpRecipient.trim(),
      });
      if (ok) {
        setCpCode('');
        setCpRecipient('');
        onDone();
      }
    } finally {
      setCpSaving(false);
    }
  };

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
          >
            {(close) => (
        <form onSubmit={(e) => void handleCouponSubmit(e, close)}>
          <VStack gap={3}>
            <TextInput
              label="Código"
              placeholder="Ej. CUMPLE20 o REGALO500"
              value={cpCode}
              onChange={setCpCode}
              isRequired
            />
            <Selector
              label="Tipo"
              value={cpKind}
              onChange={(v) => v && setCpKind(v as 'coupon' | 'gift_card')}
              options={[
                { value: 'coupon', label: 'Cupón de descuento' },
                { value: 'gift_card', label: 'Tarjeta de regalo con saldo' },
              ]}
            />
            {cpKind === 'coupon' ? (
              <Selector
                label="Descuento por"
                value={cpDiscountType}
                onChange={(v) => v && setCpDiscountType(v as 'percent' | 'fixed_cents')}
                options={[
                  { value: 'percent', label: 'Porcentaje (%)' },
                  { value: 'fixed_cents', label: 'Monto fijo (MXN)' },
                ]}
              />
            ) : null}
            <NumberInput
              label={
                cpKind === 'gift_card' || cpDiscountType === 'fixed_cents'
                  ? 'Monto en MXN'
                  : 'Porcentaje (%)'
              }
              value={cpValue}
              min={1}
              onChange={setCpValue}
            />
            <TextInput
              label="Para quién es (opcional)"
              placeholder="Ej. Regalo para Ana"
              value={cpRecipient}
              onChange={setCpRecipient}
              isOptional
            />
            <HStack gap={2} justify="end" wrap="wrap">
              <Button type="button" label="Cancelar" variant="secondary" isDisabled={cpSaving} onClick={close} />
              <Button
                type="submit"
                label="Crear código"
                variant="primary"
                isLoading={cpSaving}
                isDisabled={cpSaving || !cpCode.trim()}
              />
            </HStack>
          </VStack>
        </form>
            )}
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
