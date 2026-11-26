import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';

export default function AdminLoading() {
  return (
    <VStack
      className="ad-boundary ad-page"
      gap={5}
      role="status"
      aria-busy="true"
      aria-label="Cargando panel de administración"
    >
      <Text className="rb-sr-only">Cargando panel de administración…</Text>

      <HStack className="ad-page-head" justify="between" align="end" gap={4} wrap="wrap">
        <VStack gap={2} className="rb-grow">
          <VStack className="ad-skeleton" data-size="title" aria-hidden="true" />
          <VStack className="ad-skeleton" data-size="line" data-width="mid" aria-hidden="true" />
        </VStack>
        <HStack gap={2}>
          <VStack className="ad-skeleton" data-size="button" aria-hidden="true" />
        </HStack>
      </HStack>

      <VStack className="ad-kpi-grid" data-cols="4">
        <VStack className="ad-skeleton" data-size="kpi" aria-hidden="true" />
        <VStack className="ad-skeleton" data-size="kpi" aria-hidden="true" />
        <VStack className="ad-skeleton" data-size="kpi" aria-hidden="true" />
        <VStack className="ad-skeleton" data-size="kpi" aria-hidden="true" />
      </VStack>

      <VStack className="ad-surface" gap={0}>
        <HStack className="ad-section-head" justify="between" align="center" gap={3}>
          <VStack className="ad-skeleton" data-size="line" data-width="short" aria-hidden="true" />
          <VStack className="ad-skeleton" data-size="pill" aria-hidden="true" />
        </HStack>
        <VStack className="ad-row-list" gap={0}>
          <VStack className="ad-row-item">
            <VStack className="ad-skeleton" data-size="row" aria-hidden="true" />
          </VStack>
          <VStack className="ad-row-item">
            <VStack className="ad-skeleton" data-size="row" aria-hidden="true" />
          </VStack>
          <VStack className="ad-row-item">
            <VStack className="ad-skeleton" data-size="row" aria-hidden="true" />
          </VStack>
          <VStack className="ad-row-item">
            <VStack className="ad-skeleton" data-size="row" aria-hidden="true" />
          </VStack>
        </VStack>
      </VStack>
    </VStack>
  );
}
