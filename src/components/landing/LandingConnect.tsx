import Image from 'next/image';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { INSTAGRAM_PHOTOS, LANDING_ASSETS } from './landingContent';

interface LandingConnectProps {
  instagramUrl: string;
  instagramHandle: string;
}

export function LandingConnect({ instagramUrl, instagramHandle }: LandingConnectProps) {
  const [leftTop, leftBottom] = INSTAGRAM_PHOTOS.left;
  const [rightTop, rightBottom] = INSTAGRAM_PHOTOS.right;
  return (
    <VStack as="section" aria-labelledby="ig-t" className="lk-section">
      <VStack gap={6} align="center" className="lk-wrap">
        <VStack gap={2} align="center">
          <img
            className="lk-pop"
            src={LANDING_ASSETS.cherriesCereza}
            alt=""
            aria-hidden="true"
            width={52}
            height={61}
            loading="lazy"
            decoding="async"
          />
          <VStack className="lk-cereza-text">
            <Heading level={2} id="ig-t" color="inherit" className="lk-serif lk-h2 lk-reveal">
              Conectemos
            </Heading>
          </VStack>
        </VStack>
        <VStack className="lk-ig" width="100%">
          <VStack className="lk-ig-col lk-reveal-2">
            <a
              className="lk-ig-photo lk-tilt-1"
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Ver diseño French minimal en Instagram de ${instagramHandle}`}
            >
              <Image
                src={leftTop}
                alt="Diseño de uñas French minimal con base Rubber hecho en LAIKONA NAILS Puebla"
                width={400}
                height={500}
                sizes="(max-width: 47.5rem) 46vw, 24vw"
                loading="lazy"
                decoding="async"
                style={{ background: 'var(--lk-tinte)' }}
              />
            </a>
            <a
              className="lk-ig-photo lk-tilt-2"
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Ver diseño Milky almendra en Instagram de ${instagramHandle}`}
            >
              <Image
                src={leftBottom}
                alt="Set de uñas Milky almendra en Softgel natural de LAIKONA NAILS en Puebla"
                width={400}
                height={400}
                sizes="(max-width: 47.5rem) 46vw, 24vw"
                loading="lazy"
                decoding="async"
                style={{ background: 'var(--lk-tinte)' }}
              />
            </a>
          </VStack>
          <a
            className="lk-ig-main lk-pop fx-press"
            href={instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <VStack
              gap={4}
              align="center"
              justify="center"
              padding={6}
              height="100%"
              style={{ minHeight: 'inherit', boxSizing: 'border-box' }}
            >
              <img
                src={LANDING_ASSETS.cherriesWhite}
                alt=""
                aria-hidden="true"
                width={64}
                height={75}
                loading="lazy"
                decoding="async"
              />
              <Heading
                level={3}
                color="inherit"
                className="lk-serif"
                style={{
                  fontSize: 'clamp(1.75rem, 4.2vw, 3.75rem)',
                  lineHeight: 1,
                  maxWidth: '100%',
                  overflowWrap: 'anywhere',
                }}
              >
                {instagramHandle}
              </Heading>
              <img
                src={LANDING_ASSETS.strokePorcelain}
                alt=""
                aria-hidden="true"
                width={240}
                height={41}
                loading="lazy"
                decoding="async"
                style={{ width: 'min(15rem, 100%)', height: 'auto' }}
              />
              <VStack className="lk-soft" style={{ maxWidth: '22rem' }}>
                <Text type="large" color="inherit" textWrap="pretty">
                  Sets nuevos cada semana. Guarda tu favorito y tráelo a tu cita.
                </Text>
              </VStack>
              <HStack
                gap={2}
                align="center"
                padding={4}
                style={{
                  marginTop: '0.5rem',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--lk-blanco)',
                  color: 'var(--lk-cereza)',
                  paddingInline: '1.75rem',
                }}
              >
                <img
                  src={LANDING_ASSETS.iconInstagram}
                  alt=""
                  aria-hidden="true"
                  width={20}
                  height={20}
                  loading="lazy"
                  decoding="async"
                />
                <Text weight="bold" color="inherit">
                  Seguir en Instagram
                </Text>
              </HStack>
            </VStack>
          </a>
          <VStack className="lk-ig-col lk-ig-col-offset lk-reveal-3">
            <a
              className="lk-ig-photo lk-tilt-3"
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Ver diseño Nude brillante en Instagram de ${instagramHandle}`}
            >
              <Image
                src={rightTop}
                alt="Manicure Nude brillante con nivelación Rubber de LAIKONA NAILS en Puebla"
                width={400}
                height={400}
                sizes="(max-width: 47.5rem) 46vw, 24vw"
                loading="lazy"
                decoding="async"
                style={{ background: 'var(--lk-tinte)' }}
              />
            </a>
            <a
              className="lk-ig-photo lk-tilt-4"
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Ver diseño Acabado cristal en Instagram de ${instagramHandle}`}
            >
              <Image
                src={rightBottom}
                alt="Uñas de acrílico escultural con acabado cristal hechas en LAIKONA NAILS Puebla"
                width={400}
                height={500}
                sizes="(max-width: 47.5rem) 46vw, 24vw"
                loading="lazy"
                decoding="async"
                style={{ background: 'var(--lk-tinte)' }}
              />
            </a>
          </VStack>
        </VStack>
      </VStack>
    </VStack>
  );
}
