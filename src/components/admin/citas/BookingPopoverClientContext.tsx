'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { History, Package, Sparkles } from 'lucide-react';
import { StatusTag, SurfaceCard } from '@/components/ui';
import {
  formatNailTechBadges,
  parseNailTechNotes,
} from '@/components/admin/clientas/nailTechProfile';
import { formatDateShortInTimezone } from '@/lib/format';
import type { ClientLoyaltySummary } from '@/lib/loyalty/stamps';
import type { BookingWithRelations, ClientProfile } from '@/lib/types';
import type { ClientPackageSummaryRow } from './CheckoutLoyaltySection';

interface BookingPopoverClientContextProps {
  clientProfile: ClientProfile;
  noShowThreshold: number;
  loyaltySummary: ClientLoyaltySummary | null;
  clientPackages: readonly ClientPackageSummaryRow[];
  lastCompletedBooking: BookingWithRelations | null;
  timezone: string;
}

export function BookingPopoverClientContext({
  clientProfile,
  noShowThreshold,
  loyaltySummary,
  clientPackages,
  lastCompletedBooking,
  timezone,
}: BookingPopoverClientContextProps) {
  const parsedClientNotes = parseNailTechNotes(clientProfile.notes ?? '');
  const techBadges = formatNailTechBadges(parsedClientNotes.profile);

  const hasClientContext = Boolean(
    techBadges.length > 0 ||
      loyaltySummary ||
      clientPackages.length > 0 ||
      clientProfile.noShowCount > 0 ||
      lastCompletedBooking ||
      parsedClientNotes.freeNotes,
  );

  if (!hasClientContext) {
    return null;
  }

  return (
    <SurfaceCard tone="subtle" padded className="ad-pop-context">
      <VStack gap={2}>
        <HStack justify="between" align="center" gap={2} wrap="wrap">
          <Text type="supporting" weight="semibold" color="secondary">
            Ficha de la clienta
          </Text>
          {clientProfile.noShowCount > 0 ? (
            <StatusTag
              size="sm"
              tone={clientProfile.noShowCount >= noShowThreshold ? 'danger' : 'warning'}
              label={`${clientProfile.noShowCount} ${
                clientProfile.noShowCount === 1 ? 'inasistencia' : 'inasistencias'
              }`}
              hasTabularNumbers
            />
          ) : (
            <Text type="supporting" color="secondary" hasTabularNumbers>
              0 inasistencias
            </Text>
          )}
        </HStack>

        {techBadges.length > 0 ? (
          <HStack gap={1.5} wrap="wrap" className="ad-pop-tech-chips">
            {techBadges.map((badge) => (
              <StatusTag
                key={badge.label}
                size="sm"
                tone={badge.tone}
                label={badge.label}
              />
            ))}
          </HStack>
        ) : null}

        {loyaltySummary || clientPackages.length > 0 ? (
          <HStack gap={1.5} wrap="wrap" align="center" className="ad-pop-loyalty-row">
            {loyaltySummary ? (
              <StatusTag
                size="sm"
                tone={loyaltySummary.isRewardReady ? 'success' : 'accent'}
                icon={<Sparkles size={12} aria-hidden="true" />}
                label={
                  loyaltySummary.isRewardReady
                    ? `Premio listo (${loyaltySummary.currentStamps}/${loyaltySummary.stampsRequired})`
                    : `${loyaltySummary.currentStamps}/${loyaltySummary.stampsRequired} sellos`
                }
                hasTabularNumbers
              />
            ) : null}
            {clientPackages.map((pkg) => (
              <StatusTag
                key={pkg.id}
                size="sm"
                tone="info"
                icon={<Package size={12} aria-hidden="true" />}
                label={`${pkg.packageName} · ${pkg.remainingSessions}/${pkg.totalSessions}`}
                hasTabularNumbers
              />
            ))}
          </HStack>
        ) : null}

        {lastCompletedBooking ? (
          <HStack gap={1.5} align="center" wrap="wrap">
            <History size={13} aria-hidden="true" />
            <Text type="supporting" color="secondary" hasTabularNumbers>
              Última visita: {lastCompletedBooking.service.name} (
              {formatDateShortInTimezone(lastCompletedBooking.startAt, timezone)})
            </Text>
          </HStack>
        ) : null}

        {parsedClientNotes.freeNotes ? (
          <Text type="supporting" color="secondary" className="ad-pop-note">
            Nota de ficha: {parsedClientNotes.freeNotes}
          </Text>
        ) : null}
      </VStack>
    </SurfaceCard>
  );
}
