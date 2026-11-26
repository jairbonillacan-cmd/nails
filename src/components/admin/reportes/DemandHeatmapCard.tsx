'use client';

import React from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Flame, Sparkles } from 'lucide-react';
import type { DemandHeatmap } from '@/lib/analytics/reports';

interface DemandHeatmapCardProps {
  heatmap: DemandHeatmap;
}

const LEGEND_LEVELS: ReadonlyArray<0 | 1 | 2 | 3 | 4> = [0, 1, 2, 3, 4];

export function DemandHeatmapCard({ heatmap }: DemandHeatmapCardProps) {
  return (
    <VStack
      as="section"
      className="ad-surface"
      gap={0}
      aria-labelledby="reports-heatmap-heading"
    >
      <HStack
        className="ad-section-head"
        justify="between"
        align="center"
        wrap="wrap"
        gap={3}
      >
        <VStack gap={0.5} className="rb-grow">
          <Heading level={2} id="reports-heatmap-heading" className="lk-serif ad-h2">
            Días y horas con más citas
          </Heading>
          <Text type="supporting" color="secondary">
            Cuántas citas se agendan cada día entre las 9:00 y las 20:00.
          </Text>
        </VStack>

        {heatmap.peakSlot || heatmap.quietSlot ? (
          <HStack gap={1.5} wrap="wrap" align="center">
            {heatmap.peakSlot ? (
              <HStack
                gap={1}
                align="center"
                className="ad-chip"
                data-tone="accent"
              >
                <Flame size={12} aria-hidden="true" />
                <Text color="inherit" size="sm" weight="semibold" hasTabularNumbers>
                  Más lleno: {heatmap.peakSlot.dayShort} {heatmap.peakSlot.hourLabel} (
                  {heatmap.peakSlot.count})
                </Text>
              </HStack>
            ) : null}
            {heatmap.quietSlot ? (
              <HStack
                gap={1}
                align="center"
                className="ad-chip"
                data-tone="neutral"
              >
                <Sparkles size={12} aria-hidden="true" />
                <Text color="inherit" size="sm" weight="semibold" hasTabularNumbers>
                  Más tranquilo: {heatmap.quietSlot.dayShort} {heatmap.quietSlot.hourLabel} (
                  {heatmap.quietSlot.count})
                </Text>
              </HStack>
            ) : null}
          </HStack>
        ) : null}
      </HStack>

      {heatmap.totalBookings === 0 ? (
        <VStack className="ad-empty" gap={2}>
          <EmptyState
            isCompact
            title="Todavía no hay citas en estas fechas"
            description="Cuando tengas citas confirmadas o completadas, aquí verás los días y horarios con más movimiento."
          />
        </VStack>
      ) : (
        <VStack className="ad-card-body" gap={3} paddingBlockStart={4}>
          <VStack className="ad-table-scroll" gap={0}>
            <section
              className="ad-heatmap"
              aria-label="Citas por día de la semana y hora"
            >
              <Text
                type="supporting"
                color="secondary"
                size="sm"
                weight="medium"
                aria-hidden="true"
              >
                Día
              </Text>
              {heatmap.hours.map((hour) => (
                <Text
                  key={hour}
                  type="supporting"
                  color="secondary"
                  size="sm"
                  justify="center"
                  display="block"
                  hasTabularNumbers
                >
                  {`${String(hour).padStart(2, '0')}h`}
                </Text>
              ))}

              {heatmap.days.map((day) => (
                <React.Fragment key={day.dayOfWeek}>
                  <Text
                    type="supporting"
                    color="secondary"
                    size="sm"
                    weight="semibold"
                  >
                    {day.dayShort}
                  </Text>

                  {day.cells.map((cell) => {
                    const isPeak = Boolean(
                      heatmap.peakSlot &&
                        heatmap.peakSlot.dayOfWeek === cell.dayOfWeek &&
                        heatmap.peakSlot.hour === cell.hour,
                    );
                    const countLabel =
                      cell.count === 1 ? '1 cita' : `${cell.count} citas`;
                    const ariaLabel = `${cell.dayLabel} ${cell.hourLabel}: ${countLabel}${isPeak ? ' · Horario con más citas' : ''}`;

                    return (
                      <Tooltip
                        key={`${cell.dayOfWeek}-${cell.hour}`}
                        content={ariaLabel}
                        placement="above"
                        touchTrigger="tap"
                        hasHoverIndication={false}
                      >
                        <VStack
                          as="article"
                          align="center"
                          justify="center"
                          tabIndex={0}
                          className="ad-heatmap-cell"
                          data-level={String(cell.level)}
                          data-peak={isPeak ? 'true' : undefined}
                          aria-label={ariaLabel}
                        >
                          <Text
                            color="inherit"
                            size="sm"
                            weight={cell.level >= 4 ? 'bold' : 'semibold'}
                            hasTabularNumbers
                          >
                            {cell.count > 0 ? String(cell.count) : '·'}
                          </Text>
                        </VStack>
                      </Tooltip>
                    );
                  })}
                </React.Fragment>
              ))}
            </section>
          </VStack>

          <HStack justify="between" align="center" wrap="wrap" gap={3}>
            <Text type="supporting" color="secondary" size="sm" hasTabularNumbers>
              {heatmap.totalBookings} cita{heatmap.totalBookings === 1 ? '' : 's'} en
              horario del salón · máximo {heatmap.maxCount} en una hora
            </Text>

            <HStack gap={1} align="center" aria-hidden="true">
              <Text type="supporting" color="secondary" size="sm">
                Menos
              </Text>
              {LEGEND_LEVELS.map((level) => (
                <VStack
                  key={level}
                  width="2rem"
                  align="center"
                  justify="center"
                  className="ad-heatmap-cell"
                  data-level={String(level)}
                >
                  <Text color="inherit" size="sm" hasTabularNumbers>
                    {level}
                  </Text>
                </VStack>
              ))}
              <Text type="supporting" color="secondary" size="sm">
                Más
              </Text>
            </HStack>
          </HStack>
        </VStack>
      )}
    </VStack>
  );
}
