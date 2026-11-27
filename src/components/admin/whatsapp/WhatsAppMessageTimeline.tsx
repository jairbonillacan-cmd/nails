'use client';

import type React from 'react';
import { useMemo } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Token } from '@astryxdesign/core/Token';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import {
  AlertCircle,
  Bot,
  Check,
  CheckCheck,
  Clock,
  FileText,
  MessageCircle,
  RotateCcw,
  Smartphone,
} from 'lucide-react';
import type { WhatsAppMessageDTO } from '@/lib/contracts';
import { formatTimeInTimezone } from '@/lib/format';
import type { WhatsAppDeliveryStatus } from '@/lib/types';
import { EmptyStateCard, SkeletonBlock } from '@/components/ui';
import {
  getWhatsAppDeliveryStatusMeta,
  groupWhatsAppMessagesByDate,
  resolveWhatsAppBubbleDirection,
  type WhatsAppInboxActionResult,
} from './whatsappUiHelpers';

interface WhatsAppMessageTimelineProps {
  messages: readonly WhatsAppMessageDTO[];
  isLoading: boolean;
  retryingMessageId: string | null;
  nowMs: number;
  timezone: string;
  containerRef?: React.RefObject<HTMLElement | null>;
  onRetryMessage: (messageId: string) => Promise<WhatsAppInboxActionResult>;
}

const TIMELINE_SKELETONS = [0, 1, 2] as const;

function DeliveryStatusIndicator({ status }: { status: WhatsAppDeliveryStatus }) {
  const meta = getWhatsAppDeliveryStatusMeta(status);

  if (status === 'received') return null;

  const icon =
    status === 'queued' ? (
      <Clock size={12} aria-hidden="true" />
    ) : status === 'sent' ? (
      <Check size={12} aria-hidden="true" />
    ) : status === 'delivered' ? (
      <CheckCheck size={12} aria-hidden="true" />
    ) : status === 'read' ? (
      <CheckCheck size={12} aria-hidden="true" />
    ) : (
      <AlertCircle size={12} aria-hidden="true" />
    );

  const isFailed = status === 'failed';
  const color = status === 'read' ? 'accent' : isFailed ? 'inherit' : 'secondary';

  return (
    <Tooltip content={meta.label} placement="above" hasHoverIndication={false}>
      <Text
        as="span"
        color={color}
        aria-label={meta.label}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          color: isFailed ? 'var(--color-text-error)' : undefined,
        }}
      >
        {icon}
      </Text>
    </Tooltip>
  );
}

