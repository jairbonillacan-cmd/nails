'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface ClipboardWriterLike {
  writeText: (value: string) => Promise<void>;
}

export interface CopyTimerScheduler {
  setTimeout: (callback: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
}

export interface CopyToClipboardState {
  copied: boolean;
  feedback: string | null;
}

export interface UseCopyToClipboardResult {
  copied: boolean;
  feedback: string | null;
  copy: (value: string, successMessage?: string, fallbackMessage?: string) => Promise<boolean>;
  reset: () => void;
}

interface CopyControllerOptions {
  durationMs?: number;
  clipboard?: ClipboardWriterLike | null;
  scheduler?: CopyTimerScheduler;
}

interface CopyController {
  copy: (value: string, successMessage?: string, fallbackMessage?: string) => Promise<boolean>;
  reset: () => void;
  dispose: () => void;
  getState: () => CopyToClipboardState;
}

const DEFAULT_DURATION_MS = 2400;
const DEFAULT_SUCCESS_MESSAGE = 'Copiado al portapapeles';
const DEFAULT_FALLBACK_MESSAGE =
  'No se pudo copiar automáticamente; selecciona y copia el texto.';

function getDefaultScheduler(): CopyTimerScheduler {
  return {
    setTimeout: (callback, ms) =>
      typeof window !== 'undefined'
        ? window.setTimeout(callback, ms)
        : Number(globalThis.setTimeout(callback, ms)),
    clearTimeout: (id) => {
      if (typeof window !== 'undefined') {
        window.clearTimeout(id);
      } else {
        globalThis.clearTimeout(id);
      }
    },
  };
}

function getDefaultClipboard(): ClipboardWriterLike | null {
  if (typeof navigator === 'undefined') return null;
  return navigator.clipboard ?? null;
}

export async function writeTextToClipboard(
  value: string,
  clipboard?: ClipboardWriterLike | null,
): Promise<boolean> {
  if (value.length === 0) return false;
  const target = clipboard === undefined ? getDefaultClipboard() : clipboard;
  if (!target || typeof target.writeText !== 'function') return false;
  try {
    await target.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export function createCopyToClipboardController(
  onChange: (state: CopyToClipboardState) => void,
  options: CopyControllerOptions = {},
): CopyController {
  const durationMs = options.durationMs ?? DEFAULT_DURATION_MS;
  const scheduler = options.scheduler ?? getDefaultScheduler();
  let state: CopyToClipboardState = { copied: false, feedback: null };
  let timerId: number | null = null;
  let disposed = false;

  const clearTimer = () => {
    if (timerId !== null) {
      scheduler.clearTimeout(timerId);
      timerId = null;
    }
  };

  const emit = (next: CopyToClipboardState) => {
    if (disposed) return;
    state = next;
    onChange(next);
  };

  const reset = () => {
    clearTimer();
    if (!state.copied && state.feedback === null) return;
    emit({ copied: false, feedback: null });
  };

  const copy = async (
    value: string,
    successMessage = DEFAULT_SUCCESS_MESSAGE,
    fallbackMessage = DEFAULT_FALLBACK_MESSAGE,
  ): Promise<boolean> => {
    if (disposed || value.length === 0) return false;
    const ok = await writeTextToClipboard(value, options.clipboard);
    if (disposed) return ok;
    clearTimer();
    emit({ copied: ok, feedback: ok ? successMessage : fallbackMessage });
    if (durationMs > 0) {
      timerId = scheduler.setTimeout(() => {
        timerId = null;
        emit({ copied: false, feedback: null });
      }, durationMs);
    }
    return ok;
  };

  const dispose = () => {
    disposed = true;
    clearTimer();
  };

  return { copy, reset, dispose, getState: () => state };
}

export function useCopyToClipboard(
  durationMs = DEFAULT_DURATION_MS,
): UseCopyToClipboardResult {
  const [state, setState] = useState<CopyToClipboardState>({ copied: false, feedback: null });
  const controllerRef = useRef<CopyController | null>(null);

  useEffect(() => {
    const controller = createCopyToClipboardController(setState, { durationMs });
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    };
  }, [durationMs]);

  const copy = useCallback(
    async (value: string, successMessage?: string, fallbackMessage?: string): Promise<boolean> => {
      if (controllerRef.current) {
        return controllerRef.current.copy(value, successMessage, fallbackMessage);
      }
      return writeTextToClipboard(value);
    },
    [],
  );

  const reset = useCallback(() => {
    controllerRef.current?.reset();
  }, []);

  return { copied: state.copied, feedback: state.feedback, copy, reset };
}
