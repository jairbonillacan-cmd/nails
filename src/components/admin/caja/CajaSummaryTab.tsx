'use client';

import React, { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Table } from '@astryxdesign/core/Table';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Link } from '@astryxdesign/core/Link';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Token } from '@astryxdesign/core/Token';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { AlertTriangle, CheckCircle2, CreditCard, Plus, Wallet } from 'lucide-react';
import {
  formatCurrency,
  formatDateShortInTimezone,
  formatTimeInTimezone,
  getDateKeyInTimezone,
} from '@/lib/format';
import type { CashRegisterEntry, PaymentMethod } from '@/lib/types';
import {
  formatInstagramDisplay,
  formatInstagramUrl,
  paymentMethodLabel,
  splitMethodLabel,
  splitMethodTokenColor,
  type SplitDetailRow,
  type UncollectedBookingRow,
} from './cajaTypes';

type MovementFilter = 'all' | 'income' | 'deposits' | 'expenses';
type QuickEntryType = 'expense' | 'product_sale' | 'service_income';

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
  }) => Promise<boolean>;
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
  const [movementFilter, setMovementFilter] = useState<MovementFilter>('all');
  const [countedCashMxn, setCountedCashMxn] = useState<number>(0);

  const [entryType, setEntryType] = useState<QuickEntryType>('expense');
  const [desc, setDesc] = useState('');
  const [amountMxn, setAmountMxn] = useState(150);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [savingEntry, setSavingEntry] = useState(false);

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

  const filteredEntries = useMemo(() => {
    const ordered = cashEntries.toSorted(
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );
    if (movementFilter === 'all') return ordered;
    if (movementFilter === 'deposits') {
      return ordered.filter((e) => e.entryType === 'deposit');
    }
    if (movementFilter === 'expenses') {
      return ordered.filter((e) => e.entryType === 'expense');
    }
    return ordered.filter((e) => e.entryType !== 'expense' && e.entryType !== 'deposit');
  }, [cashEntries, movementFilter]);

  const handleSubmitEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc.trim() || savingEntry) return;
    setSavingEntry(true);
    try {
      const ok = await onRecordCashEntry({
        entryType,
        description: desc.trim(),
        amountMxn,
        method,
      });
      if (ok) {
        setDesc('');
      }
    } finally {
      setSavingEntry(false);
    }
  };

  return (
    <VStack gap={4} className="fx-step-in">
      {uncollectedBookings.length > 0 ? (
        <VStack
          id="citas-sin-cobrar"
          className="ad-surface"
          data-tone={highlightUncollected ? 'accent' : 'warning'}
          gap={0}
        >
          <HStack className="ad-section-head" justify="between" align="center" wrap="wrap" gap={2}>
            <HStack gap={2} align="center" className="rb-grow">
              <VStack
                className="ad-task-icon"
                data-tone={highlightUncollected ? 'accent' : 'warning'}
                align="center"
                justify="center"
                aria-hidden="true"
              >
                <AlertTriangle size={17} />
              </VStack>
              <VStack gap={0.5} className="rb-grow">
                <Heading level={2} className="lk-serif ad-h2">
                  Citas sin cobrar ({uncollectedBookings.length})
                </Heading>
                <Text type="supporting" color="secondary" hasTabularNumbers>
                  Citas terminadas o pasadas con saldo pendiente:{' '}
                  <Text weight="semibold" hasTabularNumbers>
                    {formatCurrency(uncollectedTotalCents, currency)}
                  </Text>
                </Text>
              </VStack>
            </HStack>
          </HStack>

          <VStack className="ad-row-list" gap={0}>
            {uncollectedBookings.map((row) => (
              <HStack
                key={row.bookingId}
                className="ad-row-item"
                justify="between"
                align="center"
                wrap="wrap"
                gap={3}
              >
                <VStack gap={0.5} className="rb-grow">
                  <HStack gap={2} align="center" wrap="wrap">
                    <Text weight="semibold">{row.clientName}</Text>
                    <Text
                      color="inherit"
                      className="ad-chip"
                      data-tone="warning"
                      hasTabularNumbers
                    >
                      {row.status === 'completed' ? 'Terminada sin cobro' : 'Pasada sin cerrar'}
                    </Text>
                  </HStack>
                  <Text type="supporting" color="secondary" hasTabularNumbers>
                    {row.serviceName} · {formatDateShortInTimezone(row.startAt, tz)}{' '}
                    {formatTimeInTimezone(row.startAt, tz, true)} con {row.staffName}
                  </Text>
                  <HStack gap={2} wrap="wrap" align="center">
                    <Text type="supporting" color="secondary" hasTabularNumbers>
                      {row.clientPhone}
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
                </VStack>

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
              </HStack>
            ))}
          </VStack>
        </VStack>
      ) : highlightUncollected ? (
        <HStack
          id="citas-sin-cobrar"
          className="ad-surface"
          data-tone="subtle"
          data-padded="true"
          align="center"
          gap={3}
        >
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
      ) : null}

      {pendingDepositsCount > 0 ? (
        <HStack
          className="ad-surface"
          data-tone="subtle"
          data-padded="true"
          justify="between"
          align="center"
          wrap="wrap"
          gap={3}
        >
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
      ) : null}

      <VStack className="ad-surface" data-padded="true" gap={3}>
        <HStack justify="between" align="center" wrap="wrap" gap={2}>
          <Heading level={2} className="lk-serif ad-h3">
            {todaySummary.hasToday ? 'Cobrado hoy por forma de pago' : 'Cobrado por forma de pago'}
          </Heading>
          <Text type="supporting" color="secondary" hasTabularNumbers>
            Gastos: {formatCurrency(todaySummary.expensesCents, currency)}
          </Text>
        </HStack>
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
      </VStack>

      <VStack className="ad-split" gap={0}>
        <VStack gap={4}>
          <VStack className="ad-surface" gap={0}>
            <HStack className="ad-section-head" justify="between" align="center" wrap="wrap" gap={2}>
              <Heading level={3} className="lk-serif ad-h3">
                Movimientos de caja
              </Heading>
              <HStack gap={1.5} wrap="wrap" role="group" aria-label="Filtrar movimientos">
                {(
                  [
                    { id: 'all', label: 'Todos' },
                    { id: 'income', label: 'Cobros' },
                    { id: 'deposits', label: 'Anticipos' },
                    { id: 'expenses', label: 'Gastos' },
                  ] as const
                ).map((pill) => (
                  <button
                    key={pill.id}
                    type="button"
                    className="ad-pill fx-press"
                    data-on={movementFilter === pill.id ? 'true' : 'false'}
                    aria-pressed={movementFilter === pill.id}
                    onClick={() => setMovementFilter(pill.id)}
                  >
                    {pill.label}
                  </button>
                ))}
              </HStack>
            </HStack>

            {filteredEntries.length === 0 ? (
              <VStack className="ad-empty" gap={2}>
                <EmptyState
                  isCompact
                  title="Sin movimientos con este filtro"
                  description="Cambia el filtro o registra una venta o un gasto desde el panel derecho."
                />
              </VStack>
            ) : (
              <VStack className="ad-table-scroll" gap={0}>
                <Table
                  idKey="id"
                  hasHover
                  data={filteredEntries}
                  columns={[
                    {
                      key: 'occurredAt',
                      header: 'Fecha',
                      renderCell: (entry) => (
                        <Text type="supporting" hasTabularNumbers>
                          {formatDateShortInTimezone(entry.occurredAt, tz)}
                        </Text>
                      ),
                    },
                    {
                      key: 'description',
                      header: 'Concepto',
                      renderCell: (entry) => (
                        <VStack gap={0}>
                          <Text weight="medium">{entry.description}</Text>
                          <Text type="supporting" color="secondary">
                            {paymentMethodLabel(entry.paymentMethod)} · {entry.recordedBy}
                          </Text>
                        </VStack>
                      ),
                    },
                    {
                      key: 'amountCents',
                      header: 'Monto',
                      align: 'end',
                      renderCell: (entry) => (
                        <Text weight="semibold" hasTabularNumbers>
                          {entry.entryType === 'expense' ? '−' : '+'}
                          {formatCurrency(Math.abs(entry.amountCents), currency)}
                        </Text>
                      ),
                    },
                    {
                      key: 'tipCents',
                      header: 'Propina',
                      align: 'end',
                      renderCell: (entry) => (
                        <Text type="supporting" color="secondary" hasTabularNumbers>
                          {entry.tipCents > 0 ? formatCurrency(entry.tipCents, currency) : '—'}
                        </Text>
                      ),
                    },
                  ]}
                />
              </VStack>
            )}
          </VStack>

          {splitDetails.length > 0 ? (
            <Collapsible
              className="ad-disclosure"
              defaultIsOpen={false}
              trigger={
                <HStack justify="between" align="center" gap={2} width="100%">
                  <Text weight="semibold" size="sm">
                    Detalle de pagos combinados
                  </Text>
                  <Text color="inherit" className="ad-chip" data-tone="neutral" hasTabularNumbers>
                    {splitDetails.length}
                  </Text>
                </HStack>
              }
            >
              <VStack className="ad-table-scroll" gap={0} paddingBlockStart={2}>
                <Table
                  idKey="id"
                  hasHover
                  data={[...splitDetails]}
                  columns={[
                    {
                      key: 'createdAt',
                      header: 'Fecha',
                      renderCell: (row) => (
                        <Text type="supporting" hasTabularNumbers>
                          {formatDateShortInTimezone(row.createdAt, tz)}
                        </Text>
                      ),
                    },
                    {
                      key: 'bookingCode',
                      header: 'Clienta',
                      renderCell: (row) => (
                        <VStack gap={0}>
                          <Text weight="medium">{row.clientName}</Text>
                          <Text type="supporting" color="secondary">
                            {row.bookingCode}
                            {row.reference ? ` · Ref. ${row.reference}` : ''}
                          </Text>
                        </VStack>
                      ),
                    },
                    {
                      key: 'method',
                      header: 'Forma de pago',
                      renderCell: (row) => (
                        <Token
                          size="sm"
                          color={splitMethodTokenColor(row.method)}
                          label={splitMethodLabel(row.method)}
                        />
                      ),
                    },
                    {
                      key: 'amountCents',
                      header: 'Cobro',
                      align: 'end',
                      renderCell: (row) => (
                        <VStack gap={0} align="end">
                          <Text weight="semibold" hasTabularNumbers>
                            {formatCurrency(row.amountCents, currency)}
                          </Text>
                          {row.tipCents > 0 ? (
                            <Text type="supporting" color="secondary" hasTabularNumbers>
                              Propina {formatCurrency(row.tipCents, currency)}
                              {row.tipStaffName ? ` · ${row.tipStaffName}` : ''}
                            </Text>
                          ) : null}
                        </VStack>
                      ),
                    },
                  ]}
                />
              </VStack>
            </Collapsible>
          ) : null}
        </VStack>

        <VStack gap={4}>
          {canRecordCash ? (
            <VStack className="ad-surface" data-padded="true" gap={3}>
              <form onSubmit={(e) => void handleSubmitEntry(e)}>
                <VStack gap={3}>
                  <Heading level={3} className="lk-serif ad-h3">
                    Registrar gasto o venta
                  </Heading>
                  <HStack gap={1.5} wrap="wrap" role="group" aria-label="Tipo de movimiento">
                    {(
                      [
                        { id: 'expense', label: 'Registrar gasto' },
                        { id: 'product_sale', label: 'Registrar venta' },
                        { id: 'service_income', label: 'Otro ingreso' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        className="ad-pill fx-press"
                        data-on={entryType === opt.id ? 'true' : 'false'}
                        aria-pressed={entryType === opt.id}
                        onClick={() => setEntryType(opt.id)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </HStack>
                  <TextInput
                    label="Descripción"
                    placeholder={
                      entryType === 'expense'
                        ? 'Ej. Compra de limas y acetona'
                        : entryType === 'product_sale'
                          ? 'Ej. Aceite de cutícula'
                          : 'Ej. Ajuste o ingreso adicional'
                    }
                    value={desc}
                    onChange={setDesc}
                    isRequired
                  />
                  <Grid columns={{ minWidth: 130, max: 2 }} gap={2}>
                    <NumberInput
                      label="Monto (MXN)"
                      value={amountMxn}
                      min={1}
                      onChange={setAmountMxn}
                    />
                    <Selector
                      label="Forma de pago"
                      value={method}
                      onChange={(v) => v && setMethod(v as PaymentMethod)}
                      options={[
                        { value: 'cash', label: 'Efectivo' },
                        { value: 'transfer', label: 'Transferencia SPEI' },
                        { value: 'card', label: 'Tarjeta' },
                      ]}
                    />
                  </Grid>
                  <Button
                    type="submit"
                    label={
                      entryType === 'expense'
                        ? 'Guardar gasto'
                        : entryType === 'product_sale'
                          ? 'Guardar venta'
                          : 'Guardar ingreso'
                    }
                    variant="primary"
                    icon={<Plus size={15} aria-hidden="true" />}
                    width="100%"
                    isLoading={savingEntry}
                    isDisabled={savingEntry || !desc.trim()}
                  />
                </VStack>
              </form>
            </VStack>
          ) : null}

          <VStack className="ad-surface" data-padded="true" gap={3}>
            <VStack gap={0.5}>
              <Heading level={3} className="lk-serif ad-h3">
                Corte de caja
              </Heading>
              <Text type="supporting" color="secondary">
                Cuenta tu efectivo en caja y compáralo con lo registrado.
              </Text>
            </VStack>
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
              <Text
                color="inherit"
                className="ad-chip"
                data-tone={cashDiffCents === 0 ? 'success' : 'warning'}
                hasTabularNumbers
              >
                {cashDiffCents === 0
                  ? 'Caja cuadrada'
                  : cashDiffCents > 0
                    ? `Sobran ${formatCurrency(cashDiffCents, currency)}`
                    : `Faltan ${formatCurrency(Math.abs(cashDiffCents), currency)}`}
              </Text>
            </HStack>
          </VStack>
        </VStack>
      </VStack>
    </VStack>
  );
}
