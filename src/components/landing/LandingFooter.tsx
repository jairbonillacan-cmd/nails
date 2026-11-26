import NextLink from 'next/link';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import type { ResolvedLandingSections } from '@/lib/landing-config';
import { WaveTop } from './LandingParts';
import { LANDING_ASSETS } from './landingContent';

interface LandingFooterProps {
  salonName: string;
  customLogoUrl?: string | null;
  hoursDays?: string;
  hoursText?: string;
  sections?: ResolvedLandingSections;
  address: string;
  mapsUrl: string;
  instagramUrl: string;
  whatsappUrl: string;
  year: string;
}

const EXPLORE_LINKS = [
  { label: 'Menú', href: '#servicios', key: 'showMenu' as const },
  { label: 'Creaciones', href: '#galeria', key: 'showCreations' as const },
  { label: 'Equipo', href: '#equipo', key: 'showTeam' as const },
  { label: 'Preguntas', href: '#preguntas', key: 'showFaq' as const },
  { label: 'Visítanos', href: '#visitanos', key: 'showVisit' as const },
] as const;

export function LandingFooter({
  salonName,
  customLogoUrl = null,
  hoursDays = 'Lunes a sábado',
  hoursText = '10:00 a 18:00 · Solo con cita',
  sections,
  address,
  mapsUrl,
  instagramUrl,
  whatsappUrl,
  year,
}: LandingFooterProps) {
  const visibleExploreLinks = EXPLORE_LINKS.filter((link) =>
    sections ? sections[link.key] : true,
  );
  return (
    <VStack as="footer" className="lk-cereza">
      <WaveTop />
      <img
        className="lk-watermark"
        src={LANDING_ASSETS.cherriesPorcelain}
        alt=""
        aria-hidden="true"
        width={488}
        height={572}
        loading="lazy"
        decoding="async"
        style={{ right: '-4%', bottom: '-10%', width: '34%', opacity: 0.08 }}
      />
      <VStack gap={8} className="lk-wrap" paddingBlockStart={8} paddingBlockEnd={6} style={{ position: 'relative' }}>
        <HStack justify="between" align="end" wrap="wrap" gap={6} paddingBlockEnd={8} className="lk-reveal lk-rule-b">
          <VStack gap={3}>
            <img
              src={customLogoUrl || LANDING_ASSETS.logoFullWhite}
              alt={salonName}
              width={440}
              height={186}
              loading="lazy"
              decoding="async"
              style={{ width: 'min(27.5rem, 80vw)', maxHeight: '7.5rem', objectFit: 'contain', height: 'auto' }}
            />
            <img
              src={LANDING_ASSETS.curvePorcelain}
              alt=""
              aria-hidden="true"
              width={200}
              height={55}
              loading="lazy"
              decoding="async"
              style={{ width: '12.5rem', height: 'auto', opacity: 0.6 }}
            />
          </VStack>
          <HStack gap={2} wrap="wrap">
            <Button label="Agendar cita" variant="secondary" size="lg" className="lk-btn-light fx-press" href="/reservar" />
            <Button
              label="WhatsApp"
              variant="secondary"
              size="lg"
              className="lk-btn-outline fx-press"
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
            />
          </HStack>
        </HStack>

        <VStack className="lk-footer-grid lk-reveal-2">
          <VStack as="nav" aria-label="Pie de página" gap={0}>
            <Text color="inherit" className="lk-eyebrow lk-soft">Explora</Text>
            {visibleExploreLinks.map((link) => (
              <a key={link.href} className="lk-footer-link" href={link.href}>
                {link.label}
              </a>
            ))}
          </VStack>
          <VStack gap={1}>
            <Text color="inherit" className="lk-eyebrow lk-soft">Dirección</Text>
            <Text color="inherit" textWrap="pretty">{address}</Text>
            <a className="lk-footer-link" href={mapsUrl} target="_blank" rel="noopener noreferrer">
              Google Maps →
            </a>
          </VStack>
          <VStack gap={1}>
            <Text color="inherit" className="lk-eyebrow lk-soft">Horario</Text>
            <Text color="inherit">{hoursDays}</Text>
            <Text color="inherit" hasTabularNumbers>{hoursText}</Text>
          </VStack>
          <VStack gap={0}>
            <Text color="inherit" className="lk-eyebrow lk-soft">Síguenos</Text>
            <a className="lk-footer-link" href={instagramUrl} target="_blank" rel="noopener noreferrer">
              <img
                src={LANDING_ASSETS.iconInstagramLight}
                alt=""
                aria-hidden="true"
                width={18}
                height={18}
                loading="lazy"
                decoding="async"
              />
              Instagram
            </a>
            <a className="lk-footer-link" href={whatsappUrl} target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
          </VStack>
        </VStack>

        <HStack justify="between" wrap="wrap" gap={3} paddingBlockStart={5} className="lk-rule lk-soft">
          <Text type="supporting" color="inherit">© {year} {salonName}</Text>
          <HStack gap={5} wrap="wrap">
            <NextLink className="lk-footer-link" href="/mis-citas">Mis citas</NextLink>
            <NextLink className="lk-footer-link" href="/aviso-de-privacidad">Aviso de privacidad</NextLink>
            <NextLink className="lk-footer-link" href="/links">Links</NextLink>
          </HStack>
        </HStack>
      </VStack>
    </VStack>
  );
}
