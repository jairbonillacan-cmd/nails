import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { MorphLoader } from '@/components/brand/MorphLoader';

const KPI_SLOTS = [0, 1, 2, 3] as const;
const AGENDA_ROWS = [0, 1, 2, 3] as const;

export default function AdminLoading() {
  return (
    <VStack
      className="ad-page ad-dashboard"
      gap={4}
      role="status"
      aria-busy="true"
      aria-label="Cargando tu día en el salón"
    >
      <Text className="rb-sr-only">Cargando tu día en el salón…</Text>

      <HStack
        as="header"
        className="ad-page-head"
        justify="between"
        align="end"
        gap={4}
        wrap="wrap"
      >
        <VStack gap={2} className="ad-head-copy">
          <HStack align="center">
            <MorphLoader size="sm" tone="cherry" />
          </HStack>
          <VStack className="sk-bar" data-size="lg" data-w="40" aria-hidden="true" />
          <VStack className="sk-bar" data-size="sm" data-w="60" aria-hidden="true" />
        </VStack>
        <HStack gap={2} align="center" aria-hidden="true">
          <VStack className="ad-skeleton" data-size="button" />
        </HStack>
      </HStack>

      <VStack className="ad-kpis" gap={0} aria-hidden="true">
        {KPI_SLOTS.map((idx) => (
          <VStack key={idx} className="ad-sk-kpi" padding={5} gap={2}>
            <VStack className="sk-bar" data-size="xs" data-w="60" />
            <VStack className="sk-bar" data-size="lg" data-w="40" />
            <VStack className="sk-bar" data-size="xs" data-w="80" />
          </VStack>
        ))}
      </VStack>

      <VStack className="ad-main" gap={4} aria-hidden="true">
        <VStack className="ad-card" gap={0}>
          <HStack className="ad-card-head" justify="between" align="center" gap={3} wrap="wrap">
            <VStack className="sk-bar" data-size="md" data-w="40" />
            <HStack gap={1.5}>
              <VStack className="sk-bar" data-size="pill" />
              <VStack className="sk-bar" data-size="pill" />
            </HStack>
          </HStack>
          <VStack gap={0}>
            {AGENDA_ROWS.map((idx) => (
              <VStack key={idx} className="ad-row" gap={0}>
                <VStack className="sk-bar" data-size="sm" data-w="100" />
                <VStack className="ad-bar" data-idx={String(idx % 4)} />
                <VStack gap={1.5} className="ad-row-info">
                  <VStack className="sk-bar" data-size="sm" data-w="60" />
                  <VStack className="sk-bar" data-size="xs" data-w="40" />
                </VStack>
                <HStack className="ad-row-actions">
                  <VStack className="sk-bar" data-size="pill" />
                </HStack>
              </VStack>
            ))}
          </VStack>
        </VStack>

        <VStack className="sk-card" gap={3}>
          <VStack className="sk-bar" data-size="md" data-w="60" />
          <VStack className="sk-bar" data-size="sm" data-w="100" />
          <VStack className="sk-bar" data-size="sm" data-w="80" />
          <VStack className="sk-bar" data-size="sm" data-w="100" />
        </VStack>
      </VStack>
    </VStack>
  );
}
