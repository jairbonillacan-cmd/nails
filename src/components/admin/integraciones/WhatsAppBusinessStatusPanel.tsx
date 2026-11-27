'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { CheckCircle2, CloudCog, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { CopyableField, StatusTag, type StatusTagTone } from '@/components/ui';
import type { RuntimeIntegrationStatus } from '@/lib/env';
import type { WhatsAppTemplateTriggerKey } from '@/lib/types';

export interface LiveMetaTemplateStatusRow {
  triggerKey: WhatsAppTemplateTriggerKey;
  templateName: string;
  metaId: string | null;
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED' | 'MISSING' | 'UNKNOWN';
  category: string | null;
  rejectedReason: string | null;
}

export interface LiveMetaConnectionSnapshot {
  ok: boolean;
  checkedAt: string;
  phone: {
    displayPhoneNumber: string | null;
    verifiedName: string | null;
    qualityRating: string | null;
    status: string | null;
  } | null;
  templates: LiveMetaTemplateStatusRow[];
  error: string | null;
}

interface WhatsAppBusinessStatusPanelProps {
  integration: RuntimeIntegrationStatus;
  salonPhone: string;
  webhookUrl: string;
  liveMeta: LiveMetaConnectionSnapshot | null;
  checkingLive: boolean;
  syncingTemplates: boolean;
  onCheckLiveConnection: () => Promise<void>;
  onSyncMetaTemplates: () => Promise<void>;
  onBanner: (msg: { status: 'success' | 'error'; text: string }) => void;
  onRefresh: () => Promise<void>;
}

function qualityTone(rating: string | null): StatusTagTone {
  const upper = (rating ?? '').toUpperCase();
  if (upper === 'GREEN') return 'success';
  if (upper === 'YELLOW') return 'warning';
  if (upper === 'RED') return 'danger';
  return 'neutral';
}

function qualityLabel(rating: string | null): string {
  const upper = (rating ?? '').toUpperCase();
  if (upper === 'GREEN') return 'Calidad alta';
  if (upper === 'YELLOW') return 'Calidad media';
  if (upper === 'RED') return 'Calidad baja';
  return 'Sin calificación';
}

