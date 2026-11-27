'use client';

import type React from 'react';
import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Grid } from '@astryxdesign/core/Grid';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { Check, Plus } from 'lucide-react';
import type { Coupon } from '@/lib/types';
import { formSubmitError, type FormSubmitResult } from '@/lib/forms/form-submit';
import { FormDialog, type FormDialogControls } from '@/components/ui/FormDialog';
import {
  formatExpiryDateInput,
  validateCouponEditorInput,
  type CouponPayloadData,
} from './cajaMetrics';

type CouponKind = 'coupon' | 'gift_card';
type CouponDiscountType = 'percent' | 'fixed_cents';

const COUPON_KIND_OPTIONS: Array<{ value: CouponKind; label: string }> = [
  { value: 'coupon', label: 'Cupón de descuento' },
  { value: 'gift_card', label: 'Tarjeta de regalo con saldo' },
];

const DISCOUNT_TYPE_OPTIONS: Array<{ value: CouponDiscountType; label: string }> = [
  { value: 'percent', label: 'Porcentaje (%)' },
  { value: 'fixed_cents', label: 'Cantidad fija' },
];

const COUPON_EDITOR_FORM_ID = 'caja-coupon-editor-form';

interface CouponEditorDialogProps {
  isOpen: boolean;
  coupon: Coupon | null;
  currency: 'MXN' | 'USD';
  onOpenChange: (open: boolean) => void;
  onSaveCoupon: (data: CouponPayloadData) => Promise<FormSubmitResult>;
}

