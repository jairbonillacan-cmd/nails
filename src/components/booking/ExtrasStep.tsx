'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Check, Plus } from 'lucide-react';
import { formatCurrency, formatDuration } from '@/lib/format';
import type { PublicServiceDTO, PublicSettingsDTO } from '@/lib/public-dto';
import type { ServiceAddon } from '@/lib/types';
import { addonIcon } from '../landing/landingContent';
import { formatServicePrice } from './bookingHelpers';

interface ServiceExtrasSectionProps {
  currency: PublicSettingsDTO['currency'];
  selectedServiceName: string | null;
  extraServices: PublicServiceDTO[];
  selectedExtraServiceIds: string[];
  compatibleAddons: ServiceAddon[];
  selectedAddonIds: string[];
  onToggleExtraService: (serviceId: string, checked: boolean) => void;
  onToggleAddon: (addonId: string, checked: boolean) => void;
}

export function ServiceExtrasSection({
  currency,
  selectedServiceName,
  extraServices,
  selectedExtraServiceIds,
  compatibleAddons,
  selectedAddonIds,
  onToggleExtraService,
  onToggleAddon,
}: ServiceExtrasSectionProps) {
  const activeAddonCount = compatibleAddons.filter((addon) =>
    selectedAddonIds.includes(addon.id),
  ).length;
  const totalSelected = activeAddonCount + selectedExtraServiceIds.length;

  if (compatibleAddons.length === 0 && extraServices.length === 0) {
    return null;
  }

  return (
    <Collapsible
      className="rb-extras"
      defaultIsOpen={totalSelected > 0}
      trigger={
        <HStack gap={3} align="center" className="rb-extras-trigger">
          <VStack className="rb-extras-plus" align="center" justify="center" aria-hidden="true">
            <Plus size={16} aria-hidden="true" />
          </VStack>
          <VStack gap={0} className="rb-grow">
            <Text weight="semibold">Extras y nail art</Text>
            <Text type="supporting" color="secondary" hasTabularNumbers>
              {totalSelected > 0
                ? `${totalSelected} ${totalSelected === 1 ? 'agregado' : 'agregados'} · opcional`
                : selectedServiceName
                  ? `Opcional para ${selectedServiceName}`
                  : 'Opcional · nail art, acabados o servicios adicionales'}
            </Text>
          </VStack>
        </HStack>
      }
    >
      <VStack gap={4} paddingBlockStart={3} paddingBlockEnd={2}>
        {compatibleAddons.length > 0 ? (
          <VStack gap={2}>
            <Heading level={3}>
              Nail art y acabados{' '}
              <Text color="secondary" weight="normal">
                · opcional
              </Text>
            </Heading>
            <ul className="rb-rows" aria-label="Extras">
              {compatibleAddons.map((addon) => {
                const isOn = selectedAddonIds.includes(addon.id);
                return (
                  <li key={addon.id}>
                    <button
                      type="button"
                      className="rb-opt rb-row fx-press"
                      aria-pressed={isOn}
                      onClick={() => onToggleAddon(addon.id, !isOn)}
                    >
                      <Text color="inherit" className="rb-check" data-on={isOn ? 'true' : 'false'} aria-hidden="true">
                        <Check size={14} />
                      </Text>
                      <img
                        src={addonIcon(addon.name)}
                        alt=""
                        width={22}
                        height={22}
                        loading="lazy"
                        decoding="async"
                      />
                      <Text className="rb-grow">{addon.name}</Text>
                      <Text
                        type="supporting"
                        color="secondary"
                        hasTabularNumbers
                        style={{ flexShrink: 0 }}
                      >
                        {addon.extraMinutes > 0
                          ? `+${formatDuration(addon.extraMinutes)} · +${formatCurrency(addon.extraPriceCents, currency)}`
                          : `+${formatCurrency(addon.extraPriceCents, currency)}`}
                      </Text>
                    </button>
                  </li>
                );
              })}
            </ul>
          </VStack>
        ) : null}

        {extraServices.length > 0 ? (
          <VStack gap={2}>
            <Heading level={3}>
              Servicios adicionales{' '}
              <Text color="secondary" weight="normal">
                · opcional
              </Text>
            </Heading>
            <ul className="rb-rows" aria-label="Servicios adicionales">
              {extraServices.map((service) => {
                const isOn = selectedExtraServiceIds.includes(service.id);
                return (
                  <li key={service.id}>
                    <button
                      type="button"
                      className="rb-opt rb-row fx-press"
                      aria-pressed={isOn}
                      onClick={() => onToggleExtraService(service.id, !isOn)}
                    >
                      <Text color="inherit" className="rb-check" data-on={isOn ? 'true' : 'false'} aria-hidden="true">
                        <Check size={14} />
                      </Text>
                      <Text className="rb-grow">{service.name}</Text>
                      <Text type="supporting" color="secondary" hasTabularNumbers>
                        {formatDuration(service.durationMinutes)} · {formatServicePrice(service.priceCents, service.isStartingPrice, currency)}
                      </Text>
                    </button>
                  </li>
                );
              })}
            </ul>
          </VStack>
        ) : null}
      </VStack>
    </Collapsible>
  );
}
