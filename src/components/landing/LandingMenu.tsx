'use client';

import { useState } from 'react';
import Image from 'next/image';
import NextLink from 'next/link';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import type { ServiceAddon, ServiceCategory } from '@/lib/types';
import type { PublicServiceDTO, PublicSettingsDTO } from '@/lib/public-dto';
import { formatCurrency, formatDuration } from '@/lib/format';
import { formatServicePrice } from '../booking/bookingHelpers';
import { SectionHeading } from './LandingParts';
import {
  LANDING_ASSETS,
  NAIL_SHAPES,
  addonIcon,
  isOptimizableLocalRasterImage,
  servicePhoto,
} from './landingContent';

const ART_TAB = 'arte-y-acabados';

interface LandingMenuProps {
  categories: ServiceCategory[];
  services: PublicServiceDTO[];
  addons: ServiceAddon[];
  currency: PublicSettingsDTO['currency'];
  depositLabel: string | null;
}

export function LandingMenu({ categories, services, addons, currency, depositLabel }: LandingMenuProps) {
  const visibleCategories = categories.filter((category) =>
    services.some((service) => service.categoryId === category.id),
  );
  const [selected, setSelected] = useState<string>(visibleCategories[0]?.id ?? ART_TAB);
  const isArt = selected === ART_TAB;
  const categoryServices = services.filter((service) => service.categoryId === selected);

  return (
    <VStack as="section" id="servicios" aria-labelledby="menu-t" className="lk-section">
      <VStack gap={6} className="lk-wrap">
        <HStack justify="between" align="end" wrap="wrap" gap={4}>
          <SectionHeading id="menu-t" title="El menú" align="start" />
          <VStack className="lk-reveal-2" style={{ maxWidth: '100%', minWidth: 0 }}>
            <TabList value={selected} onChange={setSelected} size="lg">
              {visibleCategories.map((category) => (
                <Tab key={category.id} value={category.id} label={category.name} />
              ))}
              {addons.length > 0 ? <Tab value={ART_TAB} label="Arte y acabados" /> : null}
            </TabList>
          </VStack>
        </HStack>

        {isArt ? (
          <VStack key={selected} gap={4} className="fx-step-in">
            <Grid columns={{ minWidth: 220, max: 5 }} gap={3} className="fx-stagger">
              {addons.map((addon) => (
                <VStack key={addon.id} gap={3} padding={5} className="lk-card fx-card-lift">
                  <VStack className="lk-icon-chip">
                    <img
                      src={addonIcon(addon.name)}
                      alt=""
                      aria-hidden="true"
                      width={30}
                      height={30}
                      loading="lazy"
                      decoding="async"
                    />
                  </VStack>
                  <Heading level={3} color="inherit" className="lk-serif lk-h3" textWrap="balance">
                    {addon.name}
                  </Heading>
                  <Text type="supporting" color="secondary" textWrap="pretty">
                    {addon.description}
                  </Text>
                  <HStack justify="between" align="center" gap={2} style={{ marginTop: 'auto' }}>
                    <Text weight="bold" color="accent" hasTabularNumbers>
                      +{formatCurrency(addon.extraPriceCents, currency)}
                    </Text>
                    <Text type="supporting" color="secondary" hasTabularNumbers>
                      +{formatDuration(addon.extraMinutes)}
                    </Text>
                  </HStack>
                </VStack>
              ))}
            </Grid>
            <HStack justify="between" align="center" wrap="wrap" gap={4} padding={5} className="lk-card">
              <Heading level={3} color="inherit" className="lk-serif lk-h3">
                Formas
              </Heading>
              <HStack as="ul" gap={2} wrap="wrap" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {NAIL_SHAPES.map((shape) => (
                  <li key={shape.name} className="lk-chip">
                    <img
                      src={shape.icon}
                      alt=""
                      aria-hidden="true"
                      width={26}
                      height={26}
                      loading="lazy"
                      decoding="async"
                    />
                    <Text>{shape.name}</Text>
                  </li>
                ))}
              </HStack>
            </HStack>
          </VStack>
        ) : (
          <VStack key={selected} className="fx-step-in" width="100%">
            <Grid role="list" columns={{ minWidth: 280, max: 2 }} gap={3} className="fx-stagger">
              {categoryServices.map((service) => {
                const photoSrc = servicePhoto(service.slug, service.imageUrl);
                return (
                  <VStack role="listitem" key={service.id}>
                    <NextLink
                      href={`/reservar/${service.slug}`}
                      className="lk-card fx-card-lift fx-press"
                      style={{
                        display: 'flex',
                        gap: '1rem',
                        alignItems: 'center',
                        padding: '0.75rem',
                        color: 'inherit',
                        textDecoration: 'none',
                        minWidth: 0,
                        width: '100%',
                        boxSizing: 'border-box',
                      }}
                    >
                      {isOptimizableLocalRasterImage(photoSrc) ? (
                        <Image
                          className="lk-thumb"
                          src={photoSrc}
                          alt={`Ejemplo de ${service.name} en LAIKONA NAILS Puebla`}
                          width={112}
                          height={112}
                          sizes="(max-width: 47.5rem) 5.5rem, 7.5rem"
                          loading="lazy"
                          decoding="async"
                          style={{ background: 'var(--lk-tinte)' }}
                        />
                      ) : (
                        <img
                          className="lk-thumb"
                          src={photoSrc}
                          alt={`Ejemplo de ${service.name} en LAIKONA NAILS Puebla`}
                          width={112}
                          height={112}
                          loading="lazy"
                          decoding="async"
                          style={{ background: 'var(--lk-tinte)' }}
                        />
                      )}
                      <VStack gap={1} style={{ flex: '1 1 auto', minWidth: 0, paddingInlineEnd: '0.35rem' }}>
                        <HStack justify="between" align="start" wrap="wrap" gap={1.5}>
                          <Heading
                            level={3}
                            color="inherit"
                            className="lk-serif lk-h3"
                            textWrap="balance"
                          >
                            {service.name}
                          </Heading>
                          <Text weight="bold" color="accent" hasTabularNumbers textWrap="nowrap">
                            {formatServicePrice(service.priceCents, service.isStartingPrice, currency)}
                          </Text>
                        </HStack>
                        <Text type="supporting" color="secondary" maxLines={2} textWrap="pretty">
                          {service.description}
                        </Text>
                        <HStack justify="between" align="center" gap={2} wrap="wrap">
                          <HStack gap={1.5} align="center">
                            <img
                              src={LANDING_ASSETS.iconClock}
                              alt=""
                              aria-hidden="true"
                              width={16}
                              height={16}
                              loading="lazy"
                              decoding="async"
                            />
                            <Text type="supporting" color="secondary" hasTabularNumbers>
                              {formatDuration(service.durationMinutes)}
                            </Text>
                          </HStack>
                          <Text type="supporting" weight="semibold" color="accent" aria-hidden="true">
                            Reservar →
                          </Text>
                        </HStack>
                      </VStack>
                    </NextLink>
                  </VStack>
                );
              })}
            </Grid>
          </VStack>
        )}

        <HStack justify="between" align="center" wrap="wrap" gap={4} className="lk-banner lk-reveal">
          <Text type="large" color="inherit" textWrap="pretty">
            {depositLabel
              ? `Trae tu foto de inspiración · Apartas tu lugar con ${depositLabel}`
              : 'Trae tu foto de inspiración · Agenda tu cita en menos de un minuto'}
          </Text>
          <Button label="Agendar cita" variant="secondary" size="lg" className="lk-btn-light fx-press" href="/reservar" />
        </HStack>
      </VStack>
    </VStack>
  );
}