function CouponEditorFormBody({
  coupon,
  currency,
  onSaveCoupon,
  controls,
}: {
  coupon: Coupon | null;
  currency: 'MXN' | 'USD';
  onSaveCoupon: (data: CouponPayloadData) => Promise<FormSubmitResult>;
  controls: FormDialogControls;
}) {
  const isEditing = Boolean(coupon);
  const initialIsMoney = coupon
    ? coupon.kind === 'gift_card' || coupon.discountType === 'fixed_cents'
    : false;

  const [code, setCode] = useState(coupon?.code ?? '');
  const [kind, setKind] = useState<CouponKind>(coupon?.kind ?? 'coupon');
  const [discountType, setDiscountType] = useState<CouponDiscountType>(
    coupon?.discountType ?? 'percent',
  );
  const [value, setValue] = useState<number>(() => {
    if (!coupon) return 15;
    return initialIsMoney
      ? Number((coupon.discountValue / 100).toFixed(2))
      : coupon.discountValue;
  });
  const [remainingBalanceMxn, setRemainingBalanceMxn] = useState<number>(() => {
    if (!coupon || coupon.kind !== 'gift_card') return 500;
    return Number(((coupon.remainingBalanceCents ?? 0) / 100).toFixed(2));
  });
  const [minSubtotalMxn, setMinSubtotalMxn] = useState<number>(() =>
    coupon ? Number((coupon.minSubtotalCents / 100).toFixed(2)) : 0,
  );
  const [maxUses, setMaxUses] = useState<number>(() => {
    if (!coupon) return 100;
    return coupon.maxUses ?? 0;
  });
  const [expiresDate, setExpiresDate] = useState<string>(() =>
    formatExpiryDateInput(coupon?.expiresAt ?? null),
  );
  const [recipientName, setRecipientName] = useState<string>(coupon?.recipientName ?? '');
  const [isActive, setIsActive] = useState<boolean>(coupon?.isActive ?? true);

  const isMoney = kind === 'gift_card' || discountType === 'fixed_cents';

  const handleKindChange = (nextVal: string | null) => {
    const matched = COUPON_KIND_OPTIONS.find((option) => option.value === nextVal);
    if (!matched) return;
    setKind(matched.value);
    if (!isEditing) {
      if (matched.value === 'gift_card') {
        setDiscountType('fixed_cents');
        if (value <= 100) setValue(500);
        setMaxUses(1);
      } else {
        setMaxUses(100);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateCouponEditorInput({
      id: coupon?.id,
      code,
      kind,
      discountType,
      value,
      remainingBalanceMxn,
      minSubtotalMxn,
      maxUses,
      expiresDate,
      recipientName,
      isActive,
    });
    if (!validation.ok) {
      controls.submit(async () => formSubmitError(validation.error));
      return;
    }
    controls.submit(() => onSaveCoupon(validation.data));
  };

  return (
    <form id={COUPON_EDITOR_FORM_ID} onSubmit={handleSubmit}>
      <VStack gap={3}>
        <TextInput
          label="Código"
          description="La palabra que tu clienta escribe al agendar."
          placeholder="Ejemplo: CUMPLE20"
          value={code}
          onChange={setCode}
          isRequired
        />

        <Grid columns={{ minWidth: 150, max: 2 }} gap={2}>
          <Selector
            label="Tipo"
            value={kind}
            onChange={handleKindChange}
            options={COUPON_KIND_OPTIONS}
          />
          {kind === 'coupon' ? (
            <Selector
              label="Descuento en"
              value={discountType}
              onChange={(v) => {
                const next = DISCOUNT_TYPE_OPTIONS.find((option) => option.value === v);
                if (next) setDiscountType(next.value);
              }}
              options={DISCOUNT_TYPE_OPTIONS}
            />
          ) : (
            <NumberInput
              label={`Valor inicial (${currency})`}
              value={value}
              min={1}
              onChange={setValue}
            />
          )}
        </Grid>

        {kind === 'coupon' ? (
          <Grid columns={{ minWidth: 150, max: 2 }} gap={2}>
            <NumberInput
              label={isMoney ? `Descuento (${currency})` : 'Descuento (%)'}
              value={value}
              min={1}
              max={isMoney ? undefined : 100}
              onChange={setValue}
            />
            <NumberInput
              label={`Compra mínima (${currency})`}
              description="0 = sin mínimo"
              value={minSubtotalMxn}
              min={0}
              onChange={setMinSubtotalMxn}
            />
          </Grid>
        ) : isEditing ? (
          <Grid columns={{ minWidth: 150, max: 2 }} gap={2}>
            <NumberInput
              label={`Saldo disponible (${currency})`}
              value={remainingBalanceMxn}
              min={0}
              onChange={setRemainingBalanceMxn}
            />
            <NumberInput
              label={`Compra mínima (${currency})`}
              description="0 = sin mínimo"
              value={minSubtotalMxn}
              min={0}
              onChange={setMinSubtotalMxn}
            />
          </Grid>
        ) : (
          <NumberInput
            label={`Compra mínima (${currency})`}
            description="0 = sin mínimo"
            value={minSubtotalMxn}
            min={0}
            onChange={setMinSubtotalMxn}
          />
        )}

        <Grid columns={{ minWidth: 150, max: 2 }} gap={2}>
          <NumberInput
            label="Límite de usos"
            description="0 = usos ilimitados"
            value={maxUses}
            min={0}
            max={100000}
            isIntegerOnly
            onChange={setMaxUses}
          />
          <TextInput
            label="Fecha de vencimiento"
            placeholder="AAAA-MM-DD"
            description="Vacío = no vence"
            value={expiresDate}
            onChange={setExpiresDate}
            hasClear
            isOptional
          />
        </Grid>

        <TextInput
          label="Para quién es"
          placeholder="Ejemplo: Regalo para Ana"
          description="Cada clienta puede canjear un código una sola vez automáticamente."
          value={recipientName}
          onChange={setRecipientName}
          isOptional
        />

        <Switch
          label="Código activo para nuevas reservas"
          value={isActive}
          onChange={setIsActive}
        />
      </VStack>
    </form>
  );
}

export function CouponEditorDialog({
  isOpen,
  coupon,
  currency,
  onOpenChange,
  onSaveCoupon,
}: CouponEditorDialogProps) {
  const isEditing = Boolean(coupon);

  return (
    <FormDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={
        isEditing
          ? coupon?.kind === 'gift_card'
            ? `Editar tarjeta · ${coupon.code}`
            : `Editar cupón · ${coupon?.code ?? ''}`
          : 'Crear cupón o tarjeta de regalo'
      }
      subtitle={
        isEditing
          ? 'Los cambios aplican a futuras reservas sin alterar el historial de citas pasadas.'
          : 'Tus clientas escriben el código al agendar y se descuenta automáticamente.'
      }
      submitFooter={{
        formId: COUPON_EDITOR_FORM_ID,
        submitLabel: isEditing ? 'Guardar cambios' : 'Crear código',
        submitIcon: isEditing ? (
          <Check size={14} aria-hidden="true" />
        ) : (
          <Plus size={14} aria-hidden="true" />
        ),
      }}
    >
      {(controls) => (
        <CouponEditorFormBody
          coupon={coupon}
          currency={currency}
          onSaveCoupon={onSaveCoupon}
          controls={controls}
        />
      )}
    </FormDialog>
  );
}
