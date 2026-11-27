'use client';

import { useState } from 'react';
import type { z } from 'zod';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { ArrowRight, CheckCircle2, Play, RefreshCw } from 'lucide-react';
import {
  EmptyStateCard,
  MetricGrid,
  SkeletonBlock,
  type MetricTileItem,
} from '@/components/ui';
import type {
  WhatsAppRemindersActionSchema,
  WhatsAppRemindersResponseDTO,
} from '@/lib/contracts';
import type { AdminRole } from '@/lib/types';
import { WhatsAppAutomationCards } from './WhatsAppAutomationCards';
import { WhatsAppReminderQueue } from './WhatsAppReminderQueue';

type WhatsAppRemindersActionInput = z.infer<typeof WhatsAppRemindersActionSchema>;
export type WhatsAppReminderFilter = 'pending' | 'sent' | 'failed' | 'canceled';

export interface WhatsAppRemindersTabProps {
  data: WhatsAppRemindersResponseDTO | null;
  isLoading: boolean;
  isSubmitting: boolean;
  role: AdminRole;
  studioName: string;
  initialFilter?: WhatsAppReminderFilter;
  onRunAction: (action: WhatsAppRemindersActionInput) => Promise<boolean>;
  onOpenChat: (phoneE164: string) => void;
  onRefresh: () => void;
}

