import { Resend } from 'resend';
import { getRuntimeIntegrationStatus } from '../env';
import { buildWhatsAppLink, formatDateLongInTimezone, formatTimeInTimezone } from '../format';
import { generateBookingIcs } from '../ics';
import { escapeHtml } from '../sanitize';
import type {
  BookingWithRelations,
  NotificationChannel,
  NotificationWorkflow,
  SalonSettings,
  ScheduledNotification,
} from '../types';

export interface NotificationDispatchResult {
  status: 'sent' | 'failed';
  providerMessageId: string | null;
  errorMessage: string | null;
}

function renderNotificationTemplate(
  template: string,
  booking: BookingWithRelations,
  settings: SalonSettings,
  appUrl: string,
): string {
  const manageUrl = `${appUrl}/cita/${booking.manageToken}`;
  const bookingUrl = `${appUrl}/reservar`;
  const tz = settings.timezone || 'America/Mexico_City';
  const addonsText =
    booking.addons.length > 0
      ? ` + ${booking.addons.map((a) => a.name).join(', ')}`
      : '';

  const replacements: Record<string, string> = {
    '{{salon_name}}': settings.name,
    '{{booking_code}}': booking.bookingCode,
    '{{client_name}}': booking.client.fullName,
    '{{service_name}}': `${booking.service.name}${addonsText}`,
    '{{staff_name}}': booking.staff.name,
    '{{date_label}}': formatDateLongInTimezone(booking.startAt, tz),
    '{{time_label}}': formatTimeInTimezone(booking.startAt, tz, false),
    '{{address}}': settings.address,
    '{{manage_url}}': manageUrl,
    '{{booking_url}}': bookingUrl,
  };

  let out = template;
  for (const [token, val] of Object.entries(replacements)) {
    out = out.split(token).join(val);
  }
  return out;
}

export function buildBookingWhatsAppFallbackUrl(
  booking: BookingWithRelations,
  settings: SalonSettings,
  appUrl: string,
): string {
  const tz = settings.timezone || 'America/Mexico_City';
  const msg = `Hola ${settings.name}, acabo de agendar mi cita (${booking.bookingCode}) de ${booking.service.name} el ${formatDateLongInTimezone(
    booking.startAt,
    tz,
  )} a las ${formatTimeInTimezone(booking.startAt, tz, false)}. Link de mi cita: ${appUrl}/cita/${booking.manageToken}`;
  return buildWhatsAppLink(settings.whatsappNumber, msg);
}

function sanitizeEmailHref(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    return '#';
  }
  return '#';
}

export function renderBookingEmailHtml(params: {
  salonName: string;
  bodyText: string;
  manageUrl: string;
  address: string;
}): string {
  const safeHref = sanitizeEmailHref(params.manageUrl);
  const escapedBodyHtml = params.bodyText
    .split(/\r?\n/)
    .map((line) => escapeHtml(line))
    .join('<br/>');

  return [
    '<div style="font-family: \'DM Sans\', Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #24211f;">',
    `  <h2 style="font-family: Georgia, serif; margin-bottom: 8px;">${escapeHtml(params.salonName)}</h2>`,
    '  <p style="line-height: 1.6;">' + escapedBodyHtml + '</p>',
    '  <p style="margin-top: 20px;">',
    `    <a href="${escapeHtml(safeHref)}" style="display:inline-block;padding:12px 20px;background:#9E5C64;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">`,
    '      Ver, agregar al calendario o reagendar',
    '    </a>',
    '  </p>',
    `  <p style="color:#6c6560;font-size:13px;margin-top:24px;">${escapeHtml(params.address)}</p>`,
    '</div>',
  ].join('\n');
}

