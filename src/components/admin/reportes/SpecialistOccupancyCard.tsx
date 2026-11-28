'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Table } from '@astryxdesign/core/Table';
import { EmptyStateCard, StatusTag, SurfaceCard } from '@/components/ui';
import {
  agendaHref,
  cajaHref,
  equipoHref,
  fidelizacionHref,
  horariosHref,
} from '@/lib/admin-links';
import { formatCurrency, formatDuration } from '@/lib/format';
import type { MetricPeriod } from '@/lib/metrics';
import type { SpecialistOccupancyRow } from '@/lib/analytics/reports';

interface SpecialistOccupancyCardProps {
  rows: SpecialistOccupancyRow[];
  currency: 'MXN' | 'USD';
  isSpecialistScope: boolean;
  focusedStaffId?: string | null;
  onClearStaffFocus?: () => void;
  canViewTeam?: boolean;
  canViewLoyalty?: boolean;
  canViewCash?: boolean;
  cajaPeriod?: MetricPeriod;
}

export function SpecialistOccupancyCard({
  rows,
  currency,
  isSpecialistScope,
  focusedStaffId = null,
  onClearStaffFocus,
  canViewTeam = false,
  canViewLoyalty = false,
  canViewCash = false,
  cajaPeriod = 'month',
}: SpecialistOccupancyCardProps) {
  const focusedRow = focusedStaffId
    ? (rows.find((row) => row.staffId === focusedStaffId) ?? null)
    : null;
  const visibleRows = focusedRow ? [focusedRow] : rows;

  return (
    <SurfaceCard
      id="reports-occupancy-heading"
      title={
        isSpecialistScope
          ? 'Tu ocupación y clientas que regresan'
          : 'Ocupación del equipo'
      }
      subtitle="Qué tan llena estuvo la agenda, cuánto se cobró y cuántas clientas regresan."
      badge={
        focusedRow ? (
          <StatusTag tone="accent" label={`Filtrado: ${focusedRow.staffName}`} />
        ) : undefined
      }
      actions={
        <HStack gap={1.5} align="center" wrap="wrap">
          {focusedRow && onClearStaffFocus ? (
            <Button
              type="button"
              label="Ver todo el equipo"
              variant="secondary"
              size="sm"
              onClick={onClearStaffFocus}
            />
          ) : null}
          {canViewLoyalty && !isSpecialistScope ? (
            <Button
              label="Ver campañas"
              variant="ghost"
              size="sm"
              href={fidelizacionHref({ tab: 'campanas' })}
            />
          ) : null}
          {canViewCash ? (
            <Button
              label="Ver en Caja"
              variant="ghost"
              size="sm"
              href={cajaHref({ tab: 'resumen', period: cajaPeriod })}
            />
          ) : null}
        </HStack>
      }
    >
      {visibleRows.length === 0 ? (
        <VStack className="ad-empty" gap={2}>
          <EmptyStateCard
            framed={false}
            isCompact
            title="Sin profesionales con actividad"
            description="Configura turnos en Horarios para ver la ocupación de tu equipo."
            actions={
              <Button label="Configurar horarios" variant="secondary" size="sm" href={horariosHref()} />
            }
          />
        </VStack>
      ) : (
        <VStack className="ad-table-scroll" gap={0}>
          <Table
            idKey="staffId"
            hasHover
            data={visibleRows}
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
                      {row.roleTitle.trim() || 'Nail Artist'}
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
                        label={
                          row.noShowCount === 1
                            ? '1 no llegó'
                            : `${row.noShowCount} no llegaron`
                        }
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
              {
                key: 'staffId',
                header: 'Ir a',
                align: 'end',
                renderCell: (row) => (
                  <HStack gap={1.5} align="center" justify="end" wrap="wrap">
                    <Button
                      label="Agenda"
                      variant="ghost"
                      size="sm"
                      href={agendaHref({ staff: row.staffId })}
                    />
                    {canViewTeam && !isSpecialistScope ? (
                      <Button
                        label="Equipo"
                        variant="secondary"
                        size="sm"
                        href={equipoHref({ staffId: row.staffId })}
                      />
                    ) : null}
                  </HStack>
                ),
              },
            ]}
          />
        </VStack>
      )}
    </SurfaceCard>
  );
}
