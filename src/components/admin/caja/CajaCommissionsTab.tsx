'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Table } from '@astryxdesign/core/Table';
import { Token } from '@astryxdesign/core/Token';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { formatCurrency } from '@/lib/format';
import {
  splitMethodTokenColor,
  type CommissionStaffRow,
  type MethodSummaryRow,
} from './cajaTypes';

interface CajaCommissionsTabProps {
  commissionsByStaff: readonly CommissionStaffRow[];
  splitSummaryByMethod: readonly MethodSummaryRow[];
  currency: 'MXN' | 'USD';
}

export function CajaCommissionsTab({
  commissionsByStaff,
  splitSummaryByMethod,
  currency,
}: CajaCommissionsTabProps) {
  return (
    <VStack gap={4} className="fx-step-in">
      <VStack className="ad-surface" gap={0}>
        <HStack className="ad-section-head" justify="between" align="center" wrap="wrap" gap={2}>
          <VStack gap={0.5} className="rb-grow">
            <Heading level={2} className="lk-serif ad-h2">
              Comisiones y propinas
            </Heading>
            <Text type="supporting" color="secondary">
              Lo que le corresponde a cada manicurista según sus servicios cobrados y propinas.
            </Text>
          </VStack>
          <Text color="inherit" className="ad-chip" data-tone="neutral" hasTabularNumbers>
            {commissionsByStaff.length}{' '}
            {commissionsByStaff.length === 1 ? 'manicurista' : 'manicuristas'}
          </Text>
        </HStack>

        {commissionsByStaff.length === 0 ? (
          <VStack className="ad-empty" gap={2}>
            <EmptyState
              isCompact
              title="Sin movimientos para calcular"
              description="Cuando cobres citas verás aquí el desglose de comisión y propinas de cada manicurista."
            />
          </VStack>
        ) : (
          <VStack className="ad-table-scroll" gap={0}>
            <Table
              idKey="id"
              hasHover
              data={[...commissionsByStaff]}
              columns={[
                { key: 'name', header: 'Manicurista' },
                {
                  key: 'percent',
                  header: '% Comisión',
                  renderCell: (row) => (
                    <Text color="inherit" className="ad-chip" data-tone="neutral" hasTabularNumbers>
                      {row.percent}%
                    </Text>
                  ),
                },
                {
                  key: 'servicesCount',
                  header: 'Servicios',
                  renderCell: (row) => <Text hasTabularNumbers>{row.servicesCount}</Text>,
                },
                {
                  key: 'sales',
                  header: 'Ventas',
                  align: 'end',
                  renderCell: (row) => (
                    <Text hasTabularNumbers>{formatCurrency(row.sales, currency)}</Text>
                  ),
                },
                {
                  key: 'commission',
                  header: 'Comisión',
                  align: 'end',
                  renderCell: (row) => (
                    <Text hasTabularNumbers>{formatCurrency(row.commission, currency)}</Text>
                  ),
                },
                {
                  key: 'tips',
                  header: 'Propinas',
                  align: 'end',
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
                  header: 'Total a entregar',
                  align: 'end',
                  renderCell: (row) => (
                    <Text weight="bold" hasTabularNumbers>
                      {formatCurrency(row.totalPayout, currency)}
                    </Text>
                  ),
                },
              ]}
            />
          </VStack>
        )}
      </VStack>

      {splitSummaryByMethod.length > 0 ? (
        <VStack className="ad-surface" data-padded="true" gap={3}>
          <VStack gap={0.5}>
            <Heading level={3} className="lk-serif ad-h3">
              Propinas y cobros por forma de pago
            </Heading>
            <Text type="supporting" color="secondary">
              Totales recibidos en cada forma de pago junto con las propinas registradas.
            </Text>
          </VStack>
          <Grid columns={{ minWidth: 160, max: 5 }} gap={3}>
            {splitSummaryByMethod.map((item) => (
              <VStack
                key={item.method}
                className="ad-surface"
                data-tone="subtle"
                data-padded="true"
                gap={1}
              >
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
            ))}
          </Grid>
        </VStack>
      ) : null}
    </VStack>
  );
}
