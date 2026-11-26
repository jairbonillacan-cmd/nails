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
import type { ServiceCategory } from '@/lib/types';
import { servicePhoto } from '../landing/landingContent';
import { formatServicePrice, isOptimizableLocalRasterImage } from './bookingHelpers';

interface ServiceStepProps {
  currency: PublicSettingsDTO['currency'];
  categories: ServiceCategory[];
  services: PublicServiceDTO[];
  selectedService: PublicServiceDTO | undefined;
  onSelectService: (serviceId: string) => void;
  onPrefetchService?: (serviceId: string) => void;
}

const UNCATEGORIZED = 'otros';

export function ServiceStep({
  currency,
  categories,
  services,
  selectedService,
  onSelectService,
  onPrefetchService,
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
          ¿Qué te hacemos?
        </Heading>
        <Text color="secondary">Elige tu servicio principal. En el siguiente paso puedes sumar nail art o extras.</Text>
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
    </VStack>
  );
}