export function WhatsAppBusinessStatusPanel({
  integration,
  salonPhone,
  webhookUrl,
  liveMeta,
  checkingLive,
  syncingTemplates,
  onCheckLiveConnection,
  onSyncMetaTemplates,
  onBanner,
  onRefresh,
}: WhatsAppBusinessStatusPanelProps) {
  const [testPhone, setTestPhone] = useState(salonPhone);
  const [sendingTest, setSendingTest] = useState(false);
  const [lastFallbackWaMe, setLastFallbackWaMe] = useState<string | null>(null);

  const handleSendTest = async () => {
    const cleanPhone = testPhone.trim();
    if (cleanPhone.replace(/\D/g, '').length < 10 || sendingTest) return;
    setSendingTest(true);
    setLastFallbackWaMe(null);
    try {
      const res = await fetch('/api/admin/integrations/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_test', toPhone: cleanPhone }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        deliveryMode?: string;
        fallbackWaMeUrl?: string;
        error?: string;
      } | null;
      if (!res.ok || !json?.ok) {
        if (json?.fallbackWaMeUrl) setLastFallbackWaMe(json.fallbackWaMeUrl);
        onBanner({
          status: 'error',
          text: json?.error || 'No se pudo enviar el mensaje de prueba por WhatsApp.',
        });
        return;
      }
      if (json.fallbackWaMeUrl) setLastFallbackWaMe(json.fallbackWaMeUrl);
      onBanner({
        status: 'success',
        text:
          json.deliveryMode === 'template'
            ? 'Mensaje de prueba enviado desde WhatsApp Business.'
            : 'Prueba lista en modo respaldo (aún falta conectar tus credenciales de Meta).',
      });
      await onRefresh();
    } catch {
      onBanner({
        status: 'error',
        text: 'Sin conexión. No se pudo enviar el mensaje de prueba.',
      });
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <VStack gap={3} className="ad-subpanel">
      <HStack justify="between" align="center" wrap="wrap" gap={2}>
        <HStack gap={2} align="center">
          <ShieldCheck size={16} aria-hidden="true" />
          <VStack gap={0}>
            <Text weight="semibold" size="sm">
              Estado de tu conexión de WhatsApp Business
            </Text>
            <Text type="supporting" color="secondary">
              {integration.whatsappCloudConfigured
                ? 'Tu número oficial está listo para enviar recordatorios automáticos.'
                : 'Mientras conectas tu cuenta oficial, tus avisos salen por correo y enlace directo de WhatsApp.'}
            </Text>
          </VStack>
        </HStack>
        <HStack gap={1.5} wrap="wrap">
          <Button
            type="button"
            label={checkingLive ? 'Comprobando…' : 'Comprobar conexión'}
            variant="secondary"
            size="sm"
            icon={<RefreshCw size={14} aria-hidden="true" />}
            isLoading={checkingLive}
            isDisabled={checkingLive || !integration.whatsappCloudConfigured}
            onClick={() => void onCheckLiveConnection()}
          />
          <Button
            type="button"
            label={syncingTemplates ? 'Sincronizando…' : 'Sincronizar plantillas'}
            variant="secondary"
            size="sm"
            icon={<CloudCog size={14} aria-hidden="true" />}
            isLoading={syncingTemplates}
            isDisabled={syncingTemplates || !integration.whatsappBusinessAccountConfigured}
            onClick={() => void onSyncMetaTemplates()}
          />
        </HStack>
      </HStack>

      <Grid columns={{ minWidth: 165, max: 4 }} gap={2}>
        <VStack gap={1}>
          <Text type="supporting" color="secondary">
            Envío automático por WhatsApp
          </Text>
          <HStack justify="start">
            <StatusTag
              tone={integration.whatsappCloudConfigured ? 'success' : 'warning'}
              showDot
              label={integration.whatsappCloudConfigured ? 'Conectado' : 'Por conectar'}
            />
          </HStack>
        </VStack>
        <VStack gap={1}>
          <Text type="supporting" color="secondary">
            Uso en tu mismo celular
          </Text>
          <HStack justify="start">
            <StatusTag
              tone={integration.whatsappCoexistenceEnabled ? 'success' : 'neutral'}
              showDot={integration.whatsappCoexistenceEnabled}
              label={integration.whatsappCoexistenceEnabled ? 'Activo' : 'Sin activar'}
            />
          </HStack>
        </VStack>
        <VStack gap={1}>
          <Text type="supporting" color="secondary">
            Recepción de confirmaciones
          </Text>
          <HStack justify="start">
            <StatusTag
              tone={integration.whatsappWebhookConfigured ? 'success' : 'neutral'}
              showDot={integration.whatsappWebhookConfigured}
              label={integration.whatsappWebhookConfigured ? 'Listo' : 'Pendiente'}
            />
          </HStack>
        </VStack>
        <VStack gap={1}>
          <Text type="supporting" color="secondary">
            Respaldo por correo
          </Text>
          <HStack justify="start">
            <StatusTag
              tone={integration.resendConfigured ? 'success' : 'neutral'}
              showDot={integration.resendConfigured}
              label={integration.resendConfigured ? 'Activo' : 'Sin configurar'}
            />
          </HStack>
        </VStack>
      </Grid>

      {liveMeta?.phone ? (
        <HStack gap={2} align="center" wrap="wrap">
          <CheckCircle2 size={15} aria-hidden="true" />
          <Text size="sm" weight="medium" hasTabularNumbers>
            {liveMeta.phone.verifiedName || 'Número verificado'} ·{' '}
            {liveMeta.phone.displayPhoneNumber || 'Conectado'}
          </Text>
          <StatusTag
            tone={qualityTone(liveMeta.phone.qualityRating)}
            label={qualityLabel(liveMeta.phone.qualityRating)}
          />
        </HStack>
      ) : null}

      {liveMeta?.error ? (
        <Banner
          status="warning"
          role="status"
          title="No se pudo leer el estado en vivo de Meta"
          description={liveMeta.error}
        />
      ) : null}

      <Collapsible
        className="ad-disclosure"
        defaultIsOpen={false}
        trigger={
          <HStack justify="between" align="center" gap={2} width="100%" wrap="wrap">
            <Text weight="semibold" size="sm">
              {integration.whatsappCloudConfigured
                ? 'Probar envío y enlace de conexión'
                : 'Cómo conectar tu número de WhatsApp Business'}
            </Text>
            <Text type="supporting" color="secondary">
              {integration.whatsappCloudConfigured
                ? 'Envío de prueba'
                : 'Conserva tu app en el celular'}
            </Text>
          </HStack>
        }
      >
        <VStack gap={3} paddingBlockStart={3}>
          {!integration.whatsappCloudConfigured ? (
            <Text type="supporting" color="secondary">
              Conecta tu número de WhatsApp Business para que los recordatorios salgan solos. Sigues
              usando la app en tu celular como siempre. Pásale el enlace de abajo a la persona que
              configure tu cuenta de Meta; ella sabrá qué activar (messages, statuses y
              smb_message_echoes).
            </Text>
          ) : null}

          <CopyableField
            label="Enlace para quien configure Meta"
            value={webhookUrl}
            copyLabel="Copiar enlace"
            copiedLabel="Enlace copiado"
            feedbackMessage="Enlace de conexión de WhatsApp copiado."
            monospace
          />

          <HStack gap={2} align="end" wrap="wrap">
            <VStack className="rb-grow" width="min(16rem, 100%)">
              <TextInput
                label="Enviar prueba a este WhatsApp"
                placeholder="+52 222 000 0000"
                value={testPhone}
                onChange={setTestPhone}
              />
            </VStack>
            <Button
              type="button"
              label={sendingTest ? 'Enviando…' : 'Enviar prueba'}
              variant="primary"
              size="sm"
              icon={<Send size={14} aria-hidden="true" />}
              isLoading={sendingTest}
              isDisabled={sendingTest || testPhone.replace(/\D/g, '').length < 10}
              onClick={() => void handleSendTest()}
            />
            {lastFallbackWaMe ? (
              <Button
                label="Abrir en WhatsApp"
                variant="secondary"
                size="sm"
                href={lastFallbackWaMe}
                target="_blank"
                rel="noopener noreferrer"
              />
            ) : null}
          </HStack>
        </VStack>
      </Collapsible>
    </VStack>
  );
}