export async function dispatchEmailNotification(params: {
  to: string;
  subject: string;
  bodyText: string;
  booking: BookingWithRelations;
  settings: SalonSettings;
  appUrl: string;
}): Promise<NotificationDispatchResult> {
  const env = getRuntimeIntegrationStatus();
  const manageUrl = `${params.appUrl}/cita/${params.booking.manageToken}`;

  if (!env.resendConfigured || !process.env.RESEND_API_KEY) {
    return {
      status: 'sent',
      providerMessageId: `demo-resend-${Date.now()}`,
      errorMessage: null,
    };
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const icsContent = generateBookingIcs(params.booking, params.settings, manageUrl);
    const safeFromName = params.settings.name.replace(/[\r\n<>"]/g, '').trim() || 'Nails';
    const fromEmail =
      process.env.RESEND_FROM_EMAIL || safeFromName + ' <onboarding@resend.dev>';

    const result = await resend.emails.send({
      from: fromEmail,
      to: params.to,
      subject: params.subject,
      html: renderBookingEmailHtml({
        salonName: params.settings.name,
        bodyText: params.bodyText,
        manageUrl,
        address: params.settings.address,
      }),
      attachments: [
        {
          filename: `cita-${params.booking.bookingCode}.ics`,
          content: Buffer.from(icsContent, 'utf-8'),
        },
      ],
    });

    if (result.error) {
      return {
        status: 'failed',
        providerMessageId: null,
        errorMessage: result.error.message,
      };
    }

    return {
      status: 'sent',
      providerMessageId: result.data?.id ?? `resend-${Date.now()}`,
      errorMessage: null,
    };
  } catch (err) {
    return {
      status: 'failed',
      providerMessageId: null,
      errorMessage: err instanceof Error ? err.message : 'Error enviando correo',
    };
  }
}

export async function dispatchWhatsAppNotification(params: {
  toPhoneE164: string;
  bodyText: string;
}): Promise<NotificationDispatchResult> {
  const env = getRuntimeIntegrationStatus();

  if (!env.whatsappCloudConfigured) {
    return {
      status: 'sent',
      providerMessageId: `demo-wamid-${Date.now()}`,
      errorMessage: null,
    };
  }

  try {
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
    const token = process.env.WHATSAPP_ACCESS_TOKEN!;
    const cleanTo = params.toPhoneE164.replace(/\D/g, '');

    const res = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: cleanTo,
        type: 'text',
        text: { body: params.bodyText },
      }),
    });

    const data = (await res.json()) as {
      messages?: Array<{ id: string }>;
      error?: { message: string };
    };
    if (!res.ok) {
      return {
        status: 'failed',
        providerMessageId: null,
        errorMessage: data.error?.message || `WhatsApp API HTTP ${res.status}`,
      };
    }

    return {
      status: 'sent',
      providerMessageId: data.messages?.[0]?.id ?? `wamid-${Date.now()}`,
      errorMessage: null,
    };
  } catch (err) {
    return {
      status: 'failed',
      providerMessageId: null,
      errorMessage: err instanceof Error ? err.message : 'Error enviando WhatsApp',
    };
  }
}

export async function dispatchSmsNotification(params: {
  toPhoneE164: string;
  bodyText: string;
}): Promise<NotificationDispatchResult> {
  const env = getRuntimeIntegrationStatus();

  if (!env.twilioSmsConfigured) {
    return {
      status: 'sent',
      providerMessageId: `demo-twilio-sms-${Date.now()}`,
      errorMessage: null,
    };
  }

  try {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const authToken = process.env.TWILIO_AUTH_TOKEN!;
    const from = process.env.TWILIO_FROM_NUMBER!;
    const auth = Buffer.from(`${sid}:${authToken}`).toString('base64');

    const form = new URLSearchParams({
      To: params.toPhoneE164,
      From: from,
      Body: params.bodyText.slice(0, 320),
    });

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      },
    );

    const data = (await res.json()) as { sid?: string; message?: string };
    if (!res.ok) {
      return {
        status: 'failed',
        providerMessageId: null,
        errorMessage: data.message || `Twilio HTTP ${res.status}`,
      };
    }

    return {
      status: 'sent',
      providerMessageId: data.sid ?? `SM-${Date.now()}`,
      errorMessage: null,
    };
  } catch (err) {
    return {
      status: 'failed',
      providerMessageId: null,
      errorMessage: err instanceof Error ? err.message : 'Error enviando SMS',
    };
  }
}

