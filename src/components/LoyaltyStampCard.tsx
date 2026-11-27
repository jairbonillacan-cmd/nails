'use client';

import { BrandIcon } from '@/components/brand/BrandIcon';
import { Badge } from '@astryxdesign/core/Badge';
import { Card } from '@astryxdesign/core/Card';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { Check } from 'lucide-react';
import type { PublicLoyaltySummaryDTO } from '@/lib/public-dto';

interface LoyaltyStampCardProps {
  loyaltySummary: PublicLoyaltySummaryDTO;
}

export function LoyaltyStampCard({ loyaltySummary }: LoyaltyStampCardProps) {
  const slots = Array.from(
    { length: loyaltySummary.stampsRequired },
    (_, index) => index + 1,
  );

  const progressMessage = loyaltySummary.isRewardReady
    ? 'Tu premio está listo para tu próxima cita.'
    : loyaltySummary.remainingForReward === 1
      ? 'Te falta 1 visita para tu premio.'
      : `Te faltan ${loyaltySummary.remainingForReward} visitas para tu premio.`;

  return (
    <VStack as="section" gap={4} className="ck-panel fx-fade-up" width="100%" aria-labelledby="ck-loyalty-title">
      <HStack justify="between" align="center" wrap="wrap" gap={2} width="100%">
        <Heading level={2} id="ck-loyalty-title" textWrap="balance" className="lk-serif rb-h2">
          {loyaltySummary.programName}
        </Heading>
        <VStack className={loyaltySummary.isRewardReady ? 'fx-pop' : undefined}>
          <Badge
            variant={loyaltySummary.isRewardReady ? 'success' : 'neutral'}
            label={`${loyaltySummary.currentStamps} de ${loyaltySummary.stampsRequired}`}
          />
        </VStack>
      </HStack>

      <Grid columns={{ minWidth: 64, max: 4 }} gap={2} width="100%" className="fx-stagger">
        {slots.map((slotNumber) => {
          const isFilled = slotNumber <= loyaltySummary.currentStamps;
          const isRewardSlot = slotNumber === loyaltySummary.stampsRequired;
          const slotVariant = isFilled
            ? loyaltySummary.isRewardReady
              ? 'green'
              : 'pink'
            : 'muted';

          return (
            <Card
              key={slotNumber}
              padding={2}
              variant={slotVariant}
              elevation={isFilled ? 'low' : 'none'}
              className={isFilled ? 'fx-pop' : undefined}
            >
              <VStack
                gap={1}
                align="center"
                justify="center"
                aria-label={`Sello ${slotNumber}: ${isFilled ? 'obtenido' : isRewardSlot ? 'premio' : 'pendiente'}`}
              >
                {isFilled ? (
                  <Check size={16} aria-hidden="true" className="lk-cereza-text" />
                ) : isRewardSlot ? (
                  <BrandIcon name="cupon" size={1.25} className="lk-cereza-text" />
                ) : (
                  <BrandIcon name="cereza-glow" size={1.125} />
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

      <VStack gap={1} align="start" width="100%" className={loyaltySummary.isRewardReady ? 'fx-pop' : undefined}>
        <Text
          type="body"
          weight="semibold"
          color={loyaltySummary.isRewardReady ? 'accent' : 'primary'}
        >
          {progressMessage}
        </Text>
        <Text type="supporting" color="secondary" textWrap="pretty">
          Premio: {loyaltySummary.rewardLabel}
          {loyaltySummary.redemptionsAvailable > 1
            ? ` · ${loyaltySummary.redemptionsAvailable} premios disponibles`
            : ''}
        </Text>
      </VStack>
    </VStack>
  );
}
