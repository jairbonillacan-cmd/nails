'use client';

import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Table, pixel, proportional } from '@astryxdesign/core/Table';
import { Token } from '@astryxdesign/core/Token';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Lock, Pencil, Trash2 } from 'lucide-react';
import { formatCurrency, formatDateShortInTimezone } from '@/lib/format';
import type { CashRegisterEntry } from '@/lib/types';
import {
  EmptyStateCard,
  FilterPillBar,
  StatusTag,
  SurfaceCard,
  type FilterPillOption,
} from '@/components/ui';
import { isCashEntryEditable, type MovementTypeFilter } from './cajaMetrics';
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
  canManageCash: boolean;
  deletingEntryId: string | null;
  hasExternalFilters: boolean;
  onResetExternalFilters: () => void;
  onEditEntry: (entry: CashRegisterEntry) => void;
  onRequestDeleteEntry: (entry: CashRegisterEntry) => void;
}

export function CajaMovementsSection({
  cashEntries,
  splitDetails,
  tz,
  currency,
  periodLabel,
  canManageCash,
  deletingEntryId,
  hasExternalFilters,
  onResetExternalFilters,
  onEditEntry,
  onRequestDeleteEntry,
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
          <>
            <VStack className="ad-table-scroll ad-caja-desktop-table" gap={0}>
              <Table
                idKey="id"
                hasHover
                data={filteredEntries}
                columns={[
                  {
                    key: 'occurredAt',
                    header: 'Fecha',
                    width: pixel(108),
                    renderCell: (entry) => (
                      <Text type="supporting" hasTabularNumbers>
                        {formatDateShortInTimezone(entry.occurredAt, tz)}
                      </Text>
                    ),
                  },
                  {
                    key: 'description',
                    header: 'Concepto',
                    width: proportional(2, { minWidth: 210 }),
                    renderCell: (entry) => (
                      <VStack gap={0.5}>
                        <Text weight="medium">{entry.description}</Text>
                        <Text type="supporting" color="secondary">
                          {entryTypeLabel(entry.entryType)} ·{' '}
                          {paymentMethodLabel(entry.paymentMethod)} · {entry.recordedBy}
                        </Text>
                      </VStack>
                    ),
                  },
                  {
                    key: 'amountCents',
                    header: 'Monto',
                    align: 'end',
                    width: pixel(108),
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
                    width: pixel(92),
                    renderCell: (entry) => (
                      <Text type="supporting" color="secondary" hasTabularNumbers>
                        {entry.tipCents > 0 ? formatCurrency(entry.tipCents, currency) : '—'}
                      </Text>
                    ),
                  },
                  ...(canManageCash
                    ? [
                        {
                          key: 'id' as const,
                          header: 'Control',
                          align: 'end' as const,
                          width: pixel(212),
                          renderCell: (entry: CashRegisterEntry) =>
                            isCashEntryEditable(entry) ? (
                              <HStack
                                gap={1.5}
                                align="center"
                                justify="end"
                                className="ad-caja-row-actions"
                              >
                                <Button
                                  type="button"
                                  label="Editar"
                                  variant="ghost"
                                  size="sm"
                                  className="ad-caja-row-btn"
                                  icon={<Pencil size={13} aria-hidden="true" />}
                                  isDisabled={Boolean(deletingEntryId)}
                                  onClick={() => onEditEntry(entry)}
                                />
                                <Button
                                  type="button"
                                  label="Eliminar"
                                  variant="ghost"
                                  size="sm"
                                  className="ad-caja-delete-btn ad-caja-row-btn"
                                  icon={<Trash2 size={13} aria-hidden="true" />}
                                  isLoading={deletingEntryId === entry.id}
                                  isDisabled={Boolean(deletingEntryId)}
                                  onClick={() => onRequestDeleteEntry(entry)}
                                />
                              </HStack>
                            ) : (
                              <StatusTag
                                tone="neutral"
                                icon={<Lock size={11} aria-hidden="true" />}
                                label="Cita"
                              />
                            ),
                        },
                      ]
                    : []),
                ]}
              />
            </VStack>

            <VStack className="ad-caja-mobile-cards" gap={3}>
              {filteredEntries.map((entry) => {
                const editable = isCashEntryEditable(entry);
                return (
                  <VStack key={entry.id} className="ad-caja-mcard" gap={2}>
                    <HStack justify="between" align="start" gap={2}>
                      <VStack gap={0.5} className="rb-grow">
                        <Text weight="semibold">{entry.description}</Text>
                        <Text type="supporting" color="secondary" hasTabularNumbers>
                          {formatDateShortInTimezone(entry.occurredAt, tz)} ·{' '}
                          {entryTypeLabel(entry.entryType)} ·{' '}
                          {paymentMethodLabel(entry.paymentMethod)}
                        </Text>
                      </VStack>
                      <VStack gap={0} align="end">
                        <Text
                          weight="bold"
                          className={
                            entry.entryType === 'expense' ? 'ad-caja-expense-amt' : undefined
                          }
                          hasTabularNumbers
                        >
                          {entry.entryType === 'expense' ? '−' : '+'}
                          {formatCurrency(Math.abs(entry.amountCents), currency)}
                        </Text>
                        {entry.tipCents > 0 ? (
                          <Text type="supporting" color="secondary" hasTabularNumbers>
                            Propina {formatCurrency(entry.tipCents, currency)}
                          </Text>
                        ) : null}
                      </VStack>
                    </HStack>

                    <HStack
                      justify="between"
                      align="center"
                      gap={2}
                      wrap="wrap"
                      className="ad-caja-mcard-foot"
                    >
                      <Text type="supporting" color="secondary">
                        Registró: {entry.recordedBy}
                      </Text>
                      {canManageCash ? (
                        editable ? (
                          <HStack gap={2} align="center">
                            <Button
                              type="button"
                              label="Editar"
                              variant="secondary"
                              size="sm"
                              className="ad-caja-touch-btn"
                              icon={<Pencil size={13} aria-hidden="true" />}
                              isDisabled={Boolean(deletingEntryId)}
                              onClick={() => onEditEntry(entry)}
                            />
                            <Button
                              type="button"
                              label="Eliminar"
                              variant="ghost"
                              size="sm"
                              className="ad-caja-delete-btn ad-caja-touch-btn"
                              icon={<Trash2 size={13} aria-hidden="true" />}
                              isLoading={deletingEntryId === entry.id}
                              isDisabled={Boolean(deletingEntryId)}
                              onClick={() => onRequestDeleteEntry(entry)}
                            />
                          </HStack>
                        ) : (
                          <StatusTag
                            tone="neutral"
                            icon={<Lock size={11} aria-hidden="true" />}
                            label="Cita (auto)"
                          />
                        )
                      ) : null}
                    </HStack>
                  </VStack>
                );
              })}
            </VStack>
          </>
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
          <VStack className="ad-table-scroll ad-caja-desktop-table" gap={0} paddingBlockStart={2}>
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

          <VStack className="ad-caja-mobile-cards ad-caja-mobile-cards-flush" gap={3}>
            {splitDetails.map((row) => (
              <VStack key={row.id} className="ad-caja-mcard" gap={1.5}>
                <HStack justify="between" align="start" gap={2}>
                  <VStack gap={0} className="rb-grow">
                    <Text weight="semibold">{row.clientName}</Text>
                    <Text type="supporting" color="secondary" hasTabularNumbers>
                      {formatDateShortInTimezone(row.createdAt, tz)} · {row.bookingCode}
                      {row.reference ? ` · Ref. ${row.reference}` : ''}
                    </Text>
                  </VStack>
                  <Text weight="bold" hasTabularNumbers>
                    {formatCurrency(row.amountCents, currency)}
                  </Text>
                </HStack>
                <HStack justify="between" align="center" gap={2} wrap="wrap">
                  <Token
                    size="sm"
                    color={splitMethodTokenColor(row.method)}
                    label={splitMethodLabel(row.method)}
                  />
                  {row.tipCents > 0 ? (
                    <Text type="supporting" color="secondary" hasTabularNumbers>
                      Propina {formatCurrency(row.tipCents, currency)}
                      {row.tipStaffName ? ` · ${row.tipStaffName}` : ''}
                    </Text>
                  ) : null}
                </HStack>
              </VStack>
            ))}
          </VStack>
        </Collapsible>
      ) : null}
    </VStack>
  );
}
