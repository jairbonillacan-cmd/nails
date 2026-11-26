import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';

const HERO_SERVICES = [0, 1, 2, 3] as const;

export default function HomeLoading() {
  return (
    <VStack
      className="lk-root"
      gap={0}
      role="status"
      aria-busy="true"
      aria-label="Cargando LAIKONA NAILS"
    >
      <Text className="rb-sr-only">Cargando LAIKONA NAILS…</Text>

      <VStack className="lk-marquee" gap={0} aria-hidden="true">
        <VStack className="sk-bar" data-size="sm" data-w="60" data-on="cherry" />
      </VStack>

      <VStack as="header" className="lk-header" gap={0}>
        <HStack
          className="lk-nav sk-landing-nav"
          justify="between"
          align="center"
          gap={3}
        >
          <img
            src="/landing/logo-negro.svg"
            alt="LAIKONA NAILS"
            width={160}
            height={68}
            className="lk-logo"
          />
          <HStack gap={4} align="center" className="rb-d" aria-hidden="true">
            <VStack className="sk-bar" data-size="pill" />
            <VStack className="sk-bar" data-size="pill" />
            <VStack className="sk-bar" data-size="pill" />
          </HStack>
          <VStack className="ad-skeleton" data-size="button" aria-hidden="true" />
        </HStack>
      </VStack>

      <VStack as="section" padding={3} paddingBlockEnd={0} aria-hidden="true">
        <VStack className="lk-hero sk-landing-hero" justify="end" gap={6}>
          <VStack gap={5} className="lk-hero-content" maxWidth={520}>
            <VStack gap={2}>
              <VStack className="sk-bar" data-size="xl" data-w="100" />
              <VStack className="sk-bar" data-size="xl" data-w="80" />
            </VStack>
            <VStack gap={2} maxWidth={420}>
              <VStack className="sk-bar" data-size="md" data-w="100" />
              <VStack className="sk-bar" data-size="sm" data-w="60" />
            </VStack>
            <HStack gap={3} wrap="wrap">
              <VStack className="ad-skeleton" data-size="button" />
              <VStack className="ad-skeleton" data-size="button" />
            </HStack>
            <VStack className="sk-bar" data-size="sm" data-w="40" />
          </VStack>
        </VStack>
      </VStack>

      <VStack as="section" className="lk-section" aria-hidden="true">
        <VStack className="lk-wrap" gap={8}>
          <HStack justify="between" align="end" wrap="wrap" gap={4}>
            <VStack gap={2} maxWidth={260} width="100%">
              <VStack className="sk-bar" data-size="lg" data-w="80" />
              <VStack className="sk-bar" data-size="sm" data-w="60" />
            </VStack>
            <HStack gap={2} wrap="wrap">
              <VStack className="sk-bar" data-size="pill" />
              <VStack className="sk-bar" data-size="pill" />
              <VStack className="sk-bar" data-size="pill" />
            </HStack>
          </HStack>

          <VStack className="sk-admin-grid" data-cols="2-equal">
            {HERO_SERVICES.map((idx) => (
              <HStack
                key={idx}
                className="sk-card"
                data-variant="landing"
                gap={3}
                align="center"
              >
                <VStack className="sk-bar" data-size="thumb" />
                <VStack gap={2} className="rb-grow">
                  <HStack justify="between" align="center" gap={3}>
                    <VStack className="sk-bar" data-size="md" data-w="60" />
                    <VStack className="sk-bar" data-size="sm" data-w="25" />
                  </HStack>
                  <VStack className="sk-bar" data-size="sm" data-w="80" />
                  <VStack className="sk-bar" data-size="xs" data-w="25" />
                </VStack>
              </HStack>
            ))}
          </VStack>
        </VStack>
      </VStack>
    </VStack>
  );
}
