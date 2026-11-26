'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Link } from '@astryxdesign/core/Link';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Switch } from '@astryxdesign/core/Switch';
import { Cake, MessageCircle, Search } from 'lucide-react';
import { buildWhatsAppLink } from '@/lib/format';
import type { computeClientLoyaltySummary } from '@/lib/loyalty/stamps';
import type { ClientProfile } from '@/lib/types';
import { ActionRow, EmptyStateCard, StatusTag, SurfaceCard } from '@/components/ui';
import {
  formatInstagramDisplay,
  formatInstagramUrl,
  type ClientPackageRow,
} from './clientasTypes';

type LoyaltySummary = ReturnType<typeof computeClientLoyaltySummary>;

interface ClientDirectoryTabProps {
  query: string;
  onQueryChange: (next: string) => void;
  onlyBirthdays: boolean;
  onOnlyBirthdaysChange: (next: boolean) => void;
  groupedByLetter: ReadonlyArray<readonly [string, ClientProfile[]]>;
  visitCountByClient: ReadonlyMap<string, number>;
  loyaltyByClientId: ReadonlyMap<string, LoyaltySummary>;
  packagesByClientId: ReadonlyMap<string, ClientPackageRow[]>;
  noShowThreshold: number;
  salonName: string;
  canManageClients: boolean;
  onSelectClient: (client: ClientProfile) => void;
  onOpenNewClient: () => void;
}

export function ClientDirectoryTab({
  query,
  onQueryChange,
  onlyBirthdays,
  onOnlyBirthdaysChange,
  groupedByLetter,
  visitCountByClient,
  loyaltyByClientId,
  packagesByClientId,
  noShowThreshold,
  salonName,
  canManageClients,
  onSelectClient,
  onOpenNewClient,
}: ClientDirectoryTabProps) {
  return (
    <VStack gap={4} className="fx-step-in">
      <HStack className="ad-toolbar" justify="between" align="center" wrap="wrap" gap={3}>
        <TextInput
          type="search"
          label="Buscar clienta"
          isLabelHidden
          placeholder="Buscar por nombre, WhatsApp o @instagram..."
          startIcon={<Search size={14} aria-hidden="true" />}
          size="sm"
          width="min(22rem, 100%)"
          hasClear
          value={query}
          onChange={onQueryChange}
        />
        <Switch
          label="Cumpleañeras del mes"
          size="sm"
          value={onlyBirthdays}
          onChange={onOnlyBirthdaysChange}
        />
      </HStack>

      {groupedByLetter.length === 0 ? (
        <EmptyStateCard
          isCompact
          title="No encontramos clientas"
          description="Prueba con otro nombre o número, o agrega una clienta nueva."
          actions={
            query.trim() || onlyBirthdays || canManageClients ? (
              <HStack gap={2} wrap="wrap" justify="center">
                {query.trim() || onlyBirthdays ? (
                  <Button
                    type="button"
                    label="Ver todas"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      onQueryChange('');
                      onOnlyBirthdaysChange(false);
                    }}
                  />
                ) : null}
                {canManageClients ? (
                  <Button
                    type="button"
                    label="Nueva clienta"
                    variant="primary"
                    size="sm"
                    onClick={onOpenNewClient}
                  />
                ) : null}
              </HStack>
            ) : undefined
          }
        />
      ) : (
        <VStack gap={4} className="fx-stagger">
          {groupedByLetter.map(([letter, clientsInGroup]) => (
            <SurfaceCard
              key={letter}
              title={letter}
              headingLevel={3}
              count={clientsInGroup.length}
            >
              <VStack className="ad-row-list" gap={0}>
                {clientsInGroup.map((c) => {
                  const visits = visitCountByClient.get(c.id) ?? 0;
                  const loyalty = loyaltyByClientId.get(c.id) ?? null;
                  const clientActivePkgs = (packagesByClientId.get(c.id) ?? []).filter(
                    (pkg) =>
                      pkg.status === 'active' && !pkg.isExpired && pkg.remainingSessions > 0,
                  );
                  const remainingPkgSessions = clientActivePkgs.reduce(
                    (sum, pkg) => sum + pkg.remainingSessions,
                    0,
                  );
                  const isFlaggedNoShow = c.noShowCount >= noShowThreshold;

                  return (
                    <ActionRow
                      key={c.id}
                      leading={<Avatar name={c.fullName} size="sm" />}
                      title={c.fullName}
                      subtitle={
                        <HStack gap={2} wrap="wrap" align="center">
                          <Text type="supporting" color="secondary" hasTabularNumbers>
                            {c.phoneE164}
                          </Text>
                          {c.instagramHandle ? (
                            <Link
                              href={formatInstagramUrl(c.instagramHandle)}
                              isExternalLink
                              type="supporting"
                            >
                              {formatInstagramDisplay(c.instagramHandle)}
                            </Link>
                          ) : null}
                          {c.birthday ? (
                            <HStack gap={1} align="center">
                              <Cake size={13} aria-hidden="true" />
                              <Text type="supporting" color="secondary" hasTabularNumbers>
                                {c.birthday}
                              </Text>
                            </HStack>
                          ) : null}
                        </HStack>
                      }
                      meta={
                        c.notes ? (
                          <Text type="supporting" color="secondary" maxLines={2}>
                            {c.notes}
                          </Text>
                        ) : undefined
                      }
                      status={
                        <HStack gap={1.5} align="center" wrap="wrap">
                          <StatusTag
                            tone="neutral"
                            hasTabularNumbers
                            label={`${visits} ${visits === 1 ? 'cita' : 'citas'}`}
                          />
                          {loyalty && loyalty.currentStamps > 0 ? (
                            <StatusTag
                              tone={loyalty.isRewardReady ? 'success' : 'accent'}
                              hasTabularNumbers
                              label={`${loyalty.currentStamps}/${loyalty.stampsRequired} sellos`}
                            />
                          ) : null}
                          {remainingPkgSessions > 0 ? (
                            <StatusTag
                              tone="accent"
                              hasTabularNumbers
                              label={`${remainingPkgSessions} ses. paquete`}
                            />
                          ) : null}
                          {c.noShowCount > 0 ? (
                            <StatusTag
                              tone={isFlaggedNoShow ? 'warning' : 'neutral'}
                              hasTabularNumbers
                              label={`${c.noShowCount} ${c.noShowCount === 1 ? 'inasistencia' : 'inasistencias'}`}
                            />
                          ) : null}
                        </HStack>
                      }
                      actions={
                        <HStack gap={1.5} align="center" wrap="wrap">
                          <Button
                            type="button"
                            label="Ver ficha"
                            size="sm"
                            variant="secondary"
                            onClick={() => onSelectClient(c)}
                          />
                          <Button
                            label="WhatsApp"
                            size="sm"
                            variant="ghost"
                            icon={<MessageCircle size={14} aria-hidden="true" />}
                            href={buildWhatsAppLink(
                              c.phoneE164,
                              `Hola ${c.fullName}, te saludamos de ${salonName}!`,
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                          />
                        </HStack>
                      }
                    />
                  );
                })}
              </VStack>
            </SurfaceCard>
          ))}
        </VStack>
      )}
    </VStack>
  );
}
