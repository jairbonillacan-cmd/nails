'use client';

import { useMemo, useState } from 'react';
import type { z } from 'zod';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Table } from '@astryxdesign/core/Table';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Token } from '@astryxdesign/core/Token';
import {
  Bell,
  MessageCircle,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  X,
} from 'lucide-react';
import {
  ConfirmActionDialog,
  EmptyStateCard,
  FilterPillBar,
  StatusTag,
  SurfaceCard,
  type FilterPillOption,
  type StatusTagTone,
} from '@/components/ui';
import type {
  WhatsAppReminderItemDTO,
  WhatsAppRemindersActionSchema,
  WhatsAppRemindersResponseDTO,
} from '@/lib/contracts';
import {
  formatDateShortInTimezone,
  formatPhoneDisplay,
  formatTimeInTimezone,
} from '@/lib/format';
import { getWhatsAppTemplateCatalogItem } from '@/lib/notifications/whatsapp-inbox';
import type { AdminRole, NotificationChannel } from '@/lib/types';

type WhatsAppRemindersActionInput = z.infer<typeof WhatsAppRemindersActionSchema>;
type QueueFilterStatus = 'pending' | 'sent' | 'failed' | 'canceled';

interface WhatsAppReminderQueueProps {
  queue: WhatsAppReminderItemDTO[];
  history: WhatsAppReminderItemDTO[];
  metrics: WhatsAppRemindersResponseDTO['metrics'];
  role: AdminRole;
  timezone?: string;
  isSubmitting: boolean;
  activeFilter: QueueFilterStatus;
  onFilterChange: (next: QueueFilterStatus) => void;
  onRunAction: (action: WhatsAppRemindersActionInput) => Promise<boolean>;
  onOpenChat: (phoneE164: string) => void;
  onRefresh: () => void;
}

const DEFAULT_TIMEZONE = 'America/Mexico_City';

function channelMeta(channel: NotificationChannel): { label: string; tone: StatusTagTone } {
  if (channel === 'whatsapp') return { label: 'WhatsApp', tone: 'success' };
  if (channel === 'sms') return { label: 'SMS', tone: 'info' };
  return { label: 'Correo', tone: 'neutral' };
}

function deliveryStatusMeta(item: WhatsAppReminderItemDTO): {
  label: string;
  tone: StatusTagTone;
} {
  if (item.status === 'canceled') return { label: 'Cancelado', tone: 'neutral' };
  if (item.status === 'failed' || item.deliveryStatus === 'failed') {
    return { label: 'Fallido', tone: 'danger' };
  }
  if (item.deliveryStatus === 'read') return { label: 'Leído', tone: 'success' };
  if (item.deliveryStatus === 'delivered') return { label: 'Entregado', tone: 'success' };
  if (item.status === 'sent' || item.deliveryStatus === 'sent') {
    return { label: 'Enviado', tone: 'info' };
  }
  return { label: 'Programado', tone: 'warning' };
}

function resolveReminderTitle(item: WhatsAppReminderItemDTO): string {
  if (item.workflowName?.trim()) return item.workflowName;
  if (item.triggerKey) return getWhatsAppTemplateCatalogItem(item.triggerKey).friendlyTitle;
  return item.subject || 'Recordatorio automático';
}

function formatTimestampLabel(iso: string | null, timezone: string): string {
  if (!iso) return '—';
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return '—';
  return `${formatDateShortInTimezone(iso, timezone)} · ${formatTimeInTimezone(iso, timezone)}`;
}

function emptyStateCopy(filter: QueueFilterStatus): { title: string; description: string } {
  switch (filter) {
    case 'pending':
      return {
        title: 'Sin recordatorios programados',
        description: 'Cuando se agenden nuevas citas, sus recordatorios 24 h, 2 h y de retoque aparecerán aquí.',
      };
    case 'sent':
      return {
        title: 'Aún no hay envíos registrados',
        description: 'Aquí verás el historial de recordatorios enviados con su estado de entrega y lectura.',
      };
    case 'failed':
      return {
        title: 'Sin envíos fallidos',
        description: 'Todos los avisos recientes se entregaron correctamente sin errores pendientes.',
      };
    case 'canceled':
      return {
        title: 'Sin avisos cancelados',
        description: 'Los recordatorios cancelados manualmente o por cancelación de cita aparecerán aquí.',
      };
  }
}

