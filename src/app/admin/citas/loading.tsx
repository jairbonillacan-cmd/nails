import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';

const KPI_SLOTS = [0, 1, 2, 3] as const;
const SCHEDULE_COLUMNS = [0, 1, 2] as const;
const BOOKING_BLOCKS = [0, 1, 2] as const;

export default function AdminCitasLoading() {
  return (
    <VStack
      className="ad-page"
      gap={5}
      role="status"
      aria-busy="true"
      aria-label="Cargando citas y agenda"
    >
      <Text className="rb-sr-only">Cargando citas y agenda…</Text>

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
          <VStack className="sk-bar" data-size="lg" data-w="40" />
          <VStack className="sk-bar" data-size="sm" data-w="80" />
        </VStack>
        <HStack gap={2} wrap="wrap">
          <VStack className="sk-bar" data-size="tab" />
          <VStack className="sk-bar" data-size="tab" />
          <VStack className="ad-skeleton" data-size="button" />
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

      <HStack
        className="ad-toolbar"
        justify="between"
        align="center"
        wrap="wrap"
        gap={3}
        aria-hidden="true"
      >
        <HStack gap={2} wrap="wrap">
          <VStack className="sk-bar" data-size="pill" />
          <VStack className="sk-bar" data-size="pill" />
          <VStack className="sk-bar" data-size="pill" />
          <VStack className="sk-bar" data-size="pill" />
        </HStack>
        <HStack gap={2} wrap="wrap">
          <VStack className="sk-bar" data-size="tab" />
          <VStack className="sk-bar" data-size="tab" />
        </HStack>
      </HStack>

      <HStack
        className="ad-surface"
        data-padded="true"
        justify="between"
        align="center"
        wrap="wrap"
        gap={3}
        aria-hidden="true"
      >
        <HStack gap={2} align="center" wrap="wrap">
          <VStack className="sk-bar" data-size="tab" />
          <VStack className="sk-bar" data-size="pill" />
          <VStack className="sk-bar" data-size="pill" />
        </HStack>
        <VStack className="sk-bar" data-size="pill" />
      </HStack>

      <VStack className="sk-admin-grid" gap={0} aria-hidden="true">
        {SCHEDULE_COLUMNS.map((col) => (
          <VStack key={col} className="sk-card" data-variant="column" gap={3}>
            <HStack justify="between" align="center" gap={2}>
              <VStack className="sk-bar" data-size="md" data-w="60" />
              <VStack className="sk-bar" data-size="xs" data-w="25" />
            </HStack>
            <HStack gap={1.5} wrap="wrap">
              <VStack className="sk-bar" data-size="xs" data-w="25" />
              <VStack className="sk-bar" data-size="xs" data-w="25" />
              <VStack className="sk-bar" data-size="xs" data-w="25" />
            </HStack>
            <VStack gap={2}>
              {BOOKING_BLOCKS.map((row) => (
                <VStack key={row} className="ad-skeleton" data-size="row" />
              ))}
            </VStack>
          </VStack>
        ))}
      </VStack>
    </VStack>
  );
}
