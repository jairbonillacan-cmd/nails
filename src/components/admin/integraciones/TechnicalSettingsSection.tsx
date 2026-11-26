'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Switch } from '@astryxdesign/core/Switch';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Selector } from '@astryxdesign/core/Selector';
import { TextInput } from '@astryxdesign/core/TextInput';
import { BarChart3, Bell, Save, Send } from 'lucide-react';
import {
  ActionRow,
  CopyableField,
  EmptyStateCard,
  StatusTag,
  SurfaceCard,
  type StatusTagTone,
} from '@/components/ui';
import type {
  NotificationChannel,
  NotificationWorkflow,
  SalonSettings,
  ScheduledNotification,
  Service,
} from '@/lib/types';

interface TechnicalSettingsSectionProps {
  settings: SalonSettings;
  googleCalendarTechUrl: string;
  mercadoPagoTechUrl: string;
  services: Service[];
  workflows: NotificationWorkflow[];
  notifications: ScheduledNotification[];
  savingSettings: boolean;
  onSaveSettingsPatch: (patch: Record<string, unknown>) => void;
  onToggleSmsChannel: (
    workflowId: string,
    currentChannels: NotificationChannel[],
    enabled: boolean,
  ) => void;
  onRefresh: () => Promise<void>;
  onBanner: (msg: { status: 'success' | 'error'; text: string }) => void;
}

function friendlyChannelName(channel: NotificationChannel): string {
  if (channel === 'whatsapp') return 'WhatsApp';
  if (channel === 'sms') return 'Mensaje SMS';
  return 'Correo';
}

function friendlyNotificationStatus(status: ScheduledNotification['status']): {
  label: string;
  tone: StatusTagTone;
} {
  if (status === 'sent') return { label: 'Enviado', tone: 'success' };
  if (status === 'pending') return { label: 'Programado', tone: 'warning' };
  if (status === 'failed') return { label: 'No enviado', tone: 'danger' };
  return { label: 'Cancelado', tone: 'neutral' };
}

