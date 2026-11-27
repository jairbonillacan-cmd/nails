'use client';

import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Banner } from '@astryxdesign/core/Banner';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { Check, ClipboardCheck, Scale } from 'lucide-react';
import { formatCurrency, formatDateKeyDisplay } from '@/lib/format';
import { useCopyToClipboard } from '@/lib/hooks/useCopyToClipboard';
import type { CajaConfig, CashRegisterEntry } from '@/lib/types';
import type { FormSubmitResult } from '@/lib/forms/form-submit';
import { StatusTag } from '@/components/ui';
import type { RecordCajaEntryInput } from './cajaActions';
import {
  buildCashAdjustmentDraft,
  computeCashDrawer,
  computeCashReconciliation,
  formatCashCloseWhatsAppSummary,
  type CajaPeriodSummary,
} from './cajaMetrics';
import type { CommissionStaffRow } from './cajaTypes';

interface CashCloseDialogProps {
  onOpenChange: (open: boolean) => void;
  salonName: string;
  cashEntries: readonly CashRegisterEntry[];
  todayKey: string;
  tz: string;
  currency: 'MXN' | 'USD';
  config: CajaConfig;
  todaySummary: CajaPeriodSummary;
  todayStaffRows: readonly CommissionStaffRow[];
  uncollectedCount: number;
  uncollectedTotalCents: number;
  pendingDepositsCount: number;
  pendingDepositsTotalCents: number;
  canRecordAdjustment: boolean;
  onRecordCashEntry: (input: RecordCajaEntryInput) => Promise<FormSubmitResult>;
}

