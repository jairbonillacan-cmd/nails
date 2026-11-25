import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { SectionHeading } from './LandingParts';
import { LANDING_ASSETS } from './landingContent';

interface LandingVisitProps {
  address: string;
  mapsUrl: string;
  whatsappUrl: string;
  instagramHandle: string;
}

function buildMapEmbedUrl(address: string): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`;
}

export function LandingVisit({ address, mapsUrl, whatsappUrl, instagramHandle }: LandingVisitProps) {
  const rows = [
    { icon: LANDING_ASSETS.iconPin, label: 'Dirección', title: address, detail: null },
    { icon: LANDING_ASSETS.iconClock, label: 'Horario', title: 'Lunes a sábado', detail: 'Citas de 10:00 a 6:00' },
    { icon: LANDING_ASSETS.iconMessage, label: 'Contacto', title: 'WhatsApp e Instagram', detail: instagramHandle },
  ];
  return (
    <VStack as="section" id="visitanos" aria-labelledby="visita-t" className="lk-section">
      <HStack gap={5} wrap="wrap" align="stretch" className="lk-wrap">
        <VStack gap={6} padding={8} className="lk-card lk-reveal" style={{ flex: '1 1 22rem', borderRadius: '2rem' }}>
          <SectionHeading id="visita-t" title="Visítanos" align="start" />
          <VStack as="dl" gap={5} style={{ margin: 0 }}>
            {rows.map((row) => (
              <HStack key={row.label} gap={3} align="start">
                <dt>
                  <img src={row.icon} alt={row.label} width={26} height={26} />
                </dt>
                <VStack as="dd" gap={0.5} style={{ margin: 0 }}>
                  <Text size="lg">{row.title}</Text>
                  {row.detail ? <Text color="secondary">{row.detail}</Text> : null}
                </VStack>
              </HStack>
            ))}
          </VStack>
          <HStack gap={2} wrap="wrap" style={{ marginTop: 'auto' }}>
            <Button label="Cómo llegar" variant="primary" size="lg" href={mapsUrl} />
            <Button label="WhatsApp" variant="secondary" size="lg" href={whatsappUrl} />
          </HStack>
        </VStack>
        <VStack className="lk-reveal-2" style={{ flex: '2 1 32rem' }}>
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
