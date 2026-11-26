'use client';

import NextLink from 'next/link';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { List, ListItem } from '@astryxdesign/core/List';
import { CheckCircle2, Circle } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { roleCanAccess } from '@/lib/rbac';
import { StatusTag, SurfaceCard } from '@/components/ui';
import type { AdminOverviewPayload } from '../AdminProvider';
import type { DashboardMetrics } from './dashboardMetrics';
import { DashboardShareCard } from './DashboardShareCard';

interface DashboardRightColumnProps {
  data: AdminOverviewPayload;
  metrics: DashboardMetrics;
}

export function DashboardRightColumn({ data, metrics }: DashboardRightColumnProps) {
  const { settings, onboardingChecklist, nearRewardClients, retention } = data;
  const role = data.session.user.role;
  const currency = settings.currency;
  const canCash = roleCanAccess(role, 'cash');
  const isSpecialist = role === 'specialist';

  const checklistComplete =
    onboardingChecklist.completedCount >= onboardingChecklist.totalCount;
  const nextStep = onboardingChecklist.steps.find((step) => !step.done) ?? null;

  const maxDailyRevenue = Math.max(
    1,
    ...metrics.dailySeries.map((point) => point.revenueCents),
  );

  const cashRows = [
    {
      label: 'Efectivo',
      value: formatCurrency(metrics.cash.cashIncomeCents, currency),
    },
    {
      label: 'Tarjeta y transferencia',
      value: formatCurrency(metrics.cash.digitalIncomeCents, currency),
    },
    {
      label: 'Comisiones del equipo',
      value:
        metrics.cash.commissionsCents > 0
          ? `−${formatCurrency(metrics.cash.commissionsCents, currency)}`
          : formatCurrency(0, currency),
    },
    {
      label: 'Propinas para el equipo',
      value: formatCurrency(metrics.cash.tipsCents, currency),
    },
  ];

  return (
    <VStack className={canCash ? 'ad-dash-bottom' : 'ad-dash-bottom ad-dash-bottom-two'} gap={4}>
      {canCash ? (
        <SurfaceCard
          id="ad-caja"
          title="Caja y cobros"
          subtitle="Ingresos de los últimos 7 días"
          headingLevel={3}
          padded
          className="ad-card"
          actions={
            <NextLink href="/admin/caja" className="ad-inline-link">
              Ir a Caja ›
            </NextLink>
          }
        >
          <VStack gap={4}>
            <HStack gap={5} wrap="wrap" align="end">
              <VStack gap={0.5}>
                <Text type="supporting" color="secondary">
                  {metrics.cash.hasTodayEntries ? 'Neto hoy' : 'Registrado'}
                </Text>
                <Text className="ad-sub-figure fx-tabular" hasTabularNumbers>
                  {formatCurrency(
                    metrics.cash.hasTodayEntries
                      ? metrics.cash.todayNetCashCents
                      : data.kpis.netCashCents,
                    currency,
                  )}
                </Text>
              </VStack>
              <VStack gap={0.5}>
                <Text type="supporting" color="secondary">
                  Por cobrar
                </Text>
                <Text
                  className="ad-sub-figure fx-tabular"
                  data-tone={metrics.uncollectedTotalCents > 0 ? 'warning' : 'default'}
                  hasTabularNumbers
                >
                  {formatCurrency(metrics.uncollectedTotalCents, currency)}
                </Text>
              </VStack>
            </HStack>

            <HStack
              className="ad-mini-bars"
              align="end"
              gap={2}
              role="img"
              aria-label={`Ingresos diarios de los últimos 7 días: ${metrics.dailySeries
                .map((day) => `${day.shortLabel} ${formatCurrency(day.revenueCents, currency)}`)
                .join(', ')}`}
            >
              {metrics.dailySeries.map((day) => {
                const heightPct =
                  day.revenueCents > 0
                    ? Math.max(16, Math.round((day.revenueCents / maxDailyRevenue) * 100))
                    : 4;
                return (
                  <VStack
                    key={day.dateKey}
                    gap={1.5}
                    align="center"
                    className="ad-mini-bar-col"
                  >
                    <VStack className="ad-mini-bar-track" justify="end">
                      <Text
                        className="ad-mini-bar-fill"
                        data-current={day.isToday ? 'true' : 'false'}
                        data-empty={day.revenueCents > 0 ? 'false' : 'true'}
                        style={{ height: `${heightPct}%` }}
                        aria-hidden="true"
                      >
                        {'\u200B'}
                      </Text>
                    </VStack>
                    <Text
                      type="supporting"
                      color={day.isToday ? 'primary' : 'secondary'}
                      weight={day.isToday ? 'semibold' : 'normal'}
                      className="ad-mini-bar-label"
                    >
                      {day.shortLabel}
                    </Text>
                  </VStack>
                );
              })}
            </HStack>

            <VStack gap={2}>
              {cashRows.map((row) => (
                <HStack key={row.label} justify="between" align="center" gap={2} className="ad-kv-row">
                  <Text color="secondary" size="sm">
                    {row.label}
                  </Text>
                  <Text weight="semibold" size="sm" hasTabularNumbers>
                    {row.value}
                  </Text>
                </HStack>
              ))}
            </VStack>
          </VStack>
        </SurfaceCard>
      ) : null}

      <SurfaceCard
        id="ad-loy"
        title={!isSpecialist ? 'Equipo y fidelidad' : 'Cerca de su premio'}
        subtitle={
          !isSpecialist
            ? `${metrics.activeStaff.length} profesionales activas · ${retention.returningClientsCount} clientas frecuentes`
            : `${retention.returningClientsCount} clientas que regresan`
        }
        headingLevel={3}
        padded
        className="ad-card"
        footer={
          <>
            {roleCanAccess(role, 'clients') ? (
              <NextLink href="/admin/clientas" className="ad-inline-link">
                Ver clientas ›
              </NextLink>
            ) : null}
            {roleCanAccess(role, 'team') ? (
              <NextLink href="/admin/equipo" className="ad-inline-link-muted">
                Equipo ({metrics.activeStaff.length}) ›
              </NextLink>
            ) : null}
          </>
        }
      >
        <VStack gap={4}>
          {!checklistComplete && nextStep ? (
            <VStack gap={2} className="ad-inline-setup">
              <HStack justify="between" align="center" gap={2}>
                <Text weight="semibold" size="sm">
                  Configuración del salón
                </Text>
                <Text color="accent" weight="semibold" size="sm" hasTabularNumbers>
                  {onboardingChecklist.completedCount} / {onboardingChecklist.totalCount}
                </Text>
              </HStack>
              <ProgressBar
                label="Pasos completados"
                isLabelHidden
                value={onboardingChecklist.completedCount}
                max={onboardingChecklist.totalCount}
                variant="accent"
              />
              <HStack justify="between" align="center" gap={2} wrap="wrap">
                <Text type="supporting" color="secondary" className="rb-grow">
                  Falta: {nextStep.label}
                </Text>
                <Button label="Terminar" variant="secondary" size="sm" href={nextStep.href} />
              </HStack>
              <Collapsible
                defaultIsOpen={false}
                trigger={
                  <Text type="supporting" color="secondary" weight="semibold">
                    Ver los {onboardingChecklist.totalCount} pasos
                  </Text>
                }
              >
                <List hasDividers density="compact">
                  {onboardingChecklist.steps.map((step) => (
                    <ListItem
                      key={step.id}
                      label={step.label}
                      href={step.href}
                      startContent={
                        step.done ? (
                          <CheckCircle2 size={15} aria-hidden="true" />
                        ) : (
                          <Circle size={15} aria-hidden="true" />
                        )
                      }
                      endContent={
                        <StatusTag
                          tone={step.done ? 'success' : 'neutral'}
                          label={step.done ? 'Listo' : 'Pendiente'}
                        />
                      }
                    />
                  ))}
                </List>
              </Collapsible>
            </VStack>
          ) : null}

          {!isSpecialist && metrics.staffTodayLoad.length > 0 ? (
            <VStack gap={3}>
              <Text type="supporting" color="secondary" weight="medium" className="ad-sub-kicker">
                Citas de hoy por profesional
              </Text>
              {metrics.staffTodayLoad.map((member) => (
                <VStack key={member.id} gap={1}>
                  <HStack justify="between" align="center" gap={2}>
                    <Text size="sm" weight="medium">
                      {member.name}
                    </Text>
                    <Text size="sm" weight="semibold" hasTabularNumbers>
                      {member.todayCount}
                    </Text>
                  </HStack>
                  <HStack align="center" gap={2}>
                    <VStack className="ad-thin-track rb-grow">
                      <Text
                        className="ad-thin-fill"
                        data-accent={member.todayCount > 0 ? 'true' : 'false'}
                        style={{ width: `${Math.max(member.todayCount > 0 ? 10 : 0, member.sharePercent)}%` }}
                        aria-hidden="true"
                      >
                        {'\u200B'}
                      </Text>
                    </VStack>
                    <Text type="supporting" color="secondary" className="ad-thin-pct" hasTabularNumbers>
                      {member.sharePercent}%
                    </Text>
                  </HStack>
                </VStack>
              ))}
            </VStack>
          ) : null}

          <VStack gap={3}>
            <Text type="supporting" color="secondary" weight="medium" className="ad-sub-kicker">
              Cerca de su premio
            </Text>
            {nearRewardClients.length === 0 ? (
              <Text type="supporting" color="secondary">
                Cuando tus clientas acumulen sellos cerca del objetivo aparecerán aquí.
              </Text>
            ) : (
              nearRewardClients.slice(0, 3).map((client) => {
                const required = Math.max(1, client.summary.stampsRequired);
                const pct = Math.min(100, Math.round((client.summary.currentStamps / required) * 100));
                const content = (
                  <VStack gap={1}>
                    <HStack justify="between" align="center" gap={2} wrap="wrap">
                      <Text weight="medium" size="sm">
                        {client.fullName}
                      </Text>
                      <Text type="supporting" color="secondary" hasTabularNumbers>
                        {client.summary.currentStamps} / {required} · {client.summary.rewardLabel}
                      </Text>
                    </HStack>
                    <VStack className="ad-thin-track">
                      <Text
                        className="ad-thin-fill"
                        data-accent="true"
                        style={{ width: `${pct}%` }}
                        aria-hidden="true"
                      >
                        {'\u200B'}
                      </Text>
                    </VStack>
                  </VStack>
                );

                if (roleCanAccess(role, 'clients')) {
                  return (
                    <NextLink
                      key={client.clientId}
                      href={`/admin/clientas?q=${encodeURIComponent(client.phoneE164)}`}
                      className="ad-loyalty-link"
                    >
                      {content}
                    </NextLink>
                  );
                }

                return (
                  <VStack key={client.clientId} gap={0}>
                    {content}
                  </VStack>
                );
              })
            )}
          </VStack>
        </VStack>
      </SurfaceCard>

      <DashboardShareCard
        salonName={settings.name}
        instagramHandle={settings.instagramHandle}
        appUrl={data.integration.appUrl}
        canCustomizeBrand={roleCanAccess(role, 'brand')}
      />
    </VStack>
  );
}
