import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';

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

      <VStack className="lk-wrap" paddingBlock={4} gap={6}>
        <HStack justify="between" align="center" gap={3}>
          <VStack className="ad-skeleton" data-size="pill" aria-hidden="true" />
          <HStack gap={2} className="rb-d">
            <VStack className="ad-skeleton" data-size="pill" aria-hidden="true" />
            <VStack className="ad-skeleton" data-size="pill" aria-hidden="true" />
            <VStack className="ad-skeleton" data-size="button" aria-hidden="true" />
          </HStack>
        </HStack>

        <VStack className="ad-skeleton" data-size="hero" aria-hidden="true" />

        <VStack gap={3}>
          <VStack className="ad-skeleton" data-size="title" aria-hidden="true" />
          <VStack className="ad-skeleton" data-size="line" data-width="mid" aria-hidden="true" />
          <VStack className="ad-boundary-grid">
            <VStack className="ad-skeleton" data-size="card" aria-hidden="true" />
            <VStack className="ad-skeleton" data-size="card" aria-hidden="true" />
            <VStack className="ad-skeleton" data-size="card" aria-hidden="true" />
          </VStack>
        </VStack>
      </VStack>
    </VStack>
  );
}
