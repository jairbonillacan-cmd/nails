'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Banner } from '@astryxdesign/core/Banner';
import { Selector } from '@astryxdesign/core/Selector';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Switch } from '@astryxdesign/core/Switch';
import { Wallet } from 'lucide-react';
import { StatusTag, SurfaceCard } from '@/components/ui';
import type { PaymentMode, SalonSettings } from '@/lib/types';

interface DepositSettingsSectionProps {
  draft: SalonSettings;
  isDepositEnabled: boolean;
  depositAmountCents: number;
  depositBeneficiary: string;
  mercadoPagoConfigured?: boolean;
  highlighted?: boolean;
  onUpdateDraft: (patch: Partial<SalonSettings>) => void;
}

export function DepositSettingsSection({
  draft,
  isDepositEnabled,
  depositAmountCents,
  depositBeneficiary,
  mercadoPagoConfigured = false,
  highlighted = false,
  onUpdateDraft,
}: DepositSettingsSectionProps) {
  const paymentOptions: Array<{ value: PaymentMode; label: string }> = [
    {
      value: 'manual_transfer',
      label: 'Transferencia: te mandan su comprobante ($0 comisión)',
    },
    ...(mercadoPagoConfigured || draft.paymentMode === 'mercadopago'
      ? [
          {
            value: 'mercadopago' as const,
            label: mercadoPagoConfigured
              ? 'Mercado Pago: tarjeta, transferencia u OXXO con confirmación automática'
              : 'Mercado Pago (faltan credenciales en producción)',
          },
        ]
      : []),
    ...(draft.paymentMode === 'stripe'
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

  const modeBadgeLabel =
    draft.paymentMode === 'mercadopago'
      ? 'Mercado Pago'
      : draft.paymentMode === 'stripe'
        ? 'Tarjeta en línea'
        : draft.paymentMode === 'manual_transfer'
          ? 'Transferencia'
          : 'Sin anticipo';

  return (
    <SurfaceCard
      id="brand-spei-heading"
      className={highlighted ? 'ad-row-highlight' : undefined}
      icon={<Wallet size={16} aria-hidden="true" />}
      title="Cobro y anticipo"
      subtitle="Método de cobro y datos bancarios que ven tus clientas para apartar su cita."
      badge={
        <StatusTag
          tone={isDepositEnabled ? 'success' : 'neutral'}
          label={modeBadgeLabel}
          showDot
        />
      }
      actions={
        <Switch
          label="Pedir anticipo"
          isLabelHidden
          value={isDepositEnabled}
          onChange={(enabled) =>
            onUpdateDraft({
              paymentMode: enabled ? 'manual_transfer' : 'none',
            })
          }
        />
      }
    >
      <VStack gap={3} className="ad-card-body" paddingBlockStart={4}>
        <Selector
          label="Cómo apartan sus citas tus clientas"
          value={draft.paymentMode}
          onChange={(v) => {
            if (
              v === 'manual_transfer' ||
              v === 'mercadopago' ||
              v === 'stripe' ||
              v === 'none'
            ) {
              onUpdateDraft({ paymentMode: v });
            }
          }}
          options={paymentOptions}
        />

        {draft.paymentMode === 'mercadopago' && !mercadoPagoConfigured ? (
          <Banner
            status="warning"
            role="status"
            title="Mercado Pago aún no tiene credenciales configuradas"
            description="Mientras se agregan los accesos de Mercado Pago, te recomendamos usar Transferencia para que tus clientas reciban tu CLABE y suban su comprobante."
          />
        ) : null}

        {draft.paymentMode === 'stripe' ? (
          <Banner
            status="warning"
            role="status"
            title="El cobro con Stripe aún no está activado"
            description="Cambia a Transferencia o Mercado Pago para cobrar anticipos sin interrupciones."
          />
        ) : null}

        {isDepositEnabled ? (
          <VStack gap={3}>
            <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
              <NumberInput
                label="Monto de anticipo (MXN)"
                value={Math.round(depositAmountCents / 100)}
                min={0}
                onChange={(v) =>
                  onUpdateDraft({
                    depositAmountCents: Math.max(0, Math.round(v * 100)),
                  })
                }
              />
              <TextInput
                label="Banco"
                placeholder="Mercado Pago"
                value={draft.depositBankName}
                onChange={(v) => onUpdateDraft({ depositBankName: v })}
              />
            </Grid>
            <TextInput
              label="Titular de la cuenta"
              placeholder="Karla Patricia Carrillo Rodríguez"
              value={depositBeneficiary}
              onChange={(v) =>
                onUpdateDraft({ depositBeneficiary: v, depositAccountHolder: v })
              }
            />
            <TextInput
              label="Cuenta CLABE"
              placeholder="7229 6901 3959 779869"
              value={draft.depositClabe}
              onChange={(v) => onUpdateDraft({ depositClabe: v })}
            />
            <TextArea
              label="Indicaciones para enviar el comprobante"
              description="Se muestra directamente en la sección de anticipo de la página de cita de tu clienta (/cita)."
              value={draft.depositInstructions}
              onChange={(v) => onUpdateDraft({ depositInstructions: v })}
              rows={2}
            />
          </VStack>
        ) : (
          <Text type="supporting" color="secondary">
            Sin anticipo: tus clientas agendan directo sin subir comprobante.
          </Text>
        )}
      </VStack>
    </SurfaceCard>
  );
}
