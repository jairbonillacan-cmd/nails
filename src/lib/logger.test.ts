import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  logError,
  logInfo,
  logWarn,
  redactPii,
  setLoggerSinkForTests,
  type StructuredLogEntry,
} from './logger';

describe('Structured JSON Logger with PII & secret redaction', () => {
  afterEach(() => {
    setLoggerSinkForTests(null);
    vi.restoreAllMocks();
  });

  it('stays silent in NODE_ENV=test when no custom sink is injected', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    logInfo('test_silent_info', { ok: true });
    logWarn('test_silent_warn', { ok: true });
    logError('test_silent_error', { error: new Error('boom') });

    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('redacts phones, emails, tokens, secrets, ownerPin, OTP, and authorization headers', () => {
    const entries: StructuredLogEntry[] = [];
    setLoggerSinkForTests((entry) => {
      entries.push(entry);
    });

    logWarn('webhook_failure', {
      phone: '+522224123987',
      email: 'sofia.ramirez@ejemplo.mx',
      authorization: 'Bearer super-secret-jwt-token',
      ownerPin: '1234',
      ownerPinHash: 'scrypt$16384$8$1$abc$def',
      otp: '987654',
      demoCode: '112233',
      nested: {
        clientToken: 'tok-xyz',
        message: 'Falló envío a sofia@ejemplo.mx y +52 222 412 3987 con Bearer abcdef123',
      },
      error: new Error('Auth failed for user@ejemplo.mx (+522229998877)'),
    });

    expect(entries).toHaveLength(1);
    const serialized = JSON.stringify(entries[0]);
    expect(entries[0]?.level).toBe('warn');
    expect(entries[0]?.event).toBe('webhook_failure');

    expect(serialized).not.toContain('4123987');
    expect(serialized).not.toContain('sofia.ramirez');
    expect(serialized).not.toContain('super-secret-jwt-token');
    expect(serialized).not.toContain('1234');
    expect(serialized).not.toContain('scrypt$');
    expect(serialized).not.toContain('987654');
    expect(serialized).not.toContain('112233');
    expect(serialized).not.toContain('tok-xyz');
    expect(serialized).not.toContain('abcdef123');
    expect(serialized).not.toContain('2229998877');

    expect(entries[0]?.context.phone).toBe('***987');
    expect(entries[0]?.context.email).toBe('s***@ejemplo.mx');
    expect(entries[0]?.context.authorization).toBe('[REDACTED]');
    expect(entries[0]?.context.ownerPin).toBe('[REDACTED]');
    expect(entries[0]?.context.otp).toBe('[REDACTED]');
    expect(entries[0]?.context.demoCode).toBe('[REDACTED]');
  });

  it('preserves ISO dates and handles circular references cleanly', () => {
    const obj: Record<string, unknown> = { dateKey: '2026-11-25' };
    obj.self = obj;
    const redacted = redactPii(obj) as Record<string, unknown>;
    expect(redacted.dateKey).toBe('2026-11-25');
    expect(redacted.self).toBe('[CIRCULAR]');
  });
});
