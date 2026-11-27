import {
  buildWhatsAppLink,
  collapseDoublePeriods,
  formatDateShortInTimezone,
  formatTimeInTimezone,
  getDateKeyInTimezone,
} from '../format';
import { selectNextWaitlistCandidate } from '../notifications/cascade';
import type { BookingWithRelations, Service, WaitlistEntry } from '../types';

type FreedSlotMatchKind = 'exact' | 'same_day' | 'general';

export interface FreedSlotWaitlistMatch {
  candidate: WaitlistEntry;
  matchKind: FreedSlotMatchKind;
  waitingCount: number;
  dateKey: string;
  slotTimeLabel: string;
  serviceName: string;
  waMeUrl: string;
}

interface FindFreedSlotWaitlistInput {
  waitlist: readonly WaitlistEntry[];
  booking: Pick<BookingWithRelations, 'serviceId' | 'staffId' | 'startAt'> & {
    service?: Pick<Service, 'name'>;
    staff?: { name: string };
  };
  services?: readonly Pick<Service, 'id' | 'name'>[];
  salonName: string;
  timezone: string;
  nowMs?: number;
}

function isOfferStillValid(entry: WaitlistEntry, nowMs: number): boolean {
  if (!entry.priorityOfferExpiresAt) return true;
  const expiresMs = Date.parse(entry.priorityOfferExpiresAt);
  return Number.isNaN(expiresMs) || expiresMs > nowMs;
}

function compareWaitlistFifo(a: WaitlistEntry, b: WaitlistEntry): number {
  const diff = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  if (diff !== 0) return diff;
  return a.id.localeCompare(b.id);
}

export function findFreedSlotWaitlistMatch(
  input: FindFreedSlotWaitlistInput,
): FreedSlotWaitlistMatch | null {
  const nowMs = input.nowMs ?? Date.now();
  const activeWaiting = input.waitlist
    .filter((entry) => entry.status === 'waiting' && isOfferStillValid(entry, nowMs))
    .toSorted(compareWaitlistFifo);

  if (activeWaiting.length === 0) return null;

  const tz = input.timezone.trim() || 'America/Mexico_City';
  const startDate = new Date(input.booking.startAt);
  const hasValidDate = !Number.isNaN(startDate.getTime());
  const dateKey = hasValidDate ? getDateKeyInTimezone(startDate, tz) : '';
  const slotTimeLabel = hasValidDate
    ? collapseDoublePeriods(formatTimeInTimezone(input.booking.startAt, tz, false))
    : '';
  const dateLabel = hasValidDate
    ? collapseDoublePeriods(formatDateShortInTimezone(input.booking.startAt, tz))
    : '';

  let candidate: WaitlistEntry | null = null;
  let matchKind: FreedSlotMatchKind = 'general';

  if (dateKey) {
    const exact = selectNextWaitlistCandidate(activeWaiting, {
      serviceId: input.booking.serviceId,
      staffId: input.booking.staffId,
      dateKey,
      nowMs,
    });
    if (exact) {
      candidate = exact;
      matchKind = 'exact';
    } else {
      const sameDayCompatible = activeWaiting.find(
        (entry) =>
          entry.desiredDate === dateKey &&
          (!entry.preferredStaffId || entry.preferredStaffId === input.booking.staffId),
      );
      if (sameDayCompatible) {
        candidate = sameDayCompatible;
        matchKind = 'same_day';
      }
    }
  }

  if (!candidate) {
    candidate =
      activeWaiting.find(
        (entry) =>
          !entry.preferredStaffId || entry.preferredStaffId === input.booking.staffId,
      ) ??
      activeWaiting[0] ??
      null;
    matchKind = 'general';
  }

  if (!candidate) return null;

  const candidateServiceName =
    input.services?.find((srv) => srv.id === candidate.serviceId)?.name ??
    input.booking.service?.name ??
    'tu servicio';
  const salonName = input.salonName.trim() || 'el estudio';
  const firstName = candidate.clientName.trim().split(/\s+/)[0] || candidate.clientName.trim();
  const staffPart = input.booking.staff?.name ? ` con ${input.booking.staff.name.trim()}` : '';
  const whenPart =
    dateLabel && slotTimeLabel
      ? `el ${dateLabel} a las ${slotTimeLabel}`
      : dateLabel
        ? `el ${dateLabel}`
        : 'próximamente';

  const message = collapseDoublePeriods(
    `Hola ${firstName}, ¡se acaba de liberar un lugar en ${salonName} para ${candidateServiceName}${staffPart} ${whenPart}! ¿Te gustaría apartarlo?`,
  );

  return {
    candidate,
    matchKind,
    waitingCount: activeWaiting.length,
    dateKey,
    slotTimeLabel,
    serviceName: candidateServiceName,
    waMeUrl: buildWhatsAppLink(candidate.clientPhoneE164, message),
  };
}
