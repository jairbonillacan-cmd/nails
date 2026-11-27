'use client';

import { useMemo } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Badge } from '@astryxdesign/core/Badge';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { TextInput } from '@astryxdesign/core/TextInput';
import {
  AlertCircle,
  Check,
  CheckCheck,
  Clock,
  MessageCircle,
  RefreshCw,
  Search,
  SquarePen,
} from 'lucide-react';
import type {
  WhatsAppInboxSummaryDTO,
  WhatsAppThreadSummaryDTO,
} from '@/lib/contracts';
import type { WhatsAppDeliveryStatus } from '@/lib/types';
import {
  EmptyStateCard,
  FilterPillBar,
  SkeletonBlock,
  type FilterPillOption,
} from '@/components/ui';
import {
  buildThreadFilterCounts,
  formatWhatsAppRelativeTime,
  formatWhatsAppWindowBadge,
  getWhatsAppThreadSnippetPrefix,
  type WhatsAppThreadFilter,
} from './whatsappUiHelpers';

interface WhatsAppThreadListProps {
  threads: readonly WhatsAppThreadSummaryDTO[];
  summary: WhatsAppInboxSummaryDTO | null;
  selectedThreadId: string | null;
  filter: WhatsAppThreadFilter;
  searchQuery: string;
  isLoading: boolean;
  nowMs: number;
  timezone: string;
  onFilterChange: (filter: WhatsAppThreadFilter) => void;
  onSearchChange: (query: string) => void;
  onSelectThread: (threadId: string) => void;
  onOpenNewChat: () => void;
  onRefresh: () => void;
}

const SKELETON_ROWS = [0, 1, 2, 3] as const;

function ThreadDeliveryTick({ status }: { status: WhatsAppDeliveryStatus | null }) {
  if (!status || status === 'received') return null;
  if (status === 'failed') {
    return (
      <Text
        as="span"
        color="inherit"
        aria-hidden="true"
        style={{ color: 'var(--color-text-error)', display: 'inline-flex' }}
      >
        <AlertCircle size={12} />
      </Text>
    );
  }
  if (status === 'read') {
    return (
      <Text as="span" color="accent" aria-hidden="true">
        <CheckCheck size={12} />
      </Text>
    );
  }
  if (status === 'delivered') {
    return (
      <Text as="span" color="secondary" aria-hidden="true">
        <CheckCheck size={12} />
      </Text>
    );
  }
  if (status === 'sent') {
    return (
      <Text as="span" color="secondary" aria-hidden="true">
        <Check size={12} />
      </Text>
    );
  }
  return (
    <Text as="span" color="secondary" aria-hidden="true">
      <Clock size={12} />
    </Text>
  );
}

