'use client';

import NextLink from 'next/link';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Switch } from '@astryxdesign/core/Switch';
import { Wallet } from 'lucide-react';
import { marcaHref } from '@/lib/admin-links';

interface OnboardingStepDepositProps {
  depositEnabled: boolean;
  depositAmountMxn: number;
  depositBank: string;
  depositHolder: string;
  depositClabe: string;
  instagramHandle: string;
  onChangeDepositEnabled: (value: boolean) => void;
  onChangeDepositAmountMxn: (value: number) => void;
  onChangeDepositBank: (value: string) => void;
  onChangeDepositHolder: (value: string) => void;
  onChangeDepositClabe: (value: string) => void;
  onChangeInstagramHandle: (value: string) => void;
}

export function OnboardingStepDeposit({
  depositEnabled,
  depositAmountMxn,
  depositBank,
  depositHolder,
  depositClabe,
  instagramHandle,
  onChangeDepositEnabled,
  onChangeDepositAmountMxn,
  onChangeDepositBank,
  onChangeDepositHolder,
  onChangeDepositClabe,
  onChangeInstagramHandle,
}: OnboardingStepDepositProps) {
  return (
    <VStack gap={4}>
      <VStack gap={1}>
        <HStack justify="between" align="center" wrap="wrap" gap={2}>
          <Heading level={2} className="lk-serif ad-h2">
            2. Configura tu anticipo
          </Heading>
          <NextLink href={marcaHref({ tab: 'cobros' })} className="ad-inline-link">
            Ajustes de cobro →
          </NextLink>
        </HStack>
        <Text color="secondary">
          Así evitas cancelaciones de último minuto.
        </Text>
      </VStack>

      <Switch
        label="Pedir anticipo para apartar cita"
        description="Las clientas suben su comprobante o te lo mandan por Instagram."
        value={depositEnabled}
        onChange={onChangeDepositEnabled}
      />

      {depositEnabled ? (
        <VStack gap={3}>
          <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
            <NumberInput
              label="Monto de anticipo (MXN)"
              value={depositAmountMxn}
              min={0}
              step={50}
              isIntegerOnly
              onChange={onChangeDepositAmountMxn}
            />
            <TextInput
              label="Banco"
              placeholder="Mercado Pago"
              value={depositBank}
              onChange={onChangeDepositBank}
            />
          </Grid>
          <TextInput
            label="Titular de la cuenta"
            placeholder="Karla Patricia Carrillo Rodríguez"
            value={depositHolder}
            onChange={onChangeDepositHolder}
          />
          <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
            <TextInput
              label="Cuenta CLABE"
              placeholder="7229 6901 3959 779869"
              value={depositClabe}
              onChange={onChangeDepositClabe}
            />
            <TextInput
              label="Instagram para comprobantes"
              placeholder="@laikona.nailsss"
              value={instagramHandle}
              onChange={onChangeInstagramHandle}
            />
          </Grid>
        </VStack>
      ) : (
        <VStack className="ad-subpanel" gap={1}>
          <HStack gap={2} align="center">
            <Wallet size={16} aria-hidden="true" />
            <Text weight="semibold" size="sm">
              Sin anticipo por ahora
            </Text>
          </HStack>
          <Text type="supporting" color="secondary">
            Puedes activarlo después cuando quieras desde Mi página.
          </Text>
        </VStack>
      )}
    </VStack>
  );
}
