'use client';

import React, { useMemo, useState } from 'react';
import { Drawer, DrawerHeader } from '@astryxdesign/core/Drawer';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Token } from '@astryxdesign/core/Token';
import { Selector } from '@astryxdesign/core/Selector';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Switch } from '@astryxdesign/core/Switch';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import {
  ArrowLeftRight,
  Banknote,
  CalendarPlus,
  CreditCard,
  PackageCheck,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
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

type TipPreset = '0' | '50' | '100' | 'other';

interface CompletedCheckoutState {
  summary: BookingPaymentSummary;
  splitsCount: number;
  stampAwarded: LoyaltyStamp | null;
  redeemedReward: boolean;
  redeemedPackageName: string | null;
}

interface ClientPackageSummaryRow {
  id: string;
  clientId: string;
  packageId: string;
  packageName: string;
  serviceId: string;
  totalSessions: number;
  usedSessions: number;
  purchasedAt: string;
  expiresAt: string | null;
  status: 'active' | 'exhausted' | 'expired' | 'canceled';
  notes: string;
  clientName: string;
  serviceName: string;
  remainingSessions: number;
  isExpired: boolean;
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
  { value: 'transfer', label: 'Transferencia' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'giftcard', label: 'Tarjeta de regalo' },
];

const METHOD_LABELS: Record<PaymentSplitMethod, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  giftcard: 'Tarjeta de regalo',
  online: 'Pago en línea',
};

