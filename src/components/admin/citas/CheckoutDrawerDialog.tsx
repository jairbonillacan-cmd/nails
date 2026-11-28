'use client';

import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { Drawer, DrawerHeader } from '@astryxdesign/core/Drawer';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { AlertTriangle, CalendarPlus } from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import { StatusTag, SurfaceCard } from '@/components/ui';
import { computeBookingBalance } from '@/lib/booking/balance';
import { normalizeTouchUpDays } from '@/lib/booking/recurrence';
import { useClientBookingContext } from '@/lib/hooks/useClientBookingContext';
import type {
  BookingWithRelations,
  CashRegisterEntry,
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
  existingCashEntries?: CashRegisterEntry[];
  inventory: InventoryItem[];
  staff: StaffMember[];
  loyaltyProgram: LoyaltyProgram | null;
  loyaltyStamps: LoyaltyStamp[];
  currency: 'MXN' | 'USD';
  touchUpDays?: number;
  onClose: () => void;
  onCompleted: () => Promise<void>;
  onScheduleRetouch: (booking: BookingWithRelations) => void;
}

export function CheckoutDrawerDialog({
  booking,
  existingSplits,
  existingCashEntries = [],
  inventory,
  staff,
  loyaltyProgram,
  loyaltyStamps,
  currency,
  touchUpDays: touchUpDaysProp,
  onClose,
  onCompleted,
  onScheduleRetouch,
}: CheckoutDrawerDialogProps) {
  const { data: adminData } = useAdminData();
  const touchUpDays = normalizeTouchUpDays(
    touchUpDaysProp ?? adminData?.settings.landingContent?.touchUpDays,
  );
  const retailItems = useMemo(
    () => inventory.filter((i) => i.isActive && i.retailPriceCents > 0 && i.stockQuantity > 0),
    [inventory],
  );
  const activeStaff = useMemo(
    () => staff.filter((s) => s.isActive).toSorted((a, b) => a.displayOrder - b.displayOrder),
    [staff],
  );
  const initialSummary = useMemo(
    () => (booking ? computeBookingBalance(booking, existingSplits, existingCashEntries) : null),
    [booking, existingSplits, existingCashEntries],
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
  const [redeemPackageId, setRedeemPackageId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  const [completedState, setCompletedState] = useState<CompletedCheckoutState | null>(null);

  const handlePackagesCleared = useCallback(() => {
    setRedeemPackageId(null);
  }, []);

  const {
    fullClientProfile,
    loyaltySummary,
    clientPackages,
    parsedClientNotes,
    techBadges,
    safetyAlerts,
  } = useClientBookingContext({
    booking,
    clients: adminData?.clients ?? [],
    loyaltyProgram,
    loyaltyStamps,
    syncScope: 'checkout',
    onPackagesCleared: handlePackagesCleared,
  });

  if (!booking) {
    return null;
  }

  const selectedExtraItem =
    extraItemId !== 'none' ? retailItems.find((i) => i.id === extraItemId) ?? null : null;
  const selectedPackage = redeemPackageId
    ? clientPackages.find((pkg) => pkg.id === redeemPackageId) ?? null
    : null;
  const priorPaidCents = initialSummary?.paidCents ?? 0;
  const priorTipsCents = initialSummary?.totalTipsCents ?? 0;
  const depositPaidCents = initialSummary?.depositPaidCents ?? 0;
  const noShowCount = fullClientProfile?.noShowCount ?? booking.client.noShowCount;
  const noShowThreshold = adminData?.settings.noShowDepositThreshold ?? 2;
  const neutralTechBadges = techBadges.filter((badge) => badge.tone === 'neutral');
  const hasSafetyAlert = safetyAlerts.length > 0 || noShowCount > 0;
  const hasClientSafetyOrNotes = Boolean(
    hasSafetyAlert ||
      neutralTechBadges.length > 0 ||
      parsedClientNotes.freeNotes ||
      booking.clientNotes ||
      booking.internalNotes,
  );

  const draft = computeCheckoutDraftMetrics({
    bookingTotalCents: booking.totalPriceCents,
    priorPaidCents,
    priorTipsCents,
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
    setRefreshWarning(null);
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
      try {
        await onCompleted();
      } catch {
        setRefreshWarning(
          'El cobro se guardó, pero no pudimos actualizar la agenda al instante. Recarga si no ves el cambio.',
        );
      }
    } catch {
      setErrorText('No se pudo registrar el cobro. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDrawerOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  return (
    <Drawer isOpen onOpenChange={handleDrawerOpenChange} label="Cobrar cita" side="end" width={520} purpose="form">
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
              <VStack gap={3}>
                {refreshWarning ? (
                  <Banner
                    status="warning"
                    role="status"
                    title={refreshWarning}
                    isDismissable
                    onDismiss={() => setRefreshWarning(null)}
                  />
                ) : null}
                <CheckoutReceiptView
                  booking={booking}
                  completedState={completedState}
                  salonSettings={{
                    name: adminData?.settings.name ?? 'LAIKONA NAILS',
                    currency,
                    timezone: adminData?.settings.timezone ?? 'America/Mexico_City',
                  }}
                  stampsCount={
                    loyaltySummary
                      ? loyaltySummary.currentStamps +
                        (completedState.stampAwarded &&
                        !loyaltyStamps.some((st) => st.id === completedState.stampAwarded?.id)
                          ? 1
                          : 0)
                      : null
                  }
                  stampsRequired={loyaltySummary?.stampsRequired ?? loyaltyProgram?.stampsRequired ?? null}
                  touchUpDays={touchUpDays}
                  onScheduleRetouch={onScheduleRetouch}
                />
              </VStack>
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

                  {hasClientSafetyOrNotes ? (
                    <SurfaceCard
                      tone={hasSafetyAlert ? 'warning' : 'subtle'}
                      padded
                      className="ad-pop-context"
                    >
                      <VStack gap={2}>
                        <HStack justify="between" align="center" gap={2} wrap="wrap">
                          <HStack gap={1.5} align="center">
                            {hasSafetyAlert ? (
                              <AlertTriangle size={14} aria-hidden="true" />
                            ) : null}
                            <Text type="supporting" weight="semibold" color="secondary">
                              Alertas y notas de la clienta
                            </Text>
                          </HStack>
                          {noShowCount > 0 ? (
                            <StatusTag
                              size="sm"
                              tone={noShowCount >= noShowThreshold ? 'danger' : 'warning'}
                              label={`${noShowCount} ${
                                noShowCount === 1 ? 'inasistencia' : 'inasistencias'
                              }`}
                              hasTabularNumbers
                            />
                          ) : null}
                        </HStack>

                        {safetyAlerts.length > 0 || neutralTechBadges.length > 0 ? (
                          <HStack gap={1.5} wrap="wrap" className="ad-pop-tech-chips">
                            {safetyAlerts.map((alert) => (
                              <StatusTag
                                key={alert}
                                size="sm"
                                tone="danger"
                                label={alert}
                              />
                            ))}
                            {neutralTechBadges.map((badge) => (
                              <StatusTag
                                key={badge.label}
                                size="sm"
                                tone="neutral"
                                label={badge.label}
                              />
                            ))}
                          </HStack>
                        ) : null}

                        {parsedClientNotes.freeNotes ? (
                          <Text type="supporting" color="secondary">
                            Nota de ficha: {parsedClientNotes.freeNotes}
                          </Text>
                        ) : null}
                        {booking.clientNotes ? (
                          <Text type="supporting" color="secondary">
                            Nota de la clienta: {booking.clientNotes}
                          </Text>
                        ) : null}
                        {booking.internalNotes ? (
                          <Text type="supporting" color="secondary">
                            Nota interna: {booking.internalNotes}
                          </Text>
                        ) : null}
                      </VStack>
                    </SurfaceCard>
                  ) : null}

                  <CheckoutBalanceCard
                    heroRemainingCents={draft.heroRemainingCents}
                    effectiveTotalCents={draft.effectiveTotalCents}
                    priorPaidCents={priorPaidCents}
                    depositPaidCents={depositPaidCents}
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
                      label={`Agendar siguiente retoque (+${touchUpDays} días)`}
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
