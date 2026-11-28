'use client';

import { useCallback, useState } from 'react';
import { useSearchParams } from 'next/navigation';
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
import {
  cajaHref,
  clientasHref,
  parseReportesParams,
} from '@/lib/admin-links';
import { formatCurrency, formatDateRangeDisplay } from '@/lib/format';
import {
  REPORT_PERIOD_OPTIONS,
  formatMetricPeriodLabel,
  isMetricPeriod,
  type MetricPeriod,
} from '@/lib/metrics';
import {
  ADMIN_CACHE_KEYS,
  fetchAdminJson,
  useAdminCachedQuery,
} from '@/lib/hooks/useAdminCache';
import { roleCanAccess } from '@/lib/rbac';
import type { ExecutiveReport, ReportPeriod } from '@/lib/analytics/reports';

interface AdminReportsResponse extends ExecutiveReport {
  scope: 'studio' | 'specialist';
  scopeStaffId: string | null;
  scopeStaffName: string | null;
  currency: 'MXN' | 'USD';
  timezone: string;
  generatedAt: string;
}

export default function AdminReportsPage() {
  const { data, bookingEventSeq } = useAdminData();
  const searchParams = useSearchParams();
  const parsedParams = parseReportesParams(searchParams);
  const urlSignature = `${parsedParams.period ?? ''}|${parsedParams.staff ?? ''}`;
  const [appliedUrlSignature, setAppliedUrlSignature] = useState(urlSignature);
  const [period, setPeriod] = useState<ReportPeriod>(() => parsedParams.period ?? 'month');
  const [focusedStaffId, setFocusedStaffId] = useState<string | null>(
    () => parsedParams.staff ?? null,
  );
  const [reloadTick, setReloadTick] = useState(0);

  if (urlSignature !== appliedUrlSignature) {
    setAppliedUrlSignature(urlSignature);
    if (parsedParams.period) setPeriod(parsedParams.period);
    setFocusedStaffId(parsedParams.staff ?? null);
  }

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

  const role = data.session.user.role;
  const isSpecialistScope =
    report?.scope === 'specialist' || role === 'specialist';
  const canViewCash = roleCanAccess(role, 'cash');
  const canViewClients = roleCanAccess(role, 'clients');
  const canViewTeam = roleCanAccess(role, 'team');
  const canManageServices = roleCanAccess(role, 'services');
  const cajaPeriod: MetricPeriod = isMetricPeriod(period)
    ? period
    : period === '30d'
      ? 'month'
      : 'all';
  const currency = report?.currency ?? data.settings.currency;
  const scopeSubtitle = isSpecialistScope
    ? `Tus citas y resultados${report?.scopeStaffName ? `, ${report.scopeStaffName}` : ''}.`
    : 'Cómo le va al salón.';

  const kpiCards: MetricTileItem[] = report
    ? [
        {
          id: 'revenue',
          label: 'Ingresos cobrados',
          value: formatCurrency(report.cashSummary.collectedCents, currency),
          sub: `${report.cashSummary.ticketCount} cobro${report.cashSummary.ticketCount === 1 ? '' : 's'} · ${report.summary.completedCount} completada${report.summary.completedCount === 1 ? '' : 's'}`,
          tone: 'default',
        },
        {
          id: 'avg-ticket',
          label: 'Ticket promedio',
          value:
            report.cashSummary.averageTicketCents > 0
              ? formatCurrency(report.cashSummary.averageTicketCents, currency)
              : '—',
          sub: 'Por cobro registrado',
          tone: 'default',
        },
        {
          id: 'completion-rate',
          label: 'Asistencia',
          value: `${report.summary.completionRatePercent}%`,
          sub: `${report.summary.totalBookings} cita${report.summary.totalBookings === 1 ? '' : 's'} en este período`,
          tone: report.summary.completionRatePercent >= 80 ? 'success' : 'default',
        },
        {
          id: 'noshow-rate',
          label: 'Inasistencias',
          value: `${report.summary.noShowRatePercent}%`,
          sub:
            report.summary.noShowCount === 1
              ? '1 no llegó'
              : `${report.summary.noShowCount} no llegaron`,
          tone: report.summary.noShowRatePercent >= 15 ? 'warning' : 'default',
        },
        {
          id: 'cancel-rate',
          label: 'Cancelaciones',
          value: `${report.summary.cancellationRatePercent}%`,
          sub: `${report.summary.canceledCount} cancelada${report.summary.canceledCount === 1 ? '' : 's'}`,
          tone: report.summary.cancellationRatePercent >= 20 ? 'warning' : 'default',
        },
        {
          id: 'rating-tips',
          label: 'Calificación y propinas',
          value:
            report.summary.averageRating !== null
              ? `${report.summary.averageRating.toFixed(1)} ★`
              : '—',
          sub: `${report.summary.reviewsCount} reseña${report.summary.reviewsCount === 1 ? '' : 's'} · ${formatCurrency(report.cashSummary.tipsCents, currency)} en propinas`,
          tone: 'default',
        },
      ]
    : [];

  return (
    <VStack gap={6} className="ad-page">
      <PageHeader
        eyebrow={
          report
            ? formatDateRangeDisplay(report.rangeStartDate, report.rangeEndDate)
            : formatMetricPeriodLabel(period)
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
            options={REPORT_PERIOD_OPTIONS}
            onChange={setPeriod}
          />
        }
      />

      {errorMsg ? (
        <Banner
          status="error"
          role="alert"
          collapsible={false}
          title={errorMsg}
          endContent={
            <Button
              label="Reintentar"
              variant="secondary"
              size="md"
              icon={<RefreshCw size={14} aria-hidden="true" />}
              onClick={() => setReloadTick((prev) => prev + 1)}
            />
          }
        />
      ) : null}

      {loading && !report ? (
        <PageSkeleton kpiCount={6} withSplit withHeader={false} ariaLabel="Cargando reportes" />
      ) : report ? (
        <VStack gap={5} aria-busy={loading}>
          <MetricGrid
            ariaLabel="Indicadores clave del período"
            items={kpiCards}
            cols={3}
            footerLink={
              canViewCash || (canViewClients && !isSpecialistScope) ? (
                <HStack gap={2} wrap="wrap" align="center">
                  {canViewCash ? (
                    <Button
                      label="Ver ingresos en Caja"
                      variant="secondary"
                      size="sm"
                      href={cajaHref({ tab: 'resumen', period: cajaPeriod })}
                    />
                  ) : null}
                  {canViewClients && !isSpecialistScope ? (
                    <Button
                      label="Ver retención en Clientas"
                      variant="ghost"
                      size="sm"
                      href={clientasHref({ tab: 'retencion' })}
                    />
                  ) : null}
                </HStack>
              ) : undefined
            }
          />

          <SpecialistOccupancyCard
            rows={report.specialistOccupancy}
            currency={currency}
            isSpecialistScope={isSpecialistScope}
            focusedStaffId={isSpecialistScope ? null : focusedStaffId}
            onClearStaffFocus={() => setFocusedStaffId(null)}
            canViewTeam={canViewTeam}
            canViewClients={canViewClients}
            canViewCash={canViewCash}
            cajaPeriod={cajaPeriod}
          />

          <section
            aria-label="Días con más citas y servicios más rentables"
            className="ad-split ad-split-table"
          >
            <DemandHeatmapCard heatmap={report.heatmap} />
            <ServiceProfitabilityCard
              rows={report.serviceProfitability}
              currency={currency}
              canManageServices={canManageServices}
            />
          </section>

          {!isSpecialistScope ? (
            <SurfaceCard
              id="reports-funnel-heading"
              title="Cómo reservan tus clientas"
              subtitle="De quienes abren tu página, cuántas llegan a apartar su cita."
              badge={
                <StatusTag
                  tone={report.funnel.overallConversionPercent >= 25 ? 'success' : 'accent'}
                  label={`${report.funnel.overallConversionPercent}% terminan su cita`}
                  hasTabularNumbers
                />
              }
            >
              {report.funnel.totalSessions === 0 ? (
                <VStack className="ad-empty" gap={2}>
                  <EmptyStateCard
                    framed={false}
                    isCompact
                    title="Aún nadie ha abierto tu página en estas fechas"
                    description="Cuando tus clientas entren a reservar, aquí verás en qué paso se quedan y cuántas apartan."
                  />
                </VStack>
              ) : (
                <VStack as="ul" className="ad-row-list" gap={0}>
                  {report.funnel.stages.map((stage, idx) => (
                    <VStack
                      as="li"
                      key={stage.eventType}
                      className="ad-rank-row"
                      gap={1.5}
                    >
                      <HStack justify="between" align="center" gap={2} wrap="wrap">
                        <Text weight="semibold" size="sm">
                          {stage.label}
                        </Text>
                        <Text
                          type="supporting"
                          color="secondary"
                          weight="semibold"
                          hasTabularNumbers
                        >
                          {stage.sessionsCount}{' '}
                          {stage.sessionsCount === 1 ? 'persona' : 'personas'}
                          {idx > 0 ? ` · ${stage.stepConversionPercent}% siguió` : ''}
                        </Text>
                      </HStack>
                      <VStack className="ad-bar-track" aria-hidden="true">
                        <VStack
                          className="ad-bar-fill"
                          data-tone={stage.eventType === 'booking_confirmed' ? 'success' : 'accent'}
                          style={{ width: `${Math.max(stage.sessionsCount > 0 ? 6 : 0, stage.shareOfTopPercent)}%` }}
                        />
                      </VStack>
                    </VStack>
                  ))}
                </VStack>
              )}
            </SurfaceCard>
          ) : null}

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
