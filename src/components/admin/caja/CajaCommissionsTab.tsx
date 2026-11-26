'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Table } from '@astryxdesign/core/Table';
import { Token } from '@astryxdesign/core/Token';
import { formatCurrency } from '@/lib/format';
import { EmptyStateCard, StatusTag, SurfaceCard } from '@/components/ui';
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
      <SurfaceCard
        title="Comisiones y propinas"
        subtitle="Lo que le corresponde a cada manicurista según sus servicios cobrados y propinas."
        count={commissionsByStaff.length}
      >
        {commissionsByStaff.length === 0 ? (
          <VStack padding={4}>
            <EmptyStateCard
              framed={false}
              isCompact
              title="Sin movimientos para calcular"
              description="Cuando cobres citas verás aquí el desglose de comisión y propinas de cada manicurista."
              actions={<Button label="Ir a agenda" variant="secondary" size="sm" href="/admin/citas" />}
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
                    <StatusTag tone="neutral" hasTabularNumbers label={`${row.percent}%`} />
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
      </SurfaceCard>

      {splitSummaryByMethod.length > 0 ? (
        <SurfaceCard
          title="Propinas y cobros por forma de pago"
          subtitle="Totales recibidos en cada forma de pago junto con las propinas registradas."
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
