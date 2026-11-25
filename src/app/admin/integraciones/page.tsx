'use client';

import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Switch } from '@astryxdesign/core/Switch';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Selector } from '@astryxdesign/core/Selector';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Divider } from '@astryxdesign/core/Divider';
import { List, ListItem } from '@astryxdesign/core/List';
import { Token } from '@astryxdesign/core/Token';
import {
  BarChart3,
  Bell,
  Calendar,
  Check,
  Copy,
  CreditCard,
  MessageCircle,
  Send,
} from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import { formatCurrency } from '@/lib/format';
import type { NotificationChannel, PaymentMode } from '@/lib/types';

export default function AdminIntegrationsPage() {
  const { data, refresh } = useAdminData();
  const [msg, setMsg] = useState<string | null>(null);
  const copyFeedback = useEphemeralMessage(2500);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [simName, setSimName] = useState('Daniela (Prueba WhatsApp)');
  const [simPhone, setSimPhone] = useState('+522229112233');
  const [simServiceId, setSimServiceId] = useState('');
  const [simLoading, setSimLoading] = useState(false);

  const [metaPixel, setMetaPixel] = useState<string | null>(null);
  const [ga4Id, setGa4Id] = useState<string | null>(null);
  const [googleReviewUrl, setGoogleReviewUrl] = useState<string | null>(null);

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

  if (!data) return null;

  const { integration, settings } = data;
  const activeMetaPixel = metaPixel ?? settings.metaPixelId ?? '';
  const activeGa4 = ga4Id ?? settings.ga4MeasurementId ?? '';
  const activeReviewUrl = googleReviewUrl ?? settings.googleReviewUrl ?? '';
  const depositLabel = formatCurrency(
    settings.depositAmountCents ?? 20000,
    settings.currency,
  );

  const handleCopyTemplate = async (id: string, title: string, body: string) => {
    try {
      await navigator.clipboard.writeText(body);
      setCopiedId(id);
      copyFeedback.show(`Plantilla "${title}" copiada al portapapeles.`);
    } catch {
      copyFeedback.show('No se pudo copiar automáticamente; selecciona el texto manualmente.');
    }
  };

  const simulateWhatsAppBooking = async () => {
    setSimLoading(true);
    try {
      const res = await fetch('/api/admin/integrations/whatsapp-simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientName: simName,
          phone: simPhone,
          serviceId: simServiceId || data.services[0]?.id,
        }),
      });
      const json = await res.json();
      setMsg(
        res.ok && json.ok
          ? `¡Reserva por WhatsApp creada (${json.booking.bookingCode})! El horario ya desapareció en tiempo real de /reservar y aparece en Citas.`
          : json.replyText || json.error || 'No hubo horarios disponibles para simular.',
      );
      await refresh();
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
    await fetch('/api/admin/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'workflow',
        id: workflowId,
        patch: { channels: next },
      }),
    });
    await refresh();
  };

  const saveAnalyticsAndPayments = async (patch: Record<string, unknown>) => {
    await fetch('/api/admin/brand', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    setMsg('Configuración de integraciones guardada.');
    await refresh();
  };

  return (
    <VStack gap={5}>
      <VStack gap={0.5}>
        <Heading level={1}>Integraciones, WhatsApp y Recordatorios</Heading>
        <Text color="secondary">
          Todo está listo para conectar tus llaves en .env sin tocar código. Mientras tanto puedes copiar plantillas listas y probar cada flujo en modo demo.
        </Text>
      </VStack>

      {msg ? (
        <Banner
          status="success"
          title={msg}
          isDismissable
          onDismiss={() => setMsg(null)}
        />
      ) : null}

      {copyFeedback.message ? (
        <Banner
          status="info"
          title={copyFeedback.message}
          isDismissable
          onDismiss={copyFeedback.clear}
        />
      ) : null}

      <Card variant="muted" padding={4}>
        <VStack gap={2}>
          <Text type="label" weight="semibold">
            Estado de conexiones (.env)
          </Text>
          <HStack gap={2} wrap="wrap">
            <Badge
              variant={integration.supabaseConfigured ? 'success' : 'info'}
              label={`BD: ${integration.supabaseConfigured ? 'Supabase Producción' : 'Demo Local Persistente'}`}
            />
            <Badge
              variant={integration.googleCalendarConfigured ? 'success' : 'neutral'}
              label={`Google Calendar: ${integration.googleCalendarConfigured ? 'OAuth listo' : 'Simulado'}`}
            />
            <Badge
              variant={integration.resendConfigured ? 'success' : 'neutral'}
              label={`Resend Email: ${integration.resendConfigured ? 'Activo' : 'Simulado'}`}
            />
            <Badge
              variant={integration.whatsappCloudConfigured ? 'success' : 'neutral'}
              label={`Meta WhatsApp API: ${integration.whatsappCloudConfigured ? 'Activo' : 'Simulado + wa.me'}`}
            />
            <Badge
              variant={integration.twilioSmsConfigured ? 'success' : 'neutral'}
              label={`Twilio SMS: ${integration.twilioSmsConfigured ? 'Activo' : 'Opcional (.env)'}`}
            />
          </HStack>
        </VStack>
      </Card>

      <Card padding={5}>
        <VStack gap={4}>
          <HStack justify="between" align="center" wrap="wrap" gap={2}>
            <HStack gap={2} align="center">
              <MessageCircle size={18} aria-hidden="true" />
              <Heading level={2}>Plantillas de WhatsApp listas para enviar</Heading>
            </HStack>
            <Token
              size="sm"
              color="green"
              label={`Sincronizadas con ${settings.name} · ${depositLabel}`}
            />
          </HStack>
          <Text type="supporting" color="secondary">
            Copia en 1 clic cualquiera de los mensajes con los datos actuales de tu salón, tu CLABE ({settings.depositClabe}) y tu cuenta {settings.instagramHandle}.
          </Text>
          <Grid columns={{ minWidth: 280, max: 2 }} gap={3}>
            {whatsappTemplates.map((tpl) => {
              const isCopied = copiedId === tpl.id && Boolean(copyFeedback.message);
              return (
                <Card key={tpl.id} variant="muted" padding={4}>
                  <VStack gap={2}>
                    <HStack justify="between" align="center" wrap="wrap" gap={2}>
                      <Text weight="semibold">{tpl.title}</Text>
                      <Token size="sm" label={tpl.tag} />
                    </HStack>
                    <Text type="supporting" color="secondary">
                      {tpl.body}
                    </Text>
                    <Button
                      label={isCopied ? 'Plantilla copiada' : 'Copiar plantilla'}
                      variant={isCopied ? 'primary' : 'secondary'}
                      size="sm"
                      icon={isCopied ? <Check size={14} /> : <Copy size={14} />}
                      onClick={() => void handleCopyTemplate(tpl.id, tpl.title, tpl.body)}
                    />
                  </VStack>
                </Card>
              );
            })}
          </Grid>
        </VStack>
      </Card>

      <Card padding={5}>
        <VStack gap={4}>
          <HStack gap={2} align="center">
            <CreditCard size={18} aria-hidden="true" />
            <Heading level={2}>Comparativa de cobro de anticipos ({depositLabel})</Heading>
          </HStack>
          <Grid columns={{ minWidth: 280, max: 2 }} gap={4}>
            <Card variant="muted" padding={4}>
              <VStack gap={2}>
                <HStack justify="between" align="center" wrap="wrap" gap={2}>
                  <Text weight="semibold">Opción A · Transferencia SPEI</Text>
                  <Badge variant="success" label="$0 comisión · Activo ahora" />
                </HStack>
                <Text type="supporting" color="secondary">
                  La clienta copia tu CLABE ({settings.depositClabe} · {settings.depositBankName}), transfiere {depositLabel} y sube su comprobante en la web o lo manda por Instagram DM a {settings.instagramHandle}. Tú apruebas en 1 clic desde Caja → Anticipos.
                </Text>
              </VStack>
            </Card>
            <Card variant="muted" padding={4}>
              <VStack gap={2}>
                <HStack justify="between" align="center" wrap="wrap" gap={2}>
                  <Text weight="semibold">Opción B · Checkout Mercado Pago</Text>
                  <Badge
                    variant={integration.mercadoPagoConfigured ? 'success' : 'info'}
                    label={
                      integration.mercadoPagoConfigured
                        ? 'Credenciales activas'
                        : 'Listo al pegar credenciales'
                    }
                  />
                </HStack>
                <Text type="supporting" color="secondary">
                  Genera un link de pago automático (SPEI, tarjeta u OXXO) y confirma la cita al instante vía webhook idempotente sin revisión manual. Aplica comisión estándar de Mercado Pago al pegar MERCADOPAGO_ACCESS_TOKEN en .env.
                </Text>
              </VStack>
            </Card>
          </Grid>
        </VStack>
      </Card>

      <Card padding={5}>
        <VStack gap={4}>
          <HStack gap={2} align="center">
            <Calendar size={18} aria-hidden="true" />
            <Heading level={2}>Google Calendar (Sincronización bidireccional)</Heading>
          </HStack>
          <Text type="supporting" color="secondary">
            Elige a qué calendario agregar las citas nuevas y qué sub-calendarios revisar para bloquear horarios automáticamente si hay conflictos personales.
          </Text>
          <Grid columns={{ minWidth: 300, max: 2 }} gap={4}>
            {data.staff.map((st) => {
              const conn = data.calendarConnections.find((c) => c.staffId === st.id);
              return (
                <Card key={st.id} variant="muted" padding={4}>
                  <VStack gap={3}>
                    <HStack justify="between" align="center">
                      <VStack gap={0}>
                        <Text weight="semibold">{st.name}</Text>
                        <Text type="supporting" color="secondary">
                          {conn?.accountEmail || 'Sin cuenta vinculada'}
                        </Text>
                      </VStack>
                      <Badge
                        variant={conn?.isConnected ? 'success' : 'neutral'}
                        label={conn?.isConnected ? 'Conectado' : 'Desconectado'}
                      />
                    </HStack>

                    {conn?.isConnected ? (
                      <>
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
                          <Text type="label">Revisar conflictos en:</Text>
                          {conn.availableCalendars.map((cal) => {
                            const checked = conn.conflictCalendarIds.includes(cal.id);
                            return (
                              <CheckboxInput
                                key={cal.id}
                                label={cal.summary}
                                value={checked}
                                onChange={async (next) => {
                                  const ids = next
                                    ? Array.from(
                                        new Set([...conn.conflictCalendarIds, cal.id]),
                                      )
                                    : conn.conflictCalendarIds.filter(
                                        (i) => i !== cal.id,
                                      );
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
                      </>
                    ) : null}

                    <Button
                      label={
                        conn?.isConnected
                          ? 'Desconectar Google Calendar'
                          : 'Conectar Google Calendar'
                      }
                      variant={conn?.isConnected ? 'secondary' : 'primary'}
                      size="sm"
                      onClick={async () => {
                        const res = await fetch(
                          `/api/integrations/google?staffId=${st.id}`,
                        );
                        const json = await res.json();
                        if (json.configured && json.oauthUrl && !conn?.isConnected) {
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
                      }}
                    />
                  </VStack>
                </Card>
              );
            })}
          </Grid>
        </VStack>
      </Card>

      <Card padding={5}>
        <VStack gap={4}>
          <HStack justify="between" align="center" wrap="wrap" gap={2}>
            <HStack gap={2} align="center">
              <MessageCircle size={18} aria-hidden="true" />
              <Heading level={2}>Booking directo por WhatsApp (Flows nativos de Meta)</Heading>
            </HStack>
            <Switch
              label="Booking por WhatsApp activo"
              value={settings.whatsappBookingEnabled}
              onChange={(v) => void saveAnalyticsAndPayments({ whatsappBookingEnabled: v })}
            />
          </HStack>

          <Text type="supporting" color="secondary">
            Conectado al mismo motor de disponibilidad y bloqueo atómico que la web. Cuando una clienta agenda en WhatsApp Flows, el horario desaparece de la web al instante. Webhook:{' '}
            <Text type="code">/api/webhooks/whatsapp</Text>
          </Text>

          <Card variant="muted" padding={4}>
            <VStack gap={3}>
              <Text weight="semibold">Simulador en vivo de cita entrante por WhatsApp</Text>
              <Grid columns={{ minWidth: 200, max: 3 }} gap={3}>
                <TextInput label="Clienta" value={simName} onChange={setSimName} />
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
                  label="Simular reserva entrante por WhatsApp"
                  variant="primary"
                  size="sm"
                  icon={<Send size={14} />}
                  isLoading={simLoading}
                  onClick={simulateWhatsAppBooking}
                />
                <Button
                  label="Ver JSON de WhatsApp Flow"
                  variant="secondary"
                  size="sm"
                  href="/api/webhooks/whatsapp?schema=1"
                />
              </HStack>
            </VStack>
          </Card>
        </VStack>
      </Card>

      <Card padding={5}>
        <VStack gap={4}>
          <HStack justify="between" align="center" wrap="wrap" gap={2}>
            <HStack gap={2} align="center">
              <Bell size={18} aria-hidden="true" />
              <Heading level={2}>Workflows de Recordatorios (Correo, WhatsApp y SMS)</Heading>
            </HStack>
            <Switch
              label="Habilitar canal SMS (Twilio · ~$3.30 MXN/SMS vs ~$0.16 WhatsApp)"
              value={settings.smsRemindersEnabled}
              onChange={(v) => void saveAnalyticsAndPayments({ smsRemindersEnabled: v })}
            />
          </HStack>

          <VStack gap={3}>
            {data.workflows.map((wf) => (
              <Card key={wf.id} variant="muted" padding={4}>
                <VStack gap={2}>
                  <HStack justify="between" align="center" wrap="wrap" gap={2}>
                    <VStack gap={0}>
                      <Text weight="semibold">{wf.name}</Text>
                      <Text type="supporting" color="secondary">
                        {wf.messageTemplate}
                      </Text>
                    </VStack>
                    <Switch
                      label="Activo"
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
                      label="Correo (.ics)"
                      value={wf.channels.includes('email')}
                      onChange={(c) =>
                        void toggleWorkflowChannel(wf.id, wf.channels, 'email', c)
                      }
                    />
                    <CheckboxInput
                      label="WhatsApp (~$0.16 MXN)"
                      value={wf.channels.includes('whatsapp')}
                      onChange={(c) =>
                        void toggleWorkflowChannel(wf.id, wf.channels, 'whatsapp', c)
                      }
                    />
                    <CheckboxInput
                      label="SMS Twilio (~$3.30 MXN)"
                      isDisabled={!settings.smsRemindersEnabled}
                      value={wf.channels.includes('sms')}
                      onChange={(c) =>
                        void toggleWorkflowChannel(wf.id, wf.channels, 'sms', c)
                      }
                    />
                  </HStack>
                </VStack>
              </Card>
            ))}
          </VStack>
        </VStack>
      </Card>

      <Grid columns={{ minWidth: 320, max: 2 }} gap={5} align="start">
        <Card padding={5}>
          <VStack gap={3}>
            <HStack gap={2} align="center">
              <BarChart3 size={18} aria-hidden="true" />
              <Heading level={3}>Analytics, Píxeles y Reseñas Google (Gratis)</Heading>
            </HStack>
            <Text type="supporting" color="secondary">
              Mide conversiones de Instagram/Facebook Ads y Google sin pagar planes Pro de $4,500 MXN/mes.
            </Text>
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
              label="Guardar Analytics y Reseñas"
              variant="primary"
              onClick={() =>
                void saveAnalyticsAndPayments({
                  metaPixelId: activeMetaPixel.trim() || null,
                  ga4MeasurementId: activeGa4.trim() || null,
                  googleReviewUrl: activeReviewUrl.trim() || null,
                })
              }
            />
          </VStack>
        </Card>

        <Card padding={5}>
          <VStack gap={3}>
            <HStack gap={2} align="center">
              <CreditCard size={18} aria-hidden="true" />
              <Heading level={3}>Anticipos y Pasarela de Pagos</Heading>
            </HStack>
            <Text type="supporting" color="secondary">
              Sin comisiones extra de plataforma. En v1 funciona con transferencia SPEI y queda listo para enchufar Stripe o Mercado Pago desde .env.
            </Text>
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
                  label: 'Transferencia SPEI con comprobante (Activa en v1)',
                },
                {
                  value: 'stripe',
                  label: 'Stripe Checkout (Listo al pegar STRIPE_SECRET_KEY)',
                },
                {
                  value: 'mercadopago',
                  label: 'Mercado Pago (Listo al pegar MERCADOPAGO_ACCESS_TOKEN)',
                },
              ]}
            />
            <Divider />
            <Heading level={4}>
              Historial reciente de envíos ({data.notifications.length})
            </Heading>
            <List hasDividers>
              {data.notifications.slice(0, 5).map((n) => (
                <ListItem
                  key={n.id}
                  label={`${n.channel.toUpperCase()} → ${n.recipient}`}
                  description={
                    <Text type="supporting" color="secondary" maxLines={1}>
                      {n.previewText}
                    </Text>
                  }
                  endContent={
                    <Token
                      size="sm"
                      color={
                        n.status === 'sent'
                          ? 'green'
                          : n.status === 'pending'
                            ? 'yellow'
                            : 'red'
                      }
                      label={n.status}
                    />
                  }
                />
              ))}
            </List>
          </VStack>
        </Card>
      </Grid>
    </VStack>
  );
}
