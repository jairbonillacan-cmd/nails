import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';

const KPI_SLOTS = [0, 1, 2, 3, 4, 5] as const;
const AGENDA_ROWS = [0, 1, 2, 3] as const;

export default function AdminLoading() {
  return (
    <VStack
      className="ad-page ad-dashboard"
      gap={6}
      role="status"
      aria-busy="true"
      aria-label="Cargando tu día en el salón"
    >
      <Text className="rb-sr-only">Cargando tu día en el salón…</Text>

      <HStack
        as="header"
        className="ad-head"
        justify="between"
        align="end"
        gap={4}
        wrap="wrap"
      >
        <VStack gap={2} className="ad-head-copy">
          <HStack align="center">
            <Text color="inherit" className="sk-eyebrow">
              Preparando tu día…
            </Text>
          </HStack>
          <VStack className="sk-bar" data-size="lg" data-w="40" aria-hidden="true" />
          <VStack className="sk-bar" data-size="sm" data-w="60" aria-hidden="true" />
        </VStack>
        <HStack gap={2} align="center" aria-hidden="true">
          <VStack className="ad-skeleton ad-hide-s" data-size="button" />
          <VStack className="ad-skeleton" data-size="button" />
        </HStack>
      </HStack>

      <VStack className="ad-kpis" gap={0} aria-hidden="true">
        {KPI_SLOTS.map((idx) => (
          <VStack key={idx} className="ad-sk-kpi" padding={4} gap={2}>
            <VStack className="sk-bar" data-size="xs" data-w="60" />
            <VStack className="sk-bar" data-size="lg" data-w="40" />
            <VStack className="sk-bar" data-size="xs" data-w="80" />
          </VStack>
        ))}
      </VStack>

      <VStack className="ad-main" gap={5} aria-hidden="true">
        <VStack className="ad-card" gap={0}>
          <HStack className="ad-card-head" justify="between" align="center" gap={3} wrap="wrap">
            <VStack className="sk-bar" data-size="md" data-w="40" />
            <HStack gap={1.5}>
              <VStack className="sk-bar" data-size="pill" />
              <VStack className="sk-bar" data-size="pill" />
            </HStack>
          </HStack>
          <HStack className="ad-filter-bar" gap={1.5} wrap="wrap">
            <VStack className="sk-bar" data-size="pill" />
            <VStack className="sk-bar" data-size="pill" />
            <VStack className="sk-bar" data-size="pill" />
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

        <VStack gap={4} className="ad-right-col">
          <VStack className="ad-cherry-card" gap={3}>
            <VStack className="sk-bar" data-size="xs" data-w="25" data-on="cherry" />
            <VStack className="sk-bar" data-size="md" data-w="80" data-on="cherry" />
            <VStack className="ad-skeleton" data-size="row" data-on="cherry" />
            <HStack gap={2} wrap="wrap">
              <VStack className="sk-bar" data-size="pill" data-on="cherry" />
              <VStack className="sk-bar" data-size="pill" data-on="cherry" />
            </HStack>
          </VStack>

          <VStack className="sk-card" gap={3}>
            <VStack className="sk-bar" data-size="md" data-w="60" />
            <VStack className="sk-bar" data-size="sm" data-w="100" />
            <VStack className="sk-bar" data-size="sm" data-w="80" />
            <VStack className="sk-bar" data-size="sm" data-w="100" />
          </VStack>
        </VStack>
      </VStack>
    </VStack>
  );
}
