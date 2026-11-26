'use client';

import NextLink from 'next/link';
import { formatCurrency } from '@/lib/format';
import { roleCanAccess } from '@/lib/rbac';
import { MetricGrid, type MetricTileItem } from '@/components/ui';
import type { AdminOverviewPayload } from '../AdminProvider';
import type { DashboardMetrics } from './dashboardMetrics';

interface DashboardKpiRowProps {
  data: AdminOverviewPayload;
  metrics: DashboardMetrics;
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

  const items: MetricTileItem[] = [
    {
      id: 'today-bookings',
      label: 'Citas hoy',
      value: String(kpis.todayBookingsCount),
      sub: todaySub,
      tone: 'default',
      interactive: true,
    },
    {
      id: 'collected-today',
      label: 'Cobrado hoy',
      value: netCashValue,
      sub: netCashSub,
      tone: 'default',
      interactive: true,
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
      interactive: true,
    },
  ];

  return (
    <MetricGrid
      ariaLabel="Resumen de hoy"
      items={items}
      cols={3}
      footerLink={
        canReports ? (
          <NextLink href="/admin/reportes" className="ad-inline-link-muted">
            Ver más en Reportes →
          </NextLink>
        ) : undefined
      }
    />
  );
}
