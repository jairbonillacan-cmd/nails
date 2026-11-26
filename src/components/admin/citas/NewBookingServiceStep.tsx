'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Selector } from '@astryxdesign/core/Selector';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { StatusTag, SurfaceCard } from '@/components/ui';
import type { Service, ServiceAddon } from '@/lib/types';
import { formatCurrency, formatDuration } from '@/lib/format';

export function computeCatalogSelectionTotals(
  activeServices: readonly Service[],
  addons: readonly ServiceAddon[],
  serviceId: string,
  extraServiceIds: readonly string[],
  addonIds: readonly string[],
): { durationMinutes: number; priceCents: number } {
  const base = activeServices.find((s) => s.id === serviceId) ?? null;
  const extras = activeServices.filter(
    (s) => extraServiceIds.includes(s.id) && s.id !== serviceId,
  );
  const chosenAddons = addons.filter(
    (a) =>
      a.isActive &&
      addonIds.includes(a.id) &&
      (a.appliesToAll || a.serviceIds.includes(serviceId)),
  );
  return {
    durationMinutes:
      (base?.durationMinutes ?? 60) +
      extras.reduce((sum, s) => sum + s.durationMinutes, 0) +
      chosenAddons.reduce((sum, a) => sum + a.extraMinutes, 0),
    priceCents:
      (base?.priceCents ?? 0) +
      extras.reduce((sum, s) => sum + s.priceCents, 0) +
      chosenAddons.reduce((sum, a) => sum + a.extraPriceCents, 0),
  };
}

interface NewBookingServiceStepProps {
  activeServices: Service[];
  applicableAddons: ServiceAddon[];
  effectiveServiceId: string;
  extraServiceIds: string[];
  addonIds: string[];
  activeDurationMinutes: number;
  activePriceCents: number;
  currency: 'MXN' | 'USD';
  onChangeService: (serviceId: string) => void;
  onToggleExtra: (extraId: string, checked: boolean) => void;
  onToggleAddon: (addonId: string, checked: boolean) => void;
}

export function NewBookingServiceStep({
  activeServices,
  applicableAddons,
  effectiveServiceId,
  extraServiceIds,
  addonIds,
  activeDurationMinutes,
  activePriceCents,
  currency,
  onChangeService,
  onToggleExtra,
  onToggleAddon,
}: NewBookingServiceStepProps) {
  const extrasTotalCount =
    extraServiceIds.filter((id) => id !== effectiveServiceId).length +
    applicableAddons.filter((a) => addonIds.includes(a.id)).length;

  return (
    <SurfaceCard tone="subtle" padded>
      <VStack gap={3}>
        <HStack justify="between" align="center" wrap="wrap" gap={2}>
          <Text weight="semibold" size="base">
            2. Servicio
          </Text>
          <StatusTag
            label={`${formatDuration(activeDurationMinutes)} · ${formatCurrency(
              activePriceCents,
              currency,
            )}`}
            tone="accent"
            hasTabularNumbers
          />
        </HStack>

        <Selector
          label="Servicio principal"
          value={effectiveServiceId}
          onChange={(val) => {
            if (val) onChangeService(val);
          }}
          options={activeServices.map((s) => ({
            value: s.id,
            label: `${s.name} (${formatDuration(s.durationMinutes)} · ${
              s.isStartingPrice ? 'Desde ' : ''
            }${formatCurrency(s.priceCents, currency)})`,
          }))}
        />

        {applicableAddons.length > 0 || activeServices.length > 1 ? (
          <Collapsible
            className="ad-disclosure"
            defaultIsOpen={extrasTotalCount > 0}
            trigger={
              <HStack gap={2} align="center">
                <Text weight="semibold" size="sm">
                  Agregar extra o segundo servicio (opcional)
                </Text>
                {extrasTotalCount > 0 ? (
                  <StatusTag label={`+${extrasTotalCount}`} tone="accent" hasTabularNumbers />
                ) : null}
              </HStack>
            }
          >
            <VStack gap={3} paddingBlockStart={2}>
              {applicableAddons.length > 0 ? (
                <VStack gap={1.5}>
                  <Text type="supporting" weight="semibold" color="secondary">
                    Extras y acabados
                  </Text>
                  <Grid columns={{ minWidth: 180, max: 2 }} gap={1.5}>
                    {applicableAddons.map((addon) => (
                      <CheckboxInput
                        key={addon.id}
                        size="sm"
                        label={`${addon.name} (+${formatCurrency(addon.extraPriceCents, currency)})`}
                        value={addonIds.includes(addon.id)}
                        onChange={(checked) => onToggleAddon(addon.id, checked)}
                      />
                    ))}
                  </Grid>
                </VStack>
              ) : null}

              {activeServices.length > 1 ? (
                <VStack gap={1.5}>
                  <Text type="supporting" weight="semibold" color="secondary">
                    Otro servicio en la misma visita
                  </Text>
                  <Grid columns={{ minWidth: 180, max: 2 }} gap={1.5}>
                    {activeServices
                      .filter((s) => s.id !== effectiveServiceId)
                      .map((srv) => (
                        <CheckboxInput
                          key={srv.id}
                          size="sm"
                          label={`${srv.name} (+${formatDuration(srv.durationMinutes)})`}
                          value={extraServiceIds.includes(srv.id)}
                          onChange={(checked) => onToggleExtra(srv.id, checked)}
                        />
                      ))}
                  </Grid>
                </VStack>
              ) : null}
            </VStack>
          </Collapsible>
        ) : null}
      </VStack>
    </SurfaceCard>
  );
}
