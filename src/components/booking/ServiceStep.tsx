'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Check } from 'lucide-react';
import { formatCurrency, formatDuration } from '@/lib/format';
import type { PublicServiceDTO, PublicSettingsDTO } from '@/lib/public-dto';
import type { ServiceAddon, ServiceCategory } from '@/lib/types';
import { addonIcon, servicePhoto } from '../landing/landingContent';
import { formatServicePrice } from './bookingHelpers';

interface ServiceStepProps {
  currency: PublicSettingsDTO['currency'];
  categories: ServiceCategory[];
  services: PublicServiceDTO[];
  selectedService: PublicServiceDTO | undefined;
  selectedExtraServiceIds: string[];
  compatibleAddons: ServiceAddon[];
  selectedAddonIds: string[];
  onSelectService: (serviceId: string) => void;
  onToggleExtraService: (serviceId: string, checked: boolean) => void;
  onToggleAddon: (addonId: string, checked: boolean) => void;
}

const UNCATEGORIZED = 'otros';

export function ServiceStep({
  currency,
  categories,
  services,
  selectedService,
  selectedExtraServiceIds,
  compatibleAddons,
  selectedAddonIds,
  onSelectService,
  onToggleExtraService,
  onToggleAddon,
}: ServiceStepProps) {
  const tabs = categories
    .filter((category) => services.some((service) => service.categoryId === category.id))
    .map((category) => ({ id: category.id, label: category.name }));
  if (services.some((service) => !service.categoryId || !categories.some((c) => c.id === service.categoryId))) {
    tabs.push({ id: UNCATEGORIZED, label: 'Otros' });
  }
  const categoryOf = (service: PublicServiceDTO): string =>
    service.categoryId && categories.some((c) => c.id === service.categoryId) ? service.categoryId : UNCATEGORIZED;

  const [activeTab, setActiveTab] = useState<string>(
    selectedService ? categoryOf(selectedService) : (tabs[0]?.id ?? UNCATEGORIZED),
  );
  const visibleServices = tabs.length > 1 ? services.filter((service) => categoryOf(service) === activeTab) : services;
  const extraServices = services.filter((service) => service.id !== selectedService?.id);
  const extraCount = selectedExtraServiceIds.length;

  return (
    <VStack gap={5} className="fx-step-in">
      <VStack gap={0.5}>
        <Heading level={2} className="lk-serif rb-h2">
          ¿Qué te hacemos?
        </Heading>
        <Text color="secondary">Elige tu servicio. El tiempo y el total se calculan solos.</Text>
      </VStack>

      {tabs.length > 1 ? (
        <HStack gap={1} role="tablist" aria-label="Categorías" className="rb-scroll" data-fade="true">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              className="rb-pill fx-press"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </HStack>
      ) : null}

      <ul key={activeTab} className="rb-services fx-step-in fx-stagger" aria-label="Servicios">
        {visibleServices.map((service, index) => {
          const isSelected = service.id === selectedService?.id;
          return (
            <li key={service.id}>
              <button
                type="button"
                className="rb-opt rb-service fx-card-lift fx-press"
                aria-pressed={isSelected}
                onClick={() => onSelectService(service.id)}
              >
                <img
                  className="rb-service-img"
                  src={servicePhoto(service.slug, service.imageUrl)}
                  alt=""
                  width={240}
                  height={180}
                  loading={index < 3 ? 'eager' : 'lazy'}
                  fetchPriority={index < 3 ? 'high' : undefined}
                  decoding="async"
                />
                <VStack gap={0} className="rb-service-body">
                  <Text weight="medium" className="lk-serif rb-service-name">
                    {service.name}
                  </Text>
                  <HStack justify="between" gap={2} wrap="wrap">
                    <Text type="supporting" color="secondary" hasTabularNumbers>
                      {formatDuration(service.durationMinutes)}
                    </Text>
                    <Text weight="bold" color="accent" hasTabularNumbers>
                      {formatServicePrice(service.priceCents, service.isStartingPrice, currency)}
                    </Text>
                  </HStack>
                </VStack>
                <Text color="inherit" className="rb-check rb-check-round" data-on={isSelected ? 'true' : 'false'} aria-hidden="true">
                  <Check size={16} />
                </Text>
              </button>
            </li>
          );
        })}
      </ul>

      {compatibleAddons.length > 0 ? (
        <VStack gap={2}>
          <Heading level={3}>
            Suma nail art o extras{' '}
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
                    <Text type="supporting" color="secondary" hasTabularNumbers>
                      +{formatCurrency(addon.extraPriceCents, currency)}
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
                {extraCount > 0 ? `${extraCount} agregado${extraCount > 1 ? 's' : ''}` : 'Opcional'}
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
