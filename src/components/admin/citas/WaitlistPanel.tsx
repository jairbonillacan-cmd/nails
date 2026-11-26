'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { MessageCircle } from 'lucide-react';
import {
  ActionRow,
  EmptyStateCard,
  StatusTag,
  SurfaceCard,
  WaitlistStatusTag,
} from '@/components/ui';
import type { Service, WaitlistEntry } from '@/lib/types';
import { buildWhatsAppLink } from '@/lib/format';

const WAITLIST_WINDOW_LABELS: Record<WaitlistEntry['preferredWindow'], string> = {
  morning: 'Mañana',
  afternoon: 'Tarde',
  any: 'Cualquier horario',
};

interface WaitlistPanelProps {
  waitlist: WaitlistEntry[];
  services: Service[];
  salonName: string;
  onNotified: () => Promise<void>;
}

export function WaitlistPanel({
  waitlist,
  services,
  salonName,
  onNotified,
}: WaitlistPanelProps) {
  const [notifyingId, setNotifyingId] = useState<string | null>(null);

  const handleNotifyWaitlist = async (waitlistId: string) => {
    if (notifyingId === waitlistId) return;
    setNotifyingId(waitlistId);
    try {
      const res = await fetch('/api/admin/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'waitlist',
          id: waitlistId,
          status: 'notified',
        }),
      });
      if (res.ok) {
        await onNotified();
      }
    } finally {
      setNotifyingId(null);
    }
  };

  return (
    <SurfaceCard
      title="Lista de espera"
      headingLevel={2}
      className="fx-step-in"
      actions={
        <StatusTag
          label={`${waitlist.length} ${waitlist.length === 1 ? 'clienta' : 'clientas'}`}
          tone="neutral"
          hasTabularNumbers
        />
      }
    >
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
        <VStack className="ad-row-list fx-stagger" gap={0}>
          {waitlist.map((w) => {
            const srv = services.find((s) => s.id === w.serviceId);
            const isBusy = notifyingId === w.id;
            const waHref = buildWhatsAppLink(
              w.clientPhoneE164,
              `Hola ${w.clientName}, se abrió un lugar en ${salonName} para ${srv?.name || 'tu servicio'} el ${w.desiredDate}. ¿Te gustaría agendarlo?`,
            );
            return (
              <ActionRow
                key={w.id}
                className={isBusy ? 'fx-busy' : undefined}
                title={
                  <HStack gap={2} align="center" wrap="wrap">
                    <Text weight="semibold">{w.clientName}</Text>
                    <WaitlistStatusTag status={w.status} />
                  </HStack>
                }
                subtitle={w.notes || undefined}
                meta={`${srv?.name ?? 'Servicio'} · Día deseado: ${w.desiredDate} (${
                  WAITLIST_WINDOW_LABELS[w.preferredWindow]
                }) · ${w.clientPhoneE164}`}
                actions={
                  <Button
                    label={isBusy ? 'Marcando...' : 'Avisar por WhatsApp'}
                    variant="primary"
                    size="sm"
                    icon={<MessageCircle size={14} aria-hidden="true" />}
                    isLoading={isBusy}
                    isDisabled={isBusy}
                    href={waHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => void handleNotifyWaitlist(w.id)}
                  />
                }
              />
            );
          })}
        </VStack>
      )}
    </SurfaceCard>
  );
}
