'use client';

import type React from 'react';
import { useMemo, useState } from 'react';
import { Drawer, DrawerHeader } from '@astryxdesign/core/Drawer';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { CalendarPlus } from 'lucide-react';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import { computeClientLoyaltySummary } from '@/lib/loyalty/stamps';
import { computeBookingPaymentSummary } from '@/lib/payments/splits';
import type {
  BookingWithRelations,
  InventoryItem,
  LoyaltyProgram,
  LoyaltyStamp,
  PaymentSplit,
  StaffMember,
} from '@/lib/types';
import { formatCurrency } from '@/lib/format';
import {
  buildNextSplitRow,
  computeCheckoutDraftMetrics,
  fetchActiveClientPackages,
  submitCheckoutSplitRequest,
} from './checkoutApi';
import {
  CheckoutLoyaltySection,
  CheckoutPackagesSection,
  type ClientPackageSummaryRow,
} from './CheckoutLoyaltySection';
import {
  CheckoutBalanceCard,
  CheckoutReceiptView,
  type CompletedCheckoutState,
} from './CheckoutReceiptView';
import {
  PaymentSplitsEditor,
  type SplitRowDraft,
  type TipPreset,
} from './PaymentSplitsEditor';

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
    () => inventory.filter((i) => i.isActive && i.retailPriceCents > 0 && i.stockQuantity > 0),
    [inventory],
  );
  const activeStaff = useMemo(
    () => staff.filter((s) => s.isActive).toSorted((a, b) => a.displayOrder - b.displayOrder),
    [staff],
  );
  const initialSummary = useMemo(
    () => (booking ? computeBookingPaymentSummary(booking.totalPriceCents, existingSplits) : null),
    [booking, existingSplits],
  );
  const initialRemainingMxn = initialSummary
    ? Number((initialSummary.remainingCents / 100).toFixed(2))
    : 0;

  const [isSplitMode, setIsSplitMode] = useState(false);
  const [singleMethod, setSingleMethod] = useState<'cash' | 'transfer' | 'card'>('cash');
  const [rows, setRows] = useState<SplitRowDraft[]>(() => [
    { id: 'split-1', method: 'cash', amountMxn: initialRemainingMxn, reference: '' },
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
      const active = await fetchActiveClientPackages(booking.clientId, booking.serviceId, signal);
      if (!signal.aborted) setClientPackages(active);
    } catch {
      if (!signal.aborted) setClientPackages([]);
    }
  });

  if (!booking) {
    return (
      <Drawer isOpen={false} onOpenChange={() => onClose()} label="Cobrar cita" side="end" width={520}>
        <VStack gap={2} />
      </Drawer>
    );
  }

  const selectedExtraItem =
    extraItemId !== 'none' ? retailItems.find((i) => i.id === extraItemId) ?? null : null;
  const selectedPackage = redeemPackageId
    ? clientPackages.find((pkg) => pkg.id === redeemPackageId) ?? null
    : null;
  const priorPaidCents = initialSummary?.paidCents ?? 0;
  const loyaltySummary = loyaltyProgram
    ? computeClientLoyaltySummary(loyaltyProgram, loyaltyStamps, booking.clientId)
    : null;

  const draft = computeCheckoutDraftMetrics({
    bookingTotalCents: booking.totalPriceCents,
    priorPaidCents,
    existingSplits,
    selectedExtraItem,
    extraQuantity,
    selectedPackage,
    isSplitMode,
    singleMethod,
    rows,
    tipMxn,
  });
  const payButtonTotalLabel = formatCurrency(draft.draftChargeCents + draft.draftTipCents, currency);

  const syncSingleSplitAmount = (nextMxn: number) => {
    if (isSplitMode && rows.length === 1) {
      setRows((prev) => prev.map((r, idx) => (idx === 0 ? { ...r, amountMxn: nextMxn } : r)));
    }
  };

  const handleToggleSplitMode = (nextSplit: boolean) => {
    setIsSplitMode(nextSplit);
    if (nextSplit) {
      setRows([{ id: 'split-1', method: singleMethod, amountMxn: draft.heroRemainingMxn, reference: '' }]);
    }
  };

  const handleSelectTipPreset = (preset: TipPreset) => {
    setTipPreset(preset);
    if (preset === '0') setTipMxn(0);
    else if (preset === '50') setTipMxn(50);
    else if (preset === '100') setTipMxn(100);
  };

  const handleExtraItemChange = (nextItemId: string) => {
    setExtraItemId(nextItemId);
    setExtraQuantity(1);
    const nextItem = nextItemId !== 'none' ? retailItems.find((i) => i.id === nextItemId) ?? null : null;
    const nextExtraCents = nextItem ? nextItem.retailPriceCents : 0;
    const nextRemainingCents = selectedPackage
      ? Math.max(0, nextExtraCents)
      : Math.max(0, booking.totalPriceCents + nextExtraCents - priorPaidCents);
    syncSingleSplitAmount(Number((nextRemainingCents / 100).toFixed(2)));
  };

  const handleExtraQuantityChange = (nextQty: number) => {
    const maxQty = selectedExtraItem ? Math.max(1, selectedExtraItem.stockQuantity) : 50;
    const clamped = Math.max(1, Math.min(maxQty, Math.floor(nextQty || 1)));
    setExtraQuantity(clamped);
    const nextExtraCents = selectedExtraItem ? selectedExtraItem.retailPriceCents * clamped : 0;
    const nextRemainingCents = selectedPackage
      ? Math.max(0, nextExtraCents)
      : Math.max(0, booking.totalPriceCents + nextExtraCents - priorPaidCents);
    syncSingleSplitAmount(Number((nextRemainingCents / 100).toFixed(2)));
  };

  const handleTogglePackageRedeem = (pkg: ClientPackageSummaryRow) => {
    const clearing = redeemPackageId === pkg.id;
    setRedeemPackageId(clearing ? null : pkg.id);
    const nextCents = clearing
      ? Math.max(0, draft.effectiveTotalCents - priorPaidCents)
      : Math.max(0, draft.extraTotalCents);
    syncSingleSplitAmount(Number((nextCents / 100).toFixed(2)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setErrorText(null);
    try {
      const result = await submitCheckoutSplitRequest({
        bookingId: booking.id,
        bookingStaffId: booking.staffId,
        effectiveRows: draft.effectiveRows,
        draftTipCents: draft.draftTipCents,
        tipStaffId,
        extraItem: selectedExtraItem ? { inventoryItemId: selectedExtraItem.id, quantity: draft.extraQty } : null,
        redeemLoyaltyReward: Boolean(loyaltySummary?.isRewardReady && redeemLoyaltyReward),
        selectedPackage,
        fallbackSummary: draft.combinedSummary,
      });
      if (!result.ok) {
        setErrorText(result.error);
        return;
      }
      setCompletedState(result.state);
      await onCompleted();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDrawerOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  return (
    <Drawer isOpen={Boolean(booking)} onOpenChange={handleDrawerOpenChange} label="Cobrar cita" side="end" width={520} purpose="form">
      <Layout
        header={
          <DrawerHeader
            title="Cobrar cita"
            subtitle={`${booking.client.fullName} · ${booking.service.name} (${booking.bookingCode})`}
            hasDivider
            onOpenChange={handleDrawerOpenChange}
          />
        }
        content={
          <LayoutContent>
            {completedState ? (
              <CheckoutReceiptView
                booking={booking}
                completedState={completedState}
                currency={currency}
                onScheduleRetouch={onScheduleRetouch}
              />
            ) : (
              <form id="checkout-split-form" onSubmit={handleSubmit}>
                <VStack
                  gap={4}
                  className={submitting ? 'fx-drawer-in fx-busy' : 'fx-drawer-in'}
                  aria-busy={submitting || undefined}
                >
                  {errorText ? (
                    <Banner status="error" role="alert" title={errorText} isDismissable onDismiss={() => setErrorText(null)} />
                  ) : null}

                  <CheckoutBalanceCard
                    heroRemainingCents={draft.heroRemainingCents}
                    effectiveTotalCents={draft.effectiveTotalCents}
                    priorPaidCents={priorPaidCents}
                    draftTipCents={draft.draftTipCents}
                    payButtonTotalLabel={payButtonTotalLabel}
                    selectedPackageName={selectedPackage?.packageName ?? null}
                    hasExtraItem={Boolean(selectedExtraItem)}
                    existingSplits={existingSplits}
                    isSplitMode={isSplitMode}
                    combinedSummary={draft.combinedSummary}
                    currency={currency}
                  />

                  <CheckoutPackagesSection
                    clientPackages={clientPackages}
                    redeemPackageId={redeemPackageId}
                    onTogglePackageRedeem={handleTogglePackageRedeem}
                  />

                  <PaymentSplitsEditor
                    currency={currency}
                    submitting={submitting}
                    isSplitMode={isSplitMode}
                    singleMethod={singleMethod}
                    rows={rows}
                    tipPreset={tipPreset}
                    tipMxn={tipMxn}
                    tipStaffId={tipStaffId}
                    bookingStaffId={booking.staffId}
                    activeStaff={activeStaff}
                    retailItems={retailItems}
                    extraItemId={extraItemId}
                    extraQuantity={extraQuantity}
                    selectedExtraItem={selectedExtraItem}
                    extraTotalCents={draft.extraTotalCents}
                    onChangeSingleMethod={setSingleMethod}
                    onToggleSplitMode={handleToggleSplitMode}
                    onAddSplitRow={() =>
                      setRows((prev) => [...prev, buildNextSplitRow(prev, draft.combinedSummary.remainingCents)])
                    }
                    onUpdateRow={(id, patch) =>
                      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
                    }
                    onRemoveRow={(id) =>
                      setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev))
                    }
                    onSelectTipPreset={handleSelectTipPreset}
                    onChangeTipMxn={setTipMxn}
                    onChangeTipStaffId={setTipStaffId}
                    onChangeExtraItemId={handleExtraItemChange}
                    onChangeExtraQuantity={handleExtraQuantityChange}
                  />

                  <CheckoutLoyaltySection
                    loyaltySummary={loyaltySummary}
                    selectedPackageName={selectedPackage?.packageName ?? null}
                    redeemLoyaltyReward={redeemLoyaltyReward}
                    onChangeRedeemLoyalty={setRedeemLoyaltyReward}
                  />

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
                <Button type="button" label="Listo, cerrar" variant="secondary" onClick={onClose} />
              ) : (
                <>
                  <Button type="button" label="Cancelar" variant="secondary" isDisabled={submitting} onClick={onClose} />
                  <Button
                    type="submit"
                    form="checkout-split-form"
                    label={submitting ? 'Registrando cobro…' : `Cobrar ${payButtonTotalLabel}`}
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
