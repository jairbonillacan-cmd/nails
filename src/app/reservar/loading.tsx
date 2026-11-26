import '../booking.css';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';

const STEP_ITEMS = [0, 1, 2, 3, 4] as const;
const SERVICE_CARDS = [0, 1, 2, 3, 4, 5] as const;

export default function ReservarLoading() {
  return (
    <VStack
      className="lk-root rb-root"
      gap={0}
      role="status"
      aria-busy="true"
      aria-label="Cargando agenda de reservas"
    >
      <Text className="rb-sr-only">Cargando agenda de reservas…</Text>

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
        <VStack className="rb-progress" aria-hidden="true" />
      </VStack>

      <VStack as="section" className="rb-hero" gap={0} aria-hidden="true">
        <VStack className="rb-wrap rb-hero-inner" gap={4}>
          <HStack justify="between" align="end" wrap="wrap" gap={2}>
            <VStack gap={2} maxWidth={360} width="100%">
              <VStack className="sk-bar" data-size="lg" data-w="80" data-on="cherry" />
              <VStack className="sk-bar" data-size="xs" data-w="40" data-on="cherry" />
            </VStack>
            <VStack className="sk-bar rb-d" data-size="pill" data-on="cherry" />
          </HStack>

          <VStack className="rb-stepper rb-d" gap={0}>
            {STEP_ITEMS.map((idx) => (
              <VStack
                key={idx}
                className="ad-skeleton"
                data-size="row"
                data-on="cherry"
              />
            ))}
          </VStack>

          <HStack justify="between" align="center" gap={2} className="rb-m rb-hero-mobile">
            <VStack className="sk-bar" data-size="sm" data-w="40" data-on="cherry" />
            <VStack className="sk-bar" data-size="xs" data-w="25" data-on="cherry" />
          </HStack>
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

      <VStack as="main" className="rb-wrap rb-main" gap={0} aria-hidden="true">
        <VStack className="rb-layout" gap={0}>
          <VStack className="rb-panel" gap={4}>
            <VStack gap={2}>
              <VStack className="sk-bar" data-size="lg" data-w="60" />
              <VStack className="sk-bar" data-size="sm" data-w="80" />
            </VStack>
            <HStack gap={2} wrap="wrap">
              <VStack className="sk-bar" data-size="pill" />
              <VStack className="sk-bar" data-size="pill" />
              <VStack className="sk-bar" data-size="pill" />
            </HStack>
            <VStack className="rb-skeleton-services">
              {SERVICE_CARDS.map((idx) => (
                <VStack key={idx} className="ad-skeleton" data-size="card" />
              ))}
            </VStack>
          </VStack>

          <VStack className="rb-aside rb-d" gap={0}>
            <VStack className="rb-summary" gap={4}>
              <VStack className="sk-bar" data-size="md" data-w="60" data-on="cherry" />
              <VStack className="ad-skeleton" data-size="row" data-on="cherry" />
              <VStack className="ad-skeleton" data-size="row" data-on="cherry" />
              <VStack className="ad-skeleton" data-size="row" data-on="cherry" />
              <VStack className="sk-bar" data-size="lg" data-w="80" data-on="cherry" />
            </VStack>
          </VStack>
        </VStack>
      </VStack>

      <HStack
        className="rb-bottom rb-m"
        justify="between"
        align="center"
        gap={3}
        aria-hidden="true"
      >
        <VStack gap={1.5} className="rb-grow">
          <VStack className="sk-bar" data-size="md" data-w="40" />
          <VStack className="sk-bar" data-size="xs" data-w="60" />
        </VStack>
        <VStack className="ad-skeleton" data-size="button" />
      </HStack>
    </VStack>
  );
}
