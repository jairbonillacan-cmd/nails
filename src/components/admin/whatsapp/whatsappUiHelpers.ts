import type {
  WhatsAppInboxSummaryDTO,
  WhatsAppMessageDTO,
  WhatsAppServiceWindowDTO,
  WhatsAppTemplateCatalogItemDTO,
  WhatsAppThreadBookingContextDTO,
  WhatsAppThreadSummaryDTO,
} from '@/lib/contracts';
import {
  buildWhatsAppLink,
  formatDateLongInTimezone,
  formatTimeInTimezone,
  getDateKeyInTimezone,
} from '@/lib/format';
import {
  WHATSAPP_TEMPLATE_CATALOG,
  canonicalizeWhatsAppPhoneE164,
  computeWhatsAppServiceWindow,
  getWhatsAppTemplateCatalogItem,
} from '@/lib/notifications/whatsapp-inbox';
import type {
  WhatsAppDeliveryStatus,
  WhatsAppTemplateConfig,
  WhatsAppTemplateTriggerKey,
} from '@/lib/types';
import type { StatusTagTone } from '@/components/ui';

export type WhatsAppThreadFilter = 'all' | 'unread' | 'window_open' | 'failed';

export type WhatsAppBubbleDirection = 'inbound' | 'outbound' | 'bot' | 'echo' | 'system';

interface WhatsAppSendTextInput {
  mode: 'text';
  threadId?: string;
  clientId?: string;
  phoneE164?: string;
  contactName?: string;
  bookingId?: string | null;
  bodyText: string;
}

interface WhatsAppSendTemplateInput {
  mode: 'template';
  threadId?: string;
  clientId?: string;
  phoneE164?: string;
  contactName?: string;
  bookingId?: string | null;
  triggerKey: WhatsAppTemplateTriggerKey;
  templateName?: string;
  parameters: string[];
}

export type WhatsAppSendMessageInput = WhatsAppSendTextInput | WhatsAppSendTemplateInput;

export interface WhatsAppStartNewChatInput {
  phoneE164: string;
  contactName?: string;
  triggerKey: WhatsAppTemplateTriggerKey;
  templateName?: string;
  parameters: string[];
}

export type WhatsAppInboxActionResult =
  | boolean
  | null
  | undefined
  | {
      ok: boolean;
      error?: string;
      code?: string;
      fallbackWaMeUrl?: string;
    };

export interface NormalizedWhatsAppActionResult {
  ok: boolean;
  error: string | null;
  code: string | null;
  fallbackWaMeUrl: string | null;
}

export interface WhatsAppTimelineDayGroup {
  dateKey: string;
  label: string;
  messages: WhatsAppMessageDTO[];
}

export interface WhatsAppWindowBadgeMeta {
  isOpen: boolean;
  label: string;
  shortLabel: string;
  tone: StatusTagTone;
  remainingMinutes: number;
}

export interface WhatsAppDeliveryStatusMeta {
  label: string;
  kind: WhatsAppDeliveryStatus;
}

const DEFAULT_TIMEZONE = 'America/Mexico_City';
const DAY_MS = 86_400_000;

function capitalizeFirst(value: string): string {
  if (!value) return value;
  return `${value[0]?.toUpperCase() ?? ''}${value.slice(1)}`;
}

function getYesterdayDateKey(nowMs: number, timezone: string): string {
  return getDateKeyInTimezone(new Date(nowMs - DAY_MS), timezone);
}

function formatDayMonthShort(iso: string, timezone: string): string {
  const formatted = new Intl.DateTimeFormat('es-MX', {
    timeZone: timezone,
    day: 'numeric',
    month: 'short',
  }).format(new Date(iso));
  return formatted.replace(/\./g, '');
}

