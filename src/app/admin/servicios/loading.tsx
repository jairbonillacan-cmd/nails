import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';

const KPI_SLOTS = [0, 1, 2, 3] as const;
const SERVICE_ROWS = [0, 1, 2, 3, 4] as const;

export default function AdminServiciosLoading() {
  return (
    <VStack
      className="ad-page"
      gap={5}
      role="status"
      aria-busy="true"
      aria-label="Cargando servicios y extras"
    >
      <Text className="rb-sr-only">Cargando servicios y extras…</Text>

      <HStack
        as="header"
        className="ad-page-head"
        justify="between"
        align="end"
        wrap="wrap"
        gap={3}
        aria-hidden="true"
      >
        <VStack gap={1.5} className="ad-head-copy">
          <VStack className="sk-bar" data-size="xs" data-w="25" />
          <VStack className="sk-bar" data-size="lg" data-w="40" />
          <VStack className="sk-bar" data-size="sm" data-w="80" />
        </VStack>
        <VStack className="ad-skeleton" data-size="button" />
      </HStack>

      <VStack className="ad-kpi-grid" data-cols="4" gap={0} aria-hidden="true">
        {KPI_SLOTS.map((idx) => (
          <VStack key={idx} className="sk-card" data-variant="kpi" gap={2}>
            <VStack className="sk-bar" data-size="xs" data-w="60" />
            <VStack className="sk-bar" data-size="lg" data-w="40" />
            <VStack className="sk-bar" data-size="xs" data-w="80" />
          </VStack>
        ))}
      </VStack>

      <HStack gap={2} wrap="wrap" aria-hidden="true">
        <VStack className="sk-bar" data-size="tab" />
        <VStack className="sk-bar" data-size="tab" />
      </HStack>

      <VStack className="sk-admin-grid" data-cols="2" gap={0} aria-hidden="true">
        <VStack className="ad-surface" gap={0}>
          <HStack className="ad-section-head" justify="between" align="center" gap={3}>
            <VStack className="sk-bar" data-size="md" data-w="40" />
            <VStack className="sk-bar" data-size="pill" />
          </HStack>
          <HStack className="ad-toolbar" justify="between" align="center" wrap="wrap" gap={2}>
            <HStack gap={1.5} wrap="wrap">
              <VStack className="sk-bar" data-size="pill" />
              <VStack className="sk-bar" data-size="pill" />
              <VStack className="sk-bar" data-size="pill" />
            </HStack>
            <VStack className="sk-bar" data-size="tab" />
          </HStack>
          <VStack className="ad-row-list" gap={0}>
            {SERVICE_ROWS.map((row) => (
              <VStack key={row} className="ad-list-row" gap={2}>
                <HStack justify="between" align="center" width="100%" gap={3}>
                  <VStack gap={1.5} className="rb-grow">
                    <VStack className="sk-bar" data-size="md" data-w="60" />
                    <VStack className="sk-bar" data-size="xs" data-w="40" />
                  </VStack>
                  <VStack className="sk-bar" data-size="md" data-w="25" />
                </HStack>
                <HStack gap={1.5} wrap="wrap" width="100%">
                  <VStack className="sk-bar" data-size="pill" />
                  <VStack className="sk-bar" data-size="pill" />
                </HStack>
              </VStack>
            ))}
          </VStack>
        </VStack>

        <VStack gap={4}>
          <VStack className="ad-surface" data-padded="true" gap={3}>
            <VStack className="sk-bar" data-size="md" data-w="60" />
            <VStack className="sk-bar" data-size="cta" data-w="100" />
            <VStack className="sk-bar" data-size="cta" data-w="100" />
            <VStack className="sk-admin-grid" data-cols="2-equal">
              <VStack className="sk-bar" data-size="cta" data-w="100" />
              <VStack className="sk-bar" data-size="cta" data-w="100" />
            </VStack>
            <VStack className="sk-bar" data-size="cta" data-w="100" />
          </VStack>

          <VStack className="sk-card" gap={3}>
            <VStack className="sk-bar" data-size="xs" data-w="40" />
            <VStack className="sk-bar" data-size="md" data-w="80" />
            <VStack className="sk-bar" data-size="sm" data-w="100" />
            <HStack justify="between" align="center">
              <VStack className="sk-bar" data-size="pill" />
              <VStack className="sk-bar" data-size="pill" />
            </HStack>
          </VStack>
        </VStack>
      </VStack>
    </VStack>
  );
}
