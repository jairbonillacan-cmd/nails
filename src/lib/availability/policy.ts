export type ManageWindowCheckResult =
  | { allowed: true }
  | { allowed: false; code: 'POLICY_WINDOW'; message: string };

export function checkManagePolicyWindow(params: {
  startAtIso: string;
  nowMs: number;
  minHours: number;
  action: 'cancel' | 'reschedule';
}): ManageWindowCheckResult {
  const hoursUntil = (new Date(params.startAtIso).getTime() - params.nowMs) / 3_600_000;
  if (hoursUntil < params.minHours) {
    const verb = params.action === 'cancel' ? 'cancelar' : 'reagendar';
    return {
      allowed: false,
      code: 'POLICY_WINDOW',
      message: `El límite para ${verb} en línea es de ${params.minHours} horas antes. Escríbenos por WhatsApp para ayudarte.`,
    };
  }
  return { allowed: true };
}