export function formatWhatsAppRelativeTime(
  iso: string | null | undefined,
  nowMs: number,
  timezone = DEFAULT_TIMEZONE,
): string {
  if (!iso) return '';
  const tsMs = Date.parse(iso);
  if (!Number.isFinite(tsMs)) return '';

  const effectiveNow = nowMs > 0 ? nowMs : tsMs;
  const diffMs = effectiveNow - tsMs;

  if (diffMs >= 0 && diffMs < 60_000) {
    return 'Ahora';
  }
  if (diffMs >= 60_000 && diffMs < 3_600_000) {
    const mins = Math.floor(diffMs / 60_000);
    return `Hace ${mins} min`;
  }

  const msgKey = getDateKeyInTimezone(new Date(tsMs), timezone);
  const todayKey = getDateKeyInTimezone(new Date(effectiveNow), timezone);
  if (msgKey === todayKey) {
    return formatTimeInTimezone(iso, timezone, false);
  }

  const yesterdayKey = getYesterdayDateKey(effectiveNow, timezone);
  if (msgKey === yesterdayKey) {
    return 'Ayer';
  }

  return formatDayMonthShort(iso, timezone);
}

function formatWhatsAppDateDivider(
  dateKey: string,
  todayKey: string,
  yesterdayKey: string,
): string {
  if (dateKey === todayKey) return 'Hoy';
  if (dateKey === yesterdayKey) return 'Ayer';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!match) return dateKey;
  const [, y, m, d] = match;
  const formatted = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12)));
  return capitalizeFirst(formatted.replace(/\./g, ''));
}

export function groupWhatsAppMessagesByDate(
  messages: readonly WhatsAppMessageDTO[],
  nowMs: number,
  timezone = DEFAULT_TIMEZONE,
): WhatsAppTimelineDayGroup[] {
  const ordered = messages.toSorted((a, b) => {
    const diff = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });

  const referenceMs =
    nowMs > 0
      ? nowMs
      : ordered.length > 0
        ? Date.parse(ordered[ordered.length - 1]!.createdAt) || 0
        : 0;
  const todayKey =
    referenceMs > 0 ? getDateKeyInTimezone(new Date(referenceMs), timezone) : '';
  const yesterdayKey =
    referenceMs > 0 ? getYesterdayDateKey(referenceMs, timezone) : '';

  const groups: WhatsAppTimelineDayGroup[] = [];
  const byKey = new Map<string, WhatsAppTimelineDayGroup>();

  for (const msg of ordered) {
    const parsed = Date.parse(msg.createdAt);
    const dateKey = Number.isFinite(parsed)
      ? getDateKeyInTimezone(new Date(parsed), timezone)
      : 'sin-fecha';
    let group = byKey.get(dateKey);
    if (!group) {
      group = {
        dateKey,
        label:
          dateKey === 'sin-fecha'
            ? 'Sin fecha'
            : formatWhatsAppDateDivider(dateKey, todayKey, yesterdayKey),
        messages: [],
      };
      byKey.set(dateKey, group);
      groups.push(group);
    }
    group.messages.push(msg);
  }

  return groups;
}

export function formatWhatsAppWindowBadge(
  serviceWindow: WhatsAppServiceWindowDTO,
  nowMs: number,
): WhatsAppWindowBadgeMeta {
  const computed =
    serviceWindow.lastInboundAt && nowMs > 0
      ? computeWhatsAppServiceWindow(serviceWindow.lastInboundAt, nowMs)
      : serviceWindow;

  if (!computed.isOpen || computed.remainingMinutes <= 0) {
    return {
      isOpen: false,
      label: 'Ventana cerrada · Solo plantilla',
      shortLabel: 'Solo plantilla',
      tone: 'warning',
      remainingMinutes: 0,
    };
  }

  const totalMinutes = Math.max(1, Math.floor(computed.remainingMinutes));
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const timePart =
    hours > 0 && mins > 0
      ? `${hours} h ${mins} min`
      : hours > 0
        ? `${hours} h`
        : `${mins} min`;

  return {
    isOpen: true,
    label: `Ventana 24 h · ${timePart}`,
    shortLabel: `24 h · ${timePart}`,
    tone: totalMinutes <= 120 ? 'warning' : 'success',
    remainingMinutes: totalMinutes,
  };
}

