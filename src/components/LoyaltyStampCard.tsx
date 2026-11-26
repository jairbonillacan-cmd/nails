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
    <VStack as="section" gap={4} className="ck-panel fx-fade-up" width="100%" aria-labelledby="ck-loyalty-title">
      <VStack gap={4} width="100%">
        <HStack justify="between" align="start" wrap="wrap" gap={2} width="100%">
          <VStack gap={0.5} style={{ minWidth: 0 }}>
            <HStack gap={1.5} align="center">
              <Sparkles size={15} aria-hidden="true" className="lk-cereza-text" />
              <Text type="label" color="accent" weight="semibold">
                Tarjeta digital · {studioName}
              </Text>
            </HStack>
            <Heading level={2} id="ck-loyalty-title" textWrap="balance" className="lk-serif rb-h2">
              {loyaltySummary.programName}
            </Heading>
          </VStack>

          <VStack className={loyaltySummary.isRewardReady ? 'fx-pop' : undefined}>
            <Badge
              variant={loyaltySummary.isRewardReady ? 'success' : 'info'}
              label={`${loyaltySummary.currentStamps} / ${loyaltySummary.stampsRequired}`}
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
                    <Gift size={16} aria-hidden="true" className="lk-cereza-text" />
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

        <VStack gap={2} align="start" width="100%" className={loyaltySummary.isRewardReady ? 'fx-pop' : undefined}>
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
    </VStack>
  );
}
