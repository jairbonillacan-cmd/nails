'use client';

import { useCallback, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { RefreshCw } from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import {
  EmptyStateCard,
  FilterPillBar,
  MetricGrid,
  PageHeader,
  PageSkeleton,
  StatusTag,
  SurfaceCard,
  type MetricTileItem,
} from '@/components/ui';
import { DemandHeatmapCard } from '@/components/admin/reportes/DemandHeatmapCard';
import { ServiceProfitabilityCard } from '@/components/admin/reportes/ServiceProfitabilityCard';
import { SpecialistOccupancyCard } from '@/components/admin/reportes/SpecialistOccupancyCard';
import { formatCurrency } from '@/lib/format';
import {
  ADMIN_CACHE_KEYS,
  fetchAdminJson,
  useAdminCachedQuery,
} from '@/lib/hooks/useAdminCache';
import type { ExecutiveReport, ReportPeriod } from '@/lib/analytics/reports';

interface AdminReportsResponse extends ExecutiveReport {
  scope: 'studio' | 'specialist';
  scopeStaffId: string | null;
  scopeStaffName: string | null;
  currency: 'MXN' | 'USD';
  timezone: string;
  generatedAt: string;
}

const PERIOD_LABELS: Record<ReportPeriod, string> = {
  '7d': 'Últimos 7 días',
  '30d': 'Últimos 30 días',
  '90d': 'Últimos 90 días',
  all: 'Todo el historial',
};

const PERIOD_OPTIONS = [
  { value: '7d' as const, label: '7 días' },
  { value: '30d' as const, label: '30 días' },
  { value: '90d' as const, label: '90 días' },
  { value: 'all' as const, label: 'Todo' },
];

export default function AdminReportsPage() {
  const { data, bookingEventSeq } = useAdminData();
  const [period, setPeriod] = useState<ReportPeriod>('30d');
  const [reloadTick, setReloadTick] = useState(0);

  const reportUrl = ADMIN_CACHE_KEYS.reports(period);
  const fetchReport = useCallback(
    (signal: AbortSignal) => fetchAdminJson<AdminReportsResponse>(reportUrl, signal),
    [reportUrl],
  );

  const reportQuery = useAdminCachedQuery<AdminReportsResponse>(
    data ? reportUrl : null,
    fetchReport,
    {
      enabled: Boolean(data),
      staleTimeMs: 10_000,
      revalidateKey: `${bookingEventSeq}:${reloadTick}`,
    },
  );

  const report = reportQuery.data ?? null;
  const loading = reportQuery.isLoading || reportQuery.isValidating;
  const errorMsg = reportQuery.error ? reportQuery.error.message : null;

  if (!data) {
    return <PageSkeleton kpiCount={6} withSplit ariaLabel="Cargando reportes" />;
  }

  const isSpecialistScope =
    report?.scope === 'specialist' || data.session.user.role === 'specialist';
  const currency = report?.currency ?? data.settings.currency;
  const scopeSubtitle = isSpecialistScope
    ? `Tus citas y resultados personales${report?.scopeStaffName ? ` (${report.scopeStaffName})` : ''} · ${PERIOD_LABELS[period]}`
    : `Resumen de citas, ingresos y equipo · ${PERIOD_LABELS[period]}`;

  const kpiCards: MetricTileItem[] = report
    ? [
        {
          id: 'revenue',
          label: 'Ingresos cobrados',
          value: formatCurrency(report.summary.totalRevenueCollectedCents, currency),
          sub: `${report.summary.completedCount} completada${report.summary.completedCount === 1 ? '' : 's'}`,
          tone: 'default',
          interactive: true,
        },
        {
          id: 'avg-ticket',
          label: 'Promedio por cita',
          value:
            report.summary.averageTicketCents > 0
              ? formatCurrency(report.summary.averageTicketCents, currency)
              : '—',
          sub: 'Por cita cobrada',
          tone: 'default',
          interactive: true,
        },
        {
          id: 'completion-rate',
          label: 'Asistencia',
          value: `${report.summary.completionRatePercent}%`,
          sub: `${report.summary.totalBookings} cita${report.summary.totalBookings === 1 ? '' : 's'} en este período`,
          tone: report.summary.completionRatePercent >= 80 ? 'success' : 'default',
          interactive: true,
        },
        {
          id: 'noshow-rate',
          label: 'Inasistencias',
          value: `${report.summary.noShowRatePercent}%`,
          sub: `${report.summary.noShowCount} no llegaron`,
          tone: report.summary.noShowRatePercent >= 15 ? 'warning' : 'default',
          interactive: true,
        },
        {
          id: 'cancel-rate',
          label: 'Cancelaciones',
          value: `${report.summary.cancellationRatePercent}%`,
          sub: `${report.summary.canceledCount} cancelada${report.summary.canceledCount === 1 ? '' : 's'}`,
          tone: report.summary.cancellationRatePercent >= 20 ? 'warning' : 'default',
          interactive: true,
        },
        {
          id: 'rating-tips',
          label: 'Calificación y propinas',
          value:
            report.summary.averageRating !== null
              ? `${report.summary.averageRating.toFixed(1)} ★`
              : '—',
          sub: `${report.summary.reviewsCount} reseña${report.summary.reviewsCount === 1 ? '' : 's'} · ${formatCurrency(report.summary.totalTipsCents, currency)} propinas`,
          tone: 'default',
          interactive: true,
        },
      ]
    : [];

  return (
    <VStack gap={6} className="ad-page fx-fade-up">
      <PageHeader
        eyebrow={
          report ? `${report.rangeStartDate} — ${report.rangeEndDate}` : PERIOD_LABELS[period]
        }
        meta={
          isSpecialistScope ? <StatusTag tone="accent" label="Vista individual" /> : undefined
        }
        title="Reportes"
        subtitle={scopeSubtitle}
        actions={
          <FilterPillBar
            ariaLabel="Período del reporte"
            mode="segmented"
            size="md"
            value={period}
            options={PERIOD_OPTIONS}
            onChange={setPeriod}
          />
        }
      />

      {errorMsg ? (
        <Banner
          status="error"
          title={errorMsg}
          endContent={
            <Button
              label="Reintentar"
              variant="secondary"
              size="sm"
              icon={<RefreshCw size={14} aria-hidden="true" />}
              onClick={() => setReloadTick((prev) => prev + 1)}
            />
          }
        />
      ) : null}

      {loading && !report ? (
        <PageSkeleton kpiCount={6} withSplit ariaLabel="Cargando reportes" />
      ) : report ? (
        <VStack gap={5} aria-busy={loading}>
          <MetricGrid
            ariaLabel="Indicadores clave del período"
            items={kpiCards}
            cols={3}
          />

          <SpecialistOccupancyCard
            rows={report.specialistOccupancy}
            currency={currency}
            isSpecialistScope={isSpecialistScope}
          />

          <section
            aria-label="Días con más citas y servicios más rentables"
            className="ad-split"
          >
            <DemandHeatmapCard heatmap={report.heatmap} />
            <ServiceProfitabilityCard
              rows={report.serviceProfitability}
              currency={currency}
            />
          </section>

          <SurfaceCard
            id="reports-cancellations-heading"
            title="Motivos de cancelación"
            subtitle="Razones más frecuentes por las que se cancelan citas."
            badge={
              <StatusTag
                tone={report.summary.canceledCount > 0 ? 'warning' : 'success'}
                label={`${report.summary.canceledCount} cancelada${report.summary.canceledCount === 1 ? '' : 's'}`}
                hasTabularNumbers
              />
            }
          >
            {report.cancellationReasons.length === 0 ? (
              <VStack className="ad-empty" gap={2}>
                <EmptyStateCard
                  framed={false}
                  isCompact
                  title="Sin cancelaciones en este período"
                  description="No hubo citas canceladas en estas fechas."
                />
              </VStack>
            ) : (
              <VStack as="ul" className="ad-row-list" gap={0}>
                {report.cancellationReasons.map((item) => (
                  <VStack
                    as="li"
                    key={item.reason}
                    className="ad-rank-row"
                    gap={1.5}
                  >
                    <HStack justify="between" align="center" gap={2} wrap="wrap">
                      <Text weight="semibold" size="sm">
                        {item.reason}
                      </Text>
                      <Text
                        type="supporting"
                        color="secondary"
                        weight="semibold"
                        hasTabularNumbers
                      >
                        {item.count} ({item.sharePercent}%)
                      </Text>
                    </HStack>
                    <VStack className="ad-bar-track" aria-hidden="true">
                      <VStack
                        className="ad-bar-fill"
                        data-tone="warning"
                        style={{ width: `${Math.max(6, item.sharePercent)}%` }}
                      />
                    </VStack>
                  </VStack>
                ))}
              </VStack>
            )}
          </SurfaceCard>
        </VStack>
      ) : null}
    </VStack>
  );
}
