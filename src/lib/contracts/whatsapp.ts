import { z } from 'zod';
import type {
  BookingStatus,
  NotificationChannel,
  NotificationWorkflow,
  ScheduledNotificationStatus,
  WhatsAppDeliveryStatus,
  WhatsAppMessageDeliveryMode,
  WhatsAppMessageDirection,
  WhatsAppMessageSenderKind,
  WhatsAppMessageType,
  WhatsAppMonthlyUsageSummary,
  WhatsAppNotificationDeliveryStatus,
  WhatsAppTemplateConfig,
  WhatsAppTemplateTriggerKey,
} from '../types';
import {
  NotificationChannelSchema,
  WhatsAppTemplateTriggerKeySchema,
  WhatsAppThreadFilterSchema,
} from './enums';
import { NonEmptyIdSchema, PhoneInputSchema } from './primitives';

const WhatsAppRecipientFieldsSchema = z.object({
  threadId: NonEmptyIdSchema.optional(),
  clientId: NonEmptyIdSchema.optional(),
  phoneE164: PhoneInputSchema.optional(),
  contactName: z.string().trim().min(1).max(120).optional(),
  bookingId: NonEmptyIdSchema.nullable().optional(),
});

const WhatsAppSendTextSchema = WhatsAppRecipientFieldsSchema.extend({
  mode: z.literal('text'),
  bodyText: z
    .string()
    .trim()
    .min(1, 'Escribe un mensaje para enviar.')
    .max(4096, 'El mensaje no puede superar 4096 caracteres.'),
}).strict();

const WhatsAppSendTemplateSchema = WhatsAppRecipientFieldsSchema.extend({
  mode: z.literal('template'),
  triggerKey: WhatsAppTemplateTriggerKeySchema,
  templateName: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9_]+$/, 'Usa solo letras minúsculas, números y guion bajo (_).')
    .optional(),
  parameters: z.array(z.string().max(1024)).max(10).default([]),
}).strict();

export const WhatsAppSendMessageSchema = z
  .discriminatedUnion('mode', [WhatsAppSendTextSchema, WhatsAppSendTemplateSchema])
  .refine(
    (val) => Boolean(val.threadId || val.clientId || val.phoneE164),
    {
      message: 'Indica una conversación, clienta o número de WhatsApp destino.',
      path: ['phoneE164'],
    },
  );

export const WhatsAppThreadsQuerySchema = z.object({
  filter: WhatsAppThreadFilterSchema.default('all'),
  q: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(32).optional(),
  clientId: NonEmptyIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const WhatsAppWorkflowPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    isEnabled: z.boolean(),
    channels: z.array(NotificationChannelSchema).min(1).max(3),
    offsetMinutes: z.number().int().min(-43_200).max(43_200),
    subjectTemplate: z.string().max(240),
    messageTemplate: z.string().max(1500),
  })
  .partial()
  .strict();

export const WhatsAppRemindersActionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('toggle_workflow'),
      workflowId: NonEmptyIdSchema,
      isEnabled: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal('update_workflow'),
      workflowId: NonEmptyIdSchema,
      patch: WhatsAppWorkflowPatchSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('retry_notification'),
      notificationId: NonEmptyIdSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('cancel_notification'),
      notificationId: NonEmptyIdSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('trigger_now'),
      notificationId: NonEmptyIdSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('run_due_now'),
    })
    .strict(),
  z
    .object({
      action: z.literal('send_test_reminder'),
      workflowId: NonEmptyIdSchema.optional(),
      triggerKey: WhatsAppTemplateTriggerKeySchema.optional(),
      toPhone: PhoneInputSchema,
      bookingId: NonEmptyIdSchema.optional(),
      messagePreview: z.string().trim().min(1).max(1500).optional(),
    })
    .strict(),
]);

export const WhatsAppSimulateEventSchema = z.discriminatedUnion('event', [
  z
    .object({
      event: z.literal('inbound_text'),
      phone: PhoneInputSchema,
      clientName: z.string().trim().min(1).max(120).optional(),
      bodyText: z.string().trim().min(1, 'Escribe el texto a simular.').max(1000),
      bookingId: NonEmptyIdSchema.optional(),
    })
    .strict(),
  z
    .object({
      event: z.literal('inbound_button'),
      phone: PhoneInputSchema,
      clientName: z.string().trim().min(1).max(120).optional(),
      buttonAction: z.enum(['confirm', 'reschedule', 'cancel']),
      bookingId: NonEmptyIdSchema.optional(),
    })
    .strict(),
  z
    .object({
      event: z.literal('coexistence_echo'),
      phone: PhoneInputSchema,
      clientName: z.string().trim().min(1).max(120).optional(),
      bodyText: z.string().trim().min(1, 'Escribe el mensaje enviado desde celular.').max(1000),
    })
    .strict(),
  z
    .object({
      event: z.literal('delivery_status'),
      providerMessageId: z.string().trim().min(1).max(200).optional(),
      messageId: NonEmptyIdSchema.optional(),
      status: z.enum(['sent', 'delivered', 'read', 'failed']),
      errorCode: z.string().trim().max(40).optional(),
      errorMessage: z.string().trim().max(400).optional(),
    })
    .strict()
    .refine(
      (val) => Boolean(val.providerMessageId || val.messageId),
      {
        message: 'Indica providerMessageId o messageId para simular el estado.',
        path: ['messageId'],
      },
    ),
  z
    .object({
      event: z.literal('booking_flow'),
      phone: PhoneInputSchema,
      clientName: z.string().trim().min(1).max(120).optional(),
      serviceId: NonEmptyIdSchema.optional(),
      addonIds: z.array(NonEmptyIdSchema).max(10).optional(),
      staffId: NonEmptyIdSchema.nullable().optional(),
      startAt: NonEmptyIdSchema.optional(),
    })
    .strict(),
]);

