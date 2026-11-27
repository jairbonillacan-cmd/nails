import {
  agendaHref,
  cajaHref,
  inventarioHref,
  whatsappHref,
} from '../admin-links';
import { hasBookingProofSubmitted } from '../booking/balance';
import type { WhatsAppInboxSummaryDTO } from '../contracts';
import {
  buildWhatsAppLink,
  formatCurrency,
  formatDateKeyDisplay,
  formatDateShortInTimezone,
  formatTimeInTimezone,
  formatUnitCount,
} from '../format';
import type {
  InventoryItem,
  Service,
  WaitlistEntry,
  WhatsAppMonthlyUsageSummary,
} from '../types';

type ActionQueueItemKind =
  | 'deposit_review'
  | 'deposit_missing_proof'
  | 'uncollected_booking'
  | 'waitlist'
  | 'whatsapp_unread'
  | 'whatsapp_failed_reminders'
  | 'whatsapp_failed_messages'
  | 'whatsapp_quota'
  | 'low_stock';

export interface ActionQueueItem {
  id: string;
  kind: ActionQueueItemKind;
  priority: 1 | 2 | 3 | 4 | 5 | 6;
  tone: 'warning' | 'accent' | 'info' | 'neutral';
  title: string;
  subtitle: string;
  primaryLabel: string;
  primaryHref: string;
  primaryExternal?: boolean;
  secondaryLabel?: string;
  secondaryHref?: string;
  bookingId?: string;
  clientName?: string;
  waitlistId?: string;
  inventoryItemId?: string;
}

interface ActionQueuePendingDeposit {
  bookingId: string;
  bookingCode: string;
  clientName: string;
  serviceName: string;
  staffName: string;
  startAt: string;
  depositAmountCents: number;
  proofDeliveryMethod?: 'web_upload' | 'web_link' | 'instagram_dm' | 'none' | null;
  paymentProofUrl?: string | null;
}

interface ActionQueueUncollectedBooking {
  bookingId: string;
  clientName: string;
  serviceName: string;
  staffName: string;
  startAt: string;
  endAt: string;
  remainingCents: number;
}

interface BuildActionQueueInput {
  salonName: string;
  currency: 'MXN' | 'USD';
  timezone: string;
  depositFallbackCents?: number;
  pendingDeposits: readonly ActionQueuePendingDeposit[];
  uncollectedBookings: readonly ActionQueueUncollectedBooking[];
  waitlist: readonly WaitlistEntry[];
  services: readonly Pick<Service, 'id' | 'name'>[];
  inventory: readonly Pick<
    InventoryItem,
    'id' | 'name' | 'unit' | 'stockQuantity' | 'minStockAlert' | 'isActive'
  >[];
  whatsappInboxSummary?: Pick<
    WhatsAppInboxSummaryDTO,
    'unreadCount' | 'failedCount' | 'failedRemindersCount'
  > | null;
  whatsappUsage?: Pick<
    WhatsAppMonthlyUsageSummary,
    'alertLevel' | 'sentCount' | 'quotaLimit' | 'percentUsed'
  > | null;
  canAccessInventory?: boolean;
  canAccessWhatsApp?: boolean;
  canAccessIntegrations?: boolean;
}

const WAITLIST_WINDOW_LABELS: Record<string, string> = {
  morning: 'mañana',
  afternoon: 'tarde',
  evening: 'noche',
  any: 'cualquier horario',
};