export function TechnicalSettingsSection({
  settings,
  googleCalendarTechUrl,
  mercadoPagoTechUrl,
  services,
  workflows,
  notifications,
  savingSettings,
  onSaveSettingsPatch,
  onToggleSmsChannel,
  onRefresh,
  onBanner,
}: TechnicalSettingsSectionProps) {
  const [metaPixel, setMetaPixel] = useState<string | null>(null);
  const [ga4Id, setGa4Id] = useState<string | null>(null);
  const [googleReviewUrl, setGoogleReviewUrl] = useState<string | null>(null);
  const [simName, setSimName] = useState('Daniela (Prueba)');
  const [simPhone, setSimPhone] = useState('+522229112233');
  const [simServiceId, setSimServiceId] = useState('');
  const [simLoading, setSimLoading] = useState(false);

  const activeMetaPixel = metaPixel ?? settings.metaPixelId ?? '';
  const activeGa4 = ga4Id ?? settings.ga4MeasurementId ?? '';
  const activeReviewUrl = googleReviewUrl ?? settings.googleReviewUrl ?? '';
  const isAnalyticsDirty =
    activeMetaPixel.trim() !== (settings.metaPixelId ?? '').trim() ||
    activeGa4.trim() !== (settings.ga4MeasurementId ?? '').trim() ||
    activeReviewUrl.trim() !== (settings.googleReviewUrl ?? '').trim();

  const simulateWhatsAppBooking = async () => {
    setSimLoading(true);
    try {
      const res = await fetch('/api/admin/integrations/whatsapp-simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: simName,
          phone: simPhone,
          serviceId: simServiceId || services[0]?.id,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        booking?: { bookingCode: string };
        replyText?: string;
        error?: string;
      } | null;
      onBanner({
        status: res.ok && json?.ok ? 'success' : 'error',
        text:
          res.ok && json?.ok && json.booking
            ? `Cita de prueba creada (${json.booking.bookingCode}). Ya aparece en tu agenda.`
            : json?.replyText || json?.error || 'No hubo horarios libres para esta prueba.',
      });
      await onRefresh();
    } catch {
      onBanner({ status: 'error', text: 'Error de conexión al probar WhatsApp.' });
    } finally {
      setSimLoading(false);
    }
  };

  return (
    <VStack gap={4} paddingBlockStart={4}>
      <VStack className="ad-config-grid-equal" gap={4}>
        <SurfaceCard
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
                onSaveSettingsPatch({
                  metaPixelId: activeMetaPixel.trim() || null,
                  ga4MeasurementId: activeGa4.trim() || null,
                  googleReviewUrl: activeReviewUrl.trim() || null,
                })
              }
            />
          </VStack>
        </SurfaceCard>

        <SurfaceCard
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
                value={simServiceId || services[0]?.id || ''}
                onChange={(v) => v && setSimServiceId(v)}
                options={services.map((s) => ({ value: s.id, label: s.name }))}
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
        </SurfaceCard>
      </VStack>

      <SurfaceCard
        id="sms-twilio-heading"
        icon={<Bell size={16} aria-hidden="true" />}
        title="Recordatorios por SMS (Twilio)"
        subtitle="Opcional si también quieres enviar mensajes de texto tradicionales."
        actions={
          <Switch
            label="Activar SMS Twilio"
            size="sm"
            value={settings.smsRemindersEnabled}
            onChange={(v) => onSaveSettingsPatch({ smsRemindersEnabled: v })}
          />
        }
      >
        <VStack gap={2} className="ad-card-body" paddingBlockStart={4}>
          {workflows.map((wf) => (
            <HStack key={wf.id} justify="between" align="center" gap={2} wrap="wrap">
              <Text size="sm" weight="medium">
                {wf.name}
              </Text>
              <CheckboxInput
                size="sm"
                label="Enviar por SMS"
                isDisabled={!settings.smsRemindersEnabled}
                value={wf.channels.includes('sms')}
                onChange={(c) => onToggleSmsChannel(wf.id, wf.channels, c)}
              />
            </HStack>
          ))}
        </VStack>
      </SurfaceCard>

      <VStack className="ad-config-grid-equal" gap={4}>
        <SurfaceCard
          id="recent-messages-heading"
          icon={<Bell size={16} aria-hidden="true" />}
          title="Últimos avisos enviados"
          count={notifications.length}
        >
          {notifications.length === 0 ? (
            <VStack className="ad-empty" gap={2}>
              <EmptyStateCard
                framed={false}
                isCompact
                icon={<Bell size={20} aria-hidden="true" />}
                title="Sin envíos todavía"
                description="Aquí verás las confirmaciones y recordatorios que se envíen a tus clientas."
              />
            </VStack>
          ) : (
            <VStack as="ul" className="ad-row-list" gap={0}>
              {notifications.slice(0, 5).map((n) => {
                const statusMeta = friendlyNotificationStatus(n.status);
                return (
                  <li key={n.id}>
                    <ActionRow
                      title={`${friendlyChannelName(n.channel)} → ${n.recipient}`}
                      subtitle={n.previewText}
                      status={<StatusTag tone={statusMeta.tone} label={statusMeta.label} />}
                    />
                  </li>
                );
              })}
            </VStack>
          )}
        </SurfaceCard>

        <SurfaceCard
          id="technical-links-heading"
          title="Enlaces de conexión externa"
          subtitle="Solo los necesitas si alguien de soporte técnico configura Google Calendar o Mercado Pago."
        >
          <VStack gap={3} className="ad-card-body" paddingBlockStart={4}>
            <CopyableField
              label="Dirección técnica de Google Calendar"
              value={googleCalendarTechUrl}
              feedbackMessage="Dirección de Google Calendar copiada."
              monospace
            />
            <CopyableField
              label="Dirección técnica de Mercado Pago"
              value={mercadoPagoTechUrl}
              feedbackMessage="Dirección de Mercado Pago copiada."
              monospace
            />
          </VStack>
        </SurfaceCard>
      </VStack>
    </VStack>
  );
}
