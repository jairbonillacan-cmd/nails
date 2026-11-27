'use client';

import type React from 'react';
import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { DateInput } from '@astryxdesign/core/DateInput';
import { Switch } from '@astryxdesign/core/Switch';
import { Check, Plus, Sparkles } from 'lucide-react';
import type { Coupon } from '@/lib/types';
import { formSubmitError, type FormSubmitResult } from '@/lib/forms/form-submit';
import { FilterPillBar, type FilterPillOption } from '@/components/ui';
import { FormDialog } from '@/components/ui/FormDialog';
import {
  describeCouponPreview,
  formatExpiryDateInput,
  generateCouponCode,
  toIsoDateValue,
  validateCouponEditorInput,
  type CouponEditorInput,
  type CouponPayloadData,
} from './cajaMetrics';

type CouponKind = 'coupon' | 'gift_card';
type CouponDiscountType = 'percent' | 'fixed_cents';

const COUPON_KIND_OPTIONS: readonly FilterPillOption<CouponKind>[] = [
  { value: 'coupon', label: 'Cupón de descuento' },
  { value: 'gift_card', label: 'Tarjeta de regalo' },
];

const DISCOUNT_TYPE_OPTIONS: readonly FilterPillOption<CouponDiscountType>[] = [
  { value: 'percent', label: 'Porcentaje' },
  { value: 'fixed_cents', label: 'Monto fijo' },
];

const COUPON_EDITOR_FORM_ID = 'caja-coupon-editor-form';

interface CouponEditorDialogProps {
  isOpen: boolean;
  coupon: Coupon | null;
  existingCodes: readonly string[];
  todayKey: string;
  currency: 'MXN' | 'USD';
  onOpenChange: (open: boolean) => void;
  onSaveCoupon: (data: CouponPayloadData) => Promise<FormSubmitResult>;
}

function initialEditorInput(coupon: Coupon | null): CouponEditorInput {
  if (!coupon) {
    return {
      code: '',
      kind: 'coupon',
      discountType: 'percent',
      value: 15,
      remainingBalanceMxn: 500,
      minSubtotalMxn: 0,
      maxUses: 100,
      expiresDate: '',
      recipientName: '',
      isActive: true,
    };
  }
  const isMoney = coupon.kind === 'gift_card' || coupon.discountType === 'fixed_cents';
  return {
    id: coupon.id,
    code: coupon.code,
    kind: coupon.kind,
    discountType: coupon.discountType,
    value: isMoney ? Number((coupon.discountValue / 100).toFixed(2)) : coupon.discountValue,
    remainingBalanceMxn: Number(((coupon.remainingBalanceCents ?? 0) / 100).toFixed(2)),
    minSubtotalMxn: Number((coupon.minSubtotalCents / 100).toFixed(2)),
    maxUses: coupon.maxUses ?? 0,
    expiresDate: formatExpiryDateInput(coupon.expiresAt),
    recipientName: coupon.recipientName ?? '',
    isActive: coupon.isActive,
  };
}

