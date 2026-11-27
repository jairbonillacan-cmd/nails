'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Banner } from '@astryxdesign/core/Banner';
import { Selector } from '@astryxdesign/core/Selector';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { CreditCard, SlidersHorizontal } from 'lucide-react';
import {
  CopyableField,
  SkeletonBlock,
  StatusTag,
  SurfaceCard,
  type StatusTagTone,
} from '@/components/ui';
import type {
  NotificationChannel,
  NotificationWorkflow,
  PaymentMode,
  SalonSettings,
  ScheduledNotification,
  Service,
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
  isDemoMode: boolean;
  mercadoPagoConfigured: boolean;
  twilioSmsConfigured: boolean;
  timezone: string;
  whatsappWebhookUrl: string;
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
  isDemoMode,
  mercadoPagoConfigured,
  twilioSmsConfigured,
  timezone,
  whatsappWebhookUrl,
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
}: PaymentsAnalyticsSectionProps) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [hasOpenedMore, setHasOpenedMore] = useState(false);
  const payBadge = paymentModeChip(settings.paymentMode);
  const paymentOptions: Array<{ value: PaymentMode; label: string }> = [
    {
      value: 'manual_transfer',
      label: 'Transferencia SPEI: te mandan su comprobante (sin comisión)',
    },
    ...(mercadoPagoConfigured || settings.paymentMode === 'mercadopago'
      ? [
          {
            value: 'mercadopago' as const,
            label: mercadoPagoConfigured
              ? 'Mercado Pago: tarjeta, transferencia u OXXO con confirmación automática'
              : 'Mercado Pago (faltan credenciales en producción)',
          },
        ]
      : []),
    ...(settings.paymentMode === 'stripe'
      ? [
          {
            value: 'stripe' as const,
            label: 'Stripe (no disponible aún — cambia a Transferencia o Mercado Pago)',
          },
        ]
      : []),
    {
      value: 'none',
      label: 'Sin anticipo: apartan sin pagar',
    },
  ];

  return (
    <VStack gap={5}>
      <SurfaceCard
        id="payments-heading"
        icon={<CreditCard size={18} aria-hidden="true" />}
        title="Cobro en línea"
        subtitle={`Cómo te pagan el anticipo de ${depositLabel}.`}
        badge={<StatusTag tone={payBadge.tone} label={payBadge.label} showDot />}
      >
        <VStack
          gap={4}
          className={savingSettings ? 'ad-card-body fx-busy' : 'ad-card-body'}
          aria-busy={savingSettings || undefined}
          paddingBlockStart={4}
        >
          <Selector
            label="Cómo apartan sus citas tus clientas"
            value={settings.paymentMode}
            isDisabled={savingSettings}
            onChange={(v) => {
              if (
                v === 'manual_transfer' ||
                v === 'mercadopago' ||
                v === 'stripe' ||
                v === 'none'
              ) {
                onSaveSettingsPatch({ paymentMode: v });
              }
            }}
            options={paymentOptions}
          />

          {settings.paymentMode === 'mercadopago' && !mercadoPagoConfigured ? (
            <Banner
              status="warning"
              role="status"
              title="Mercado Pago aún no tiene credenciales configuradas"
              description="Mientras se agregan los accesos de Mercado Pago, te recomendamos usar Transferencia SPEI para que tus clientas reciban tu CLABE y suban su comprobante."
            />
          ) : null}

          {settings.paymentMode === 'stripe' ? (
            <Banner
              status="warning"
              role="status"
              title="El cobro con Stripe aún no está activado"
              description="Cambia a Transferencia SPEI o Mercado Pago para cobrar anticipos sin interrupciones."
            />
          ) : null}

          <VStack className="ad-config-grid-equal" gap={3}>
            <VStack className="ad-subpanel" gap={2}>
              <HStack justify="between" align="center" wrap="wrap" gap={2}>
                <Text weight="semibold" size="sm">
                  Transferencia SPEI
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
                  Anuncios, visitas de Google, reseñas, mensajes SMS, envíos recientes y enlaces de soporte.
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
            isDemoMode={isDemoMode}
            twilioSmsConfigured={twilioSmsConfigured}
            timezone={timezone}
            whatsappWebhookUrl={whatsappWebhookUrl}
            googleCalendarTechUrl={googleCalendarTechUrl}
            mercadoPagoTechUrl={mercadoPagoTechUrl}
            services={services}
            workflows={workflows}
            notifications={notifications}
            savingSettings={savingSettings}
            onSaveSettingsPatch={onSaveSettingsPatch}
            onToggleSmsChannel={onToggleSmsChannel}
            onRefresh={onRefresh}
            onBanner={onBanner}
          />
        ) : null}
      </Collapsible>
    </VStack>
  );
}
