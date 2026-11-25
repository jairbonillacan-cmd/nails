'use client';

import { Badge } from '@astryxdesign/core/Badge';
import { Card } from '@astryxdesign/core/Card';
import { Divider } from '@astryxdesign/core/Divider';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Text } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';
import { VStack } from '@astryxdesign/core/VStack';
import { Check, Gift, Sparkles } from 'lucide-react';
import type { PublicLoyaltySummaryDTO } from '@/lib/public-dto';

interface LoyaltyStampCardProps {
  loyaltySummary: PublicLoyaltySummaryDTO;
  studioName: string;
}

export function LoyaltyStampCard({
  loyaltySummary,
  studioName,
}: LoyaltyStampCardProps) {
  const slots = Array.from(
    { length: loyaltySummary.stampsRequired },
    (_, index) => index + 1,
  );

  const progressMessage = loyaltySummary.isRewardReady
    ? '¡Premio listo para canjear en tu próxima cita!'
    : loyaltySummary.remainingForReward === 1
      ? '¡Te falta solo 1 visita para tu premio!'
      : `¡Te faltan solo ${loyaltySummary.remainingForReward} visitas para tu premio!`;

  return (
    <Card padding={5} elevation="low" width="100%">
      <VStack gap={4} width="100%">
        <HStack justify="between" align="start" wrap="wrap" gap={2} width="100%">
          <VStack gap={0.5}>
            <HStack gap={1.5} align="center">
              <Sparkles size={15} aria-hidden="true" />
              <Text type="label" color="accent" weight="semibold">
                Tarjeta digital · {studioName}
              </Text>
            </HStack>
            <Heading level={2}>{loyaltySummary.programName}</Heading>
          </VStack>

          <Badge
            variant={loyaltySummary.isRewardReady ? 'success' : 'info'}
            label={`${loyaltySummary.currentStamps} / ${loyaltySummary.stampsRequired}`}
          />
        </HStack>

        <Grid columns={{ minWidth: 64, max: 4 }} gap={2} width="100%">
          {slots.map((slotNumber) => {
            const isFilled = slotNumber <= loyaltySummary.currentStamps;
            const isRewardSlot = slotNumber === loyaltySummary.stampsRequired;
            const slotVariant = isFilled
              ? loyaltySummary.isRewardReady
                ? 'green'
                : 'pink'
              : 'muted';

            return (
              <Card key={slotNumber} padding={2} variant={slotVariant}>
                <VStack gap={1} align="center" justify="center">
                  {isFilled ? (
                    <Check size={16} aria-hidden="true" />
                  ) : isRewardSlot ? (
                    <Gift size={16} aria-hidden="true" />
                  ) : (
                    <Sparkles size={14} aria-hidden="true" />
                  )}
                  <Text
                    type="label"
                    weight={isFilled ? 'semibold' : 'normal'}
                    color={isFilled ? 'primary' : 'secondary'}
                    hasTabularNumbers
                  >
                    {slotNumber}
                  </Text>
                </VStack>
              </Card>
            );
          })}
        </Grid>

        <ProgressBar
          label={`Progreso de sellos en ${loyaltySummary.programName}`}
          value={loyaltySummary.currentStamps}
          max={loyaltySummary.stampsRequired}
          hasValueLabel
          formatValueLabel={(val, max) => `${val} de ${max} sellos`}
          variant={loyaltySummary.isRewardReady ? 'success' : 'accent'}
        />

        <VStack gap={2} align="start" width="100%">
          <Text
            type="body"
            weight="semibold"
            color={loyaltySummary.isRewardReady ? 'accent' : 'primary'}
          >
            {progressMessage}
          </Text>
          <HStack gap={2} wrap="wrap" align="center">
            <Token
              label={`Premio: ${loyaltySummary.rewardLabel}`}
              size="md"
              color={loyaltySummary.isRewardReady ? 'green' : 'default'}
              icon={<Gift size={14} aria-hidden="true" />}
            />
            {loyaltySummary.redemptionsAvailable > 1 ? (
              <Token
                label={`${loyaltySummary.redemptionsAvailable} premios disponibles`}
                size="sm"
                color="green"
              />
            ) : null}
          </HStack>
        </VStack>

        <Divider />

        <Text type="supporting" color="secondary">
          Sin descargar ninguna app — tus sellos se guardan automáticamente con tu número.
        </Text>
      </VStack>
    </Card>
  );
}
