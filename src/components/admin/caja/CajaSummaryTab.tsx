'use client';

import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Link } from '@astryxdesign/core/Link';
import { AlertTriangle, CheckCircle2, CreditCard, Wallet } from 'lucide-react';
import {
  formatCurrency,
  formatDateShortInTimezone,
  formatPhoneDisplay,
  formatTimeInTimezone,
  getDateKeyInTimezone,
} from '@/lib/format';
import type { CashRegisterEntry, PaymentMethod } from '@/lib/types';
import type { FormSubmitResult } from '@/lib/forms/form-submit';
import { ActionRow, StatusTag, SurfaceCard } from '@/components/ui';
import {
  formatInstagramDisplay,
  formatInstagramUrl,
  type SplitDetailRow,
  type UncollectedBookingRow,
} from './cajaTypes';
import { CashMovementForm, type QuickEntryType } from './CashMovementForm';
import { CajaMovementsSection } from './CajaMovementsSection';

interface CajaSummaryTabProps {
  cashEntries: readonly CashRegisterEntry[];
  uncollectedBookings: readonly UncollectedBookingRow[];
  uncollectedTotalCents: number;
  pendingDepositsCount: number;
  pendingDepositsTotalCents: number;
  splitDetails: readonly SplitDetailRow[];
  todayKey: string;
  tz: string;
  currency: 'MXN' | 'USD';
  canRecordCash: boolean;
  highlightUncollected: boolean;
  onOpenDeposits: () => void;
  onRecordCashEntry: (input: {
    entryType: QuickEntryType;
    description: string;
    amountMxn: number;
    method: PaymentMethod;
  }) => Promise<FormSubmitResult>;
}

