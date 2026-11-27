import {
  buildWhatsAppLink,
  collapseDoublePeriods,
  formatCurrency,
  formatDateShortInTimezone,
  formatTimeInTimezone,
} from '../format';
import type { BookingWithRelations, SalonSettings } from '../types';

interface CheckoutReceiptWhatsAppInput {
  settings: Pick<SalonSettings, 'name' | 'currency' | 'timezone'>;
  booking: {
    bookingCode: string;
    startAt: string;
    client: Pick<BookingWithRelations['client'], 'fullName' | 'phoneE164'>;
    service: Pick<BookingWithRelations['service'], 'name'>;
    staff: Pick<BookingWithRelations['staff'], 'name'>;
    addons?: ReadonlyArray<{ name: string }>;
  };
  paidCents: number;
  totalTipsCents?: number;
  stampAwarded?: boolean;
  stampsCount?: number | null;
  stampsRequired?: number | null;
  redeemedPackageName?: string | null;
  redeemedReward?: boolean;
}

function toSafeCents(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value);
}

function resolveFirstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? '';
  return first.slice(0, 60);
}

function formatReceiptDateTime(iso: string, timeZone: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  const datePart = formatDateShortInTimezone(iso, timeZone);
  const timePart = formatTimeInTimezone(iso, timeZone, false);
  return collapseDoublePeriods(`${datePart} · ${timePart}`);
}

export function buildCheckoutReceiptWhatsAppUrl(
  input: CheckoutReceiptWhatsAppInput,
): string | null {
  const digits = input.booking.client.phoneE164.replace(/\D/g, '');
  if (digits.length < 10) return null;

  const salonName = input.settings.name.trim() || 'el estudio';
  const tz = input.settings.timezone.trim() || 'America/Mexico_City';
  const currency = input.settings.currency;
  const firstName = resolveFirstName(input.booking.client.fullName);
  const greeting = firstName
    ? `Hola ${firstName}, ¡gracias por tu visita a ${salonName}!`
    : `¡Gracias por tu visita a ${salonName}!`;

  const addonNames = (input.booking.addons ?? [])
    .map((addon) => addon.name.trim())
    .filter((name) => name.length > 0);
  const serviceSummary =
    addonNames.length > 0
      ? `${input.booking.service.name.trim()} + ${addonNames.join(', ')}`
      : input.booking.service.name.trim();

  const paidCents = toSafeCents(input.paidCents);
  const totalTipsCents = toSafeCents(input.totalTipsCents);
  const dateTimeLabel = formatReceiptDateTime(input.booking.startAt, tz);
  const bookingCode = input.booking.bookingCode.trim();
  const staffName = input.booking.staff.name.trim();
  const packageName = input.redeemedPackageName?.trim() || null;

  const lines: string[] = [
    greeting,
    '',
    bookingCode ? `Comprobante de cobro (${bookingCode})` : 'Comprobante de cobro',
    `Servicio: ${serviceSummary}`,
  ];

  if (staffName) {
    lines.push(`Con: ${staffName}`);
  }
  if (dateTimeLabel) {
    lines.push(`Fecha: ${dateTimeLabel}`);
  }
  if (packageName) {
    lines.push(`Paquete aplicado: ${packageName} (-1 sesión)`);
    if (paidCents > 0) {
      lines.push(`Cobro adicional: ${formatCurrency(paidCents, currency)}`);
    }
  } else {
    lines.push(`Total pagado: ${formatCurrency(paidCents, currency)}`);
  }
  if (totalTipsCents > 0) {
    lines.push(`Propina: ${formatCurrency(totalTipsCents, currency)}`);
  }

  if (input.redeemedReward) {
    lines.push('Tarjeta de sellos: premio canjeado en esta visita.');
  } else if (input.stampAwarded) {
    const count =
      typeof input.stampsCount === 'number' && Number.isFinite(input.stampsCount)
        ? Math.max(0, Math.round(input.stampsCount))
        : null;
    const required =
      typeof input.stampsRequired === 'number' && Number.isFinite(input.stampsRequired)
        ? Math.max(1, Math.round(input.stampsRequired))
        : null;
    if (count !== null && required !== null) {
      lines.push(
        count >= required
          ? `Tarjeta de sellos: +1 sello (${count}/${required} — ¡ya tienes tu premio listo!).`
          : `Tarjeta de sellos: +1 sello (${count}/${required} para tu próximo premio).`,
      );
    } else {
      lines.push('Tarjeta de sellos: +1 sello sumado hoy.');
    }
  }

  lines.push('', '¡Te esperamos pronto!');

  return buildWhatsAppLink(
    input.booking.client.phoneE164,
    collapseDoublePeriods(lines.join('\n')),
  );
}
