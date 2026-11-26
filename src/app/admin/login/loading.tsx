import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { LANDING_ASSETS } from '@/components/landing/landingContent';
import { SkeletonBlock } from '@/components/ui/SkeletonBlock';

const ROLE_SLOTS = [0, 1, 2] as const;

export default function AdminLoginLoading() {
  return (
    <VStack
      as="main"
      className="ad-login-wrap"
      gap={0}
      role="status"
      aria-busy="true"
      aria-label="Cargando"
    >
      <Text className="rb-sr-only">Cargando…</Text>
      <VStack className="ad-login-frame" gap={0}>
        <VStack className="ad-login-mobile-bar" gap={0} aria-hidden="true" />

        <VStack className="ad-login-brand" justify="between" gap={6} aria-hidden="true">
          <img
            src={LANDING_ASSETS.logoWhite}
            alt=""
            width={132}
            height={38}
            className="ad-logo"
          />
          <VStack className="sk-bar" data-size="xs" data-w="60" data-on="cherry" />
        </VStack>

        <VStack className="ad-login-panel" justify="between" gap={5}>
          <VStack gap={5}>
            <HStack justify="between" align="center" gap={2}>
              <Text color="inherit" className="sk-eyebrow">
                Cargando…
              </Text>
              <SkeletonBlock width="5.5rem" height="2.25rem" radius="rounded" index={0} />
            </HStack>

            <VStack gap={2} aria-hidden="true">
              <SkeletonBlock width="45%" height="0.875rem" radius={1} index={1} />
              <SkeletonBlock width="72%" height="2.25rem" radius={2} index={2} />
              <SkeletonBlock width="94%" height="1rem" radius={1} index={3} />
            </VStack>

            <VStack gap={3} aria-hidden="true">
              <SkeletonBlock width="100%" height="3.25rem" radius={2} index={4} />
              <SkeletonBlock width="100%" height="3rem" radius={2} index={5} />
            </VStack>

            <VStack gap={0} className="ad-sk-card" aria-hidden="true">
              {ROLE_SLOTS.map((slot) => (
                <HStack key={slot} gap={3} align="center" className="ad-sk-row">
                  <SkeletonBlock width="2.25rem" height="2.25rem" radius="rounded" index={slot + 5} />
                  <VStack gap={1.5} className="rb-grow">
                    <SkeletonBlock width="56%" height="0.875rem" radius={1} index={slot + 6} />
                    <SkeletonBlock width="78%" height="0.75rem" radius={1} index={slot + 7} />
                  </VStack>
                </HStack>
              ))}
            </VStack>
          </VStack>

          <HStack justify="between" align="center" className="ad-login-foot" aria-hidden="true">
            <SkeletonBlock width="7rem" height="1rem" radius={1} index={8} />
            <SkeletonBlock width="8rem" height="1rem" radius={1} index={9} />
          </HStack>
        </VStack>
      </VStack>
    </VStack>
  );
}
