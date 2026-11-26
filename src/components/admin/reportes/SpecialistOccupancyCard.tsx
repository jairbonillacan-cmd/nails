'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Table } from '@astryxdesign/core/Table';
import { EmptyStateCard, StatusTag, SurfaceCard } from '@/components/ui';
import { formatCurrency, formatDuration } from '@/lib/format';
import type { SpecialistOccupancyRow } from '@/lib/analytics/reports';

interface SpecialistOccupancyCardProps {
  rows: SpecialistOccupancyRow[];
  currency: 'MXN' | 'USD';
  isSpecialistScope: boolean;
}

export function SpecialistOccupancyCard({
  rows,
  currency,
  isSpecialistScope,
}: SpecialistOccupancyCardProps) {
  return (
    <SurfaceCard
      id="reports-occupancy-heading"
      title={
        isSpecialistScope
          ? 'Tu ocupación y clientas que regresan'
          : 'Ocupación del equipo'
      }
      subtitle="Qué tan llena estuvo la agenda, cuánto se cobró y cuántas clientas regresan."
    >
      {rows.length === 0 ? (
        <VStack className="ad-empty" gap={2}>
          <EmptyStateCard
            framed={false}
            isCompact
            title="Sin profesionales con actividad"
            description="Configura turnos en Horarios para ver la ocupación de tu equipo."
            actions={
              <Button label="Configurar horarios" variant="secondary" size="sm" href="/admin/disponibilidad" />
            }
          />
        </VStack>
      ) : (
        <VStack className="ad-table-scroll" gap={0}>
          <Table
            idKey="staffId"
            hasHover
            data={rows}
            columns={[
              {
                key: 'staffName',
                header: 'Profesional',
                renderCell: (row) => (
                  <VStack gap={0.5}>
                    <Text weight="semibold" size="sm">
                      {row.staffName}
                    </Text>
                    <Text type="supporting" color="secondary" size="sm">
                      {row.roleTitle}
                    </Text>
                  </VStack>
                ),
              },
              {
                key: 'occupancyPercent',
                header: 'Ocupación',
                renderCell: (row) => {
                  const tone =
                    row.occupancyPercent >= 70
                      ? 'success'
                      : row.availableMinutes > 0 && row.occupancyPercent < 20
                        ? 'warning'
                        : undefined;
                  const visualWidth =
                    row.bookedMinutes > 0
                      ? Math.max(4, Math.min(100, row.occupancyPercent))
                      : 0;

                  return (
                    <VStack gap={1}>
                      <HStack justify="between" align="center" gap={2}>
                        <Text weight="bold" size="sm" hasTabularNumbers textWrap="nowrap">
                          {row.occupancyPercent}%
                        </Text>
                        <Text
                          type="supporting"
                          color="secondary"
                          size="sm"
                          hasTabularNumbers
                        >
                          {formatDuration(row.bookedMinutes)} de{' '}
                          {formatDuration(row.availableMinutes)}
                        </Text>
                      </HStack>
                      <VStack className="ad-bar-track" aria-hidden="true">
                        <VStack
                          className="ad-bar-fill"
                          data-tone={tone}
                          style={{ width: `${visualWidth}%` }}
                        />
                      </VStack>
                    </VStack>
                  );
                },
              },
              {
                key: 'completedCount',
                header: 'Citas',
                align: 'end',
                renderCell: (row) => (
                  <VStack gap={0.5} align="end">
                    <Text weight="semibold" size="sm" hasTabularNumbers>
                      {row.completedCount} completada
                      {row.completedCount === 1 ? '' : 's'}
                    </Text>
                    {row.noShowCount > 0 ? (
                      <StatusTag
                        tone="warning"
                        label={`${row.noShowCount} no llegaron`}
                        hasTabularNumbers
                      />
                    ) : (
                      <Text type="supporting" color="secondary" size="sm">
                        0 inasistencias
                      </Text>
                    )}
                  </VStack>
                ),
              },
              {
                key: 'retentionPercent',
                header: 'Clientas que regresan',
                align: 'end',
                renderCell: (row) => (
                  <VStack gap={0.5} align="end">
                    <Text weight="bold" size="sm" hasTabularNumbers>
                      {row.retentionPercent}% regresan
                    </Text>
                    <Text
                      type="supporting"
                      color="secondary"
                      size="sm"
                      hasTabularNumbers
                    >
                      {row.newClientsCount} nueva{row.newClientsCount === 1 ? '' : 's'} ·{' '}
                      {row.returningClientsCount} repite{row.returningClientsCount === 1 ? '' : 'n'}
                    </Text>
                  </VStack>
                ),
              },
              {
                key: 'revenueCents',
                header: 'Cobrado',
                align: 'end',
                renderCell: (row) => (
                  <Text weight="bold" size="sm" className="fx-tabular" hasTabularNumbers>
                    {formatCurrency(row.revenueCents, currency)}
                  </Text>
                ),
              },
            ]}
          />
        </VStack>
      )}
    </SurfaceCard>
  );
}
