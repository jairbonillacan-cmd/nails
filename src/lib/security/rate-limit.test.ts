import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkRateLimit,
  getRequestIp,
  resetRateLimiterForTests,
  setRateLimiterBypassForTests,
} from './rate-limit';

describe('Sliding-window rate limiter', () => {
  beforeEach(() => {
    resetRateLimiterForTests();
  });

  afterEach(() => {
    resetRateLimiterForTests();
  });

  it('allows up to limit requests within window and returns Retry-After when exceeded', () => {
    const startMs = 1_700_000_000_000;
    const first = checkRateLimit({
      bucket: 'test:bookings',
      key: '203.0.113.10',
      limit: 3,
      windowMs: 60_000,
      nowMs: startMs,
    });
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(2);
    expect(first.retryAfterSeconds).toBe(0);

    const second = checkRateLimit({
      bucket: 'test:bookings',
      key: '203.0.113.10',
      limit: 3,
      windowMs: 60_000,
      nowMs: startMs + 5_000,
    });
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(1);

    const third = checkRateLimit({
      bucket: 'test:bookings',
      key: '203.0.113.10',
      limit: 3,
      windowMs: 60_000,
      nowMs: startMs + 10_000,
    });
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);

    const blocked = checkRateLimit({
      bucket: 'test:bookings',
      key: '203.0.113.10',
      limit: 3,
      windowMs: 60_000,
      nowMs: startMs + 15_000,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetAtMs).toBe(startMs + 60_000);
    expect(blocked.retryAfterSeconds).toBe(45);

    const otherIp = checkRateLimit({
      bucket: 'test:bookings',
      key: '203.0.113.11',
      limit: 3,
      windowMs: 60_000,
      nowMs: startMs + 15_000,
    });
    expect(otherIp.allowed).toBe(true);
    expect(otherIp.remaining).toBe(2);

    const afterSlide = checkRateLimit({
      bucket: 'test:bookings',
      key: '203.0.113.10',
      limit: 3,
      windowMs: 60_000,
      nowMs: startMs + 60_001,
    });
    expect(afterSlide.allowed).toBe(true);
    expect(afterSlide.remaining).toBe(0);
  });

  it('extracts client IP prioritizing cf-connecting-ip over x-real-ip and x-forwarded-for (SEC-04)', () => {
    const cfWinsReq = new Request('http://localhost:3000/api/bookings', {
      headers: {
        'x-forwarded-for': '203.0.113.99, 10.0.0.1',
        'x-real-ip': '203.0.113.88',
        'cf-connecting-ip': '198.51.100.42',
      },
    });
    expect(getRequestIp(cfWinsReq)).toBe('198.51.100.42');

    const realIpWinsReq = new Request('http://localhost:3000/api/bookings', {
      headers: {
        'x-forwarded-for': '203.0.113.99, 10.0.0.1',
        'x-real-ip': '198.51.100.8',
      },
    });
    expect(getRequestIp(realIpWinsReq)).toBe('198.51.100.8');

    const forwardedReq = new Request('http://localhost:3000/api/bookings', {
      headers: { 'x-forwarded-for': '198.51.100.7, 10.0.0.1' },
    });
    expect(getRequestIp(forwardedReq)).toBe('198.51.100.7');

    const realIpReq = new Request('http://localhost:3000/api/bookings', {
      headers: { 'x-real-ip': '198.51.100.8' },
    });
    expect(getRequestIp(realIpReq)).toBe('198.51.100.8');

    const emptyReq = new Request('http://localhost:3000/api/bookings');
    expect(getRequestIp(emptyReq)).toBe('unknown');
  });

  it('only bypasses via explicit test helper and never via request headers', () => {
    const startMs = 1_700_000_000_000;
    checkRateLimit({
      bucket: 'test:bypass',
      key: '198.51.100.20',
      limit: 1,
      windowMs: 60_000,
      nowMs: startMs,
    });
    expect(
      checkRateLimit({
        bucket: 'test:bypass',
        key: '198.51.100.20',
        limit: 1,
        windowMs: 60_000,
        nowMs: startMs + 1_000,
      }).allowed,
    ).toBe(false);

    setRateLimiterBypassForTests(true);
    expect(
      checkRateLimit({
        bucket: 'test:bypass',
        key: '198.51.100.20',
        limit: 1,
        windowMs: 60_000,
        nowMs: startMs + 1_000,
      }).allowed,
    ).toBe(true);

    setRateLimiterBypassForTests(false);
    expect(
      checkRateLimit({
        bucket: 'test:bypass',
        key: '198.51.100.20',
        limit: 1,
        windowMs: 60_000,
        nowMs: startMs + 1_000,
      }).allowed,
    ).toBe(false);
  });
});
