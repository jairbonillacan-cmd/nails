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

function formatDeltaBadge(
  deltaPercent: number | null,
  compareLabel: string,
): { text: string; tone: 'accent' | 'warning' | 'default'; detail: string } | undefined {
  if (deltaPercent === null) return undefined;
  const arrow = deltaPercent > 0 ? '↗' : deltaPercent < 0 ? '↘' : '→';
  const sign = deltaPercent > 0 ? '+' : '';
  return {
    text: `${arrow} ${sign}${deltaPercent}%`,
    tone: deltaPercent >= 0 ? 'accent' : 'warning',
    detail: compareLabel,
  };
}

export function DashboardKpiRow({ data, metrics }: DashboardKpiRowProps) {
  const { settings } = data;
  const currency = settings.currency;
  const uncollectedCount = data.uncollectedBookings.length;
  const pendingDepositsCount = data.pendingDeposits.length;
  const canReports = roleCanAccess(data.session.user.role, 'reports');
  const { periodMetrics } = metrics;

  const revenueSeries = metrics.dailySeries.map((day) => day.revenueCents);
  const bookingsSeries = metrics.dailySeries.map((day) => day.bookingsCount);

  const revenueFallbackValue =
    periodMetrics.revenueCents > 0
      ? formatCurrency(periodMetrics.revenueCents, currency)
      : formatCurrency(0, currency);

  const bookingsSub =
    periodMetrics.period === 'today'
      ? metrics.todayBookings.length > 0
        ? `${metrics.upcomingTodayCount} por venir hoy`
        : metrics.tomorrowBookings.length > 0
          ? `${metrics.tomorrowBookings.length} para mañana`
          : 'Sin citas agendadas hoy'
      : `${periodMetrics.confirmedCount} confirmadas o completadas`;

  const items: MetricTileItem[] = [
    {
      id: 'period-revenue',
      label: periodMetrics.period === 'today' ? 'Ingresos hoy' : 'Ingresos',
      description: periodMetrics.periodLabel,
      value: revenueFallbackValue,
      sparkline: revenueSeries,
      delta: formatDeltaBadge(periodMetrics.revenueDeltaPercent, periodMetrics.compareLabel),
      sub:
        periodMetrics.revenueDeltaPercent === null
          ? 'Efectivo, tarjeta y transferencia'
          : undefined,
      tone: 'default',
    },
    {
      id: 'period-bookings',
      label: periodMetrics.period === 'today' ? 'Citas hoy' : 'Citas',
      description: periodMetrics.periodLabel,
      value: String(periodMetrics.bookingsCount),
      unitSuffix:
        periodMetrics.bookingsCount > 0
          ? `· ${periodMetrics.confirmedCount} ${periodMetrics.confirmedCount === 1 ? 'confirmada' : 'confirmadas'}`
          : undefined,
      sparkline: bookingsSeries,
      delta: formatDeltaBadge(periodMetrics.bookingsDeltaPercent, periodMetrics.compareLabel),
      sub: periodMetrics.bookingsDeltaPercent === null ? bookingsSub : undefined,
      tone: 'default',
    },
    {
      id: 'uncollected',
      label: 'Por cobrar',
      description: 'Citas terminadas sin cobro',
      value: formatCurrency(metrics.uncollectedTotalCents, currency),
      sub:
        uncollectedCount > 0
          ? `${uncollectedCount} cita${uncollectedCount === 1 ? '' : 's'} pendiente${uncollectedCount === 1 ? '' : 's'}`
          : 'Todo cobrado',
      tone: metrics.uncollectedTotalCents > 0 ? 'accent' : 'success',
    },
    {
      id: 'pending-deposits',
      label: 'Anticipos',
      description: 'Comprobantes por revisar',
      value: formatCurrency(metrics.pendingDepositsTotalCents, currency),
      sub:
        pendingDepositsCount > 0
          ? `${pendingDepositsCount} ${pendingDepositsCount === 1 ? 'comprobante' : 'comprobantes'} por revisar`
          : 'Todo revisado',
      tone: pendingDepositsCount > 0 ? 'accent' : 'success',
    },
  ];

  return (
    <MetricGrid
      ariaLabel="Resumen del periodo"
      className="ad-dash-kpis"
      items={items}
      cols={4}
      footerLink={
        canReports ? (
          <NextLink href="/admin/reportes" className="ad-inline-link-muted">
            Ver más en Reportes ›
          </NextLink>
        ) : undefined
      }
    />
  );
}
