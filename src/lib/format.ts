export function formatCurrency(cents: number, currency: 'MXN' | 'USD' = 'MXN'): string {
  const amount = cents / 100;
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins === 0 ? `${hrs} h` : `${hrs} h ${mins} min`;
}

export function formatUnitCount(count: number, unit: string): string {
  const base = unit.trim();
  if (count === 1 || base.length < 3 || !/[a-záéíóúñ]$/i.test(base) || /s$/i.test(base)) {
    return `${count} ${base}`;
  }
  if (/[aeiouáéó]$/i.test(base)) return `${count} ${base}s`;
  if (/z$/i.test(base)) return `${count} ${base.slice(0, -1)}ces`;
  return `${count} ${base}es`;
}

export function normalizePhoneE164(raw: string, defaultCountryCode = '+52'): string {
  const cleaned = raw.replace(/[^\d+]/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.length === 10) return `${defaultCountryCode}${cleaned}`;
  return `+${cleaned}`;
}

export function formatTimeInTimezone(
  iso: string,
  timeZone: string,
  use24h = false,
): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: !use24h,
  }).format(new Date(iso));
}

export function formatDateLongInTimezone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

export function formatDateShortInTimezone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(iso));
}

export function getDateKeyInTimezone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

export function buildWhatsAppLink(phoneE164: string, message: string): string {
  const digits = phoneE164.replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