export function resolveWhatsAppBubbleDirection(
  message: Pick<WhatsAppMessageDTO, 'direction' | 'senderKind' | 'messageType'>,
): WhatsAppBubbleDirection {
  if (message.messageType === 'system') return 'system';
  if (message.direction === 'inbound') return 'inbound';
  if (message.direction === 'echo' || message.senderKind === 'coexistence_phone') {
    return 'echo';
  }
  if (message.senderKind === 'automation') return 'bot';
  return 'outbound';
}

export function getWhatsAppThreadSnippetPrefix(
  thread: Pick<WhatsAppThreadSummaryDTO, 'lastMessageDirection' | 'lastSenderKind'>,
): string {
  if (
    thread.lastMessageDirection === 'echo' ||
    thread.lastSenderKind === 'coexistence_phone'
  ) {
    return 'Celular: ';
  }
  if (thread.lastMessageDirection === 'outbound') {
    return thread.lastSenderKind === 'automation' ? 'Bot: ' : 'Tú: ';
  }
  return '';
}

export function getWhatsAppDeliveryStatusMeta(
  status: WhatsAppDeliveryStatus,
): WhatsAppDeliveryStatusMeta {
  switch (status) {
    case 'queued':
      return { label: 'En cola', kind: 'queued' };
    case 'sent':
      return { label: 'Enviado', kind: 'sent' };
    case 'delivered':
      return { label: 'Entregado', kind: 'delivered' };
    case 'read':
      return { label: 'Leído', kind: 'read' };
    case 'failed':
      return { label: 'No enviado', kind: 'failed' };
    case 'received':
      return { label: 'Recibido', kind: 'received' };
  }
}

export function getWhatsAppAttendanceBadge(
  status: WhatsAppThreadBookingContextDTO['attendanceStatus'],
): { label: string; tone: StatusTagTone } | null {
  if (status === 'confirmed') {
    return { label: 'Confirmó asistencia', tone: 'success' };
  }
  if (status === 'rescheduled') {
    return { label: 'Solicitó reagendar', tone: 'info' };
  }
  return null;
}

export function filterManualWhatsAppTemplates(
  catalog: readonly WhatsAppTemplateCatalogItemDTO[] = WHATSAPP_TEMPLATE_CATALOG,
  configured?: readonly WhatsAppTemplateConfig[],
): WhatsAppTemplateCatalogItemDTO[] {
  const activeByTrigger = new Map<WhatsAppTemplateTriggerKey, boolean>();
  for (const cfg of configured ?? []) {
    activeByTrigger.set(cfg.triggerKey, cfg.isActive);
  }
  const manual = catalog.filter((item) => item.triggerKey !== 'client_otp');
  const activeOnly = manual.filter((item) => activeByTrigger.get(item.triggerKey) !== false);
  return activeOnly.length > 0 ? activeOnly : manual;
}

export function resolveConfiguredTemplateName(
  triggerKey: WhatsAppTemplateTriggerKey,
  configured?: readonly WhatsAppTemplateConfig[],
): string {
  const matched = configured?.find((cfg) => cfg.triggerKey === triggerKey);
  if (matched?.templateName.trim()) {
    return matched.templateName.trim();
  }
  return getWhatsAppTemplateCatalogItem(triggerKey).defaultTemplateName;
}

