'use client';

import React, { useMemo, useState } from 'react';
import { Drawer, DrawerHeader } from '@astryxdesign/core/Drawer';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Token } from '@astryxdesign/core/Token';
import { Selector } from '@astryxdesign/core/Selector';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Switch } from '@astryxdesign/core/Switch';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { CalendarPlus, Plus, Sparkles, Trash2 } from 'lucide-react';
import { computeClientLoyaltySummary } from '@/lib/loyalty/stamps';
import {
  computeBookingPaymentSummary,
  type BookingPaymentSummary,
} from '@/lib/payments/splits';
import type {
  BookingWithRelations,
  InventoryItem,
  LoyaltyProgram,
  LoyaltyStamp,
  PaymentSplit,
  PaymentSplitMethod,
  StaffMember,
} from '@/lib/types';
import { formatCurrency } from '@/lib/format';

interface SplitRowDraft {
  id: string;
  method: PaymentSplitMethod;
  amountMxn: number;
  reference: string;
}

interface CompletedCheckoutState {
  summary: BookingPaymentSummary;
  splitsCount: number;
  stampAwarded: LoyaltyStamp | null;
  redeemedReward: boolean;
}

interface CheckoutDrawerDialogProps {
  booking: BookingWithRelations | null;
  existingSplits: PaymentSplit[];
  inventory: InventoryItem[];
  staff: StaffMember[];
  loyaltyProgram: LoyaltyProgram | null;
  loyaltyStamps: LoyaltyStamp[];
  currency: 'MXN' | 'USD';
  onClose: () => void;
  onCompleted: () => Promise<void>;
  onScheduleRetouch: (booking: BookingWithRelations) => void;
}

const SPLIT_METHOD_OPTIONS: Array<{ value: PaymentSplitMethod; label: string }> = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia SPEI' },
  { value: 'card', label: 'Tarjeta (Terminal / Clip)' },
  { value: 'giftcard', label: 'Gift Card' },
];

const METHOD_LABELS: Record<PaymentSplitMethod, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  giftcard: 'Gift Card',
  online: 'Pago en línea',
};

