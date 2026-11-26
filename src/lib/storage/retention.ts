export const WARN_30D_AGE_DAYS = 335;
export const WARN_7D_AGE_DAYS = 358;
export const PURGE_AGE_DAYS = 365;

const MS_PER_DAY = 86_400_000;
const WARN_30D_AGE_MS = WARN_30D_AGE_DAYS * MS_PER_DAY;
const WARN_7D_AGE_MS = WARN_7D_AGE_DAYS * MS_PER_DAY;
const PURGE_AGE_MS = PURGE_AGE_DAYS * MS_PER_DAY;

export interface RetentionAssetLike {
  id: string;
  storagePath: string;
  createdAt: string;
  retentionWarned30dAt?: string | null;
  retentionWarned7dAt?: string | null;
  purgedAt?: string | null;
}

export interface RetentionClassification<T extends RetentionAssetLike = RetentionAssetLike> {
  warn30d: T[];
  warn7d: T[];
  purgeDue: T[];
}

function hasTimestamp(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function classifyMediaRetention<T extends RetentionAssetLike>(
  assets: readonly T[],
  nowMs: number,
): RetentionClassification<T> {
  const warn30d: T[] = [];
  const warn7d: T[] = [];
  const purgeDue: T[] = [];

  if (!Number.isFinite(nowMs)) {
    return { warn30d, warn7d, purgeDue };
  }

  const seenIds = new Set<string>();

  for (const asset of assets) {
    if (seenIds.has(asset.id)) {
      continue;
    }
    seenIds.add(asset.id);

    if (hasTimestamp(asset.purgedAt)) {
      continue;
    }

    const createdMs = Date.parse(asset.createdAt);
    if (!Number.isFinite(createdMs)) {
      continue;
    }

    const ageMs = nowMs - createdMs;

    if (ageMs >= PURGE_AGE_MS) {
      purgeDue.push(asset);
    } else if (ageMs >= WARN_7D_AGE_MS) {
      if (!hasTimestamp(asset.retentionWarned7dAt)) {
        warn7d.push(asset);
      }
    } else if (ageMs >= WARN_30D_AGE_MS) {
      if (!hasTimestamp(asset.retentionWarned30dAt)) {
        warn30d.push(asset);
      }
    }
  }

  return { warn30d, warn7d, purgeDue };
}
