'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';
import { formatCurrency } from '@/lib/format';
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

  const tipsValue = metrics.cash.hasTodayEntries
    ? formatCurrency(metrics.cash.todayTipsCents, currency)
    : formatCurrency(kpis.totalTipsCents, currency);
  const tipsSub = metrics.cash.hasTodayEntries ? 'Hoy' : 'Registradas';

  const items: KpiItem[] = [
    {
      id: 'today-bookings',
      label: 'Citas hoy',
      value: String(kpis.todayBookingsCount),
      sub: todaySub,
      tone: 'default',
    },
    {
      id: 'net-cash',
      label: 'Caja neta hoy',
      value: netCashValue,
      sub: netCashSub,
      tone: 'default',
    },
    {
      id: 'uncollected',
      label: 'Por cobrar',
      value: formatCurrency(metrics.uncollectedTotalCents, currency),
      sub:
        uncollectedCount > 0
          ? `${uncollectedCount} cita${uncollectedCount === 1 ? '' : 's'} terminada${uncollectedCount === 1 ? '' : 's'}`
          : 'Todo cobrado',
      tone: metrics.uncollectedTotalCents > 0 ? 'warning' : 'success',
    },
    {
      id: 'tips',
      label: 'Propinas',
      value: tipsValue,
      sub: tipsSub,
      tone: 'default',
    },
    {
      id: 'rating',
      label: 'Calificación',
      value: kpis.reviewsCount > 0 ? kpis.avgRating.toFixed(1) : '—',
      sub: `${kpis.reviewsCount} reseña${kpis.reviewsCount === 1 ? '' : 's'}`,
      tone: 'default',
    },
    {
      id: 'no-shows',
      label: 'Inasistencias',
      value: `${kpis.noShowRatePercent}%`,
      sub: 'Últimos registros',
      tone: 'default',
    },
  ];

  return (
    <section aria-label="Números de hoy" className="ad-kpis fx-stagger">
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
    </section>
  );
}
