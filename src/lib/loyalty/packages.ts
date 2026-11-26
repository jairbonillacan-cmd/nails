import type { ClientPackage } from '../types';

export interface ClientPackageBalance {
  totalSessions: number;
  usedSessions: number;
  remainingSessions: number;
  isExpired: boolean;
  canRedeem: boolean;
  effectiveStatus: ClientPackage['status'];
}

export function isPackageExpired(
  pkg: Pick<ClientPackage, 'expiresAt'>,
  nowMs = Date.now(),
): boolean {
  if (!pkg.expiresAt) return false;
  const expMs = new Date(pkg.expiresAt).getTime();
  if (Number.isNaN(expMs)) return false;
  return expMs <= nowMs;
}

export function computeClientPackageBalance(
  pkg: Pick<ClientPackage, 'totalSessions' | 'usedSessions' | 'expiresAt' | 'status'>,
  nowMs = Date.now(),
): ClientPackageBalance {
  const totalSessions = Math.max(0, Math.floor(pkg.totalSessions));
  const usedSessions = Math.max(0, Math.min(totalSessions, Math.floor(pkg.usedSessions)));
  const remainingSessions = Math.max(0, totalSessions - usedSessions);
  const expired = isPackageExpired(pkg, nowMs);

  let effectiveStatus: ClientPackage['status'] = pkg.status;
  if (pkg.status === 'canceled') {
    effectiveStatus = 'canceled';
  } else if (remainingSessions === 0) {
    effectiveStatus = 'exhausted';
  } else if (expired || pkg.status === 'expired') {
    effectiveStatus = 'expired';
  } else {
    effectiveStatus = 'active';
  }

  const canRedeem = effectiveStatus === 'active' && remainingSessions > 0 && !expired;

  return {
    totalSessions,
    usedSessions,
    remainingSessions,
    isExpired: expired || effectiveStatus === 'expired',
    canRedeem,
    effectiveStatus,
  };
}

export function canRedeemPackageSession(
  pkg: Pick<ClientPackage, 'totalSessions' | 'usedSessions' | 'expiresAt' | 'status'>,
  nowMs = Date.now(),
): boolean {
  return computeClientPackageBalance(pkg, nowMs).canRedeem;
}
