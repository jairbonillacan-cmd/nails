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

const INVARIANT_UNITS = new Set(['ml', 'l', 'lt', 'g', 'gr', 'kg', 'mg', 'oz', 'cm', 'mm', 'm', 'ud', 'uds']);

function pluralizeUnit(unit: string, count: number): string {
  const trimmed = unit.trim();
  if (!trimmed) return count === 1 ? 'pieza' : 'piezas';
  if (count === 1) return trimmed;
  const lower = trimmed.toLowerCase();
  if (INVARIANT_UNITS.has(lower) || lower.endsWith('.')) return trimmed;
  if (lower.endsWith('s') || lower.endsWith('x')) return trimmed;
  if (lower.endsWith('z')) return `${trimmed.slice(0, -1)}ces`;
  if (/[aeiouáéíóú]$/.test(lower)) return `${trimmed}s`;
  if (/(?:set|kit|tip|pad|clip|pack)$/.test(lower)) return `${trimmed}s`;
  return `${trimmed}es`;
}

export function formatUnitCount(count: number, unit: string): string {
  return `${count} ${pluralizeUnit(unit, count)}`;
}

export function formatPhoneDisplay(phoneE164: string): string {
  const digits = phoneE164.replace(/\D/g, '');
  const national = digits.startsWith('52') && digits.length === 12 ? digits.slice(2) : null;
  if (!national) return phoneE164;
  return `${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
}

export function formatBirthdayDisplay(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return isoDate;
  const [, y, m, d] = match;
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12)),
  );
}

export function formatDateRangeDisplay(startKey: string, endKey: string): string {
  const toDate = (key: string) => {
    const [y = 2026, m = 1, d = 1] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12));
  };
  const start = toDate(startKey);
  const end = toDate(endKey);
  const dayMonth = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const withYear = new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const clean = (text: string) => text.replace(/\./g, '');
  return `${clean((sameYear ? dayMonth : withYear).format(start))} – ${clean(withYear.format(end))}`;
}

export function normalizePhoneE164(raw: string, defaultCountryCode = '+52'): string {
  const cleaned = raw.replace(/[^\d+]/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.length === 10) return `${defaultCountryCode}${cleaned}`;
  return `+${cleaned}`;
}

export function formatDateKeyDisplay(dateKey: string, style: 'long' | 'short' = 'long'): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!match) return dateKey;
  const [, y, m, d] = match;
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'UTC',
    weekday: style,
    day: 'numeric',
    month: style,
  }).format(new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12)));
}

export function collapseDoublePeriods(text: string): string {
  return text.replace(/([ap]\.\s?m\.)\./g, '$1');
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
