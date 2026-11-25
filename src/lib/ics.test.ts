import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createInitialDemoDatabase } from './demo-seed';
import {
  buildCalendarAddLinks,
  escapeIcsText,
  foldIcsLine,
  generateBookingIcs,
} from './ics';
import type { BookingWithRelations, SalonSettings } from './types';

const UTF8_ENCODER = new TextEncoder();
const UTF8_DECODER_FATAL = new TextDecoder('utf-8', { fatal: true });

function unescapeIcsText(escaped: string): string {
  let result = '';
  for (let i = 0; i < escaped.length; i += 1) {
    const ch = escaped[i];
    if (ch === '\\' && i + 1 < escaped.length) {
      const next = escaped[i + 1];
      if (next === 'n' || next === 'N') {
        result += '\n';
        i += 1;
        continue;
      }
      if (next === ',' || next === ';' || next === '\\') {
        result += next;
        i += 1;
        continue;
      }
    }
    result += ch ?? '';
  }
  return result;
}

interface ParsedIcsCalendar {
  physicalLines: string[];
  calendarProps: Record<string, string>;
  eventProps: Record<string, string>;
  alarmProps: Record<string, string> | null;
}

function parseAndValidateRfc5545(raw: string): ParsedIcsCalendar {
  expect(raw.endsWith('\r\n')).toBe(true);
  const withoutValidCrlf = raw.replace(/\r\n/g, '');
  expect(withoutValidCrlf).not.toContain('\n');
  expect(withoutValidCrlf).not.toContain('\r');

  const physicalLines = raw.slice(0, -2).split('\r\n');
  for (const physicalLine of physicalLines) {
    const bytes = UTF8_ENCODER.encode(physicalLine);
    expect(bytes.length).toBeLessThanOrEqual(75);
    expect(UTF8_DECODER_FATAL.decode(bytes)).toBe(physicalLine);
  }

  const unfoldedRaw = raw.replace(/\r\n[ \t]/g, '');
  const logicalLines = unfoldedRaw.slice(0, -2).split('\r\n');

  const calendarProps: Record<string, string> = {};
  const eventProps: Record<string, string> = {};
  let alarmProps: Record<string, string> | null = null;
  let scope: 'root' | 'calendar' | 'event' | 'alarm' = 'root';

  for (const line of logicalLines) {
    if (line === 'BEGIN:VCALENDAR') {
      scope = 'calendar';
      continue;
    }
    if (line === 'END:VCALENDAR') {
      scope = 'root';
      continue;
    }
    if (line === 'BEGIN:VEVENT') {
      scope = 'event';
      continue;
    }
    if (line === 'END:VEVENT') {
      scope = 'calendar';
      continue;
    }
    if (line === 'BEGIN:VALARM') {
      scope = 'alarm';
      alarmProps = {};
      continue;
    }
    if (line === 'END:VALARM') {
      scope = 'event';
      continue;
    }

    const colonIndex = line.indexOf(':');
    expect(colonIndex).toBeGreaterThan(0);
    const key = line.slice(0, colonIndex);
    const value = line.slice(colonIndex + 1);

    if (scope === 'calendar') {
      calendarProps[key] = value;
    } else if (scope === 'event') {
      eventProps[key] = value;
    } else if (scope === 'alarm' && alarmProps) {
      alarmProps[key] = value;
    }
  }

  expect(scope).toBe('root');
  return { physicalLines, calendarProps, eventProps, alarmProps };
}

function makeSampleBookingAndSettings(): {
  booking: BookingWithRelations;
  settings: SalonSettings;
} {
  const db = createInitialDemoDatabase();
  const baseBooking = db.bookings[0];
  if (!baseBooking) throw new Error('Expected seed booking');
  const service = db.services.find((s) => s.id === baseBooking.serviceId);
  const staff = db.staff.find((s) => s.id === baseBooking.staffId);
  const client = db.clients.find((c) => c.id === baseBooking.clientId);
  if (!service || !staff || !client) {
    throw new Error('Expected seed relations');
  }
  return {
    booking: {
      ...baseBooking,
      service,
      staff,
      client,
    },
    settings: db.settings,
  };
}