export function CheckoutDrawerDialog({
  booking,
  existingSplits,
  inventory,
  staff,
  loyaltyProgram,
  loyaltyStamps,
  currency,
  onClose,
  onCompleted,
  onScheduleRetouch,
}: CheckoutDrawerDialogProps) {
  const retailItems = useMemo(
    () => inventory.filter((i) => i.isActive && i.retailPriceCents > 0),
    [inventory],
  );
  const activeStaff = useMemo(
    () => staff.filter((s) => s.isActive).toSorted((a, b) => a.displayOrder - b.displayOrder),
    [staff],
  );

  const initialSummary = useMemo(
    () =>
      booking
        ? computeBookingPaymentSummary(booking.totalPriceCents, existingSplits)
        : null,
    [booking, existingSplits],
  );

  const initialRemainingMxn = initialSummary
    ? Number((initialSummary.remainingCents / 100).toFixed(2))
    : 0;

  const [rows, setRows] = useState<SplitRowDraft[]>(() => [
    {
      id: 'split-1',
      method: 'card',
      amountMxn: initialRemainingMxn,
      reference: '',
    },
  ]);
  const [tipMxn, setTipMxn] = useState<number>(0);
  const [tipStaffId, setTipStaffId] = useState<string>(booking?.staffId ?? '');
  const [extraItemId, setExtraItemId] = useState<string>('none');
  const [extraQuantity, setExtraQuantity] = useState<number>(1);
  const [redeemLoyaltyReward, setRedeemLoyaltyReward] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [completedState, setCompletedState] = useState<CompletedCheckoutState | null>(null);

  if (!booking) {
    return (
      <Drawer
        isOpen={false}
        onOpenChange={() => onClose()}
        label="Cobro y liquidación de cita"
        side="end"
        width={520}
      >
        <VStack gap={2} />
      </Drawer>
    );
  }

  const selectedExtraItem =
    extraItemId !== 'none'
      ? retailItems.find((i) => i.id === extraItemId) ?? null
      : null;
  const extraQty = selectedExtraItem ? Math.max(1, Math.min(50, Math.round(extraQuantity || 1))) : 0;
  const extraTotalCents = selectedExtraItem
    ? Math.round(selectedExtraItem.retailPriceCents * extraQty)
    : 0;

  const effectiveTotalCents = booking.totalPriceCents + extraTotalCents;
  const loyaltySummary = loyaltyProgram
    ? computeClientLoyaltySummary(loyaltyProgram, loyaltyStamps, booking.clientId)
    : null;

  const draftSplitsForPreview = rows.map((row, index) => ({
    amountCents: Math.max(0, Math.round((row.amountMxn || 0) * 100)),
    tipCents: index === 0 ? Math.max(0, Math.round((tipMxn || 0) * 100)) : 0,
  }));

  const combinedSummary = computeBookingPaymentSummary(effectiveTotalCents, [
    ...existingSplits,
    ...draftSplitsForPreview,
  ]);
  const draftChargeCents = draftSplitsForPreview.reduce((sum, s) => sum + s.amountCents, 0);
  const draftTipCents = Math.max(0, Math.round((tipMxn || 0) * 100));

  const handleAddSplitRow = () => {
    const remainingForNewRow = Number((combinedSummary.remainingCents / 100).toFixed(2));
    const usedMethods = new Set(rows.map((r) => r.method));
    const nextMethod: PaymentSplitMethod = !usedMethods.has('cash')
      ? 'cash'
      : !usedMethods.has('transfer')
        ? 'transfer'
        : 'card';
    setRows((prev) => [
      ...prev,
      {
        id: `split-${Date.now()}-${prev.length + 1}`,
        method: nextMethod,
        amountMxn: remainingForNewRow,
        reference: '',
      },
    ]);
  };

  const handleUpdateRow = (id: string, patch: Partial<SplitRowDraft>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const handleRemoveRow = (id: string) => {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  };

  const handleExtraItemChange = (nextItemId: string) => {
    setExtraItemId(nextItemId);
    const nextItem =
      nextItemId !== 'none'
        ? retailItems.find((i) => i.id === nextItemId) ?? null
        : null;
    const nextExtraCents = nextItem ? nextItem.retailPriceCents : 0;
    const prevPaid = existingSplits.reduce((sum, s) => sum + s.amountCents, 0);
    const nextRemainingMxn = Number(
      (Math.max(0, booking.totalPriceCents + nextExtraCents - prevPaid) / 100).toFixed(2),
    );
    if (rows.length === 1) {
      setRows((prev) =>
        prev.map((r, idx) => (idx === 0 ? { ...r, amountMxn: nextRemainingMxn } : r)),
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorText(null);
    try {
      const payloadSplits = rows.map((row, index) => ({
        method: row.method,
        amountCents: Math.max(0, Math.round((row.amountMxn || 0) * 100)),
        tipCents: index === 0 ? draftTipCents : 0,
        tipStaffId:
          index === 0 && draftTipCents > 0 ? tipStaffId || booking.staffId : null,
        ...(row.reference.trim() ? { reference: row.reference.trim() } : {}),
      }));

      const res = await fetch('/api/admin/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'checkout_split',
          bookingId: booking.id,
          splits: payloadSplits,
          extraItem: selectedExtraItem
            ? { inventoryItemId: selectedExtraItem.id, quantity: extraQty }
            : null,
          markCompleted: true,
          redeemLoyaltyReward: Boolean(loyaltySummary?.isRewardReady && redeemLoyaltyReward),
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: string;
        code?: string;
        summary?: BookingPaymentSummary;
        splits?: PaymentSplit[];
        stampAwarded?: LoyaltyStamp | null;
      } | null;

      if (!res.ok) {
        if (res.status === 403 && json?.code === 'PAST_BOOKING_LOCKED') {
          setErrorText(
            json.error ||
              'Esta cita ya pasó y está bloqueada por política de seguridad; solo la Dueña puede liquidarla.',
          );
          return;
        }
        setErrorText(json?.error || 'No se pudo registrar el cobro.');
        return;
      }

      setCompletedState({
        summary: json?.summary ?? combinedSummary,
        splitsCount: json?.splits?.length ?? payloadSplits.length,
        stampAwarded: json?.stampAwarded ?? null,
        redeemedReward: Boolean(loyaltySummary?.isRewardReady && redeemLoyaltyReward),
      });
      await onCompleted();
    } finally {
      setSubmitting(false);
    }
  };

  const payButtonTotalLabel = formatCurrency(draftChargeCents + draftTipCents, currency);

  return (
    <Drawer
      isOpen={Boolean(booking)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      label="Cobro y liquidación de cita"
      side="end"
      width={520}
      purpose="form"
    >
      <Layout
        header={
          <DrawerHeader
            title="Cobrar y completar cita"
            subtitle={`${booking.client.fullName} · ${booking.service.name} (${booking.bookingCode})`}
            hasDivider
            onOpenChange={(open) => {
              if (!open) onClose();
            }}
          />
        }
        content={
          <LayoutContent>
            {completedState ? (
              <VStack gap={4}>
                <Banner
                  status="success"
                  role="status"
                  title="Cobro registrado y cita completada"
                  description={`Pagado total ${formatCurrency(
                    completedState.summary.paidCents,
                    currency,
                  )} en ${completedState.splitsCount} movimiento(s)${
                    completedState.summary.totalTipsCents > 0
                      ? ` · Propina ${formatCurrency(
                          completedState.summary.totalTipsCents,
                          currency,
                        )}`
                      : ''
                  }.`}
                />

                {completedState.stampAwarded ? (
                  <Card variant="muted" padding={3}>
                    <HStack justify="between" align="center" gap={2}>
                      <HStack gap={2} align="center">
                        <Sparkles size={15} aria-hidden="true" />
                        <Text weight="semibold">
                          Sello de fidelidad otorgado (+1)
                        </Text>
                      </HStack>
                      <Badge variant="success" label="+1 sello" />
                    </HStack>
                  </Card>
                ) : null}

                {completedState.redeemedReward ? (
                  <Card variant="muted" padding={3}>
                    <HStack justify="between" align="center" gap={2}>
                      <Text weight="semibold">Premio de tarjeta de sellos canjeado</Text>
                      <Badge variant="info" label="Auditado" />
                    </HStack>
                  </Card>
                ) : null}

                <Card variant="muted" padding={4}>
                  <VStack gap={2}>
                    <Text weight="semibold">¿Deseas asegurar el siguiente retoque?</Text>
                    <Text type="supporting" color="secondary">
                      Abre la agenda prellenada para {booking.client.fullName} con{' '}
                      {booking.staff.name} en +21 días sin recapturar datos.
                    </Text>
                    <Button
                      type="button"
                      label="Agendar siguiente retoque (+21 días)"
                      variant="primary"
                      width="100%"
                      icon={<CalendarPlus size={15} />}
                      onClick={() => onScheduleRetouch(booking)}
                    />
                  </VStack>
                </Card>
              </VStack>
            ) : (
              <form id="checkout-split-form" onSubmit={handleSubmit}>
                <VStack gap={4}>
                  {errorText ? (
                    <Banner
                      status="error"
                      role="alert"
                      title={errorText}
                      isDismissable
                      onDismiss={() => setErrorText(null)}
                    />
                  ) : null}

                  <Card variant="muted" padding={3}>
                    <VStack gap={1.5}>
                      <HStack justify="between" align="center">
                        <Text type="supporting" color="secondary">
                          Total servicio{selectedExtraItem ? ' + producto' : ''}
                        </Text>
                        <Text weight="semibold" hasTabularNumbers>
                          {formatCurrency(effectiveTotalCents, currency)}
                        </Text>
                      </HStack>
                      <HStack justify="between" align="center">
                        <Text type="supporting" color="secondary">
                          Anticipo / pagos previos
                        </Text>
                        <Text weight="medium" hasTabularNumbers>
                          {formatCurrency(initialSummary?.paidCents ?? 0, currency)}
                        </Text>
                      </HStack>
                      {existingSplits.length > 0 ? (
                        <HStack gap={1.5} wrap="wrap">
                          {existingSplits.map((split) => (
                            <Token
                              key={split.id}
                              size="sm"
                              color="green"
                              label={`${METHOD_LABELS[split.method]} ${formatCurrency(
                                split.amountCents,
                                currency,
                              )}`}
                            />
                          ))}
                        </HStack>
                      ) : null}
                      <Divider />
                      <HStack justify="between" align="center">
                        <Text weight="semibold">Saldo restante</Text>
                        <Badge
                          variant={combinedSummary.isFullyPaid ? 'success' : 'warning'}
                          label={
                            combinedSummary.isFullyPaid
                              ? combinedSummary.changeCents > 0
                                ? `Cambio ${formatCurrency(combinedSummary.changeCents, currency)}`
                                : 'Liquidado'
                              : formatCurrency(combinedSummary.remainingCents, currency)
                          }
                        />
                      </HStack>
                    </VStack>
                  </Card>

                  <VStack gap={3}>
                    <HStack justify="between" align="center">
                      <Text weight="semibold">Pago dividido</Text>
                      <Button
                        type="button"
                        label="Agregar método"
                        variant="secondary"
                        size="sm"
                        icon={<Plus size={13} />}
                        onClick={handleAddSplitRow}
                      />
                    </HStack>

                    {rows.map((row, idx) => (
                      <Card key={row.id} variant="muted" padding={3}>
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
                                icon={<Trash2 size={14} />}
                                onClick={() => handleRemoveRow(row.id)}
                              />
                            ) : null}
                          </HStack>
                          <Grid columns={2} gap={2}>
                            <Selector
                              label="Método de pago"
                              value={row.method}
                              onChange={(val) =>
                                val &&
                                handleUpdateRow(row.id, {
                                  method: val as PaymentSplitMethod,
                                })
                              }
                              options={SPLIT_METHOD_OPTIONS}
                            />
                            <NumberInput
                              label={`Monto (${currency})`}
                              value={row.amountMxn}
                              min={0}
                              onChange={(val) =>
                                handleUpdateRow(row.id, { amountMxn: val || 0 })
                              }
                            />
                          </Grid>
                          <TextInput
                            label="Referencia / folio (opcional)"
                            placeholder="Ej. Folio Clip 4021 o SPEI"
                            value={row.reference}
                            autoCapitalize="none"
                            hasAutoCorrect={false}
                            hasSpellCheck={false}
                            onChange={(val) => handleUpdateRow(row.id, { reference: val })}
                          />
                        </VStack>
                      </Card>
                    ))}
                  </VStack>

                  <Card variant="muted" padding={3}>
                    <VStack gap={2}>
                      <Text weight="semibold">Propina universal</Text>
                      <Grid columns={2} gap={2}>
                        <NumberInput
                          label={`Propina (${currency})`}
                          value={tipMxn}
                          min={0}
                          onChange={(val) => setTipMxn(val || 0)}
                        />
                        <Selector
                          label="Asignar propina a"
                          value={tipStaffId || booking.staffId}
                          onChange={(val) => val && setTipStaffId(val)}
                          options={activeStaff.map((s) => ({
                            value: s.id,
                            label: s.name,
                          }))}
                        />
                      </Grid>
                    </VStack>
                  </Card>

                  {retailItems.length > 0 ? (
                    <Card variant="muted" padding={3}>
                      <VStack gap={2}>
                        <Text weight="semibold">Producto extra rápido (opcional)</Text>
                        <Grid columns={selectedExtraItem ? 2 : 1} gap={2}>
                          <Selector
                            label="Producto de reventa"
                            value={extraItemId}
                            onChange={(val) => val && handleExtraItemChange(val)}
                            options={[
                              { value: 'none', label: 'Sin producto adicional' },
                              ...retailItems.map((item) => ({
                                value: item.id,
                                label: `${item.name} · ${formatCurrency(
                                  item.retailPriceCents,
                                  currency,
                                )} (Stock: ${item.stockQuantity})`,
                              })),
                            ]}
                          />
                          {selectedExtraItem ? (
                            <NumberInput
                              label="Cantidad"
                              value={extraQuantity}
                              min={1}
                              max={50}
                              onChange={(val) => setExtraQuantity(val || 1)}
                            />
                          ) : null}
                        </Grid>
                      </VStack>
                    </Card>
                  ) : null}

                  {loyaltySummary ? (
                    <Card variant="muted" padding={3}>
                      <VStack gap={2}>
                        <HStack justify="between" align="center">
                          <Text weight="semibold">{loyaltySummary.programName}</Text>
                          <Badge
                            variant={loyaltySummary.isRewardReady ? 'success' : 'info'}
                            label={`${loyaltySummary.currentStamps} / ${loyaltySummary.stampsRequired} sellos`}
                          />
                        </HStack>
                        {loyaltySummary.isRewardReady ? (
                          <Switch
                            label="Canjear premio de sellos"
                            description={`Consume ${loyaltySummary.stampsRequired} sellos: ${loyaltySummary.rewardLabel}`}
                            value={redeemLoyaltyReward}
                            onChange={setRedeemLoyaltyReward}
                          />
                        ) : (
                          <Text type="supporting" color="secondary">
                            Al completar esta cita se otorgará automáticamente 1 sello (máx. 1 por día).
                          </Text>
                        )}
                      </VStack>
                    </Card>
                  ) : null}
                </VStack>
              </form>
            )}
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} justify="end">
              {completedState ? (
                <Button
                  type="button"
                  label="Listo, cerrar"
                  variant="secondary"
                  onClick={onClose}
                />
              ) : (
                <>
                  <Button
                    type="button"
                    label="Cancelar"
                    variant="secondary"
                    onClick={onClose}
                  />
                  <Button
                    type="submit"
                    form="checkout-split-form"
                    label={`Cobrar ${payButtonTotalLabel} y completar`}
                    variant="primary"
                    isLoading={submitting}
                    isDisabled={submitting}
                  />
                </>
              )}
            </HStack>
          </LayoutFooter>
        }
      />
    </Drawer>
  );
}
