'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { DateInput } from '@astryxdesign/core/DateInput';
import { Link } from '@astryxdesign/core/Link';
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Banknote,
  CheckCircle2,
  CreditCard,
  RotateCcw,
  Search,
  Users,
  Wallet,
} from 'lucide-react';
import { agendaHref } from '@/lib/admin-links';
import {
  formatCurrency,
  formatDateShortInTimezone,
  formatPhoneDisplay,
  formatTimeInTimezone,
} from '@/lib/format';
import type { CashRegisterEntry } from '@/lib/types';
import { ActionRow, FilterPillBar, StatusTag, SurfaceCard } from '@/components/ui';
import {
  CAJA_PERIOD_OPTIONS,
  toIsoDateValue,
  type CajaCustomRange,
  type CajaMethodFilter,
  type CajaPeriod,
  type CajaPeriodSummary,
} from './cajaMetrics';
import {
  formatCajaDepositsBreakdown,
  formatInstagramDisplay,
  formatInstagramUrl,
  type CommissionStaffRow,
  type SplitDetailRow,
  type UncollectedBookingRow,
} from './cajaTypes';
import { CajaMovementsSection } from './CajaMovementsSection';

interface CajaSummaryTabProps {
  filteredCashEntries: readonly CashRegisterEntry[];
  periodSummary: CajaPeriodSummary;
  periodLabel: string;
  commissionsByStaff: readonly CommissionStaffRow[];
  uncollectedBookings: readonly UncollectedBookingRow[];
  uncollectedTotalCents: number;
  pendingDepositsCount: number;
  pendingDepositsTotalCents: number;
  depositsAwaitingReviewCount: number;
  depositsMissingProofCount: number;
  splitDetails: readonly SplitDetailRow[];
  cajaPeriod: CajaPeriod;
  customRange: CajaCustomRange;
  methodFilter: CajaMethodFilter;
  searchQuery: string;
  hasActiveFilters: boolean;
  tz: string;
  currency: 'MXN' | 'USD';
  canRecordCash: boolean;
  isSpecialistView: boolean;
  deletingEntryId: string | null;
  highlightUncollected: boolean;
  onChangePeriod: (next: CajaPeriod) => void;
  onChangeCustomRange: (next: CajaCustomRange) => void;
  onToggleMethodFilter: (next: CajaMethodFilter) => void;
  onChangeSearchQuery: (next: string) => void;
  onResetFilters: () => void;
  onOpenDeposits: () => void;
  onOpenCommissions: () => void;
  onEditCashEntry: (entry: CashRegisterEntry) => void;
  onRequestDeleteCashEntry: (entry: CashRegisterEntry) => void;
  onRegisterPayout: (row: CommissionStaffRow) => void;
}

const METHOD_TILES = [
  { id: 'cash', label: 'Efectivo', icon: <Banknote size={15} aria-hidden="true" /> },
  { id: 'card', label: 'Tarjeta', icon: <CreditCard size={15} aria-hidden="true" /> },
  {
    id: 'transfer',
    label: 'Transferencia',
    icon: <ArrowLeftRight size={15} aria-hidden="true" />,
  },
] as const;

function methodTotals(
  summary: CajaPeriodSummary,
  id: (typeof METHOD_TILES)[number]['id'],
): { cents: number; count: number } {
  if (id === 'cash') return { cents: summary.cashCents, count: summary.cashCount };
  if (id === 'card') return { cents: summary.cardCents, count: summary.cardCount };
  return { cents: summary.transferCents, count: summary.transferCount };
}