export function CashCloseDialog({
  onOpenChange,
  salonName,
  cashEntries,
  todayKey,
  tz,
  currency,
  config,
  todaySummary,
  todayStaffRows,
  uncollectedCount,
  uncollectedTotalCents,
  pendingDepositsCount,
  pendingDepositsTotalCents,
  canRecordAdjustment,
  onRecordCashEntry,
}: CashCloseDialogProps) {
  const [openingFloatMxn, setOpeningFloatMxn] = useState<number>(
    Number((config.openingFloatCents / 100).toFixed(2)),
  );
  const [countedMxn, setCountedMxn] = useState<number>(0);
  const [note, setNote] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [adjustment, setAdjustment] = useState<
    { status: 'idle' } | { status: 'saved'; message: string } | { status: 'error'; message: string }
  >({ status: 'idle' });
  const clipboard = useCopyToClipboard(2600);

  const openingFloatCents = Math.max(0, Math.round((openingFloatMxn || 0) * 100));
  const drawer = useMemo(
    () => computeCashDrawer({ cashEntries, todayKey, tz, openingFloatCents }),
    [cashEntries, todayKey, tz, openingFloatCents],
  );
  const reconciliation = computeCashReconciliation(drawer.expectedCents, countedMxn);
  const adjustmentDraft = buildCashAdjustmentDraft(reconciliation, note, todayKey);
  const money = (cents: number) => formatCurrency(cents, currency);

  const handleClose = (open: boolean) => {
    if (!open && isRecording) return;
    onOpenChange(open);
  };

  const handleCopy = () => {
    const text = formatCashCloseWhatsAppSummary({
      salonName,
      todayKey,
      currency,
      todaySummary,
      drawer,
      expectedCashCents: drawer.expectedCents,
      countedMxn,
      closeNote: note,
      prefs: config.closeSummary,
      staffRows: todayStaffRows,
      uncollectedCount,
      uncollectedTotalCents,
      pendingDepositsCount,
      pendingDepositsTotalCents,
    });
    void clipboard.copy(text, 'Resumen del corte copiado para WhatsApp.');
  };

  const handleRecordAdjustment = async () => {
    if (!adjustmentDraft || isRecording) return;
    setIsRecording(true);
    setAdjustment({ status: 'idle' });
    try {
      const result = await onRecordCashEntry({
        entryType: adjustmentDraft.entryType,
        description: adjustmentDraft.description,
        amountMxn: adjustmentDraft.amountMxn,
        method: 'cash',
        staffId: null,
      });
      setAdjustment(
        result.ok
          ? {
              status: 'saved',
              message: `Ajuste de ${money(Math.abs(reconciliation.diffCents))} registrado. Ya cuadra con lo contado.`,
            }
          : { status: 'error', message: result.error },
      );
    } finally {
      setIsRecording(false);
    }
  };

  const diffLabel =
    reconciliation.status === 'balanced'
      ? `Cuadra (${money(0)})`
      : reconciliation.status === 'over'
        ? `Sobrante +${money(reconciliation.diffCents)}`
        : `Faltante −${money(Math.abs(reconciliation.diffCents))}`;

  return (
    <Dialog
      isOpen
      onOpenChange={handleClose}
      width="min(30rem, 96vw)"
      maxHeight="min(90dvh, calc(100dvh - 2rem))"
      padding={5}
    >
      <Layout
        header={
          <DialogHeader
            title="Corte de caja"
            subtitle={formatDateKeyDisplay(todayKey, 'long')}
            hasDivider
            onOpenChange={handleClose}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4} aria-busy={isRecording || undefined}>
              {adjustment.status === 'error' ? (
                <Banner
                  status="error"
                  role="alert"
                  title={adjustment.message}
                  isDismissable
                  onDismiss={() => setAdjustment({ status: 'idle' })}
                />
              ) : null}
              {adjustment.status === 'saved' ? (
                <Banner status="success" role="status" title={adjustment.message} />
              ) : null}

              <VStack className="ad-subpanel ad-caja-reconcile" gap={0}>
                <HStack justify="between" align="center" className="ad-kv-row">
                  <Text type="supporting" color="secondary">
                    Fondo inicial
                  </Text>
                  <Text weight="medium" hasTabularNumbers>
                    {money(drawer.openingFloatCents)}
                  </Text>
                </HStack>
                <HStack justify="between" align="center" className="ad-kv-row">
                  <Text type="supporting" color="secondary">
                    Cobros en efectivo
                  </Text>
                  <Text weight="medium" hasTabularNumbers>
                    +{money(drawer.cashSalesCents)}
                  </Text>
                </HStack>
                {drawer.cashTipsCents > 0 ? (
                  <HStack justify="between" align="center" className="ad-kv-row">
                    <Text type="supporting" color="secondary">
                      Propinas en efectivo
                    </Text>
                    <Text weight="medium" hasTabularNumbers>
                      +{money(drawer.cashTipsCents)}
                    </Text>
                  </HStack>
                ) : null}
                <HStack justify="between" align="center" className="ad-kv-row">
                  <Text type="supporting" color="secondary">
                    Gastos en efectivo
                  </Text>
                  <Text weight="medium" hasTabularNumbers>
                    −{money(drawer.cashExpensesCents)}
                  </Text>
                </HStack>
                <HStack justify="between" align="center" className="ad-kv-row">
                  <Text weight="semibold">Efectivo esperado</Text>
                  <Text weight="bold" hasTabularNumbers>
                    {money(drawer.expectedCents)}
                  </Text>
                </HStack>
              </VStack>

              <HStack gap={3} wrap="wrap" align="end">
                <NumberInput
                  label={`Fondo inicial (${currency})`}
                  description="Lo que había en el cajón al abrir"
                  value={openingFloatMxn}
                  min={0}
                  onChange={setOpeningFloatMxn}
                  containerClassName="ad-caja-close-field"
                />
                <NumberInput
                  label={`Efectivo contado (${currency})`}
                  description="Lo que hay ahora en el cajón"
                  value={countedMxn}
                  min={0}
                  onChange={(next) => {
                    setCountedMxn(next);
                    setAdjustment({ status: 'idle' });
                  }}
                  containerClassName="ad-caja-close-field"
                />
              </HStack>

              <HStack justify="between" align="center" gap={2} wrap="wrap">
                <StatusTag tone={reconciliation.tone} hasTabularNumbers showDot label={diffLabel} />
                {reconciliation.diffCents !== 0 ? (
                  <Button
                    type="button"
                    label="Igualar al esperado"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setCountedMxn(Number((drawer.expectedCents / 100).toFixed(2)));
                      setAdjustment({ status: 'idle' });
                    }}
                  />
                ) : null}
              </HStack>

              <TextInput
                label="Nota del corte"
                placeholder="Ej. Se pagó garrafón con efectivo del cajón"
                value={note}
                onChange={setNote}
                isOptional
              />

              {adjustmentDraft && canRecordAdjustment && adjustment.status !== 'saved' ? (
                <VStack className="ad-subpanel" gap={2}>
                  <Text type="supporting" color="secondary">
                    {reconciliation.status === 'short'
                      ? `Registra el faltante como gasto en efectivo para que el historial cuadre con el cajón.`
                      : `Registra el sobrante como ingreso en efectivo para que el historial cuadre con el cajón.`}
                  </Text>
                  <Button
                    type="button"
                    label={`Registrar ajuste de ${money(Math.abs(reconciliation.diffCents))}`}
                    variant="secondary"
                    size="sm"
                    className="ad-caja-touch-btn"
                    icon={<Scale size={14} aria-hidden="true" />}
                    isLoading={isRecording}
                    isDisabled={isRecording}
                    onClick={() => void handleRecordAdjustment()}
                  />
                </VStack>
              ) : null}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <VStack gap={2}>
              <HStack gap={2} justify="end" wrap="wrap">
                <Button
                  type="button"
                  label="Cerrar"
                  variant="secondary"
                  isDisabled={isRecording}
                  onClick={() => handleClose(false)}
                />
                <Button
                  type="button"
                  label={clipboard.copied ? 'Resumen copiado' : 'Copiar resumen para WhatsApp'}
                  variant="primary"
                  icon={
                    clipboard.copied ? (
                      <Check size={15} aria-hidden="true" />
                    ) : (
                      <ClipboardCheck size={15} aria-hidden="true" />
                    )
                  }
                  onClick={handleCopy}
                />
              </HStack>
              {clipboard.feedback ? (
                <Text type="supporting" color="secondary" role="status">
                  {clipboard.feedback}
                </Text>
              ) : null}
            </VStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
