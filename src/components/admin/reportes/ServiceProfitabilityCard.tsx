'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { formatCurrency, formatDuration } from '@/lib/format';
import type { ServiceProfitabilityRow } from '@/lib/analytics/reports';

interface ServiceProfitabilityCardProps {
  rows: ServiceProfitabilityRow[];
  currency: 'MXN' | 'USD';
}

export function ServiceProfitabilityCard({
  rows,
  currency,
}: ServiceProfitabilityCardProps) {
  const maxRate = rows.reduce(
    (highest, row) => Math.max(highest, row.revenuePerMinuteCents),
    1,
  );

  return (
    <VStack
      as="section"
      className="ad-surface"
      gap={0}
      aria-labelledby="reports-profitability-heading"
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
            id="reports-profitability-heading"
            className="lk-serif ad-h2"
          >
            Servicios más rentables
          </Heading>
          <Text type="supporting" color="secondary">
            Cuánto genera cada servicio por minuto trabajado, de mayor a menor.
          </Text>
        </VStack>
      </HStack>

      {rows.length === 0 ? (
        <VStack className="ad-empty" gap={2}>
          <EmptyState
            isCompact
            title="Sin servicios en estas fechas"
            description="Cuando completes citas, aquí verás qué servicios te dejan más por minuto."
          />
        </VStack>
      ) : (
        <VStack as="ol" className="ad-row-list" gap={0}>
          {rows.map((row, index) => {
            const fillPct = Math.max(
              6,
              Math.min(100, Math.round((row.revenuePerMinuteCents / maxRate) * 100)),
            );
            const barTone = index === 0 ? 'success' : undefined;

            return (
              <VStack
                as="li"
                key={row.serviceId}
                className="ad-rank-row"
                gap={1.5}
              >
                <HStack justify="between" align="center" gap={2} wrap="wrap">
                  <HStack gap={1.5} align="center" className="rb-grow">
                    <Text
                      type="supporting"
                      color="secondary"
                      weight="bold"
                      hasTabularNumbers
                    >
                      #{index + 1}
                    </Text>
                    <Text weight="semibold" size="sm">
                      {row.serviceName}
                    </Text>
                  </HStack>

                  <Text
                    weight="bold"
                    size="sm"
                    color={index === 0 ? 'accent' : 'primary'}
                    className="fx-tabular"
                    hasTabularNumbers
                  >
                    {formatCurrency(row.revenuePerMinuteCents, currency)} / min
                  </Text>
                </HStack>

                <VStack className="ad-bar-track" aria-hidden="true">
                  <VStack
                    className="ad-bar-fill"
                    data-tone={barTone}
                    style={{ width: `${fillPct}%` }}
                  />
                </VStack>

                <HStack justify="between" align="center" gap={2} wrap="wrap">
                  <Text
                    type="supporting"
                    color="secondary"
                    size="sm"
                    hasTabularNumbers
                  >
                    {row.bookingsCount} cita{row.bookingsCount === 1 ? '' : 's'} ·{' '}
                    {formatDuration(row.totalMinutes)}
                  </Text>
                  <Text
                    type="supporting"
                    color="secondary"
                    size="sm"
                    hasTabularNumbers
                  >
                    Total: {formatCurrency(row.revenueCents, currency)}
                  </Text>
                </HStack>
              </VStack>
            );
          })}
        </VStack>
      )}
    </VStack>
  );
}