export function WhatsAppMessageTimeline({
  messages,
  isLoading,
  retryingMessageId,
  nowMs,
  timezone,
  containerRef,
  onRetryMessage,
}: WhatsAppMessageTimelineProps) {
  const dayGroups = useMemo(
    () => groupWhatsAppMessagesByDate(messages, nowMs, timezone),
    [messages, nowMs, timezone],
  );

  return (
    <VStack
      ref={containerRef}
      as="section"
      aria-label="Historial de mensajes"
      className="ad-wa-timeline"
      gap={3}
    >
      {isLoading && messages.length === 0 ? (
        <VStack
          gap={3}
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label="Cargando historial de mensajes"
        >
          {TIMELINE_SKELETONS.map((idx) => (
            <HStack
              key={idx}
              justify={idx % 2 === 0 ? 'start' : 'end'}
              width="100%"
            >
              <SkeletonBlock
                width={idx % 2 === 0 ? '68%' : '56%'}
                height="4rem"
                radius={3}
                index={idx}
              />
            </HStack>
          ))}
        </VStack>
      ) : dayGroups.length === 0 ? (
        <VStack className="ad-card-empty-center" padding={4}>
          <EmptyStateCard
            framed={false}
            isCompact
            icon={<MessageCircle size={20} aria-hidden="true" />}
            title="Aún no hay mensajes en esta conversación"
            description="Envía un mensaje o una plantilla aprobada para iniciar el historial."
          />
        </VStack>
      ) : (
        dayGroups.map((group) => (
          <VStack key={group.dateKey} gap={2} style={{ minWidth: 0 }}>
            <HStack className="ad-wa-date-divider" justify="center" align="center">
              <Text type="supporting" color="secondary" weight="semibold">
                {group.label}
              </Text>
            </HStack>

            {group.messages.map((msg) => {
              const dir = resolveWhatsAppBubbleDirection(msg);
              const isFailed = msg.deliveryStatus === 'failed';
              const isRetrying = retryingMessageId === msg.id;
              const timeIso = msg.sentAt ?? msg.createdAt;
              const timeLabel = formatTimeInTimezone(timeIso, timezone, false);

              return (
                <HStack key={msg.id} className="ad-wa-bubble-row" data-dir={dir}>
                  <VStack
                    as="article"
                    className="ad-wa-bubble"
                    data-dir={dir}
                    data-failed={isFailed ? 'true' : undefined}
                    gap={1.5}
                  >
                    {dir === 'echo' ? (
                      <HStack gap={1} align="center">
                        <Smartphone size={12} aria-hidden="true" />
                        <Text type="supporting" color="secondary" weight="semibold">
                          Enviado desde celular
                        </Text>
                      </HStack>
                    ) : dir === 'bot' ? (
                      <HStack gap={1.5} align="center" wrap="wrap">
                        <HStack gap={1} align="center">
                          <Bot size={12} aria-hidden="true" />
                          <Text type="supporting" color="secondary" weight="semibold">
                            Automatización
                          </Text>
                        </HStack>
                        {msg.templateName ? (
                          <Token size="sm" label={msg.templateName} />
                        ) : null}
                      </HStack>
                    ) : dir === 'outbound' && msg.templateName ? (
                      <HStack gap={1.5} align="center" wrap="wrap">
                        <HStack gap={1} align="center">
                          <FileText size={12} aria-hidden="true" />
                          <Text type="supporting" color="secondary" weight="semibold">
                            Plantilla
                          </Text>
                        </HStack>
                        <Token size="sm" label={msg.templateName} />
                      </HStack>
                    ) : dir === 'outbound' && msg.senderName ? (
                      <Text type="supporting" color="secondary" weight="semibold">
                        {msg.senderName}
                      </Text>
                    ) : null}

                    <Text
                      size="sm"
                      textWrap="pretty"
                      style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                    >
                      {msg.bodyText}
                    </Text>

                    {isFailed ? (
                      <HStack
                        className="ad-wa-bubble-error"
                        justify="between"
                        align="center"
                        gap={2}
                        wrap="wrap"
                      >
                        <HStack gap={1.5} align="center" style={{ minWidth: 0, flex: '1 1 10rem' }}>
                          <Text
                            as="span"
                            color="inherit"
                            aria-hidden="true"
                            style={{ color: 'var(--color-text-error)', display: 'inline-flex' }}
                          >
                            <AlertCircle size={14} />
                          </Text>
                          <Text
                            type="supporting"
                            color="inherit"
                            weight="medium"
                            textWrap="pretty"
                            style={{ color: 'var(--color-text-error)' }}
                          >
                            {msg.errorMessage || 'No se pudo entregar este mensaje.'}
                          </Text>
                        </HStack>
                        <Button
                          type="button"
                          label={isRetrying ? 'Reintentando…' : 'Reintentar'}
                          variant="secondary"
                          size="sm"
                          icon={<RotateCcw size={13} aria-hidden="true" />}
                          isLoading={isRetrying}
                          isDisabled={Boolean(retryingMessageId)}
                          onClick={() => void onRetryMessage(msg.id)}
                        />
                      </HStack>
                    ) : null}

                    <HStack className="ad-wa-bubble-meta" justify="end" align="center" gap={1.5}>
                      {msg.deliveryMode === 'demo' ? (
                        <Text type="supporting" color="secondary">
                          Demo ·
                        </Text>
                      ) : null}
                      <Text type="supporting" color="secondary" hasTabularNumbers>
                        {timeLabel}
                      </Text>
                      {dir !== 'inbound' && dir !== 'system' ? (
                        <DeliveryStatusIndicator status={msg.deliveryStatus} />
                      ) : null}
                    </HStack>
                  </VStack>
                </HStack>
              );
            })}
          </VStack>
        ))
      )}
    </VStack>
  );
}
