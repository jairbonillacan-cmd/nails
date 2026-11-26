'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Check } from 'lucide-react';
import { formatCurrency, formatDuration } from '@/lib/format';
import type { PublicServiceDTO, PublicSettingsDTO } from '@/lib/public-dto';
import type { ServiceAddon } from '@/lib/types';
import { addonIcon } from '../landing/landingContent';
import { formatServicePrice } from './bookingHelpers';

interface ExtrasStepProps {
  currency: PublicSettingsDTO['currency'];
  selectedServiceName: string | null;
  extraServices: PublicServiceDTO[];
  selectedExtraServiceIds: string[];
  compatibleAddons: ServiceAddon[];
  selectedAddonIds: string[];
  onToggleExtraService: (serviceId: string, checked: boolean) => void;
  onToggleAddon: (addonId: string, checked: boolean) => void;
}

export function ExtrasStep({
  currency,
  selectedServiceName,
  extraServices,
  selectedExtraServiceIds,
  compatibleAddons,
  selectedAddonIds,
  onToggleExtraService,
  onToggleAddon,
}: ExtrasStepProps) {
  const extraCount = selectedExtraServiceIds.length;

  return (
    <VStack gap={5} className="fx-step-in">
      <VStack gap={0.5}>
        <Heading level={2} className="lk-serif rb-h2">
          Suma nail art o extras
        </Heading>
        <Text color="secondary">
          {selectedServiceName
            ? `Opcional para ${selectedServiceName}. Si no necesitas nada adicional, toca Continuar.`
            : 'Opcional. Si no necesitas nada adicional, toca Continuar.'}
        </Text>
      </VStack>

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
        <Collapsible
          className="rb-fold"
          defaultIsOpen={extraCount > 0}
          trigger={
            <HStack justify="between" align="center" gap={2} width="100%" style={{ minHeight: '2.75rem' }}>
              <Text weight="semibold">¿Algo más en la misma visita?</Text>
              <Text type="supporting" color="secondary" hasTabularNumbers>
                {extraCount > 0 ? 'Agregado' : 'Opcional · elige uno'}
              </Text>
            </HStack>
          }
        >
          <ul className="rb-rows rb-fold-body" aria-label="Servicios adicionales">
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
        </Collapsible>
      ) : null}
    </VStack>
  );
}
