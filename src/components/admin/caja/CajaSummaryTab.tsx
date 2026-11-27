'use client';

import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Table, pixel, proportional } from '@astryxdesign/core/Table';
import { Link } from '@astryxdesign/core/Link';
import {
  AlertTriangle,
  ArrowLeftRight,
  Banknote,
  Check,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  Pencil,
  RotateCcw,
  Search,
  Users,
  Wallet,
} from 'lucide-react';
import {
  formatCurrency,
  formatDateShortInTimezone,
  formatPhoneDisplay,
  formatTimeInTimezone,
} from '@/lib/format';
import { useCopyToClipboard } from '@/lib/hooks/useCopyToClipboard';
import type { CashRegisterEntry, InventoryItem, StaffMember } from '@/lib/types';
import type { FormSubmitResult } from '@/lib/forms/form-submit';
import { ActionRow, FilterPillBar, StatusTag, SurfaceCard } from '@/components/ui';
import type { RecordCajaEntryInput } from './cajaActions';
import {
  CAJA_METHOD_FILTER_OPTIONS,
  CAJA_PERIOD_OPTIONS,
  cajaPeriodLabel,
  computeCashReconciliation,
  computeTodayExpectedCashCents,
  formatCashCloseWhatsAppSummary,
  type CajaMethodFilter,
  type CajaPeriod,
  type CajaPeriodSummary,
} from './cajaMetrics';
import {
  formatInstagramDisplay,
  formatInstagramUrl,
  type CommissionStaffRow,
  type SplitDetailRow,
  type UncollectedBookingRow,
} from './cajaTypes';
import { CashMovementForm } from './CashMovementForm';
import { CajaMovementsSection } from './CajaMovementsSection';

interface CajaSummaryTabProps {
  salonName: string;
  allCashEntries: readonly CashRegisterEntry[];
  filteredCashEntries: readonly CashRegisterEntry[];
  periodSummary: CajaPeriodSummary;
  todaySummary: CajaPeriodSummary;
  commissionsByStaff: readonly CommissionStaffRow[];
  inventory: readonly InventoryItem[];
  staff: readonly StaffMember[];
  uncollectedBookings: readonly UncollectedBookingRow[];
  uncollectedTotalCents: number;
  pendingDepositsCount: number;
  pendingDepositsTotalCents: number;
  splitDetails: readonly SplitDetailRow[];
  cajaPeriod: CajaPeriod;
  methodFilter: CajaMethodFilter;
  searchQuery: string;
  todayKey: string;
  tz: string;
  currency: 'MXN' | 'USD';
  canRecordCash: boolean;
  isSpecialistView: boolean;
  deletingEntryId: string | null;
  highlightUncollected: boolean;
  onChangePeriod: (next: CajaPeriod) => void;
  onChangeMethodFilter: (next: CajaMethodFilter) => void;
  onChangeSearchQuery: (next: string) => void;
  onResetFilters: () => void;
  onOpenDeposits: () => void;
  onOpenCommissions: () => void;
  onRecordCashEntry: (input: RecordCajaEntryInput) => Promise<FormSubmitResult>;
  onEditCashEntry: (entry: CashRegisterEntry) => void;
  onRequestDeleteCashEntry: (entry: CashRegisterEntry) => void;
  onEditCommissionRate: (row: CommissionStaffRow) => void;
  onRegisterPayout: (row: CommissionStaffRow) => void;
}

