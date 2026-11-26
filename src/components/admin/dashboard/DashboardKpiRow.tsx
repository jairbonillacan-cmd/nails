'use client';

import NextLink from 'next/link';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { formatCurrency } from '@/lib/format';
import { roleCanAccess } from '@/lib/rbac';
import type { AdminOverviewPayload } from '../AdminProvider';
import type { DashboardMetrics } from './dashboardMetrics';

interface DashboardKpiRowProps {
  data: AdminOverviewPayload;
  metrics: DashboardMetrics;
}

interface KpiItem {
  id: string;
  label: string;
  value: string;
  sub: string;
  tone: 'default' | 'warning' | 'success';
}

export function DashboardKpiRow({ data, metrics }: DashboardKpiRowProps) {
  const { kpis, settings } = data;
  const currency = settings.currency;
  const uncollectedCount = data.uncollectedBookings.length;
  const canReports = roleCanAccess(data.session.user.role, 'reports');

  const todaySub =
    metrics.todayBookings.length > 0
      ? `${metrics.upcomingTodayCount} por venir`
      : metrics.tomorrowBookings.length > 0
        ? `${metrics.tomorrowBookings.length} para mañana`
        : `${kpis.pendingConfirmationsCount} por confirmar`;

  const netCashValue = metrics.cash.hasTodayEntries
    ? formatCurrency(metrics.cash.todayNetCashCents, currency)
    : formatCurrency(kpis.netCashCents, currency);
  const netCashSub = metrics.cash.hasTodayEntries
    ? 'Efectivo, tarjeta y transferencia'
    : 'Total registrado · $0 hoy';

  const items: KpiItem[] = [
    {
      id: 'today-bookings',
      label: 'Citas hoy',
      value: String(kpis.todayBookingsCount),
      sub: todaySub,
      tone: 'default',
    },
    {
      id: 'collected-today',
      label: 'Cobrado hoy',
      value: netCashValue,
      sub: netCashSub,
      tone: 'default',
    },
    {
      id: 'uncollected',
      label: 'Falta cobrar',
      value: formatCurrency(metrics.uncollectedTotalCents, currency),
      sub:
        uncollectedCount > 0
          ? `${uncollectedCount} cita${uncollectedCount === 1 ? '' : 's'} terminada${uncollectedCount === 1 ? '' : 's'}`
          : 'Todo cobrado',
      tone: metrics.uncollectedTotalCents > 0 ? 'warning' : 'success',
    },
  ];

  return (
    <VStack as="section" aria-label="Resumen de hoy" gap={2}>
      <VStack className="ad-kpis-3 fx-stagger" gap={0}>
        {items.map((kpi) => (
          <VStack key={kpi.id} as="article" className="ad-card ad-kpi-card fx-card-lift" gap={1}>
            <Text type="supporting" color="secondary" weight="medium" className="ad-kpi-label">
              {kpi.label}
            </Text>
            <Text
              className="lk-serif ad-kpi-val fx-tabular"
              data-tone={kpi.tone}
              hasTabularNumbers
            >
              {kpi.value}
            </Text>
            <Text type="supporting" color="secondary" className="ad-kpi-sub">
              {kpi.sub}
            </Text>
          </VStack>
        ))}
      </VStack>
      {canReports ? (
        <HStack justify="end">
          <NextLink href="/admin/reportes" className="ad-inline-link-muted">
            Ver más en Reportes →
          </NextLink>
        </HStack>
      ) : null}
    </VStack>
  );
}
