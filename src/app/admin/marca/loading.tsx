import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';

const KPI_SLOTS = [0, 1, 2, 3] as const;

export default function AdminMarcaLoading() {
  return (
    <VStack
      className="ad-page"
      gap={5}
      role="status"
      aria-busy="true"
      aria-label="Cargando configuración de página y marca"
    >
      <Text className="rb-sr-only">Cargando configuración de página y marca…</Text>

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
        <VStack className="sk-bar" data-size="pill" />
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

      <VStack className="sk-admin-grid" data-cols="2" gap={0} aria-hidden="true">
        <VStack gap={4}>
          <VStack className="ad-surface" data-padded="true" gap={3}>
            <VStack className="sk-bar" data-size="md" data-w="60" />
            <VStack className="sk-bar" data-size="sm" data-w="80" />
            <VStack className="sk-bar" data-size="cta" data-w="100" />
            <VStack className="sk-bar" data-size="cta" data-w="100" />
            <VStack className="sk-admin-grid" data-cols="2-equal">
              <VStack className="sk-bar" data-size="cta" data-w="100" />
              <VStack className="sk-bar" data-size="cta" data-w="100" />
            </VStack>
          </VStack>

          <VStack className="ad-surface" data-padded="true" gap={3}>
            <VStack className="sk-bar" data-size="md" data-w="60" />
            <HStack gap={2} wrap="wrap">
              <VStack className="sk-bar" data-size="pill" />
              <VStack className="sk-bar" data-size="pill" />
              <VStack className="sk-bar" data-size="pill" />
            </HStack>
            <VStack className="sk-admin-grid" data-cols="2-equal">
              <VStack className="ad-skeleton" data-size="kpi" />
              <VStack className="ad-skeleton" data-size="kpi" />
            </VStack>
          </VStack>
        </VStack>

        <VStack gap={4}>
          <VStack className="ad-surface" data-padded="true" gap={3}>
            <VStack className="sk-bar" data-size="xs" data-w="40" />
            <VStack className="ad-skeleton" data-size="hero" />
            <HStack gap={2} wrap="wrap">
              <VStack className="ad-skeleton" data-size="button" />
              <VStack className="ad-skeleton" data-size="button" />
            </HStack>
          </VStack>

          <VStack className="sk-card" gap={3} align="center">
            <VStack className="sk-bar" data-size="md" data-w="60" />
            <VStack className="sk-bar" data-size="qr" />
            <VStack className="sk-bar" data-size="sm" data-w="80" />
            <HStack gap={2} justify="center" wrap="wrap">
              <VStack className="ad-skeleton" data-size="button" />
              <VStack className="ad-skeleton" data-size="button" />
            </HStack>
          </VStack>
        </VStack>
      </VStack>
    </VStack>
  );
}
