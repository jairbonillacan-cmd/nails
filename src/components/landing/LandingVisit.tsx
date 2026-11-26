import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Link } from '@astryxdesign/core/Link';
import { SectionHeading } from './LandingParts';
import { LANDING_ASSETS } from './landingContent';

interface LandingVisitProps {
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
  address,
  mapsUrl,
  whatsappUrl,
  instagramUrl,
  instagramHandle,
}: LandingVisitProps) {
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
          <SectionHeading id="visita-t" title="Visítanos" align="start" />
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
                <Text size="lg">Lunes a sábado</Text>
                <Text color="secondary" hasTabularNumbers>
                  Citas de 10:00 a 6:00 · Solo con cita
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
        <VStack className="lk-reveal-2" style={{ flex: '2 1 24rem', minWidth: 0, maxWidth: '100%' }}>
          <iframe
            className="lk-map"
            src={buildMapEmbedUrl(address)}
            title={`Mapa de ${address}`}
            loading="lazy"
            sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </VStack>
      </HStack>
    </VStack>
  );
}
