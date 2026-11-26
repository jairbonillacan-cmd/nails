'use client';

import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { WifiOff } from 'lucide-react';
import { useServiceWorker } from '@/lib/hooks/useServiceWorker';

export function PwaOfflineBootstrap() {
  const { isOffline } = useServiceWorker({ register: true });

  if (!isOffline) {
    return null;
  }

  return (
    <HStack
      role="status"
      aria-live="polite"
      align="center"
      gap={2}
      className="pt-offline-pill fx-fade-up"
    >
      <WifiOff size={15} aria-hidden="true" />
      <Text type="supporting" color="inherit" weight="semibold">
        Sin conexión · Mostrando datos guardados
      </Text>
    </HStack>
  );
}
