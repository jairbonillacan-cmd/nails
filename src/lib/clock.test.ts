import { describe, expect, it } from 'vitest';
import {
  createFixedClock,
  generateBookingCode,
  generateId,
  systemClock,
  type Clock,
} from './clock';

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BOOKING_CODE_RE = /^NL-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

describe('Clock, IDs, and Booking Code generators (Clock / A6 / M6)', () => {
  it('systemClock produces valid timestamps, UUIDs, and unambiguous base32 codes', () => {
    const before = Date.now();
    const now = systemClock.now();
    const nowMs = systemClock.nowMs();
    const after = Date.now();

    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(nowMs).toBeGreaterThanOrEqual(before);
    expect(nowMs).toBeLessThanOrEqual(after + 10);

    expect(systemClock.randomUUID()).toMatch(UUID_V4_RE);
    expect(systemClock.randomCode(0)).toBe('');
    expect(systemClock.randomCode(12)).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/);
  });

  it('generateBookingCode produces unambiguous 6-char Crockford/base32 codes with high entropy', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const code = generateBookingCode(systemClock);
      expect(code).toMatch(BOOKING_CODE_RE);
      expect(code).not.toMatch(/[01IO]/);
      seen.add(code);
    }
    expect(seen.size).toBe(500);
  });

  it('createFixedClock is deterministic, advanceable, and reproducible across instances', () => {
    const clockA = createFixedClock('2026-12-01T15:00:00.000Z', 'seed-alpha');
    const clockB = createFixedClock(new Date('2026-12-01T15:00:00.000Z'), 'seed-alpha');
    const clockC = createFixedClock('2026-12-01T15:00:00.000Z', 'seed-beta');

    expect(clockA.now().toISOString()).toBe('2026-12-01T15:00:00.000Z');
    expect(clockA.nowMs()).toBe(Date.parse('2026-12-01T15:00:00.000Z'));

    const uuidA1 = clockA.randomUUID();
    const uuidA2 = clockA.randomUUID();
    const uuidB1 = clockB.randomUUID();
    const uuidC1 = clockC.randomUUID();

    expect(uuidA1).toMatch(UUID_V4_RE);
    expect(uuidA2).toMatch(UUID_V4_RE);
    expect(uuidA1).toBe(uuidB1);
    expect(uuidA1).not.toBe(uuidA2);
    expect(uuidA1).not.toBe(uuidC1);

    const codeA1 = generateBookingCode(clockA);
    const codeB1 = generateBookingCode(clockB);
    expect(codeA1).toMatch(BOOKING_CODE_RE);
    expect(codeA1).toBe(codeB1);
    expect(generateBookingCode(clockA)).not.toBe(codeA1);

    clockA.advanceMs(60_000);
    expect(clockA.now().toISOString()).toBe('2026-12-01T15:01:00.000Z');

    clockA.setNow('2027-01-01T00:00:00.000Z');
    expect(clockA.now().toISOString()).toBe('2027-01-01T00:00:00.000Z');

    expect(() => createFixedClock('not-a-date')).toThrow();
    expect(() => clockA.setNow('not-a-date')).toThrow();
  });

  it('generateId supports raw UUIDs and prefixed IDs via injected Clock', () => {
    const fixed: Clock = createFixedClock('2026-12-01T15:00:00.000Z', 'ids');
    const raw = generateId(undefined, fixed);
    const prefixed = generateId('bk', fixed);

    expect(raw).toMatch(UUID_V4_RE);
    expect(prefixed.startsWith('bk-')).toBe(true);
    expect(prefixed.slice(3)).toMatch(UUID_V4_RE);
    expect(generateId('cli')).toMatch(/^cli-[0-9a-f-]{36}$/i);
  });
});
