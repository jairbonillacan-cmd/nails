'use client';

import { useEffect, useRef, useState } from 'react';

export function useCountdownTimer(
  expiresAtMs: number | null,
  onExpire: () => void,
): number {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const onExpireRef = useRef(onExpire);
  const expiredForRef = useRef<number | null>(null);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (!expiresAtMs) return;
    const id = window.setInterval(() => {
      const current = Date.now();
      setNowMs(current);
      if (current >= expiresAtMs && expiredForRef.current !== expiresAtMs) {
        expiredForRef.current = expiresAtMs;
        window.clearInterval(id);
        onExpireRef.current();
      }
    }, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, [expiresAtMs]);

  if (!expiresAtMs) return 0;
  return Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1000));
}
