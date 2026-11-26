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
      body: `Â¡Hola [nombre]! Recibimos tu solicitud en ${s.name} para [servicio] el [fecha] a las [hora]. Para apartar tu lugar envÃ­a tu anticipo de ${depositLabel} por transferencia SPEI a ${bank} Â· Titular: ${holder} Â· CLABE: ${clabe}. MÃ¡ndanos tu comprobante por aquÃ­ o por mensaje en Instagram a ${ig} para confirmar tu cita.`,
    },
    {
      id: 'reminder-24h',
      title: 'Recordatorio 24 horas antes',
      tag: '24 h antes',
      body: `Hola [nombre], te recordamos tu cita maÃ±ana en ${s.name} ([servicio]) a las [hora] con [profesional]. Por favor confÃ­rmanos tu asistencia respondiendo este mensaje. Si necesitas reagendar, avÃ­sanos con al menos ${s.minRescheduleHours}h de anticipaciÃ³n.`,
    },
    {
      id: 'reminder-2h',
      title: 'Recordatorio 2 horas antes',
      tag: '2 h antes',
      body: `Â¡Nos vemos en 2 horas en ${s.name}! Te esperamos a las [hora] (${s.address}). Recuerda que contamos con 10 minutos de tolerancia para respetar los horarios de todas nuestras clientas.`,
    },
    {
      id: 'refill-3w',
      title: 'InvitaciÃ³n a retoque (3 semanas)',
      tag: 'Retoque',
      body: `Hola [nombre], ya casi cumplen 3 semanas tus uÃ±as de ${s.name}. Â¿Te apartamos tu horario de retoque o cambio de set con Karla, Paty o Tere? Puedes elegir tu hora directo en nuestra agenda en lÃ­nea.`,
    },
    {
      id: 'winback-30d',
      title: 'Volver a escribir a clienta inactiva',
      tag: 'Seguimiento',
      body: `Â¡Hola [nombre]! Te extraÃ±amos en ${s.name}. Tenemos nuevos tonos y diseÃ±os en ${ig}. Si gustas agendar tu prÃ³ximo set esta semana, entra a nuestra agenda en lÃ­nea o escrÃ­benos y con gusto te apartamos lugar.`,
    },
  ];
}

