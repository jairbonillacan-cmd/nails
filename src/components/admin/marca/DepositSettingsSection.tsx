'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Switch } from '@astryxdesign/core/Switch';
import { Wallet } from 'lucide-react';
import { StatusTag, SurfaceCard } from '@/components/ui';
import type { SalonSettings } from '@/lib/types';

interface DepositSettingsSectionProps {
  draft: SalonSettings;
  isDepositEnabled: boolean;
  depositAmountCents: number;
  depositBeneficiary: string;
  onUpdateDraft: (patch: Partial<SalonSettings>) => void;
}

export function DepositSettingsSection({
  draft,
  isDepositEnabled,
  depositAmountCents,
  depositBeneficiary,
  onUpdateDraft,
}: DepositSettingsSectionProps) {
  return (
    <SurfaceCard
      id="brand-spei-heading"
      icon={<Wallet size={16} aria-hidden="true" />}
      title="Anticipo por transferencia (SPEI)"
      subtitle="Datos bancarios que ven tus clientas para apartar su cita."
      badge={
        <StatusTag
          tone={isDepositEnabled ? 'success' : 'neutral'}
          label={isDepositEnabled ? 'Activo' : 'Sin anticipo'}
          showDot
        />
      }
      actions={
        <Switch
          label="Pedir anticipo SPEI"
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
