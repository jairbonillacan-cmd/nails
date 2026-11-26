import type { AvailableSlot, DayAvailabilitySummary } from '@/lib/availability/engine';
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

export interface AvailabilityCacheKeyInput {
  serviceId: string;
  extraServiceIds: readonly string[];
  addonIds: readonly string[];
  staffId: string;
  windowStartDate: string;
}

export interface ClientFieldErrors {
  name: string | null;
  phone: string | null;
}

const DEFAULT_INSTAGRAM_HANDLE = '@laikona.nailsss';
const DEFAULT_INSTAGRAM_URL = 'https://www.instagram.com/laikona.nailsss/';
const MAX_BOOKING_IMAGE_BYTES = 2_500_000;
const ALLOWED_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const ALLOWED_IMAGE_EXT_RE = /\.(png|jpe?g|webp)$/i;
const LOCAL_RASTER_IMAGE_RE = /^\/(?:landing|brand)\/.+\.(?:webp|jpe?g|png|avif)$/i;

export function normalizeUniqueSortedIds(
  ids: readonly string[],
  excludeId?: string,
): string[] {
  const cleanedExclude = excludeId?.trim() ?? '';
  const unique = new Set<string>();
  for (const raw of ids) {
    const trimmed = raw.trim();
    if (trimmed && trimmed !== cleanedExclude) {
      unique.add(trimmed);
    }
  }
  return Array.from(unique).toSorted((a, b) => a.localeCompare(b));
}

export function buildAvailabilityCacheKey(
  input: AvailabilityCacheKeyInput,
): string {
  const serviceId = input.serviceId.trim();
  const extraKey = normalizeUniqueSortedIds(input.extraServiceIds, serviceId).join(',');
  const addonKey = normalizeUniqueSortedIds(input.addonIds).join(',');
  const staffId = input.staffId.trim() || 'any';
  const windowStartDate = input.windowStartDate.trim();
  return `${serviceId}|${extraKey}|${addonKey}|${staffId}|${windowStartDate}`;
}

function stripMxCountryPrefix(digits: string): string {
  if (digits.length === 13 && digits.startsWith('521')) {
    return digits.slice(3);
  }
  if (digits.length === 12 && digits.startsWith('52')) {
    return digits.slice(2);
  }
  return digits;
}

export function extractMxPhoneDigits(raw: string): string {
  return stripMxCountryPrefix(raw.replace(/\D/g, '')).slice(0, 10);
}

export function formatMxPhoneDisplay(raw: string): string {
  const digits = extractMxPhoneDigits(raw);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) {
    return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  }
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 10)}`;
}

export function isValidMxPhone(raw: string): boolean {
  return stripMxCountryPrefix(raw.replace(/\D/g, '')).length === 10;
}

export function validateClientBookingFields(
  name: string,
  phone: string,
): ClientFieldErrors {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return {
    name: words.length >= 2 ? null : 'Escribe tu nombre y apellido.',
    phone: isValidMxPhone(phone) ? null : 'Tu WhatsApp debe tener 10 dígitos.',
  };
}

export function isOptimizableLocalRasterImage(src: string): boolean {
  const trimmed = src.trim();
  if (!trimmed) return false;
  if (
    trimmed.startsWith('data:') ||
    trimmed.startsWith('/api/media/') ||
    trimmed.toLowerCase().endsWith('.svg')
  ) {
    return false;
  }
  return LOCAL_RASTER_IMAGE_RE.test(trimmed);
}

export function resolveEffectiveSelectedDate(
  selectedDate: string,
  days: readonly DayAvailabilitySummary[],
): string {
  if (days.length === 0) return selectedDate;
  const currentDay = days.find((d) => d.date === selectedDate);
  if (
    currentDay &&
    (currentDay.hasSlots || currentDay.publicNote || currentDay.redirectStaffId)
  ) {
    return selectedDate;
  }
  return days.find((d) => d.hasSlots)?.date ?? days[0]?.date ?? selectedDate;
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

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
  timeFormat: '12h' | '24h' = '12h',
): string | null {
  const key = (staff.bookingSlug || staff.name).trim().toLowerCase();
  if (key === 'karla' || staff.id === 'staff-karla') {
    return timeFormat === '24h'
      ? 'Lun–Sáb · 10:00 · 13:30 · 16:30'
      : 'Lun–Sáb · 10:00 · 1:30 · 4:30';
  }
  if (key === 'paty' || staff.id === 'staff-paty') {
    return timeFormat === '24h'
      ? 'Lun–Sáb · 10:00 · 13:30 · 16:30'
      : 'Lun–Sáb · 10:00 · 1:30 · 4:30';
  }
  if (key === 'tere' || staff.id === 'staff-tere') {
    return timeFormat === '24h'
      ? 'Lun–Sáb · 14:00 · 16:00 · 18:00'
      : 'Lun–Sáb · 2:00 · 4:00 · 6:00';
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

export function resolveInstagramDmUrl(settings: Pick<PublicSettingsDTO, 'instagramHandle' | 'instagramUrl'>): string {
  const fromUrl = settings.instagramUrl?.trim().match(/instagram\.com\/([a-zA-Z0-9._]+)/)?.[1] ?? '';
  const fromHandle = settings.instagramHandle?.trim().replace(/^@+/, '') ?? '';
  const fallback = normalizeInstagramHandle(null).replace(/^@+/, '');
  const slug = (fromHandle || fromUrl || fallback).replace(/[^a-zA-Z0-9._]/g, '');
  return slug ? `https://ig.me/m/${encodeURIComponent(slug)}` : DEFAULT_INSTAGRAM_URL;
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

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${Math.max(0, Math.round(bytes))} B`;
  }
  if (bytes < 1_048_576) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function detectImageSignature(
  bytes: Uint8Array,
): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    bytes.byteLength >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (
    bytes.byteLength >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

export async function validateClientImageFile(file: File): Promise<string | null> {
  if (file.size <= 0) {
    return 'El archivo está vacío. Elige una imagen PNG, JPG o WEBP.';
  }
  if (file.size > MAX_BOOKING_IMAGE_BYTES) {
    return `La imagen pesa ${formatFileSize(file.size)} y supera el máximo de 2.5 MB. Comprímela o elige otra.`;
  }
  const declaredMime = file.type.trim().toLowerCase();
  if (declaredMime) {
    if (!ALLOWED_IMAGE_MIMES.has(declaredMime)) {
      return 'Formato no compatible. Sube únicamente una imagen PNG, JPG o WEBP.';
    }
  } else if (!ALLOWED_IMAGE_EXT_RE.test(file.name)) {
    return 'Formato no compatible. Sube únicamente una imagen PNG, JPG o WEBP.';
  }

  try {
    const headerBuffer = await file.slice(0, 12).arrayBuffer();
    const detected = detectImageSignature(new Uint8Array(headerBuffer));
    if (!detected) {
      return 'El archivo no parece ser una imagen PNG, JPG o WEBP válida.';
    }
  } catch {
    return null;
  }
  return null;
}

export function readFileAsDataUrl(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    onProgress?.(12);
    reader.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        const pct = Math.min(95, Math.max(15, Math.round((event.loaded / event.total) * 100)));
        onProgress?.(pct);
      }
    };
    reader.onload = () => {
      onProgress?.(100);
      resolve(String(reader.result || ''));
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}
