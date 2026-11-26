'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Link } from '@astryxdesign/core/Link';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { formatDateShortInTimezone, formatPhoneDisplay } from '@/lib/format';
import type { CampaignDispatchLog, ClientProfile } from '@/lib/types';
import { ActionRow, StatusTag } from '@/components/ui';
import { formatInstagramDisplay, formatInstagramUrl } from './clientasTypes';

interface ClientRetentionHistorySectionProps {
  canManageClients: boolean;
  tz: string;
  recentDispatches: readonly CampaignDispatchLog[];
  returningClients: ReadonlyArray<{ client: ClientProfile; visits: number }>;
}

export function ClientRetentionHistorySection({
  canManageClients,
  tz,
  recentDispatches,
  returningClients,
}: ClientRetentionHistorySectionProps) {
  return (
    <>
      {canManageClients && recentDispatches.length > 0 ? (
        <Collapsible
          className="ad-disclosure"
          defaultIsOpen={false}
          trigger={
            <HStack justify="between" align="center" gap={2} width="100%">
              <Text weight="semibold" size="sm">
                Mensajes enviados recientemente
              </Text>
              <StatusTag
                tone="neutral"
                hasTabularNumbers
                label={String(recentDispatches.length)}
              />
            </HStack>
          }
        >
          <VStack className="ad-row-list" gap={0} paddingBlockStart={2}>
            {recentDispatches.slice(0, 6).map((log) => (
              <ActionRow
                key={log.id}
                title={
                  <HStack gap={2} align="center" wrap="wrap">
                    <Text weight="semibold" size="sm">
                      {log.clientName}
                    </Text>
                    <StatusTag
                      tone={log.kind === 'birthday' ? 'info' : 'warning'}
                      label={log.kind === 'birthday' ? 'Cumpleaños' : 'Te extrañamos'}
                    />
                  </HStack>
                }
                subtitle={
                  <Text type="supporting" color="secondary" maxLines={1}>
                    {log.messagePreview}
                  </Text>
                }
                actions={
                  <Text type="supporting" color="secondary" hasTabularNumbers>
                    {formatDateShortInTimezone(log.dispatchedAt, tz)} · {log.dispatchedBy}
                  </Text>
                }
              />
            ))}
          </VStack>
        </Collapsible>
      ) : null}

      {returningClients.length > 0 ? (
        <Collapsible
          className="ad-disclosure"
          defaultIsOpen={false}
          trigger={
            <HStack justify="between" align="center" gap={2} width="100%">
              <Text weight="semibold" size="sm">
                Clientas frecuentes (2+ visitas)
              </Text>
              <StatusTag
                tone="success"
                hasTabularNumbers
                label={String(returningClients.length)}
              />
            </HStack>
          }
        >
          <VStack className="ad-row-list" gap={0} paddingBlockStart={2}>
            {returningClients.map(({ client, visits }) => (
              <ActionRow
                key={client.id}
                leading={<Avatar name={client.fullName} size="sm" />}
                title={client.fullName}
                subtitle={
                  <HStack gap={2} wrap="wrap">
                    <Text type="supporting" color="secondary" hasTabularNumbers>
                      {formatPhoneDisplay(client.phoneE164)}
                    </Text>
                    {client.instagramHandle ? (
                      <Link
                        href={formatInstagramUrl(client.instagramHandle)}
                        isExternalLink
                        type="supporting"
                      >
                        {formatInstagramDisplay(client.instagramHandle)}
                      </Link>
                    ) : null}
                  </HStack>
                }
                status={
                  <StatusTag tone="success" hasTabularNumbers label={`${visits} visitas`} />
                }
              />
            ))}
          </VStack>
        </Collapsible>
      ) : null}
    </>
  );
}
