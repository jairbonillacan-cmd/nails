import NextLink from 'next/link';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { WaveTop } from './LandingParts';
import { LANDING_ASSETS } from './landingContent';

interface LandingFooterProps {
  salonName: string;
  address: string;
  instagramUrl: string;
  whatsappUrl: string;
  year: string;
}

const EXPLORE_LINKS = [
  { label: 'Menú', href: '#servicios' },
  { label: 'Creaciones', href: '#galeria' },
  { label: 'Equipo', href: '#equipo' },
  { label: 'Visítanos', href: '#visitanos' },
] as const;

export function LandingFooter({ salonName, address, instagramUrl, whatsappUrl, year }: LandingFooterProps) {
  return (
    <VStack as="footer" className="lk-cereza">
      <WaveTop />
      <img className="lk-watermark" src={LANDING_ASSETS.cherriesPorcelain} alt="" width={480} height={480} style={{ right: '-4%', bottom: '-10%', width: '34%', opacity: 0.08 }} />
      <VStack gap={8} className="lk-wrap" paddingBlockStart={8} paddingBlockEnd={6} style={{ position: 'relative' }}>
        <HStack justify="between" align="end" wrap="wrap" gap={6} paddingBlockEnd={8} className="lk-reveal lk-rule-b">
          <VStack gap={3}>
            <img src={LANDING_ASSETS.logoWhite} alt={salonName} width={440} height={186} style={{ width: 'min(27.5rem, 80vw)', height: 'auto' }} />
            <img src={LANDING_ASSETS.curvePorcelain} alt="" width={200} height={40} style={{ width: '12.5rem', height: 'auto', opacity: 0.6 }} />
          </VStack>
          <HStack gap={2} wrap="wrap">
            <Button label="Agendar cita" variant="secondary" size="lg" className="lk-btn-light" href="/reservar" />
            <Button label="WhatsApp" variant="secondary" size="lg" className="lk-btn-outline" href={whatsappUrl} />
          </HStack>
        </HStack>

        <VStack className="lk-footer-grid lk-reveal-2">
          <VStack as="nav" aria-label="Pie de página" gap={0}>
            <Text color="inherit" className="lk-eyebrow lk-soft">Explora</Text>
            {EXPLORE_LINKS.map((link) => (
              <a key={link.href} className="lk-footer-link" href={link.href}>
                {link.label}
              </a>
            ))}
          </VStack>
          <VStack gap={1}>
            <Text color="inherit" className="lk-eyebrow lk-soft">Dirección</Text>
            <Text color="inherit">{address}</Text>
          </VStack>
          <VStack gap={1}>
            <Text color="inherit" className="lk-eyebrow lk-soft">Horario</Text>
            <Text color="inherit">Lunes a sábado</Text>
            <Text color="inherit">10:00 a 6:00 · Solo con cita</Text>
          </VStack>
          <VStack gap={0}>
            <Text color="inherit" className="lk-eyebrow lk-soft">Síguenos</Text>
            <a className="lk-footer-link" href={instagramUrl}>
              <img src={LANDING_ASSETS.iconInstagramLight} alt="" width={18} height={18} />
              Instagram
            </a>
            <a className="lk-footer-link" href={whatsappUrl}>
              WhatsApp
            </a>
          </VStack>
        </VStack>

        <HStack justify="between" wrap="wrap" gap={3} paddingBlockStart={5} className="lk-rule lk-soft">
          <Text type="supporting" color="inherit">© {year} {salonName}</Text>
          <HStack gap={5} wrap="wrap">
            <NextLink className="lk-footer-link" href="/aviso-de-privacidad">Aviso de privacidad</NextLink>
            <NextLink className="lk-footer-link" href="/links">Links</NextLink>
          </HStack>
        </HStack>
      </VStack>
    </VStack>
  );
}
