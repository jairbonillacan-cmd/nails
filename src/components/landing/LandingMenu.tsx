'use client';

import { useState } from 'react';
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
import { LANDING_ASSETS, NAIL_SHAPES, addonIcon, servicePhoto } from './landingContent';

const ART_TAB = 'arte-y-acabados';

interface LandingMenuProps {
  categories: ServiceCategory[];
  services: PublicServiceDTO[];
  addons: ServiceAddon[];
  currency: PublicSettingsDTO['currency'];
  depositLabel: string;
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
      <VStack gap={8} className="lk-wrap">
        <HStack justify="between" align="end" wrap="wrap" gap={5}>
          <SectionHeading id="menu-t" title="El menú" align="start" />
          <VStack className="lk-reveal-2">
            <TabList value={selected} onChange={setSelected} size="lg">
              {visibleCategories.map((category) => (
                <Tab key={category.id} value={category.id} label={category.name} />
              ))}
              {addons.length > 0 ? <Tab value={ART_TAB} label="Arte y acabados" /> : null}
            </TabList>
          </VStack>
        </HStack>

        {isArt ? (
          <VStack gap={4}>
            <Grid columns={{ minWidth: 220, max: 5 }} gap={3}>
              {addons.map((addon) => (
                <VStack key={addon.id} gap={3} padding={5} className="lk-card lk-pop">
                  <VStack className="lk-icon-chip">
                    <img src={addonIcon(addon.name)} alt="" width={30} height={30} />
                  </VStack>
                  <Heading level={3} color="inherit" className="lk-serif lk-h3">
                    {addon.name}
                  </Heading>
                  <Text type="supporting" color="secondary">
                    {addon.description}
                  </Text>
                  <HStack justify="between" gap={2} style={{ marginTop: 'auto' }}>
                    <Text weight="bold" color="accent" hasTabularNumbers>
                      +{formatCurrency(addon.extraPriceCents, currency)}
                    </Text>
                    <Text type="supporting" color="secondary">
                      +{addon.extraMinutes} min
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
                    <img src={shape.icon} alt="" width={26} height={26} />
                    <Text>{shape.name}</Text>
                  </li>
                ))}
              </HStack>
            </HStack>
          </VStack>
        ) : (
          <Grid role="list" columns={{ minWidth: 380, max: 2 }} gap={3}>
            {categoryServices.map((service) => (
              <VStack role="listitem" key={service.id} className="lk-pop">
                <a
                  href={`/reservar/${service.slug}`}
                  className="lk-card"
                  style={{ display: 'flex', gap: '1.1rem', alignItems: 'center', padding: '0.75rem', color: 'inherit', textDecoration: 'none' }}
                >
                  <img className="lk-thumb" src={servicePhoto(service.slug, service.imageUrl)} alt="" width={112} height={112} loading="lazy" />
                  <VStack gap={1} style={{ flex: '1 1 auto', minWidth: 0, paddingInlineEnd: '0.6rem' }}>
                    <HStack justify="between" align="start" gap={3}>
                      <Heading level={3} color="inherit" className="lk-serif lk-h3">
                        {service.name}
                      </Heading>
                      <Text weight="bold" color="accent" hasTabularNumbers textWrap="nowrap">
                        {formatServicePrice(service.priceCents, service.isStartingPrice, currency)}
                      </Text>
                    </HStack>
                    <Text type="supporting" color="secondary" maxLines={2}>
                      {service.description}
                    </Text>
                    <HStack gap={1.5} align="center">
                      <img src={LANDING_ASSETS.iconClock} alt="" width={16} height={16} />
                      <Text type="supporting" color="secondary">
                        {formatDuration(service.durationMinutes)}
                      </Text>
                    </HStack>
                  </VStack>
                </a>
              </VStack>
            ))}
          </Grid>
        )}

        <HStack justify="between" align="center" wrap="wrap" gap={4} className="lk-banner lk-reveal">
          <Text type="large" color="inherit">
            Todos los servicios admiten foto de inspiración · Apartas con {depositLabel}
          </Text>
          <Button label="Agendar cita" variant="secondary" size="lg" className="lk-btn-light" href="/reservar" />
        </HStack>
      </VStack>
    </VStack>
  );
}
