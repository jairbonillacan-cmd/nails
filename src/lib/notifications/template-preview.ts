import type { NotificationWorkflow } from '@/lib/types';

export interface TemplatePreviewSegment {
  kind: 'text' | 'value' | 'link';
  text: string;
}

const SAMPLE_VALUES: Readonly<Record<string, string>> = {
  client_name: 'Sofía',
  service_name: 'Rubber',
  date_label: 'viernes 27 de noviembre',
  time_label: '2:00 p.m.',
  booking_code: 'NL-1042',
  staff_name: 'Karla',
};

const LINK_LABELS: Readonly<Record<string, string>> = {
  manage_url: 'ver mi cita',
  confirm_url: 'confirmar',
  reschedule_url: 'cambiar horario',
  touchup_url: 'apartar retoque',
  booking_url: 'reservar',
  review_url: 'dejar reseña',
};

export function buildTemplatePreview(
  template: string,
  context: { salonName: string; address: string },
): TemplatePreviewSegment[] {
  const values: Record<string, string> = {
    ...SAMPLE_VALUES,
    salon_name: context.salonName,
    address: context.address,
  };
  const segments: TemplatePreviewSegment[] = [];
  let cursor = 0;
  for (const match of template.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)) {
    const index = match.index ?? 0;
    if (index > cursor) segments.push({ kind: 'text', text: template.slice(cursor, index) });
    const key = match[1] ?? '';
    if (key.endsWith('_url')) {
      segments.push({ kind: 'link', text: LINK_LABELS[key] ?? 'abrir enlace' });
    } else {
      segments.push({ kind: 'value', text: values[key] ?? '…' });
    }
    cursor = index + match[0].length;
  }
  if (cursor < template.length) segments.push({ kind: 'text', text: template.slice(cursor) });
  return segments.map((segment, idx) => {
    const prev = segments[idx - 1];
    if (segment.kind === 'text' && prev?.kind === 'value' && prev.text.endsWith('.') && segment.text.startsWith('.')) {
      return { ...segment, text: segment.text.slice(1) };
    }
    return segment;
  });
}

function formatOffset(minutes: number): string {
  const abs = Math.abs(minutes);
  if (abs >= 1440 && abs % 1440 === 0) {
    const days = abs / 1440;
    return days === 1 ? 'Un día' : `${days} días`;
  }
  if (abs >= 60 && abs % 60 === 0) {
    const hours = abs / 60;
    return hours === 1 ? 'Una hora' : `${hours} horas`;
  }
  return `${abs} minutos`;
}

export function describeWorkflowMoment(
  workflow: Pick<NotificationWorkflow, 'triggerEvent' | 'offsetMinutes' | 'name'>,
): string {
  switch (workflow.triggerEvent) {
    case 'booking_created':
    case 'booking_confirmed':
      return 'Al apartar su cita';
    case 'booking_rescheduled':
      return 'Cuando cambia de horario';
    case 'booking_canceled':
      return 'Cuando cancela';
    case 'before_booking':
      return `${formatOffset(workflow.offsetMinutes)} antes de la cita`;
    case 'after_booking':
      return `${formatOffset(workflow.offsetMinutes)} después de la cita`;
    default:
      return workflow.name.replace(/\s*\([^)]*\)\s*$/, '');
  }
}
