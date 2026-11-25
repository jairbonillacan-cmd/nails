'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { SelectableCard } from '@astryxdesign/core/SelectableCard';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Badge } from '@astryxdesign/core/Badge';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Divider } from '@astryxdesign/core/Divider';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Sparkles, Users } from 'lucide-react';
import { formatCurrency, formatDuration } from '@/lib/format';
import type {
  PublicServiceDTO,
  PublicSettingsDTO,
  PublicStaffDTO,
} from '@/lib/public-dto';
import type { ServiceAddon } from '@/lib/types';
import { formatServicePrice, getStaffScheduleLabel } from './bookingHelpers';

interface ServiceStaffStepProps {
  settings: PublicSettingsDTO;
  services: PublicServiceDTO[];
  selectedService: PublicServiceDTO | undefined;
  selectedExtraServiceIds: string[];
  compatibleAddons: ServiceAddon[];
  selectedAddonIds: string[];
  eligibleStaff: PublicStaffDTO[];
  selectedStaffId: string;
  onSelectService: (serviceId: string) => void;
  onToggleExtraService: (serviceId: string, checked: boolean) => void;
  onToggleAddon: (addonId: string, checked: boolean) => void;
  onSelectStaff: (staffId: string) => void;
}

export function ServiceStaffStep({
  settings,
  services,
  selectedService,
  selectedExtraServiceIds,
  compatibleAddons,
  selectedAddonIds,
  eligibleStaff,
  selectedStaffId,
  onSelectService,
  onToggleExtraService,
  onToggleAddon,
  onSelectStaff,
}: ServiceStaffStepProps) {
  const additionalServices = services.filter((srv) => srv.id !== selectedService?.id);

  return (
    <Card padding={5}>
      <VStack gap={4}>
        <VStack gap={1}>
          <Text type="label" color="accent" weight="semibold">
            1. ELIGE TU SERVICIO, EXTRAS Y ESPECIALISTA
          </Text>
          <Heading level={2}>Personaliza tu set</Heading>
        </VStack>

        <Grid columns={{ minWidth: 220, max: 3 }} gap={3}>
          {services.map((srv) => (
            <SelectableCard
              key={srv.id}
              label={srv.name}
              isSelected={selectedService?.id === srv.id}
              padding={3}
              onChange={() => onSelectService(srv.id)}
            >
              <VStack gap={1}>
                <HStack justify="between" align="start" gap={2}>
                  <Text weight="semibold">{srv.name}</Text>
                  <Text weight="semibold" hasTabularNumbers>
                    {formatServicePrice(srv.priceCents, srv.isStartingPrice, settings.currency)}
                  </Text>
                </HStack>
                <Text type="supporting" color="secondary">
                  Aprox. {formatDuration(srv.durationMinutes)}
                  {srv.depositRequired
                    ? ` · Anticipo ${formatCurrency(srv.depositAmountCents, settings.currency)}`
                    : ''}
                </Text>
              </VStack>
            </SelectableCard>
          ))}
        </Grid>

        {additionalServices.length > 0 ? (
          <>
            <Divider />
            <VStack gap={2}>
              <HStack justify="between" align="center" wrap="wrap" gap={2}>
                <VStack gap={0.5}>
                  <Text type="label" weight="semibold">
                    Agregar servicios adicionales en esta cita
                  </Text>
                  <Text type="supporting" color="secondary">
                    Combina manos, pies o retiro en una sola visita; la agenda ajusta tu duración y horarios en vivo.
                  </Text>
                </VStack>
                {selectedExtraServiceIds.length > 0 ? (
                  <Badge variant="info" label={String(selectedExtraServiceIds.length)} />
                ) : null}
              </HStack>
              <Grid columns={{ minWidth: 240, max: 3 }} gap={2}>
                {additionalServices.map((srv) => (
                  <Card key={srv.id} variant="muted" padding={3}>
                    <CheckboxInput
                      label={`${srv.name} (${formatDuration(srv.durationMinutes)} · ${formatServicePrice(
                        srv.priceCents,
                        srv.isStartingPrice,
                        settings.currency,
                      )})`}
                      description={srv.description}
                      value={selectedExtraServiceIds.includes(srv.id)}
                      onChange={(checked) => onToggleExtraService(srv.id, checked)}
                    />
                  </Card>
                ))}
              </Grid>
            </VStack>
          </>
        ) : null}

        {compatibleAddons.length > 0 ? (
          <>
            <Divider />
            <VStack gap={2}>
              <HStack justify="between" align="center" wrap="wrap" gap={2}>
                <Text type="label" weight="semibold">
                  Extras y Nail Art opcionales (ajustan tiempo y total automáticamente)
                </Text>
                {selectedAddonIds.length > 0 ? (
                  <Badge variant="info" label={String(selectedAddonIds.length)} />
                ) : null}
              </HStack>
              <Grid columns={{ minWidth: 240, max: 3 }} gap={2}>
                {compatibleAddons.map((addon) => (
                  <Card key={addon.id} variant="muted" padding={3}>
                    <CheckboxInput
                      label={`${addon.name} (+${addon.extraMinutes} min · +${formatCurrency(
                        addon.extraPriceCents,
                        settings.currency,
                      )})`}
                      description={addon.description}
                      value={selectedAddonIds.includes(addon.id)}
                      onChange={(checked) => onToggleAddon(addon.id, checked)}
                    />
                  </Card>
                ))}
              </Grid>
            </VStack>
          </>
        ) : null}

        {eligibleStaff.length > 1 ? (
          <>
            <Divider />
            <VStack gap={2}>
              <HStack gap={1.5} align="center">
                <Users size={16} aria-hidden="true" />
                <Text type="label" weight="semibold">
                  Especialista
                </Text>
              </HStack>
              <HStack gap={2} wrap="wrap">
                <SelectableCard
                  label="Cualquier especialista disponible"
                  isSelected={selectedStaffId === 'any'}
                  padding={3}
                  onChange={() => onSelectStaff('any')}
                >
                  <HStack gap={2} align="center">
                    <Sparkles size={16} aria-hidden="true" />
                    <VStack gap={0}>
                      <Text weight="medium">Cualquier especialista</Text>
                      <Text type="supporting" color="secondary">
                        Más horarios libres
                      </Text>
                    </VStack>
                  </HStack>
                </SelectableCard>
                {eligibleStaff.map((st) => {
                  const scheduleLabel = getStaffScheduleLabel(st);
                  return (
                    <SelectableCard
                      key={st.id}
                      label={st.name}
                      isSelected={selectedStaffId === st.id}
                      padding={3}
                      onChange={() => onSelectStaff(st.id)}
                    >
                      <HStack gap={2} align="center">
                        <Avatar name={st.name} src={st.avatarUrl ?? undefined} size="sm" />
                        <VStack gap={0}>
                          <Text weight="medium">{st.name}</Text>
                          <Text type="supporting" color="secondary">
                            {scheduleLabel ?? st.roleTitle}
                          </Text>
                        </VStack>
                      </HStack>
                    </SelectableCard>
                  );
                })}
              </HStack>
            </VStack>
          </>
        ) : null}
      </VStack>
    </Card>
  );
}
