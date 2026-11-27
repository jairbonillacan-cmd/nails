import { DEFAULT_TOUCH_UP_DAYS, normalizeTouchUpDays } from '@/lib/booking/recurrence';

export const DEFAULT_DEPOSIT_INSTRUCTIONS =
  'Cuando hagas la transferencia, sube aquí la captura. El equipo la revisa y te confirma por WhatsApp; no hace falta escribirnos.';

export { DEFAULT_TOUCH_UP_DAYS };

interface CitaLandingSettingsLike {
  showBookingQr?: boolean;
  touchUpDays?: number;
}

export function resolveDepositInstructions(
  depositInstructions: string | null | undefined,
): string {
  const trimmed = depositInstructions?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : DEFAULT_DEPOSIT_INSTRUCTIONS;
}

export function resolveBookingInstructionsText(
  bookingInstructionsText: string | null | undefined,
): string | null {
  const trimmed = bookingInstructionsText?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveShowBookingQr(
  landingContent: CitaLandingSettingsLike | null | undefined,
): boolean {
  return landingContent?.showBookingQr !== false;
}

export function resolveTouchUpDays(
  landingContent: CitaLandingSettingsLike | null | undefined,
): number {
  return normalizeTouchUpDays(landingContent?.touchUpDays);
}

export function formatTouchUpActionLabel(touchUpDays: number): string {
  return `Agendar siguiente retoque (+${touchUpDays} días)`;
}

export function formatTouchUpSubtitle(
  serviceName: string,
  staffName: string,
  touchUpDays: number,
): string {
  return `Dejamos prellenado ${serviceName} con ${staffName} en ${touchUpDays} días para que apartes en un toque.`;
}
