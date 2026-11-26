import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';

export default function MisCitasLoading() {
  return (
    <VStack
      className="lk-root pt-shell"
      gap={0}
      role="status"
      aria-busy="true"
      aria-label="Cargando portal de mis citas"
    >
      <Text className="rb-sr-only">Cargando portal de mis citas…</Text>

      <VStack as="header" className="rb-header" gap={0}>
        <VStack className="rb-header-bar" gap={0}>
          <VStack className="sk-bar" data-size="pill" aria-hidden="true" />
          <img
            src="/landing/logo-negro.svg"
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

      <VStack as="section" className="rb-hero ck-hero" gap={0} aria-hidden="true">
        <VStack className="rb-wrap rb-hero-inner" gap={3}>
          <VStack gap={1.5} maxWidth={360} width="100%">
            <VStack className="sk-bar" data-size="lg" data-w="60" data-on="cherry" />
            <VStack className="sk-bar" data-size="xs" data-w="40" data-on="cherry" />
          </VStack>
          <VStack className="sk-bar" data-size="sm" data-w="80" data-on="cherry" />
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

      <VStack as="main" className="rb-wrap rb-main" gap={4} aria-hidden="true">
        <VStack className="sk-links-wrap" gap={4}>
          <VStack className="pt-card" gap={4}>
            <VStack className="sk-bar" data-size="lg" data-w="80" />
            <VStack gap={1.5}>
              <VStack className="sk-bar" data-size="sm" data-w="100" />
              <VStack className="sk-bar" data-size="sm" data-w="60" />
            </VStack>
            <VStack className="sk-bar" data-size="cta" data-w="100" />
            <VStack className="sk-bar" data-size="cta" data-w="100" />
            <HStack justify="center">
              <VStack className="sk-bar" data-size="pill" />
            </HStack>
          </VStack>
        </VStack>
      </VStack>
    </VStack>
  );
}
