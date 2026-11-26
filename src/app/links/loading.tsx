import '../cita.css';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { LANDING_ASSETS } from '@/components/landing/landingContent';

const CTA_SLOTS = [0, 1, 2, 3, 4, 5] as const;
const SERVICE_SLOTS = [0, 1, 2, 3] as const;

export default function LinksLoading() {
  return (
    <VStack
      className="lk-root rb-root"
      gap={0}
      role="status"
      aria-busy="true"
      aria-label="Cargando accesos rápidos de LAIKONA NAILS"
    >
      <Text className="rb-sr-only">Cargando accesos rápidos de LAIKONA NAILS…</Text>

      <VStack as="header" className="rb-header" gap={0}>
        <VStack className="rb-header-bar" gap={0}>
          <VStack className="sk-bar" data-size="pill" data-on="cherry" aria-hidden="true" />
          <img
            src={LANDING_ASSETS.logoWhite}
            alt="LAIKONA NAILS"
            width={120}
            height={50}
            className="rb-logo"
          />
          <HStack justify="end">
            <VStack className="sk-bar" data-size="pill" data-on="cherry" aria-hidden="true" />
          </HStack>
        </VStack>
      </VStack>

      <VStack as="section" className="rb-hero ck-hero" gap={0}>
        <VStack className="rb-wrap rb-hero-inner sk-links-wrap" align="center" gap={3}>
          <Text color="inherit" className="sk-eyebrow" data-on="cherry">
            Cargando accesos rápidos…
          </Text>
          <img
            src={LANDING_ASSETS.strokePorcelain}
            alt=""
            aria-hidden="true"
            width={150}
            height={18}
            className="rb-hero-stroke"
          />
          <VStack className="sk-bar" data-size="sm" data-w="40" data-on="cherry" aria-hidden="true" />
          <VStack className="sk-bar" data-size="xs" data-w="80" data-on="cherry" aria-hidden="true" />
        </VStack>
        <svg
          className="rb-hero-wave"
          viewBox="0 0 1440 40"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M0 40h1440V22c-120-14-240-20-360-12S840 34 720 34 480 14 360 10 120 20 0 26Z" />
        </svg>
      </VStack>

      <VStack as="main" paddingBlock={6} paddingInline={4} width="100%" aria-hidden="true">
        <VStack className="sk-links-wrap" gap={5}>
          <VStack className="ck-panel" gap={4} align="center">
            <HStack gap={2} justify="center" wrap="wrap">
              <VStack className="sk-bar" data-size="pill" />
              <VStack className="sk-bar" data-size="pill" />
              <VStack className="sk-bar" data-size="pill" />
            </HStack>
            <VStack gap={3} width="100%">
              {CTA_SLOTS.map((idx) => (
                <VStack key={idx} className="sk-bar" data-size="cta" data-w="100" />
              ))}
            </VStack>
          </VStack>

          <VStack className="ck-panel" gap={3}>
            <VStack gap={1.5} align="center">
              <VStack className="sk-bar" data-size="md" data-w="60" />
              <VStack className="sk-bar" data-size="xs" data-w="80" />
            </VStack>
            <VStack gap={3}>
              {SERVICE_SLOTS.map((idx) => (
                <HStack key={idx} gap={3} align="center">
                  <VStack className="sk-bar" data-size="thumb" />
                  <VStack gap={1.5} className="rb-grow">
                    <VStack className="sk-bar" data-size="sm" data-w="60" />
                    <VStack className="sk-bar" data-size="xs" data-w="40" />
                  </VStack>
                </HStack>
              ))}
            </VStack>
          </VStack>
        </VStack>
      </VStack>
    </VStack>
  );
}
