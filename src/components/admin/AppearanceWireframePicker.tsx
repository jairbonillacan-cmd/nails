'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { SelectableCard } from '@astryxdesign/core/SelectableCard';
import { Text } from '@astryxdesign/core/Text';
import { Calendar, Columns3, Grid2x2 } from 'lucide-react';
import type { BookingLayoutView } from '@/lib/types';

export interface AppearanceWireframePickerProps {
  bookingLayout: BookingLayoutView;
  onBookingLayoutChange: (layout: BookingLayoutView) => void;
}

export function AppearanceWireframePicker({
  bookingLayout,
  onBookingLayoutChange,
}: AppearanceWireframePickerProps) {
  return (
    <VStack gap={4}>
      <VStack gap={2}>
        <Text type="label" weight="semibold">
          Vista predeterminada de agenda
        </Text>
        <Grid columns={{ minWidth: 220, max: 3 }} gap={3}>
          <SelectableCard
            label="Vista Mes de 3 columnas"
            padding={3}
            isSelected={bookingLayout === 'month'}
            onChange={() => onBookingLayoutChange('month')}
          >
            <VStack gap={2}>
              <Card padding={2} variant="muted">
                <Grid columns={3} gap={1}>
                  <Card padding={1} variant="default">
                    <Text type="supporting" color="secondary" justify="center" display="block" maxLines={1}>
                      Info
                    </Text>
                  </Card>
                  <Card padding={1} variant="default">
                    <Text type="supporting" color="secondary" justify="center" display="block" maxLines={1}>
                      Mes
                    </Text>
                  </Card>
                  <Card padding={1} variant="default">
                    <Text type="supporting" color="secondary" justify="center" display="block" maxLines={1}>
                      Horas
                    </Text>
                  </Card>
                </Grid>
              </Card>
              <HStack gap={1.5} align="center">
                <Calendar size={14} aria-hidden="true" />
                <Text weight="semibold" size="sm">
                  Mes (3 columnas)
                </Text>
              </HStack>
              <Text type="supporting" color="secondary">
                Resumen, calendario mensual y bloques fijos.
              </Text>
            </VStack>
          </SelectableCard>

          <SelectableCard
            label="Vista Semana"
            padding={3}
            isSelected={bookingLayout === 'week'}
            onChange={() => onBookingLayoutChange('week')}
          >
            <VStack gap={2}>
              <Card padding={2} variant="muted">
                <Grid columns={4} gap={1}>
                  <Card padding={1} variant="default">
                    <Text type="supporting" color="secondary" justify="center" display="block" maxLines={1}>
                      Lun
                    </Text>
                  </Card>
                  <Card padding={1} variant="default">
                    <Text type="supporting" color="secondary" justify="center" display="block" maxLines={1}>
                      Mar
                    </Text>
                  </Card>
                  <Card padding={1} variant="default">
                    <Text type="supporting" color="secondary" justify="center" display="block" maxLines={1}>
                      Mié
                    </Text>
                  </Card>
                  <Card padding={1} variant="default">
                    <Text type="supporting" color="secondary" justify="center" display="block" maxLines={1}>
                      Jue
                    </Text>
                  </Card>
                </Grid>
              </Card>
              <HStack gap={1.5} align="center">
                <Grid2x2 size={14} aria-hidden="true" />
                <Text weight="semibold" size="sm">
                  Semana
                </Text>
              </HStack>
              <Text type="supporting" color="secondary">
                Compara los 7 días de un vistazo.
              </Text>
            </VStack>
          </SelectableCard>

          <SelectableCard
            label="Vista Columnas"
            padding={3}
            isSelected={bookingLayout === 'column'}
            onChange={() => onBookingLayoutChange('column')}
          >
            <VStack gap={2}>
              <Card padding={2} variant="muted">
                <Grid columns={3} gap={1}>
                  <Card padding={1} variant="default">
                    <Text type="supporting" color="secondary" justify="center" display="block" maxLines={1}>
                      Karla
                    </Text>
                  </Card>
                  <Card padding={1} variant="default">
                    <Text type="supporting" color="secondary" justify="center" display="block" maxLines={1}>
                      Paty
                    </Text>
                  </Card>
                  <Card padding={1} variant="default">
                    <Text type="supporting" color="secondary" justify="center" display="block" maxLines={1}>
                      Tere
                    </Text>
                  </Card>
                </Grid>
              </Card>
              <HStack gap={1.5} align="center">
                <Columns3 size={14} aria-hidden="true" />
                <Text weight="semibold" size="sm">
                  Columnas
                </Text>
              </HStack>
              <Text type="supporting" color="secondary">
                Horarios continuos por día en columnas.
              </Text>
            </VStack>
          </SelectableCard>
        </Grid>
      </VStack>
    </VStack>
  );
}
