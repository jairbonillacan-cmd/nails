'use client';

import { useCallback, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import { RefreshCw } from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
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

function isReportPeriod(value: string): value is ReportPeriod {
  return value === '7d' || value === '30d' || value === '90d' || value === 'all';
}

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

  if (!data) return null;

  const isSpecialistScope =
    report?.scope === 'specialist' || data.session.user.role === 'specialist';
  const currency = report?.currency ?? data.settings.currency;
  const scopeSubtitle = isSpecialistScope
    ? `Tus citas y resultados personales${report?.scopeStaffName ? ` (${report.scopeStaffName})` : ''} · ${PERIOD_LABELS[period]}`
    : `Resumen de citas, ingresos y equipo · ${PERIOD_LABELS[period]}`;

  const kpiCards = report
    ? [
        {
          id: 'revenue',
          label: 'Ingresos cobrados',
          value: formatCurrency(report.summary.totalRevenueCollectedCents, currency),
          sub: `${report.summary.completedCount} completada${report.summary.completedCount === 1 ? '' : 's'}`,
          tone: 'default' as const,
        },
        {
          id: 'avg-ticket',
          label: 'Promedio por cita',
          value:
            report.summary.averageTicketCents > 0
              ? formatCurrency(report.summary.averageTicketCents, currency)
              : '—',
          sub: 'Por cita cobrada',
          tone: 'default' as const,
        },
        {
          id: 'completion-rate',
          label: 'Asistencia',
          value: `${report.summary.completionRatePercent}%`,
          sub: `${report.summary.totalBookings} cita${report.summary.totalBookings === 1 ? '' : 's'} en este período`,
          tone:
            report.summary.completionRatePercent >= 80
              ? ('success' as const)
              : ('default' as const),
        },
        {
          id: 'noshow-rate',
          label: 'Inasistencias',
          value: `${report.summary.noShowRatePercent}%`,
          sub: `${report.summary.noShowCount} no llegaron`,
          tone:
            report.summary.noShowRatePercent >= 15
              ? ('warning' as const)
              : ('default' as const),
        },
        {
          id: 'cancel-rate',
          label: 'Cancelaciones',
          value: `${report.summary.cancellationRatePercent}%`,
          sub: `${report.summary.canceledCount} cancelada${report.summary.canceledCount === 1 ? '' : 's'}`,
          tone:
            report.summary.cancellationRatePercent >= 20
              ? ('warning' as const)
              : ('default' as const),
        },
        {
          id: 'rating-tips',
          label: 'Calificación y propinas',
          value:
            report.summary.averageRating !== null
              ? `${report.summary.averageRating.toFixed(1)} ★`
              : '—',
          sub: `${report.summary.reviewsCount} reseña${report.summary.reviewsCount === 1 ? '' : 's'} · ${formatCurrency(report.summary.totalTipsCents, currency)} propinas`,
          tone: 'default' as const,
        },
      ]
    : [];

  return (
    <VStack gap={6} className="ad-page fx-fade-up">
      <HStack
        as="header"
        className="ad-page-head"
        justify="between"
        align="end"
        wrap="wrap"
        gap={4}
      >
        <VStack gap={1} className="ad-head-copy">
          <HStack gap={2} align="center" wrap="wrap">
            <Text type="supporting" color="secondary" weight="medium" hasTabularNumbers>
              {report
                ? `${report.rangeStartDate} — ${report.rangeEndDate}`
                : PERIOD_LABELS[period]}
            </Text>
            {isSpecialistScope ? (
              <Text color="inherit" className="ad-chip" data-tone="accent">
                Vista individual
              </Text>
            ) : null}
          </HStack>

          <Heading level={1} className="lk-serif ad-page-title">
            Reportes
          </Heading>
          <Text className="ad-page-sub">{scopeSubtitle}</Text>
        </VStack>

        <HStack gap={2} align="center" wrap="wrap">
          <SegmentedControl
            label="Período del reporte"
            size="sm"
            value={period}
            onChange={(value) => {
              if (isReportPeriod(value)) {
                setPeriod(value);
              }
            }}
          >
            <SegmentedControlItem value="7d" label="7 días" />
            <SegmentedControlItem value="30d" label="30 días" />
            <SegmentedControlItem value="90d" label="90 días" />
            <SegmentedControlItem value="all" label="Todo" />
          </SegmentedControl>
        </HStack>
      </HStack>

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
        <VStack gap={5} role="status" aria-busy="true">
          <Text className="rb-sr-only">Cargando reportes...</Text>
          <section className="ad-kpis" aria-hidden="true">
            <VStack className="ad-skeleton" data-size="kpi" />
            <VStack className="ad-skeleton" data-size="kpi" />
            <VStack className="ad-skeleton" data-size="kpi" />
            <VStack className="ad-skeleton" data-size="kpi" />
            <VStack className="ad-skeleton" data-size="kpi" />
            <VStack className="ad-skeleton" data-size="kpi" />
          </section>
          <VStack className="ad-skeleton" data-size="card" aria-hidden="true" />
          <section className="ad-split" aria-hidden="true">
            <VStack className="ad-skeleton" data-size="card" />
            <VStack className="ad-skeleton" data-size="card" />
          </section>
        </VStack>
      ) : report ? (
        <VStack gap={5} aria-busy={loading}>
          <section
            aria-label="Indicadores clave del período"
            className="ad-kpis fx-stagger"
          >
            {kpiCards.map((kpi) => (
              <VStack
                key={kpi.id}
                as="article"
                className="ad-card ad-kpi-card fx-card-lift"
                gap={1}
              >
                <Text
                  type="supporting"
                  color="secondary"
                  weight="medium"
                  className="ad-kpi-label"
                >
                  {kpi.label}
                </Text>
                <Text
                  className="lk-serif ad-kpi-val fx-tabular"
                  data-tone={kpi.tone}
                  hasTabularNumbers
                >
                  {kpi.value}
                </Text>
                <Text
                  type="supporting"
                  color="secondary"
                  className="ad-kpi-sub"
                  hasTabularNumbers
                >
                  {kpi.sub}
                </Text>
              </VStack>
            ))}
          </section>

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

          <VStack
            as="section"
            className="ad-surface"
            gap={0}
            aria-labelledby="reports-cancellations-heading"
          >
            <HStack
              className="ad-section-head"
              justify="between"
              align="center"
              wrap="wrap"
              gap={2}
            >
              <VStack gap={0.5} className="rb-grow">
                <Heading
                  level={2}
                  id="reports-cancellations-heading"
                  className="lk-serif ad-h2"
                >
                  Motivos de cancelación
                </Heading>
                <Text type="supporting" color="secondary">
                  Razones más frecuentes por las que se cancelan citas.
                </Text>
              </VStack>
              <Text
                color="inherit"
                className="ad-chip"
                data-tone={report.summary.canceledCount > 0 ? 'warning' : 'success'}
                hasTabularNumbers
              >
                {report.summary.canceledCount} cancelada
                {report.summary.canceledCount === 1 ? '' : 's'}
              </Text>
            </HStack>

            {report.cancellationReasons.length === 0 ? (
              <VStack className="ad-empty" gap={2}>
                <EmptyState
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
          </VStack>
        </VStack>
      ) : null}
    </VStack>
  );
}
