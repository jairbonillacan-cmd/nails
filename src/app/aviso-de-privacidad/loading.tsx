import '../cita.css';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { LANDING_ASSETS } from '@/components/landing/landingContent';

const SECTIONS = [0, 1, 2, 3] as const;

export default function AvisoDePrivacidadLoading() {
  return (
    <VStack
      className="lk-root rb-root"
      gap={0}
      role="status"
      aria-busy="true"
      aria-label="Cargando Aviso de Privacidad"
    >
      <Text className="rb-sr-only">Cargando Aviso de Privacidad…</Text>

      <VStack as="header" className="rb-header" gap={0}>
        <VStack className="rb-header-bar" gap={0}>
          <VStack className="sk-bar" data-size="pill" aria-hidden="true" />
          <img
            src={LANDING_ASSETS.logoBlack}
            alt="LAIKONA NAILS"
            width={120}
            height={50}
            className="rb-logo"
          />
          <HStack justify="end">
            <VStack className="sk-bar" data-size="pill" aria-hidden="true" />
          </HStack>
        </VStack>
      </VStack>

      <VStack as="section" className="rb-hero ck-hero" gap={0}>
        <VStack className="rb-wrap rb-hero-inner" maxWidth={840} gap={3}>
          <HStack gap={2} wrap="wrap" align="center">
            <Text color="inherit" className="sk-eyebrow" data-on="cherry">
              Cargando aviso de privacidad…
            </Text>
          </HStack>
          <VStack gap={1.5} maxWidth={480} width="100%">
            <VStack className="sk-bar" data-size="lg" data-w="80" data-on="cherry" aria-hidden="true" />
            <img
              src={LANDING_ASSETS.strokePorcelain}
              alt=""
              aria-hidden="true"
              width={150}
              height={18}
              className="rb-hero-stroke"
            />
          </VStack>
          <VStack className="sk-bar" data-size="sm" data-w="80" data-on="cherry" aria-hidden="true" />
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
        <VStack
          gap={5}
          maxWidth={840}
          width="100%"
          style={{ marginInline: 'auto' }}
          className="ck-panel"
        >
          <HStack gap={2} wrap="wrap">
            <VStack className="sk-bar" data-size="pill" />
            <VStack className="sk-bar" data-size="pill" />
            <VStack className="sk-bar" data-size="pill" />
            <VStack className="sk-bar" data-size="pill" />
          </HStack>
          {SECTIONS.map((idx) => (
            <VStack key={idx} gap={2}>
              <VStack className="sk-bar" data-size="md" data-w="60" />
              <VStack className="sk-bar" data-size="sm" data-w="100" />
              <VStack className="sk-bar" data-size="sm" data-w="80" />
            </VStack>
          ))}
        </VStack>
      </VStack>
    </VStack>
  );
}
