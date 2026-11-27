'use client';

import type React from 'react';
import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Table } from '@astryxdesign/core/Table';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Check, Copy, Gift, Trash2 } from 'lucide-react';
import { formatCurrency, formatDateShortInTimezone } from '@/lib/format';
import { useCopyToClipboard } from '@/lib/hooks/useCopyToClipboard';
import type { Coupon } from '@/lib/types';
import type { FormSubmitResult } from '@/lib/forms/form-submit';
import { EmptyStateCard, StatusTag, SurfaceCard } from '@/components/ui';
import type { FormDialogControls } from '@/components/ui/FormDialog';
import { FormDialogLauncher } from '@/components/ui/FormDialogLauncher';
import { classifyCouponStatus } from './cajaMetrics';

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
  tz: string;
  nowMs: number;
  canManageCoupons?: boolean;
  deletingCouponId: string | null;
  onCreateCoupon: CreateCouponHandler;
  onRequestDeleteCoupon: (coupon: Coupon) => void;
}

const COUPON_KIND_OPTIONS: Array<{ value: CouponKind; label: string }> = [
  { value: 'coupon', label: 'Cupón de descuento' },
  { value: 'gift_card', label: 'Tarjeta de regalo con saldo' },
];

const DISCOUNT_TYPE_OPTIONS: Array<{ value: CouponDiscountType; label: string }> = [
  { value: 'percent', label: 'Porcentaje (%)' },
  { value: 'fixed_cents', label: 'Cantidad fija' },
];

