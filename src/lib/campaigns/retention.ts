import { buildWhatsAppLink } from '../format';
import type { Booking, ClientProfile } from '../types';

export interface UpcomingBirthdayCandidate {
  clientId: string;
  fullName: string;
  phoneE164: string;
  instagramHandle: string | null;
  birthday: string;
  daysUntilBirthday: number;
  birthdayMonthDay: string;
  whatsappMessage: string;
  whatsappUrl: string;
}

export interface InactiveReactivationCandidate {
  clientId: string;
  fullName: string;
  phoneE164: string;
  instagramHandle: string | null;
  lastVisitAt: string | null;
  daysSinceLastVisit: number;
  totalVisits: number;
  lastServiceName: string | null;
  whatsappMessage: string;
  whatsappUrl: string;
}

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function parseYmdStrict(dateKey: string): { year: number; month: number; day: number } | null {
  const match = DATE_KEY_RE.exec(dateKey.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function toUtcDayNumber(year: number, month: number, day: number): number {
  return Math.floor(Date.UTC(year, month - 1, day, 0, 0, 0, 0) / MS_PER_DAY);
}

function extractFirstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return 'hola';
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

export function buildBirthdayWhatsAppMessage(params: {
  clientName: string;
  salonName: string;
  bookingUrl: string;
  daysUntilBirthday: number;
}): string {
  const firstName = extractFirstName(params.clientName);
  const whenText =
    params.daysUntilBirthday === 0
      ? '¡Feliz cumpleaños hoy!'
      : params.daysUntilBirthday === 1
        ? '¡Mañana es tu cumpleaños!'
        : `¡Ya casi es tu cumpleaños (en ${params.daysUntilBirthday} días)!`;
  return `Hola ${firstName}, ${whenText} En ${params.salonName} queremos consentirte en tu semana especial. Aparta tu cita aquí: ${params.bookingUrl}`;
}

export function buildReactivationWhatsAppMessage(params: {
  clientName: string;
  salonName: string;
  bookingUrl: string;
  daysSinceLastVisit: number;
  lastServiceName?: string | null;
}): string {
  const firstName = extractFirstName(params.clientName);
  const servicePart = params.lastServiceName?.trim()
    ? ` tu próximo set o retoque de ${params.lastServiceName.trim()}`
    : ' tu próxima cita';
  return `Hola ${firstName}, te extrañamos en ${params.salonName} (hace ${params.daysSinceLastVisit} días de tu última visita). Agenda${servicePart} aquí: ${params.bookingUrl}`;
}

export function findUpcomingBirthdayClients(
  clients: readonly ClientProfile[],
  todayKey: string,
  windowDays = 7,
  options?: { salonName?: string; bookingUrl?: string },
): UpcomingBirthdayCandidate[] {
  const today = parseYmdStrict(todayKey);
  if (!today) return [];

  const safeWindow = Math.max(0, Math.min(365, Math.floor(windowDays)));
  const todayDayNum = toUtcDayNumber(today.year, today.month, today.day);
  const salonName = options?.salonName?.trim() || 'LAIKONA NAILS';
  const bookingUrl = options?.bookingUrl?.trim() || '/reservar';

  const candidates: UpcomingBirthdayCandidate[] = [];

  for (const client of clients) {
    if (!client.birthday) continue;
    const parsedBday = parseYmdStrict(client.birthday);
    if (!parsedBday) continue;

    let minDelta = Number.POSITIVE_INFINITY;
    for (const targetYear of [today.year, today.year + 1]) {
      const effectiveDay =
        parsedBday.month === 2 && parsedBday.day === 29 && !isLeapYear(targetYear)
          ? 28
          : parsedBday.day;
      const candidateDayNum = toUtcDayNumber(targetYear, parsedBday.month, effectiveDay);
      const delta = candidateDayNum - todayDayNum;
      if (delta >= 0 && delta < minDelta) {
        minDelta = delta;
      }
    }

    if (minDelta <= safeWindow) {
      const mm = String(parsedBday.month).padStart(2, '0');
      const dd = String(parsedBday.day).padStart(2, '0');
      const whatsappMessage = buildBirthdayWhatsAppMessage({
        clientName: client.fullName,
        salonName,
        bookingUrl,
        daysUntilBirthday: minDelta,
      });
      candidates.push({
        clientId: client.id,
        fullName: client.fullName,
        phoneE164: client.phoneE164,
        instagramHandle: client.instagramHandle ?? null,
        birthday: client.birthday,
        daysUntilBirthday: minDelta,
        birthdayMonthDay: `${mm}-${dd}`,
        whatsappMessage,
        whatsappUrl: buildWhatsAppLink(client.phoneE164, whatsappMessage),
      });
    }
  }

  return candidates.toSorted((a, b) => {
    const diff = a.daysUntilBirthday - b.daysUntilBirthday;
    return diff !== 0 ? diff : a.fullName.localeCompare(b.fullName, 'es');
  });
}

export function findInactiveReactivationClients(
  clients: readonly ClientProfile[],
  bookings: readonly Booking[],
  todayMs: number,
  inactiveDays = 45,
  options?: {
    salonName?: string;
    bookingUrl?: string;
    serviceNameById?: ReadonlyMap<string, string>;
  },
): InactiveReactivationCandidate[] {
  const safeInactiveDays = Math.max(1, Math.floor(inactiveDays));
  const cutoffMs = todayMs - safeInactiveDays * MS_PER_DAY;
  const salonName = options?.salonName?.trim() || 'LAIKONA NAILS';
  const bookingUrl = options?.bookingUrl?.trim() || '/reservar';

  const candidates: InactiveReactivationCandidate[] = [];

  for (const client of clients) {
    const validBookings = bookings.filter(
      (b) =>
        b.clientId === client.id &&
        b.status !== 'canceled' &&
        b.status !== 'no_show',
    );
    if (validBookings.length === 0) continue;

    const hasRecentOrUpcoming = validBookings.some(
      (b) => new Date(b.startAt).getTime() >= cutoffMs,
    );
    if (hasRecentOrUpcoming) continue;

    let lastVisitMs: number | null = null;
    let lastServiceId: string | null = null;
    let totalVisits = 0;

    for (const b of validBookings) {
      const startMs = new Date(b.startAt).getTime();
      if (Number.isNaN(startMs)) continue;
      if (b.status === 'completed' || (b.status === 'confirmed' && startMs <= todayMs)) {
        totalVisits += 1;
        if (lastVisitMs === null || startMs > lastVisitMs) {
          lastVisitMs = startMs;
          lastServiceId = b.serviceId;
        }
      }
    }

    if (lastVisitMs === null || totalVisits === 0) continue;

    const daysSinceLastVisit = Math.max(
      safeInactiveDays,
      Math.floor((todayMs - lastVisitMs) / MS_PER_DAY),
    );
    const lastServiceName =
      lastServiceId && options?.serviceNameById
        ? (options.serviceNameById.get(lastServiceId) ?? null)
        : null;
    const whatsappMessage = buildReactivationWhatsAppMessage({
      clientName: client.fullName,
      salonName,
      bookingUrl,
      daysSinceLastVisit,
      lastServiceName,
    });

    candidates.push({
      clientId: client.id,
      fullName: client.fullName,
      phoneE164: client.phoneE164,
      instagramHandle: client.instagramHandle ?? null,
      lastVisitAt: new Date(lastVisitMs).toISOString(),
      daysSinceLastVisit,
      totalVisits,
      lastServiceName,
      whatsappMessage,
      whatsappUrl: buildWhatsAppLink(client.phoneE164, whatsappMessage),
    });
  }

  return candidates.toSorted((a, b) => {
    const diff = b.daysSinceLastVisit - a.daysSinceLastVisit;
    return diff !== 0 ? diff : a.fullName.localeCompare(b.fullName, 'es');
  });
}
