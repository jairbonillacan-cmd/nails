'use client';

import { useMemo } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Link } from '@astryxdesign/core/Link';
import { Cake, MessageCircle, Sparkles } from 'lucide-react';
import {
  buildWhatsAppLink,
  formatBirthdayDisplay,
  formatDateShortInTimezone,
  formatPhoneDisplay,
} from '@/lib/format';
import type { ClientProfile } from '@/lib/types';
import {
  ActionRow,
  EmptyStateCard,
  FilterPillBar,
  SkeletonBlock,
  StatusTag,
  SurfaceCard,
  type FilterPillOption,
} from '@/components/ui';
import {
  INACTIVE_DAY_PRESETS,
  formatInstagramDisplay,
  formatInstagramUrl,
  type CampaignsPayload,
  type InactiveClientRow,
} from './clientasTypes';
import { ClientRetentionHistorySection } from './ClientRetentionHistorySection';

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

const PRESET_OPTIONS: readonly FilterPillOption<string>[] = INACTIVE_DAY_PRESETS.map(
  (preset) => ({
    value: String(preset.days),
    label: preset.label,
  }),
);

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
        <SurfaceCard tone="accent" padded>
          <HStack justify="between" align="center" wrap="wrap" gap={3}>
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
        </SurfaceCard>
      ) : null}

      {canManageClients ? (
        <SurfaceCard
          title="Cumpleaños de esta semana"
          subtitle="Mándales felicidades por WhatsApp."
          icon={<Cake size={16} aria-hidden="true" />}
          count={campaigns?.birthdays.length ?? 0}
        >
          {campaignsLoading && !campaigns ? (
            <VStack padding={4} gap={2} role="status" aria-busy="true">
              <SkeletonBlock width="100%" height="3.5rem" radius={2} index={0} />
            </VStack>
          ) : (campaigns?.birthdays.length ?? 0) === 0 ? (
            <VStack padding={4}>
              <EmptyStateCard
                framed={false}
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
                  <ActionRow
                    key={item.clientId}
                    leading={<Avatar name={item.fullName} size="sm" />}
                    title={
                      <HStack gap={2} align="center" wrap="wrap">
                        <Text weight="semibold">{item.fullName}</Text>
                        <StatusTag tone="info" label={whenLabel} />
                        {alreadySent ? <StatusTag tone="success" label="Enviado" /> : null}
                      </HStack>
                    }
                    subtitle={`Cumple el ${formatBirthdayDisplay(item.birthday ?? '')} · ${formatPhoneDisplay(item.phoneE164)}`}
                    meta={
                      <Text type="supporting" color="secondary" maxLines={2}>
                        {item.whatsappMessage}
                      </Text>
                    }
                    actions={
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
                    }
                  />
                );
              })}
            </VStack>
          )}
        </SurfaceCard>
      ) : null}

      <SurfaceCard
        title="Clientas que no vienen hace tiempo"
        subtitle="Clientas que no han vuelto. Mándales un saludo por WhatsApp."
        actions={
          <FilterPillBar
            ariaLabel="Días sin visita"
            mode="pills"
            size="sm"
            value={String(inactiveDays)}
            options={PRESET_OPTIONS}
            onChange={(val) => onInactiveDaysChange(Number(val))}
          />
        }
      >
        {inactiveError ? (
          <VStack padding={4}>
            <Banner status="error" title={inactiveError} />
          </VStack>
        ) : null}

        {inactiveLoading ? (
          <VStack padding={4} gap={2} role="status" aria-busy="true">
            <Text className="rb-sr-only">Buscando clientas que no han vuelto...</Text>
            <SkeletonBlock width="100%" height="3.5rem" radius={2} index={0} />
            <SkeletonBlock width="100%" height="3.5rem" radius={2} index={1} />
            <SkeletonBlock width="100%" height="3.5rem" radius={2} index={2} />
          </VStack>
        ) : displayedInactiveClients.length === 0 ? (
          <VStack padding={4}>
            <EmptyStateCard
              framed={false}
              isCompact
              title={`Todas vinieron en los últimos ${inactiveDays} días`}
              description="Tus clientas ya tienen visita reciente o una cita agendada."
              actions={
                inactiveDays > 21 ? (
                  <Button
                    type="button"
                    label="Revisar desde 21 días"
                    variant="secondary"
                    size="sm"
                    onClick={() => onInactiveDaysChange(21)}
                  />
                ) : undefined
              }
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
                <ActionRow
                  key={item.clientId}
                  leading={<Avatar name={item.fullName} size="sm" />}
                  title={
                    <HStack gap={2} align="center" wrap="wrap">
                      <Text weight="semibold">{item.fullName}</Text>
                      <StatusTag
                        tone={
                          item.daysSinceLastVisit !== null && item.daysSinceLastVisit >= 45
                            ? 'warning'
                            : 'neutral'
                        }
                        hasTabularNumbers
                        label={
                          item.daysSinceLastVisit !== null
                            ? `Hace ${item.daysSinceLastVisit} días`
                            : 'Sin visita'
                        }
                      />
                      {alreadySent ? <StatusTag tone="success" label="Enviado" /> : null}
                    </HStack>
                  }
                  subtitle={
                    <HStack gap={2} wrap="wrap" align="center">
                      <Text type="supporting" color="secondary" hasTabularNumbers>
                        {formatPhoneDisplay(item.phoneE164)}
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
                  }
                  actions={
                    useCampaignDispatch ? (
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
                    )
                  }
                />
              );
            })}
          </VStack>
        )}
      </SurfaceCard>

      <ClientRetentionHistorySection
        canManageClients={canManageClients}
        tz={tz}
        recentDispatches={campaigns?.recentDispatches ?? []}
        returningClients={returningClients}
      />
    </VStack>
  );
}