export function WhatsAppReminderQueue({
  queue,
  history,
  metrics,
  role,
  timezone = DEFAULT_TIMEZONE,
  isSubmitting,
  activeFilter,
  onFilterChange,
  onRunAction,
  onOpenChat,
  onRefresh,
}: WhatsAppReminderQueueProps) {
  const [search, setSearch] = useState('');
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [runningDue, setRunningDue] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<WhatsAppReminderItemDTO | null>(null);

  const isOwner = role === 'owner';

  const allItems = useMemo(() => {
    const byId = new Map<string, WhatsAppReminderItemDTO>();
    for (const item of history) {
      byId.set(item.id, item);
    }
    for (const item of queue) {
      byId.set(item.id, item);
    }
    return Array.from(byId.values());
  }, [queue, history]);

  const filterOptions: FilterPillOption<QueueFilterStatus>[] = [
    { value: 'pending', label: 'Programados', count: metrics.pendingCount },
    { value: 'sent', label: 'Enviados', count: metrics.sentCount },
    { value: 'failed', label: 'Fallidos', count: metrics.failedCount },
    { value: 'canceled', label: 'Cancelados', count: metrics.canceledCount },
  ];

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = search.replace(/\D/g, '');

    const matching = allItems.filter((item) => {
      if (item.status !== activeFilter) return false;
      if (!q) return true;
      const haystack = `${item.clientName ?? ''} ${item.recipient} ${item.bookingCode ?? ''} ${item.serviceName ?? ''} ${resolveReminderTitle(item)} ${item.previewText}`.toLowerCase();
      if (haystack.includes(q)) return true;
      if (digits.length >= 3 && item.recipient.replace(/\D/g, '').includes(digits)) return true;
      return false;
    });

    if (activeFilter === 'pending') {
      return matching.toSorted(
        (a, b) => Date.parse(a.scheduledFor) - Date.parse(b.scheduledFor),
      );
    }

    return matching.toSorted((a, b) => {
      const tsA = Date.parse(a.sentAt ?? a.lastAttemptAt ?? a.scheduledFor) || 0;
      const tsB = Date.parse(b.sentAt ?? b.lastAttemptAt ?? b.scheduledFor) || 0;
      return tsB - tsA;
    });
  }, [allItems, activeFilter, search]);

  const tableRows: Array<{ id: string; item: WhatsAppReminderItemDTO }> = useMemo(
    () => filteredRows.map((item) => ({ id: item.id, item })),
    [filteredRows],
  );

  const handleRowAction = async (
    notificationId: string,
    action: 'retry_notification' | 'trigger_now' | 'cancel_notification',
  ) => {
    if (busyItemId || isSubmitting) return;
    setBusyItemId(notificationId);
    try {
      const ok = await onRunAction({ action, notificationId });
      if (ok && action === 'cancel_notification') {
        setCancelTarget(null);
      }
    } finally {
      setBusyItemId(null);
    }
  };

  const handleRunDueNow = async () => {
    if (!isOwner || runningDue || isSubmitting) return;
    setRunningDue(true);
    try {
      await onRunAction({ action: 'run_due_now' });
    } finally {
      setRunningDue(false);
    }
  };

  const emptyMeta = emptyStateCopy(activeFilter);

  return (
    <>
      <SurfaceCard
        id="wa-reminders-queue-heading"
        icon={<Bell size={17} aria-hidden="true" />}
        title="Cola programada e historial de envíos"
        subtitle="Revisa qué recordatorios están por salir, confirma entregas o reintenta fallos en 1 clic."
        count={filteredRows.length}
        actions={
          <HStack gap={2} align="center" wrap="wrap">
            {isOwner ? (
              <Button
                type="button"
                label={runningDue ? 'Ejecutando…' : 'Ejecutar pendientes ahora'}
                variant="primary"
                size="sm"
                icon={<Play size={13} aria-hidden="true" />}
                isLoading={runningDue}
                isDisabled={runningDue || isSubmitting}
                onClick={() => void handleRunDueNow()}
              />
            ) : null}
            <Button
              type="button"
              label="Actualizar"
              variant="secondary"
              size="sm"
              icon={<RefreshCw size={13} aria-hidden="true" />}
              isDisabled={isSubmitting}
              onClick={onRefresh}
            />
          </HStack>
        }
      >
        <HStack className="ad-toolbar" justify="between" align="center" wrap="wrap" gap={3}>
          <FilterPillBar
            ariaLabel="Filtrar cola de recordatorios"
            mode="pills"
            size="sm"
            value={activeFilter}
            options={filterOptions}
            onChange={onFilterChange}
          />
          <TextInput
            type="search"
            label="Buscar en recordatorios"
            isLabelHidden
            placeholder="Buscar clienta, teléfono o código NL-…"
            startIcon={<Search size={14} aria-hidden="true" />}
            size="sm"
            width="min(18rem, 100%)"
            hasClear
            value={search}
            onChange={setSearch}
          />
        </HStack>

        {filteredRows.length === 0 ? (
          <VStack padding={5}>
            <EmptyStateCard
              framed={false}
              isCompact
              icon={<Bell size={20} aria-hidden="true" />}
              title={search.trim() ? 'Sin coincidencias en este filtro' : emptyMeta.title}
              description={
                search.trim()
                  ? `No encontramos recordatorios para «${search.trim()}».`
                  : emptyMeta.description
              }
              actions={
                search.trim() ? (
                  <Button
                    type="button"
                    label="Limpiar búsqueda"
                    variant="secondary"
                    size="sm"
                    onClick={() => setSearch('')}
                  />
                ) : undefined
              }
            />
          </VStack>
        ) : (
          <VStack className="ad-table-scroll" gap={0}>
            <Table
              idKey="id"
              hasHover
              data={tableRows}
              columns={[
                {
                  key: 'client',
                  header: 'Clienta y cita',
                  renderCell: ({ item: row }) => (
                    <VStack gap={0.5} style={{ minWidth: 0 }}>
                      <HStack gap={1.5} align="center" wrap="wrap">
                        <Text weight="semibold" size="sm">
                          {row.clientName || 'Clienta'}
                        </Text>
                        {row.bookingCode ? <Token size="sm" label={row.bookingCode} /> : null}
                      </HStack>
                      <Text type="supporting" color="secondary" size="sm" hasTabularNumbers>
                        {row.channel === 'email'
                          ? row.recipient
                          : formatPhoneDisplay(row.recipient)}
                      </Text>
                      {row.serviceName ? (
                        <Text type="supporting" color="secondary" size="sm">
                          {row.serviceName}
                          {row.staffName ? ` · ${row.staffName}` : ''}
                        </Text>
                      ) : null}
                    </VStack>
                  ),
                },
                {
                  key: 'workflow',
                  header: 'Aviso y canal',
                  renderCell: ({ item: row }) => {
                    const ch = channelMeta(row.channel);
                    return (
                      <VStack gap={1} style={{ minWidth: 0, maxWidth: '22rem' }}>
                        <HStack gap={1.5} align="center" wrap="wrap">
                          <Text weight="medium" size="sm">
                            {resolveReminderTitle(row)}
                          </Text>
                          <StatusTag tone={ch.tone} label={ch.label} />
                        </HStack>
                        <Text type="supporting" color="secondary" size="sm" maxLines={2}>
                          {row.previewText || row.bodyText}
                        </Text>
                      </VStack>
                    );
                  },
                },
                {
                  key: 'timing',
                  header: activeFilter === 'pending' ? 'Programado' : 'Fecha',
                  renderCell: ({ item: row }) => (
                    <VStack gap={0.5}>
                      <Text size="sm" weight="medium" hasTabularNumbers>
                        {formatTimestampLabel(
                          activeFilter === 'pending'
                            ? row.scheduledFor
                            : (row.sentAt ?? row.lastAttemptAt ?? row.scheduledFor),
                          timezone,
                        )}
                      </Text>
                      {row.status === 'failed' && row.nextRetryAt ? (
                        <Text type="supporting" color="secondary" size="sm" hasTabularNumbers>
                          Próximo intento: {formatTimestampLabel(row.nextRetryAt, timezone)}
                        </Text>
                      ) : null}
                    </VStack>
                  ),
                },
                {
                  key: 'status',
                  header: 'Estado',
                  renderCell: ({ item: row }) => {
                    const statusBadge = deliveryStatusMeta(row);
                    return (
                      <VStack gap={1} style={{ maxWidth: '16rem' }}>
                        <HStack gap={1.5} align="center" wrap="wrap">
                          <StatusTag tone={statusBadge.tone} showDot label={statusBadge.label} />
                          {row.attempts > 0 ? (
                            <Text type="supporting" color="secondary" size="sm" hasTabularNumbers>
                              Intento {row.attempts}/{row.maxAttempts}
                            </Text>
                          ) : null}
                        </HStack>
                        {row.errorMessage ? (
                          <Text
                            type="supporting"
                            size="sm"
                            maxLines={2}
                            style={{ color: 'var(--color-text-error)' }}
                          >
                            {row.errorMessage}
                          </Text>
                        ) : null}
                      </VStack>
                    );
                  },
                },
                {
                  key: 'actions',
                  header: 'Acciones',
                  align: 'end',
                  renderCell: ({ item: row }) => {
                    const isBusy = busyItemId === row.id;
                    const canOpenChat = row.channel !== 'email' && row.recipient.replace(/\D/g, '').length >= 8;
                    return (
                      <HStack gap={1.5} justify="end" align="center" wrap="wrap">
                        {row.status === 'failed' ? (
                          <Button
                            type="button"
                            label={isBusy ? 'Reintentando…' : 'Reintentar'}
                            variant="primary"
                            size="sm"
                            icon={<RotateCcw size={13} aria-hidden="true" />}
                            isLoading={isBusy}
                            isDisabled={isBusy || isSubmitting}
                            onClick={() => void handleRowAction(row.id, 'retry_notification')}
                          />
                        ) : null}

                        {row.status === 'pending' ? (
                          <>
                            <Button
                              type="button"
                              label={isBusy ? 'Enviando…' : 'Enviar ahora'}
                              variant="primary"
                              size="sm"
                              icon={<Send size={13} aria-hidden="true" />}
                              isLoading={isBusy}
                              isDisabled={isBusy || isSubmitting}
                              onClick={() => void handleRowAction(row.id, 'trigger_now')}
                            />
                            <Button
                              type="button"
                              label="Cancelar"
                              variant="ghost"
                              size="sm"
                              icon={<X size={13} aria-hidden="true" />}
                              isDisabled={isBusy || isSubmitting}
                              onClick={() => setCancelTarget(row)}
                            />
                          </>
                        ) : null}

                        {canOpenChat ? (
                          <Button
                            type="button"
                            label="Ver en chat"
                            variant="secondary"
                            size="sm"
                            icon={<MessageCircle size={13} aria-hidden="true" />}
                            onClick={() => onOpenChat(row.recipient)}
                          />
                        ) : null}
                      </HStack>
                    );
                  },
                },
              ]}
            />
          </VStack>
        )}
      </SurfaceCard>

      {cancelTarget ? (
        <ConfirmActionDialog
          isOpen
          onOpenChange={(open) => {
            if (!open && busyItemId !== cancelTarget.id) {
              setCancelTarget(null);
            }
          }}
          title={`¿Cancelar el recordatorio para ${cancelTarget.clientName || 'esta clienta'}?`}
          description={`Se cancelará "${resolveReminderTitle(cancelTarget)}" programado para ${formatTimestampLabel(cancelTarget.scheduledFor, timezone)}. La cita en la agenda no se modificará.`}
          confirmLabel="Sí, cancelar recordatorio"
          cancelLabel="Volver"
          variant="destructive"
          isLoading={busyItemId === cancelTarget.id}
          onConfirm={() => void handleRowAction(cancelTarget.id, 'cancel_notification')}
        />
      ) : null}
    </>
  );
}
