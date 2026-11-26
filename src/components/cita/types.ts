import type { BookingWithRelations } from '@/lib/types';
import type {
  PublicServiceDTO,
  PublicSettingsDTO,
  PublicStaffDTO,
} from '@/lib/public-dto';
import { buildWhatsAppLink } from '@/lib/format';

export type PublicManageBooking = Omit<BookingWithRelations, 'staff' | 'service'> & {
  staff: PublicStaffDTO;
  service: PublicServiceDTO;
  extraServices?: PublicServiceDTO[];
};

export interface CalendarAddLinks {
  google: string;
  outlook: string;
  office365: string;
  icsDownload: string;
}

const MAX_PROOF_FILE_BYTES = 2_500_000;

const ALLOWED_PROOF_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

const ALLOWED_PROOF_EXT_RE = /\.(png|jpe?g|webp)$/i;

export function validateProofImageFile(file: File): string | null {
  if (file.size <= 0) {
    return 'El archivo seleccionado está vacío. Elige otra captura.';
  }
  const mime = file.type.trim().toLowerCase();
  const hasValidMime = mime ? ALLOWED_PROOF_MIME_TYPES.has(mime) : false;
  const hasValidExt = ALLOWED_PROOF_EXT_RE.test(file.name);
  if (!hasValidMime && !(mime === '' && hasValidExt)) {
    return 'Formato no compatible. Sube una imagen PNG, JPG o WEBP.';
  }
  if (file.size > MAX_PROOF_FILE_BYTES) {
    const sizeMb = (file.size / 1_000_000).toFixed(1);
    return `La imagen pesa ${sizeMb} MB. El tamaño máximo permitido es 2.5 MB.`;
  }
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function buildPolicyHelpWhatsAppUrl(params: {
  booking: Pick<PublicManageBooking, 'bookingCode' | 'service'>;
  settings: Pick<PublicSettingsDTO, 'name' | 'whatsappNumber'>;
  minHours: number;
  fallbackUrl: string;
}): string {
  const phone = params.settings.whatsappNumber.trim();
  if (!phone) return params.fallbackUrl;
  const message = `Hola ${params.settings.name}, necesito ayuda con mi cita ${params.booking.bookingCode} (${params.booking.service.name}) porque faltan menos de ${params.minHours} h para mi horario.`;
  return buildWhatsAppLink(phone, message);
}

export function resolveSafeHttpUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

export function isDisplayableMediaUrl(value: string | null | undefined): boolean {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return false;
  return (
    trimmed.startsWith('/api/media/') ||
    trimmed.startsWith('/gallery/') ||
    trimmed.startsWith('/landing/') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://')
  );
}

export function appendManageTokenToMediaUrl(
  url: string | null | undefined,
  manageToken: string,
): string | null {
  const trimmed = url?.trim() ?? '';
  if (!trimmed) return null;
  const cleanToken = manageToken.trim();
  if (!trimmed.startsWith('/api/media/') || !cleanToken) {
    return trimmed;
  }
  if (/(?:^|[?&])token=/.test(trimmed)) {
    return trimmed;
  }
  const separator = trimmed.includes('?') ? '&' : '?';
  return `${trimmed}${separator}token=${encodeURIComponent(cleanToken)}`;
}
