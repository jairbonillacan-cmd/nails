'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Switch } from '@astryxdesign/core/Switch';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { TextInput } from '@astryxdesign/core/TextInput';
import { ArrowRight, BarChart3, Bell, Save } from 'lucide-react';
import {
  ActionRow,
  CopyableField,
  EmptyStateCard,
  StatusTag,
  SurfaceCard,
  type StatusTagTone,
} from '@/components/ui';
import { whatsappHref } from '@/lib/admin-links';
import type {
  NotificationChannel,
  NotificationWorkflow,
  SalonSettings,
  ScheduledNotification,
} from '@/lib/types';
import {
  formatDateShortInTimezone,
  formatPhoneDisplay,
  formatTimeInTimezone,
} from '@/lib/format';
import { describeWorkflowMoment } from '@/lib/notifications/template-preview';

interface TechnicalSettingsSectionProps {
  settings: SalonSettings;
  twilioSmsConfigured: boolean;
  timezone: string;
  googleCalendarTechUrl: string;
  mercadoPagoTechUrl: string;
  workflows: NotificationWorkflow[];
  notifications: ScheduledNotification[];
  savingSettings: boolean;
  onSaveSettingsPatch: (patch: Record<string, unknown>) => void;
  onToggleSmsChannel: (
    workflowId: string,
    currentChannels: NotificationChannel[],
    enabled: boolean,
  ) => void;
}

function friendlyChannelName(channel: NotificationChannel): string {
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
  twilioSmsConfigured,
  timezone,
  googleCalendarTechUrl,
  mercadoPagoTechUrl,
  workflows,
  notifications,
  savingSettings,
  onSaveSettingsPatch,
  onToggleSmsChannel,
}: TechnicalSettingsSectionProps) {
  const [metaPixel, setMetaPixel] = useState<string | null>(null);
  const [ga4Id, setGa4Id] = useState<string | null>(null);
  const [googleReviewUrl, setGoogleReviewUrl] = useState<string | null>(null);

  const activeMetaPixel = metaPixel ?? settings.metaPixelId ?? '';
  const activeGa4 = ga4Id ?? settings.ga4MeasurementId ?? '';
  const activeReviewUrl = googleReviewUrl ?? settings.googleReviewUrl ?? '';
  const isAnalyticsDirty =
    activeMetaPixel.trim() !== (settings.metaPixelId ?? '').trim() ||
    activeGa4.trim() !== (settings.ga4MeasurementId ?? '').trim() ||
    activeReviewUrl.trim() !== (settings.googleReviewUrl ?? '').trim();

  const nonWhatsAppNotifications = notifications.filter((item) => item.channel !== 'whatsapp');

  return (
    <VStack gap={4} paddingBlockStart={4}>
      <SurfaceCard
        id="analytics-heading"
        icon={<BarChart3 size={16} aria-hidden="true" />}
        title="Anuncios y reseñas de Google"
        subtitle="Si no sabes qué es alguno de estos datos, déjalo vacío: todo funciona igual."
      >
        <VStack gap={3} className="ad-card-body" paddingBlockStart={4}>
          <TextInput
            label="Anuncios de Instagram y Facebook"
            placeholder="Ejemplo: 123456789012345"
            value={activeMetaPixel}
            onChange={setMetaPixel}
            isOptional
          />
          <TextInput
            label="Estadísticas de visitas (Google)"
            placeholder="Ejemplo: G-XXXXXXXXXX"
            value={activeGa4}
            onChange={setGa4Id}
            isOptional
          />
          <TextInput
            label="Enlace para reseñas en Google"
            placeholder="https://g.page/r/tu-salon/review"
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
        id="sms-twilio-heading"
        icon={<Bell size={16} aria-hidden="true" />}
        title="Recordatorios por mensaje de texto (SMS)"
        subtitle={
          twilioSmsConfigured
            ? 'Opcional si también quieres enviar mensajes de texto tradicionales.'
            : 'Requiere activar el servicio de mensajes de texto en tu cuenta para enviar avisos reales.'
        }
        badge={
          <StatusTag
            tone={twilioSmsConfigured ? 'success' : 'neutral'}
            showDot={twilioSmsConfigured}
            label={twilioSmsConfigured ? 'Conectado' : 'Por activar'}
          />
        }
        actions={
          <Switch
            label="Activar mensajes de texto (SMS)"
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
                {describeWorkflowMoment(wf)}
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
          title="Últimos avisos por correo y SMS"
          count={nonWhatsAppNotifications.length}
          actions={
            <Button
              label="Ver avisos de WhatsApp"
              variant="ghost"
              size="sm"
              icon={<ArrowRight size={14} aria-hidden="true" />}
              href={whatsappHref({ tab: 'recordatorios' })}
            />
          }
        >
          {nonWhatsAppNotifications.length === 0 ? (
            <VStack className="ad-empty" gap={2}>
              <EmptyStateCard
                framed={false}
                isCompact
                icon={<Bell size={20} aria-hidden="true" />}
                title="Sin envíos por correo o SMS todavía"
                description="Los avisos de WhatsApp se consultan directamente en el panel de WhatsApp."
              />
            </VStack>
          ) : (
            <VStack as="ul" className="ad-row-list" gap={0}>
              {nonWhatsAppNotifications.slice(0, 6).map((n) => {
                const statusMeta = friendlyNotificationStatus(n.status);
                const recipientLabel =
                  n.channel === 'email' ? n.recipient : formatPhoneDisplay(n.recipient);
                const ts = n.sentAt ?? n.scheduledFor ?? n.createdAt;
                const timeLabel = `${formatDateShortInTimezone(ts, timezone)} · ${formatTimeInTimezone(ts, timezone)}`;
                return (
                  <li key={n.id}>
                    <ActionRow
                      title={`${friendlyChannelName(n.channel)} a ${recipientLabel}`}
                      subtitle={n.errorMessage ? `${n.previewText} · ${n.errorMessage}` : n.previewText}
                      meta={timeLabel}
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
          title="Enlaces para soporte"
          subtitle="Webhooks para Google Calendar y Mercado Pago. El webhook y simulador de WhatsApp viven en WhatsApp."
          actions={
            <Button
              label="Conexión de WhatsApp"
              variant="ghost"
              size="sm"
              icon={<ArrowRight size={14} aria-hidden="true" />}
              href={whatsappHref({ tab: 'conexion' })}
            />
          }
        >
          <VStack gap={3} className="ad-card-body" paddingBlockStart={4}>
            <CopyableField
              label="Enlace de conexión para Google Calendar"
              value={googleCalendarTechUrl}
              feedbackMessage="Enlace de Google Calendar copiado."
              monospace
            />
            <CopyableField
              label="Enlace de conexión para Mercado Pago"
              value={mercadoPagoTechUrl}
              feedbackMessage="Enlace de Mercado Pago copiado."
              monospace
            />
          </VStack>
        </SurfaceCard>
      </VStack>
    </VStack>
  );
}