describe('RFC 5545 iCalendar generator (ics.ts)', () => {
  it('emits strictly valid RFC 5545 CRLF, 75-octet lines, required headers, and VALARM for REQUEST', () => {
    const { booking, settings } = makeSampleBookingAndSettings();
    const manageUrl = 'https://laikona.example/cita/token-demo-1042';
    const dtStampIso = '2026-12-01T15:30:00.000Z';

    const ics = generateBookingIcs(booking, settings, manageUrl, {
      method: 'REQUEST',
      sequence: 0,
      dtStampIso,
    });
    const parsed = parseAndValidateRfc5545(ics);

    expect(parsed.calendarProps.VERSION).toBe('2.0');
    expect(parsed.calendarProps.CALSCALE).toBe('GREGORIAN');
    expect(parsed.calendarProps.METHOD).toBe('REQUEST');
    expect(parsed.calendarProps.PRODID).toMatch(/^-\/\/.+\/\/Booking\/\/ES$/);

    expect(parsed.eventProps.UID).toBe(`${booking.id}@nails.booking`);
    expect(parsed.eventProps.DTSTAMP).toBe('20261201T153000Z');
    expect(parsed.eventProps.SEQUENCE).toBe('0');
    expect(parsed.eventProps.STATUS).toBe('CONFIRMED');
    expect(parsed.eventProps.DTSTART).toMatch(/^\d{8}T\d{6}Z$/);
    expect(parsed.eventProps.DTEND).toMatch(/^\d{8}T\d{6}Z$/);

    expect(parsed.alarmProps).not.toBeNull();
    expect(parsed.alarmProps?.TRIGGER).toBe('-PT2H');
    expect(parsed.alarmProps?.ACTION).toBe('DISPLAY');

    expect(unescapeIcsText(parsed.eventProps.SUMMARY ?? '')).toContain(booking.service.name);
    expect(unescapeIcsText(parsed.eventProps.DESCRIPTION ?? '')).toContain(booking.bookingCode);
    expect(unescapeIcsText(parsed.eventProps.DESCRIPTION ?? '')).toContain(manageUrl);
    expect(unescapeIcsText(parsed.eventProps.LOCATION ?? '')).toBe(settings.address);
  });

  it('round-trips Spanish accents, emojis, commas, semicolons, backslashes, and long multi-line notes without exceeding 75 octets', () => {
    const { booking, settings } = makeSampleBookingAndSettings();
    const richNotes =
      'Diseño francés minimalista, tono cereza profundo; llevar referencia en carpeta C:\\Diseños\\LAIKONA\\💅🍒✨\n' +
      'Segunda línea con acentos: áéíóúüñÑ¿¡ y nota larguísima para forzar múltiples dobleces RFC 5545 de 75 octetos con emojis 🌸💅✨🍒💖.';
    const richAddress =
      'Av. Álvaro Obregón #145, Piso 2; Col. Roma Norte, Cuauhtémoc, CDMX \\ Entrada por recepción 🌸';
    const richBooking: BookingWithRelations = {
      ...booking,
      clientNotes: richNotes,
      addons: [
        {
          addonId: 'addon-art',
          name: 'Nail Art Cereza, Francés; Acabado 💅',
          extraMinutes: 20,
          extraPriceCents: 15000,
        },
      ],
    };
    const richSettings: SalonSettings = {
      ...settings,
      address: richAddress,
      bookingInstructionsText:
        'Llega 10 min antes, tolerancia máxima; confirma por WhatsApp o correo 💅✨\nSin gel previo.',
    };

    const manageUrl = 'https://laikona.example/cita/token-largo-para-probar-folding-rfc5545-1234567890';
    const ics = generateBookingIcs(richBooking, richSettings, manageUrl);
    const parsed = parseAndValidateRfc5545(ics);

    expect(parsed.physicalLines.some((line) => line.startsWith(' '))).toBe(true);

    const decodedSummary = unescapeIcsText(parsed.eventProps.SUMMARY ?? '');
    const decodedDescription = unescapeIcsText(parsed.eventProps.DESCRIPTION ?? '');
    const decodedLocation = unescapeIcsText(parsed.eventProps.LOCATION ?? '');

    expect(decodedSummary).toBe(
      `${richBooking.service.name} + Nail Art Cereza, Francés; Acabado 💅 — ${richSettings.name}`,
    );
    expect(decodedLocation).toBe(richAddress);
    expect(decodedDescription).toContain(`Notas: ${richNotes}`);
    expect(decodedDescription).toContain(richSettings.bookingInstructionsText);
    expect(decodedDescription).toContain(manageUrl);
  });

  it('emits METHOD:CANCEL, STATUS:CANCELLED, bumped SEQUENCE, and omits VALARM for canceled bookings', () => {
    const { booking, settings } = makeSampleBookingAndSettings();
    const canceledBooking: BookingWithRelations = {
      ...booking,
      status: 'canceled',
      rescheduledFromId: 'bk-prev-001',
    };

    const autoCancel = generateBookingIcs(
      canceledBooking,
      settings,
      'https://laikona.example/cita/cancel-token',
    );
    const parsedAuto = parseAndValidateRfc5545(autoCancel);
    expect(parsedAuto.calendarProps.METHOD).toBe('CANCEL');
    expect(parsedAuto.eventProps.STATUS).toBe('CANCELLED');
    expect(parsedAuto.eventProps.SEQUENCE).toBe('2');
    expect(parsedAuto.eventProps.UID).toBe(`${booking.id}@nails.booking`);
    expect(parsedAuto.alarmProps).toBeNull();

    const explicitCancel = generateBookingIcs(
      booking,
      settings,
      'https://laikona.example/cita/cancel-token',
      { method: 'CANCEL', sequence: 5 },
    );
    const parsedExplicit = parseAndValidateRfc5545(explicitCancel);
    expect(parsedExplicit.calendarProps.METHOD).toBe('CANCEL');
    expect(parsedExplicit.eventProps.STATUS).toBe('CANCELLED');
    expect(parsedExplicit.eventProps.SEQUENCE).toBe('5');
    expect(parsedExplicit.alarmProps).toBeNull();
  });

  it('bumps default SEQUENCE to 1 for rescheduled bookings', () => {
    const { booking, settings } = makeSampleBookingAndSettings();
    const rescheduled: BookingWithRelations = {
      ...booking,
      status: 'confirmed',
      rescheduledFromId: 'bk-original',
    };

    const ics = generateBookingIcs(
      rescheduled,
      settings,
      'https://laikona.example/cita/resched-token',
    );
    const parsed = parseAndValidateRfc5545(ics);
    expect(parsed.calendarProps.METHOD).toBe('REQUEST');
    expect(parsed.eventProps.SEQUENCE).toBe('1');
    expect(parsed.eventProps.STATUS).toBe('CONFIRMED');
  });

  it('folds exact 74-byte + 4-byte emoji boundaries without splitting multi-byte UTF-8 sequences', () => {
    const boundaryLine = `${'A'.repeat(74)}💅${'B'.repeat(72)}áéíóú`;
    const folded = foldIcsLine(boundaryLine);
    const physicalLines = folded.split('\r\n');

    expect(physicalLines.length).toBeGreaterThanOrEqual(3);
    for (const line of physicalLines) {
      const encoded = UTF8_ENCODER.encode(line);
      expect(encoded.length).toBeLessThanOrEqual(75);
      expect(UTF8_DECODER_FATAL.decode(encoded)).toBe(line);
    }
    expect(physicalLines[0]).toBe('A'.repeat(74));
    expect(physicalLines[1]?.startsWith(' 💅')).toBe(true);
    expect(folded.replace(/\r\n /g, '')).toBe(boundaryLine);
  });

  it('property: foldIcsLine + escapeIcsText always respects 75 UTF-8 octets and round-trips arbitrary Unicode text', () => {
    const charPool = fc.constantFrom(
      'a',
      'Z',
      '0',
      ' ',
      ',',
      ';',
      '\\',
      '\n',
      '\r\n',
      'á',
      'é',
      'ñ',
      'Ñ',
      'ü',
      '—',
      '💅',
      '🍒',
      '✨',
      '🌸',
    );

    fc.assert(
      fc.property(
        fc.array(charPool, { minLength: 0, maxLength: 260 }).map((chars) => chars.join('')),
        (rawText) => {
          const escaped = escapeIcsText(rawText);
          const logical = `DESCRIPTION:${escaped}`;
          const folded = foldIcsLine(logical);
          const physicalLines = folded.split('\r\n');

          for (let i = 0; i < physicalLines.length; i += 1) {
            const line = physicalLines[i] ?? '';
            const bytes = UTF8_ENCODER.encode(line);
            expect(bytes.length).toBeLessThanOrEqual(75);
            expect(UTF8_DECODER_FATAL.decode(bytes)).toBe(line);
            if (i > 0) {
              expect(line.startsWith(' ')).toBe(true);
            }
          }

          const unfolded = folded.replace(/\r\n /g, '');
          expect(unfolded).toBe(logical);
          const normalizedExpected = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
          expect(unescapeIcsText(unfolded.slice('DESCRIPTION:'.length))).toBe(normalizedExpected);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('buildCalendarAddLinks returns encoded Google, Outlook, Office365, and ICS download URLs', () => {
    const { booking, settings } = makeSampleBookingAndSettings();
    const links = buildCalendarAddLinks(
      booking,
      settings,
      `https://laikona.example/cita/${booking.manageToken}`,
    );

    expect(links.google).toContain('https://calendar.google.com/calendar/render');
    expect(links.outlook).toContain('https://outlook.live.com/calendar/0/deeplink/compose');
    expect(links.office365).toContain('https://outlook.office.com/calendar/0/deeplink/compose');
    expect(links.icsDownload).toBe(`/api/bookings/manage/${booking.manageToken}/ics`);
  });
});
