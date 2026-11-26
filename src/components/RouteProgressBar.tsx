'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { useRouteProgress } from '@/lib/hooks/useRouteProgress';

export function RouteProgressBar() {
  const { status, progress } = useRouteProgress();
  const isIdle = status === 'idle';
  const percent = Math.round(progress * 100);

  return (
    <VStack
      className="fx-nav-progress"
      role="progressbar"
      aria-label="Cargando página"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-hidden={isIdle ? true : undefined}
      data-state={status}
      gap={0}
    >
      <VStack
        className="fx-nav-progress-bar"
        style={{ transform: `scaleX(${progress})` }}
        gap={0}
      />
    </VStack>
  );
}