export function CajaSummaryTab({
  filteredCashEntries,
  periodSummary,
  periodLabel,
  commissionsByStaff,
  uncollectedBookings,
  uncollectedTotalCents,
  pendingDepositsCount,
  pendingDepositsTotalCents,
  depositsAwaitingReviewCount,
  depositsMissingProofCount,
  splitDetails,
  cajaPeriod,
  customRange,
  methodFilter,
  searchQuery,
  hasActiveFilters,
  tz,
  currency,
  canRecordCash,
  isSpecialistView,
  deletingEntryId,
  highlightUncollected,
  onChangePeriod,
  onChangeCustomRange,
  onToggleMethodFilter,
  onChangeSearchQuery,
  onResetFilters,
  onOpenDeposits,
  onOpenCommissions,
  onEditCashEntry,
  onRequestDeleteCashEntry,
  onRegisterPayout,
}: CajaSummaryTabProps) {
  const showPayoutActions = canRecordCash && !isSpecialistView;
  const teamTotalCents = commissionsByStaff.reduce((sum, row) => sum + row.totalPayout, 0);
  const visibleCommissionRows = isSpecialistView
    ? commissionsByStaff
    : commissionsByStaff.filter((row) => row.totalPayout > 0);

  return (
    <VStack gap={4}>
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
                      label={row.status === 'completed' ? 'Terminada sin cobro' : 'Pasada sin cerrar'}
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
                      className="ad-caja-touch-btn"
                      icon={<CreditCard size={14} aria-hidden="true" />}
                      href={agendaHref({ collect: row.bookingId })}
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
            <VStack className="ad-done-circle" align="center" justify="center" aria-hidden="true">
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
                  {pendingDepositsCount} anticipo{pendingDepositsCount === 1 ? '' : 's'} pendiente
                  {pendingDepositsCount === 1 ? '' : 's'} (
                  {formatCurrency(pendingDepositsTotalCents, currency)})
                </Text>
                <Text type="supporting" color="secondary" hasTabularNumbers>
                  {formatCajaDepositsBreakdown(
                    depositsAwaitingReviewCount,
                    depositsMissingProofCount,
                  )}
                </Text>
              </VStack>
            </HStack>
            <Button
              type="button"
              label="Revisar anticipos"
              variant="secondary"
              size="sm"
              className="ad-caja-touch-btn"
              onClick={onOpenDeposits}
            />
          </HStack>
        </SurfaceCard>
      ) : null}

      <SurfaceCard tone="subtle" padded className="ad-card ad-caja-filter-card">
        <VStack gap={3}>
          <FilterPillBar
            ariaLabel="Periodo"
            mode="pills"
            size="sm"
            value={cajaPeriod}
            options={CAJA_PERIOD_OPTIONS}
            onChange={onChangePeriod}
          />
          {cajaPeriod === 'custom' ? (
            <HStack gap={2} wrap="wrap" align="end" className="ad-caja-range">
              <DateInput
                label="Desde"
                size="sm"
                value={toIsoDateValue(customRange.fromKey)}
                max={toIsoDateValue(customRange.toKey)}
                hasClear
                onChange={(next) => onChangeCustomRange({ ...customRange, fromKey: next ?? '' })}
                containerClassName="ad-caja-range-field"
              />
              <DateInput
                label="Hasta"
                size="sm"
                value={toIsoDateValue(customRange.toKey)}
                min={toIsoDateValue(customRange.fromKey)}
                hasClear
                onChange={(next) => onChangeCustomRange({ ...customRange, toKey: next ?? '' })}
                containerClassName="ad-caja-range-field"
              />
            </HStack>
          ) : null}
          <HStack justify="between" align="center" wrap="wrap" gap={2}>
            <TextInput
              type="search"
              size="sm"
              label="Buscar en caja"
              isLabelHidden
              placeholder="Buscar concepto, clienta o folio..."
              value={searchQuery}
              onChange={onChangeSearchQuery}
              startIcon={<Search size={14} aria-hidden="true" />}
              hasClear
              containerClassName="ad-caja-search"
            />
            <HStack gap={2} align="center" wrap="wrap">
              <Text type="supporting" color="secondary" hasTabularNumbers>
                {filteredCashEntries.length}{' '}
                {filteredCashEntries.length === 1 ? 'movimiento' : 'movimientos'}
              </Text>
              {hasActiveFilters ? (
                <Button
                  type="button"
                  label="Restablecer"
                  variant="ghost"
                  size="sm"
                  icon={<RotateCcw size={13} aria-hidden="true" />}
                  onClick={onResetFilters}
                />
              ) : null}
            </HStack>
          </HStack>
        </VStack>
      </SurfaceCard>

      <SurfaceCard
        title={`Cobrado por forma de pago · ${periodLabel}`}
        subtitle={
          methodFilter === 'all'
            ? 'Toca una forma de pago para ver solo sus movimientos.'
            : 'Filtrando movimientos. Toca de nuevo para ver todos.'
        }
        headingLevel={3}
        padded
        className="ad-card"
        actions={
          <HStack gap={2} align="center" wrap="wrap">
            {periodSummary.giftCardCents > 0 ? (
              <StatusTag
                tone="accent"
                hasTabularNumbers
                label={`Tarjeta de regalo: ${formatCurrency(periodSummary.giftCardCents, currency)}`}
              />
            ) : null}
            <StatusTag
              tone={periodSummary.expensesCents > 0 ? 'warning' : 'neutral'}
              hasTabularNumbers
              label={`Gastos: ${formatCurrency(periodSummary.expensesCents, currency)}`}
            />
          </HStack>
        }
      >
        <HStack className="ad-caja-methods" gap={0} role="group" aria-label="Filtrar por forma de pago">
          {METHOD_TILES.map((method) => {
            const totals = methodTotals(periodSummary, method.id);
            const sharePct =
              periodSummary.collectedCents > 0
                ? Math.round((totals.cents / periodSummary.collectedCents) * 100)
                : 0;
            const isSelected = methodFilter === method.id;
            return (
              <button
                key={method.id}
                type="button"
                className="ad-caja-method-tile"
                data-active={isSelected ? 'true' : undefined}
                data-dimmed={methodFilter !== 'all' && !isSelected ? 'true' : undefined}
                aria-pressed={isSelected}
                aria-label={`${method.label}: ${formatCurrency(totals.cents, currency)}, ${totals.count} ${totals.count === 1 ? 'cobro' : 'cobros'}. ${isSelected ? 'Quitar filtro' : 'Filtrar'}`}
                onClick={() => onToggleMethodFilter(method.id)}
              >
                <HStack justify="between" align="center" gap={2}>
                  <HStack gap={1.5} align="center" className="ad-caja-method-label">
                    {method.icon}
                    <Text type="supporting" color="secondary" weight="medium">
                      {method.label}
                    </Text>
                  </HStack>
                  {periodSummary.collectedCents > 0 ? (
                    <Text type="supporting" color="secondary" hasTabularNumbers>
                      {sharePct}%
                    </Text>
                  ) : null}
                </HStack>
                <Text className="ad-caja-method-val" hasTabularNumbers>
                  {formatCurrency(totals.cents, currency)}
                </Text>
                <Text type="supporting" color="secondary" hasTabularNumbers>
                  {totals.count === 0
                    ? 'Sin cobros'
                    : `${totals.count} ${totals.count === 1 ? 'cobro' : 'cobros'}`}
                </Text>
              </button>
            );
          })}
        </HStack>
      </SurfaceCard>

      <CajaMovementsSection
        cashEntries={filteredCashEntries}
        splitDetails={splitDetails}
        tz={tz}
        currency={currency}
        periodLabel={periodLabel}
        canManageCash={canRecordCash}
        deletingEntryId={deletingEntryId}
        hasExternalFilters={hasActiveFilters}
        onResetExternalFilters={onResetFilters}
        onEditEntry={onEditCashEntry}
        onRequestDeleteEntry={onRequestDeleteCashEntry}
      />

      {commissionsByStaff.length > 0 ? (
        <SurfaceCard
          title={isSpecialistView ? `Tus comisiones · ${periodLabel}` : `Por pagar a tu equipo · ${periodLabel}`}
          subtitle={
            isSpecialistView
              ? 'Comisión estimada y propinas del periodo.'
              : `Total ${formatCurrency(teamTotalCents, currency)} entre comisiones y propinas.`
          }
          icon={<Users size={16} aria-hidden="true" />}
          headingLevel={3}
          actions={
            <Button
              type="button"
              label="Ver comisiones"
              variant="ghost"
              size="sm"
              icon={<ArrowRight size={14} aria-hidden="true" />}
              onClick={onOpenCommissions}
            />
          }
        >
          {visibleCommissionRows.length === 0 ? (
            <VStack padding={4}>
              <Text type="supporting" color="secondary">
                Nadie tiene comisiones ni propinas pendientes en este periodo.
              </Text>
            </VStack>
          ) : (
            <VStack className="ad-row-list" gap={0}>
              {visibleCommissionRows.map((row) => (
                <ActionRow
                  key={row.id}
                  title={<Text weight="semibold">{row.name}</Text>}
                  subtitle={`Comisión ${formatCurrency(row.commission, currency)} · Propinas ${formatCurrency(row.tips, currency)}`}
                  actions={
                    <HStack gap={3} align="center" wrap="wrap">
                      <Text weight="bold" hasTabularNumbers className="ad-caja-row-amount">
                        {formatCurrency(row.totalPayout, currency)}
                      </Text>
                      {showPayoutActions && row.totalPayout > 0 ? (
                        <Button
                          type="button"
                          label="Pagar"
                          variant="secondary"
                          size="sm"
                          className="ad-caja-touch-btn"
                          icon={<Banknote size={14} aria-hidden="true" />}
                          onClick={() => onRegisterPayout(row)}
                        />
                      ) : null}
                    </HStack>
                  }
                />
              ))}
            </VStack>
          )}
        </SurfaceCard>
      ) : null}
    </VStack>
  );
}
