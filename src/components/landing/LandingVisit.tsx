'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Link } from '@astryxdesign/core/Link';
import { MapPin } from 'lucide-react';
import { SectionHeading } from './LandingParts';
import { LANDING_ASSETS } from './landingContent';

interface LandingVisitProps {
  title?: string;
  hoursDays?: string;
  hoursText?: string;
  showMapEmbed?: boolean;
  address: string;
  mapsUrl: string;
  whatsappUrl: string;
  instagramUrl: string;
  instagramHandle: string;
}

function buildMapEmbedUrl(address: string): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`;
}

export function LandingVisit({
  title = 'Visítanos',
  hoursDays = 'Lunes a sábado',
  hoursText = 'De 10:00 a.m. a 6:00 p.m. · Solo con cita',
  showMapEmbed = true,
  address,
  mapsUrl,
  whatsappUrl,
  instagramUrl,
  instagramHandle,
}: LandingVisitProps) {
  const [mapLoaded, setMapLoaded] = useState(false);

  return (
    <VStack as="section" id="visitanos" aria-labelledby="visita-t" className="lk-section">
      <HStack gap={5} wrap="wrap" align="stretch" className="lk-wrap">
        <VStack
          gap={5}
          padding={6}
          className="lk-card lk-reveal"
          style={{
            flex: '1 1 20rem',
            minWidth: 0,
            maxWidth: '100%',
            borderRadius: '2rem',
            boxSizing: 'border-box',
          }}
        >
          <SectionHeading id="visita-t" title={title} align="start" />
          <VStack as="dl" gap={4} style={{ margin: 0 }}>
            <HStack gap={3} align="start">
              <dt>
                <img
                  src={LANDING_ASSETS.iconPin}
                  alt="Dirección"
                  width={26}
                  height={26}
                  loading="lazy"
                  decoding="async"
                />
              </dt>
              <VStack as="dd" gap={0.5} style={{ margin: 0, minWidth: 0 }}>
                <Text size="lg" textWrap="pretty">{address}</Text>
              </VStack>
            </HStack>
            <HStack gap={3} align="start">
              <dt>
                <img
                  src={LANDING_ASSETS.iconClock}
                  alt="Horario"
                  width={26}
                  height={26}
                  loading="lazy"
                  decoding="async"
                />
              </dt>
              <VStack as="dd" gap={0.5} style={{ margin: 0, minWidth: 0 }}>
                <Text size="lg">{hoursDays}</Text>
                <Text color="secondary" hasTabularNumbers>
                  {hoursText}
                </Text>
              </VStack>
            </HStack>
            <HStack gap={3} align="start">
              <dt>
                <img
                  src={LANDING_ASSETS.iconMessage}
                  alt="Contacto"
                  width={26}
                  height={26}
                  loading="lazy"
                  decoding="async"
                />
              </dt>
              <VStack as="dd" gap={0.5} style={{ margin: 0, minWidth: 0 }}>
                <Text size="lg">WhatsApp e Instagram</Text>
                <Link href={instagramUrl} isExternalLink>
                  {instagramHandle}
                </Link>
              </VStack>
            </HStack>
          </VStack>
          <HStack gap={2} wrap="wrap" style={{ marginTop: 'auto' }}>
            <Button
              label="Cómo llegar"
              variant="primary"
              size="lg"
              className="fx-press"
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
            />
            <Button
              label="WhatsApp"
              variant="secondary"
              size="lg"
              className="fx-press"
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
            />
          </HStack>
        </VStack>
        {showMapEmbed ? (
          <VStack className="lk-reveal-2" style={{ flex: '2 1 24rem', minWidth: 0, maxWidth: '100%' }}>
            {mapLoaded ? (
              <iframe
                className="lk-map"
                src={buildMapEmbedUrl(address)}
                title={`Mapa de ${address}`}
                sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
                referrerPolicy="no-referrer-when-downgrade"
              />
            ) : (
              <VStack
                className="lk-map-facade"
                align="center"
                justify="center"
                gap={4}
                padding={6}
              >
                <VStack className="lk-map-facade-pin" aria-hidden="true">
                  <MapPin size={26} />
                </VStack>
                <VStack gap={1.5} align="center" style={{ maxWidth: '28rem' }}>
                  <Text color="accent" className="lk-eyebrow">
                    Mapa interactivo
                  </Text>
                  <Text size="lg" weight="semibold" textWrap="balance">
                    {address}
                  </Text>
                  <Text type="supporting" color="secondary" textWrap="pretty">
                    Carga el mapa interactivo de Google aquí o ábrelo directamente en tu app de
                    mapas.
                  </Text>
                </VStack>
                <HStack gap={2} wrap="wrap" justify="center">
                  <Button
                    type="button"
                    label="Ver mapa interactivo"
                    variant="primary"
                    size="lg"
                    className="fx-press"
                    onClick={() => setMapLoaded(true)}
                  />
                  <Button
                    label="Abrir en Google Maps"
                    variant="secondary"
                    size="lg"
                    className="fx-press"
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                </HStack>
              </VStack>
            )}
          </VStack>
        ) : null}
      </HStack>
    </VStack>
  );
}
