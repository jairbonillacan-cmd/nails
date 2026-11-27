'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { CalendarPlus, Check, MessageCircle, X } from 'lucide-react';
import {
  ActionRow,
  ConfirmActionDialog,
  EmptyStateCard,
  StatusTag,
  SurfaceCard,
  WaitlistStatusTag,
} from '@/components/ui';
import { whatsappHref } from '@/lib/admin-links';
import type { Service, WaitlistEntry } from '@/lib/types';
import { buildWhatsAppLink, formatDateKeyDisplay, formatPhoneDisplay } from '@/lib/format';
import { roleCanAccess } from '@/lib/rbac';
import { useAdminData } from '../AdminProvider';

const WAITLIST_WINDOW_LABELS: Record<WaitlistEntry['preferredWindow'], string> = {
  morning: 'Mañana',
  afternoon: 'Tarde',
  any: 'Cualquier horario',
};

interface WaitlistPanelProps {
  waitlist: WaitlistEntry[];
  services: Service[];
  salonName: string;
  onStatusUpdated: (message: string) => Promise<void>;
  onBookEntry: (entry: WaitlistEntry) => void;
}

export function WaitlistPanel({
  waitlist,
  services,
  salonName,
  onStatusUpdated,
  onBookEntry,
}: WaitlistPanelProps) {
  const { data: adminData } = useAdminData();
  const canOpenWhatsAppInbox = Boolean(
    adminData && roleCanAccess(adminData.session.user.role, 'whatsapp'),
  );
  const [busyEntry, setBusyEntry] = useState<{
    id: string;
    status: WaitlistEntry['status'];
  } | null>(null);
  const [confirmCancelEntry, setConfirmCancelEntry] = useState<WaitlistEntry | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleUpdateWaitlistStatus = async (
    waitlistId: string,
    status: WaitlistEntry['status'],
    successMessage: string,
  ) => {
    if (busyEntry?.id === waitlistId) return;
    setBusyEntry({ id: waitlistId, status });
    setErrorMessage(null);
    try {
      const res = await fetch('/api/admin/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'waitlist',
          id: waitlistId,
          status,
        }),
      });
      if (res.ok) {
        setConfirmCancelEntry(null);
        await onStatusUpdated(successMessage);
      } else {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setErrorMessage(
          json?.error || 'No se pudo actualizar la lista de espera. Inténtalo de nuevo.',
        );
      }
    } catch {
      setErrorMessage(
        'Error de conexión al actualizar la lista de espera. Revisa tu conexión e inténtalo de nuevo.',
      );
    } finally {
      setBusyEntry(null);
    }
  };

  return (
    <SurfaceCard
      title="Lista de espera"
      headingLevel={2}
      actions={
        <StatusTag
          label={`${waitlist.length} ${waitlist.length === 1 ? 'clienta' : 'clientas'}`}
          tone="neutral"
          hasTabularNumbers
        />
      }
    >
      {errorMessage ? (
        <VStack paddingInline={5} paddingBlockStart={3} gap={0}>
          <Banner
            status="error"
            role="alert"
            title={errorMessage}
            isDismissable
            onDismiss={() => setErrorMessage(null)}
          />
        </VStack>
      ) : null}
      {waitlist.length === 0 ? (
        <EmptyStateCard
          framed={false}
          isCompact
          title="Sin personas en lista de espera"
          description="Cuando un día esté lleno, tus clientas podrán apuntarse desde tu página de reservas."
          actions={
            <Button
              label="Ver página de reservas"
              variant="secondary"
              size="sm"
              href="/reservar"
              target="_blank"
              rel="noopener noreferrer"
            />
          }
        />
      ) : (
        <VStack className="ad-row-list" gap={0}>
          {waitlist.map((w) => {
            const srv = services.find((s) => s.id === w.serviceId);
            const isBusy = busyEntry?.id === w.id;
            const isActive = w.status === 'waiting' || w.status === 'notified';
            const waHref = buildWhatsAppLink(
              w.clientPhoneE164,
              `Hola ${w.clientName}, se abrió un lugar en ${salonName} para ${srv?.name || 'tu servicio'} el ${formatDateKeyDisplay(w.desiredDate)}. ¿Te gustaría agendarlo?`,
            );
            return (
              <ActionRow
                key={w.id}
                className={isBusy ? 'fx-busy' : undefined}
                isMuted={!isActive}
                title={
                  <HStack gap={2} align="center" wrap="wrap">
                    <Text weight="semibold">{w.clientName}</Text>
                    <WaitlistStatusTag status={w.status} />
                  </HStack>
                }
                subtitle={w.notes || undefined}
                meta={`${srv?.name ?? 'Servicio'} · Quiere el ${formatDateKeyDisplay(w.desiredDate, 'short')} (${
                  WAITLIST_WINDOW_LABELS[w.preferredWindow]
                }) · ${formatPhoneDisplay(w.clientPhoneE164)}`}
                actions={
                  <HStack gap={1.5} wrap="wrap" align="center">
                    {isActive ? (
                      <>
                        <Button
                          type="button"
                          label="Agendar"
                          variant="secondary"
                          size="sm"
                          icon={<CalendarPlus size={14} aria-hidden="true" />}
                          isDisabled={isBusy}
                          onClick={() => onBookEntry(w)}
                        />
                        <Button
                          label={
                            isBusy && busyEntry?.status === 'notified'
                              ? 'Marcando…'
                              : 'Avisar por WhatsApp'
                          }
                          variant="primary"
                          size="sm"
                          icon={<MessageCircle size={14} aria-hidden="true" />}
                          isLoading={isBusy && busyEntry?.status === 'notified'}
                          isDisabled={isBusy}
                          href={waHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() =>
                            void handleUpdateWaitlistStatus(
                              w.id,
                              'notified',
                              'Clienta marcada como avisada',
                            )
                          }
                        />
                        {canOpenWhatsAppInbox ? (
                          <Button
                            label="Abrir chat"
                            variant="secondary"
                            size="sm"
                            icon={<MessageCircle size={14} aria-hidden="true" />}
                            href={whatsappHref({ phone: w.clientPhoneE164 })}
                          />
                        ) : null}
                        <Button
                          type="button"
                          label="Ya agendó"
                          variant="ghost"
                          size="sm"
                          icon={<Check size={14} aria-hidden="true" />}
                          isLoading={isBusy && busyEntry?.status === 'booked'}
                          isDisabled={isBusy}
                          onClick={() =>
                            void handleUpdateWaitlistStatus(
                              w.id,
                              'booked',
                              'Marcada como agendada',
                            )
                          }
                        />
                        <Button
                          type="button"
                          label="Quitar"
                          variant="ghost"
                          size="sm"
                          icon={<X size={14} aria-hidden="true" />}
                          isDisabled={isBusy}
                          onClick={() => setConfirmCancelEntry(w)}
                        />
                      </>
                    ) : (
                      <Button
                        type="button"
                        label="Agendar de nuevo"
                        variant="ghost"
                        size="sm"
                        icon={<CalendarPlus size={14} aria-hidden="true" />}
                        onClick={() => onBookEntry(w)}
                      />
                    )}
                  </HStack>
                }
              />
            );
          })}
        </VStack>
      )}

      {confirmCancelEntry ? (
        <ConfirmActionDialog
          isOpen
          onOpenChange={(open) => {
            if (!open && !busyEntry) setConfirmCancelEntry(null);
          }}
          title={`¿Quitar a ${confirmCancelEntry.clientName} de la lista de espera?`}
          description="Quedará marcada como vencida y ya no aparecerá en tus pendientes del día."
          confirmLabel="Sí, quitar"
          cancelLabel="Volver"
          variant="destructive"
          isLoading={busyEntry?.id === confirmCancelEntry.id}
          onConfirm={() =>
            void handleUpdateWaitlistStatus(
              confirmCancelEntry.id,
              'expired',
              'Clienta quitada de la lista de espera',
            )
          }
        />
      ) : null}
    </SurfaceCard>
  );
}
