import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { SkeletonBlock } from '@/components/ui/SkeletonBlock';

const STAFF_COLS = [0, 1, 2] as const;
const HOUR_ROWS = [0, 1, 2, 3, 4, 5] as const;

export default function AdminCitasLoading() {
  return (
    <VStack
      className="ad-page"
      gap={4}
      role="status"
      aria-busy="true"
      aria-label="Cargando agenda del salón"
    >
      <Text className="rb-sr-only">Cargando agenda del salón…</Text>

      <HStack justify="between" align="end" wrap="wrap" gap={3} className="ad-page-head">
        <VStack gap={1.5}>
          <SkeletonBlock width="8.5rem" height="2.25rem" radius={2} index={0} />
          <SkeletonBlock width="min(100%, 22rem)" height="0.875rem" radius={1} index={1} />
        </VStack>
        <HStack gap={2} aria-hidden="true">
          <SkeletonBlock width="8rem" height="2rem" radius={2} index={2} />
          <SkeletonBlock width="7rem" height="2rem" radius={2} index={3} />
        </HStack>
      </HStack>

      <HStack gap={4} className="ad-cal-kpi-strip" aria-hidden="true">
        <SkeletonBlock width="5rem" height="1.25rem" radius={1} index={0} />
        <SkeletonBlock width="6.5rem" height="1.25rem" radius={1} index={1} />
        <SkeletonBlock width="5.5rem" height="1.25rem" radius={1} index={2} />
      </HStack>

      <VStack className="ad-sk-card" gap={0} aria-hidden="true">
        <HStack justify="between" align="center" padding={4} gap={3} wrap="wrap">
          <SkeletonBlock width="14rem" height="1.5rem" radius={2} index={0} />
          <HStack gap={2}>
            <SkeletonBlock width="4rem" height="1.75rem" radius={2} index={1} />
            <SkeletonBlock width="4.5rem" height="1.75rem" radius={2} index={2} />
            <SkeletonBlock width="4.5rem" height="1.75rem" radius={2} index={3} />
          </HStack>
        </HStack>

        <HStack gap={3} paddingInline={4} paddingBlockEnd={3}>
          {STAFF_COLS.map((col) => (
            <VStack key={col} gap={2} className="rb-grow">
              <SkeletonBlock width="100%" height="2.5rem" radius={2} index={col} />
              {HOUR_ROWS.map((row) => (
                <SkeletonBlock
                  key={row}
                  width="100%"
                  height={row % 2 === 0 ? '3.5rem' : '2.25rem'}
                  radius={2}
                  index={col + row}
                />
              ))}
            </VStack>
          ))}
        </HStack>
      </VStack>
    </VStack>
  );
}
