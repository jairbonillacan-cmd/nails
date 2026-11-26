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

  const checklistComplete =
    onboardingChecklist.completedCount >= onboardingChecklist.totalCount;
  const nextStep = onboardingChecklist.steps.find((step) => !step.done) ?? null;

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
    <VStack gap={5} className="ad-right-col">
      <DashboardShareCard
        salonName={settings.name}
        instagramHandle={settings.instagramHandle}
        appUrl={data.integration.appUrl}
        canCustomizeBrand={roleCanAccess(role, 'brand')}
      />

      {!checklistComplete && nextStep ? (
        <SurfaceCard
          id="ad-setup"
          title="Termina de configurar tu salón"
          headingLevel={3}
          padded
          className="ad-card ad-side-card"
          actions={
            <Text color="accent" weight="bold" size="sm" hasTabularNumbers>
              {onboardingChecklist.completedCount} de {onboardingChecklist.totalCount}
            </Text>
          }
        >
          <VStack gap={3}>
            <ProgressBar
              label="Pasos completados"
              isLabelHidden
              value={onboardingChecklist.completedCount}
              max={onboardingChecklist.totalCount}
              variant="accent"
            />
            <HStack justify="between" align="center" gap={3} wrap="wrap">
              <Text size="sm" className="rb-grow">
                <Text color="secondary" size="sm">
                  Falta:{' '}
                </Text>
                {nextStep.label}
              </Text>
              <Button label="Terminar →" variant="secondary" size="sm" href={nextStep.href} />
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
        </SurfaceCard>
      ) : null}

      {roleCanAccess(role, 'cash') ? (
        <SurfaceCard
          id="ad-caja"
          title="Corte de hoy"
          headingLevel={3}
          padded
          className="ad-card ad-side-card"
          actions={
            <NextLink href="/admin/caja" className="ad-inline-link">
              Ir a Caja →
            </NextLink>
          }
        >
          <VStack gap={2}>
            {!metrics.cash.hasTodayEntries && data.cashEntries.length > 0 ? (
              <Text type="supporting" color="secondary">
                Sin movimientos hoy · resumen registrado
              </Text>
            ) : null}
            {cashRows.map((row) => (
              <HStack key={row.label} justify="between" align="center" gap={2} className="ad-cash-row">
                <Text color="secondary" size="sm">
                  {row.label}
                </Text>
                <Text weight="semibold" size="sm" hasTabularNumbers>
                  {row.value}
                </Text>
              </HStack>
            ))}
          </VStack>
        </SurfaceCard>
      ) : null}

      <SurfaceCard
        id="ad-loy"
        title="Cerca de su premio"
        headingLevel={3}
        padded
        className="ad-card ad-side-card"
        actions={
          <Text type="supporting" color="secondary" hasTabularNumbers>
            {retention.returningClientsCount} que regresan
          </Text>
        }
        footer={
          <>
            {roleCanAccess(role, 'clients') ? (
              <NextLink href="/admin/clientas" className="ad-inline-link">
                Ver clientas →
              </NextLink>
            ) : null}
            {roleCanAccess(role, 'team') ? (
              <NextLink href="/admin/equipo" className="ad-inline-link-muted">
                Equipo ({metrics.activeStaff.length}) →
              </NextLink>
            ) : null}
          </>
        }
      >
        {nearRewardClients.length === 0 ? (
          <Text type="supporting" color="secondary">
            Cuando tus clientas acumulen sellos cerca del objetivo aparecerán aquí para recordarles
            su premio.
          </Text>
        ) : (
          <VStack gap={3}>
            {nearRewardClients.slice(0, 3).map((client) => {
              const required = Math.max(1, client.summary.stampsRequired);
              const totalSlots = Math.min(12, required);
              const filledSlots = Math.min(
                totalSlots,
                Math.round((client.summary.currentStamps / required) * totalSlots),
              );
              const progressLabel = `${client.summary.currentStamps} de ${required} · ${client.summary.rewardLabel}`;
              const content = (
                <VStack gap={1.5}>
                  <HStack justify="between" align="center" gap={2} wrap="wrap">
                    <Text weight="semibold" size="sm">
                      {client.fullName}
                    </Text>
                    <Text type="supporting" color="secondary" hasTabularNumbers>
                      {progressLabel}
                    </Text>
                  </HStack>
                  <ul className="ad-stamps" aria-hidden="true">
                    {Array.from({ length: totalSlots }, (_, idx) => (
                      <li
                        key={idx}
                        className="ad-stamp"
                        data-on={idx < filledSlots ? 'true' : 'false'}
                      />
                    ))}
                  </ul>
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
            })}
          </VStack>
        )}
      </SurfaceCard>
    </VStack>
  );
}
