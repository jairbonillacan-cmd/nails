export interface RateLimitConfig {
  bucket: string;
  key: string;
  limit: number;
  windowMs: number;
  nowMs?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAtMs: number;
  retryAfterSeconds: number;
}

const MAX_BUCKETS = 5_000;

interface RateLimitBucketEntry {
  timestamps: number[];
  windowMs: number;
  lastSeenMs: number;
}

declare global {
  var nailsRateLimitStore: Map<string, RateLimitBucketEntry> | undefined;
  var nailsRateLimitTestBypass: boolean | undefined;
}

function getStore(): Map<string, RateLimitBucketEntry> {
  if (!globalThis.nailsRateLimitStore) {
    globalThis.nailsRateLimitStore = new Map<string, RateLimitBucketEntry>();
  }
  return globalThis.nailsRateLimitStore;
}

function pruneStore(store: Map<string, RateLimitBucketEntry>, nowMs: number): void {
  for (const [k, entry] of store.entries()) {
    const cutoff = nowMs - entry.windowMs;
    const active = entry.timestamps.filter((t) => t > cutoff);
    if (active.length === 0) {
      store.delete(k);
    } else if (active.length !== entry.timestamps.length) {
      entry.timestamps = active;
    }
  }

  if (store.size <= MAX_BUCKETS) return;

  const entriesByAge = Array.from(store.entries()).toSorted(
    (a, b) => a[1].lastSeenMs - b[1].lastSeenMs,
  );
  const excess = store.size - MAX_BUCKETS;
  for (let i = 0; i < excess; i += 1) {
    const pair = entriesByAge[i];
    if (pair) {
      store.delete(pair[0]);
    }
  }
}

export function getRequestIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp.slice(0, 128);
  const cfIp = request.headers.get('cf-connecting-ip')?.trim();
  if (cfIp) return cfIp.slice(0, 128);
  return 'unknown';
}

export function setRateLimiterBypassForTests(bypass: boolean): void {
  if (process.env.NODE_ENV !== 'test') return;
  globalThis.nailsRateLimitTestBypass = bypass;
}

export function resetRateLimiterForTests(): void {
  globalThis.nailsRateLimitStore?.clear();
  globalThis.nailsRateLimitTestBypass = false;
}

export function checkRateLimit(config: RateLimitConfig): RateLimitResult {
  const nowMs = config.nowMs ?? Date.now();
  const safeLimit = Math.max(1, Math.floor(config.limit));
  const safeWindowMs = Math.max(1_000, Math.floor(config.windowMs));

  if (
    process.env.NODE_ENV === 'test' &&
    globalThis.nailsRateLimitTestBypass === true
  ) {
    return {
      allowed: true,
      remaining: safeLimit,
      resetAtMs: nowMs + safeWindowMs,
      retryAfterSeconds: 0,
    };
  }

  const store = getStore();
  if (store.size >= MAX_BUCKETS) {
    pruneStore(store, nowMs);
  }

  const compositeKey = `${config.bucket}:${config.key || 'unknown'}`;
  const cutoff = nowMs - safeWindowMs;
  const existing = store.get(compositeKey);
  const activeTimestamps = existing
    ? existing.timestamps.filter((t) => t > cutoff)
    : [];

  if (activeTimestamps.length >= safeLimit) {
    const oldest = activeTimestamps[0] ?? nowMs;
    const resetAtMs = oldest + safeWindowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAtMs - nowMs) / 1_000));
    store.set(compositeKey, {
      timestamps: activeTimestamps,
      windowMs: safeWindowMs,
      lastSeenMs: nowMs,
    });
    return {
      allowed: false,
      remaining: 0,
      resetAtMs,
      retryAfterSeconds,
    };
  }

  activeTimestamps.push(nowMs);
  store.set(compositeKey, {
    timestamps: activeTimestamps,
    windowMs: safeWindowMs,
    lastSeenMs: nowMs,
  });

  const oldest = activeTimestamps[0] ?? nowMs;
  return {
    allowed: true,
    remaining: Math.max(0, safeLimit - activeTimestamps.length),
    resetAtMs: oldest + safeWindowMs,
    retryAfterSeconds: 0,
  };
}
