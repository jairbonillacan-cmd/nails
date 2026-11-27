'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { ArrowRight, MessageCircle } from 'lucide-react';
import { StatusTag, SurfaceCard } from '@/components/ui';
import type { WhatsAppInboxSummaryDTO } from '@/lib/contracts';
import type { RuntimeIntegrationStatus } from '@/lib/env';
import type { WhatsAppMonthlyUsageSummary } from '@/lib/types';

interface WhatsAppSectionProps {
  integration: RuntimeIntegrationStatus;
  whatsappUsage: WhatsAppMonthlyUsageSummary;
  activeRemindersCount: number;
  inboxSummary?: WhatsAppInboxSummaryDTO;
}

export function WhatsAppSection({
  integration,
  whatsappUsage,
  activeRemindersCount,
  inboxSummary,
}: WhatsAppSectionProps) {
  const remaining = Math.max(0, whatsappUsage.quotaLimit - whatsappUsage.sentCount);
  const unreadCount = inboxSummary?.unreadCount ?? 0;
  const failedRemindersCount = inboxSummary?.failedRemindersCount ?? 0;

  return (
    <SurfaceCard
      id="whatsapp-reminders-heading"
      icon={<MessageCircle size={18} aria-hidden="true" />}
      title="WhatsApp Business y recordatorios"
      subtitle="Administra conversaciones, avisos automáticos, plantillas de Meta y simulador desde el panel dedicado."
      badge={
        <StatusTag
          tone={
            integration.whatsappCloudConfigured
              ? 'success'
              : integration.mode === 'demo'
                ? 'info'
                : 'warning'
          }
          showDot
          label={
            integration.whatsappCloudConfigured
              ? 'Conectado'
              : integration.mode === 'demo'
                ? 'Modo prueba'
                : 'Por conectar'
          }
        />
      }
      actions={
        <HStack gap={2} wrap="wrap">
          <Button
            label="Conexión y plantillas"
            variant="secondary"
            size="sm"
            icon={<ArrowRight size={14} aria-hidden="true" />}
            href="/admin/whatsapp?tab=conexion"
          />
          <Button
            label="Abrir panel de WhatsApp"
            variant="primary"
            size="sm"
            icon={<MessageCircle size={14} aria-hidden="true" />}
            href="/admin/whatsapp"
          />
        </HStack>
      }
    >
      <VStack gap={4} className="ad-card-body" paddingBlockStart={4}>
        <Grid columns={{ minWidth: 150, max: 4 }} gap={2}>
          <VStack gap={1} className="ad-subpanel">
            <Text type="supporting" color="secondary">
              Avisos automáticos
            </Text>
            <HStack justify="start">
              <StatusTag
                tone={activeRemindersCount > 0 ? 'success' : 'neutral'}
                hasTabularNumbers
                label={`${activeRemindersCount} ${activeRemindersCount === 1 ? 'aviso activo' : 'avisos activos'}`}
              />
            </HStack>
          </VStack>

          <VStack gap={1} className="ad-subpanel">
            <Text type="supporting" color="secondary">
              Uso en tu celular
            </Text>
            <HStack justify="start">
              <StatusTag
                tone={integration.whatsappCoexistenceEnabled ? 'success' : 'neutral'}
                showDot={integration.whatsappCoexistenceEnabled}
                label={integration.whatsappCoexistenceEnabled ? 'Coexistence activo' : 'Sin activar'}
              />
            </HStack>
          </VStack>

          <VStack gap={1} className="ad-subpanel">
            <Text type="supporting" color="secondary">
              Bandeja de mensajes
            </Text>
            <HStack justify="start">
              <StatusTag
                tone={unreadCount > 0 ? 'accent' : 'neutral'}
                hasTabularNumbers
                label={
                  unreadCount > 0
                    ? `${unreadCount} sin leer`
                    : 'Al día'
                }
              />
            </HStack>
          </VStack>

          <VStack gap={1} className="ad-subpanel">
            <Text type="supporting" color="secondary">
              Estado de entregas
            </Text>
            <HStack justify="start">
              <StatusTag
                tone={failedRemindersCount > 0 ? 'danger' : 'success'}
                hasTabularNumbers
                label={
                  failedRemindersCount > 0
                    ? `${failedRemindersCount} fallido${failedRemindersCount === 1 ? '' : 's'}`
                    : 'Sin fallos'
                }
              />
            </HStack>
          </VStack>
        </Grid>

        <VStack gap={2} className="ad-subpanel">
          <HStack justify="between" align="center" wrap="wrap" gap={2}>
            <VStack gap={0.5} className="rb-grow">
              <Text weight="semibold" size="sm">
                Cuota mensual de mensajes automáticos
              </Text>
              <Text type="supporting" color="secondary" hasTabularNumbers>
                {whatsappUsage.sentCount} de {whatsappUsage.quotaLimit} mensajes usados este mes ·{' '}
                {remaining > 0
                  ? `quedan ${remaining} disponibles`
                  : 'límite mensual alcanzado'}
              </Text>
            </VStack>
            <StatusTag
              tone={
                whatsappUsage.alertLevel === 'limit_100'
                  ? 'danger'
                  : whatsappUsage.alertLevel === 'warning_80'
                    ? 'warning'
                    : 'success'
              }
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
        </VStack>
      </VStack>
    </SurfaceCard>
  );
}
