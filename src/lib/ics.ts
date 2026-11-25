import type { BookingWithRelations, SalonSettings } from './types';

function formatIcsDateUtc(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

export function generateBookingIcs(
  booking: BookingWithRelations,
  settings: SalonSettings,
  manageUrl: string,
): string {
  const addonsSummary =
    booking.addons.length > 0
      ? ` + ${booking.addons.map((a) => a.name).join(', ')}`
      : '';
  const summary = `${booking.service.name}${addonsSummary} — ${settings.name}`;
  const description = [
    `Código de cita: ${booking.bookingCode}`,
    `Especialista: ${booking.staff.name}`,
    `Servicio: ${booking.service.name}${addonsSummary}`,
    `Gestionar, reagendar o cancelar: ${manageUrl}`,
    settings.bookingInstructionsText,
  ].join('\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${escapeIcsText(settings.name)}//Booking//ES`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${booking.id}@nails.booking`,
    `DTSTAMP:${formatIcsDateUtc(new Date().toISOString())}`,
    `DTSTART:${formatIcsDateUtc(booking.startAt)}`,
    `DTEND:${formatIcsDateUtc(booking.endAt)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(settings.address)}`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    `DESCRIPTION:Recordatorio de cita en ${escapeIcsText(settings.name)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return `${lines.join('\r\n')}\r\n`;
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
