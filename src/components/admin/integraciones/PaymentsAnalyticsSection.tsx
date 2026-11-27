'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { ArrowRight, CreditCard, SlidersHorizontal } from 'lucide-react';
import {
  CopyableField,
  SkeletonBlock,
  StatusTag,
  SurfaceCard,
  type StatusTagTone,
} from '@/components/ui';
import { ajustesHref } from '@/lib/admin-links';
import type {
  NotificationChannel,
  NotificationWorkflow,
  PaymentMode,
  SalonSettings,
  ScheduledNotification,
} from '@/lib/types';

const TechnicalSettingsSection = dynamic(
  () =>
    import('@/components/admin/integraciones/TechnicalSettingsSection').then(
      (mod) => mod.TechnicalSettingsSection,
    ),
  {
    ssr: false,
    loading: () => <SkeletonBlock width="100%" height="18rem" radius={3} />,
  },
);

interface PaymentsAnalyticsSectionProps {
  settings: SalonSettings;
  depositLabel: string;
  canAccessSettings: boolean;
  initialOpenMore?: boolean;
  mercadoPagoConfigured: boolean;
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

function paymentModeChip(mode: PaymentMode): {
  label: string;
  tone: StatusTagTone;
} {
  if (mode === 'manual_transfer') return { label: 'Transferencia', tone: 'success' };
  if (mode === 'mercadopago') return { label: 'Mercado Pago', tone: 'accent' };
  if (mode === 'stripe') return { label: 'Tarjeta en línea', tone: 'accent' };
  return { label: 'Sin anticipo', tone: 'neutral' };
}

export function PaymentsAnalyticsSection({
  settings,
  depositLabel,
  canAccessSettings,
  initialOpenMore = false,
  mercadoPagoConfigured,
  twilioSmsConfigured,
  timezone,
  googleCalendarTechUrl,
  mercadoPagoTechUrl,
  workflows,
  notifications,
  savingSettings,
  onSaveSettingsPatch,
  onToggleSmsChannel,
}: PaymentsAnalyticsSectionProps) {
  const [isMoreOpen, setIsMoreOpen] = useState(initialOpenMore);
  const [hasOpenedMore, setHasOpenedMore] = useState(initialOpenMore);
  const payBadge = paymentModeChip(settings.paymentMode);

  return (
    <VStack gap={5}>
      <SurfaceCard
        id="payments-heading"
        icon={<CreditCard size={18} aria-hidden="true" />}
        title="Cobro en línea"
        subtitle={`Estado actual del anticipo de ${depositLabel}. El método y los datos bancarios se configuran en Ajustes del salón.`}
        badge={<StatusTag tone={payBadge.tone} label={payBadge.label} showDot />}
        actions={
          canAccessSettings ? (
            <Button
              label="Configurar en Ajustes"
              variant="secondary"
              size="sm"
              icon={<ArrowRight size={14} aria-hidden="true" />}
              href={ajustesHref({ tab: 'cobro' })}
            />
          ) : undefined
        }
      >
        <VStack gap={4} className="ad-card-body" paddingBlockStart={4}>
          {settings.paymentMode === 'mercadopago' && !mercadoPagoConfigured ? (
            <Banner
              status="warning"
              role="status"
              title="Mercado Pago aún no tiene credenciales configuradas"
              description="Mientras se agregan los accesos de Mercado Pago, cambia a Transferencia en Ajustes del salón para que tus clientas reciban tu CLABE y suban su comprobante."
            />
          ) : null}

          {settings.paymentMode === 'stripe' ? (
            <Banner
              status="warning"
              role="status"
              title="El cobro con Stripe aún no está activado"
              description="Cambia a Transferencia o Mercado Pago desde Ajustes del salón para cobrar anticipos sin interrupciones."
            />
          ) : null}

          <VStack className="ad-config-grid-equal" gap={3}>
            <VStack className="ad-subpanel" gap={2}>
              <HStack justify="between" align="center" wrap="wrap" gap={2}>
                <Text weight="semibold" size="sm">
                  Transferencia
                </Text>
                <StatusTag tone="success" label="$0 comisión" />
              </HStack>
              <Text type="supporting" color="secondary">
                Tu clienta copia tu CLABE ({settings.depositBankName}), transfiere {depositLabel} y sube su comprobante o te lo manda por Instagram ({settings.instagramHandle}).
              </Text>
              <CopyableField
                label="CLABE actual"
                value={settings.depositClabe}
                copyLabel="Copiar CLABE"
                copiedLabel="Copiada"
                monospace
              />
            </VStack>

            <VStack className="ad-subpanel" gap={1.5}>
              <HStack justify="between" align="center" wrap="wrap" gap={2}>
                <Text weight="semibold" size="sm">
                  Mercado Pago automático
                </Text>
                <StatusTag
                  tone={mercadoPagoConfigured ? 'success' : 'neutral'}
                  showDot={mercadoPagoConfigured}
                  label={mercadoPagoConfigured ? 'Conectado' : 'Por activar'}
                />
              </HStack>
              <Text type="supporting" color="secondary">
                Envía un enlace de pago con tarjeta, transferencia u OXXO y confirma la cita sola en cuanto se acredite el pago.
              </Text>
            </VStack>
          </VStack>
        </VStack>
      </SurfaceCard>

      <Collapsible
        className="ad-disclosure"
        isOpen={isMoreOpen}
        onOpenChange={(next) => {
          setIsMoreOpen(next);
          if (next) setHasOpenedMore(true);
        }}
        trigger={
          <HStack justify="between" align="center" gap={2} width="100%" wrap="wrap">
            <HStack gap={2} align="center">
              <SlidersHorizontal size={15} aria-hidden="true" />
              <VStack gap={0}>
                <Text weight="semibold" size="base">
                  Más herramientas
                </Text>
                <Text type="supporting" color="secondary">
                  Anuncios, visitas de Google, reseñas, mensajes SMS, envíos por correo/SMS y enlaces de soporte.
                </Text>
              </VStack>
            </HStack>
            <StatusTag label="Opcional" tone="neutral" />
          </HStack>
        }
      >
        {hasOpenedMore ? (
          <TechnicalSettingsSection
            settings={settings}
            twilioSmsConfigured={twilioSmsConfigured}
            timezone={timezone}
            googleCalendarTechUrl={googleCalendarTechUrl}
            mercadoPagoTechUrl={mercadoPagoTechUrl}
            workflows={workflows}
            notifications={notifications}
            savingSettings={savingSettings}
            onSaveSettingsPatch={onSaveSettingsPatch}
            onToggleSmsChannel={onToggleSmsChannel}
          />
        ) : null}
      </Collapsible>
    </VStack>
  );
}
