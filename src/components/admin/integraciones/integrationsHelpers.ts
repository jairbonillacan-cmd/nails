import { formatCurrency } from '@/lib/format';
import type { CopyableWhatsAppTemplate } from '@/components/admin/integraciones/WhatsAppSection';
import type { SalonSettings } from '@/lib/types';

export function buildWhatsAppCopyTemplates(
  s: SalonSettings,
): CopyableWhatsAppTemplate[] {
  const depositLabel = formatCurrency(s.depositAmountCents ?? 20000, s.currency);
  const bank = s.depositBankName || 'Mercado Pago';
  const holder = s.depositBeneficiary || s.depositAccountHolder;
  const clabe = s.depositClabe || '7229 6901 3959 779869';
  const ig = s.instagramHandle || '@laikona.nailsss';

  return [
    {
      id: 'confirm-deposit',
      title: `Confirmar cita con anticipo (${depositLabel})`,
      tag: 'Anticipo',
      body: `¡Hola [nombre]! Recibimos tu solicitud en ${s.name} para [servicio] el [fecha] a las [hora]. Para apartar tu lugar envía tu anticipo de ${depositLabel} por transferencia SPEI a ${bank} · Titular: ${holder} · CLABE: ${clabe}. Mándanos tu comprobante por aquí o por mensaje en Instagram a ${ig} para confirmar tu cita.`,
    },
    {
      id: 'reminder-24h',
      title: 'Recordatorio 24 horas antes',
      tag: '24 h antes',
      body: `Hola [nombre], te recordamos tu cita mañana en ${s.name} ([servicio]) a las [hora] con [profesional]. Por favor confírmanos tu asistencia respondiendo este mensaje. Si necesitas reagendar, avísanos con al menos ${s.minRescheduleHours}h de anticipación.`,
    },
    {
      id: 'reminder-2h',
      title: 'Recordatorio 2 horas antes',
      tag: '2 h antes',
      body: `¡Nos vemos en 2 horas en ${s.name}! Te esperamos a las [hora] (${s.address}). Recuerda que contamos con 10 minutos de tolerancia para respetar los horarios de todas nuestras clientas.`,
    },
    {
      id: 'refill-3w',
      title: 'Invitación a retoque (3 semanas)',
      tag: 'Retoque',
      body: `Hola [nombre], ya casi cumplen 3 semanas tus uñas de ${s.name}. ¿Te apartamos tu horario de retoque o cambio de set con Karla, Paty o Tere? Puedes elegir tu hora directo en nuestra agenda en línea.`,
    },
    {
      id: 'winback-30d',
      title: 'Volver a escribir a clienta inactiva',
      tag: 'Seguimiento',
      body: `¡Hola [nombre]! Te extrañamos en ${s.name}. Tenemos nuevos tonos y diseños en ${ig}. Si gustas agendar tu próximo set esta semana, entra a nuestra agenda en línea o escríbenos y con gusto te apartamos lugar.`,
    },
  ];
}

