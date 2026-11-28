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

const CLIENT_EMAIL_RE =
  /^(?:[A-Za-z0-9_'+-]+\.)*[A-Za-z0-9_'+-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

export function isAcceptableClientEmail(raw: string): boolean {
  const email = raw.trim();
  return email.length === 0 || CLIENT_EMAIL_RE.test(email);
}

export type ProofDeliveryMethod = 'web_upload' | 'web_link' | 'instagram_dm' | 'none';

export interface AvailabilityCacheKeyInput {
  serviceId: string;
  extraServiceIds: readonly string[];
  addonIds: readonly string[];
  staffId: string;
  windowStartDate: string;
  offer?: string | null;
}

export interface ClientFieldErrors {
  name: string | null;
  phone: string | null;
  email: string | null;
  birthday: string | null;
}

export interface ClientContactInput {
  name: string;
  phone: string;
  email: string;
  birthday: string;
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
  const offer = input.offer?.trim() ?? '';
  const base = `${serviceId}|${extraKey}|${addonKey}|${staffId}|${windowStartDate}`;
  return offer ? `${base}|offer:${offer}` : base;
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

export function formatBirthdayInput(raw: string): string {
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function birthdayInputToIso(display: string, todayKey: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  const isRealDate =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  if (!isRealDate || year < 1900 || iso > todayKey) return null;
  return iso;
}

export function validateClientBookingFields(
  input: ClientContactInput,
  todayKey: string,
): ClientFieldErrors {
  const words = input.name.trim().split(/\s+/).filter(Boolean);
  const birthday = input.birthday.trim();
  return {
    name: words.length >= 2 ? null : 'Escribe tu nombre y apellido.',
    phone: isValidMxPhone(input.phone) ? null : 'Tu WhatsApp debe tener 10 dígitos.',
    email: isAcceptableClientEmail(input.email) ? null : 'Revisa tu correo, parece incompleto.',
    birthday:
      !birthday || birthdayInputToIso(birthday, todayKey)
        ? null
        : 'Escribe tu cumpleaños como día/mes/año, por ejemplo 15/08/1997.',
  };
}

export function hasClientFieldErrors(errors: ClientFieldErrors): boolean {
  return Boolean(errors.name || errors.phone || errors.email || errors.birthday);
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
      : 'Lun–Sáb · 10:00 a.m. · 1:30 p.m. · 4:30 p.m.';
  }
  if (key === 'paty' || staff.id === 'staff-paty') {
    return timeFormat === '24h'
      ? 'Lun–Sáb · 10:00 · 13:30 · 16:30'
      : 'Lun–Sáb · 10:00 a.m. · 1:30 p.m. · 4:30 p.m.';
  }
  if (key === 'tere' || staff.id === 'staff-tere') {
    return timeFormat === '24h'
      ? 'Lun–Sáb · 14:00 · 16:00 · 18:00'
      : 'Lun–Sáb · 2:00 p.m. · 4:00 p.m. · 6:00 p.m.';
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
  const effectiveDepositCents =
    input.depositAmountCents > 0
      ? input.depositAmountCents
      : (input.settings.depositAmountCents ?? 0);
  const depositSuffix =
    effectiveDepositCents > 0
      ? ` (${formatCurrency(effectiveDepositCents, input.settings.currency)})`
      : '';

  const lines = [
    `Hola ${handle}, envío mi comprobante de anticipo${depositSuffix} para confirmar mi cita en ${input.settings.name}:`,
    `- Servicios: ${serviceNames.join(' + ') || 'Cita de uñas'}`,
    ...(addonNames.length > 0 ? [`- Extras: ${addonNames.join(', ')}`] : []),
    `- Fecha y hora: ${dateText}${timeText ? ` · ${timeText}` : ''} (aprox. ${formatDuration(input.totalDurationMinutes)})`,
    ...(input.slot ? [`- Profesional: ${input.slot.staffName}`] : []),
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
    return `No pudimos achicar esta imagen (${formatFileSize(file.size)}); el máximo es 2.5 MB. Prueba con una captura de pantalla.`;
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

const UPLOAD_TARGET_BYTES = 1_800_000;
const UPLOAD_MAX_EDGE_PX = 2048;
const UPLOAD_JPEG_QUALITIES = [0.86, 0.78, 0.68, 0.58] as const;

export function fitWithinEdge(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const safeW = Math.max(1, Math.round(width));
  const safeH = Math.max(1, Math.round(height));
  const longest = Math.max(safeW, safeH);
  if (longest <= maxEdge) return { width: safeW, height: safeH };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.min(maxEdge, Math.round(safeW * scale))),
    height: Math.max(1, Math.min(maxEdge, Math.round(safeH * scale))),
  };
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
  });
}

async function shrinkImageFile(file: File): Promise<File> {
  if (file.size <= UPLOAD_TARGET_BYTES) return file;
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  try {
    let size = fitWithinEdge(bitmap.width, bitmap.height, UPLOAD_MAX_EDGE_PX);
    const canvas = document.createElement('canvas');
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'foto';
    for (let pass = 0; pass < 2; pass += 1) {
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, size.width, size.height);
      ctx.drawImage(bitmap, 0, 0, size.width, size.height);
      for (const quality of UPLOAD_JPEG_QUALITIES) {
        const blob = await canvasToJpeg(canvas, quality);
        if (blob && blob.size <= UPLOAD_TARGET_BYTES) {
          return new File([blob], `${baseName}.jpg`, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
        }
      }
      size = fitWithinEdge(size.width, size.height, Math.round(UPLOAD_MAX_EDGE_PX * 0.66));
    }
    return file;
  } finally {
    bitmap.close();
  }
}

export async function prepareClientImageFile(
  file: File,
): Promise<{ file: File; error: string | null }> {
  const ready = await shrinkImageFile(file);
  return { file: ready, error: await validateClientImageFile(ready) };
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

const LOCAL_TIME_24_RE = /^\d{2}:\d{2}$/;

export function findMatchingSlotInAvailability(input: {
  days: readonly DayAvailabilitySummary[];
  targetSlot: string;
  preferredDate?: string | null;
  preferredStaffId?: string | null;
}): { slot: AvailableSlot; date: string } | null {
  const cleanTarget = input.targetSlot.trim();
  if (!cleanTarget || input.days.length === 0) return null;

  const targetMs = Date.parse(cleanTarget);
  const hasTargetMs = Number.isFinite(targetMs);
  const isLocalTimeOnly = LOCAL_TIME_24_RE.test(cleanTarget);
  const preferredDate = input.preferredDate?.trim() || null;
  const preferredStaff =
    input.preferredStaffId && input.preferredStaffId !== 'any'
      ? input.preferredStaffId.trim()
      : null;

  const orderedDays: DayAvailabilitySummary[] = [];
  if (preferredDate) {
    const primaryDay = input.days.find((day) => day.date === preferredDate);
    if (primaryDay) orderedDays.push(primaryDay);
  }
  for (const day of input.days) {
    if (day.date !== preferredDate) orderedDays.push(day);
  }

  for (const day of orderedDays) {
    const matches = day.slots.filter((slot) => {
      if (slot.startAt === cleanTarget) return true;
      if (`${slot.staffId}-${slot.startAt}` === cleanTarget) return true;
      if (hasTargetMs && Date.parse(slot.startAt) === targetMs) return true;
      if (isLocalTimeOnly && day.date === preferredDate && slot.localTime24 === cleanTarget) {
        return true;
      }
      return false;
    });
    if (matches.length === 0) continue;
    const preferredMatch = preferredStaff
      ? (matches.find(
          (slot) =>
            slot.staffId === preferredStaff || slot.availableStaffIds.includes(preferredStaff),
        ) ?? matches[0])
      : matches[0];
    if (preferredMatch) {
      return { slot: preferredMatch, date: day.date };
    }
  }

  return null;
}

export function findAlternativeSlotsForDate(
  days: readonly DayAvailabilitySummary[],
  preferredDate?: string | null,
  limit = 3,
): AvailableSlot[] {
  if (days.length === 0 || limit <= 0) return [];
  const cleanDate = preferredDate?.trim() || null;
  const orderedDays: DayAvailabilitySummary[] = [];
  if (cleanDate) {
    const sameDay = days.find((day) => day.date === cleanDate);
    if (sameDay) orderedDays.push(sameDay);
    for (const day of days) {
      if (day.date > cleanDate) orderedDays.push(day);
    }
    for (const day of days) {
      if (day.date < cleanDate) orderedDays.push(day);
    }
  } else {
    orderedDays.push(...days);
  }

  const seen = new Set<string>();
  const collected: AvailableSlot[] = [];
  for (const day of orderedDays) {
    for (const slot of day.slots) {
      const key = `${slot.staffId}-${slot.startAt}`;
      if (seen.has(key)) continue;
      seen.add(key);
      collected.push(slot);
      if (collected.length >= limit) return collected;
    }
  }
  return collected;
}
