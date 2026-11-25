'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { SelectableCard } from '@astryxdesign/core/SelectableCard';
import { Text } from '@astryxdesign/core/Text';
import { Divider } from '@astryxdesign/core/Divider';
import { Token } from '@astryxdesign/core/Token';
import { Calendar, Columns3, Grid2x2, Monitor, Moon, Sun } from 'lucide-react';
import type { BookingLayoutView, ThemeModePreference } from '@/lib/types';

export interface AppearanceWireframePickerProps {
  publicMode: ThemeModePreference;
  onPublicModeChange: (mode: ThemeModePreference) => void;
  bookingLayout: BookingLayoutView;
  onBookingLayoutChange: (layout: BookingLayoutView) => void;
}

export function AppearanceWireframePicker({
  publicMode,
  onPublicModeChange,
  bookingLayout,
  onBookingLayoutChange,
}: AppearanceWireframePickerProps) {
  return (
    <VStack gap={4}>
      <VStack gap={2}>
        <Text type="label" weight="semibold">
          Tema público predeterminado
        </Text>
        <Grid columns={{ minWidth: 160, max: 3 }} gap={3}>
          <SelectableCard
            label="Tema claro Porcelana"
            padding={3}
            isSelected={publicMode === 'light'}
            onChange={() => onPublicModeChange('light')}
          >
            <VStack gap={2}>
              <Card padding={2} variant="default" elevation="low">
                <VStack gap={1.5}>
                  <HStack justify="between" align="center">
                    <Token size="sm" color="pink" label="LAIKONA" />
                    <Token size="sm" color="default" label="10:00" />
                  </HStack>
                  <Divider />
                  <Grid columns={2} gap={1}>
                    <Card padding={1} variant="muted">
                      <Text type="supporting" color="secondary">
                        Rubber
                      </Text>
                    </Card>
                    <Card padding={1} variant="muted">
                      <Text type="supporting" color="secondary">
                        Softgel
                      </Text>
                    </Card>
                  </Grid>
                </VStack>
              </Card>
              <HStack gap={1.5} align="center">
                <Sun size={14} aria-hidden="true" />
                <Text weight="semibold" size="sm">
                  Claro (Porcelana)
                </Text>
              </HStack>
              <Text type="supporting" color="secondary">
                Editorial luminoso para fotos de uñas.
              </Text>
            </VStack>
          </SelectableCard>

          <SelectableCard
            label="Tema oscuro Obsidiana"
            padding={3}
            isSelected={publicMode === 'dark'}
            onChange={() => onPublicModeChange('dark')}
          >
            <VStack gap={2}>
              <Card padding={2} variant="gray" elevation="low">
                <VStack gap={1.5}>
                  <HStack justify="between" align="center">
                    <Token size="sm" color="purple" label="LAIKONA" />
                    <Token size="sm" color="gray" label="13:30" />
                  </HStack>
                  <Divider />
                  <Grid columns={2} gap={1}>
                    <Card padding={1} variant="default">
                      <Text type="supporting" color="secondary">
                        Rubber
                      </Text>
                    </Card>
                    <Card padding={1} variant="default">
                      <Text type="supporting" color="secondary">
                        Softgel
                      </Text>
                    </Card>
                  </Grid>
                </VStack>
              </Card>
              <HStack gap={1.5} align="center">
                <Moon size={14} aria-hidden="true" />
                <Text weight="semibold" size="sm">
                  Oscuro (Obsidiana)
                </Text>
              </HStack>
              <Text type="supporting" color="secondary">
                Contraste nocturno elegante en modo oscuro.
              </Text>
            </VStack>
          </SelectableCard>

          <SelectableCard
            label="Tema automático del sistema"
            padding={3}
            isSelected={publicMode === 'system'}
            onChange={() => onPublicModeChange('system')}
          >
            <VStack gap={2}>
              <Card padding={2} variant="muted" elevation="low">
                <VStack gap={1.5}>
                  <HStack justify="between" align="center">
                    <Token size="sm" color="blue" label="Auto" />
                    <Token size="sm" color="default" label="16:30" />
                  </HStack>
                  <Divider />
                  <Grid columns={2} gap={1}>
                    <Card padding={1} variant="default">
                      <Text type="supporting" color="secondary">
                        Día
                      </Text>
                    </Card>
                    <Card padding={1} variant="gray">
                      <Text type="supporting" color="secondary">
                        Noche
                      </Text>
                    </Card>
                  </Grid>
                </VStack>
              </Card>
              <HStack gap={1.5} align="center">
                <Monitor size={14} aria-hidden="true" />
                <Text weight="semibold" size="sm">
                  Sistema
                </Text>
              </HStack>
              <Text type="supporting" color="secondary">
                Adapta la agenda al tema del teléfono.
              </Text>
            </VStack>
          </SelectableCard>
        </Grid>
      </VStack>

      <VStack gap={2}>
        <Text type="label" weight="semibold">
          Vista predeterminada de agenda
        </Text>
        <Grid columns={{ minWidth: 160, max: 3 }} gap={3}>
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
                    <Text type="supporting" color="secondary">
                      Info
                    </Text>
                  </Card>
                  <Card padding={1} variant="default">
                    <Text type="supporting" color="secondary">
                      Mes
                    </Text>
                  </Card>
                  <Card padding={1} variant="default">
                    <Text type="supporting" color="secondary">
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
                    <Text type="supporting" color="secondary">
                      Lun
                    </Text>
                  </Card>
                  <Card padding={1} variant="default">
                    <Text type="supporting" color="secondary">
                      Mar
                    </Text>
                  </Card>
                  <Card padding={1} variant="default">
                    <Text type="supporting" color="secondary">
                      Mié
                    </Text>
                  </Card>
                  <Card padding={1} variant="default">
                    <Text type="supporting" color="secondary">
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
                    <Text type="supporting" color="secondary">
                      Karla
                    </Text>
                  </Card>
                  <Card padding={1} variant="default">
                    <Text type="supporting" color="secondary">
                      Paty
                    </Text>
                  </Card>
                  <Card padding={1} variant="default">
                    <Text type="supporting" color="secondary">
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
