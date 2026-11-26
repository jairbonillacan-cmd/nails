import { describe, expect, it, vi } from 'vitest';
import {
  createCopyToClipboardController,
  writeTextToClipboard,
  type ClipboardWriterLike,
  type CopyTimerScheduler,
  type CopyToClipboardState,
} from './useCopyToClipboard';

function createFakeTimerScheduler() {
  let nextId = 1;
  const timers = new Map<number, { callback: () => void; ms: number }>();

  const scheduler: CopyTimerScheduler = {
    setTimeout: vi.fn((callback: () => void, ms: number) => {
      const id = nextId++;
      timers.set(id, { callback, ms });
      return id;
    }),
    clearTimeout: vi.fn((id: number) => {
      timers.delete(id);
    }),
  };

  return {
    scheduler,
    timers,
    flushAll() {
      for (const [id, entry] of Array.from(timers.entries())) {
        timers.delete(id);
        entry.callback();
      }
    },
  };
}

describe('writeTextToClipboard', () => {
  it('writes non-empty text and returns true when clipboard resolves', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const ok = await writeTextToClipboard('012345678901234567', { writeText });
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith('012345678901234567');
  });

  it('returns false without calling clipboard when value is empty', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await writeTextToClipboard('', { writeText })).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('returns false gracefully when clipboard is unavailable or rejects', async () => {
    expect(await writeTextToClipboard('hola', null)).toBe(false);
    const failingClipboard: ClipboardWriterLike = {
      writeText: vi.fn().mockRejectedValue(new Error('Permission denied')),
    };
    expect(await writeTextToClipboard('hola', failingClipboard)).toBe(false);
  });
});

describe('createCopyToClipboardController', () => {
  it('sets copied state and feedback, then resets after durationMs', async () => {
    const fake = createFakeTimerScheduler();
    const states: CopyToClipboardState[] = [];
    const clipboard: ClipboardWriterLike = { writeText: vi.fn().mockResolvedValue(undefined) };
    const controller = createCopyToClipboardController((next) => states.push(next), {
      durationMs: 3000,
      clipboard,
      scheduler: fake.scheduler,
    });

    expect(await controller.copy('CLABE-123', 'CLABE copiada')).toBe(true);
    expect(controller.getState()).toEqual({ copied: true, feedback: 'CLABE copiada' });
    expect(fake.timers.size).toBe(1);
    expect(Array.from(fake.timers.values())[0]?.ms).toBe(3000);

    fake.flushAll();
    expect(controller.getState()).toEqual({ copied: false, feedback: null });
    expect(states).toEqual([
      { copied: true, feedback: 'CLABE copiada' },
      { copied: false, feedback: null },
    ]);
  });

  it('reports fallback feedback with copied=false when clipboard fails', async () => {
    const fake = createFakeTimerScheduler();
    const clipboard: ClipboardWriterLike = {
      writeText: vi.fn().mockRejectedValue(new Error('Blocked')),
    };
    const controller = createCopyToClipboardController(() => undefined, {
      durationMs: 2500,
      clipboard,
      scheduler: fake.scheduler,
    });

    expect(await controller.copy('secret', 'Ok', 'Copia manualmente')).toBe(false);
    expect(controller.getState()).toEqual({ copied: false, feedback: 'Copia manualmente' });
    expect(fake.timers.size).toBe(1);

    fake.flushAll();
    expect(controller.getState()).toEqual({ copied: false, feedback: null });
  });

  it('cancels prior pending timer when copy is invoked rapidly', async () => {
    const fake = createFakeTimerScheduler();
    const clipboard: ClipboardWriterLike = { writeText: vi.fn().mockResolvedValue(undefined) };
    const controller = createCopyToClipboardController(() => undefined, {
      durationMs: 2000,
      clipboard,
      scheduler: fake.scheduler,
    });

    await controller.copy('first', 'Primero');
    await controller.copy('second', 'Segundo');

    expect(fake.scheduler.clearTimeout).toHaveBeenCalledTimes(1);
    expect(fake.timers.size).toBe(1);
    expect(controller.getState()).toEqual({ copied: true, feedback: 'Segundo' });
  });

  it('clears pending timer on manual reset and ignores redundant resets', async () => {
    const fake = createFakeTimerScheduler();
    const onChange = vi.fn();
    const clipboard: ClipboardWriterLike = { writeText: vi.fn().mockResolvedValue(undefined) };
    const controller = createCopyToClipboardController(onChange, {
      durationMs: 2000,
      clipboard,
      scheduler: fake.scheduler,
    });

    controller.reset();
    expect(onChange).not.toHaveBeenCalled();

    await controller.copy('https://laikona.example/reservar', 'Link copiado');
    expect(fake.timers.size).toBe(1);

    controller.reset();
    expect(fake.timers.size).toBe(0);
    expect(controller.getState()).toEqual({ copied: false, feedback: null });
    expect(onChange).toHaveBeenCalledTimes(2);

    controller.reset();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('ignores empty input without emitting state changes or scheduling timers', async () => {
    const fake = createFakeTimerScheduler();
    const onChange = vi.fn();
    const clipboard: ClipboardWriterLike = { writeText: vi.fn().mockResolvedValue(undefined) };
    const controller = createCopyToClipboardController(onChange, {
      clipboard,
      scheduler: fake.scheduler,
    });

    expect(await controller.copy('')).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
    expect(fake.timers.size).toBe(0);
  });

  it('suppresses late updates and clears timers when disposed during an in-flight copy', async () => {
    const fake = createFakeTimerScheduler();
    const onChange = vi.fn();
    const deferred: { resolve: (() => void) | null } = { resolve: null };
    const clipboard: ClipboardWriterLike = {
      writeText: vi.fn(
        () => new Promise<void>((resolve) => {
          deferred.resolve = resolve;
        }),
      ),
    };
    const controller = createCopyToClipboardController(onChange, { durationMs: 2000, clipboard, scheduler: fake.scheduler });

    const pending = controller.copy('in-flight', 'Copiado');
    controller.dispose();
    deferred.resolve?.();

    expect(await pending).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
    expect(fake.timers.size).toBe(0);
  });
});