export function WhatsAppRemindersTab({
  data,
  isLoading,
  isSubmitting,
  role,
  studioName,
  initialFilter,
  onRunAction,
  onOpenChat,
  onRefresh,
}: WhatsAppRemindersTabProps) {
  const [lastInitialFilter, setLastInitialFilter] = useState(initialFilter);
  const [activeFilter, setActiveFilter] = useState<WhatsAppReminderFilter>(
    initialFilter ?? 'pending',
  );
  const [runningDue, setRunningDue] = useState(false);

  if (lastInitialFilter !== initialFilter) {
    setLastInitialFilter(initialFilter);
    if (initialFilter) {
      setActiveFilter(initialFilter);
    }
  }

  if (isLoading && !data) {
    return (
      <VStack gap={4} role="status" aria-live="polite" aria-busy="true" aria-label="Cargando recordatorios">
        <SkeletonBlock width="100%" height="5.5rem" radius={3} index={0} />
        <SkeletonBlock width="100%" height="14rem" radius={3} index={1} />
        <SkeletonBlock width="100%" height="12rem" radius={3} index={2} />
      </VStack>
    );
  }

  if (!data) {
    return (
      <EmptyStateCard
        isCompact
        title="No pudimos cargar los recordatorios"
        description="Revisa tu conexión e intenta cargar la cola de automatizaciones de nuevo."
        actions={
          <Button
            type="button"
            label="Reintentar"
            variant="primary"
            size="sm"
            icon={<RefreshCw size={14} aria-hidden="true" />}
            onClick={onRefresh}
          />
        }
      />
    );
  }

  const isOwner = role === 'owner';
  const { metrics, outboxSummary } = data;
  const hasOutboxAttention = outboxSummary.failedCount > 0 || outboxSummary.pendingCount > 0;

  const kpiItems: MetricTileItem[] = [
    {
      id: 'wa-rem-pending',
      label: 'Programados',
      value: String(metrics.pendingCount),
      sub: 'Próximos avisos en cola',
    },
    {
      id: 'wa-rem-sent',
      label: 'Enviados',
      value: String(metrics.sentCount),
      sub: `${metrics.deliveredCount} entregados · ${metrics.readCount} leídos`,
      tone: 'success',
    },
    {
      id: 'wa-rem-failed',
      label: 'Con fallos',
      value: String(metrics.failedCount),
      sub: metrics.failedCount > 0 ? 'Listos para reintentar en 1 clic' : 'Sin errores activos',
      tone: metrics.failedCount > 0 ? 'warning' : 'default',
    },
    {
      id: 'wa-rem-cascade',
      label: 'Ahorro en cascada',
      value: String(metrics.skippedCascadeCount),
      sub: 'WhatsApps evitados al confirmar antes',
      tone: 'accent',
    },
  ];

  const handleRunDueNow = async () => {
    if (!isOwner || runningDue || isSubmitting) return;
    setRunningDue(true);
    try {
      await onRunAction({ action: 'run_due_now' });
    } finally {
      setRunningDue(false);
    }
  };

  return (
    <VStack gap={4} className="fx-step-in" style={{ minWidth: 0 }}>
      <MetricGrid ariaLabel="Métricas de recordatorios" cols={4} items={kpiItems} />

      {metrics.bookingsWithoutRemindersCount > 0 ? (
        <Banner
          status="warning"
          role="status"
          title={`${metrics.bookingsWithoutRemindersCount} ${metrics.bookingsWithoutRemindersCount === 1 ? 'cita próxima sin recordatorio programado' : 'citas próximas sin recordatorio programado'}`}
          description="Revisa tus citas activas o activa los flujos de 24 h y 2 h para asegurar la asistencia."
          endContent={
            <HStack gap={2} wrap="wrap">
              {isOwner ? (
                <Button
                  type="button"
                  label={runningDue ? 'Ejecutando…' : 'Ejecutar pendientes'}
                  variant="primary"
                  size="sm"
                  icon={<Play size={13} aria-hidden="true" />}
                  isLoading={runningDue}
                  isDisabled={runningDue || isSubmitting}
                  onClick={() => void handleRunDueNow()}
                />
              ) : null}
              <Button
                label="Ver en Agenda"
                variant="secondary"
                size="sm"
                href="/admin/citas"
                icon={<ArrowRight size={14} aria-hidden="true" />}
              />
            </HStack>
          }
        />
      ) : (
        <HStack className="ad-subpanel" gap={3} align="center" justify="between" wrap="wrap">
          <HStack gap={2} align="center" style={{ minWidth: 0 }}>
            <CheckCircle2 size={18} aria-hidden="true" />
            <VStack gap={0} style={{ minWidth: 0 }}>
              <Text weight="semibold" size="sm">
                Todas las citas próximas tienen recordatorio cubierto
              </Text>
              <Text type="supporting" color="secondary">
                Cascada inteligente activa: si una clienta confirma por correo o pago, omitimos el WhatsApp duplicado.
              </Text>
            </VStack>
          </HStack>
          <Button
            label="Ver Agenda"
            variant="ghost"
            size="sm"
            href="/admin/citas"
            icon={<ArrowRight size={14} aria-hidden="true" />}
          />
        </HStack>
      )}

      {hasOutboxAttention ? (
        <Banner
          status={outboxSummary.failedCount > 0 ? 'error' : 'info'}
          role={outboxSummary.failedCount > 0 ? 'alert' : 'status'}
          title={
            outboxSummary.failedCount > 0
              ? `Cola de eventos (Outbox) con ${outboxSummary.failedCount} ${outboxSummary.failedCount === 1 ? 'evento fallido' : 'eventos fallidos'}`
              : `Cola de eventos (Outbox): ${outboxSummary.pendingCount} ${outboxSummary.pendingCount === 1 ? 'evento pendiente' : 'eventos pendientes'}`
          }
          description={`Pendientes: ${outboxSummary.pendingCount} · En proceso: ${outboxSummary.processingCount} · Fallidos: ${outboxSummary.failedCount} · Procesados: ${outboxSummary.processedCount}.`}
          endContent={
            isOwner ? (
              <Button
                type="button"
                label={runningDue ? 'Procesando…' : 'Procesar cola ahora'}
                variant="secondary"
                size="sm"
                isLoading={runningDue}
                isDisabled={runningDue || isSubmitting}
                onClick={() => void handleRunDueNow()}
              />
            ) : undefined
          }
        />
      ) : null}

      <WhatsAppAutomationCards
        workflows={data.workflows}
        role={role}
        studioName={studioName}
        isSubmitting={isSubmitting}
        onRunAction={onRunAction}
      />

      <WhatsAppReminderQueue
        queue={data.queue}
        history={data.history}
        metrics={metrics}
        role={role}
        isSubmitting={isSubmitting}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        onRunAction={onRunAction}
        onOpenChat={onOpenChat}
        onRefresh={onRefresh}
      />
    </VStack>
  );
}