export function WhatsAppThreadList({
  threads,
  summary,
  selectedThreadId,
  filter,
  searchQuery,
  isLoading,
  nowMs,
  timezone,
  onFilterChange,
  onSearchChange,
  onSelectThread,
  onOpenNewChat,
  onRefresh,
}: WhatsAppThreadListProps) {
  const counts = useMemo(
    () => buildThreadFilterCounts(summary, threads),
    [summary, threads],
  );

  const filterOptions: readonly FilterPillOption<WhatsAppThreadFilter>[] = useMemo(
    () => [
      {
        value: 'all',
        label: 'Todos',
        count: counts.all > 0 ? counts.all : undefined,
      },
      {
        value: 'unread',
        label: 'Sin leer',
        count: counts.unread > 0 ? counts.unread : undefined,
      },
      {
        value: 'window_open',
        label: 'Ventana 24 h',
        count: counts.windowOpen > 0 ? counts.windowOpen : undefined,
      },
      {
        value: 'failed',
        label: 'Con fallos',
        count: counts.failed > 0 ? counts.failed : undefined,
      },
    ],
    [counts],
  );

  const hasActiveFilter = filter !== 'all' || searchQuery.trim().length > 0;

  return (
    <VStack
      as="aside"
      className="ad-wa-sidebar"
      gap={0}
      aria-label="Lista de conversaciones de WhatsApp"
    >
      <VStack className="ad-wa-sidebar-head" gap={2}>
        <HStack justify="between" align="center" gap={2}>
          <HStack gap={1.5} align="center">
            <Heading level={2} className="ad-h3">
              Mensajes
            </Heading>
            {counts.unread > 0 ? (
              <Badge variant="red" label={String(counts.unread)} />
            ) : null}
          </HStack>
          <HStack gap={1} align="center">
            <IconButton
              type="button"
              label="Actualizar conversaciones"
              tooltip="Actualizar"
              variant="ghost"
              size="sm"
              icon={<RefreshCw size={14} aria-hidden="true" />}
              isLoading={isLoading}
              onClick={onRefresh}
            />
            <Button
              type="button"
              label="Nuevo"
              variant="primary"
              size="sm"
              icon={<SquarePen size={14} aria-hidden="true" />}
              onClick={onOpenNewChat}
            />
          </HStack>
        </HStack>

        <TextInput
          type="search"
          label="Buscar conversaciones"
          isLabelHidden
          placeholder="Buscar clienta, teléfono o mensaje…"
          startIcon={<Search size={14} aria-hidden="true" />}
          size="sm"
          hasClear
          value={searchQuery}
          onChange={onSearchChange}
        />

        <FilterPillBar
          ariaLabel="Filtrar conversaciones"
          mode="pills"
          size="sm"
          value={filter}
          options={filterOptions}
          onChange={onFilterChange}
        />
      </VStack>

      <VStack className="ad-wa-thread-list" gap={0}>
        {isLoading && threads.length === 0 ? (
          <VStack
            gap={2}
            padding={3}
            role="status"
            aria-live="polite"
            aria-busy="true"
            aria-label="Cargando conversaciones"
          >
            {SKELETON_ROWS.map((row) => (
              <HStack key={row} gap={2} align="center" padding={2}>
                <SkeletonBlock width="2.25rem" height="2.25rem" radius="rounded" index={row} />
                <VStack gap={1.5} style={{ flex: '1 1 0%', minWidth: 0 }}>
                  <SkeletonBlock width="62%" height="0.875rem" radius={1} index={row + 1} />
                  <SkeletonBlock width="84%" height="0.75rem" radius={1} index={row + 2} />
                </VStack>
              </HStack>
            ))}
          </VStack>
        ) : threads.length === 0 ? (
          <VStack padding={4}>
            <EmptyStateCard
              framed={false}
              isCompact
              icon={<MessageCircle size={20} aria-hidden="true" />}
              title={hasActiveFilter ? 'Sin conversaciones con este filtro' : 'Sin conversaciones todavía'}
              description={
                hasActiveFilter
                  ? 'Prueba con otro término o limpia los filtros activos.'
                  : 'Cuando recibas un mensaje o envíes un recordatorio aparecerá aquí.'
              }
              actions={
                <HStack gap={2} wrap="wrap" justify="center">
                  {hasActiveFilter ? (
                    <Button
                      type="button"
                      label="Ver todos"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        onFilterChange('all');
                        onSearchChange('');
                      }}
                    />
                  ) : null}
                  <Button
                    type="button"
                    label="Nuevo mensaje"
                    variant="primary"
                    size="sm"
                    icon={<SquarePen size={14} aria-hidden="true" />}
                    onClick={onOpenNewChat}
                  />
                </HStack>
              }
            />
          </VStack>
        ) : (
          <VStack as="ul" gap={0} role="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {threads.map((thread) => {
              const isSelected = thread.id === selectedThreadId;
              const isUnread = thread.unreadCount > 0;
              const windowMeta = formatWhatsAppWindowBadge(thread.serviceWindow, nowMs);
              const relativeTime = formatWhatsAppRelativeTime(
                thread.lastMessageAt,
                nowMs,
                timezone,
              );
              const snippetPrefix = getWhatsAppThreadSnippetPrefix(thread);
              const snippetText =
                thread.lastMessagePreview.trim() || 'Conversación iniciada';
              const showTick =
                thread.lastMessageDirection === 'outbound' ||
                thread.lastMessageDirection === 'echo';

              return (
                <li key={thread.id}>
                  <button
                    type="button"
                    className="ad-wa-thread-row fx-press"
                    data-active={isSelected ? 'true' : 'false'}
                    data-unread={isUnread ? 'true' : 'false'}
                    aria-current={isSelected ? 'true' : undefined}
                    onClick={() => onSelectThread(thread.id)}
                  >
                    <Avatar name={thread.contactName} size={36} tooltip={false} />
                    <VStack gap={0.5} style={{ flex: '1 1 0%', minWidth: 0 }}>
                      <HStack justify="between" align="center" gap={2} style={{ minWidth: 0 }}>
                        <Text
                          weight={isUnread ? 'bold' : 'semibold'}
                          size="sm"
                          maxLines={1}
                          style={{ flex: '1 1 0%', minWidth: 0 }}
                        >
                          {thread.contactName}
                        </Text>
                        {relativeTime ? (
                          <Text
                            type="supporting"
                            color={isUnread ? 'accent' : 'secondary'}
                            weight={isUnread ? 'semibold' : 'normal'}
                            className="ad-wa-thread-meta"
                            hasTabularNumbers
                          >
                            {relativeTime}
                          </Text>
                        ) : null}
                      </HStack>

                      <HStack justify="between" align="center" gap={2} style={{ minWidth: 0 }}>
                        <HStack
                          gap={1}
                          align="center"
                          className="ad-wa-thread-snippet"
                          style={{ flex: '1 1 0%', minWidth: 0 }}
                        >
                          {showTick ? (
                            <ThreadDeliveryTick status={thread.lastDeliveryStatus} />
                          ) : null}
                          <Text
                            type="supporting"
                            color={isUnread ? 'primary' : 'secondary'}
                            weight={isUnread ? 'medium' : 'normal'}
                            maxLines={1}
                          >
                            {snippetPrefix}
                            {snippetText}
                          </Text>
                        </HStack>

                        <HStack gap={1.5} align="center" style={{ flexShrink: 0 }}>
                          {thread.hasFailedMessages ? (
                            <StatusDot
                              variant="error"
                              label="Mensaje fallido en esta conversación"
                              tooltip="Contiene envíos fallidos"
                            />
                          ) : windowMeta.isOpen ? (
                            <StatusDot
                              variant="success"
                              label={windowMeta.label}
                              tooltip={windowMeta.label}
                            />
                          ) : null}
                          {isUnread ? (
                            <Badge variant="red" label={String(thread.unreadCount)} />
                          ) : null}
                        </HStack>
                      </HStack>
                    </VStack>
                  </button>
                </li>
              );
            })}
          </VStack>
        )}
      </VStack>
    </VStack>
  );
}