export function CajaSummaryTab({
  cashEntries,
  uncollectedBookings,
  uncollectedTotalCents,
  pendingDepositsCount,
  pendingDepositsTotalCents,
  splitDetails,
  todayKey,
  tz,
  currency,
  canRecordCash,
  highlightUncollected,
  onOpenDeposits,
  onRecordCashEntry,
}: CajaSummaryTabProps) {
  const [countedCashMxn, setCountedCashMxn] = useState<number>(0);

  const todaySummary = useMemo(() => {
    const todayEntries = cashEntries.filter(
      (entry) => getDateKeyInTimezone(new Date(entry.occurredAt), tz) === todayKey,
    );
    const hasToday = todayEntries.length > 0;
    const source = hasToday ? todayEntries : cashEntries;

    let cashCents = 0;
    let cardCents = 0;
    let transferCents = 0;
    let expensesCents = 0;

    for (const entry of source) {
      if (entry.entryType === 'expense') {
        expensesCents += Math.abs(entry.amountCents);
      } else if (entry.paymentMethod === 'cash') {
        cashCents += entry.amountCents;
      } else if (entry.paymentMethod === 'card') {
        cardCents += entry.amountCents;
      } else {
        transferCents += entry.amountCents;
      }
    }

    return { hasToday, cashCents, cardCents, transferCents, expensesCents };
  }, [cashEntries, todayKey, tz]);

  const cashOnlyExpectedCents = useMemo(
    () =>
      cashEntries
        .filter((e) => e.paymentMethod === 'cash')
        .reduce(
          (sum, e) =>
            sum +
            (e.entryType === 'expense'
              ? -Math.abs(e.amountCents)
              : e.amountCents + e.tipCents),
          0,
        ),
    [cashEntries],
  );

  const cashDiffCents = Math.round(countedCashMxn * 100) - cashOnlyExpectedCents;

  return (
    <VStack gap={4} className="fx-step-in">
      {uncollectedBookings.length > 0 ? (
        <SurfaceCard
          id="citas-sin-cobrar"
          title="Citas sin cobrar"
          count={uncollectedBookings.length}
          subtitle={`Citas terminadas o pasadas con saldo pendiente: ${formatCurrency(uncollectedTotalCents, currency)}`}
          tone={highlightUncollected ? 'accent' : 'warning'}
          icon={
            <VStack
              className="ad-task-icon"
              data-tone={highlightUncollected ? 'accent' : 'warning'}
              align="center"
              justify="center"
              aria-hidden="true"
            >
              <AlertTriangle size={17} />
            </VStack>
          }
        >
          <VStack className="ad-row-list" gap={0}>
            {uncollectedBookings.map((row) => (
              <ActionRow
                key={row.bookingId}
                title={
                  <HStack gap={2} align="center" wrap="wrap">
                    <Text weight="semibold">{row.clientName}</Text>
                    <StatusTag
                      tone="warning"
                      label={
                        row.status === 'completed'
                          ? 'Terminada sin cobro'
                          : 'Pasada sin cerrar'
                      }
                    />
                  </HStack>
                }
                subtitle={`${row.serviceName} · ${formatDateShortInTimezone(row.startAt, tz)} ${formatTimeInTimezone(row.startAt, tz, true)} con ${row.staffName}`}
                meta={
                  <HStack gap={2} wrap="wrap" align="center">
                    <Text type="supporting" color="secondary" hasTabularNumbers>
                      {formatPhoneDisplay(row.clientPhone)}
                    </Text>
                    {row.clientInstagram ? (
                      <Link
                        href={formatInstagramUrl(row.clientInstagram)}
                        isExternalLink
                        type="supporting"
                      >
                        {formatInstagramDisplay(row.clientInstagram)}
                      </Link>
                    ) : null}
                  </HStack>
                }
                actions={
                  <HStack gap={3} align="center" wrap="wrap">
                    <VStack gap={0} align="end">
                      <Text weight="bold" hasTabularNumbers>
                        Faltan {formatCurrency(row.remainingCents, currency)}
                      </Text>
                      <Text type="supporting" color="secondary" hasTabularNumbers>
                        Total {formatCurrency(row.totalPriceCents, currency)} · Pagado{' '}
                        {formatCurrency(row.paidCents, currency)}
                      </Text>
                    </VStack>
                    <Button
                      label="Cobrar"
                      variant="primary"
                      size="sm"
                      icon={<CreditCard size={14} aria-hidden="true" />}
                      href={`/admin/citas?collect=${encodeURIComponent(row.bookingId)}`}
                    />
                  </HStack>
                }
              />
            ))}
          </VStack>
        </SurfaceCard>
      ) : highlightUncollected ? (
        <SurfaceCard id="citas-sin-cobrar" tone="subtle" padded>
          <HStack align="center" gap={3}>
            <VStack
              className="ad-done-circle"
              align="center"
              justify="center"
              aria-hidden="true"
            >
              <CheckCircle2 size={18} />
            </VStack>
            <VStack gap={0.5} className="rb-grow">
              <Text weight="semibold">Todas las citas están cobradas</Text>
              <Text type="supporting" color="secondary">
                No tienes ninguna cita terminada con saldo pendiente por cobrar.
              </Text>
            </VStack>
          </HStack>
        </SurfaceCard>
      ) : null}

      {pendingDepositsCount > 0 ? (
        <SurfaceCard tone="subtle" padded>
          <HStack justify="between" align="center" wrap="wrap" gap={3}>
            <HStack gap={2} align="center" className="rb-grow">
              <VStack
                className="ad-task-icon"
                data-tone="warning"
                align="center"
                justify="center"
                aria-hidden="true"
              >
                <Wallet size={17} />
              </VStack>
              <VStack gap={0} className="rb-grow">
                <Text weight="semibold" size="sm" hasTabularNumbers>
                  {pendingDepositsCount} anticipo{pendingDepositsCount === 1 ? '' : 's'} por
                  confirmar ({formatCurrency(pendingDepositsTotalCents, currency)})
                </Text>
                <Text type="supporting" color="secondary">
                  Revisa la foto del comprobante y confirma cada cita en un toque.
                </Text>
              </VStack>
            </HStack>
            <Button
              type="button"
              label="Revisar anticipos"
              variant="secondary"
              size="sm"
              onClick={onOpenDeposits}
            />
          </HStack>
        </SurfaceCard>
      ) : null}

      <SurfaceCard
        title={todaySummary.hasToday ? 'Cobrado hoy por forma de pago' : 'Cobrado por forma de pago'}
        headingLevel={3}
        padded
        actions={
          <Text type="supporting" color="secondary" hasTabularNumbers>
            Gastos: {formatCurrency(todaySummary.expensesCents, currency)}
          </Text>
        }
      >
        <Grid columns={{ minWidth: 150, max: 3 }} gap={3}>
          <VStack className="ad-subpanel" gap={0.5}>
            <Text type="supporting" color="secondary">
              Efectivo
            </Text>
            <Text className="lk-serif ad-h3 fx-tabular" hasTabularNumbers>
              {formatCurrency(todaySummary.cashCents, currency)}
            </Text>
          </VStack>
          <VStack className="ad-subpanel" gap={0.5}>
            <Text type="supporting" color="secondary">
              Tarjeta
            </Text>
            <Text className="lk-serif ad-h3 fx-tabular" hasTabularNumbers>
              {formatCurrency(todaySummary.cardCents, currency)}
            </Text>
          </VStack>
          <VStack className="ad-subpanel" gap={0.5}>
            <Text type="supporting" color="secondary">
              Transferencia SPEI
            </Text>
            <Text className="lk-serif ad-h3 fx-tabular" hasTabularNumbers>
              {formatCurrency(todaySummary.transferCents, currency)}
            </Text>
          </VStack>
        </Grid>
      </SurfaceCard>

      <VStack className="ad-split" gap={0}>
        <CajaMovementsSection
          cashEntries={cashEntries}
          splitDetails={splitDetails}
          tz={tz}
          currency={currency}
        />

        <VStack gap={4}>
          {canRecordCash ? <CashMovementForm onRecordCashEntry={onRecordCashEntry} /> : null}

          <SurfaceCard
            title="Corte de caja"
            subtitle="Cuenta tu efectivo en caja y compáralo con lo registrado."
            headingLevel={3}
            padded
          >
            <VStack gap={3}>
              <HStack justify="between" align="center" className="ad-cash-row">
                <Text type="supporting" color="secondary">
                  Efectivo que debería haber
                </Text>
                <Text weight="semibold" hasTabularNumbers>
                  {formatCurrency(cashOnlyExpectedCents, currency)}
                </Text>
              </HStack>
              <NumberInput
                label="Efectivo que contaste (MXN)"
                value={countedCashMxn}
                min={0}
                onChange={setCountedCashMxn}
              />
              <HStack justify="start">
                <StatusTag
                  tone={cashDiffCents === 0 ? 'success' : 'warning'}
                  hasTabularNumbers
                  showDot
                  label={
                    cashDiffCents === 0
                      ? 'Caja cuadrada'
                      : cashDiffCents > 0
                        ? `Sobran ${formatCurrency(cashDiffCents, currency)}`
                        : `Faltan ${formatCurrency(Math.abs(cashDiffCents), currency)}`
                  }
                />
              </HStack>
            </VStack>
          </SurfaceCard>
        </VStack>
      </VStack>
    </VStack>
  );
}
