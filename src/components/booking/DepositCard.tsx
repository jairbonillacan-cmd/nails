'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Info } from 'lucide-react';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import { formatCurrency } from '@/lib/format';
import type { PublicSettingsDTO } from '@/lib/public-dto';

interface DepositCardProps {
  settings: PublicSettingsDTO;
  depositAmountCents: number;
  noShowNotice?: string | null;
}

export function DepositCard({
  settings,
  depositAmountCents,
  noShowNotice = null,
}: DepositCardProps) {
  const displayAmount = formatCurrency(
    Math.max(0, depositAmountCents),
    settings.currency,
  );

  return (
    <SurfaceCard
      tone="accent"
      padded
      headingLevel={3}
      title={`Anticipo de ${displayAmount}`}
      subtitle="Se descuenta del total el día de tu cita"
      className="rb-deposit"
    >
      <VStack gap={2}>
        <HStack gap={2} align="start">
          <Info size={16} aria-hidden="true" className="ck-icon lk-cereza-text" />
          <Text type="supporting" color="primary" textWrap="pretty">
            Al apartar recibirás tu enlace de cita con los datos SPEI y el espacio para subir tu comprobante.
          </Text>
        </HStack>
        {noShowNotice ? (
          <Text type="supporting" color="secondary" textWrap="pretty">
            {noShowNotice}
          </Text>
        ) : null}
      </VStack>
    </SurfaceCard>
  );
}
