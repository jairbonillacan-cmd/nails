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
import { Divider } from '@astryxdesign/core/Divider';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import {
  ArrowRight,
  BarChart3,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Link2,
  MessageCircle,
  Plug,
  Save,
  Send,
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
import {
  summarizeCascadeMetrics,
  WORKFLOW_TEMPLATE_GALLERY,
  type WorkflowTemplateItem,
} from '@/lib/notifications/cascade';
import type { NotificationChannel, PaymentMode } from '@/lib/types';

const TEMPLATE_CHANNEL_LABELS: Record<WorkflowTemplateItem['channel'], string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  cascade: 'Cascada Email → WA',
};

const TEMPLATE_CATEGORY_TONES: Record<
  WorkflowTemplateItem['category'],
  'success' | 'accent' | 'warning' | 'neutral'
> = {
  confirmation: 'success',
  reminder: 'neutral',
  preparation: 'accent',
  recovery: 'warning',
  waitlist: 'accent',
};

export default function AdminIntegrationsPage() {
  const { data, loading, refresh } = useAdminData();
  const [templateTab, setTemplateTab] = useState('whatsapp');
  const [msg, setMsg] = useState<{ status: 'success' | 'error'; text: string } | null>(null);
  const copyFeedback = useEphemeralMessage(2500);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [simName, setSimName] = useState('Daniela (Prueba WhatsApp)');
  const [simPhone, setSimPhone] = useState('+522229112233');
  const [simServiceId, setSimServiceId] = useState('');
  const [simLoading, setSimLoading] = useState(false);
  const [savingAnalytics, setSavingAnalytics] = useState(false);
  const [busyCalendarStaffId, setBusyCalendarStaffId] = useState<string | null>(null);

  const [metaPixel, setMetaPixel] = useState<string | null>(null);
  const [ga4Id, setGa4Id] = useState<string | null>(null);
  const [googleReviewUrl, setGoogleReviewUrl] = useState<string | null>(null);

  const cascadeMetrics = useMemo(() => {
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
        title: `Confirmación + Anticipo SPEI (${depositLabel})`,
        tag: 'Anticipo',
        body: `¡Hola {{clienta}}! Recibimos tu solicitud en ${s.name} para {{servicio}} el {{fecha}} a las {{hora}}. Para apartar tu lugar envía tu anticipo de ${depositLabel} por transferencia SPEI a ${bank} · Titular: ${holder} · CLABE: ${clabe}. Mándanos tu comprobante por aquí o por DM a ${ig} para confirmar tu cita.`,
      },
      {
        id: 'reminder-24h',
        title: 'Recordatorio 24 horas antes',
        tag: 'Recordatorio 24h',
        body: `Hola {{clienta}}, te recordamos tu cita mañana en ${s.name} ({{servicio}}) a las {{hora}} con {{especialista}}. Por favor confírmanos tu asistencia respondiendo este mensaje. Si necesitas reagendar, avísanos con al menos ${s.minRescheduleHours}h de anticipación.`,
      },
      {
        id: 'reminder-2h',
        title: 'Recordatorio 2 horas antes',
        tag: 'Recordatorio 2h',
        body: `¡Nos vemos en 2 horas en ${s.name}! Te esperamos a las {{hora}} (${s.address}). Recuerda que contamos con 10 minutos de tolerancia para respetar los bloques de todas nuestras clientas.`,
      },
      {
        id: 'refill-3w',
        title: 'Retoque a las 3 semanas',
        tag: 'Retoque',
        body: `Hola {{clienta}}, ya casi cumplen 3 semanas tus uñas de ${s.name}! ¿Te apartamos tu bloque de retoque o cambio de set con Karla, Paty o Tere? Puedes elegir tu horario directo en nuestra agenda en línea.`,
      },
      {
        id: 'winback-30d',
        title: 'Recuperar clienta inactiva (30+ días)',
        tag: 'Retención',
        body: `¡Hola {{clienta}}! Te extrañamos en ${s.name}. Tenemos nuevos tonos y diseños en ${ig}. Si gustas agendar tu próximo set esta semana, entra a nuestra agenda en línea o escríbenos y con gusto te apartamos lugar.`,
      },
    ];
  }, [data]);

  if (loading || !data) {
    return <AdminConfigSkeleton kpiCount={4} withSplit={false} />;
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
  const mercadoPagoWebhookUrl = `${normalizedAppUrl}/api/webhooks/mercadopago`;
  const googleCalendarWebhookUrl = `${normalizedAppUrl}/api/webhooks/google-calendar`;
  const bookingById = new Map(data.bookings.map((bk) => [bk.id, bk]));

  const connectionItems = [
    {
      id: 'db',
      name: 'Base de datos',
      status: integration.supabaseConfigured ? 'Supabase Producción' : 'Demo local',
      live: integration.supabaseConfigured,
    },
    {
      id: 'gcal',
      name: 'Google Calendar',
      status: integration.googleCalendarConfigured ? 'OAuth listo' : 'Demo / Simulado',
      live: integration.googleCalendarConfigured,
    },
    {
      id: 'mp',
      name: 'Mercado Pago',
      status: integration.mercadoPagoConfigured ? 'Checkout activo' : 'SPEI manual / Demo',
      live: integration.mercadoPagoConfigured,
    },
    {
      id: 'resend',
      name: 'Resend Email',
      status: integration.resendConfigured ? 'Activo' : 'Demo / Simulado',
      live: integration.resendConfigured,
    },
    {
      id: 'wa',
      name: 'Meta WhatsApp API',
      status: integration.whatsappCloudConfigured ? 'Activo' : 'Simulado + wa.me',
      live: integration.whatsappCloudConfigured,
    },
    {
      id: 'twilio',
      name: 'Twilio SMS',
      status: integration.twilioSmsConfigured ? 'Activo' : 'Opcional (.env)',
      live: integration.twilioSmsConfigured,
    },
  ];

  const handleCopyText = async (id: string, label: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      copyFeedback.show(`"${label}" copiado al portapapeles.`);
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
            ? `¡Reserva por WhatsApp creada (${json.booking.bookingCode})! El horario ya desapareció en tiempo real de /reservar y aparece en Citas.`
            : json?.replyText || json?.error || 'No hubo horarios disponibles para simular.',
      });
      await refresh();
    } catch {
      setMsg({ status: 'error', text: 'Error de conexión al simular WhatsApp.' });
    } finally {
      setSimLoading(false);
    }
  };

  const toggleWorkflowChannel = async (
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
      setMsg({ status: 'error', text: 'No se pudo actualizar el canal del workflow.' });
    }
  };

  const saveAnalyticsAndPayments = async (patch: Record<string, unknown>) => {
    setSavingAnalytics(true);
    try {
      const res = await fetch('/api/admin/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        setMsg({ status: 'success', text: 'Configuración de integraciones guardada.' });
        await refresh();
      } else {
        setMsg({ status: 'error', text: 'No se pudo guardar la configuración.' });
      }
    } finally {
      setSavingAnalytics(false);
    }
  };

  return (
    <VStack className="ad-page">
      <AdminConfigPageHeader
        eyebrow="Automatización y canales"
        title="Integraciones y recordatorios"
        subtitle="Conecta tus llaves en .env sin tocar código. Mientras tanto copia plantillas sincronizadas con tu marca y prueba cada flujo en modo demo."
        meta={
          <AdminConfigChip
            tone={integration.mode === 'supabase' ? 'success' : 'neutral'}
            label={integration.mode === 'supabase' ? 'Modo producción' : 'Modo demo local'}
          />
        }
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
        id="connections-heading"
        icon={<Plug size={16} aria-hidden="true" />}
        title="Estado de conexiones (.env)"
        subtitle="Indicadores en vivo de tus integraciones de base de datos, calendario, pagos y mensajería."
        padded
      >
        <Grid columns={{ minWidth: 180, max: 3 }} gap={2}>
          {connectionItems.map((conn) => (
            <HStack
              key={conn.id}
              className="ad-subpanel"
              justify="between"
              align="center"
              gap={2}
            >
              <HStack gap={2} align="center" className="rb-grow">
                <StatusDot
                  variant={conn.live ? 'success' : 'neutral'}
                  label={conn.live ? 'Activo' : 'Demo'}
                  isPulsing={conn.live}
                />
                <VStack gap={0} className="rb-grow">
                  <Text weight="semibold" size="sm">
                    {conn.name}
                  </Text>
                  <Text type="supporting" color="secondary">
                    {conn.status}
                  </Text>
                </VStack>
              </HStack>
              <AdminConfigChip
                tone={conn.live ? 'success' : 'neutral'}
                label={conn.live ? 'En vivo' : 'Demo'}
              />
            </HStack>
          ))}
        </Grid>
      </AdminConfigSection>

      {cascadeMetrics ? (
        <AdminConfigSection
          id="cascade-metrics-heading"
          icon={<Bell size={16} aria-hidden="true" />}
          title="Recordatorios en cascada"
          subtitle="Enviamos primero el correo gratuito (.ics) 48 h antes. Si la clienta ya confirmó por Email, pago o recepción, omitimos el WhatsApp pagado automáticamente."
          badge={<AdminConfigChip tone="success" label="Ahorro automático WA" />}
        >
          <VStack gap={4} className="ad-card-body" paddingBlockStart={4}>
            <section aria-label="Métricas de confirmación en cascada" className="ad-kpis-5 fx-stagger">
              <VStack as="article" className="ad-card ad-kpi-card" gap={1}>
                <Text type="supporting" color="secondary" weight="medium" className="ad-kpi-label">
                  Ingresos confirmados
                </Text>
                <Text className="lk-serif ad-kpi-val fx-tabular" hasTabularNumbers>
                  {formatCurrency(cascadeMetrics.confirmedRevenueCents, settings.currency)}
                </Text>
              </VStack>
              <VStack as="article" className="ad-card ad-kpi-card" gap={1}>
                <Text type="supporting" color="secondary" weight="medium" className="ad-kpi-label">
                  Confirmadas por Email
                </Text>
                <Text className="lk-serif ad-kpi-val fx-tabular" hasTabularNumbers>
                  {cascadeMetrics.emailConfirmedCount}
                </Text>
              </VStack>
              <VStack as="article" className="ad-card ad-kpi-card" gap={1}>
                <Text type="supporting" color="secondary" weight="medium" className="ad-kpi-label">
                  Confirmadas por WhatsApp
                </Text>
                <Text className="lk-serif ad-kpi-val fx-tabular" hasTabularNumbers>
                  {cascadeMetrics.whatsappConfirmedCount}
                </Text>
              </VStack>
              <VStack as="article" className="ad-card ad-kpi-card" gap={1}>
                <Text type="supporting" color="secondary" weight="medium" className="ad-kpi-label">
                  Confirmadas por Pago
                </Text>
                <Text className="lk-serif ad-kpi-val fx-tabular" hasTabularNumbers>
                  {cascadeMetrics.paymentConfirmedCount}
                </Text>
              </VStack>
              <VStack as="article" className="ad-card ad-kpi-card" gap={1}>
                <Text type="supporting" color="secondary" weight="medium" className="ad-kpi-label">
                  Confirmadas Manual / Web
                </Text>
                <Text className="lk-serif ad-kpi-val fx-tabular" hasTabularNumbers>
                  {cascadeMetrics.manualConfirmedCount}
                </Text>
              </VStack>
            </section>

            <Divider />

            <VStack gap={3}>
              <HStack justify="between" align="center" wrap="wrap" gap={2}>
                <HStack gap={2} align="center">
                  <Text weight="semibold">Citas sin recordatorio</Text>
                  <AdminConfigChip
                    tone={cascadeMetrics.bookingsWithoutReminders.length > 0 ? 'warning' : 'success'}
                    label={String(cascadeMetrics.bookingsWithoutReminders.length)}
                    hasTabularNumbers
                  />
                </HStack>
                <Button
                  label="Revisar en Citas"
                  variant="secondary"
                  size="sm"
                  href="/admin/citas"
                  icon={<ArrowRight size={14} aria-hidden="true" />}
                />
              </HStack>

              {cascadeMetrics.bookingsWithoutReminders.length > 0 ? (
                <VStack as="ul" className="ad-surface ad-row-list" gap={0}>
                  {cascadeMetrics.bookingsWithoutReminders.slice(0, 6).map((bk) => {
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
                        <Button
                          label="Abrir en Citas"
                          variant="secondary"
                          size="sm"
                          href="/admin/citas"
                        />
                      </li>
                    );
                  })}
                </VStack>
              ) : (
                <HStack className="ad-subpanel" gap={2} align="center">
                  <CheckCircle2 size={18} aria-hidden="true" />
                  <VStack gap={0}>
                    <Text weight="semibold" size="sm">
                      Cobertura completa de recordatorios
                    </Text>
                    <Text type="supporting" color="secondary">
                      Todas tus citas futuras activas ya cuentan con notificación enviada o programada.
                    </Text>
                  </VStack>
                </HStack>
              )}
            </VStack>
          </VStack>
        </AdminConfigSection>
      ) : null}

      <VStack className="ad-config-grid-equal" gap={5}>
        <AdminConfigSection
          id="gcal-heading"
          icon={<Calendar size={16} aria-hidden="true" />}
          title="Google Calendar"
          subtitle="Sincronización bidireccional y revisión automática de conflictos. Tokens cifrados con AES-256-GCM."
        >
          <VStack gap={4} className="ad-card-body" paddingBlockStart={4}>
            <VStack className="ad-subpanel" gap={1.5}>
              <HStack gap={1.5} align="center">
                <Link2 size={14} aria-hidden="true" />
                <Text type="label" weight="semibold">
                  Webhook Push (X-Goog-Channel-Token)
                </Text>
              </HStack>
              <HStack gap={2} align="center" wrap="wrap">
                <Text className="ad-code-pill">{googleCalendarWebhookUrl}</Text>
                <Button
                  type="button"
                  label={
                    copiedId === 'webhook-gcal' && copyFeedback.message
                      ? 'Copiado'
                      : 'Copiar'
                  }
                  variant={
                    copiedId === 'webhook-gcal' && copyFeedback.message
                      ? 'primary'
                      : 'secondary'
                  }
                  size="sm"
                  icon={
                    copiedId === 'webhook-gcal' && copyFeedback.message ? (
                      <Check size={14} aria-hidden="true" className="fx-pop" />
                    ) : (
                      <Copy size={14} aria-hidden="true" />
                    )
                  }
                  onClick={() =>
                    void handleCopyText(
                      'webhook-gcal',
                      'Webhook Google Calendar',
                      googleCalendarWebhookUrl,
                    )
                  }
                />
              </HStack>
            </VStack>

            <VStack gap={3}>
              {data.staff.map((st) => {
                const conn = data.calendarConnections.find((c) => c.staffId === st.id);
                const isBusy = busyCalendarStaffId === st.id;
                return (
                  <VStack key={st.id} className="ad-subpanel" gap={3}>
                    <HStack justify="between" align="center" gap={2} wrap="wrap">
                      <VStack gap={0} className="rb-grow">
                        <Text weight="semibold">{st.name}</Text>
                        <Text type="supporting" color="secondary">
                          {conn?.accountEmail || 'Sin cuenta vinculada'}
                        </Text>
                      </VStack>
                      <AdminConfigChip
                        tone={conn?.isConnected ? 'success' : 'neutral'}
                        label={conn?.isConnected ? 'Conectado' : 'Desconectado'}
                      />
                    </HStack>

                    {conn?.isConnected ? (
                      <VStack gap={2}>
                        <Selector
                          label="Agregar citas nuevas a:"
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
                            Revisar conflictos en:
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

                    <Button
                      type="button"
                      label={
                        conn?.isConnected
                          ? 'Desconectar Google Calendar'
                          : 'Conectar Google Calendar'
                      }
                      variant={conn?.isConnected ? 'secondary' : 'primary'}
                      size="sm"
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
            </VStack>
          </VStack>
        </AdminConfigSection>

        <AdminConfigSection
          id="whatsapp-flow-heading"
          icon={<MessageCircle size={16} aria-hidden="true" />}
          title="Booking por WhatsApp"
          subtitle="Conectado al mismo motor de disponibilidad y bloqueo atómico que /reservar."
          actions={
            <Switch
              label="Booking por WhatsApp activo"
              isLabelHidden
              value={settings.whatsappBookingEnabled}
              onChange={(v) => void saveAnalyticsAndPayments({ whatsappBookingEnabled: v })}
            />
          }
        >
          <VStack gap={4} className="ad-card-body" paddingBlockStart={4}>
            <HStack gap={2} align="center" wrap="wrap">
              <Text type="supporting" color="secondary">
                Webhook Meta Flows:
              </Text>
              <Text className="ad-code-pill">/api/webhooks/whatsapp</Text>
            </HStack>

            <VStack className="ad-subpanel" gap={3}>
              <Text weight="semibold" size="sm">
                Simulador en vivo de cita entrante por WhatsApp
              </Text>
              <TextInput label="Clienta" value={simName} onChange={setSimName} />
              <Grid columns={{ minWidth: 150, max: 2 }} gap={2}>
                <TextInput label="WhatsApp" value={simPhone} onChange={setSimPhone} />
                <Selector
                  label="Servicio"
                  value={simServiceId || data.services[0]?.id || ''}
                  onChange={(v) => v && setSimServiceId(v)}
                  options={data.services.map((s) => ({ value: s.id, label: s.name }))}
                />
              </Grid>
              <HStack gap={2} wrap="wrap">
                <Button
                  type="button"
                  label="Simular reserva entrante"
                  variant="primary"
                  size="sm"
                  icon={<Send size={14} aria-hidden="true" />}
                  isLoading={simLoading}
                  onClick={() => void simulateWhatsAppBooking()}
                />
                <Button
                  label="Ver JSON del Flow"
                  variant="secondary"
                  size="sm"
                  href="/api/webhooks/whatsapp?schema=1"
                />
              </HStack>
            </VStack>
          </VStack>
        </AdminConfigSection>
      </VStack>

      <AdminConfigSection
        id="workflows-heading"
        icon={<Bell size={16} aria-hidden="true" />}
        title="Workflows de recordatorios"
        subtitle="Activa Correo (.ics), WhatsApp o SMS Twilio por etapa del viaje de tu clienta."
        actions={
          <Switch
            label="Habilitar SMS Twilio (~$3.30 MXN)"
            size="sm"
            value={settings.smsRemindersEnabled}
            onChange={(v) => void saveAnalyticsAndPayments({ smsRemindersEnabled: v })}
          />
        }
      >
        <VStack as="ul" className="ad-row-list" gap={0}>
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
                    label="Correo (.ics)"
                    value={wf.channels.includes('email')}
                    onChange={(c) =>
                      void toggleWorkflowChannel(wf.id, wf.channels, 'email', c)
                    }
                  />
                  <CheckboxInput
                    size="sm"
                    label="WhatsApp (~$0.16 MXN)"
                    value={wf.channels.includes('whatsapp')}
                    onChange={(c) =>
                      void toggleWorkflowChannel(wf.id, wf.channels, 'whatsapp', c)
                    }
                  />
                  <CheckboxInput
                    size="sm"
                    label="SMS Twilio (~$3.30 MXN)"
                    isDisabled={!settings.smsRemindersEnabled}
                    value={wf.channels.includes('sms')}
                    onChange={(c) =>
                      void toggleWorkflowChannel(wf.id, wf.channels, 'sms', c)
                    }
                  />
                </HStack>
              </VStack>
            </li>
          ))}
        </VStack>
      </AdminConfigSection>

      <AdminConfigSection
        id="templates-heading"
        icon={<Sparkles size={16} aria-hidden="true" />}
        title="Plantillas listas para copiar"
        subtitle={`Sincronizadas con ${settings.name}, tu CLABE (${settings.depositClabe}) y ${settings.instagramHandle}.`}
        badge={<AdminConfigChip tone="accent" label={`Anticipo ${depositLabel}`} />}
      >
        <VStack gap={4} className="ad-card-body" paddingBlockStart={3}>
          <TabList value={templateTab} onChange={setTemplateTab} hasDivider>
            <Tab value="whatsapp" label={`WhatsApp listas (${whatsappTemplates.length})`} />
            <Tab
              value="automation"
              label={`Flujos automatizados (${WORKFLOW_TEMPLATE_GALLERY.length})`}
            />
          </TabList>

          {templateTab === 'whatsapp' ? (
            <VStack key="tpl-wa" className="ad-config-grid-equal fx-step-in" gap={3}>
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
                      label={isCopied ? 'Plantilla copiada' : 'Copiar plantilla'}
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
          ) : (
            <VStack key="tpl-auto" className="ad-config-grid-equal fx-step-in" gap={3}>
              {WORKFLOW_TEMPLATE_GALLERY.map((tpl) => {
                const isCopied = copiedId === tpl.id && Boolean(copyFeedback.message);
                return (
                  <VStack key={tpl.id} className="ad-subpanel" justify="between" gap={3}>
                    <VStack gap={1.5}>
                      <HStack justify="between" align="start" wrap="wrap" gap={1.5}>
                        <Text weight="semibold" size="sm">
                          {tpl.title}
                        </Text>
                        <AdminConfigChip
                          tone={TEMPLATE_CATEGORY_TONES[tpl.category]}
                          label={TEMPLATE_CHANNEL_LABELS[tpl.channel]}
                        />
                      </HStack>
                      <Text type="label" color="accent">
                        {tpl.timingLabel}
                      </Text>
                      <Text type="supporting" color="secondary">
                        {tpl.description}
                      </Text>
                      <Text type="supporting" color="primary">
                        {tpl.templateText}
                      </Text>
                    </VStack>
                    <Button
                      type="button"
                      label={isCopied ? 'Plantilla copiada' : 'Copiar plantilla'}
                      variant={isCopied ? 'primary' : 'secondary'}
                      size="sm"
                      icon={
                        isCopied ? (
                          <Check size={14} aria-hidden="true" className="fx-pop" />
                        ) : (
                          <Copy size={14} aria-hidden="true" />
                        )
                      }
                      onClick={() =>
                        void handleCopyText(tpl.id, tpl.title, tpl.templateText)
                      }
                    />
                  </VStack>
                );
              })}
            </VStack>
          )}
        </VStack>
      </AdminConfigSection>

      <VStack className="ad-config-grid-equal" gap={5}>
        <AdminConfigSection
          id="payments-heading"
          icon={<CreditCard size={16} aria-hidden="true" />}
          title={`Anticipos y pasarela (${depositLabel})`}
          subtitle="Sin comisiones extra de plataforma: SPEI manual activo y webhooks listos."
        >
          <VStack gap={4} className="ad-card-body" paddingBlockStart={4}>
            <Selector
              label="Modalidad activa de cobro de anticipo"
              value={settings.paymentMode}
              onChange={(v) =>
                v && void saveAnalyticsAndPayments({ paymentMode: v as PaymentMode })
              }
              options={[
                { value: 'none', label: 'Sin anticipo (reserva directa)' },
                {
                  value: 'manual_transfer',
                  label: 'Transferencia SPEI con comprobante (Activa)',
                },
                {
                  value: 'stripe',
                  label: 'Stripe Checkout (Requiere STRIPE_SECRET_KEY)',
                },
                {
                  value: 'mercadopago',
                  label: 'Mercado Pago (Requiere MERCADOPAGO_ACCESS_TOKEN)',
                },
              ]}
            />

            <VStack gap={2}>
              <VStack className="ad-subpanel" gap={1.5}>
                <HStack justify="between" align="center" wrap="wrap" gap={2}>
                  <Text weight="semibold" size="sm">
                    Opción A · Transferencia SPEI
                  </Text>
                  <AdminConfigChip tone="success" label="$0 comisión" />
                </HStack>
                <Text type="supporting" color="secondary">
                  La clienta copia tu CLABE ({settings.depositClabe} · {settings.depositBankName}), transfiere {depositLabel} y envía su comprobante web o por DM a {settings.instagramHandle}.
                </Text>
              </VStack>

              <VStack className="ad-subpanel" gap={2}>
                <HStack justify="between" align="center" wrap="wrap" gap={2}>
                  <Text weight="semibold" size="sm">
                    Opción B · Checkout Mercado Pago
                  </Text>
                  <AdminConfigChip
                    tone={integration.mercadoPagoConfigured ? 'success' : 'neutral'}
                    label={
                      integration.mercadoPagoConfigured
                        ? 'Credenciales activas'
                        : 'Listo con .env'
                    }
                  />
                </HStack>
                <Text type="supporting" color="secondary">
                  Genera link automático (SPEI, tarjeta u OXXO) y confirma la cita vía webhook firmado con HMAC-SHA256.
                </Text>
                <HStack gap={2} align="center" wrap="wrap">
                  <Text className="ad-code-pill">{mercadoPagoWebhookUrl}</Text>
                  <Button
                    type="button"
                    label={
                      copiedId === 'webhook-mp' && copyFeedback.message
                        ? 'Copiado'
                        : 'Copiar webhook'
                    }
                    variant={
                      copiedId === 'webhook-mp' && copyFeedback.message
                        ? 'primary'
                        : 'secondary'
                    }
                    size="sm"
                    icon={
                      copiedId === 'webhook-mp' && copyFeedback.message ? (
                        <Check size={14} aria-hidden="true" className="fx-pop" />
                      ) : (
                        <Copy size={14} aria-hidden="true" />
                      )
                    }
                    onClick={() =>
                      void handleCopyText(
                        'webhook-mp',
                        'Webhook Mercado Pago',
                        mercadoPagoWebhookUrl,
                      )
                    }
                  />
                </HStack>
              </VStack>
            </VStack>

            <Divider />

            <VStack gap={2}>
              <HStack justify="between" align="center">
                <Text weight="semibold" size="sm">
                  Historial reciente de envíos
                </Text>
                <AdminConfigChip
                  tone="neutral"
                  label={String(data.notifications.length)}
                  hasTabularNumbers
                />
              </HStack>
              {data.notifications.length === 0 ? (
                <AdminConfigEmpty
                  icon={<Bell size={20} aria-hidden="true" />}
                  title="Sin envíos registrados todavía"
                  description="Las confirmaciones y recordatorios enviados aparecerán aquí."
                />
              ) : (
                <VStack as="ul" className="ad-surface ad-row-list" gap={0}>
                  {data.notifications.slice(0, 5).map((n) => (
                    <li key={n.id} className="ad-row-item">
                      <VStack gap={0.5} className="rb-grow">
                        <Text weight="semibold" size="sm">
                          {n.channel.toUpperCase()} → {n.recipient}
                        </Text>
                        <Text type="supporting" color="secondary" maxLines={1}>
                          {n.previewText}
                        </Text>
                      </VStack>
                      <AdminConfigChip
                        tone={
                          n.status === 'sent'
                            ? 'success'
                            : n.status === 'pending'
                              ? 'warning'
                              : 'neutral'
                        }
                        label={n.status}
                      />
                    </li>
                  ))}
                </VStack>
              )}
            </VStack>
          </VStack>
        </AdminConfigSection>

        <AdminConfigSection
          id="analytics-heading"
          icon={<BarChart3 size={16} aria-hidden="true" />}
          title="Analytics, píxeles y reseñas Google"
          subtitle="Mide conversiones de Instagram/Facebook Ads y Google Maps sin planes de terceros."
        >
          <VStack gap={3} className="ad-card-body" paddingBlockStart={4}>
            <TextInput
              label="Meta Pixel ID"
              placeholder="Ej. 123456789012345"
              value={activeMetaPixel}
              onChange={setMetaPixel}
              isOptional
            />
            <TextInput
              label="Google Analytics 4 (Measurement ID)"
              placeholder="Ej. G-XXXXXXXXXX"
              value={activeGa4}
              onChange={setGa4Id}
              isOptional
            />
            <TextInput
              label="Link directo para reseñas en Google Maps"
              placeholder="https://g.page/r/.../review"
              value={activeReviewUrl}
              onChange={setGoogleReviewUrl}
              isOptional
            />
            <Button
              type="button"
              label="Guardar Analytics y Reseñas"
              variant="primary"
              icon={<Save size={15} aria-hidden="true" />}
              width="100%"
              isLoading={savingAnalytics}
              isDisabled={!isAnalyticsDirty || savingAnalytics}
              onClick={() =>
                void saveAnalyticsAndPayments({
                  metaPixelId: activeMetaPixel.trim() || null,
                  ga4MeasurementId: activeGa4.trim() || null,
                  googleReviewUrl: activeReviewUrl.trim() || null,
                })
              }
            />
          </VStack>
        </AdminConfigSection>
      </VStack>
    </VStack>
  );
}
