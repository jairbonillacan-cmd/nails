import '../../cita.css';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { LANDING_ASSETS } from '@/components/landing/landingContent';

export default function CitaLoading() {
  return (
    <VStack
      className="lk-root rb-root"
      gap={0}
      role="status"
      aria-busy="true"
      aria-label="Cargando detalles de tu cita"
    >
      <Text className="rb-sr-only">Cargando detalles de tu cita…</Text>

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
        <VStack className="rb-wrap rb-hero-inner" gap={3}>
          <HStack gap={2} wrap="wrap" align="center">
            <Text color="inherit" className="sk-eyebrow" data-on="cherry">
              Cargando tu cita…
            </Text>
            <VStack className="sk-bar" data-size="pill" data-on="cherry" aria-hidden="true" />
          </HStack>
          <VStack gap={1.5} maxWidth={440} width="100%">
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
          <VStack className="sk-bar" data-size="sm" data-w="60" data-on="cherry" aria-hidden="true" />
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

      <VStack as="main" className="rb-wrap rb-main ck-wrap" gap={0} aria-hidden="true">
        <VStack className="ck-layout" gap={0}>
          <VStack className="ck-main-col" gap={4}>
            <VStack className="ck-panel" gap={3}>
              <VStack className="sk-bar" data-size="md" data-w="60" />
              <VStack className="sk-bar" data-size="sm" data-w="100" />
              <VStack className="ad-skeleton" data-size="row" />
              <HStack gap={2} wrap="wrap">
                <VStack className="ad-skeleton" data-size="button" />
                <VStack className="ad-skeleton" data-size="button" />
              </HStack>
            </VStack>

            <VStack className="ck-panel" gap={3}>
              <VStack className="sk-bar" data-size="md" data-w="40" />
              <HStack gap={3} align="center" className="ck-qr-wrap">
                <VStack className="sk-bar" data-size="qr" />
                <VStack gap={2} className="rb-grow">
                  <VStack className="sk-bar" data-size="sm" data-w="80" />
                  <VStack className="sk-bar" data-size="sm" data-w="60" />
                  <VStack className="ad-skeleton" data-size="button" />
                </VStack>
              </HStack>
            </VStack>
          </VStack>

          <VStack className="ck-aside" gap={0}>
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
    </VStack>
  );
}
