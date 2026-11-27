import type { Booking, ScheduledNotification, WaitlistEntry } from '../types';

export const WAITLIST_OFFER_TTL_MINUTES = 30;

export const CANCELLATION_REASON_OPTIONS = [
  'Cambio de planes',
  'Conflicto de horario',
  'Imprevisto personal',
  'Prefiero otra técnica',
  'Otro',
] as const;

export const RESCHEDULE_REASON_OPTIONS = [
  'Cambio de planes',
  'Conflicto de horario',
  'Imprevisto personal',
  'Prefiero otra técnica',
  'Otro',
] as const;

export interface WorkflowTemplateItem {
  id: string;
  title: string;
  category: 'confirmation' | 'reminder' | 'preparation' | 'recovery' | 'waitlist';
  channel: 'email' | 'whatsapp' | 'cascade';
  timingLabel: string;
  description: string;
  templateText: string;
}

export const WORKFLOW_TEMPLATE_GALLERY: readonly WorkflowTemplateItem[] = [
  {
    id: 'tpl-deposit-confirm',
    title: 'Confirmación con anticipo SPEI $200',
    category: 'confirmation',
    channel: 'whatsapp',
    timingLabel: 'Al crear la cita',
    description:
      'Envía resumen de bloque, CLABE de Mercado Pago y opción de comprobante web o Instagram DM.',
    templateText:
      'Hola {{client_name}}, apartamos tu espacio de {{service_name}} con {{staff_name}} el {{date_label}} a las {{time_label}} en {{salon_name}}. Para confirmar tu cita envía tu anticipo de $200 MXN por SPEI a Mercado Pago (CLABE {{deposit_clabe}} · {{deposit_beneficiary}}) y sube tu comprobante aquí: {{manage_url}}',
  },
  {
    id: 'tpl-email-48h',
    title: 'Recordatorio Email 48 h',
    category: 'reminder',
    channel: 'email',
    timingLabel: '48 horas antes',
    description:
      'Primer escalón gratuito de la cascada con botón de confirmación 1-clic y archivo .ics para calendario.',
    templateText:
      'Hola {{client_name}}, faltan 48 horas para tu cita de {{service_name}} en {{salon_name}} ({{date_label}} · {{time_label}}). Confirma tu asistencia en 1 clic aquí para evitar mensajes extra: {{manage_url}}',
  },
  {
    id: 'tpl-wa-cascade-24h',
    title: 'Cascada WhatsApp 24 h solo sin confirmar',
    category: 'reminder',
    channel: 'cascade',
    timingLabel: '24 horas antes (si no confirmó)',
    description:
      'Se omite automáticamente si la clienta ya confirmó por Email, pago o recepción — ahorra costo de mensajería.',
    templateText:
      'Hola {{client_name}}, recordatorio de tu cita mañana {{date_label}} a las {{time_label}} con {{staff_name}} en {{salon_name}}. Confirma o reprograma sin perder tu anticipo aquí: {{manage_url}}',
  },
  {
    id: 'tpl-no-gel-prep',
    title: 'Recordatorio "ven sin gel previo"',
    category: 'preparation',
    channel: 'whatsapp',
    timingLabel: '18 horas antes',
    description:
      'Evita retrasos en mesa recordando puntualidad y retiro previo si no se agendó extra de Retiro.',
    templateText:
      'Hola {{client_name}}, tip rápido antes de tu cita de {{service_name}} en {{salon_name}}: te pedimos llegar puntual (10 min de tolerancia) y sin gel o acrílico previo, o avísanos si necesitas agregar Retiro para apartar el tiempo exacto.',
  },
  {
    id: 'tpl-noshow-30m',
    title: 'Seguimiento de inasistencia 30 min después',
    category: 'recovery',
    channel: 'whatsapp',
    timingLabel: '30 min después de no-show',
    description:
      'Seguimiento amable para reagendar sin fricción cuando una clienta no pudo llegar a su bloque.',
    templateText:
      'Hola {{client_name}}, te extrañamos hoy en {{salon_name}} en tu cita de {{service_name}}. Esperamos que todo esté bien; cuando gustes reagendar un nuevo horario aquí tienes acceso directo: {{booking_url}}',
  },
  {
    id: 'tpl-recapture-cancel',
    title: 'Recapturar cita cancelada',
    category: 'recovery',
    channel: 'whatsapp',
    timingLabel: '2 horas después de cancelar',
    description:
      'Invita a volver a elegir bloque con Karla, Paty o Tere cuando cambian sus planes.',
    templateText:
      'Hola {{client_name}}, registramos la cancelación de tu cita en {{salon_name}}. Cuando estés lista para elegir otro bloque con Karla, Paty o Tere aparta en segundos aquí: {{booking_url}}',
  },
  {
    id: 'tpl-waitlist-10m',
    title: 'Oferta prioritaria lista de espera 30 min',
    category: 'waitlist',
    channel: 'whatsapp',
    timingLabel: 'Al liberarse un hueco (TTL 30 min)',
    description:
      'Asigna un enlace prioritario de 30 minutos a la primera clienta en fila antes de pasar automáticamente a la siguiente.',
    templateText:
      'Hola {{client_name}}, ¡se acaba de liberar un espacio de {{service_name}} el {{date_label}} a las {{time_label}} en {{salon_name}}! Tienes acceso prioritario durante 30 minutos para apartarlo aquí: {{offer_url}}',
  },
];