export function CajaSummaryTab({
  salonName,
  allCashEntries,
  filteredCashEntries,
  periodSummary,
  todaySummary,
  commissionsByStaff,
  inventory,
  staff,
  uncollectedBookings,
  uncollectedTotalCents,
  pendingDepositsCount,
  pendingDepositsTotalCents,
  splitDetails,
  cajaPeriod,
  methodFilter,
  searchQuery,
  todayKey,
  tz,
  currency,
  canRecordCash,
  isSpecialistView,
  deletingEntryId,
  highlightUncollected,
  onChangePeriod,
  onChangeMethodFilter,
  onChangeSearchQuery,
  onResetFilters,
  onOpenDeposits,
  onOpenCommissions,
  onRecordCashEntry,
  onEditCashEntry,
  onRequestDeleteCashEntry,
  onEditCommissionRate,
  onRegisterPayout,
}: CajaSummaryTabProps) {
  const [countedCashMxn, setCountedCashMxn] = useState<number>(0);
  const closeClipboard = useCopyToClipboard(2600);

  const cashOnlyExpectedCents = useMemo(
    () => computeTodayExpectedCashCents(allCashEntries, todayKey, tz),
    [allCashEntries, todayKey, tz],
  );

  const reconciliation = useMemo(
    () => computeCashReconciliation(cashOnlyExpectedCents, countedCashMxn),
    [cashOnlyExpectedCents, countedCashMxn],
  );

  const periodLabel = cajaPeriodLabel(cajaPeriod);
  const hasActiveFilters =
    cajaPeriod !== 'all' || methodFilter !== 'all' || searchQuery.trim().length > 0;
  const hasSecondaryFilters = methodFilter !== 'all' || searchQuery.trim().length > 0;
  const showCommissionActions = canRecordCash && !isSpecialistView;

  const handleCopyCloseSummary = () => {
    const summaryText = formatCashCloseWhatsAppSummary({
      salonName,
      todayKey,
      currency,
      todaySummary,
      expectedCashCents: cashOnlyExpectedCents,
      countedMxn: countedCashMxn,
      uncollectedCount: uncollectedBookings.length,
      uncollectedTotalCents,
      pendingDepositsCount,
      pendingDepositsTotalCents,
    });
    void closeClipboard.copy(summaryText, 'Resumen del corte copiado para WhatsApp.');
  };

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
                      className="ad-caja-touch-btn"
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
              className="ad-caja-touch-btn"
              onClick={onOpenDeposits}
            />
          </HStack>
        </SurfaceCard>
      ) : null}

      <SurfaceCard tone="subtle" padded className="ad-card ad-caja-filter-card">
        <VStack gap={3}>
          <HStack justify="between" align="center" wrap="wrap" gap={3}>
            <FilterPillBar
              ariaLabel="Periodo de ventas"
              mode="segmented"
              size="sm"
              value={cajaPeriod}
              options={CAJA_PERIOD_OPTIONS}
              onChange={onChangePeriod}
            />
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
          </HStack>

          <HStack justify="between" align="center" wrap="wrap" gap={2}>
            <FilterPillBar
              ariaLabel="Filtrar por forma de pago"
              mode="pills"
              size="sm"
              value={methodFilter}
              options={CAJA_METHOD_FILTER_OPTIONS}
              onChange={onChangeMethodFilter}
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
          periodSummary.collectedCents > 0
            ? `Total registrado: ${formatCurrency(periodSummary.collectedCents, currency)} (${periodSummary.ticketCount} ${periodSummary.ticketCount === 1 ? 'cobro' : 'cobros'})`
            : 'Distribución de ingresos por método de cobro en el periodo.'
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
        <VStack className="ad-caja-methods" gap={0}>
          {[
            {
              id: 'cash' as const,
              label: 'Efectivo',
              cents: periodSummary.cashCents,
              count: periodSummary.cashCount,
              icon: <Banknote size={15} aria-hidden="true" />,
            },
            {
              id: 'card' as const,
              label: 'Tarjeta',
              cents: periodSummary.cardCents,
              count: periodSummary.cardCount,
              icon: <CreditCard size={15} aria-hidden="true" />,
            },
            {
              id: 'transfer' as const,
              label: 'Transferencia',
              cents: periodSummary.transferCents,
              count: periodSummary.transferCount,
              icon: <ArrowLeftRight size={15} aria-hidden="true" />,
            },
          ].map((method) => {
            const sharePct =
              periodSummary.collectedCents > 0
                ? Math.round((method.cents / periodSummary.collectedCents) * 100)
                : 0;
            const isSelected = methodFilter === method.id;
            return (
              <VStack
                key={method.id}
                className="ad-caja-method-tile"
                data-active={isSelected ? 'true' : undefined}
                gap={2}
                justify="between"
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
        <VStack gap={4} className="ad-card-grow">
          <CajaMovementsSection
            cashEntries={filteredCashEntries}
            splitDetails={splitDetails}
            tz={tz}
            currency={currency}
            periodLabel={periodLabel}
            canManageCash={canRecordCash}
            deletingEntryId={deletingEntryId}
            hasExternalFilters={hasSecondaryFilters || cajaPeriod !== 'all'}
            onResetExternalFilters={onResetFilters}
            onEditEntry={onEditCashEntry}
            onRequestDeleteEntry={onRequestDeleteCashEntry}
          />

          {commissionsByStaff.length > 0 ? (
            <SurfaceCard
              title={
                isSpecialistView
                  ? `Tus comisiones y propinas · ${periodLabel}`
                  : `Comisiones y propinas por profesional · ${periodLabel}`
              }
              subtitle={
                isSpecialistView
                  ? 'Resumen de tus cobros, comisión estimada y propinas en el periodo.'
                  : 'Cálculo en vivo de ventas, comisión estimada y propinas por especialista.'
              }
              icon={<Users size={16} aria-hidden="true" />}
              headingLevel={3}
              actions={
                <Button
                  type="button"
                  label="Ver detalle"
                  variant="ghost"
                  size="sm"
                  onClick={onOpenCommissions}
                />
              }
            >
              <VStack className="ad-table-scroll ad-caja-desktop-table" gap={0}>
                <Table
                  idKey="id"
                  hasHover
                  data={[...commissionsByStaff]}
                  columns={[
                    {
                      key: 'name',
                      header: 'Profesional',
                      width: proportional(1.4, { minWidth: 145 }),
                      renderCell: (row) => (
                        <VStack gap={0}>
                          <Text weight="medium">{row.name}</Text>
                          <Text type="supporting" color="secondary" hasTabularNumbers>
                            {row.servicesCount}{' '}
                            {row.servicesCount === 1 ? 'cobro' : 'cobros'} · {row.percent}%
                          </Text>
                        </VStack>
                      ),
                    },
                    {
                      key: 'sales',
                      header: 'Ventas',
                      align: 'end',
                      width: pixel(96),
                      renderCell: (row) => (
                        <Text hasTabularNumbers>{formatCurrency(row.sales, currency)}</Text>
                      ),
                    },
                    {
                      key: 'commission',
                      header: 'Comisión',
                      align: 'end',
                      width: pixel(96),
                      renderCell: (row) => (
                        <Text hasTabularNumbers>
                          {formatCurrency(row.commission, currency)}
                        </Text>
                      ),
                    },
                    {
                      key: 'tips',
                      header: 'Propinas',
                      align: 'end',
                      width: pixel(96),
                      renderCell: (row) => (
                        <Text hasTabularNumbers>{formatCurrency(row.tips, currency)}</Text>
                      ),
                    },
                    {
                      key: 'totalPayout',
                      header: 'Total',
                      align: 'end',
                      width: pixel(104),
                      renderCell: (row) => (
                        <Text weight="bold" hasTabularNumbers>
                          {formatCurrency(row.totalPayout, currency)}
                        </Text>
                      ),
                    },
                    ...(showCommissionActions
                      ? [
                          {
                            key: 'id' as const,
                            header: 'Acciones',
                            align: 'end' as const,
                            width: pixel(260),
                            renderCell: (row: CommissionStaffRow) => (
                              <HStack
                                gap={1.5}
                                align="center"
                                justify="end"
                                className="ad-caja-row-actions"
                              >
                                <Button
                                  type="button"
                                  label="Editar %"
                                  variant="ghost"
                                  size="sm"
                                  className="ad-caja-row-btn"
                                  icon={<Pencil size={13} aria-hidden="true" />}
                                  onClick={() => onEditCommissionRate(row)}
                                />
                                {row.totalPayout > 0 ? (
                                  <Button
                                    type="button"
                                    label="Registrar pago"
                                    variant="secondary"
                                    size="sm"
                                    className="ad-caja-row-btn"
                                    icon={<Banknote size={13} aria-hidden="true" />}
                                    onClick={() => onRegisterPayout(row)}
                                  />
                                ) : null}
                              </HStack>
                            ),
                          },
                        ]
                      : []),
                  ]}
                />
              </VStack>

              <VStack className="ad-caja-mobile-cards" gap={3}>
                {commissionsByStaff.map((row) => (
                  <VStack key={row.id} className="ad-caja-mcard" gap={2}>
                    <HStack justify="between" align="center" gap={2}>
                      <VStack gap={0}>
                        <Text weight="semibold">{row.name}</Text>
                        <Text type="supporting" color="secondary" hasTabularNumbers>
                          {row.servicesCount} {row.servicesCount === 1 ? 'cobro' : 'cobros'}
                        </Text>
                      </VStack>
                      <StatusTag tone="neutral" hasTabularNumbers label={`${row.percent}%`} />
                    </HStack>
                    <VStack className="ad-caja-mcard-grid" gap={0}>
                      <VStack className="ad-caja-mcard-cell" gap={0.5}>
                        <Text type="supporting" color="secondary">
                          Ventas
                        </Text>
                        <Text weight="semibold" hasTabularNumbers>
                          {formatCurrency(row.sales, currency)}
                        </Text>
                      </VStack>
                      <VStack className="ad-caja-mcard-cell" gap={0.5}>
                        <Text type="supporting" color="secondary">
                          Comisión
                        </Text>
                        <Text weight="semibold" hasTabularNumbers>
                          {formatCurrency(row.commission, currency)}
                        </Text>
                      </VStack>
                      <VStack className="ad-caja-mcard-cell" gap={0.5}>
                        <Text type="supporting" color="secondary">
                          Propinas
                        </Text>
                        <Text weight="semibold" hasTabularNumbers>
                          {formatCurrency(row.tips, currency)}
                        </Text>
                      </VStack>
                      <VStack className="ad-caja-mcard-cell" gap={0.5}>
                        <Text type="supporting" color="secondary">
                          Total
                        </Text>
                        <Text weight="bold" hasTabularNumbers>
                          {formatCurrency(row.totalPayout, currency)}
                        </Text>
                      </VStack>
                    </VStack>
                    {showCommissionActions ? (
                      <HStack gap={2} wrap="wrap" className="ad-caja-mcard-foot">
                        <Button
                          type="button"
                          label="Editar %"
                          variant="secondary"
                          size="sm"
                          className="ad-caja-touch-btn rb-grow"
                          icon={<Pencil size={14} aria-hidden="true" />}
                          onClick={() => onEditCommissionRate(row)}
                        />
                        {row.totalPayout > 0 ? (
                          <Button
                            type="button"
                            label="Registrar pago"
                            variant="primary"
                            size="sm"
                            className="ad-caja-touch-btn rb-grow"
                            icon={<Banknote size={14} aria-hidden="true" />}
                            onClick={() => onRegisterPayout(row)}
                          />
                        ) : null}
                      </HStack>
                    ) : null}
                  </VStack>
                ))}
              </VStack>
            </SurfaceCard>
          ) : null}
        </VStack>

        {canRecordCash ? (
          <VStack className="ad-caja-tools" gap={4}>
            <SurfaceCard
              title="Movimiento rápido"
              subtitle="Vende productos del inventario o registra gastos e ingresos fuera de cita."
              headingLevel={3}
              padded
              className="ad-card ad-caja-tool-card"
            >
              <VStack gap={3} justify="between" className="ad-card-grow">
                <Text type="supporting" color="secondary">
                  Si eliges un producto del inventario, el stock se descuenta y el ingreso se
                  anota en el corte al instante.
                </Text>
                <CashMovementForm
                  inventory={inventory}
                  staff={staff}
                  currency={currency}
                  onRecordCashEntry={onRecordCashEntry}
                />
              </VStack>
            </SurfaceCard>

            <SurfaceCard
              title="Corte de caja de hoy"
              subtitle="Cuadra el efectivo físico del cajón contra los cobros y gastos en efectivo de hoy."
              headingLevel={3}
              padded
              className="ad-card ad-caja-tool-card"
            >
              <VStack gap={3} className="ad-card-grow">
                <VStack className="ad-subpanel ad-caja-reconcile" gap={0}>
                  <HStack justify="between" align="center" className="ad-kv-row">
                    <Text type="supporting" color="secondary">
                      Efectivo esperado
                    </Text>
                    <Text weight="bold" hasTabularNumbers>
                      {formatCurrency(reconciliation.expectedCents, currency)}
                    </Text>
                  </HStack>
                  <HStack justify="between" align="center" className="ad-kv-row">
                    <Text type="supporting" color="secondary">
                      Efectivo contado
                    </Text>
                    <Text weight="semibold" hasTabularNumbers>
                      {formatCurrency(reconciliation.countedCents, currency)}
                    </Text>
                  </HStack>
                  <HStack
                    justify="between"
                    align="center"
                    wrap="wrap"
                    gap={2}
                    className="ad-kv-row"
                  >
                    <Text type="supporting" color="secondary">
                      Diferencia
                    </Text>
                    <StatusTag
                      tone={reconciliation.tone}
                      hasTabularNumbers
                      showDot
                      label={
                        reconciliation.status === 'balanced'
                          ? `Cuadra (${formatCurrency(0, currency)})`
                          : reconciliation.status === 'over'
                            ? `Sobrante +${formatCurrency(reconciliation.diffCents, currency)}`
                            : `Faltante −${formatCurrency(Math.abs(reconciliation.diffCents), currency)}`
                      }
                    />
                  </HStack>
                </VStack>

                <VStack gap={1.5}>
                  <NumberInput
                    label={`Efectivo que contaste (${currency})`}
                    value={countedCashMxn}
                    min={0}
                    onChange={setCountedCashMxn}
                  />
                  {reconciliation.expectedCents > 0 && reconciliation.diffCents !== 0 ? (
                    <HStack justify="end">
                      <Button
                        type="button"
                        label="Igualar al esperado"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setCountedCashMxn(
                            Number((reconciliation.expectedCents / 100).toFixed(2)),
                          )
                        }
                      />
                    </HStack>
                  ) : null}
                </VStack>

                <VStack gap={1}>
                  <Button
                    type="button"
                    label={
                      closeClipboard.copied
                        ? 'Resumen copiado'
                        : 'Copiar resumen del corte'
                    }
                    variant="secondary"
                    size="sm"
                    width="100%"
                    className="ad-caja-touch-btn"
                    icon={
                      closeClipboard.copied ? (
                        <Check size={14} aria-hidden="true" />
                      ) : (
                        <ClipboardCheck size={14} aria-hidden="true" />
                      )
                    }
                    onClick={handleCopyCloseSummary}
                  />
                  <Text type="supporting" color="secondary">
                    {closeClipboard.feedback ??
                      'Formato listo para pegar y enviar el cierre por WhatsApp.'}
                  </Text>
                </VStack>
              </VStack>
            </SurfaceCard>
          </VStack>
        ) : null}
      </VStack>
    </VStack>
  );
}
