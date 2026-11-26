'use client';

import { useMemo } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Link } from '@astryxdesign/core/Link';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Cake, MessageCircle, Sparkles } from 'lucide-react';
import { buildWhatsAppLink, formatDateShortInTimezone } from '@/lib/format';
import type { ClientProfile } from '@/lib/types';
import {
  INACTIVE_DAY_PRESETS,
  formatInstagramDisplay,
  formatInstagramUrl,
  type CampaignsPayload,
  type InactiveClientRow,
} from './clientasTypes';

interface ClientRetentionTabProps {
  canManageClients: boolean;
  salonName: string;
  tz: string;
  inactiveDays: number;
  onInactiveDaysChange: (days: number) => void;
  displayedInactiveClients: readonly InactiveClientRow[];
  inactiveLoading: boolean;
  inactiveError: string | null;
  campaigns: CampaignsPayload | null;
  campaignsLoading: boolean;
  dispatchedTodayKeys: ReadonlySet<string>;
  dispatchingKey: string | null;
  nearRewardCount: number;
  returningClients: ReadonlyArray<{ client: ClientProfile; visits: number }>;
  onOpenLoyalty: () => void;
  onDispatchCampaign: (params: {
    kind: 'birthday' | 'reactivation';
    clientId: string;
    clientName: string;
    messagePreview: string;
    fallbackUrl: string;
  }) => Promise<void>;
}

