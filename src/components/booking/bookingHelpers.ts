import type { AvailableSlot } from '@/lib/availability/engine';
import {
  formatCurrency,
  formatDateLongInTimezone,
  formatDuration,
} from '@/lib/format';
import type {
  PublicServiceDTO,
  PublicSettingsDTO,
  PublicStaffDTO,
} from '@/lib/public-dto';
import type { ServiceAddon } from '@/lib/types';

export type ProofDeliveryMethod = 'web_upload' | 'instagram_dm' | 'none';

const DEFAULT_INSTAGRAM_HANDLE = '@laikona.nailsss';
const DEFAULT_INSTAGRAM_URL = 'https://www.instagram.com/laikona.nailsss/';
export const DEFAULT_SISTER_STUDIO_HANDLE = '@lumiere.beautymx';

export function formatServicePrice(
  priceCents: number,
  isStartingPrice: boolean | undefined,
  currency: 'MXN' | 'USD',
): string {
  const formatted = formatCurrency(priceCents, currency);
  return isStartingPrice ? `Desde ${formatted}` : formatted;
}

export function getStaffScheduleLabel(
  staff: Pick<PublicStaffDTO, 'id' | 'bookingSlug' | 'name'>,
): string | null {
  const key = (staff.bookingSlug || staff.name).trim().toLowerCase();
  if (key === 'karla' || staff.id === 'staff-karla') {
    return 'Lun–Sáb · 10:00 · 1:30 · 4:30';
  }
  if (key === 'paty' || staff.id === 'staff-paty') {
    return 'Lun–Sáb · 10:00 · 1:30 · 4:30';
  }
  if (key === 'tere' || staff.id === 'staff-tere') {
    return 'Lun–Sáb · 2:00 · 4:00 · 6:00';
  }
  return null;
}

export function normalizeInstagramHandle(
  value: string | null | undefined,
  fallback = DEFAULT_INSTAGRAM_HANDLE,
): string {
  const cleaned = value?.trim() ?? '';
  if (!cleaned) return fallback;
  return cleaned.startsWith('@') ? cleaned : `@${cleaned}`;
}

export function resolveInstagramUrl(settings: PublicSettingsDTO): string {
  const configured = settings.instagramUrl?.trim();
  if (configured && configured.startsWith('https://')) {
    return configured;
  }
  const handle = normalizeInstagramHandle(settings.instagramHandle);
  const slug = handle.replace(/^@+/, '').replace(/[^a-zA-Z0-9._]/g, '');
  return slug
    ? `https://www.instagram.com/${encodeURIComponent(slug)}/`
    : DEFAULT_INSTAGRAM_URL;
}

export function resolveDepositAmountCents(
  settings: PublicSettingsDTO,
  primaryService: PublicServiceDTO | undefined,
  extraServices: readonly PublicServiceDTO[],
): number {
  const serviceAmounts = [primaryService, ...extraServices]
    .filter((srv): srv is PublicServiceDTO => Boolean(srv && srv.depositRequired))
    .map((srv) => srv.depositAmountCents);

  if (serviceAmounts.length > 0) {
    return Math.max(...serviceAmounts);
  }
  if (typeof settings.depositAmountCents === 'number' && settings.depositAmountCents > 0) {
    return settings.depositAmountCents;
  }
  return 0;
}

export function hasConfiguredDeposit(
  settings: PublicSettingsDTO,
  depositAmountCents: number,
): boolean {
  if (settings.paymentMode === 'none') return false;
  return Boolean(settings.depositClabe.trim() || depositAmountCents > 0);
}

export function buildInstagramDmSummary(input: {
  settings: PublicSettingsDTO;
  primaryService: PublicServiceDTO | undefined;
  extraServices: readonly PublicServiceDTO[];
  addons: readonly ServiceAddon[];
  slot: AvailableSlot | null;
  timeFormat: '12h' | '24h';
  totalDurationMinutes: number;
  depositAmountCents: number;
  clientName: string;
  clientInstagram: string;
}): string {
  const handle = normalizeInstagramHandle(input.settings.instagramHandle);
  const serviceNames = [
    input.primaryService?.name,
    ...input.extraServices.map((srv) => srv.name),
  ].filter((name): name is string => Boolean(name));
  const addonNames = input.addons.map((addon) => addon.name);
  const dateText = input.slot
    ? formatDateLongInTimezone(input.slot.startAt, input.settings.timezone)
    : 'Por confirmar';
  const timeText = input.slot
    ? input.timeFormat === '24h'
      ? input.slot.localTime24
      : input.slot.localTime12
    : '';
  const depositLabel =
    input.depositAmountCents > 0
      ? formatCurrency(input.depositAmountCents, input.settings.currency)
      : formatCurrency(20000, input.settings.currency);

  const lines = [
    `Hola ${handle}, envío mi comprobante de anticipo (${depositLabel}) para confirmar mi cita en ${input.settings.name}:`,
    `- Servicios: ${serviceNames.join(' + ') || 'Cita de uñas'}`,
    ...(addonNames.length > 0 ? [`- Extras: ${addonNames.join(', ')}`] : []),
    `- Fecha y hora: ${dateText}${timeText ? ` · ${timeText}` : ''} (aprox. ${formatDuration(input.totalDurationMinutes)})`,
    ...(input.slot ? [`- Especialista: ${input.slot.staffName}`] : []),
    ...(input.clientName.trim() ? [`- Clienta: ${input.clientName.trim()}`] : []),
    ...(input.clientInstagram.trim()
      ? [`- Instagram: ${normalizeInstagramHandle(input.clientInstagram, '')}`]
      : []),
  ];
  return lines.join('\n');
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}
