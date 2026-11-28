'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { Calendar, ExternalLink } from 'lucide-react';
import { agendaHref } from '@/lib/admin-links';
import {
  formatCurrency,
  formatDateShortInTimezone,
  formatTimeInTimezone,
} from '@/lib/format';
import type { BookingWithRelations } from '@/lib/types';
import { ActionRow, BookingStatusTag, SurfaceCard } from '@/components/ui';

function isSafeInspoPhotoUrl(url: string | null): url is string {
  return Boolean(url && url.startsWith('/api/media/'));
}

interface InspoPreviewState {
  url: string;
  title: string;
  subtitle: string;
}

interface ClientVisitHistorySectionProps {
  clientId: string;
  visits: readonly BookingWithRelations[];
  tz: string;
  currency: 'MXN' | 'USD';
}

export function ClientVisitHistorySection({
  clientId,
  visits,
  tz,
  currency,
}: ClientVisitHistorySectionProps) {
  const [lastClientId, setLastClientId] = useState(clientId);
  const [showAllVisits, setShowAllVisits] = useState(false);
  const [previewInspo, setPreviewInspo] = useState<InspoPreviewState | null>(null);

  if (lastClientId !== clientId) {
    setLastClientId(clientId);
    setShowAllVisits(false);
    setPreviewInspo(null);
  }

  if (visits.length === 0) {
    return null;
  }

  const visibleVisits = showAllVisits ? visits : visits.slice(0, 5);

  return (
    <>
      <SurfaceCard
        title="Historial de visitas"
        headingLevel={3}
        icon={<Calendar size={15} aria-hidden="true" />}
        count={visits.length}
      >
        <VStack className="ad-row-list" gap={0}>
          {visibleVisits.map((visit) => {
            const inspoUrl = isSafeInspoPhotoUrl(visit.inspoPhotoUrl)
              ? visit.inspoPhotoUrl
              : null;
            return (
              <ActionRow
                key={visit.id}
                leading={
                  inspoUrl ? (
                    <button
                      type="button"
                      className="ad-inspo-thumb"
                      aria-label={`Ver foto de referencia de ${visit.service.name}`}
                      onClick={() =>
                        setPreviewInspo({
                          url: inspoUrl,
                          title: visit.service.name,
                          subtitle: `${formatDateShortInTimezone(visit.startAt, tz)} · ${visit.staff.name}`,
                        })
                      }
                    >
                      <img
                        src={inspoUrl}
                        alt={`Referencia de ${visit.service.name}`}
                        loading="lazy"
                      />
                    </button>
                  ) : undefined
                }
                title={visit.service.name}
                subtitle={`${formatDateShortInTimezone(visit.startAt, tz)} · ${formatTimeInTimezone(visit.startAt, tz)} con ${visit.staff.name}`}
                meta={`${formatCurrency(visit.totalPriceCents, currency)} · #${visit.bookingCode}`}
                status={
                  <BookingStatusTag
                    status={visit.status}
                    hasPaymentProof={Boolean(visit.paymentProofUrl)}
                  />
                }
                actions={
                  <Button
                    label="Agenda"
                    variant="ghost"
                    size="sm"
                    icon={<ExternalLink size={13} aria-hidden="true" />}
                    href={agendaHref({ q: visit.bookingCode })}
                  />
                }
              />
            );
          })}
        </VStack>
        {visits.length > 5 ? (
          <HStack justify="center" paddingBlock={2} paddingInline={3}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              label={showAllVisits ? 'Mostrar últimas 5' : `Ver todas (${visits.length})`}
              onClick={() => setShowAllVisits((prev) => !prev)}
            />
          </HStack>
        ) : null}
      </SurfaceCard>

      <Dialog
        isOpen={Boolean(previewInspo)}
        onOpenChange={(open) => {
          if (!open) setPreviewInspo(null);
        }}
        width="min(34rem, 96vw)"
        maxHeight="min(90dvh, calc(100dvh - 2rem))"
        padding={5}
      >
        <Layout
          header={
            <DialogHeader
              title={previewInspo?.title ?? 'Foto de referencia'}
              subtitle={previewInspo?.subtitle}
              hasDivider
              onOpenChange={(open) => {
                if (!open) setPreviewInspo(null);
              }}
            />
          }
          content={
            <LayoutContent>
              {previewInspo ? (
                <VStack gap={3} align="center">
                  <img
                    src={previewInspo.url}
                    alt={`Referencia de ${previewInspo.title}`}
                    className="ad-inspo-preview-img"
                  />
                </VStack>
              ) : null}
            </LayoutContent>
          }
          footer={
            previewInspo ? (
              <LayoutFooter hasDivider>
                <HStack justify="end" gap={2} wrap="wrap">
                  <Button
                    label="Abrir imagen"
                    variant="secondary"
                    size="md"
                    icon={<ExternalLink size={14} aria-hidden="true" />}
                    href={previewInspo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                  <Button
                    type="button"
                    label="Cerrar"
                    variant="primary"
                    size="md"
                    onClick={() => setPreviewInspo(null)}
                  />
                </HStack>
              </LayoutFooter>
            ) : undefined
          }
        />
      </Dialog>
    </>
  );
}
