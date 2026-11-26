'use client';

import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Switch } from '@astryxdesign/core/Switch';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Selector } from '@astryxdesign/core/Selector';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import {
  ArrowRight,
  BarChart3,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  MessageCircle,
  Save,
  Send,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import {
  AdminConfigChip,
  AdminConfigEmpty,
  AdminConfigPageHeader,
  AdminConfigSection,
  AdminConfigSkeleton,
} from '@/components/admin/config/AdminConfigPrimitives';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import {
  formatCurrency,
  formatDateShortInTimezone,
  formatTimeInTimezone,
} from '@/lib/format';
import { summarizeCascadeMetrics } from '@/lib/notifications/cascade';
import type {
  NotificationChannel,
  PaymentMode,
  ScheduledNotification,
  WhatsAppTemplateTriggerKey,
} from '@/lib/types';

const FRIENDLY_WHATSAPP_TEMPLATE_LABELS: Record<
  WhatsAppTemplateTriggerKey,
  { title: string; subtitle: string }
> = {
  booking_confirmed: {
    title: 'Confirmación de cita',
    subtitle: 'Se envía cuando apartan o confirmas su horario.',
  },
  reminder_24h: {
    title: 'Recordatorio 24 horas antes',
    subtitle: 'Recuerda la cita un día antes para reducir faltas.',
  },
  reminder_2h: {
    title: 'Recordatorio 2 horas antes',
    subtitle: 'Comparte la dirección del estudio antes de salir.',
  },
  booking_rescheduled: {
    title: 'Cita reagendada',
    subtitle: 'Confirma el nuevo día y hora elegidos.',
  },
  booking_canceled: {
    title: 'Cita cancelada',
    subtitle: 'Confirma la cancelación y liberación del espacio.',
  },
  waitlist_offer: {
    title: 'Espacio libre en lista de espera',
    subtitle: 'Avisa a la siguiente clienta cuando se libera un turno.',
  },
};

function friendlyChannelName(channel: NotificationChannel): string {
  if (channel === 'whatsapp') return 'WhatsApp';
  if (channel === 'sms') return 'Mensaje SMS';
  return 'Correo';
}

function friendlyNotificationStatus(status: ScheduledNotification['status']): {
  label: string;
  tone: 'success' | 'warning' | 'neutral';
} {
  if (status === 'sent') return { label: 'Enviado', tone: 'success' };
  if (status === 'pending') return { label: 'Programado', tone: 'warning' };
  if (status === 'failed') return { label: 'No enviado', tone: 'warning' };
  return { label: 'Cancelado', tone: 'neutral' };
}

function paymentModeChip(mode: PaymentMode): {
  label: string;
  tone: 'success' | 'accent' | 'neutral';
} {
  if (mode === 'manual_transfer') return { label: 'Transferencia SPEI', tone: 'success' };
  if (mode === 'mercadopago') return { label: 'Mercado Pago', tone: 'accent' };
  if (mode === 'stripe') return { label: 'Tarjeta en línea', tone: 'accent' };
  return { label: 'Sin anticipo', tone: 'neutral' };
}

export default function AdminIntegrationsPage() {
  const { data, loading, refresh } = useAdminData();
  const [msg, setMsg] = useState<{ status: 'success' | 'error'; text: string } | null>(null);
  const copyFeedback = useEphemeralMessage(2500);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [simName, setSimName] = useState('Daniela (Prueba)');
  const [simPhone, setSimPhone] = useState('+522229112233');
  const [simServiceId, setSimServiceId] = useState('');
  const [simLoading, setSimLoading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [busyCalendarStaffId, setBusyCalendarStaffId] = useState<string | null>(null);

  const [metaPixel, setMetaPixel] = useState<string | null>(null);
  const [ga4Id, setGa4Id] = useState<string | null>(null);
  const [googleReviewUrl, setGoogleReviewUrl] = useState<string | null>(null);

  const reminderSummary = useMemo(() => {
    if (!data) return null;
    const referenceDate = new Date(data.serverNowIso);
    return summarizeCascadeMetrics(
      data.bookings,
      data.notifications,
      Number.isNaN(referenceDate.getTime()) ? new Date(0) : referenceDate,
    );
  }, [data]);

  const whatsappTemplates = useMemo(() => {
    if (!data) return [];
    const s = data.settings;
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
        body: `¡Hola {{clienta}}! Recibimos tu solicitud en ${s.name} para {{servicio}} el {{fecha}} a las {{hora}}. Para apartar tu lugar envía tu anticipo de ${depositLabel} por transferencia SPEI a ${bank} · Titular: ${holder} · CLABE: ${clabe}. Mándanos tu comprobante por aquí o por DM a ${ig} para confirmar tu cita.`,
      },
      {
        id: 'reminder-24h',
        title: 'Recordatorio 24 horas antes',
        tag: '24 h antes',
        body: `Hola {{clienta}}, te recordamos tu cita mañana en ${s.name} ({{servicio}}) a las {{hora}} con {{especialista}}. Por favor confírmanos tu asistencia respondiendo este mensaje. Si necesitas reagendar, avísanos con al menos ${s.minRescheduleHours}h de anticipación.`,
      },
      {
        id: 'reminder-2h',
        title: 'Recordatorio 2 horas antes',
        tag: '2 h antes',
        body: `¡Nos vemos en 2 horas en ${s.name}! Te esperamos a las {{hora}} (${s.address}). Recuerda que contamos con 10 minutos de tolerancia para respetar los horarios de todas nuestras clientas.`,
      },
      {
        id: 'refill-3w',
        title: 'Invitación a retoque (3 semanas)',
        tag: 'Retoque',
        body: `Hola {{clienta}}, ya casi cumplen 3 semanas tus uñas de ${s.name}. ¿Te apartamos tu horario de retoque o cambio de set con Karla, Paty o Tere? Puedes elegir tu hora directo en nuestra agenda en línea.`,
      },
      {
        id: 'winback-30d',
        title: 'Volver a escribir a clienta inactiva',
        tag: 'Seguimiento',
        body: `¡Hola {{clienta}}! Te extrañamos en ${s.name}. Tenemos nuevos tonos y diseños en ${ig}. Si gustas agendar tu próximo set esta semana, entra a nuestra agenda en línea o escríbenos y con gusto te apartamos lugar.`,
      },
    ];
  }, [data]);

  if (loading || !data) {
    return <AdminConfigSkeleton kpiCount={0} withSplit={false} />;
  }

  const { integration, settings } = data;
  const activeMetaPixel = metaPixel ?? settings.metaPixelId ?? '';
  const activeGa4 = ga4Id ?? settings.ga4MeasurementId ?? '';
  const activeReviewUrl = googleReviewUrl ?? settings.googleReviewUrl ?? '';
  const isAnalyticsDirty =
    activeMetaPixel.trim() !== (settings.metaPixelId ?? '').trim() ||
    activeGa4.trim() !== (settings.ga4MeasurementId ?? '').trim() ||
    activeReviewUrl.trim() !== (settings.googleReviewUrl ?? '').trim();

  const depositLabel = formatCurrency(
    settings.depositAmountCents ?? 20000,
    settings.currency,
  );
  const timezone = settings.timezone || 'America/Mexico_City';
  const normalizedAppUrl = integration.appUrl.replace(/\/+$/, '');
  const mercadoPagoTechUrl = `${normalizedAppUrl}/api/webhooks/mercadopago`;
  const googleCalendarTechUrl = `${normalizedAppUrl}/api/webhooks/google-calendar`;
  const bookingById = new Map(data.bookings.map((bk) => [bk.id, bk]));
  const connectedCalendarsCount = data.calendarConnections.filter((c) => c.isConnected).length;
  const activeRemindersCount = data.workflows.filter((w) => w.isEnabled).length;
  const payBadge = paymentModeChip(settings.paymentMode);
  const whatsappUsage = data.whatsappUsage ?? {
    monthKey: data.serverTodayKey.slice(0, 7),
    sentCount: 0,
    quotaLimit: settings.whatsappMonthlyQuota ?? 500,
    percentUsed: 0,
    alertLevel: 'ok' as const,
    warned80At: null,
    warned100At: null,
  };
  const whatsappRemaining = Math.max(0, whatsappUsage.quotaLimit - whatsappUsage.sentCount);
  const officialWhatsAppTemplates = data.whatsappTemplates ?? [];
  const activeOfficialTemplatesCount = officialWhatsAppTemplates.filter(
    (tpl) => tpl.isActive,
  ).length;

  const handleCopyText = async (id: string, label: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      copyFeedback.show(`"${label}" copiado.`);
    } catch {
      copyFeedback.show('No se pudo copiar automáticamente; selecciona el texto manualmente.');
    }
  };

  const simulateWhatsAppBooking = async () => {
    setSimLoading(true);
    try {
      const res = await fetch('/api/admin/integrations/whatsapp-simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: simName,
          phone: simPhone,
          serviceId: simServiceId || data.services[0]?.id,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        booking?: { bookingCode: string };
        replyText?: string;
        error?: string;
      } | null;
      setMsg({
        status: res.ok && json?.ok ? 'success' : 'error',
        text:
          res.ok && json?.ok && json.booking
            ? `Cita de prueba creada (${json.booking.bookingCode}). Ya aparece en tu agenda.`
            : json?.replyText || json?.error || 'No hubo horarios libres para esta prueba.',
      });
      await refresh();
    } catch {
      setMsg({ status: 'error', text: 'Error de conexión al probar WhatsApp.' });
    } finally {
      setSimLoading(false);
    }
  };

  const toggleReminderChannel = async (
    workflowId: string,
    currentChannels: NotificationChannel[],
    channel: NotificationChannel,
    enabled: boolean,
  ) => {
    const next = enabled
      ? Array.from(new Set([...currentChannels, channel]))
      : currentChannels.filter((c) => c !== channel);
    const res = await fetch('/api/admin/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'workflow',
        id: workflowId,
        patch: { channels: next },
      }),
    });
    if (res.ok) {
      await refresh();
    } else {
      setMsg({ status: 'error', text: 'No se pudo actualizar este recordatorio.' });
    }
  };

  const saveIntegrationSettings = async (patch: Record<string, unknown>) => {
    setSavingSettings(true);
    try {
      const res = await fetch('/api/admin/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        setMsg({ status: 'success', text: 'Cambios guardados.' });
        await refresh();
      } else {
        setMsg({ status: 'error', text: 'No se pudieron guardar los cambios.' });
      }
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <VStack className="ad-page">
      <AdminConfigPageHeader
        eyebrow="Herramientas del salón"
        title="Conexiones"
        subtitle="Conecta tu calendario, automatiza recordatorios por WhatsApp y elige cómo cobrar anticipos."
      />

      {msg ? (
        <Banner
          status={msg.status}
          role={msg.status === 'error' ? 'alert' : 'status'}
          title={msg.text}
          isDismissable
          onDismiss={() => setMsg(null)}
        />
      ) : null}

      <Text
        type="supporting"
        color="secondary"
        role="status"
        aria-live="polite"
        className="rb-sr-only"
      >
        {copyFeedback.message ?? ''}
      </Text>

      <AdminConfigSection
        id="gcal-heading"
        icon={<Calendar size={18} aria-hidden="true" />}
        title="Google Calendar"
        subtitle="Conecta tu calendario para que tus compromisos personales y las citas del salón nunca se encimen."
        badge={
          <AdminConfigChip
            tone={connectedCalendarsCount > 0 ? 'success' : 'neutral'}
            label={
              connectedCalendarsCount > 0
                ? `${connectedCalendarsCount} conectado${connectedCalendarsCount === 1 ? '' : 's'}`
                : 'Sin conectar'
            }
            hasTabularNumbers
          />
        }
      >
        <VStack gap={3} className="ad-card-body" paddingBlockStart={4}>
          <Grid columns={{ minWidth: 240, max: 3 }} gap={3}>
            {data.staff.map((st) => {
              const conn = data.calendarConnections.find((c) => c.staffId === st.id);
              const isBusy = busyCalendarStaffId === st.id;
              return (
                <VStack key={st.id} className="ad-subpanel" justify="between" gap={3}>
                  <VStack gap={2}>
                    <HStack justify="between" align="center" gap={2} wrap="wrap">
                      <VStack gap={0} className="rb-grow">
                        <Text weight="semibold">{st.name}</Text>
                        <Text type="supporting" color="secondary">
                          {conn?.accountEmail || 'Sin cuenta conectada'}
                        </Text>
                      </VStack>
                      <AdminConfigChip
                        tone={conn?.isConnected ? 'success' : 'neutral'}
                        label={conn?.isConnected ? 'Conectado' : 'Pendiente'}
                      />
                    </HStack>

                    {conn?.isConnected ? (
                      <VStack gap={2}>
                        <Selector
                          label="Guardar citas nuevas en:"
                          size="sm"
                          value={conn.destinationCalendarId}
                          onChange={async (val) => {
                            if (!val) return;
                            await fetch('/api/admin/operations', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                kind: 'calendar',
                                staffId: st.id,
                                patch: { destinationCalendarId: val },
                              }),
                            });
                            await refresh();
                          }}
                          options={conn.availableCalendars.map((c) => ({
                            value: c.id,
                            label: c.summary,
                          }))}
                        />
                        <VStack gap={1}>
                          <Text type="label" color="secondary">
                            Revisar si ya está ocupada en:
                          </Text>
                          {conn.availableCalendars.map((cal) => {
                            const checked = conn.conflictCalendarIds.includes(cal.id);
                            return (
                              <CheckboxInput
                                key={cal.id}
                                size="sm"
                                label={cal.summary}
                                value={checked}
                                onChange={async (next) => {
                                  const ids = next
                                    ? Array.from(
                                        new Set([...conn.conflictCalendarIds, cal.id]),
                                      )
                                    : conn.conflictCalendarIds.filter((i) => i !== cal.id);
                                  await fetch('/api/admin/operations', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      kind: 'calendar',
                                      staffId: st.id,
                                      patch: { conflictCalendarIds: ids },
                                    }),
                                  });
                                  await refresh();
                                }}
                              />
                            );
                          })}
                        </VStack>
                      </VStack>
                    ) : null}
                  </VStack>

                  <Button
                    type="button"
                    label={
                      conn?.isConnected
                        ? 'Desconectar calendario'
                        : 'Conectar Google Calendar'
                    }
                    variant={conn?.isConnected ? 'secondary' : 'primary'}
                    size="sm"
                    width="100%"
                    isLoading={isBusy}
                    onClick={async () => {
                      setBusyCalendarStaffId(st.id);
                      try {
                        const res = await fetch(`/api/integrations/google?staffId=${st.id}`);
                        const json = (await res.json().catch(() => null)) as {
                          configured?: boolean;
                          oauthUrl?: string;
                        } | null;
                        if (json?.configured && json.oauthUrl && !conn?.isConnected) {
                          window.location.href = json.oauthUrl;
                          return;
                        }
                        await fetch('/api/admin/operations', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            kind: 'calendar',
                            staffId: st.id,
                            patch: { isConnected: !conn?.isConnected },
                          }),
                        });
                        await refresh();
                      } finally {
                        setBusyCalendarStaffId(null);
                      }
                    }}
                  />
                </VStack>
              );
            })}
          </Grid>
        </VStack>
      </AdminConfigSection>

      <AdminConfigSection
        id="whatsapp-reminders-heading"
        icon={<MessageCircle size={18} aria-hidden="true" />}
        title="Recordatorios por WhatsApp"
        subtitle="Envía avisos automáticos 24 h y 2 h antes de cada cita para reducir faltas sin escribir uno por uno."
        badge={
          <AdminConfigChip
            tone={activeRemindersCount > 0 ? 'success' : 'neutral'}
            label={`${activeRemindersCount} avisos activos`}
            hasTabularNumbers
          />
        }
        actions={
          <Switch
            label="Recibir citas por WhatsApp"
            size="sm"
            value={settings.whatsappBookingEnabled}
            onChange={(v) => void saveIntegrationSettings({ whatsappBookingEnabled: v })}
          />
        }
      >
        <VStack gap={4} className="ad-card-body" paddingBlockStart={4}>
          <VStack gap={3} className="ad-subpanel">
            <HStack justify="between" align="center" wrap="wrap" gap={2}>
              <VStack gap={0.5} className="rb-grow">
                <Text weight="semibold" size="sm">
                  Mensajes automáticos de este mes
                </Text>
                <Text type="supporting" color="secondary" hasTabularNumbers>
                  {whatsappUsage.sentCount} de {whatsappUsage.quotaLimit} mensajes usados este mes ·{' '}
                  {whatsappRemaining > 0
                    ? `te quedan ${whatsappRemaining} disponibles`
                    : 'límite mensual alcanzado'}
                </Text>
              </VStack>
              <AdminConfigChip
                tone={whatsappUsage.alertLevel === 'ok' ? 'success' : 'warning'}
                label={
                  whatsappUsage.alertLevel === 'limit_100'
                    ? 'Límite alcanzado'
                    : `${whatsappUsage.percentUsed}% usado`
                }
                hasTabularNumbers
              />
            </HStack>

            <ProgressBar
              label="Mensajes de WhatsApp usados este mes"
              isLabelHidden
              value={whatsappUsage.sentCount}
              max={whatsappUsage.quotaLimit}
              variant={
                whatsappUsage.alertLevel === 'limit_100'
                  ? 'error'
                  : whatsappUsage.alertLevel === 'warning_80'
                    ? 'warning'
                    : 'accent'
              }
            />

            {whatsappUsage.alertLevel === 'warning_80' ? (
              <Banner
                status="warning"
                title={`Ya usaste el ${whatsappUsage.percentUsed}% de tus mensajes de WhatsApp de este mes`}
                description={`Te quedan ${whatsappRemaining} avisos automáticos. Si llegas a ${whatsappUsage.quotaLimit}, las confirmaciones seguirán llegando por correo y podrás abrir WhatsApp en un toque.`}
              />
            ) : null}

            {whatsappUsage.alertLevel === 'limit_100' ? (
              <Banner
                status="warning"
                title={`Alcanzaste los ${whatsappUsage.quotaLimit} mensajes automáticos de este mes`}
                description="Para evitar cobros inesperados, los avisos siguen llegando por correo electrónico y con enlace directo a WhatsApp hasta el inicio del próximo mes."
              />
            ) : null}
          </VStack>

          {reminderSummary ? (
            reminderSummary.bookingsWithoutReminders.length > 0 ? (
              <VStack gap={2} className="ad-subpanel">
                <HStack justify="between" align="center" wrap="wrap" gap={2}>
                  <HStack gap={2} align="center">
                    <Bell size={16} aria-hidden="true" />
                    <Text weight="semibold" size="sm">
                      {reminderSummary.bookingsWithoutReminders.length} cita
                      {reminderSummary.bookingsWithoutReminders.length === 1 ? '' : 's'} sin recordatorio programado
                    </Text>
                  </HStack>
                  <Button
                    label="Ver en Citas"
                    variant="secondary"
                    size="sm"
                    href="/admin/citas"
                    icon={<ArrowRight size={14} aria-hidden="true" />}
                  />
                </HStack>
                <VStack as="ul" className="ad-surface ad-row-list" gap={0}>
                  {reminderSummary.bookingsWithoutReminders.slice(0, 4).map((bk) => {
                    const detailed = bookingById.get(bk.id);
                    return (
                      <li key={bk.id} className="ad-row-item">
                        <VStack gap={0.5} className="rb-grow">
                          <Text weight="semibold" size="sm">
                            {detailed?.client.fullName ?? 'Clienta'} · {bk.bookingCode}
                          </Text>
                          <Text type="supporting" color="secondary" hasTabularNumbers>
                            {detailed?.service.name ?? 'Servicio'} ·{' '}
                            {formatDateShortInTimezone(bk.startAt, timezone)} ·{' '}
                            {formatTimeInTimezone(bk.startAt, timezone)}
                          </Text>
                        </VStack>
                        <Button label="Abrir" variant="ghost" size="sm" href="/admin/citas" />
                      </li>
                    );
                  })}
                </VStack>
              </VStack>
            ) : (
              <HStack className="ad-subpanel" gap={2} align="center">
                <CheckCircle2 size={18} aria-hidden="true" />
                <VStack gap={0}>
                  <Text weight="semibold" size="sm">
                    Todas tus citas próximas tienen recordatorio listo
                  </Text>
                  <Text type="supporting" color="secondary">
                    Si la clienta confirma primero por correo, no le mandamos WhatsApp repetido.
                  </Text>
                </VStack>
              </HStack>
            )
          ) : null}

          <VStack as="ul" className="ad-surface ad-row-list" gap={0}>
            {data.workflows.map((wf) => (
              <li
                key={wf.id}
                className="ad-row-item"
                data-muted={!wf.isEnabled ? 'true' : undefined}
              >
                <VStack gap={2} width="100%">
                  <HStack justify="between" align="start" wrap="wrap" gap={2}>
                    <VStack gap={0.5} className="rb-grow">
                      <Text weight="semibold">{wf.name}</Text>
                      <Text type="supporting" color="secondary">
                        {wf.messageTemplate}
                      </Text>
                    </VStack>
                    <Switch
                      label={`Activar ${wf.name}`}
                      isLabelHidden
                      size="sm"
                      value={wf.isEnabled}
                      onChange={async (checked) => {
                        await fetch('/api/admin/operations', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            kind: 'workflow',
                            id: wf.id,
                            patch: { isEnabled: checked },
                          }),
                        });
                        await refresh();
                      }}
                    />
                  </HStack>
                  <HStack gap={4} wrap="wrap">
                    <CheckboxInput
                      size="sm"
                      label="WhatsApp"
                      value={wf.channels.includes('whatsapp')}
                      onChange={(c) =>
                        void toggleReminderChannel(wf.id, wf.channels, 'whatsapp', c)
                      }
                    />
                    <CheckboxInput
                      size="sm"
                      label="Correo electrónico"
                      value={wf.channels.includes('email')}
                      onChange={(c) =>
                        void toggleReminderChannel(wf.id, wf.channels, 'email', c)
                      }
                    />
                  </HStack>
                </VStack>
              </li>
            ))}
          </VStack>

          <Collapsible
            className="ad-disclosure"
            defaultIsOpen={false}
            trigger={
              <HStack gap={2} align="center">
                <Sparkles size={14} aria-hidden="true" />
                <Text weight="semibold" size="sm">
                  Mensajes de WhatsApp listos para copiar ({whatsappTemplates.length})
                </Text>
              </HStack>
            }
          >
            <VStack className="ad-config-grid-equal" gap={3} paddingBlockStart={3}>
              {whatsappTemplates.map((tpl) => {
                const isCopied = copiedId === tpl.id && Boolean(copyFeedback.message);
                return (
                  <VStack key={tpl.id} className="ad-subpanel" justify="between" gap={3}>
                    <VStack gap={1.5}>
                      <HStack justify="between" align="start" wrap="wrap" gap={1.5}>
                        <Text weight="semibold" size="sm">
                          {tpl.title}
                        </Text>
                        <AdminConfigChip tone="neutral" label={tpl.tag} />
                      </HStack>
                      <Text type="supporting" color="secondary">
                        {tpl.body}
                      </Text>
                    </VStack>
                    <Button
                      type="button"
                      label={isCopied ? 'Mensaje copiado' : 'Copiar mensaje'}
                      variant={isCopied ? 'primary' : 'secondary'}
                      size="sm"
                      icon={
                        isCopied ? (
                          <Check size={14} aria-hidden="true" className="fx-pop" />
                        ) : (
                          <Copy size={14} aria-hidden="true" />
                        )
                      }
                      onClick={() => void handleCopyText(tpl.id, tpl.title, tpl.body)}
                    />
                  </VStack>
                );
              })}
            </VStack>
          </Collapsible>

          {officialWhatsAppTemplates.length > 0 ? (
            <Collapsible
              className="ad-disclosure"
              defaultIsOpen={false}
              trigger={
                <HStack justify="between" align="center" gap={2} width="100%" wrap="wrap">
                  <HStack gap={2} align="center">
                    <CheckCircle2 size={14} aria-hidden="true" />
                    <Text weight="semibold" size="sm">
                      Plantillas oficiales aprobadas de WhatsApp ({activeOfficialTemplatesCount})
                    </Text>
                  </HStack>
                  <AdminConfigChip
                    tone={activeOfficialTemplatesCount > 0 ? 'success' : 'neutral'}
                    label="Español (México)"
                  />
                </HStack>
              }
            >
              <VStack as="ul" className="ad-surface ad-row-list" gap={0}>
                {officialWhatsAppTemplates.map((tpl) => {
                  const meta = FRIENDLY_WHATSAPP_TEMPLATE_LABELS[tpl.triggerKey];
                  return (
                    <li
                      key={tpl.id}
                      className="ad-row-item"
                      data-muted={!tpl.isActive ? 'true' : undefined}
                    >
                      <VStack gap={0.5} className="rb-grow">
                        <Text weight="semibold" size="sm">
                          {meta?.title ?? tpl.templateName}
                        </Text>
                        <Text type="supporting" color="secondary">
                          {meta?.subtitle ?? 'Aviso automático oficial'} · {tpl.templateName}
                        </Text>
                      </VStack>
                      <AdminConfigChip
                        tone={tpl.isActive ? 'success' : 'neutral'}
                        label={tpl.isActive ? 'Activa' : 'Pausada'}
                      />
                    </li>
                  );
                })}
              </VStack>
            </Collapsible>
          ) : null}
        </VStack>
      </AdminConfigSection>

      <AdminConfigSection
        id="payments-heading"
        icon={<CreditCard size={18} aria-hidden="true" />}
        title="Cobro en línea"
        subtitle={`Elige si cobras tu anticipo de ${depositLabel} por transferencia SPEI o con pago automático en Mercado Pago.`}
        badge={<AdminConfigChip tone={payBadge.tone} label={payBadge.label} />}
      >
        <VStack gap={4} className="ad-card-body" paddingBlockStart={4}>
          <Selector
            label="Cómo apartan sus citas tus clientas"
            value={settings.paymentMode}
            isDisabled={savingSettings}
            onChange={(v) =>
              v && void saveIntegrationSettings({ paymentMode: v as PaymentMode })
            }
            options={[
              {
                value: 'manual_transfer',
                label: 'Transferencia SPEI con comprobante (Sin comisión)',
              },
              {
                value: 'mercadopago',
                label: 'Mercado Pago (Pago automático con tarjeta, SPEI u OXXO)',
              },
              {
                value: 'stripe',
                label: 'Tarjeta en línea (Stripe)',
              },
              {
                value: 'none',
                label: 'Sin anticipo (Reserva directa)',
              },
            ]}
          />

          <VStack className="ad-config-grid-equal" gap={3}>
            <VStack className="ad-subpanel" gap={1.5}>
              <HStack justify="between" align="center" wrap="wrap" gap={2}>
                <Text weight="semibold" size="sm">
                  Transferencia SPEI
                </Text>
                <AdminConfigChip tone="success" label="$0 comisión" />
              </HStack>
              <Text type="supporting" color="secondary">
                Tu clienta copia tu CLABE ({settings.depositClabe} · {settings.depositBankName}), transfiere {depositLabel} y sube su comprobante o te lo manda por Instagram ({settings.instagramHandle}).
              </Text>
            </VStack>

            <VStack className="ad-subpanel" gap={1.5}>
              <HStack justify="between" align="center" wrap="wrap" gap={2}>
                <Text weight="semibold" size="sm">
                  Mercado Pago automático
                </Text>
                <AdminConfigChip
                  tone={integration.mercadoPagoConfigured ? 'success' : 'neutral'}
                  label={integration.mercadoPagoConfigured ? 'Conectado' : 'Por activar'}
                />
              </HStack>
              <Text type="supporting" color="secondary">
                Envía un link de pago con tarjeta, SPEI u OXXO y confirma la cita sola en cuanto se acredite el pago.
              </Text>
            </VStack>
          </VStack>
        </VStack>
      </AdminConfigSection>

      <Collapsible
        className="ad-disclosure"
        defaultIsOpen={false}
        trigger={
          <HStack justify="between" align="center" gap={2} width="100%" wrap="wrap">
            <HStack gap={2} align="center">
              <SlidersHorizontal size={15} aria-hidden="true" />
              <VStack gap={0}>
                <Text weight="semibold" size="base">
                  Ajustes técnicos (opcional)
                </Text>
                <Text type="supporting" color="secondary">
                  Meta Pixel, Google Analytics, mensajes SMS, link de reseñas de Google y prueba de WhatsApp.
                </Text>
              </VStack>
            </HStack>
            <AdminConfigChip label="Opcional" tone="neutral" />
          </HStack>
        }
      >
        <VStack gap={4} paddingBlockStart={4}>
          <VStack className="ad-config-grid-equal" gap={4}>
            <AdminConfigSection
              id="analytics-heading"
              icon={<BarChart3 size={16} aria-hidden="true" />}
              title="Anuncios y reseñas de Google"
              subtitle="Mide tus anuncios de Instagram y facilita que tus clientas dejen reseñas en Google."
            >
              <VStack gap={3} className="ad-card-body" paddingBlockStart={4}>
                <TextInput
                  label="Meta Pixel (Instagram / Facebook)"
                  placeholder="Ej. 123456789012345"
                  value={activeMetaPixel}
                  onChange={setMetaPixel}
                  isOptional
                />
                <TextInput
                  label="Google Analytics (GA4)"
                  placeholder="Ej. G-XXXXXXXXXX"
                  value={activeGa4}
                  onChange={setGa4Id}
                  isOptional
                />
                <TextInput
                  label="Enlace para reseñas en Google"
                  placeholder="https://g.page/r/.../review"
                  value={activeReviewUrl}
                  onChange={setGoogleReviewUrl}
                  isOptional
                />
                <Button
                  type="button"
                  label="Guardar ajustes"
                  variant="primary"
                  icon={<Save size={15} aria-hidden="true" />}
                  width="100%"
                  isLoading={savingSettings}
                  isDisabled={!isAnalyticsDirty || savingSettings}
                  onClick={() =>
                    void saveIntegrationSettings({
                      metaPixelId: activeMetaPixel.trim() || null,
                      ga4MeasurementId: activeGa4.trim() || null,
                      googleReviewUrl: activeReviewUrl.trim() || null,
                    })
                  }
                />
              </VStack>
            </AdminConfigSection>

            <AdminConfigSection
              id="whatsapp-test-heading"
              icon={<Send size={16} aria-hidden="true" />}
              title="Simulador de prueba de WhatsApp"
              subtitle="Crea una cita de prueba para verificar cómo llega a tu agenda."
            >
              <VStack gap={3} className="ad-card-body" paddingBlockStart={4}>
                <TextInput label="Nombre de prueba" value={simName} onChange={setSimName} />
                <Grid columns={{ minWidth: 150, max: 2 }} gap={2}>
                  <TextInput label="WhatsApp" value={simPhone} onChange={setSimPhone} />
                  <Selector
                    label="Servicio"
                    value={simServiceId || data.services[0]?.id || ''}
                    onChange={(v) => v && setSimServiceId(v)}
                    options={data.services.map((s) => ({ value: s.id, label: s.name }))}
                  />
                </Grid>
                <Button
                  type="button"
                  label="Probar cita de WhatsApp"
                  variant="primary"
                  size="sm"
                  icon={<Send size={14} aria-hidden="true" />}
                  isLoading={simLoading}
                  onClick={() => void simulateWhatsAppBooking()}
                />
              </VStack>
            </AdminConfigSection>
          </VStack>

          <AdminConfigSection
            id="sms-twilio-heading"
            icon={<Bell size={16} aria-hidden="true" />}
            title="Recordatorios por SMS (Twilio)"
            subtitle="Opcional si también quieres enviar mensajes de texto tradicionales."
            actions={
              <Switch
                label="Activar SMS Twilio"
                size="sm"
                value={settings.smsRemindersEnabled}
                onChange={(v) => void saveIntegrationSettings({ smsRemindersEnabled: v })}
              />
            }
          >
            <VStack gap={2} className="ad-card-body" paddingBlockStart={4}>
              {data.workflows.map((wf) => (
                <HStack key={wf.id} justify="between" align="center" gap={2} wrap="wrap">
                  <Text size="sm" weight="medium">
                    {wf.name}
                  </Text>
                  <CheckboxInput
                    size="sm"
                    label="Enviar por SMS"
                    isDisabled={!settings.smsRemindersEnabled}
                    value={wf.channels.includes('sms')}
                    onChange={(c) =>
                      void toggleReminderChannel(wf.id, wf.channels, 'sms', c)
                    }
                  />
                </HStack>
              ))}
            </VStack>
          </AdminConfigSection>

          <VStack className="ad-config-grid-equal" gap={4}>
            <AdminConfigSection
              id="recent-messages-heading"
              icon={<Bell size={16} aria-hidden="true" />}
              title="Últimos avisos enviados"
              badge={
                <AdminConfigChip
                  tone="neutral"
                  label={String(data.notifications.length)}
                  hasTabularNumbers
                />
              }
            >
              {data.notifications.length === 0 ? (
                <AdminConfigEmpty
                  icon={<Bell size={20} aria-hidden="true" />}
                  title="Sin envíos todavía"
                  description="Aquí verás las confirmaciones y recordatorios que se envíen a tus clientas."
                />
              ) : (
                <VStack as="ul" className="ad-row-list" gap={0}>
                  {data.notifications.slice(0, 5).map((n) => {
                    const statusMeta = friendlyNotificationStatus(n.status);
                    return (
                      <li key={n.id} className="ad-row-item">
                        <VStack gap={0.5} className="rb-grow">
                          <Text weight="semibold" size="sm">
                            {friendlyChannelName(n.channel)} → {n.recipient}
                          </Text>
                          <Text type="supporting" color="secondary" maxLines={1}>
                            {n.previewText}
                          </Text>
                        </VStack>
                        <AdminConfigChip tone={statusMeta.tone} label={statusMeta.label} />
                      </li>
                    );
                  })}
                </VStack>
              )}
            </AdminConfigSection>

            <AdminConfigSection
              id="technical-links-heading"
              title="Enlaces de conexión externa"
              subtitle="Solo los necesitas si alguien de soporte técnico configura Google Calendar o Mercado Pago."
            >
              <VStack gap={3} className="ad-card-body" paddingBlockStart={4}>
                <VStack className="ad-subpanel" gap={1.5}>
                  <Text type="label" weight="semibold">
                    Dirección técnica de Google Calendar
                  </Text>
                  <HStack gap={2} align="center" wrap="wrap">
                    <Text className="ad-code-pill">{googleCalendarTechUrl}</Text>
                    <Button
                      type="button"
                      label={
                        copiedId === 'tech-gcal' && copyFeedback.message ? 'Copiado' : 'Copiar'
                      }
                      variant="secondary"
                      size="sm"
                      icon={
                        copiedId === 'tech-gcal' && copyFeedback.message ? (
                          <Check size={14} aria-hidden="true" className="fx-pop" />
                        ) : (
                          <Copy size={14} aria-hidden="true" />
                        )
                      }
                      onClick={() =>
                        void handleCopyText(
                          'tech-gcal',
                          'Dirección de Google Calendar',
                          googleCalendarTechUrl,
                        )
                      }
                    />
                  </HStack>
                </VStack>

                <VStack className="ad-subpanel" gap={1.5}>
                  <Text type="label" weight="semibold">
                    Dirección técnica de Mercado Pago
                  </Text>
                  <HStack gap={2} align="center" wrap="wrap">
                    <Text className="ad-code-pill">{mercadoPagoTechUrl}</Text>
                    <Button
                      type="button"
                      label={
                        copiedId === 'tech-mp' && copyFeedback.message ? 'Copiado' : 'Copiar'
                      }
                      variant="secondary"
                      size="sm"
                      icon={
                        copiedId === 'tech-mp' && copyFeedback.message ? (
                          <Check size={14} aria-hidden="true" className="fx-pop" />
                        ) : (
                          <Copy size={14} aria-hidden="true" />
                        )
                      }
                      onClick={() =>
                        void handleCopyText(
                          'tech-mp',
                          'Dirección de Mercado Pago',
                          mercadoPagoTechUrl,
                        )
                      }
                    />
                  </HStack>
                </VStack>
              </VStack>
            </AdminConfigSection>
          </VStack>
        </VStack>
      </Collapsible>
    </VStack>
  );
}