export interface CascadeMetricsSummary {
  confirmedRevenueCents: number;
  emailConfirmedCount: number;
  whatsappConfirmedCount: number;
  manualConfirmedCount: number;
  paymentConfirmedCount: number;
  bookingsWithoutReminders: Booking[];
}

export function shouldSkipWhatsappCascade(
  booking: Pick<Booking, 'status' | 'confirmedVia' | 'attendanceStatus'>,
  alreadySentEmail: boolean,
): boolean {
  if (
    booking.status === 'canceled' ||
    booking.status === 'completed' ||
    booking.status === 'no_show'
  ) {
    return true;
  }
  if (booking.attendanceStatus === 'confirmed') {
    return true;
  }
  if (
    booking.confirmedVia === 'email' ||
    booking.confirmedVia === 'manual' ||
    booking.confirmedVia === 'payment' ||
    booking.confirmedVia === 'whatsapp'
  ) {
    return true;
  }
  if (alreadySentEmail && booking.status === 'confirmed') {
    return true;
  }
  return false;
}

export function summarizeCascadeMetrics(
  bookings: readonly Booking[],
  logs: readonly ScheduledNotification[],
  now: Date = new Date(),
): CascadeMetricsSummary {
  const nowMs = now.getTime();
  const bookingIdsWithReminder = new Set<string>();
  for (const log of logs) {
    if (log.status === 'sent' || log.status === 'pending') {
      bookingIdsWithReminder.add(log.bookingId);
    }
  }

  let confirmedRevenueCents = 0;
  let emailConfirmedCount = 0;
  let whatsappConfirmedCount = 0;
  let manualConfirmedCount = 0;
  let paymentConfirmedCount = 0;
  const withoutRemindersUnsorted: Booking[] = [];

  for (const booking of bookings) {
    if (booking.status === 'confirmed' || booking.status === 'completed') {
      confirmedRevenueCents += booking.totalPriceCents;
      if (booking.confirmedVia === 'email') {
        emailConfirmedCount += 1;
      } else if (booking.confirmedVia === 'whatsapp') {
        whatsappConfirmedCount += 1;
      } else if (booking.confirmedVia === 'payment') {
        paymentConfirmedCount += 1;
      } else {
        manualConfirmedCount += 1;
      }
    }

    const isUpcomingActive =
      (booking.status === 'confirmed' ||
        booking.status === 'pending_confirmation' ||
        booking.status === 'pending_payment') &&
      new Date(booking.startAt).getTime() > nowMs;

    if (isUpcomingActive && !bookingIdsWithReminder.has(booking.id)) {
      withoutRemindersUnsorted.push(booking);
    }
  }

  return {
    confirmedRevenueCents,
    emailConfirmedCount,
    whatsappConfirmedCount,
    manualConfirmedCount,
    paymentConfirmedCount,
    bookingsWithoutReminders: withoutRemindersUnsorted.toSorted(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    ),
  };
}

function extractFractionalMicroseconds(iso: string): number {
  const match = /\.(\d+)/.exec(iso);
  if (!match?.[1]) return 0;
  return Number(match[1].slice(0, 6).padEnd(6, '0'));
}

function compareIsoTimestampsAsc(a: string, b: string): number {
  const msDiff = Date.parse(a) - Date.parse(b);
  if (msDiff !== 0) return msDiff;
  const microDiff = extractFractionalMicroseconds(a) - extractFractionalMicroseconds(b);
  if (microDiff !== 0) return microDiff;
  return a.localeCompare(b);
}

export function selectNextWaitlistCandidate(
  waitlist: readonly WaitlistEntry[],
  params: {
    serviceId: string;
    staffId?: string | null;
    dateKey: string;
    nowMs?: number;
  },
): WaitlistEntry | null {
  const nowMs = params.nowMs ?? Date.now();
  const eligible = waitlist.filter((entry) => {
    if (entry.status !== 'waiting') return false;
    if (entry.serviceId !== params.serviceId) return false;
    if (entry.desiredDate !== params.dateKey) return false;
    if (
      entry.preferredStaffId &&
      params.staffId &&
      entry.preferredStaffId !== params.staffId
    ) {
      return false;
    }
    if (entry.priorityOfferExpiresAt) {
      const expiresMs = new Date(entry.priorityOfferExpiresAt).getTime();
      if (!Number.isNaN(expiresMs) && expiresMs <= nowMs) {
        return false;
      }
    }
    return true;
  });

  const ordered = eligible.toSorted((a, b) => {
    const timeDiff = compareIsoTimestampsAsc(a.createdAt, b.createdAt);
    return timeDiff !== 0 ? timeDiff : a.id.localeCompare(b.id);
  });
  return ordered[0] ?? null;
}