export const WhatsAppSettingsPatchSchema = z
  .object({
    whatsappBookingEnabled: z.boolean().optional(),
    whatsappMonthlyQuota: z.number().int().min(50).max(50_000).optional(),
    smsRemindersEnabled: z.boolean().optional(),
  })
  .strict()
  .refine((val) => Object.keys(val).length > 0, {
    message: 'Envía al menos un ajuste para actualizar.',
  });

export const WhatsAppSettingsActionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('update_settings'),
      patch: WhatsAppSettingsPatchSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('update_template'),
      triggerKey: WhatsAppTemplateTriggerKeySchema,
      templateName: z
        .string()
        .trim()
        .min(2, 'Escribe un nombre válido de plantilla')
        .max(120)
        .regex(
          /^[a-z0-9_]+$/,
          'Usa solo letras minúsculas, números y guion bajo (_).',
        )
        .optional(),
      isActive: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('sync_meta_templates'),
    })
    .strict(),
  z
    .object({
      action: z.literal('send_test'),
      toPhone: PhoneInputSchema,
    })
    .strict(),
]);

export interface WhatsAppServiceWindowDTO {
  isOpen: boolean;
  lastInboundAt: string | null;
  expiresAt: string | null;
  remainingMinutes: number;
}

export interface WhatsAppInboxSummaryDTO {
  unreadCount: number;
  failedCount: number;
  failedRemindersCount: number;
  pendingRemindersCount: number;
  windowOpenCount: number;
  totalThreads: number;
}

export interface WhatsAppThreadBookingContextDTO {
  bookingId: string;
  bookingCode: string;
  serviceName: string;
  staffId: string;
  staffName: string;
  startAt: string;
  endAt: string;
  status: BookingStatus;
  attendanceStatus: 'pending' | 'confirmed' | 'rescheduled';
  totalPriceCents: number;
  depositAmountCents: number;
  manageToken: string;
}

export interface WhatsAppThreadSummaryDTO {
  id: string;
  phoneE164: string;
  clientId: string | null;
  contactName: string;
  clientEmail: string | null;
  clientInstagram: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string;
  lastMessageDirection: WhatsAppMessageDirection | null;
  lastInboundAt: string | null;
  unreadCount: number;
  lastReadAt: string | null;
  hasFailedMessages: boolean;
  isArchived: boolean;
  assignedStaffId: string | null;
  serviceWindow: WhatsAppServiceWindowDTO;
  nextBooking: WhatsAppThreadBookingContextDTO | null;
  lastDeliveryStatus: WhatsAppDeliveryStatus | null;
  lastSenderKind: WhatsAppMessageSenderKind | null;
}

export interface WhatsAppMessageDTO {
  id: string;
  threadId: string;
  phoneE164: string;
  clientId: string | null;
  bookingId: string | null;
  notificationId: string | null;
  direction: WhatsAppMessageDirection;
  senderKind: WhatsAppMessageSenderKind;
  senderName: string | null;
  messageType: WhatsAppMessageType;
  bodyText: string;
  templateName: string | null;
  templateTriggerKey: WhatsAppTemplateTriggerKey | null;
  templateParams: string[];
  deliveryStatus: WhatsAppDeliveryStatus;
  deliveryMode: WhatsAppMessageDeliveryMode;
  providerMessageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  createdAt: string;
}

export interface WhatsAppTemplateCatalogItemDTO {
  triggerKey: WhatsAppTemplateTriggerKey;
  defaultTemplateName: string;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
  languageCode: 'es_MX';
  friendlyTitle: string;
  description: string;
  bodyText: string;
  parameterLabels: readonly string[];
  exampleParameters: readonly string[];
  quickReplyButtons?: readonly string[];
}

