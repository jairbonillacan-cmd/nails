'use client';

import { useEffect, useState } from 'react';

export function useCurrentClockTick(initialIso: string, intervalMs = 60_000): number {
  const initialMs = Date.parse(initialIso) || 0;
  const [nowMs, setNowMs] = useState<number>(initialMs);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, intervalMs);
    return () => {
      window.clearInterval(id);
    };
  }, [intervalMs]);

  return nowMs;
}
