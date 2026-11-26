import { describe, expect, it } from 'vitest';
import {
  hashOwnerPin,
  isValidOwnerPinFormat,
  verifyOwnerPin,
} from './auth-pin';

describe('Owner Authorization PIN (scrypt + timingSafeEqual)', () => {
  it('validates 4 to 6 numeric digits strictly', () => {
    expect(isValidOwnerPinFormat('1234')).toBe(true);
    expect(isValidOwnerPinFormat('12345')).toBe(true);
    expect(isValidOwnerPinFormat('004921')).toBe(true);
    expect(isValidOwnerPinFormat('123')).toBe(false);
    expect(isValidOwnerPinFormat('1234567')).toBe(false);
    expect(isValidOwnerPinFormat('12ab')).toBe(false);
    expect(isValidOwnerPinFormat('')).toBe(false);
  });

  it('hashes with unique random salt per invocation and verifies correctly', () => {
    const hashA = hashOwnerPin('2468');
    const hashB = hashOwnerPin('2468');

    expect(hashA).not.toBe(hashB);
    expect(hashA).toMatch(/^scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(hashA).not.toContain('2468');

    expect(verifyOwnerPin('2468', hashA)).toBe(true);
    expect(verifyOwnerPin('2468', hashB)).toBe(true);
    expect(verifyOwnerPin('2469', hashA)).toBe(false);
    expect(verifyOwnerPin('0000', hashA)).toBe(false);
    expect(verifyOwnerPin('abc', hashA)).toBe(false);
  });

  it('rejects null, empty, or malformed hashes safely', () => {
    expect(verifyOwnerPin('1234', null)).toBe(false);
    expect(verifyOwnerPin('1234', undefined)).toBe(false);
    expect(verifyOwnerPin('1234', '')).toBe(false);
    expect(verifyOwnerPin('1234', 'plain:1234')).toBe(false);
    expect(verifyOwnerPin('1234', 'scrypt$16384$8$1$short$deadbeef')).toBe(false);
    expect(() => hashOwnerPin('12')).toThrow();
  });
});
