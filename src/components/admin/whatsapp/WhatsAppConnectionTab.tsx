'use client';

import { useState } from 'react';
import type { z } from 'zod';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Switch } from '@astryxdesign/core/Switch';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Token } from '@astryxdesign/core/Token';
import {
  CheckCircle2,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import {
  CopyableField,
  EmptyStateCard,
  SkeletonBlock,
  StatusTag,
  SurfaceCard,
  type StatusTagTone,
} from '@/components/ui';
import type {
  WhatsAppSettingsActionSchema,
  WhatsAppSettingsResponseDTO,
  WhatsAppSimulateEventSchema,
  WhatsAppSimulateResponseDTO,
} from '@/lib/contracts';
import { formatTimeInTimezone } from '@/lib/format';
import { canonicalizeWhatsAppPhoneE164 } from '@/lib/notifications/whatsapp-inbox';
import type { AdminRole } from '@/lib/types';
import { WhatsAppSimulatorCard } from './WhatsAppSimulatorCard';
import { WhatsAppTemplatesTable } from './WhatsAppTemplatesTable';

type WhatsAppSettingsActionInput = z.infer<typeof WhatsAppSettingsActionSchema>;
type WhatsAppSimulateEventInput = z.infer<typeof WhatsAppSimulateEventSchema>;

export interface WhatsAppConnectionTabProps {
  data: WhatsAppSettingsResponseDTO | null;
  isLoading: boolean;
  isSubmitting: boolean;
  isCheckingLive: boolean;
  isSimulating: boolean;
  simulationResult: WhatsAppSimulateResponseDTO | null;
  role: AdminRole;
  onRefresh: () => void;
  onRefreshLive: () => void;
  onRunSettingsAction: (action: WhatsAppSettingsActionInput) => Promise<boolean>;
  onRunSimulation: (input: WhatsAppSimulateEventInput) => Promise<boolean>;
  onOpenChat: (phoneE164: string) => void;
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

export function WhatsAppConnectionTab({
  data,
  isLoading,
  isSubmitting,
  isCheckingLive,
  isSimulating,
  simulationResult,
  role,
  onRefresh,
  onRefreshLive,
  onRunSettingsAction,
  onRunSimulation,
  onOpenChat,
}: WhatsAppConnectionTabProps) {
  const [testPhoneDraft, setTestPhoneDraft] = useState<string | null>(null);
  const [quotaDraft, setQuotaDraft] = useState<number | null>(null);
  const [sendingTest, setSendingTest] = useState(false);
  const [savingQuota, setSavingQuota] = useState(false);
  const [testFeedback, setTestFeedback] = useState<{
    status: 'success' | 'error';
    text: string;
  } | null>(null);

  if (isLoading && !data) {
    return (
      <VStack gap={4} role="status" aria-live="polite" aria-busy="true" aria-label="Cargando conexión de WhatsApp">
        <SkeletonBlock width="100%" height="14rem" radius={3} index={0} />
        <SkeletonBlock width="100%" height="16rem" radius={3} index={1} />
        <SkeletonBlock width="100%" height="12rem" radius={3} index={2} />
      </VStack>
    );
  }

  if (!data) {
    return (
      <EmptyStateCard
        isCompact
        title="No pudimos cargar el estado de WhatsApp"
        description="Intenta recargar la configuración de conexión y plantillas de Meta."
        actions={
          <Button
            type="button"
            label="Reintentar"
            variant="primary"
            size="sm"
            icon={<RefreshCw size={14} aria-hidden="true" />}
            onClick={onRefresh}
          />
        }
      />
    );
  }

  const isOwner = role === 'owner';
  const { readiness, settings, usage, liveMeta } = data;
  const remaining = Math.max(0, usage.quotaLimit - usage.sentCount);
  const activeTestPhone = testPhoneDraft ?? settings.whatsappNumber ?? '';
  const activeQuota = quotaDraft ?? settings.whatsappMonthlyQuota;
  const isQuotaDirty = activeQuota !== settings.whatsappMonthlyQuota;
  const timezone = settings.timezone || 'America/Mexico_City';

  const handleToggleBooking = (enabled: boolean) => {
    if (!isOwner || isSubmitting) return;
    void onRunSettingsAction({
      action: 'update_settings',
      patch: { whatsappBookingEnabled: enabled },
    });
  };

  const handleSaveQuota = async () => {
    if (!isOwner || savingQuota || isSubmitting) return;
    const clamped = Math.max(50, Math.min(50_000, Math.round(activeQuota)));
    setSavingQuota(true);
    try {
      const ok = await onRunSettingsAction({
        action: 'update_settings',
        patch: { whatsappMonthlyQuota: clamped },
      });
      if (ok) {
        setQuotaDraft(null);
      }
    } finally {
      setSavingQuota(false);
    }
  };

  const handleSendLiveTest = async () => {
    if (sendingTest || isSubmitting) return;
    const canonical = canonicalizeWhatsAppPhoneE164(activeTestPhone);
    if (!canonical) {
      setTestFeedback({
        status: 'error',
        text: 'Escribe un número de WhatsApp válido de 10 dígitos.',
      });
      return;
    }
    setSendingTest(true);
    setTestFeedback(null);
    try {
      const ok = await onRunSettingsAction({
        action: 'send_test',
        toPhone: canonical,
      });
      setTestFeedback(
        ok
          ? {
              status: 'success',
              text: readiness.cloudReady
                ? 'Mensaje de prueba enviado desde WhatsApp Business.'
                : 'Prueba registrada en modo respaldo/demo.',
            }
          : {
              status: 'error',
              text: 'No se pudo enviar el mensaje de prueba. Revisa tu conexión o credenciales.',
            },
      );
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <VStack gap={4} className="fx-step-in" style={{ minWidth: 0 }}>
      <SurfaceCard
        id="wa-connection-status-heading"
        icon={<ShieldCheck size={17} aria-hidden="true" />}
        title="Conexión con WhatsApp Business (Meta)"
        subtitle={
          readiness.cloudReady
            ? 'Tu número oficial está listo para enviar recordatorios automáticos y responder mensajes.'
            : data.mode === 'demo'
              ? 'Operando en modo demo: prueba conversaciones, plantillas y simulaciones sin afectar clientas reales.'
              : 'Mientras conectas tu cuenta oficial de Meta, los avisos salen por correo y enlace directo wa.me.'
        }
        badge={
          <StatusTag
            tone={readiness.cloudReady ? 'success' : data.mode === 'demo' ? 'info' : 'warning'}
            showDot
            label={
              readiness.cloudReady
                ? 'Cloud API conectado'
                : data.mode === 'demo'
                  ? 'Modo demo'
                  : 'Pendiente de conectar'
            }
          />
        }
        actions={
          <HStack gap={2} align="center" wrap="wrap">
            <Switch
              label="Recibir citas por WhatsApp"
              size="sm"
              value={settings.whatsappBookingEnabled}
              isDisabled={!isOwner || isSubmitting}
              onChange={handleToggleBooking}
            />
            <Button
              type="button"
              label={isCheckingLive ? 'Verificando…' : 'Verificar en vivo'}
              variant="secondary"
              size="sm"
              icon={<RefreshCw size={14} aria-hidden="true" />}
              isLoading={isCheckingLive}
              isDisabled={isCheckingLive || isSubmitting}
              onClick={onRefreshLive}
            />
          </HStack>
        }
      >
        <VStack gap={4} className="ad-card-body" paddingBlockStart={4}>
          <Grid columns={{ minWidth: 165, max: 4 }} gap={2}>
            <VStack gap={1} className="ad-subpanel">
              <Text type="supporting" color="secondary">
                WhatsApp Cloud API
              </Text>
              <HStack justify="start">
                <StatusTag
                  tone={readiness.cloudReady ? 'success' : 'warning'}
                  showDot
                  label={readiness.cloudReady ? 'Conectado' : 'Por conectar'}
                />
              </HStack>
            </VStack>

            <VStack gap={1} className="ad-subpanel">
              <Text type="supporting" color="secondary">
                Coexistence (celular)
              </Text>
              <HStack justify="start">
                <StatusTag
                  tone={readiness.coexistenceEnabled ? 'success' : 'neutral'}
                  showDot={readiness.coexistenceEnabled}
                  label={readiness.coexistenceEnabled ? 'Activo' : 'Sin activar'}
                />
              </HStack>
            </VStack>

            <VStack gap={1} className="ad-subpanel">
              <Text type="supporting" color="secondary">
                Webhook de Meta
              </Text>
              <HStack justify="start">
                <StatusTag
                  tone={readiness.webhookReady ? 'success' : 'neutral'}
                  showDot={readiness.webhookReady}
                  label={readiness.webhookReady ? 'Verificado' : 'Pendiente'}
                />
              </HStack>
            </VStack>

            <VStack gap={1} className="ad-subpanel">
              <Text type="supporting" color="secondary">
                Respaldo por correo
              </Text>
              <HStack justify="start">
                <StatusTag tone="success" showDot label="Resend + wa.me" />
              </HStack>
            </VStack>
          </Grid>

          {liveMeta?.phone ? (
            <HStack className="ad-subpanel" gap={2} align="center" justify="between" wrap="wrap">
              <HStack gap={2} align="center" wrap="wrap">
                <CheckCircle2 size={16} aria-hidden="true" />
                <Text size="sm" weight="semibold" hasTabularNumbers>
                  {liveMeta.phone.verifiedName || settings.salonName} ·{' '}
                  {liveMeta.phone.displayPhoneNumber || settings.whatsappNumber}
                </Text>
                <StatusTag
                  tone={qualityTone(liveMeta.phone.qualityRating)}
                  label={qualityLabel(liveMeta.phone.qualityRating)}
                />
                {liveMeta.phone.status ? (
                  <Token size="sm" label={liveMeta.phone.status} />
                ) : null}
              </HStack>
              <Text type="supporting" color="secondary" size="sm" hasTabularNumbers>
                Comprobado a las {formatTimeInTimezone(liveMeta.checkedAt, timezone)}
              </Text>
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

          <VStack gap={3} className="ad-subpanel">
            <HStack justify="between" align="center" wrap="wrap" gap={2}>
              <VStack gap={0.5} style={{ minWidth: 0, flex: '1 1 16rem' }}>
                <Text weight="semibold" size="sm">
                  Cuota mensual de mensajes automáticos ({usage.monthKey})
                </Text>
                <Text type="supporting" color="secondary" hasTabularNumbers>
                  {usage.sentCount} de {usage.quotaLimit} mensajes usados este mes ·{' '}
                  {remaining > 0
                    ? `te quedan ${remaining} disponibles`
                    : 'límite mensual alcanzado'}
                </Text>
              </VStack>
              <StatusTag
                tone={
                  usage.alertLevel === 'limit_100'
                    ? 'danger'
                    : usage.alertLevel === 'warning_80'
                      ? 'warning'
                      : 'success'
                }
                label={
                  usage.alertLevel === 'limit_100'
                    ? 'Límite alcanzado'
                    : `${usage.percentUsed}% usado`
                }
                hasTabularNumbers
              />
            </HStack>

            <ProgressBar
              label="Mensajes de WhatsApp usados este mes"
              isLabelHidden
              value={usage.sentCount}
              max={usage.quotaLimit}
              variant={
                usage.alertLevel === 'limit_100'
                  ? 'error'
                  : usage.alertLevel === 'warning_80'
                    ? 'warning'
                    : 'accent'
              }
            />

            {usage.alertLevel === 'warning_80' ? (
              <Banner
                status="warning"
                role="status"
                title={`Ya usaste el ${usage.percentUsed}% de tu límite mensual de WhatsApp`}
                description={`Te quedan ${remaining} mensajes automáticos. Al llegar a ${usage.quotaLimit}, los avisos continuarán automáticamente por correo y enlace wa.me.`}
              />
            ) : null}

            {usage.alertLevel === 'limit_100' ? (
              <Banner
                status="error"
                role="alert"
                title={`Alcanzaste los ${usage.quotaLimit} mensajes automáticos de este mes`}
                description="Para evitar cobros inesperados, los avisos siguen saliendo por correo electrónico y puedes abrir wa.me directo desde cada conversación."
              />
            ) : null}

            {isOwner ? (
              <HStack gap={2} align="end" wrap="wrap">
                <VStack style={{ width: 'min(13rem, 100%)' }}>
                  <NumberInput
                    label="Tope mensual de mensajes"
                    value={activeQuota}
                    min={50}
                    max={50_000}
                    isIntegerOnly
                    isDisabled={savingQuota || isSubmitting}
                    onChange={(val) => setQuotaDraft(val || 500)}
                  />
                </VStack>
                <Button
                  type="button"
                  label={savingQuota ? 'Guardando…' : 'Guardar límite'}
                  variant="secondary"
                  size="sm"
                  icon={<Save size={14} aria-hidden="true" />}
                  isLoading={savingQuota}
                  isDisabled={!isQuotaDirty || savingQuota || isSubmitting}
                  onClick={() => void handleSaveQuota()}
                />
              </HStack>
            ) : null}
          </VStack>

          <VStack gap={3} className="ad-subpanel">
            <CopyableField
              label="URL del webhook para configurar en Meta"
              value={readiness.webhookUrl}
              copyLabel="Copiar URL"
              copiedLabel="URL copiada"
              feedbackMessage="URL de webhook de WhatsApp copiada."
              monospace
            />

            <HStack gap={1.5} align="center" wrap="wrap">
              <Text type="supporting" color="secondary" size="sm">
                Campos requeridos en Meta ({readiness.graphApiVersion}):
              </Text>
              {readiness.requiredWebhookFields.map((field) => (
                <Token key={field} size="sm" label={field} />
              ))}
            </HStack>

            <HStack gap={2} align="end" wrap="wrap">
              <VStack style={{ flex: '1 1 16rem', minWidth: 0 }}>
                <TextInput
                  label="Enviar mensaje de prueba rápida"
                  placeholder="+52 222 000 0000"
                  value={activeTestPhone}
                  onChange={setTestPhoneDraft}
                  isDisabled={sendingTest || isSubmitting}
                />
              </VStack>
              <Button
                type="button"
                label={sendingTest ? 'Enviando…' : 'Enviar prueba'}
                variant="primary"
                size="sm"
                icon={<Send size={14} aria-hidden="true" />}
                isLoading={sendingTest}
                isDisabled={
                  sendingTest ||
                  isSubmitting ||
                  activeTestPhone.replace(/\D/g, '').length < 8
                }
                onClick={() => void handleSendLiveTest()}
              />
            </HStack>

            {testFeedback ? (
              <Banner
                status={testFeedback.status}
                role={testFeedback.status === 'error' ? 'alert' : 'status'}
                title={testFeedback.text}
                isDismissable
                onDismiss={() => setTestFeedback(null)}
              />
            ) : null}

            {readiness.missingVars.length > 0 ? (
              <Collapsible
                className="ad-disclosure"
                defaultIsOpen={false}
                trigger={
                  <HStack gap={2} align="center">
                    <Wrench size={14} aria-hidden="true" />
                    <Text weight="semibold" size="sm">
                      Variables técnicas pendientes ({readiness.missingVars.length})
                    </Text>
                  </HStack>
                }
              >
                <VStack gap={2} paddingBlockStart={2}>
                  <Text type="supporting" color="secondary" size="sm">
                    Comparte esta lista con quien despliegue el servidor para habilitar el envío directo con Meta Cloud API:
                  </Text>
                  <HStack gap={1.5} wrap="wrap">
                    {readiness.missingVars.map((envVar) => (
                      <Token key={envVar} size="sm" label={envVar} />
                    ))}
                  </HStack>
                </VStack>
              </Collapsible>
            ) : null}
          </VStack>
        </VStack>
      </SurfaceCard>

      <WhatsAppTemplatesTable
        templates={data.templates}
        catalog={data.templateCatalog}
        liveTemplates={liveMeta?.templates ?? []}
        cloudReady={readiness.cloudReady}
        managementReady={readiness.managementReady}
        role={role}
        isSubmitting={isSubmitting}
        onRunSettingsAction={onRunSettingsAction}
      />

      <WhatsAppSimulatorCard
        simulatorAllowed={data.simulatorAllowed && (data.mode !== 'supabase' || isOwner)}
        mode={data.mode}
        isSimulating={isSimulating}
        simulationResult={simulationResult}
        onRunSimulation={onRunSimulation}
        onOpenChat={onOpenChat}
      />
    </VStack>
  );
}
