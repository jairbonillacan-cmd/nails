import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';

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
          <VStack className="ad-skeleton" data-size="pill" aria-hidden="true" />
          <img
            src="/landing/logo-negro.svg"
            alt="LAIKONA NAILS"
            width={112}
            height={30}
            className="rb-logo"
          />
          <HStack justify="end">
            <VStack className="ad-skeleton" data-size="pill" aria-hidden="true" />
          </HStack>
        </VStack>
      </VStack>

      <VStack className="rb-hero" gap={0}>
        <VStack className="rb-wrap rb-hero-inner" gap={4}>
          <VStack gap={2}>
            <VStack className="ad-skeleton" data-size="title" data-on="cherry" aria-hidden="true" />
            <VStack
              className="ad-skeleton"
              data-size="line"
              data-width="short"
              data-on="cherry"
              aria-hidden="true"
            />
          </VStack>
          <HStack gap={2} className="rb-d">
            <VStack className="ad-skeleton" data-size="row" data-on="cherry" aria-hidden="true" />
            <VStack className="ad-skeleton" data-size="row" data-on="cherry" aria-hidden="true" />
            <VStack className="ad-skeleton" data-size="row" data-on="cherry" aria-hidden="true" />
            <VStack className="ad-skeleton" data-size="row" data-on="cherry" aria-hidden="true" />
          </HStack>
        </VStack>
      </VStack>

      <VStack className="rb-wrap rb-main" gap={0}>
        <VStack className="rb-layout" gap={0}>
          <VStack className="rb-panel" gap={4}>
            <VStack gap={2}>
              <VStack className="ad-skeleton" data-size="title" aria-hidden="true" />
              <VStack className="ad-skeleton" data-size="line" data-width="mid" aria-hidden="true" />
            </VStack>
            <HStack gap={2} wrap="wrap">
              <VStack className="ad-skeleton" data-size="pill" aria-hidden="true" />
              <VStack className="ad-skeleton" data-size="pill" aria-hidden="true" />
              <VStack className="ad-skeleton" data-size="pill" aria-hidden="true" />
            </HStack>
            <VStack className="rb-skeleton-services">
              <VStack className="ad-skeleton" data-size="card" aria-hidden="true" />
              <VStack className="ad-skeleton" data-size="card" aria-hidden="true" />
              <VStack className="ad-skeleton" data-size="card" aria-hidden="true" />
            </VStack>
          </VStack>

          <VStack className="rb-aside rb-d" gap={0}>
            <VStack className="rb-summary" gap={4}>
              <VStack className="ad-skeleton" data-size="title" data-on="cherry" aria-hidden="true" />
              <VStack className="ad-skeleton" data-size="row" data-on="cherry" aria-hidden="true" />
              <VStack className="ad-skeleton" data-size="row" data-on="cherry" aria-hidden="true" />
              <VStack className="ad-skeleton" data-size="row" data-on="cherry" aria-hidden="true" />
            </VStack>
          </VStack>
        </VStack>
      </VStack>
    </VStack>
  );
}
