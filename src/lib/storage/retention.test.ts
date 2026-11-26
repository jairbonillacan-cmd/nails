import { describe, expect, it } from 'vitest';
import {
  classifyMediaRetention,
  PURGE_AGE_DAYS,
  WARN_30D_AGE_DAYS,
  WARN_7D_AGE_DAYS,
  type RetentionAssetLike,
} from './retention';

const MS_PER_DAY = 86_400_000;
const NOW_MS = Date.parse('2026-11-25T12:00:00.000Z');

function makeAsset(
  id: string,
  ageDays: number,
  overrides: Partial<RetentionAssetLike> = {},
): RetentionAssetLike {
  return {
    id,
    storagePath: `proofs/${id}.png`,
    createdAt: new Date(NOW_MS - Math.round(ageDays * MS_PER_DAY)).toISOString(),
    retentionWarned30dAt: null,
    retentionWarned7dAt: null,
    purgedAt: null,
    ...overrides,
  };
}

describe('12-month media retention classifier', () => {
  it('exposes exact retention age thresholds', () => {
    expect(WARN_30D_AGE_DAYS).toBe(335);
    expect(WARN_7D_AGE_DAYS).toBe(358);
    expect(PURGE_AGE_DAYS).toBe(365);
  });

  it('classifies exact boundary ages accurately', () => {
    const assets: RetentionAssetLike[] = [
      makeAsset('fresh-0', 0),
      makeAsset('just-under-335', 334.9999),
      makeAsset('exact-335', 335),
      makeAsset('mid-345', 345),
      makeAsset('just-under-358', 357.9999),
      makeAsset('exact-358', 358),
      makeAsset('just-under-365', 364.9999),
      makeAsset('exact-365', 365),
      makeAsset('overdue-400', 400),
    ];

    const result = classifyMediaRetention(assets, NOW_MS);

    expect(result.warn30d.map((a) => a.id)).toEqual([
      'exact-335',
      'mid-345',
      'just-under-358',
    ]);
    expect(result.warn7d.map((a) => a.id)).toEqual([
      'exact-358',
      'just-under-365',
    ]);
    expect(result.purgeDue.map((a) => a.id)).toEqual([
      'exact-365',
      'overdue-400',
    ]);
  });

  it('never re-warns already-warned stages and allows 30d-warned asset to enter 7d stage', () => {
    const assets: RetentionAssetLike[] = [
      makeAsset('already-warned-30d', 340, {
        retentionWarned30dAt: '2026-11-01T00:00:00.000Z',
      }),
      makeAsset('warned-30d-now-7d', 360, {
        retentionWarned30dAt: '2026-11-01T00:00:00.000Z',
      }),
      makeAsset('already-warned-7d', 360, {
        retentionWarned30dAt: '2026-11-01T00:00:00.000Z',
        retentionWarned7dAt: '2026-11-20T00:00:00.000Z',
      }),
      makeAsset('warned-both-now-purge', 366, {
        retentionWarned30dAt: '2026-11-01T00:00:00.000Z',
        retentionWarned7dAt: '2026-11-20T00:00:00.000Z',
      }),
    ];

    const result = classifyMediaRetention(assets, NOW_MS);

    expect(result.warn30d).toEqual([]);
    expect(result.warn7d.map((a) => a.id)).toEqual(['warned-30d-now-7d']);
    expect(result.purgeDue.map((a) => a.id)).toEqual(['warned-both-now-purge']);
  });

  it('skips already-purged, invalid-date, future-dated, and duplicate-id assets safely', () => {
    const assets: RetentionAssetLike[] = [
      makeAsset('already-purged', 450, {
        purgedAt: '2026-11-24T00:00:00.000Z',
      }),
      {
        id: 'invalid-date',
        storagePath: 'proofs/bad.png',
        createdAt: 'not-a-date',
        retentionWarned30dAt: null,
        retentionWarned7dAt: null,
        purgedAt: null,
      },
      makeAsset('future-asset', -10),
      makeAsset('dup-purge', 370),
      makeAsset('dup-purge', 370),
    ];

    const result = classifyMediaRetention(assets, NOW_MS);

    expect(result.warn30d).toEqual([]);
    expect(result.warn7d).toEqual([]);
    expect(result.purgeDue.map((a) => a.id)).toEqual(['dup-purge']);
  });

  it('returns empty buckets if nowMs is not finite', () => {
    const result = classifyMediaRetention([makeAsset('old', 400)], Number.NaN);
    expect(result).toEqual({ warn30d: [], warn7d: [], purgeDue: [] });
  });
});
