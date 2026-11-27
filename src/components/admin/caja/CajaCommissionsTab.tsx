'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Table, pixel, proportional } from '@astryxdesign/core/Table';
import { Token } from '@astryxdesign/core/Token';
import { Banknote, Pencil } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import {
  EmptyStateCard,
  FilterPillBar,
  StatusTag,
  SurfaceCard,
} from '@/components/ui';
import { CAJA_PERIOD_OPTIONS, type CajaPeriod } from './cajaMetrics';
import {
  splitMethodTokenColor,
  type CommissionStaffRow,
  type MethodSummaryRow,
} from './cajaTypes';

interface CajaCommissionsTabProps {
  commissionsByStaff: readonly CommissionStaffRow[];
  splitSummaryByMethod: readonly MethodSummaryRow[];
  currency: 'MXN' | 'USD';
  commissionPeriod: CajaPeriod;
  canManageCommissions: boolean;
  isSpecialistView?: boolean;
  onChangeCommissionPeriod: (period: CajaPeriod) => void;
  onEditCommissionRate: (row: CommissionStaffRow) => void;
  onRegisterPayout: (row: CommissionStaffRow) => void;
}

export function CajaCommissionsTab({
  commissionsByStaff,
  splitSummaryByMethod,
  currency,
  commissionPeriod,
  canManageCommissions,
  isSpecialistView = false,
  onChangeCommissionPeriod,
  onEditCommissionRate,
  onRegisterPayout,
}: CajaCommissionsTabProps) {
  const totalPayoutCents = commissionsByStaff.reduce(
    (sum, row) => sum + row.totalPayout,
    0,
  );
  const showAdminActions = canManageCommissions && !isSpecialistView;

  return (
    <VStack gap={4} className="fx-step-in">
      <SurfaceCard
        title={isSpecialistView ? 'Tus comisiones y propinas' : 'Comisiones y propinas'}
        subtitle={
          isSpecialistView
            ? 'Desglose de tus servicios cobrados, comisión estimada y propinas del periodo.'
            : 'Ajusta porcentajes al instante y registra el pago de comisiones en un clic.'
        }
        count={commissionsByStaff.length}
        badge={
          commissionsByStaff.length > 0 ? (
            <StatusTag
              tone="accent"
              hasTabularNumbers
              label={`Total: ${formatCurrency(totalPayoutCents, currency)}`}
            />
          ) : undefined
        }
        actions={
          <FilterPillBar
            ariaLabel="Periodo de comisiones"
            mode="segmented"
            size="sm"
            value={commissionPeriod}
            options={CAJA_PERIOD_OPTIONS}
            onChange={onChangeCommissionPeriod}
          />
        }
      >
        {commissionsByStaff.length === 0 ? (
          <VStack padding={4}>
            <EmptyStateCard
              framed={false}
              isCompact
              title="Sin movimientos para calcular"
              description="Cuando cobres citas verás aquí el desglose de comisión y propinas de cada profesional."
              actions={
                <Button label="Ir a agenda" variant="secondary" size="sm" href="/admin/citas" />
              }
            />
          </VStack>
        ) : (
          <>
            <VStack className="ad-table-scroll ad-caja-desktop-table" gap={0}>
              <Table
                idKey="id"
                hasHover
                data={[...commissionsByStaff]}
                columns={[
                  {
                    key: 'name',
                    header: 'Profesional',
                    width: proportional(1.3, { minWidth: 115 }),
                  },
                  {
                    key: 'percent',
                    header: '%',
                    width: pixel(68),
                    renderCell: (row) => (
                      <StatusTag tone="neutral" hasTabularNumbers label={`${row.percent}%`} />
                    ),
                  },
                  {
                    key: 'servicesCount',
                    header: 'Cobros',
                    width: pixel(84),
                    renderCell: (row) => <Text hasTabularNumbers>{row.servicesCount}</Text>,
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
                      <Text hasTabularNumbers>{formatCurrency(row.commission, currency)}</Text>
                    ),
                  },
                  {
                    key: 'tips',
                    header: 'Propinas',
                    align: 'end',
                    width: pixel(104),
                    renderCell: (row) => (
                      <VStack gap={0} align="end">
                        <Text hasTabularNumbers>{formatCurrency(row.tips, currency)}</Text>
                        {row.splitTipsCount > 0 ? (
                          <Text type="supporting" color="secondary" hasTabularNumbers>
                            {row.splitTipsCount} en pago combinado (
                            {formatCurrency(row.splitTipsCents, currency)})
                          </Text>
                        ) : null}
                      </VStack>
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
                  ...(showAdminActions
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
                <VStack key={row.id} className="ad-caja-mcard" gap={3}>
                  <HStack justify="between" align="center" gap={2} wrap="wrap">
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
                        Total a entregar
                      </Text>
                      <Text weight="bold" hasTabularNumbers>
                        {formatCurrency(row.totalPayout, currency)}
                      </Text>
                    </VStack>
                  </VStack>

                  {showAdminActions ? (
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
          </>
        )}
      </SurfaceCard>

      {splitSummaryByMethod.length > 0 ? (
        <SurfaceCard
          title="Propinas y cobros por forma de pago"
          subtitle="Totales recibidos en pagos divididos junto con las propinas registradas."
          headingLevel={3}
          padded
        >
          <Grid columns={{ minWidth: 160, max: 5 }} gap={3}>
            {splitSummaryByMethod.map((item) => (
              <SurfaceCard key={item.method} tone="subtle" padded>
                <VStack gap={1}>
                  <Token
                    size="sm"
                    color={splitMethodTokenColor(item.method)}
                    label={item.label}
                  />
                  <Text className="lk-serif ad-h3 fx-tabular" hasTabularNumbers>
                    {formatCurrency(item.amountCents, currency)}
                  </Text>
                  <Text type="supporting" color="secondary" hasTabularNumbers>
                    Propinas: {formatCurrency(item.tipCents, currency)}
                  </Text>
                </VStack>
              </SurfaceCard>
            ))}
          </Grid>
        </SurfaceCard>
      ) : null}
    </VStack>
  );
}
