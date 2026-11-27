'use client';

import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Link } from '@astryxdesign/core/Link';
import {
  AlertTriangle,
  ArrowLeftRight,
  Banknote,
  CheckCircle2,
  CreditCard,
  Wallet,
} from 'lucide-react';
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

  const todayEntries = useMemo(
    () =>
      cashEntries.filter(
        (entry) => getDateKeyInTimezone(new Date(entry.occurredAt), tz) === todayKey,
      ),
    [cashEntries, todayKey, tz],
  );

  const todaySummary = useMemo(() => {
    const hasToday = todayEntries.length > 0;
    const source = hasToday ? todayEntries : cashEntries;

    let cashCents = 0;
    let cashCount = 0;
    let cardCents = 0;
    let cardCount = 0;
    let transferCents = 0;
    let transferCount = 0;
    let expensesCents = 0;

    for (const entry of source) {
      if (entry.entryType === 'expense') {
        expensesCents += Math.abs(entry.amountCents);
      } else if (entry.paymentMethod === 'cash') {
        cashCents += entry.amountCents;
        cashCount += 1;
      } else if (entry.paymentMethod === 'card') {
        cardCents += entry.amountCents;
        cardCount += 1;
      } else {
        transferCents += entry.amountCents;
        transferCount += 1;
      }
    }

    const totalCollectedCents = cashCents + cardCents + transferCents;

    return {
      hasToday,
      cashCents,
      cashCount,
      cardCents,
      cardCount,
      transferCents,
      transferCount,
      totalCollectedCents,
      expensesCents,
    };
  }, [cashEntries, todayEntries]);

  const cashOnlyExpectedCents = useMemo(
    () =>
      todayEntries
        .filter((e) => e.paymentMethod === 'cash')
        .reduce(
          (sum, e) =>
            sum +
            (e.entryType === 'expense'
              ? -Math.abs(e.amountCents)
              : e.amountCents + e.tipCents),
          0,
        ),
    [todayEntries],
  );

  const cashDiffCents = Math.round(countedCashMxn * 100) - cashOnlyExpectedCents;

  return (
    <VStack gap={4} className="fx-step-in">
      {uncollectedBookings.length > 0 ? (
        <SurfaceCard
          id="citas-sin-cobrar"
          title="Citas sin cobrar"
          count={uncollectedBookings.length}
          subtitle={`Faltan ${formatCurrency(uncollectedTotalCents, currency)} por cobrar.`}
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
                subtitle={`${row.serviceName} · ${formatDateShortInTimezone(row.startAt, tz)} ${formatTimeInTimezone(row.startAt, tz)} con ${row.staffName}`}
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
                    <VStack gap={0} className="ad-caja-row-amount">
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
            <HStack gap={3} align="center" className="rb-grow">
              <VStack
                className="ad-task-icon"
                data-tone="warning"
                align="center"
                justify="center"
                aria-hidden="true"
              >
                <Wallet size={17} />
              </VStack>
              <VStack gap={0.5} className="rb-grow">
                <Text weight="semibold" size="sm" hasTabularNumbers>
                  {pendingDepositsCount} anticipo{pendingDepositsCount === 1 ? '' : 's'} por
                  confirmar ({formatCurrency(pendingDepositsTotalCents, currency)})
                </Text>
                <Text type="supporting" color="secondary">
                  Revisa la foto del comprobante y confirma la cita.
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
        subtitle={
          todaySummary.totalCollectedCents > 0
            ? `Total registrado: ${formatCurrency(todaySummary.totalCollectedCents, currency)}`
            : 'Distribución de ingresos por método de cobro.'
        }
        headingLevel={3}
        padded
        className="ad-card"
        actions={
          <StatusTag
            tone={todaySummary.expensesCents > 0 ? 'warning' : 'neutral'}
            hasTabularNumbers
            label={`Gastos: ${formatCurrency(todaySummary.expensesCents, currency)}`}
          />
        }
      >
        <VStack className="ad-caja-methods" gap={0}>
          {[
            {
              id: 'cash',
              label: 'Efectivo',
              cents: todaySummary.cashCents,
              count: todaySummary.cashCount,
              icon: <Banknote size={15} aria-hidden="true" />,
            },
            {
              id: 'card',
              label: 'Tarjeta',
              cents: todaySummary.cardCents,
              count: todaySummary.cardCount,
              icon: <CreditCard size={15} aria-hidden="true" />,
            },
            {
              id: 'transfer',
              label: 'Transferencia',
              cents: todaySummary.transferCents,
              count: todaySummary.transferCount,
              icon: <ArrowLeftRight size={15} aria-hidden="true" />,
            },
          ].map((method) => {
            const sharePct =
              todaySummary.totalCollectedCents > 0
                ? Math.round((method.cents / todaySummary.totalCollectedCents) * 100)
                : 0;
            return (
              <VStack key={method.id} className="ad-caja-method-tile" gap={2} justify="between">
                <HStack justify="between" align="center" gap={2}>
                  <HStack gap={1.5} align="center" className="ad-caja-method-label">
                    {method.icon}
                    <Text type="supporting" color="secondary" weight="medium">
                      {method.label}
                    </Text>
                  </HStack>
                  {todaySummary.totalCollectedCents > 0 ? (
                    <Text type="supporting" color="secondary" hasTabularNumbers>
                      {sharePct}%
                    </Text>
                  ) : null}
                </HStack>
                <Text className="ad-caja-method-val fx-tabular" hasTabularNumbers>
                  {formatCurrency(method.cents, currency)}
                </Text>
                <Text type="supporting" color="secondary" hasTabularNumbers>
                  {method.count === 0
                    ? 'Sin cobros'
                    : `${method.count} ${method.count === 1 ? 'cobro' : 'cobros'}`}
                </Text>
              </VStack>
            );
          })}
        </VStack>
      </SurfaceCard>

      <VStack className="ad-split ad-split-table" gap={0}>
        <CajaMovementsSection
          cashEntries={cashEntries}
          splitDetails={splitDetails}
          tz={tz}
          currency={currency}
        />

        {canRecordCash ? (
          <VStack className="ad-caja-tools" gap={4}>
            <SurfaceCard
              title="Movimiento rápido"
              subtitle="Registra gastos, ventas de producto u otros ingresos fuera de una cita."
              headingLevel={3}
              padded
              className="ad-card ad-caja-tool-card"
            >
              <VStack gap={3} justify="between" className="ad-card-grow">
                <Text type="supporting" color="secondary">
                  Queda registrado al instante en el corte y en el historial de caja.
                </Text>
                <CashMovementForm onRecordCashEntry={onRecordCashEntry} />
              </VStack>
            </SurfaceCard>

            <SurfaceCard
              title="Corte de caja de hoy"
              subtitle="Cuenta tu efectivo en caja y compáralo con lo registrado hoy."
              headingLevel={3}
              padded
              className="ad-card ad-caja-tool-card"
            >
              <VStack gap={3} className="ad-card-grow">
                <HStack justify="between" align="center" className="ad-subpanel">
                  <Text type="supporting" color="secondary">
                    Efectivo esperado hoy
                  </Text>
                  <Text weight="bold" hasTabularNumbers>
                    {formatCurrency(cashOnlyExpectedCents, currency)}
                  </Text>
                </HStack>
                <NumberInput
                  label={`Efectivo que contaste (${currency})`}
                  value={countedCashMxn}
                  min={0}
                  onChange={setCountedCashMxn}
                />
                <HStack justify="between" align="center" wrap="wrap" gap={2}>
                  <Text type="supporting" color="secondary">
                    Estado del corte
                  </Text>
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
        ) : null}
      </VStack>
    </VStack>
  );
}