function CouponEditorForm({
  coupon,
  existingCodes,
  todayKey,
  currency,
  onOpenChange,
  onSaveCoupon,
}: Omit<CouponEditorDialogProps, 'isOpen'>) {
  const isEditing = Boolean(coupon);
  const [input, setInput] = useState<CouponEditorInput>(() => initialEditorInput(coupon));
  const update = (patch: Partial<CouponEditorInput>) =>
    setInput((current) => ({ ...current, ...patch }));
  const isGiftCard = input.kind === 'gift_card';
  const isMoney = isGiftCard || input.discountType === 'fixed_cents';
  const preview = describeCouponPreview(input, currency);

  const handleKindChange = (next: CouponKind) => {
    if (isEditing) return;
    if (next === 'gift_card') {
      update({
        kind: next,
        discountType: 'fixed_cents',
        value: input.value <= 100 ? 500 : input.value,
        maxUses: 1,
        minSubtotalMxn: 0,
      });
    } else {
      update({ kind: next, discountType: 'percent', value: 15, maxUses: 100 });
    }
  };

  const otherCodes = existingCodes.filter(
    (code) => code.toUpperCase() !== (coupon?.code ?? '').toUpperCase(),
  );

  return (
    <FormDialog
      isOpen
      onOpenChange={onOpenChange}
      title={
        isEditing
          ? `${coupon?.kind === 'gift_card' ? 'Editar tarjeta' : 'Editar cupón'} · ${coupon?.code ?? ''}`
          : 'Nuevo cupón o tarjeta de regalo'
      }
      subtitle={
        isEditing
          ? 'Los cambios aplican a reservas nuevas; el historial no cambia.'
          : 'Tu clienta escribe el código al agendar y se aplica solo.'
      }
      submitFooter={{
        formId: COUPON_EDITOR_FORM_ID,
        submitLabel: isEditing ? 'Guardar cambios' : isGiftCard ? 'Crear tarjeta' : 'Crear cupón',
        submitIcon: isEditing ? (
          <Check size={14} aria-hidden="true" />
        ) : (
          <Plus size={14} aria-hidden="true" />
        ),
      }}
    >
      {(controls) => (
        <form
          id={COUPON_EDITOR_FORM_ID}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
            const validation = validateCouponEditorInput(input);
            if (!validation.ok) {
              controls.submit(async () => formSubmitError(validation.error));
              return;
            }
            controls.submit(() => onSaveCoupon(validation.data));
          }}
        >
          <VStack gap={4}>
            {!isEditing ? (
              <FilterPillBar
                ariaLabel="Tipo de código"
                mode="segmented"
                size="sm"
                value={input.kind}
                options={COUPON_KIND_OPTIONS}
                onChange={handleKindChange}
              />
            ) : null}

            <HStack gap={2} align="end">
              <TextInput
                label="Código"
                description="Lo que tu clienta escribe al reservar."
                placeholder={isGiftCard ? 'Ej. REGALO-ANA' : 'Ej. CUMPLE20'}
                value={input.code}
                onChange={(next) => update({ code: next.toUpperCase() })}
                containerClassName="rb-grow"
                isRequired
              />
              <Button
                type="button"
                label="Generar"
                variant="secondary"
                icon={<Sparkles size={14} aria-hidden="true" />}
                onClick={() =>
                  update({ code: generateCouponCode(input.kind, Math.random, otherCodes) })
                }
              />
            </HStack>

            {isGiftCard ? (
              <Grid columns={{ minWidth: 150, max: 2 }} gap={3}>
                <NumberInput
                  label={`Valor de la tarjeta (${currency})`}
                  value={input.value}
                  min={1}
                  onChange={(next) => update({ value: next })}
                />
                {isEditing ? (
                  <NumberInput
                    label={`Saldo disponible (${currency})`}
                    value={input.remainingBalanceMxn}
                    min={0}
                    onChange={(next) => update({ remainingBalanceMxn: next })}
                  />
                ) : (
                  <TextInput
                    label="Para quién es"
                    placeholder="Ej. Regalo para Ana"
                    value={input.recipientName}
                    onChange={(next) => update({ recipientName: next })}
                    isOptional
                  />
                )}
              </Grid>
            ) : (
              <VStack gap={3}>
                <FilterPillBar
                  ariaLabel="Tipo de descuento"
                  mode="segmented"
                  size="sm"
                  value={input.discountType}
                  options={DISCOUNT_TYPE_OPTIONS}
                  onChange={(next) => update({ discountType: next })}
                />
                <Grid columns={{ minWidth: 150, max: 2 }} gap={3}>
                  <NumberInput
                    label={isMoney ? `Descuento (${currency})` : 'Descuento (%)'}
                    value={input.value}
                    min={1}
                    max={isMoney ? undefined : 100}
                    onChange={(next) => update({ value: next })}
                  />
                  <NumberInput
                    label={`Compra mínima (${currency})`}
                    description="0 = sin mínimo"
                    value={input.minSubtotalMxn}
                    min={0}
                    onChange={(next) => update({ minSubtotalMxn: next })}
                  />
                </Grid>
              </VStack>
            )}

            <Grid columns={{ minWidth: 150, max: 2 }} gap={3}>
              <NumberInput
                label={isGiftCard ? 'Canjes máximos' : 'Límite de usos'}
                description={isGiftCard ? '1 = un solo canje · 0 = hasta agotar saldo' : '0 = ilimitado'}
                value={input.maxUses}
                min={0}
                max={100000}
                isIntegerOnly
                onChange={(next) => update({ maxUses: next })}
              />
              <DateInput
                label="Vence"
                description="Vacío = no vence"
                value={toIsoDateValue(input.expiresDate)}
                min={toIsoDateValue(todayKey)}
                hasClear
                isOptional
                onChange={(next) => update({ expiresDate: next ?? '' })}
              />
            </Grid>

            {!isGiftCard || isEditing ? (
              <TextInput
                label="Para quién es"
                placeholder={isGiftCard ? 'Ej. Regalo para Ana' : 'Ej. Clientas de Instagram'}
                value={input.recipientName}
                onChange={(next) => update({ recipientName: next })}
                isOptional
              />
            ) : null}

            <Switch
              label="Activo para nuevas reservas"
              value={input.isActive}
              onChange={(next) => update({ isActive: next })}
            />

            <VStack className="ad-subpanel ad-coupon-preview" gap={1} role="status" aria-live="polite">
              <Text type="supporting" color="secondary">
                Así funcionará
              </Text>
              <Text weight="semibold">{preview.headline}</Text>
              {preview.details.map((line) => (
                <Text key={line} type="supporting" color="secondary" hasTabularNumbers>
                  • {line}
                </Text>
              ))}
            </VStack>
          </VStack>
        </form>
      )}
    </FormDialog>
  );
}

export function CouponEditorDialog({ isOpen, ...props }: CouponEditorDialogProps) {
  if (!isOpen) return null;
  return <CouponEditorForm {...props} />;
}