function CouponFormBody({
  currency,
  onCreateCoupon,
  controls,
}: {
  currency: 'MXN' | 'USD';
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
          placeholder="Ejemplo: CUMPLE20"
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
            cpKind === 'gift_card'
              ? `Saldo de la tarjeta (${currency})`
              : isMoney
                ? `Descuento (${currency})`
                : 'Descuento (%)'
          }
          value={cpValue}
          min={1}
          max={isMoney ? undefined : 100}
          onChange={setCpValue}
        />
        <TextInput
          label="Para quién es"
          placeholder="Ejemplo: Regalo para Ana"
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
  tz,
  nowMs,
  canManageCoupons = true,
  deletingCouponId,
  onCreateCoupon,
  onRequestDeleteCoupon,
}: CouponsSubSectionProps) {
  const clipboard = useCopyToClipboard(2000);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyCode = async (coupon: Coupon) => {
    setCopiedId(coupon.id);
    await clipboard.copy(coupon.code, `Código ${coupon.code} copiado.`);
  };

  const activeCount = coupons.filter(
    (coupon) => classifyCouponStatus(coupon, nowMs).status === 'active',
  ).length;

  return (
    <VStack gap={0}>
      <SurfaceCard
        title="Cupones y tarjetas de regalo"
        subtitle="Códigos de descuento y tarjetas con saldo que tus clientas pueden usar al agendar."
        count={coupons.length}
        badge={
          coupons.length > 0 ? (
            <StatusTag
              tone="success"
              hasTabularNumbers
              label={`${activeCount} ${activeCount === 1 ? 'activo' : 'activos'}`}
            />
          ) : undefined
        }
        actions={
          canManageCoupons ? (
            <FormDialogLauncher
              triggerLabel="Crear código"
              title="Crear cupón o tarjeta de regalo"
              subtitle="Tus clientas lo escriben al agendar y se descuenta solo."
              triggerVariant="secondary"
              triggerSize="sm"
            >
              {(controls) => (
                <CouponFormBody
                  currency={currency}
                  onCreateCoupon={onCreateCoupon}
                  controls={controls}
                />
              )}
            </FormDialogLauncher>
          ) : undefined
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
                  renderCell: (c) => {
                    const isCopied = clipboard.copied && copiedId === c.id;
                    const metaParts: string[] = [];
                    if (c.recipientName) metaParts.push(`Para ${c.recipientName}`);
                    if (c.expiresAt) {
                      metaParts.push(`Vence ${formatDateShortInTimezone(c.expiresAt, tz)}`);
                    }
                    return (
                      <VStack gap={0.5} className="ad-coupon-code-cell">
                        <HStack gap={1.5} align="center">
                          <Gift size={14} aria-hidden="true" className="ad-coupon-icon" />
                          <Text type="code" weight="semibold">
                            {c.code}
                          </Text>
                          <IconButton
                            type="button"
                            size="sm"
                            variant="ghost"
                            label={isCopied ? 'Código copiado' : `Copiar código ${c.code}`}
                            tooltip={isCopied ? 'Copiado' : 'Copiar código'}
                            icon={
                              isCopied ? (
                                <Check size={13} aria-hidden="true" />
                              ) : (
                                <Copy size={13} aria-hidden="true" />
                              )
                            }
                            onClick={() => void handleCopyCode(c)}
                          />
                        </HStack>
                        {metaParts.length > 0 ? (
                          <Text type="supporting" color="secondary">
                            {metaParts.join(' · ')}
                          </Text>
                        ) : null}
                      </VStack>
                    );
                  },
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
                  key: 'isActive',
                  header: 'Estado',
                  renderCell: (c) => {
                    const meta = classifyCouponStatus(c, nowMs);
                    return <StatusTag tone={meta.tone} showDot label={meta.label} />;
                  },
                },
                {
                  key: 'discountValue',
                  header: 'Beneficio / Saldo',
                  renderCell: (c) => {
                    if (c.kind === 'gift_card') {
                      const remaining = c.remainingBalanceCents ?? 0;
                      const initial = Math.max(c.discountValue, remaining, 1);
                      const pct = Math.max(0, Math.min(100, Math.round((remaining / initial) * 100)));
                      return (
                        <VStack gap={1} className="ad-coupon-progress-cell">
                          <HStack justify="between" align="center" gap={2}>
                            <Text weight="semibold" hasTabularNumbers>
                              {formatCurrency(remaining, currency)}
                            </Text>
                            <Text type="supporting" color="secondary" hasTabularNumbers>
                              de {formatCurrency(c.discountValue, currency)}
                            </Text>
                          </HStack>
                          <VStack className="ad-thin-track" gap={0} aria-hidden="true">
                            <VStack
                              className="ad-thin-fill"
                              data-accent={remaining > 0 ? 'true' : undefined}
                              gap={0}
                              style={{ width: `${pct}%` }}
                            />
                          </VStack>
                        </VStack>
                      );
                    }
                    return (
                      <VStack gap={0}>
                        <Text weight="semibold" hasTabularNumbers>
                          {c.discountType === 'percent'
                            ? `${c.discountValue}% de descuento`
                            : formatCurrency(c.discountValue, currency)}
                        </Text>
                        {c.minSubtotalCents > 0 ? (
                          <Text type="supporting" color="secondary" hasTabularNumbers>
                            Mínimo {formatCurrency(c.minSubtotalCents, currency)}
                          </Text>
                        ) : null}
                      </VStack>
                    );
                  },
                },
                {
                  key: 'usedCount',
                  header: 'Uso',
                  renderCell: (c) => {
                    if (!c.maxUses) {
                      return (
                        <Text hasTabularNumbers>
                          {c.usedCount} {c.usedCount === 1 ? 'uso' : 'usos'}
                        </Text>
                      );
                    }
                    const pct = Math.max(
                      0,
                      Math.min(100, Math.round((c.usedCount / c.maxUses) * 100)),
                    );
                    return (
                      <VStack gap={1} className="ad-coupon-usage-cell">
                        <Text type="supporting" weight="medium" hasTabularNumbers>
                          {c.usedCount} / {c.maxUses}
                        </Text>
                        <VStack className="ad-thin-track" gap={0} aria-hidden="true">
                          <VStack
                            className="ad-thin-fill"
                            data-accent={pct >= 80 ? 'true' : undefined}
                            gap={0}
                            style={{ width: `${pct}%` }}
                          />
                        </VStack>
                      </VStack>
                    );
                  },
                },
                ...(canManageCoupons
                  ? [
                      {
                        key: 'id' as const,
                        header: 'Acciones',
                        align: 'end' as const,
                        renderCell: (c: Coupon) => (
                          <Button
                            type="button"
                            label="Eliminar"
                            variant="ghost"
                            size="sm"
                            className="ad-caja-delete-btn"
                            icon={<Trash2 size={14} aria-hidden="true" />}
                            isLoading={deletingCouponId === c.id}
                            isDisabled={Boolean(deletingCouponId)}
                            onClick={() => onRequestDeleteCoupon(c)}
                          />
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </VStack>
        )}
      </SurfaceCard>
    </VStack>
  );
}
