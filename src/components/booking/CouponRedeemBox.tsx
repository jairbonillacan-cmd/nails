'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Check, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import type { AppliedCouponState } from './bookingApi';

interface CouponRedeemBoxProps {
  currency: 'MXN' | 'USD';
  subtotalCents: number;
  totalPriceCents: number;
  couponInput: string;
  appliedCoupon: AppliedCouponState | null;
  couponError: string | null;
  couponLoading: boolean;
  isDisabled: boolean;
  onChangeCouponInput: (value: string) => void;
  onApplyCoupon: () => void;
  onRemoveCoupon: () => void;
}

export function CouponRedeemBox({
  currency,
  subtotalCents,
  totalPriceCents,
  couponInput,
  appliedCoupon,
  couponError,
  couponLoading,
  isDisabled,
  onChangeCouponInput,
  onApplyCoupon,
  onRemoveCoupon,
}: CouponRedeemBoxProps) {
  return (
    <Collapsible
      className="rb-fold"
      defaultIsOpen={Boolean(appliedCoupon)}
      trigger={
        <HStack justify="between" align="center" gap={2} width="100%" style={{ minHeight: '2.75rem' }}>
          <Text weight="semibold">¿Tienes cupón o Gift Card?</Text>
          {appliedCoupon ? (
            <Text type="supporting" className="fx-save-pill" data-tone="success" hasTabularNumbers>
              −{formatCurrency(appliedCoupon.discountCents, currency)}
            </Text>
          ) : null}
        </HStack>
      }
    >
      <VStack gap={2} className="rb-fold-body">
        <HStack gap={2} align="end">
          <VStack className="rb-grow">
            <TextInput
              label="Código"
              placeholder="BIENVENIDA10 o GIFT500"
              autoCapitalize="characters"
              value={couponInput}
              onChange={onChangeCouponInput}
              onEnter={onApplyCoupon}
              isDisabled={isDisabled || couponLoading}
              isLoading={couponLoading}
              status={couponError ? { type: 'error', message: couponError } : undefined}
              statusVariant="detached"
            />
          </VStack>
          <Button
            type="button"
            label={couponLoading ? 'Validando…' : 'Aplicar'}
            variant="secondary"
            className="fx-press"
            isLoading={couponLoading}
            isDisabled={isDisabled || couponLoading || !couponInput.trim()}
            onClick={onApplyCoupon}
          />
        </HStack>
        {appliedCoupon ? (
          <VStack gap={2} padding={3} className="rb-note fx-pop" role="status" aria-live="polite">
            <HStack justify="between" align="center" gap={2} wrap="wrap">
              <Text type="supporting" className="fx-save-pill" data-tone="success" hasTabularNumbers>
                <Check size={13} aria-hidden="true" />
                {appliedCoupon.code} aplicado · −{formatCurrency(appliedCoupon.discountCents, currency)}
              </Text>
              <Button
                type="button"
                label="Quitar"
                variant="ghost"
                size="md"
                icon={<Trash2 size={14} aria-hidden="true" />}
                className="fx-press"
                isDisabled={isDisabled}
                onClick={onRemoveCoupon}
              />
            </HStack>
            <HStack justify="between" align="center" gap={2} wrap="wrap">
              <Text type="supporting" color="secondary" hasTabularNumbers>
                Subtotal {formatCurrency(subtotalCents, currency)} − Descuento{' '}
                {formatCurrency(appliedCoupon.discountCents, currency)}
              </Text>
              <Text type="supporting" weight="bold" hasTabularNumbers>
                Nuevo total: {formatCurrency(totalPriceCents, currency)}
              </Text>
            </HStack>
          </VStack>
        ) : null}
      </VStack>
    </Collapsible>
  );
}
