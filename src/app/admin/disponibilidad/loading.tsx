import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';

const KPI_SLOTS = [0, 1, 2, 3] as const;
const DAY_ROWS = [0, 1, 2, 3, 4] as const;
const FIXED_PILLS = [0, 1, 2] as const;

export default function AdminDisponibilidadLoading() {
  return (
    <VStack
      className="ad-page"
      gap={5}
      role="status"
      aria-busy="true"
      aria-label="Cargando disponibilidad y horarios"
    >
      <Text className="rb-sr-only">Cargando disponibilidad y horarios…</Text>

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
          <VStack className="sk-bar" data-size="lg" data-w="60" />
          <VStack className="sk-bar" data-size="sm" data-w="80" />
        </VStack>
        <HStack gap={1.5} wrap="wrap">
          <VStack className="sk-bar" data-size="pill" />
          <VStack className="sk-bar" data-size="pill" />
          <VStack className="sk-bar" data-size="pill" />
        </HStack>
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
        <VStack className="sk-bar" data-size="tab" />
        <VStack className="sk-bar" data-size="tab" />
      </HStack>

      <VStack className="ad-surface" gap={0} aria-hidden="true">
        <HStack className="ad-section-head" justify="between" align="center" gap={3} wrap="wrap">
          <VStack gap={1.5} className="rb-grow">
            <VStack className="sk-bar" data-size="md" data-w="40" />
            <VStack className="sk-bar" data-size="xs" data-w="60" />
          </VStack>
          <VStack className="ad-skeleton" data-size="button" />
        </HStack>

        <VStack className="ad-row-list" gap={0}>
          {DAY_ROWS.map((day) => (
            <VStack key={day} className="ad-row-item" gap={3}>
              <HStack justify="between" align="center" width="100%" wrap="wrap" gap={2}>
                <VStack className="sk-bar" data-size="md" data-w="25" />
                <HStack gap={2}>
                  <VStack className="sk-bar" data-size="tab" />
                  <VStack className="sk-bar" data-size="pill" />
                </HStack>
              </HStack>
              <VStack className="sk-admin-grid" data-cols="pills">
                {FIXED_PILLS.map((slot) => (
                  <VStack key={slot} className="sk-bar" data-size="pill" data-w="100" />
                ))}
              </VStack>
            </VStack>
          ))}
        </VStack>
      </VStack>
    </VStack>
  );
}
