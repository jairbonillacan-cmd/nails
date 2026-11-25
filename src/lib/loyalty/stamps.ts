import type { LoyaltyProgram, LoyaltyStamp } from '../types';

export interface ClientLoyaltySummary {
  currentStamps: number;
  stampsRequired: number;
  remainingForReward: number;
  isRewardReady: boolean;
  isNearReward: boolean;
  totalStamps: number;
  redemptionsAvailable: number;
  rewardLabel: string;
  programName: string;
}

export function canAwardStamp(
  stamps: readonly LoyaltyStamp[],
  params: { clientId: string; programId: string; stampedDate: string },
): boolean {
  const clientId = params.clientId.trim();
  const programId = params.programId.trim();
  const stampedDate = params.stampedDate.trim();
  if (!clientId || !programId || !stampedDate) {
    return false;
  }
  return !stamps.some(
    (s) =>
      s.clientId === clientId &&
      s.programId === programId &&
      s.stampedDate === stampedDate,
  );
}

function buildRewardLabel(
  program: LoyaltyProgram,
  rewardServiceName?: string | null,
): string {
  if (program.rewardType === 'free_service') {
    const cleanName = rewardServiceName?.trim();
    return cleanName ? `${cleanName} gratis` : '1 servicio gratis';
  }
  const pct =
    program.discountPercent !== null && Number.isFinite(program.discountPercent)
      ? Math.max(1, Math.min(100, Math.round(program.discountPercent)))
      : 50;
  return `${pct}% de descuento en tu siguiente cita`;
}

export function computeClientLoyaltySummary(
  program: LoyaltyProgram,
  stamps: readonly LoyaltyStamp[],
  clientId: string,
  rewardServiceName?: string | null,
): ClientLoyaltySummary {
  const stampsRequired = Math.max(1, Math.floor(program.stampsRequired));
  const uniqueDates = new Set<string>();
  for (const stamp of stamps) {
    if (stamp.clientId === clientId && stamp.programId === program.id) {
      const dateKey = stamp.stampedDate.trim();
      if (dateKey) {
        uniqueDates.add(dateKey);
      }
    }
  }

  const totalStamps = uniqueDates.size;
  const redemptionsAvailable = Math.floor(totalStamps / stampsRequired);
  const isRewardReady = redemptionsAvailable > 0;
  const currentStamps = isRewardReady ? stampsRequired : totalStamps;
  const remainingForReward = isRewardReady ? 0 : stampsRequired - currentStamps;
  const isNearReward = remainingForReward > 0 && remainingForReward <= 2;

  return {
    currentStamps,
    stampsRequired,
    remainingForReward,
    isRewardReady,
    isNearReward,
    totalStamps,
    redemptionsAvailable,
    rewardLabel: buildRewardLabel(program, rewardServiceName),
    programName: program.name,
  };
}
