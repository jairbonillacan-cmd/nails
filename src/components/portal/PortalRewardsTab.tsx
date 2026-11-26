'use client';

import { BrandIcon } from '@/components/brand/BrandIcon';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Package } from 'lucide-react';
import { EmptyStateCard } from '@/components/ui/EmptyStateCard';
import { PackageStatusTag } from '@/components/ui/StatusTag';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import { formatDateShortInTimezone } from '@/lib/format';
import type { PublicClientPackageDTO, PublicLoyaltySummaryDTO } from '@/lib/public-dto';
import { LoyaltyStampCard } from '../LoyaltyStampCard';

interface PortalRewardsTabProps {
  studioName: string;
  timezone: string;
  loyaltySummary: PublicLoyaltySummaryDTO | null;
  packages: PublicClientPackageDTO[];
}

export function PortalRewardsTab({
  studioName,
  timezone,
  loyaltySummary,
  packages,
}: PortalRewardsTabProps) {
  return (
    <VStack role="tabpanel" gap={4} aria-label="Sellos y paquetes">
      {loyaltySummary ? (
        <LoyaltyStampCard loyaltySummary={loyaltySummary} studioName={studioName} />
      ) : (
        <SurfaceCard
          headingLevel={3}
          title="Tarjeta de sellos"
          icon={<BrandIcon name="cupon" size={1.25} className="lk-cereza-text" />}
          padded
          className="pt-card"
        >
          <EmptyStateCard
            title="Aún no tienes sellos acumulados"
            description="Al completar tu primera cita aparecerá tu progreso aquí."
            framed={false}
            isCompact
          />
        </SurfaceCard>
      )}

      <SurfaceCard
        id="pt-pkg-title"
        headingLevel={3}
        title="Paquetes de sesiones"
        subtitle="Tus sesiones prepagadas vigentes"
        icon={<Package size={18} aria-hidden="true" className="lk-cereza-text" />}
        count={packages.length}
        padded
        className="pt-card fx-fade-up"
      >
        {packages.length === 0 ? (
          <EmptyStateCard
            title="Sin paquetes activos"
            description="No tienes paquetes de sesiones activos en este momento. Pregunta en estudio por nuestros paquetes de retoque."
            framed={false}
            isCompact
          />
        ) : (
          <VStack gap={3} className="fx-stagger">
            {packages.map((pkg) => {
              const pipIndices = Array.from({ length: pkg.totalSessions }, (_, i) => i);
              return (
                <VStack key={pkg.id} className="ad-pkg-card">
                  <HStack justify="between" align="center" wrap="wrap" gap={2}>
                    <VStack gap={0}>
                      <Text weight="bold">{pkg.packageName}</Text>
                      <Text type="supporting" color="secondary">
                        {pkg.serviceName}
                      </Text>
                    </VStack>
                    <PackageStatusTag status={pkg.status} size="sm" />
                  </HStack>

                  <ul
                    className="ad-pkg-pips"
                    aria-label={`${pkg.usedSessions} de ${pkg.totalSessions} sesiones usadas`}
                  >
                    {pipIndices.map((idx) => (
                      <li
                        key={idx}
                        className="ad-pkg-pip"
                        data-used={idx < pkg.usedSessions ? 'true' : 'false'}
                      />
                    ))}
                  </ul>

                  <HStack justify="between" align="center" wrap="wrap" gap={2}>
                    <Text type="supporting" weight="semibold" hasTabularNumbers>
                      {pkg.remainingSessions} de {pkg.totalSessions} sesiones disponibles
                    </Text>
                    {pkg.expiresAt ? (
                      <HStack gap={1} align="center">
                        <BrandIcon name="duracion" size={1} />
                        <Text type="supporting" color="secondary" hasTabularNumbers>
                          Vence {formatDateShortInTimezone(pkg.expiresAt, timezone)}
                        </Text>
                      </HStack>
                    ) : null}
                  </HStack>
                </VStack>
              );
            })}
          </VStack>
        )}
      </SurfaceCard>
    </VStack>
  );
}