export function ClientRetentionTab({
  canManageClients,
  salonName,
  tz,
  inactiveDays,
  onInactiveDaysChange,
  displayedInactiveClients,
  inactiveLoading,
  inactiveError,
  campaigns,
  campaignsLoading,
  dispatchedTodayKeys,
  dispatchingKey,
  nearRewardCount,
  returningClients,
  onOpenLoyalty,
  onDispatchCampaign,
}: ClientRetentionTabProps) {
  const reactivationByClientId = useMemo(() => {
    const map = new Map<string, CampaignsPayload['reactivation'][number]>();
    for (const candidate of campaigns?.reactivation ?? []) {
      map.set(candidate.clientId, candidate);
    }
    return map;
  }, [campaigns]);

  return (
    <VStack gap={5} className="fx-step-in">
      {nearRewardCount > 0 ? (
        <HStack
          className="ad-surface"
          data-tone="accent"
          data-padded="true"
          justify="between"
          align="center"
          wrap="wrap"
          gap={3}
        >
          <HStack gap={2} align="center" className="rb-grow">
            <Sparkles size={17} aria-hidden="true" />
            <VStack gap={0.5} className="rb-grow">
              <Text weight="semibold">
                {nearRewardCount} {nearRewardCount === 1 ? 'clienta está' : 'clientas están'}{' '}
                cerca o lista para su premio de sellos
              </Text>
              <Text type="supporting" color="secondary">
                Mándales un mensajito para que aprovechen su beneficio en su siguiente cita.
              </Text>
            </VStack>
          </HStack>
          <Button
            type="button"
            label="Ver sellos y paquetes"
            variant="secondary"
            size="sm"
            onClick={onOpenLoyalty}
          />
        </HStack>
      ) : null}

      {canManageClients ? (
        <VStack className="ad-surface" gap={0}>
          <HStack className="ad-section-head" justify="between" align="center" gap={2}>
            <VStack gap={0.5} className="rb-grow">
              <HStack gap={1.5} align="center">
                <Cake size={16} aria-hidden="true" />
                <Heading level={2} className="lk-serif ad-h2">
                  Cumpleaños de esta semana
                </Heading>
              </HStack>
              <Text type="supporting" color="secondary">
                Felicítalas por WhatsApp en un toque para consentirlas en su semana.
              </Text>
            </VStack>
            <Text color="inherit" className="ad-chip" data-tone="accent" hasTabularNumbers>
              {campaigns?.birthdays.length ?? 0}
            </Text>
          </HStack>

          {campaignsLoading && !campaigns ? (
            <VStack padding={4} gap={2} role="status" aria-busy="true">
              <VStack className="ad-skeleton" data-size="row" aria-hidden="true" />
            </VStack>
          ) : (campaigns?.birthdays.length ?? 0) === 0 ? (
            <VStack className="ad-empty" gap={1.5}>
              <EmptyState
                isCompact
                title="Sin cumpleaños esta semana"
                description="Cuando anotes el cumpleaños en la ficha de una clienta, aparecerá aquí días antes."
              />
            </VStack>
          ) : (
            <VStack className="ad-row-list" gap={0}>
              {(campaigns?.birthdays ?? []).map((item) => {
                const dispatchKey = `birthday:${item.clientId}`;
                const alreadySent = dispatchedTodayKeys.has(dispatchKey);
                const whenLabel =
                  item.daysUntilBirthday === 0
                    ? '¡Hoy!'
                    : item.daysUntilBirthday === 1
                      ? 'Mañana'
                      : `En ${item.daysUntilBirthday} días`;
                return (
                  <HStack
                    key={item.clientId}
                    className="ad-row-item"
                    justify="between"
                    align="center"
                    wrap="wrap"
                    gap={3}
                  >
                    <HStack gap={3} align="center" className="rb-grow">
                      <Avatar name={item.fullName} size="sm" />
                      <VStack gap={0.5} className="rb-grow">
                        <HStack gap={2} align="center" wrap="wrap">
                          <Text weight="semibold">{item.fullName}</Text>
                          <Badge variant="info" label={whenLabel} />
                          {alreadySent ? <Badge variant="success" label="Enviado" /> : null}
                        </HStack>
                        <Text type="supporting" color="secondary" hasTabularNumbers>
                          {item.birthday} · {item.phoneE164}
                        </Text>
                        <Text type="supporting" color="secondary" maxLines={2}>
                          {item.whatsappMessage}
                        </Text>
                      </VStack>
                    </HStack>

                    <Button
                      type="button"
                      label="Felicitar por WhatsApp"
                      variant="primary"
                      size="sm"
                      icon={<MessageCircle size={14} aria-hidden="true" />}
                      isLoading={dispatchingKey === dispatchKey}
                      onClick={() =>
                        void onDispatchCampaign({
                          kind: 'birthday',
                          clientId: item.clientId,
                          clientName: item.fullName,
                          messagePreview: item.whatsappMessage,
                          fallbackUrl: item.whatsappUrl,
                        })
                      }
                    />
                  </HStack>
                );
              })}
            </VStack>
          )}
        </VStack>
      ) : null}

      <VStack className="ad-surface" gap={0}>
        <HStack className="ad-section-head" justify="between" align="center" wrap="wrap" gap={3}>
          <VStack gap={0.5} className="rb-grow">
            <Heading level={2} className="lk-serif ad-h2">
              Clientas que no vienen hace tiempo
            </Heading>
            <Text type="supporting" color="secondary">
              Elige cuántos días llevan sin agendar y mándales un saludo por WhatsApp para su
              retoque o nuevo set.
            </Text>
          </VStack>
          <HStack gap={1.5} wrap="wrap" role="group" aria-label="Días sin visita">
            {INACTIVE_DAY_PRESETS.map((preset) => (
              <button
                key={preset.days}
                type="button"
                className="ad-pill fx-press"
                data-on={inactiveDays === preset.days ? 'true' : 'false'}
                aria-pressed={inactiveDays === preset.days}
                onClick={() => onInactiveDaysChange(preset.days)}
              >
                {preset.label}
              </button>
            ))}
          </HStack>
        </HStack>

        {inactiveError ? (
          <VStack padding={4}>
            <Banner status="error" title={inactiveError} />
          </VStack>
        ) : null}

        {inactiveLoading ? (
          <VStack padding={4} gap={2} role="status" aria-busy="true">
            <Text className="rb-sr-only">Buscando clientas que no han vuelto...</Text>
            <VStack className="ad-skeleton" data-size="row" aria-hidden="true" />
            <VStack className="ad-skeleton" data-size="row" aria-hidden="true" />
            <VStack className="ad-skeleton" data-size="row" aria-hidden="true" />
          </VStack>
        ) : displayedInactiveClients.length === 0 ? (
          <VStack className="ad-empty" gap={2}>
            <EmptyState
              isCompact
              title={`Todas vinieron en los últimos ${inactiveDays} días`}
              description="Tus clientas ya tienen visita reciente o una cita agendada."
            />
          </VStack>
        ) : (
          <VStack className="ad-row-list fx-stagger" gap={0}>
            {displayedInactiveClients.map((item) => {
              const reactivationMatch = reactivationByClientId.get(item.clientId) ?? null;
              const dispatchKey = `reactivation:${item.clientId}`;
              const alreadySent = dispatchedTodayKeys.has(dispatchKey);
              const comebackMsg =
                reactivationMatch?.whatsappMessage ??
                (item.daysSinceLastVisit !== null
                  ? inactiveDays <= 21
                    ? `Hola ${item.fullName}, te saludamos de ${salonName}! Ya pasaron ${item.daysSinceLastVisit} días desde tu última cita — ¿te apartamos horario para tu retoque?`
                    : `Hola ${item.fullName}, te extrañamos en ${salonName}! Ya pasaron ${item.daysSinceLastVisit} días desde tu última visita. ¿Te apartamos horario para tu nuevo set o retoque?`
                  : `Hola ${item.fullName}, te saludamos de ${salonName}! ¿Te gustaría agendar tu próxima cita con nosotras?`);
              const fallbackUrl =
                reactivationMatch?.whatsappUrl ?? buildWhatsAppLink(item.phoneE164, comebackMsg);
              const useCampaignDispatch =
                canManageClients &&
                (reactivationMatch !== null ||
                  (item.daysSinceLastVisit !== null && item.daysSinceLastVisit >= 45));

              return (
                <HStack
                  key={item.clientId}
                  className="ad-row-item"
                  justify="between"
                  align="center"
                  wrap="wrap"
                  gap={3}
                >
                  <HStack gap={3} align="center" className="rb-grow">
                    <Avatar name={item.fullName} size="sm" />
                    <VStack gap={0.5} className="rb-grow">
                      <HStack gap={2} align="center" wrap="wrap">
                        <Text weight="semibold">{item.fullName}</Text>
                        <Text
                          color="inherit"
                          className="ad-chip"
                          data-tone={
                            item.daysSinceLastVisit !== null && item.daysSinceLastVisit >= 45
                              ? 'warning'
                              : 'neutral'
                          }
                          hasTabularNumbers
                        >
                          {item.daysSinceLastVisit !== null
                            ? `Hace ${item.daysSinceLastVisit} días`
                            : 'Sin visita'}
                        </Text>
                        {alreadySent ? <Badge variant="success" label="Enviado" /> : null}
                      </HStack>
                      <HStack gap={2} wrap="wrap" align="center">
                        <Text type="supporting" color="secondary" hasTabularNumbers>
                          {item.phoneE164}
                        </Text>
                        {item.instagramHandle ? (
                          <Link
                            href={formatInstagramUrl(item.instagramHandle)}
                            isExternalLink
                            type="supporting"
                          >
                            {formatInstagramDisplay(item.instagramHandle)}
                          </Link>
                        ) : null}
                        <Text type="supporting" color="secondary" hasTabularNumbers>
                          {item.lastVisitAt
                            ? `Última visita: ${formatDateShortInTimezone(item.lastVisitAt, tz)}`
                            : 'Aún sin visitas'}
                        </Text>
                      </HStack>
                    </VStack>
                  </HStack>

                  {useCampaignDispatch ? (
                    <Button
                      type="button"
                      label="Enviar WhatsApp"
                      variant="primary"
                      size="sm"
                      icon={<MessageCircle size={14} aria-hidden="true" />}
                      isLoading={dispatchingKey === dispatchKey}
                      onClick={() =>
                        void onDispatchCampaign({
                          kind: 'reactivation',
                          clientId: item.clientId,
                          clientName: item.fullName,
                          messagePreview: comebackMsg,
                          fallbackUrl,
                        })
                      }
                    />
                  ) : (
                    <Button
                      label="Enviar WhatsApp"
                      variant="primary"
                      size="sm"
                      icon={<MessageCircle size={14} aria-hidden="true" />}
                      href={fallbackUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  )}
                </HStack>
              );
            })}
          </VStack>
        )}
      </VStack>

      {canManageClients && (campaigns?.recentDispatches.length ?? 0) > 0 ? (
        <Collapsible
          className="ad-disclosure"
          defaultIsOpen={false}
          trigger={
            <HStack justify="between" align="center" gap={2} width="100%">
              <Text weight="semibold" size="sm">
                Mensajes enviados recientemente
              </Text>
              <Text color="inherit" className="ad-chip" data-tone="neutral" hasTabularNumbers>
                {campaigns?.recentDispatches.length ?? 0}
              </Text>
            </HStack>
          }
        >
          <VStack className="ad-row-list" gap={0} paddingBlockStart={2}>
            {(campaigns?.recentDispatches ?? []).slice(0, 6).map((log) => (
              <HStack
                key={log.id}
                className="ad-row-item"
                justify="between"
                align="center"
                wrap="wrap"
                gap={2}
              >
                <VStack gap={0.5} className="rb-grow">
                  <HStack gap={2} align="center" wrap="wrap">
                    <Text weight="semibold" size="sm">
                      {log.clientName}
                    </Text>
                    <Badge
                      variant={log.kind === 'birthday' ? 'info' : 'warning'}
                      label={log.kind === 'birthday' ? 'Cumpleaños' : 'Te extrañamos'}
                    />
                  </HStack>
                  <Text type="supporting" color="secondary" maxLines={1}>
                    {log.messagePreview}
                  </Text>
                </VStack>
                <Text type="supporting" color="secondary" hasTabularNumbers>
                  {formatDateShortInTimezone(log.dispatchedAt, tz)} · {log.dispatchedBy}
                </Text>
              </HStack>
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
              <Text color="inherit" className="ad-chip" data-tone="success" hasTabularNumbers>
                {returningClients.length}
              </Text>
            </HStack>
          }
        >
          <VStack className="ad-row-list" gap={0} paddingBlockStart={2}>
            {returningClients.map(({ client, visits }) => (
              <HStack
                key={client.id}
                className="ad-row-item"
                justify="between"
                align="center"
                wrap="wrap"
                gap={3}
              >
                <HStack gap={3} align="center" className="rb-grow">
                  <Avatar name={client.fullName} size="sm" />
                  <VStack gap={0.5} className="rb-grow">
                    <Text weight="semibold">{client.fullName}</Text>
                    <HStack gap={2} wrap="wrap">
                      <Text type="supporting" color="secondary" hasTabularNumbers>
                        {client.phoneE164}
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
                  </VStack>
                </HStack>
                <Text color="inherit" className="ad-chip" data-tone="success" hasTabularNumbers>
                  {visits} visitas
                </Text>
              </HStack>
            ))}
          </VStack>
        </Collapsible>
      ) : null}
    </VStack>
  );
}