export interface WhatsAppThreadsListResponseDTO {
  threads: WhatsAppThreadSummaryDTO[];
  summary: WhatsAppInboxSummaryDTO;
  mode: 'demo' | 'supabase';
  cloudConfigured: boolean;
  coexistenceEnabled: boolean;
  quota: WhatsAppMonthlyUsageSummary;
  serverNowIso: string;
}

export interface WhatsAppThreadDetailResponseDTO {
  thread: WhatsAppThreadSummaryDTO;
  messages: WhatsAppMessageDTO[];
  client: {
    id: string;
    fullName: string;
    phoneE164: string;
    email: string | null;
    instagramHandle: string | null;
    notes: string;
    noShowCount: number;
  } | null;
  bookings: WhatsAppThreadBookingContextDTO[];
  templates: WhatsAppTemplateConfig[];
  templateCatalog: readonly WhatsAppTemplateCatalogItemDTO[];
  quickReplies: Array<{ id: string; label: string; text: string }>;
  quota: WhatsAppMonthlyUsageSummary;
  waMeUrl: string;
  serverNowIso: string;
}

export interface WhatsAppSendResponseDTO {
  ok: boolean;
  message: WhatsAppMessageDTO;
  thread: WhatsAppThreadSummaryDTO;
  deliveryMode: WhatsAppMessageDeliveryMode;
  fallbackWaMeUrl: string;
  quota: WhatsAppMonthlyUsageSummary;
  error?: string;
  code?: string;
}

export interface WhatsAppReminderItemDTO {
  id: string;
  bookingId: string | null;
  bookingCode: string | null;
  clientId: string | null;
  clientName: string | null;
  staffName: string | null;
  serviceName: string | null;
  bookingStartAt: string | null;
  workflowId: string | null;
  workflowName: string | null;
  triggerKey: WhatsAppTemplateTriggerKey | null;
  channel: NotificationChannel;
  recipient: string;
  scheduledFor: string;
  status: ScheduledNotificationStatus;
  deliveryStatus: WhatsAppNotificationDeliveryStatus | null;
  subject: string;
  previewText: string;
  bodyText: string;
  providerMessageId: string | null;
  errorMessage: string | null;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  lastAttemptAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface WhatsAppRemindersResponseDTO {
  workflows: NotificationWorkflow[];
  queue: WhatsAppReminderItemDTO[];
  history: WhatsAppReminderItemDTO[];
  metrics: {
    pendingCount: number;
    sentCount: number;
    deliveredCount: number;
    readCount: number;
    failedCount: number;
    canceledCount: number;
    skippedCascadeCount: number;
    bookingsWithoutRemindersCount: number;
  };
  outboxSummary: {
    pendingCount: number;
    processingCount: number;
    failedCount: number;
    processedCount: number;
  };
  serverNowIso: string;
}

export interface WhatsAppSettingsResponseDTO {
  readiness: {
    graphApiVersion: string;
    webhookUrl: string;
    requiredWebhookFields: readonly ['messages', 'statuses', 'smb_message_echoes'];
    accessTokenConfigured: boolean;
    phoneNumberIdConfigured: boolean;
    businessAccountIdConfigured: boolean;
    appSecretConfigured: boolean;
    verifyTokenConfigured: boolean;
    flowIdConfigured: boolean;
    coexistenceEnabled: boolean;
    cloudReady: boolean;
    webhookReady: boolean;
    managementReady: boolean;
    missingVars: string[];
  };
  settings: {
    whatsappBookingEnabled: boolean;
    whatsappMonthlyQuota: number;
    smsRemindersEnabled: boolean;
    whatsappNumber: string;
    salonName: string;
    timezone: string;
  };
  templates: WhatsAppTemplateConfig[];
  templateCatalog: readonly WhatsAppTemplateCatalogItemDTO[];
  usage: WhatsAppMonthlyUsageSummary;
  simulatorAllowed: boolean;
  mode: 'demo' | 'supabase';
  liveMeta?: {
    ok: boolean;
    checkedAt: string;
    phone: {
      displayPhoneNumber: string | null;
      verifiedName: string | null;
      qualityRating: string | null;
      status: string | null;
    } | null;
    templates: Array<{
      triggerKey: WhatsAppTemplateTriggerKey;
      templateName: string;
      metaId: string | null;
      status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED' | 'MISSING' | 'UNKNOWN';
      category: string | null;
      rejectedReason: string | null;
    }>;
    error: string | null;
  } | null;
}

export interface WhatsAppSimulateResponseDTO {
  ok: boolean;
  event: string;
  threadId: string | null;
  phoneE164: string;
  createdMessages: WhatsAppMessageDTO[];
  sideEffectSummary: string | null;
  processed: {
    messages: number;
    statuses: number;
    echoes: number;
    duplicates: number;
    usageIncremented: number;
    attendanceConfirmed: number;
  };
  bookingCode?: string;
  replyText?: string;
}
