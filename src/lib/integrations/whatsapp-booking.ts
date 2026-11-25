import crypto from 'node:crypto';
import {
  createBookingAtomic,
  getSnapshot,
  queryAvailability,
  SlotConflictError,
} from '../repositories/db';
import { formatDateLongInTimezone, formatTimeInTimezone, getDateKeyInTimezone } from '../format';
import { getRuntimeIntegrationStatus } from '../env';

export function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true;
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const expected = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')}`;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected),
    );
  } catch {
    return false;
  }
}

export interface WhatsAppBookingActionInput {
  phone: string;
  clientName: string;
  serviceId: string;
  addonIds?: string[];
  staffId?: string | null;
  startAt?: string;
}

export async function executeWhatsAppBookingFlow(input: WhatsAppBookingActionInput) {
  const db = getSnapshot();
  const env = getRuntimeIntegrationStatus();
  const tz = db.settings.timezone || 'America/Mexico_City';

  let targetStartAt = input.startAt;
  let targetStaffId = input.staffId || null;

  if (!targetStartAt) {

    const todayKey = getDateKeyInTimezone(new Date(), tz);
    const avail = queryAvailability({
      serviceId: input.serviceId,
      addonIds: input.addonIds ?? [],
      staffId: targetStaffId,
      startDate: todayKey,
      days: 7,
    });
    const firstSlot = avail.days.flatMap((d) => d.slots)[0];
    if (!firstSlot) {
      return {
        ok: false as const,
        replyText: `Por el momento no tenemos horarios disponibles en los próximos 7 días para ese servicio. Puedes unirte a nuestra lista de espera en ${env.appUrl}/reservar`,
      };
    }
    targetStartAt = firstSlot.startAt;
    targetStaffId = firstSlot.staffId;
  }

  try {
    const booking = await createBookingAtomic({
      serviceId: input.serviceId,
      addonIds: input.addonIds ?? [],
      staffId: targetStaffId,
      startAt: targetStartAt,
      clientName: input.clientName,
      clientPhone: input.phone,
      clientEmail: null,
      clientNotes: 'Agendada directamente por flujo interactivo de WhatsApp',
      source: 'whatsapp',
    });

    const manageUrl = `${env.appUrl}/cita/${booking.manageToken}`;
    const replyText = [
      `¡Listo ${booking.client.fullName}! Tu cita en ${db.settings.name} quedó registrada (${booking.bookingCode}).`,
      `Servicio: ${booking.service.name}`,
      `Fecha: ${formatDateLongInTimezone(booking.startAt, tz)} · ${formatTimeInTimezone(booking.startAt, tz)}`,
      `Especialista: ${booking.staff.name}`,
      `Agregar al calendario, reagendar o cancelar: ${manageUrl}`,
    ].join('\n');

    return { ok: true as const, booking, replyText };
  } catch (err) {
    if (err instanceof SlotConflictError) {
      const altText = err.suggestedSlots
        .map(
          (s, idx) =>
            `${idx + 1}. ${formatDateLongInTimezone(s.startAt, tz)} · ${s.localTime12}`,
        )
        .join('\n');
      return {
        ok: false as const,
        conflict: true,
        suggestedSlots: err.suggestedSlots,
        replyText: `Ese horario acaba de ocuparse hace unos segundos. Horarios cercanos libres:\n${altText}`,
      };
    }
    return {
      ok: false as const,
      replyText:
        err instanceof Error
          ? err.message
          : 'No pudimos completar tu reserva en este momento.',
    };
  }
}

export function buildWhatsAppFlowJsonSchema() {
  const db = getSnapshot();
  return {
    version: '6.0',
    data_api_version: '3.0',
    routing_model: {
      SELECT_SERVICE: ['SELECT_SLOT'],
      SELECT_SLOT: ['CONFIRM_DETAILS'],
      CONFIRM_DETAILS: [],
    },
    screens: [
      {
        id: 'SELECT_SERVICE',
        title: `Reservar en ${db.settings.name}`,
        data: {
          services: db.services
            .filter((s) => s.isActive)
            .map((s) => ({
              id: s.id,
              title: `${s.name} (${s.durationMinutes} min · $${(s.priceCents / 100).toFixed(0)})`,
            })),
        },
      },
      {
        id: 'SELECT_SLOT',
        title: 'Elige fecha y hora en vivo',
        terminal: false,
      },
      {
        id: 'CONFIRM_DETAILS',
        title: 'Confirma tus datos',
        terminal: true,
      },
    ],
  };
}
