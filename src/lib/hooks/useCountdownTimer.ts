'use client';

import { useEffect, useRef, useState } from 'react';

interface ClockState {
  expiresAtMs: number | null;
  nowMs: number;
}

export function useCountdownTimer(
  expiresAtMs: number | null,
  onExpire: () => void,
): number {
  const [clock, setClock] = useState<ClockState | null>(null);
  const onExpireRef = useRef(onExpire);
  const expiredForRef = useRef<number | null>(null);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (!expiresAtMs) return;
    let id = 0;
    const tick = () => {
      const current = Date.now();
      setClock({ expiresAtMs, nowMs: current });
      if (current >= expiresAtMs && expiredForRef.current !== expiresAtMs) {
        expiredForRef.current = expiresAtMs;
        window.clearInterval(id);
        onExpireRef.current();
      }
    };
    id = window.setInterval(tick, 1000);
    tick();
    return () => {
      window.clearInterval(id);
    };
  }, [expiresAtMs]);

  if (!expiresAtMs || !clock || clock.expiresAtMs !== expiresAtMs) return 0;
  return Math.max(0, Math.ceil((expiresAtMs - clock.nowMs) / 1000));
}
