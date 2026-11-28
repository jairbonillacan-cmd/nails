import { afterEach, describe, expect, it } from 'vitest';
import {
  ADMIN_CACHE_KEYS,
  clearAdminCacheForTests,
  getAdminCacheSnapshot,
  invalidateAdminDomain,
  mutateAdminCache,
  type AdminCacheDomain,
} from './useAdminCache';

const SAMPLE_KEYS = {
  overview: ADMIN_CACHE_KEYS.overview,
  bookingsExact: ADMIN_CACHE_KEYS.bookings,
  bookingsRange: '/api/admin/bookings?from=2026-11-23&to=2026-11-29&staff=all',
  reportsMonth: ADMIN_CACHE_KEYS.reports('month'),
  reportsWeek: ADMIN_CACHE_KEYS.reports('7d'),
  clientsExact: ADMIN_CACHE_KEYS.clients,
  clientsInactive: ADMIN_CACHE_KEYS.clientsInactive(45),
  packages: ADMIN_CACHE_KEYS.packages,
  campaigns: ADMIN_CACHE_KEYS.campaigns,
  waThreads: ADMIN_CACHE_KEYS.whatsappThreads('unread', 'sofia'),
  waDetail: ADMIN_CACHE_KEYS.whatsappThreadDetail('thread-1'),
  waReminders: ADMIN_CACHE_KEYS.whatsappReminders,
  waSettings: ADMIN_CACHE_KEYS.whatsappSettings,
} as const;

type SampleKeyName = keyof typeof SAMPLE_KEYS;

function seedAllCacheKeys(): void {
  for (const [name, key] of Object.entries(SAMPLE_KEYS)) {
    mutateAdminCache(key, { seeded: name });
  }
}

function collectClearedKeys(): SampleKeyName[] {
  const cleared: SampleKeyName[] = [];
  for (const [name, key] of Object.entries(SAMPLE_KEYS) as Array<[SampleKeyName, string]>) {
    if (getAdminCacheSnapshot(key) === undefined) {
      cleared.push(name);
    }
  }
  return cleared.toSorted();
}

afterEach(() => {
  clearAdminCacheForTests();
});

describe('invalidateAdminDomain', () => {
  const matrix: ReadonlyArray<{
    domain: AdminCacheDomain;
    expectedCleared: readonly SampleKeyName[];
  }> = [
    {
      domain: 'bookings',
      expectedCleared: [
        'bookingsExact',
        'bookingsRange',
        'campaigns',
        'clientsExact',
        'clientsInactive',
        'packages',
        'reportsMonth',
        'reportsWeek',
        'waDetail',
        'waReminders',
        'waThreads',
      ],
    },
    {
      domain: 'cash',
      expectedCleared: ['bookingsExact', 'bookingsRange', 'reportsMonth', 'reportsWeek'],
    },
    {
      domain: 'clients',
      expectedCleared: [
        'bookingsExact',
        'bookingsRange',
        'campaigns',
        'clientsExact',
        'clientsInactive',
        'packages',
        'waDetail',
        'waThreads',
      ],
    },
    {
      domain: 'packages',
      expectedCleared: [
        'bookingsExact',
        'bookingsRange',
        'packages',
        'reportsMonth',
        'reportsWeek',
      ],
    },
    {
      domain: 'campaigns',
      expectedCleared: [
        'campaigns',
        'clientsExact',
        'clientsInactive',
        'waDetail',
        'waThreads',
      ],
    },
    {
      domain: 'staff',
      expectedCleared: ['bookingsExact', 'bookingsRange', 'reportsMonth', 'reportsWeek'],
    },
    {
      domain: 'services',
      expectedCleared: [
        'bookingsExact',
        'bookingsRange',
        'packages',
        'reportsMonth',
        'reportsWeek',
      ],
    },
    {
      domain: 'availability',
      expectedCleared: ['bookingsExact', 'bookingsRange', 'reportsMonth', 'reportsWeek'],
    },
    {
      domain: 'whatsapp',
      expectedCleared: ['waDetail', 'waReminders', 'waSettings', 'waThreads'],
    },
    {
      domain: 'settings',
      expectedCleared: [
        'bookingsExact',
        'bookingsRange',
        'campaigns',
        'reportsMonth',
        'reportsWeek',
        'waSettings',
      ],
    },
  ];

  for (const { domain, expectedCleared } of matrix) {
    it(`invalidates every derived cache prefix for domain "${domain}" without blanking overview`, () => {
      seedAllCacheKeys();
      invalidateAdminDomain(domain);
      expect(getAdminCacheSnapshot(SAMPLE_KEYS.overview)).toEqual({ seeded: 'overview' });
      expect(collectClearedKeys()).toEqual([...expectedCleared].toSorted());
    });
  }

  it('merges and deduplicates prefixes when multiple domains are passed together', () => {
    seedAllCacheKeys();
    invalidateAdminDomain('cash', 'whatsapp');
    expect(getAdminCacheSnapshot(SAMPLE_KEYS.overview)).toEqual({ seeded: 'overview' });
    expect(collectClearedKeys()).toEqual([
      'bookingsExact',
      'bookingsRange',
      'reportsMonth',
      'reportsWeek',
      'waDetail',
      'waReminders',
      'waSettings',
      'waThreads',
    ]);
  });

  it('omits the removed dead operations cache key', () => {
    expect('operations' in ADMIN_CACHE_KEYS).toBe(false);
  });
});
