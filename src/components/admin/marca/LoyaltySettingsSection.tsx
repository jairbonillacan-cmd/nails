'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { Award } from 'lucide-react';
import { StatusTag, SurfaceCard } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import type { LoyaltyProgram, Service } from '@/lib/types';

interface LoyaltySettingsSectionProps {
  loyaltyDraft: LoyaltyProgram;
  activeServices: Service[];
  currency: 'MXN' | 'USD';
  onUpdateLoyaltyDraft: (patch: Partial<LoyaltyProgram>) => void;
}

export function LoyaltySettingsSection({
  loyaltyDraft,
  activeServices,
  currency,
  onUpdateLoyaltyDraft,
}: LoyaltySettingsSectionProps) {
  return (
    <SurfaceCard
      id="brand-loyalty-heading"
      icon={<Award size={16} aria-hidden="true" />}
      title="Tarjeta de sellos"
      subtitle="Suma 1 sello al cobrar cada cita; tus clientas la ven en su celular sin bajar ninguna app."
      badge={
        <StatusTag
          tone={loyaltyDraft.isActive ? 'accent' : 'neutral'}
          label={loyaltyDraft.isActive ? `${loyaltyDraft.stampsRequired} sellos` : 'Pausada'}
          hasTabularNumbers
        />
      }
      actions={
        <Switch
          label="Activar tarjeta de sellos"
          isLabelHidden
          value={loyaltyDraft.isActive}
          onChange={(v) => onUpdateLoyaltyDraft({ isActive: v })}
        />
      }
    >
      {loyaltyDraft.isActive ? (
        <VStack gap={3} className="ad-card-body" paddingBlockStart={4}>
          <TextInput
            label="Nombre de la tarjeta"
            value={loyaltyDraft.name}
            onChange={(v) => onUpdateLoyaltyDraft({ name: v })}
            placeholder="Tarjeta de Sellos LAIKONA"
          />
          <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
            <NumberInput
              label="Sellos para ganar premio (3 a 10)"
              value={loyaltyDraft.stampsRequired}
              min={3}
              max={10}
              isIntegerOnly
              onChange={(v) => onUpdateLoyaltyDraft({ stampsRequired: v })}
            />
            <Selector
              label="Premio al completar"
              value={loyaltyDraft.rewardType}
              onChange={(v) => {
                if (v === 'free_service' || v === 'percent_discount') {
                  onUpdateLoyaltyDraft({ rewardType: v });
                }
              }}
              options={[
                { value: 'percent_discount', label: '% de descuento' },
                { value: 'free_service', label: 'Servicio gratis' },
              ]}
            />
          </Grid>

          {loyaltyDraft.rewardType === 'percent_discount' ? (
            <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
              <NumberInput
                label="Descuento (%)"
                value={loyaltyDraft.discountPercent ?? 50}
                min={1}
                max={100}
                units="%"
                isIntegerOnly
                onChange={(v) => onUpdateLoyaltyDraft({ discountPercent: v })}
              />
              <NumberInput
                label="Descuento máximo (MXN)"
                value={
                  loyaltyDraft.maxDiscountCents !== null
                    ? Math.round(loyaltyDraft.maxDiscountCents / 100)
                    : 250
                }
                min={0}
                units="MXN"
                isIntegerOnly
                onChange={(v) =>
                  onUpdateLoyaltyDraft({
                    maxDiscountCents: Math.max(0, Math.round(v * 100)),
                  })
                }
              />
            </Grid>
          ) : (
            <Selector
              label="Servicio incluido en el premio"
              value={loyaltyDraft.rewardServiceId ?? activeServices[0]?.id ?? ''}
              onChange={(v) => onUpdateLoyaltyDraft({ rewardServiceId: v || null })}
              options={activeServices.map((srv) => ({
                value: srv.id,
                label: `${srv.name} (${formatCurrency(srv.priceCents, currency)})`,
              }))}
            />
          )}
        </VStack>
      ) : (
        <VStack className="ad-card-body" paddingBlockStart={4}>
          <Text type="supporting" color="secondary">
            Activa el interruptor de arriba para premiar a tus clientas frecuentes.
          </Text>
        </VStack>
      )}
    </SurfaceCard>
  );
}
