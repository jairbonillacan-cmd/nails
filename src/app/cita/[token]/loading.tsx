import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';

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

      <VStack className="rb-hero ck-hero" gap={0}>
        <VStack className="rb-wrap rb-hero-inner" gap={3}>
          <HStack gap={2} wrap="wrap">
            <VStack className="ad-skeleton" data-size="pill" data-on="cherry" aria-hidden="true" />
            <VStack className="ad-skeleton" data-size="pill" data-on="cherry" aria-hidden="true" />
          </HStack>
          <VStack className="ad-skeleton" data-size="title" data-on="cherry" aria-hidden="true" />
          <VStack
            className="ad-skeleton"
            data-size="line"
            data-width="mid"
            data-on="cherry"
            aria-hidden="true"
          />
        </VStack>
      </VStack>

      <VStack className="rb-wrap rb-main ck-wrap" gap={0}>
        <VStack className="ck-layout" gap={0}>
          <VStack className="ck-main-col" gap={4}>
            <VStack className="ck-panel" gap={3}>
              <VStack className="ad-skeleton" data-size="title" aria-hidden="true" />
              <VStack className="ad-skeleton" data-size="line" data-width="long" aria-hidden="true" />
              <VStack className="ad-skeleton" data-size="row" aria-hidden="true" />
              <HStack gap={2} wrap="wrap">
                <VStack className="ad-skeleton" data-size="button" aria-hidden="true" />
                <VStack className="ad-skeleton" data-size="button" aria-hidden="true" />
              </HStack>
            </VStack>
            <VStack className="ck-panel" gap={3}>
              <VStack className="ad-skeleton" data-size="title" aria-hidden="true" />
              <VStack className="ad-skeleton" data-size="row" aria-hidden="true" />
              <VStack className="ad-skeleton" data-size="row" aria-hidden="true" />
            </VStack>
          </VStack>

          <VStack className="ck-aside" gap={0}>
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
