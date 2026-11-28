'use client';

import { useState } from 'react';
import Image from 'next/image';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Check } from 'lucide-react';
import { formatDuration } from '@/lib/format';
import type { PublicServiceDTO, PublicSettingsDTO } from '@/lib/public-dto';
import type { ServiceAddon, ServiceCategory } from '@/lib/types';
import { servicePhoto } from '../landing/landingContent';
import { formatServicePrice, isOptimizableLocalRasterImage } from './bookingHelpers';
import { ServiceExtrasSection } from './ExtrasStep';

interface ServiceStepProps {
  currency: PublicSettingsDTO['currency'];
  categories: ServiceCategory[];
  services: PublicServiceDTO[];
  selectedService: PublicServiceDTO | undefined;
  extraServices: PublicServiceDTO[];
  selectedExtraServiceIds: string[];
  compatibleAddons: ServiceAddon[];
  selectedAddonIds: string[];
  onSelectService: (serviceId: string) => void;
  onPrefetchService?: (serviceId: string) => void;
  onToggleExtraService: (serviceId: string, checked: boolean) => void;
  onToggleAddon: (addonId: string, checked: boolean) => void;
}

const UNCATEGORIZED = 'otros';

export function ServiceStep({
  currency,
  categories,
  services,
  selectedService,
  extraServices,
  selectedExtraServiceIds,
  compatibleAddons,
  selectedAddonIds,
  onSelectService,
  onPrefetchService,
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

  return (
    <VStack gap={5} className="fx-step-in">
      <VStack gap={0.5}>
        <Heading level={2} className="lk-serif rb-h2">
          Servicios
        </Heading>
        <Text color="secondary">
          {selectedService
            ? 'Si deseas, agrega nail art o extras abajo y pulsa Continuar.'
            : 'Elige un servicio para ver fechas y horarios disponibles.'}
        </Text>
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
          const photoSrc = servicePhoto(service.slug, service.imageUrl);
          const usesOptimizedImage = isOptimizableLocalRasterImage(photoSrc);
          const isAboveFold = index < 3;
          return (
            <li key={service.id}>
              <button
                type="button"
                className="rb-opt rb-service fx-card-lift fx-press"
                aria-pressed={isSelected}
                onMouseEnter={() => onPrefetchService?.(service.id)}
                onFocus={() => onPrefetchService?.(service.id)}
                onClick={() => onSelectService(service.id)}
              >
                {usesOptimizedImage ? (
                  <Image
                    className="rb-service-img"
                    src={photoSrc}
                    alt=""
                    width={320}
                    height={240}
                    sizes="(max-width: 47.5rem) 5.5rem, 16rem"
                    loading={isAboveFold ? 'eager' : 'lazy'}
                    fetchPriority={index === 0 ? 'high' : undefined}
                    decoding="async"
                  />
                ) : (
                  <img
                    className="rb-service-img"
                    src={photoSrc}
                    alt=""
                    width={320}
                    height={240}
                    loading={isAboveFold ? 'eager' : 'lazy'}
                    fetchPriority={index === 0 ? 'high' : undefined}
                    decoding="async"
                  />
                )}
                <VStack gap={1} className="rb-service-body">
                  <Text weight="medium" className="lk-serif rb-service-name">
                    {service.name}
                  </Text>
                  {service.description ? (
                    <Text type="supporting" color="secondary" textWrap="pretty" className="rb-service-desc">
                      {service.description}
                    </Text>
                  ) : null}
                  <HStack justify="between" gap={2} wrap="wrap" className="rb-service-meta">
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

      {selectedService ? (
        <ServiceExtrasSection
          currency={currency}
          selectedServiceName={selectedService.name}
          extraServices={extraServices}
          selectedExtraServiceIds={selectedExtraServiceIds}
          compatibleAddons={compatibleAddons}
          selectedAddonIds={selectedAddonIds}
          onToggleExtraService={onToggleExtraService}
          onToggleAddon={onToggleAddon}
        />
      ) : null}
    </VStack>
  );
}
