'use client';

import { useEffect, useRef } from 'react';

export function useExternalSync(
  syncKey: string,
  task: (signal: AbortSignal, key: string) => Promise<void>,
): void {
  const taskRef = useRef(task);

  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  useEffect(() => {
    const controller = new AbortController();
    void taskRef.current(controller.signal, syncKey);
    return () => {
      controller.abort();
    };
  }, [syncKey]);
}