const QUICK_METHODS: ReadonlyArray<{
  value: 'cash' | 'transfer' | 'card';
  label: string;
}> = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'card', label: 'Tarjeta' },
];

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

  const [isSplitMode, setIsSplitMode] = useState(false);
  const [singleMethod, setSingleMethod] = useState<'cash' | 'transfer' | 'card'>('cash');
  const [rows, setRows] = useState<SplitRowDraft[]>(() => [
    {
      id: 'split-1',
      method: 'cash',
      amountMxn: initialRemainingMxn,
      reference: '',
    },
  ]);
  const [tipPreset, setTipPreset] = useState<TipPreset>('0');
  const [tipMxn, setTipMxn] = useState<number>(0);
  const [tipStaffId, setTipStaffId] = useState<string>(booking?.staffId ?? '');
  const [extraItemId, setExtraItemId] = useState<string>('none');
  const [extraQuantity, setExtraQuantity] = useState<number>(1);
  const [redeemLoyaltyReward, setRedeemLoyaltyReward] = useState(false);
  const [clientPackages, setClientPackages] = useState<ClientPackageSummaryRow[]>([]);
  const [redeemPackageId, setRedeemPackageId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [completedState, setCompletedState] = useState<CompletedCheckoutState | null>(null);

  const packageSyncKey = booking
    ? `checkout-pkg|${booking.clientId}|${booking.id}`
    : 'checkout-pkg-closed';

  useExternalSync(packageSyncKey, async (signal, key) => {
    if (key === 'checkout-pkg-closed' || !booking) {
      setClientPackages([]);
      setRedeemPackageId(null);
      return;
    }
    try {
      const res = await fetch(
        `/api/admin/packages?clientId=${encodeURIComponent(booking.clientId)}`,
        { cache: 'no-store', signal },
      );
      if (signal.aborted || !res.ok) return;
      const json = (await res.json()) as {
        clientPackages?: ClientPackageSummaryRow[];
      };
      if (signal.aborted) return;
      const active = (json.clientPackages ?? [])
        .filter((pkg) => pkg.status === 'active' && !pkg.isExpired && pkg.remainingSessions > 0)
        .toSorted((a, b) => {
          const aMatch = a.serviceId === booking.serviceId ? 0 : 1;
          const bMatch = b.serviceId === booking.serviceId ? 0 : 1;
          if (aMatch !== bMatch) return aMatch - bMatch;
          return b.remainingSessions - a.remainingSessions;
        });
      setClientPackages(active);
    } catch {
      if (!signal.aborted) {
        setClientPackages([]);
      }
    }
  });

  if (!booking) {
    return (
      <Drawer
        isOpen={false}
        onOpenChange={() => onClose()}
        label="Cobrar cita"
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
  const extraQty = selectedExtraItem
    ? Math.max(1, Math.min(50, Math.round(extraQuantity || 1)))
    : 0;
  const extraTotalCents = selectedExtraItem
    ? Math.round(selectedExtraItem.retailPriceCents * extraQty)
    : 0;

  const selectedPackage = redeemPackageId
    ? clientPackages.find((pkg) => pkg.id === redeemPackageId) ?? null
    : null;

  const effectiveTotalCents = booking.totalPriceCents + extraTotalCents;
  const priorPaidCents = initialSummary?.paidCents ?? 0;
  const heroRemainingCents = selectedPackage
    ? Math.max(0, extraTotalCents)
    : Math.max(0, effectiveTotalCents - priorPaidCents);
  const heroRemainingMxn = Number((heroRemainingCents / 100).toFixed(2));

  const loyaltySummary = loyaltyProgram
    ? computeClientLoyaltySummary(loyaltyProgram, loyaltyStamps, booking.clientId)
    : null;

  const draftTipCents = Math.max(0, Math.round((tipMxn || 0) * 100));

  const effectiveRows: SplitRowDraft[] = isSplitMode
    ? rows
    : [
        {
          id: 'single-1',
          method: singleMethod,
          amountMxn: heroRemainingMxn,
          reference: '',
        },
      ];

  const draftSplitsForPreview = effectiveRows.map((row, index) => ({
    amountCents: Math.max(0, Math.round((row.amountMxn || 0) * 100)),
    tipCents: index === 0 ? draftTipCents : 0,
  }));

  const combinedSummary = computeBookingPaymentSummary(effectiveTotalCents, [
    ...existingSplits,
    ...draftSplitsForPreview,
  ]);
  const draftChargeCents = draftSplitsForPreview.reduce((sum, s) => sum + s.amountCents, 0);

  const handleToggleSplitMode = (nextSplit: boolean) => {
    setIsSplitMode(nextSplit);
    if (nextSplit) {
      setRows([
        {
          id: 'split-1',
          method: singleMethod,
          amountMxn: heroRemainingMxn,
          reference: '',
        },
      ]);
    }
  };

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

  const handleSelectTipPreset = (preset: TipPreset) => {
    setTipPreset(preset);
    if (preset === '0') setTipMxn(0);
    else if (preset === '50') setTipMxn(50);
    else if (preset === '100') setTipMxn(100);
  };

  const handleExtraItemChange = (nextItemId: string) => {
    setExtraItemId(nextItemId);
    const nextItem =
      nextItemId !== 'none'
        ? retailItems.find((i) => i.id === nextItemId) ?? null
        : null;
    const nextExtraCents = nextItem ? nextItem.retailPriceCents : 0;
    const nextRemainingCents = selectedPackage
      ? Math.max(0, nextExtraCents)
      : Math.max(0, booking.totalPriceCents + nextExtraCents - priorPaidCents);
    const nextRemainingMxn = Number((nextRemainingCents / 100).toFixed(2));
    if (isSplitMode && rows.length === 1) {
      setRows((prev) =>
        prev.map((r, idx) => (idx === 0 ? { ...r, amountMxn: nextRemainingMxn } : r)),
      );
    }
  };

  const handleTogglePackageRedeem = (pkg: ClientPackageSummaryRow) => {
    if (redeemPackageId === pkg.id) {
      setRedeemPackageId(null);
      if (isSplitMode && rows.length === 1) {
        const restoredMxn = Number(
          (Math.max(0, effectiveTotalCents - priorPaidCents) / 100).toFixed(2),
        );
        setRows((prev) =>
          prev.map((r, idx) => (idx === 0 ? { ...r, amountMxn: restoredMxn } : r)),
        );
      }
      return;
    }
    setRedeemPackageId(pkg.id);
    if (isSplitMode && rows.length === 1) {
      const coveredRemainingMxn = Number((Math.max(0, extraTotalCents) / 100).toFixed(2));
      setRows((prev) =>
        prev.map((r, idx) => (idx === 0 ? { ...r, amountMxn: coveredRemainingMxn } : r)),
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setErrorText(null);
    try {
      const payloadSplits = effectiveRows.map((row, index) => ({
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
          ...(selectedPackage ? { redeemClientPackageId: selectedPackage.id } : {}),
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
              'Esta cita ya pasó y está bloqueada; solo la Dueña puede cobrarla.',
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
        redeemedPackageName: selectedPackage?.packageName ?? null,
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
      label="Cobrar cita"
      side="end"
      width={520}
      purpose="form"
    >
      <Layout
        header={
          <DrawerHeader
            title="Cobrar cita"
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
              <VStack gap={4} className="fx-drawer-in">
                <Banner
                  status="success"
                  role="status"
                  title="¡Cobro registrado!"
                  description={`Cobrado ${formatCurrency(
                    completedState.summary.paidCents,
                    currency,
                  )}${
                    completedState.summary.totalTipsCents > 0
                      ? ` · Propina ${formatCurrency(
                          completedState.summary.totalTipsCents,
                          currency,
                        )}`
                      : ''
                  }. La cita quedó marcada como completada.`}
                />

                {completedState.stampAwarded ? (
                  <HStack
                    className="ad-surface fx-pop"
                    data-tone="accent"
                    data-padded="true"
                    justify="between"
                    align="center"
                    gap={2}
                  >
                    <HStack gap={2} align="center">
                      <Sparkles size={15} aria-hidden="true" />
                      <Text weight="semibold">Sello sumado a su tarjeta</Text>
                    </HStack>
                    <Badge variant="success" label="+1 sello" />
                  </HStack>
                ) : null}

                {completedState.redeemedPackageName ? (
                  <HStack
                    className="ad-surface fx-pop"
                    data-tone="accent"
                    data-padded="true"
                    justify="between"
                    align="center"
                    gap={2}
                  >
                    <HStack gap={2} align="center">
                      <PackageCheck size={15} aria-hidden="true" />
                      <Text weight="semibold">
                        Sesión descontada: {completedState.redeemedPackageName}
                      </Text>
                    </HStack>
                    <Badge variant="success" label="-1 sesión" />
                  </HStack>
                ) : null}

                {completedState.redeemedReward ? (
                  <HStack
                    className="ad-surface fx-pop"
                    data-tone="subtle"
                    data-padded="true"
                    justify="between"
                    align="center"
                    gap={2}
                  >
                    <Text weight="semibold">Premio de tarjeta de sellos aplicado</Text>
                    <Badge variant="info" label="Canjeado" />
                  </HStack>
                ) : null}

                <VStack className="ad-surface" data-tone="accent" data-padded="true" gap={3}>
                  <Text weight="semibold" size="base">
                    ¿Agendamos su próximo retoque?
                  </Text>
                  <Text type="supporting" color="secondary">
                    Deja lista la cita de {booking.client.fullName} con {booking.staff.name} en 3
                    semanas sin volver a escribir sus datos.
                  </Text>
                  <Button
                    type="button"
                    label="Agendar su retoque en 3 semanas"
                    variant="primary"
                    size="md"
                    width="100%"
                    icon={<CalendarPlus size={16} />}
                    onClick={() => onScheduleRetouch(booking)}
                  />
                </VStack>
              </VStack>
            ) : (
              <form id="checkout-split-form" onSubmit={handleSubmit}>
                <VStack
                  gap={4}
                  className={submitting ? 'fx-drawer-in fx-busy' : 'fx-drawer-in'}
                  aria-busy={submitting || undefined}
                >
                  {errorText ? (
                    <Banner
                      status="error"
                      role="alert"
                      title={errorText}
                      isDismissable
                      onDismiss={() => setErrorText(null)}
                    />
                  ) : null}

                  <VStack
                    className="ad-surface"
                    data-tone={heroRemainingCents > 0 ? 'accent' : 'subtle'}
                    data-padded="true"
                    gap={1.5}
                  >
                    <Text className="lk-serif ad-kpi-val fx-tabular" hasTabularNumbers>
                      Falta cobrar: {formatCurrency(heroRemainingCents, currency)}
                    </Text>

                    <Text type="supporting" color="secondary" hasTabularNumbers>
                      {selectedPackage
                        ? `Servicio cubierto con "${selectedPackage.packageName}" (-1 sesión)`
                        : priorPaidCents > 0
                          ? `Total ${formatCurrency(
                              effectiveTotalCents,
                              currency,
                            )} − Anticipo ${formatCurrency(priorPaidCents, currency)}`
                          : `Total del servicio${
                              selectedExtraItem ? ' + producto' : ''
                            }: ${formatCurrency(effectiveTotalCents, currency)}`}
                    </Text>

                    {draftTipCents > 0 ? (
                      <Text size="sm" weight="semibold" hasTabularNumbers>
                        + Propina {formatCurrency(draftTipCents, currency)} · Total a recibir:{' '}
                        {payButtonTotalLabel}
                      </Text>
                    ) : null}

                    {existingSplits.length > 0 ? (
                      <HStack gap={1.5} wrap="wrap" paddingBlockStart={1}>
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

                    {isSplitMode && !selectedPackage ? (
                      <HStack justify="between" align="center" paddingBlockStart={1}>
                        <Text type="supporting" color="secondary">
                          Suma de métodos
                        </Text>
                        <Text
                          color="inherit"
                          className="ad-chip"
                          data-tone={combinedSummary.isFullyPaid ? 'success' : 'warning'}
                          hasTabularNumbers
                        >
                          {combinedSummary.isFullyPaid
                            ? combinedSummary.changeCents > 0
                              ? `Cambio ${formatCurrency(combinedSummary.changeCents, currency)}`
                              : 'Cuenta cubierta'
                            : `Faltan ${formatCurrency(combinedSummary.remainingCents, currency)}`}
                        </Text>
                      </HStack>
                    ) : null}
                  </VStack>

                  {clientPackages.length > 0 ? (
                    <VStack gap={2}>
                      <HStack justify="between" align="center" gap={2}>
                        <Text weight="semibold">Paquete disponible</Text>
                        <Badge
                          variant="info"
                          label={`${clientPackages.length} activo${clientPackages.length === 1 ? '' : 's'}`}
                        />
                      </HStack>
                      {clientPackages.map((pkg) => {
                        const isSelected = redeemPackageId === pkg.id;
                        const totalPips = Math.min(12, Math.max(1, pkg.totalSessions));
                        const usedPips = Math.min(
                          totalPips,
                          pkg.usedSessions + (isSelected ? 1 : 0),
                        );
                        return (
                          <VStack key={pkg.id} className="ad-pkg-card" gap={2}>
                            <HStack justify="between" align="center" wrap="wrap" gap={2}>
                              <VStack gap={0.5} className="rb-grow">
                                <Text weight="semibold" size="sm">
                                  {pkg.packageName}
                                </Text>
                                <Text type="supporting" color="secondary" hasTabularNumbers>
                                  {pkg.serviceName} · Quedan{' '}
                                  {Math.max(0, pkg.remainingSessions - (isSelected ? 1 : 0))} de{' '}
                                  {pkg.totalSessions} sesiones
                                </Text>
                              </VStack>
                              <Text
                                color="inherit"
                                className="ad-chip"
                                data-tone={isSelected ? 'success' : 'accent'}
                                hasTabularNumbers
                              >
                                {pkg.remainingSessions} disponibles
                              </Text>
                            </HStack>

                            <ul
                              className="ad-pkg-pips"
                              aria-label={`${usedPips} de ${pkg.totalSessions} sesiones usadas`}
                            >
                              {Array.from({ length: totalPips }, (_, idx) => (
                                <li
                                  key={idx}
                                  className="ad-pkg-pip"
                                  data-used={idx < usedPips ? 'true' : 'false'}
                                />
                              ))}
                            </ul>

                            <HStack justify="between" align="center" wrap="wrap" gap={2}>
                              <Text type="supporting" color="secondary">
                                {isSelected
                                  ? 'Se descontará 1 sesión al cobrar.'
                                  : 'Usa 1 sesión de su paquete en 1 toque.'}
                              </Text>
                              <Button
                                type="button"
                                size="sm"
                                variant={isSelected ? 'primary' : 'secondary'}
                                icon={<PackageCheck size={14} aria-hidden="true" />}
                                label={isSelected ? 'Sesión aplicada (-1)' : 'Canjear 1 sesión'}
                                onClick={() => handleTogglePackageRedeem(pkg)}
                              />
                            </HStack>
                          </VStack>
                        );
                      })}
                    </VStack>
                  ) : null}

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
                              onClick={() => setSingleMethod(option.value)}
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
                          icon={<Plus size={13} />}
                          onClick={handleAddSplitRow}
                        />
                      </HStack>

                      {rows.map((row, idx) => (
                        <VStack
                          key={row.id}
                          className="ad-surface"
                          data-tone="subtle"
                          data-padded="true"
                          gap={2}
                        >
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
                          <Grid columns={{ minWidth: 160, max: 2 }} gap={2}>
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
                            label="Referencia o folio (opcional)"
                            placeholder="Ej. Folio terminal o transferencia"
                            value={row.reference}
                            autoCapitalize="none"
                            hasAutoCorrect={false}
                            hasSpellCheck={false}
                            onChange={(val) => handleUpdateRow(row.id, { reference: val })}
                          />
                        </VStack>
                      ))}
                    </VStack>
                  )}

                  <VStack gap={2}>
                    <Text weight="semibold">Propina (opcional)</Text>
                    <section aria-label="Propina rápida" className="ad-tip-pills">
                      {(
                        [
                          { id: '0', label: '$0' },
                          { id: '50', label: '$50' },
                          { id: '100', label: '$100' },
                          { id: 'other', label: 'Otra' },
                        ] as const
                      ).map((pill) => (
                        <button
                          key={pill.id}
                          type="button"
                          className="ad-pill fx-press"
                          data-on={tipPreset === pill.id ? 'true' : 'false'}
                          aria-pressed={tipPreset === pill.id}
                          onClick={() => handleSelectTipPreset(pill.id)}
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
                        onChange={(val) => setTipMxn(val || 0)}
                      />
                    ) : null}

                    {tipMxn > 0 && activeStaff.length > 1 ? (
                      <Selector
                        label="Propina para"
                        size="sm"
                        value={tipStaffId || booking.staffId}
                        onChange={(val) => val && setTipStaffId(val)}
                        options={activeStaff.map((s) => ({
                          value: s.id,
                          label: s.name,
                        }))}
                      />
                    ) : null}
                  </VStack>

                  <VStack className="ad-surface" data-tone="subtle" data-padded="true" gap={2}>
                    <Switch
                      label="Dividir en varios métodos"
                      description="Úsalo si paga con dos métodos, tarjeta de regalo o quieres anotar un folio."
                      size="sm"
                      value={isSplitMode}
                      onChange={handleToggleSplitMode}
                    />
                  </VStack>

                  {loyaltySummary ? (
                    <VStack
                      className="ad-surface"
                      data-tone={loyaltySummary.isRewardReady ? 'accent' : 'subtle'}
                      data-padded="true"
                      gap={2}
                    >
                      <HStack justify="between" align="center" wrap="wrap" gap={2}>
                        <Text weight="semibold">{loyaltySummary.programName}</Text>
                        <Badge
                          variant={loyaltySummary.isRewardReady ? 'success' : 'info'}
                          label={`${loyaltySummary.currentStamps} / ${loyaltySummary.stampsRequired} sellos`}
                        />
                      </HStack>
                      {loyaltySummary.isRewardReady ? (
                        <Switch
                          label="Aplicar premio de sellos"
                          description={`Canjea ${loyaltySummary.stampsRequired} sellos: ${loyaltySummary.rewardLabel}`}
                          value={redeemLoyaltyReward}
                          onChange={setRedeemLoyaltyReward}
                        />
                      ) : (
                        <Text type="supporting" color="secondary">
                          {selectedPackage
                            ? `Paquete "${selectedPackage.packageName}" cubre el servicio (-1 sesión).`
                            : 'Al cobrar se suma automáticamente +1 sello a su tarjeta.'}
                        </Text>
                      )}
                    </VStack>
                  ) : null}

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
                            <Text
                              color="inherit"
                              className="ad-chip"
                              data-tone="accent"
                              hasTabularNumbers
                            >
                              +{formatCurrency(extraTotalCents, currency)}
                            </Text>
                          ) : null}
                        </HStack>
                      }
                    >
                      <VStack paddingBlockStart={2} gap={2}>
                        <Grid
                          columns={selectedExtraItem ? { minWidth: 160, max: 2 } : 1}
                          gap={2}
                        >
                          <Selector
                            label="Producto de tienda"
                            value={extraItemId}
                            onChange={(val) => val && handleExtraItemChange(val)}
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
                              max={50}
                              onChange={(val) => setExtraQuantity(val || 1)}
                            />
                          ) : null}
                        </Grid>
                      </VStack>
                    </Collapsible>
                  ) : null}

                  <Divider />

                  <HStack justify="between" align="center" wrap="wrap" gap={2}>
                    <Text type="supporting" color="secondary">
                      ¿Ya quiere apartar su retoque antes de cobrar?
                    </Text>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      icon={<CalendarPlus size={14} aria-hidden="true" />}
                      label="Agendar retoque en 3 semanas"
                      onClick={() => onScheduleRetouch(booking)}
                    />
                  </HStack>
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
                    isDisabled={submitting}
                    onClick={onClose}
                  />
                  <Button
                    type="submit"
                    form="checkout-split-form"
                    label={
                      submitting
                        ? 'Registrando cobro...'
                        : `Cobrar ${payButtonTotalLabel}`
                    }
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