export function buildActionQueueItems(
  input: BuildActionQueueInput,
): ActionQueueItem[] {
  const items: ActionQueueItem[] = [];
  const tz = input.timezone.trim() || 'America/Mexico_City';
  const currency = input.currency;
  const depositFallbackCents = input.depositFallbackCents ?? 20000;
  const salonName = input.salonName.trim() || 'el estudio';

  const awaitingReview: ActionQueuePendingDeposit[] = [];
  const missingProof: ActionQueuePendingDeposit[] = [];
  for (const dep of input.pendingDeposits) {
    if (hasBookingProofSubmitted(dep)) {
      awaitingReview.push(dep);
    } else {
      missingProof.push(dep);
    }
  }

  for (const dep of awaitingReview) {
    const amountCents = dep.depositAmountCents || depositFallbackCents;
    const dateLabel = formatDateShortInTimezone(dep.startAt, tz);
    const timeLabel = formatTimeInTimezone(dep.startAt, tz);
    items.push({
      id: `dep-${dep.bookingId}`,
      kind: 'deposit_review',
      priority: 1,
      tone: 'warning',
      title: `Por revisar · ${dep.clientName} (${formatCurrency(amountCents, currency)})`,
      subtitle: `${dep.serviceName} · ${dateLabel} ${timeLabel} con ${dep.staffName} · ${dep.bookingCode}`,
      primaryLabel: 'Confirmar cita',
      primaryHref: cajaHref({ tab: 'anticipos' }),
      secondaryLabel: 'Ver comprobante',
      secondaryHref: cajaHref({ tab: 'anticipos' }),
      bookingId: dep.bookingId,
      clientName: dep.clientName,
    });
  }

  for (const dep of missingProof) {
    const amountCents = dep.depositAmountCents || depositFallbackCents;
    const dateLabel = formatDateShortInTimezone(dep.startAt, tz);
    const timeLabel = formatTimeInTimezone(dep.startAt, tz);
    items.push({
      id: `dep-${dep.bookingId}`,
      kind: 'deposit_missing_proof',
      priority: 2,
      tone: 'warning',
      title: `Sin comprobante · ${dep.clientName} (${formatCurrency(amountCents, currency)})`,
      subtitle: `${dep.serviceName} · ${dateLabel} ${timeLabel} con ${dep.staffName} · ${dep.bookingCode}`,
      primaryLabel: 'Confirmar cita',
      primaryHref: cajaHref({ tab: 'anticipos' }),
      secondaryLabel: 'Ver en Caja',
      secondaryHref: cajaHref({ tab: 'anticipos' }),
      bookingId: dep.bookingId,
      clientName: dep.clientName,
    });
  }

  for (const row of input.uncollectedBookings) {
    const dateLabel = formatDateShortInTimezone(row.startAt, tz);
    const endTime = formatTimeInTimezone(row.endAt, tz);
    items.push({
      id: `pay-${row.bookingId}`,
      kind: 'uncollected_booking',
      priority: 3,
      tone: 'accent',
      title: `Cita terminada sin cobrar · ${formatCurrency(row.remainingCents, currency)}`,
      subtitle: `${row.clientName} · ${row.serviceName} con ${row.staffName} · ${dateLabel} ${endTime}`,
      primaryLabel: `Cobrar ${formatCurrency(row.remainingCents, currency)}`,
      primaryHref: agendaHref({ collect: row.bookingId }),
      secondaryLabel: 'Ver por cobrar',
      secondaryHref: agendaHref({ status: 'uncollected' }),
      bookingId: row.bookingId,
      clientName: row.clientName,
    });
  }

  const waitingEntries = input.waitlist.filter((entry) => entry.status === 'waiting');
  for (const entry of waitingEntries) {
    const srv = input.services.find((service) => service.id === entry.serviceId);
    const serviceLabel = srv?.name ?? 'tu cita';
    const waLink = buildWhatsAppLink(
      entry.clientPhoneE164,
      `Hola ${entry.clientName}, se liberó un espacio en ${salonName} para ${serviceLabel} el ${formatDateKeyDisplay(entry.desiredDate)}. ¿Te lo apartamos?`,
    );
    const windowLabel =
      WAITLIST_WINDOW_LABELS[entry.preferredWindow] ?? entry.preferredWindow;
    items.push({
      id: `wait-${entry.id}`,
      kind: 'waitlist',
      priority: 4,
      tone: 'info',
      title: `${entry.clientName} en lista de espera`,
      subtitle: `${serviceLabel} · ${formatDateKeyDisplay(entry.desiredDate, 'short')} (${windowLabel})`,
      primaryLabel: 'Avisar por WhatsApp',
      primaryHref: waLink,
      primaryExternal: true,
      secondaryLabel: 'Ver lista de espera',
      secondaryHref: agendaHref({ panel: 'waitlist' }),
      waitlistId: entry.id,
      clientName: entry.clientName,
    });
  }

  const canSeeWhatsApp = input.canAccessWhatsApp !== false;
  if (canSeeWhatsApp && input.whatsappInboxSummary) {
    const unread = Math.max(0, input.whatsappInboxSummary.unreadCount);
    const failedReminders = Math.max(
      0,
      input.whatsappInboxSummary.failedRemindersCount,
    );
    const failedMessages = Math.max(0, input.whatsappInboxSummary.failedCount);

    if (unread > 0) {
      items.push({
        id: 'whatsapp-unread-alert',
        kind: 'whatsapp_unread',
        priority: 5,
        tone: 'accent',
        title: `${unread} mensaje${unread === 1 ? '' : 's'} sin leer en WhatsApp`,
        subtitle:
          'Tienes conversaciones de clientas esperando respuesta en tu bandeja.',
        primaryLabel: 'Abrir mensajes',
        primaryHref: whatsappHref({ tab: 'mensajes', filter: 'unread' }),
      });
    }

    if (failedReminders > 0) {
      items.push({
        id: 'whatsapp-failed-reminders-alert',
        kind: 'whatsapp_failed_reminders',
        priority: 5,
        tone: 'warning',
        title: `${failedReminders} recordatorio${failedReminders === 1 ? '' : 's'} de WhatsApp con fallo`,
        subtitle: 'Revisa los envíos fallidos y reinténtalos en un clic.',
        primaryLabel: 'Revisar envíos',
        primaryHref: whatsappHref({ tab: 'recordatorios', filter: 'failed' }),
      });
    } else if (failedMessages > 0) {
      items.push({
        id: 'whatsapp-failed-messages-alert',
        kind: 'whatsapp_failed_messages',
        priority: 5,
        tone: 'warning',
        title: `${failedMessages} mensaje${failedMessages === 1 ? '' : 's'} de WhatsApp sin entregar`,
        subtitle: 'Revisa los mensajes con error de entrega en tu bandeja.',
        primaryLabel: 'Ver fallos',
        primaryHref: whatsappHref({ tab: 'mensajes', filter: 'failed' }),
      });
    }
  }

  const canSeeQuota =
    canSeeWhatsApp || input.canAccessIntegrations === true;
  if (
    canSeeQuota &&
    input.whatsappUsage &&
    (input.whatsappUsage.alertLevel === 'warning_80' ||
      input.whatsappUsage.alertLevel === 'limit_100')
  ) {
    const remaining = Math.max(
      0,
      input.whatsappUsage.quotaLimit - input.whatsappUsage.sentCount,
    );
    const isAtLimit = input.whatsappUsage.alertLevel === 'limit_100';
    items.push({
      id: 'whatsapp-quota-alert',
      kind: 'whatsapp_quota',
      priority: 5,
      tone: 'warning',
      title: isAtLimit
        ? `Límite mensual de WhatsApp alcanzado (${input.whatsappUsage.sentCount} de ${input.whatsappUsage.quotaLimit})`
        : `WhatsApp al ${input.whatsappUsage.percentUsed}% de tu límite del mes`,
      subtitle: isAtLimit
        ? 'Los avisos automáticos siguen saliendo por correo y enlace directo hasta el próximo mes.'
        : `${input.whatsappUsage.sentCount} de ${input.whatsappUsage.quotaLimit} mensajes usados · Te quedan ${remaining} avisos automáticos este mes.`,
      primaryLabel: 'Revisar en WhatsApp',
      primaryHref: whatsappHref({ tab: 'conexion' }),
    });
  }

  if (input.canAccessInventory !== false) {
    const lowStock = input.inventory.filter(
      (item) => item.isActive && item.stockQuantity <= item.minStockAlert,
    );
    for (const item of lowStock) {
      items.push({
        id: `stock-${item.id}`,
        kind: 'low_stock',
        priority: 6,
        tone: 'neutral',
        title: `${item.stockQuantity === 1 ? 'Queda' : 'Quedan'} ${formatUnitCount(item.stockQuantity, item.unit)} de ${item.name}`,
        subtitle: `Tu mínimo es ${formatUnitCount(item.minStockAlert, item.unit)}`,
        primaryLabel: 'Ver en inventario',
        primaryHref: inventarioHref({ filter: 'low_stock', itemId: item.id }),
        secondaryLabel: 'Por acabarse',
        secondaryHref: inventarioHref({ filter: 'low_stock' }),
        inventoryItemId: item.id,
      });
    }
  }

  return items;
}