export function prefillWhatsAppTemplateParameters(
  triggerKey: WhatsAppTemplateTriggerKey,
  context: {
    clientName?: string | null;
    studioAddress?: string | null;
    nextBooking?: WhatsAppThreadBookingContextDTO | null;
    timezone?: string;
    appUrl?: string;
  },
): string[] {
  const spec = getWhatsAppTemplateCatalogItem(triggerKey);
  const tz = context.timezone || DEFAULT_TIMEZONE;
  const firstName =
    (context.clientName ?? '').trim().split(/\s+/)[0] ||
    spec.exampleParameters[0] ||
    'Clienta';
  const normalizedBase = (context.appUrl ?? '').replace(/\/+$/, '');
  const booking = context.nextBooking ?? null;
  const serviceName = booking?.serviceName || 'Rubber';
  const staffName = booking?.staffName || 'Karla';
  const dateLabel = booking
    ? formatDateLongInTimezone(booking.startAt, tz)
    : 'próxima cita';
  const timeLabel = booking
    ? formatTimeInTimezone(booking.startAt, tz, false)
    : '10:00 a.m.';
  const manageUrl =
    booking && normalizedBase
      ? `${normalizedBase}/cita/${booking.manageToken}`
      : normalizedBase
        ? `${normalizedBase}/reservar`
        : spec.exampleParameters[spec.exampleParameters.length - 1] ?? 'https://laikona.devand.net/reservar';
  const bookingUrl = normalizedBase
    ? `${normalizedBase}/reservar`
    : 'https://laikona.devand.net/reservar';
  const address =
    context.studioAddress?.trim() ||
    spec.exampleParameters[2] ||
    'Calle 25 Sur 1904, Col. Volcanes, Puebla, Pue.';

  switch (triggerKey) {
    case 'booking_confirmed':
      return [firstName, serviceName, dateLabel, timeLabel, staffName, manageUrl];
    case 'reminder_24h':
      return [firstName, serviceName, timeLabel, staffName, manageUrl];
    case 'reminder_2h':
      return [firstName, timeLabel, address];
    case 'booking_rescheduled':
      return [firstName, serviceName, dateLabel, timeLabel, manageUrl];
    case 'booking_canceled':
      return [firstName, serviceName, dateLabel];
    case 'waitlist_offer':
      return [firstName, serviceName, dateLabel, timeLabel, bookingUrl];
    case 'deposit_rejected':
      return [firstName, booking?.bookingCode || 'NL-1042', serviceName, manageUrl];
    case 'client_otp':
      return [spec.exampleParameters[0] ?? '482910'];
    case 'touchup_invite':
      return [firstName, serviceName, staffName, bookingUrl];
  }
}

export function buildWaMeDirectUrl(phoneE164: string, text?: string): string {
  const canonical = canonicalizeWhatsAppPhoneE164(phoneE164) || phoneE164;
  const digits = canonical.replace(/\D/g, '');
  if (!digits) return 'https://wa.me/';
  if (!text || !text.trim()) {
    return `https://wa.me/${digits}`;
  }
  return buildWhatsAppLink(canonical, text.trim());
}

export function normalizeWhatsAppActionResult(
  result: WhatsAppInboxActionResult,
  fallbackError: string,
): NormalizedWhatsAppActionResult {
  if (result === true) {
    return { ok: true, error: null, code: null, fallbackWaMeUrl: null };
  }
  if (result && typeof result === 'object') {
    if (result.ok) {
      return {
        ok: true,
        error: null,
        code: result.code ?? null,
        fallbackWaMeUrl: result.fallbackWaMeUrl ?? null,
      };
    }
    return {
      ok: false,
      error: result.error?.trim() || fallbackError,
      code: result.code ?? null,
      fallbackWaMeUrl: result.fallbackWaMeUrl ?? null,
    };
  }
  return {
    ok: false,
    error: fallbackError,
    code: null,
    fallbackWaMeUrl: null,
  };
}

export function buildThreadFilterCounts(
  summary: WhatsAppInboxSummaryDTO | null,
  threads: readonly WhatsAppThreadSummaryDTO[],
): {
  all: number;
  unread: number;
  windowOpen: number;
  failed: number;
} {
  if (summary) {
    return {
      all: summary.totalThreads,
      unread: summary.unreadCount,
      windowOpen: summary.windowOpenCount,
      failed: summary.failedCount,
    };
  }
  return {
    all: threads.length,
    unread: threads.filter((t) => t.unreadCount > 0).length,
    windowOpen: threads.filter((t) => t.serviceWindow.isOpen).length,
    failed: threads.filter((t) => t.hasFailedMessages).length,
  };
}