export async function buildAndSendImmediateNotifications(params: {
  booking: BookingWithRelations;
  workflows: NotificationWorkflow[];
  settings: SalonSettings;
  trigger: 'booking_created' | 'booking_confirmed' | 'booking_canceled' | 'booking_rescheduled';
}): Promise<ScheduledNotification[]> {
  const env = getRuntimeIntegrationStatus();
  const created: ScheduledNotification[] = [];
  const nowIso = new Date().toISOString();

  const matching = params.workflows.filter(
    (w) => w.isEnabled && w.triggerEvent === params.trigger,
  );

  for (const wf of matching) {
    const subject = renderNotificationTemplate(
      wf.subjectTemplate || `Actualización de cita (${params.booking.bookingCode})`,
      params.booking,
      params.settings,
      env.appUrl,
    );
    const bodyText = renderNotificationTemplate(
      wf.messageTemplate,
      params.booking,
      params.settings,
      env.appUrl,
    );

    for (const channel of wf.channels) {
      if (channel === 'sms' && !params.settings.smsRemindersEnabled) continue;
      if (channel === 'email' && !params.booking.client.email) continue;

      const recipient =
        channel === 'email'
          ? params.booking.client.email!
          : params.booking.client.phoneE164;

      let res: NotificationDispatchResult;
      if (channel === 'email') {
        res = await dispatchEmailNotification({
          to: recipient,
          subject,
          bodyText,
          booking: params.booking,
          settings: params.settings,
          appUrl: env.appUrl,
        });
      } else if (channel === 'whatsapp') {
        res = await dispatchWhatsAppNotification({
          toPhoneE164: recipient,
          bodyText,
        });
      } else {
        res = await dispatchSmsNotification({
          toPhoneE164: recipient,
          bodyText,
        });
      }

      created.push({
        id: `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        bookingId: params.booking.id,
        workflowId: wf.id,
        channel,
        recipient,
        scheduledFor: nowIso,
        status: res.status,
        subject,
        previewText: bodyText.slice(0, 160),
        providerMessageId: res.providerMessageId,
        errorMessage: res.errorMessage,
        sentAt: res.status === 'sent' ? nowIso : null,
        createdAt: nowIso,
      });
    }
  }

  if (params.trigger === 'booking_created' || params.trigger === 'booking_rescheduled') {
    const startMs = new Date(params.booking.startAt).getTime();
    const endMs = new Date(params.booking.endAt).getTime();
    const nowMs = Date.now();

    const scheduledWorkflows = params.workflows.filter(
      (w) =>
        w.isEnabled &&
        (w.triggerEvent === 'before_booking' || w.triggerEvent === 'after_booking'),
    );

    for (const wf of scheduledWorkflows) {
      const targetMs =
        wf.triggerEvent === 'before_booking'
          ? startMs - wf.offsetMinutes * 60_000
          : endMs + wf.offsetMinutes * 60_000;
      if (targetMs <= nowMs) continue;

      const subject = renderNotificationTemplate(
        wf.subjectTemplate,
        params.booking,
        params.settings,
        env.appUrl,
      );
      const bodyText = renderNotificationTemplate(
        wf.messageTemplate,
        params.booking,
        params.settings,
        env.appUrl,
      );

      for (const channel of wf.channels) {
        if (channel === 'sms' && !params.settings.smsRemindersEnabled) continue;
        if (channel === 'email' && !params.booking.client.email) continue;

        created.push({
          id: `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          bookingId: params.booking.id,
          workflowId: wf.id,
          channel: channel as NotificationChannel,
          recipient:
            channel === 'email'
              ? params.booking.client.email!
              : params.booking.client.phoneE164,
          scheduledFor: new Date(targetMs).toISOString(),
          status: 'pending',
          subject,
          previewText: bodyText.slice(0, 160),
          providerMessageId: null,
          errorMessage: null,
          sentAt: null,
          createdAt: nowIso,
        });
      }
    }
  }

  return created;
}
