import type { BookingWithRelations, SalonSettings } from './types';

const UTF8_ENCODER = new TextEncoder();
const RFC5545_MAX_OCTETS = 75;

export interface GenerateBookingIcsOptions {
  method?: 'REQUEST' | 'CANCEL';
  sequence?: number;
  dtStampIso?: string;
}

function formatIcsDateUtc(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

export function escapeIcsText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

export function foldIcsLine(line: string, maxOctets: number = RFC5545_MAX_OCTETS): string {
  const limit = Math.max(8, maxOctets);
  const segments: string[] = [];
  let current = '';
  let currentBytes = 0;

  for (const char of line) {
    const charBytes = UTF8_ENCODER.encode(char).length;
    if (currentBytes > 0 && currentBytes + charBytes > limit) {
      segments.push(current);
      current = ` ${char}`;
      currentBytes = 1 + charBytes;
    } else {
      current += char;
      currentBytes += charBytes;
    }
  }

  segments.push(current);
  return segments.join('\r\n');
}

export function generateBookingIcs(
  booking: BookingWithRelations,
  settings: SalonSettings,
  manageUrl: string,
  options?: GenerateBookingIcsOptions,
): string {
  const method: 'REQUEST' | 'CANCEL' =
    options?.method ?? (booking.status === 'canceled' ? 'CANCEL' : 'REQUEST');
  const defaultSequence =
    method === 'CANCEL'
      ? booking.rescheduledFromId
        ? 2
        : 1
      : booking.rescheduledFromId
        ? 1
        : 0;
  const sequence =
    typeof options?.sequence === 'number' && Number.isFinite(options.sequence)
      ? Math.max(0, Math.floor(options.sequence))
      : defaultSequence;
  const status = method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED';
  const dtStampIso = options?.dtStampIso ?? new Date().toISOString();

  const addonsSummary =
    booking.addons.length > 0
      ? ` + ${booking.addons.map((a) => a.name).join(', ')}`
      : '';
  const summary = `${booking.service.name}${addonsSummary} — ${settings.name}`;
  const descriptionLines = [
    `Código de cita: ${booking.bookingCode}`,
    `Especialista: ${booking.staff.name}`,
    `Servicio: ${booking.service.name}${addonsSummary}`,
    `Gestionar, reagendar o cancelar: ${manageUrl}`,
  ];
  if (booking.clientNotes.trim().length > 0) {
    descriptionLines.push(`Notas: ${booking.clientNotes.trim()}`);
  }
  if (settings.bookingInstructionsText.trim().length > 0) {
    descriptionLines.push(settings.bookingInstructionsText.trim());
  }
  const description = descriptionLines.join('\n');
  const prodIdOrg = escapeIcsText(settings.name.replace(/\//g, '-'));

  const rawLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${prodIdOrg}//Booking//ES`,
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${booking.id}@nails.booking`,
    `DTSTAMP:${formatIcsDateUtc(dtStampIso)}`,
    `SEQUENCE:${sequence}`,
    `STATUS:${status}`,
    `DTSTART:${formatIcsDateUtc(booking.startAt)}`,
    `DTEND:${formatIcsDateUtc(booking.endAt)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(settings.address)}`,
  ];

  if (method !== 'CANCEL') {
    rawLines.push(
      'BEGIN:VALARM',
      'TRIGGER:-PT2H',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(`Recordatorio de cita en ${settings.name}`)}`,
      'END:VALARM',
    );
  }

  rawLines.push('END:VEVENT', 'END:VCALENDAR');

  const foldedLines = rawLines.map((line) => foldIcsLine(line, RFC5545_MAX_OCTETS));
  return `${foldedLines.join('\r\n')}\r\n`;
}

export function buildCalendarAddLinks(
  booking: BookingWithRelations,
  settings: SalonSettings,
  manageUrl: string,
) {
  const addonsSummary =
    booking.addons.length > 0
      ? ` + ${booking.addons.map((a) => a.name).join(', ')}`
      : '';
  const title = `${booking.service.name}${addonsSummary} — ${settings.name}`;
  const details = `Código: ${booking.bookingCode}\nEspecialista: ${booking.staff.name}\nGestionar cita: ${manageUrl}`;
  const startUtc = formatIcsDateUtc(booking.startAt);
  const endUtc = formatIcsDateUtc(booking.endAt);

  const google = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
    title,
  )}&dates=${startUtc}/${endUtc}&details=${encodeURIComponent(
    details,
  )}&location=${encodeURIComponent(settings.address)}`;

  const outlook = `https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=${encodeURIComponent(
    title,
  )}&startdt=${encodeURIComponent(booking.startAt)}&enddt=${encodeURIComponent(
    booking.endAt,
  )}&body=${encodeURIComponent(details)}&location=${encodeURIComponent(settings.address)}`;

  const office365 = `https://outlook.office.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=${encodeURIComponent(
    title,
  )}&startdt=${encodeURIComponent(booking.startAt)}&enddt=${encodeURIComponent(
    booking.endAt,
  )}&body=${encodeURIComponent(details)}&location=${encodeURIComponent(settings.address)}`;

  return {
    google,
    outlook,
    office365,
    icsDownload: `/api/bookings/manage/${booking.manageToken}/ics`,
  };
}
