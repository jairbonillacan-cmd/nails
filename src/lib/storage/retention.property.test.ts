import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  classifyMediaRetention,
  PURGE_AGE_DAYS,
  WARN_30D_AGE_DAYS,
  WARN_7D_AGE_DAYS,
  type RetentionAssetLike,
} from './retention';

const MS_PER_DAY = 86_400_000;
const BASE_NOW_MS = Date.parse('2026-11-25T12:00:00.000Z');

const optionalIsoArb = fc.option(
  fc
    .integer({ min: BASE_NOW_MS - 400 * MS_PER_DAY, max: BASE_NOW_MS })
    .map((ms) => new Date(ms).toISOString()),
  { nil: null },
);

const assetArb: fc.Arbitrary<RetentionAssetLike> = fc
  .record({
    id: fc.uuid(),
    ageMs: fc.integer({ min: -30 * MS_PER_DAY, max: 800 * MS_PER_DAY }),
    retentionWarned30dAt: optionalIsoArb,
    retentionWarned7dAt: optionalIsoArb,
    purgedAt: optionalIsoArb,
  })
  .map((item) => ({
    id: item.id,
    storagePath: `proofs/${item.id}.png`,
    createdAt: new Date(BASE_NOW_MS - item.ageMs).toISOString(),
    retentionWarned30dAt: item.retentionWarned30dAt,
    retentionWarned7dAt: item.retentionWarned7dAt,
    purgedAt: item.purgedAt,
  }));

describe('12-month media retention invariants (fast-check)', () => {
  it('proves retention age guards, idempotency, non-duplication, and pairwise disjointness', () => {
    fc.assert(
      fc.property(fc.array(assetArb, { maxLength: 60 }), (assets) => {
        const result = classifyMediaRetention(assets, BASE_NOW_MS);

        const warn30dIds = new Set(result.warn30d.map((a) => a.id));
        const warn7dIds = new Set(result.warn7d.map((a) => a.id));
        const purgeIds = new Set(result.purgeDue.map((a) => a.id));

        expect(warn30dIds.size).toBe(result.warn30d.length);
        expect(warn7dIds.size).toBe(result.warn7d.length);
        expect(purgeIds.size).toBe(result.purgeDue.length);

        for (const id of warn30dIds) {
          expect(warn7dIds.has(id)).toBe(false);
          expect(purgeIds.has(id)).toBe(false);
        }
        for (const id of warn7dIds) {
          expect(purgeIds.has(id)).toBe(false);
        }

        for (const asset of result.warn30d) {
          const ageMs = BASE_NOW_MS - Date.parse(asset.createdAt);
          expect(ageMs).toBeGreaterThanOrEqual(WARN_30D_AGE_DAYS * MS_PER_DAY);
          expect(ageMs).toBeLessThan(WARN_7D_AGE_DAYS * MS_PER_DAY);
          expect(asset.retentionWarned30dAt).toBeNull();
          expect(asset.purgedAt).toBeNull();
        }

        for (const asset of result.warn7d) {
          const ageMs = BASE_NOW_MS - Date.parse(asset.createdAt);
          expect(ageMs).toBeGreaterThanOrEqual(WARN_7D_AGE_DAYS * MS_PER_DAY);
          expect(ageMs).toBeLessThan(PURGE_AGE_DAYS * MS_PER_DAY);
          expect(asset.retentionWarned7dAt).toBeNull();
          expect(asset.purgedAt).toBeNull();
        }

        for (const asset of result.purgeDue) {
          const ageMs = BASE_NOW_MS - Date.parse(asset.createdAt);
          expect(ageMs).toBeGreaterThanOrEqual(PURGE_AGE_DAYS * MS_PER_DAY);
          expect(asset.purgedAt).toBeNull();
        }

        for (const asset of assets) {
          const ageMs = BASE_NOW_MS - Date.parse(asset.createdAt);

          if (ageMs < WARN_30D_AGE_DAYS * MS_PER_DAY) {
            expect(warn30dIds.has(asset.id)).toBe(false);
            expect(warn7dIds.has(asset.id)).toBe(false);
            expect(purgeIds.has(asset.id)).toBe(false);
          }

          if (ageMs < PURGE_AGE_DAYS * MS_PER_DAY) {
            expect(purgeIds.has(asset.id)).toBe(false);
          }

          if (asset.purgedAt !== null) {
            expect(warn30dIds.has(asset.id)).toBe(false);
            expect(warn7dIds.has(asset.id)).toBe(false);
            expect(purgeIds.has(asset.id)).toBe(false);
          }

          if (asset.retentionWarned30dAt !== null) {
            expect(warn30dIds.has(asset.id)).toBe(false);
          }

          if (asset.retentionWarned7dAt !== null) {
            expect(warn7dIds.has(asset.id)).toBe(false);
          }
        }
      }),
      { numRuns: 250 },
    );
  });

  it('proves applying warnings and purges makes subsequent classification a strict no-op for handled assets', () => {
    fc.assert(
      fc.property(fc.array(assetArb, { maxLength: 40 }), (assets) => {
        const firstPass = classifyMediaRetention(assets, BASE_NOW_MS);
        const nowIso = new Date(BASE_NOW_MS).toISOString();

        const warn30dIds = new Set(firstPass.warn30d.map((a) => a.id));
        const warn7dIds = new Set(firstPass.warn7d.map((a) => a.id));
        const purgeIds = new Set(firstPass.purgeDue.map((a) => a.id));

        const updatedAssets = assets.map((asset) => {
          if (purgeIds.has(asset.id)) {
            return { ...asset, purgedAt: nowIso };
          }
          if (warn7dIds.has(asset.id)) {
            return { ...asset, retentionWarned7dAt: nowIso };
          }
          if (warn30dIds.has(asset.id)) {
            return { ...asset, retentionWarned30dAt: nowIso };
          }
          return asset;
        });

        const secondPass = classifyMediaRetention(updatedAssets, BASE_NOW_MS);
        expect(secondPass.warn30d).toEqual([]);
        expect(secondPass.warn7d).toEqual([]);
        expect(secondPass.purgeDue).toEqual([]);
      }),
      { numRuns: 200 },
    );
  });
});
