'use client';

import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Table } from '@astryxdesign/core/Table';
import { Token } from '@astryxdesign/core/Token';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { formatCurrency, formatDateShortInTimezone } from '@/lib/format';
import type { CashRegisterEntry } from '@/lib/types';
import {
  EmptyStateCard,
  FilterPillBar,
  StatusTag,
  SurfaceCard,
  type FilterPillOption,
} from '@/components/ui';
import type { MovementTypeFilter } from './cajaMetrics';
import {
  paymentMethodLabel,
  splitMethodLabel,
  splitMethodTokenColor,
  type SplitDetailRow,
} from './cajaTypes';

const MOVEMENT_FILTER_OPTIONS: readonly FilterPillOption<MovementTypeFilter>[] = [
  { value: 'all', label: 'Todos' },
  { value: 'income', label: 'Cobros' },
  { value: 'deposits', label: 'Anticipos' },
  { value: 'expenses', label: 'Gastos' },
];

function entryTypeLabel(entryType: CashRegisterEntry['entryType']): string {
  if (entryType === 'expense') return 'Gasto';
  if (entryType === 'deposit') return 'Anticipo';
  if (entryType === 'product_sale') return 'Producto';
  if (entryType === 'gift_card_sale') return 'Tarjeta de regalo';
  return 'Servicio';
}

interface CajaMovementsSectionProps {
  cashEntries: readonly CashRegisterEntry[];
  splitDetails: readonly SplitDetailRow[];
  tz: string;
  currency: 'MXN' | 'USD';
  periodLabel: string;
  hasExternalFilters: boolean;
  onResetExternalFilters: () => void;
}

export function CajaMovementsSection({
  cashEntries,
  splitDetails,
  tz,
  currency,
  periodLabel,
  hasExternalFilters,
  onResetExternalFilters,
}: CajaMovementsSectionProps) {
  const [movementFilter, setMovementFilter] = useState<MovementTypeFilter>('all');

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

  const hasAnyFilter = movementFilter !== 'all' || hasExternalFilters;

  return (
    <VStack gap={4}>
      <SurfaceCard
        title="Movimientos de caja"
        subtitle={`Detalle de cobros, anticipos y gastos · ${periodLabel}.`}
        count={filteredEntries.length}
        headingLevel={3}
        actions={
          <FilterPillBar
            ariaLabel="Filtrar tipo de movimiento"
            mode="pills"
            size="sm"
            value={movementFilter}
            options={MOVEMENT_FILTER_OPTIONS}
            onChange={setMovementFilter}
          />
        }
      >
        {filteredEntries.length === 0 ? (
          <VStack padding={4}>
            <EmptyStateCard
              framed={false}
              isCompact
              title="Sin movimientos con este filtro"
              description="Cambia el periodo, método o búsqueda, o registra una venta o un gasto."
              actions={
                hasAnyFilter ? (
                  <Button
                    type="button"
                    label="Limpiar filtros"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setMovementFilter('all');
                      onResetExternalFilters();
                    }}
                  />
                ) : undefined
              }
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
                    <VStack gap={0.5}>
                      <Text weight="medium">{entry.description}</Text>
                      <Text type="supporting" color="secondary">
                        {entryTypeLabel(entry.entryType)} · {paymentMethodLabel(entry.paymentMethod)} ·{' '}
                        {entry.recordedBy}
                      </Text>
                    </VStack>
                  ),
                },
                {
                  key: 'amountCents',
                  header: 'Monto',
                  align: 'end',
                  renderCell: (entry) => (
                    <Text
                      weight="semibold"
                      className={
                        entry.entryType === 'expense' ? 'ad-caja-expense-amt' : undefined
                      }
                      hasTabularNumbers
                    >
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
      </SurfaceCard>

      {splitDetails.length > 0 ? (
        <Collapsible
          className="ad-disclosure"
          defaultIsOpen={false}
          trigger={
            <HStack justify="between" align="center" gap={2} width="100%">
              <Text weight="semibold" size="sm">
                Pagos combinados (ej. efectivo + tarjeta)
              </Text>
              <StatusTag tone="neutral" hasTabularNumbers label={String(splitDetails.length)} />
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
  );
}
