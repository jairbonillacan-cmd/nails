'use client';

import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Link } from '@astryxdesign/core/Link';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import {
  AlertTriangle,
  Award,
  Calendar,
  Download,
  MessageCircle,
  Shield,
} from 'lucide-react';
import {
  buildWhatsAppLink,
  formatDateShortInTimezone,
  formatTimeInTimezone,
  formatPhoneDisplay,
} from '@/lib/format';
import type { computeClientLoyaltySummary } from '@/lib/loyalty/stamps';
import type { BookingWithRelations, ClientProfile, ServicePackage } from '@/lib/types';
import { ActionRow, BookingStatusTag, StatusTag, SurfaceCard } from '@/components/ui';
import type { ClientNoShowStats } from './clientasActions';
import {
  formatInstagramDisplay,
  formatInstagramUrl,
  type ClientPackageRow,
} from './clientasTypes';
import { ClientProfilePackagesSection } from './ClientProfilePackagesSection';

type LoyaltySummary = ReturnType<typeof computeClientLoyaltySummary>;

interface ClientProfileDialogProps {
  client: ClientProfile | null;
  onClose: () => void;
  salonName: string;
  tz: string;
  noShowThreshold: number;
  noShowStats: ClientNoShowStats | null;
  canManageClients: boolean;
  loyalty: LoyaltySummary | null;
  clientPackages: readonly ClientPackageRow[];
  activeCatalogPackages: readonly ServicePackage[];
  bookings: readonly BookingWithRelations[];
  assigningPkg: boolean;
  redeemingPkgId: string | null;
  onSaveClient: (input: {
    clientId: string;
    notes: string;
    birthday: string | null;
    email: string | null;
    instagramHandle: string | null;
  }) => Promise<string | null>;
  onAssignPackage: (
    targetClientId: string,
    targetPackageId: string,
    notesText: string,
  ) => Promise<boolean>;
  onRedeemPackageSession: (pkg: ClientPackageRow) => Promise<void>;
}

export function ClientProfileDialog({
  client,
  onClose,
  salonName,
  tz,
  noShowThreshold,
  noShowStats,
  canManageClients,
  loyalty,
  clientPackages,
  activeCatalogPackages,
  bookings,
  assigningPkg,
  redeemingPkgId,
  onSaveClient,
  onAssignPackage,
  onRedeemPackageSession,
}: ClientProfileDialogProps) {
  const [notesDraft, setNotesDraft] = useState(client?.notes ?? '');
  const [birthdayDraft, setBirthdayDraft] = useState(client?.birthday ?? '');
  const [emailDraft, setEmailDraft] = useState(client?.email ?? '');
  const [instagramDraft, setInstagramDraft] = useState(client?.instagramHandle ?? '');
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const clientVisits = useMemo(() => {
    if (!client) return [];
    return bookings
      .filter((b) => b.clientId === client.id)
      .toSorted((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
  }, [bookings, client]);

  const nonCanceledCount = clientVisits.filter((v) => v.status !== 'canceled').length;

  const handleSave = async () => {
    if (!client || savingEdit) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      const errorText = await onSaveClient({
        clientId: client.id,
        notes: notesDraft,
        birthday: birthdayDraft.trim() || null,
        email: emailDraft.trim() || null,
        instagramHandle: instagramDraft.trim() || null,
      });
      if (errorText) setEditError(errorText);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  return (
    <Dialog isOpen={Boolean(client)} onOpenChange={handleOpenChange} width={540} padding={5}>
      <DialogHeader title="Ficha de clienta" onOpenChange={handleOpenChange} />
      {client ? (
        <VStack gap={4} paddingBlockStart={3} className="fx-sheet-in">
          <HStack className="ad-contact-head" justify="between" align="center" wrap="wrap" gap={3}>
            <HStack gap={3} align="center" className="rb-grow">
              <Avatar name={client.fullName} size="lg" />
              <VStack gap={0.5} className="rb-grow">
                <Heading level={3} className="lk-serif ad-h3">
                  {client.fullName}
                </Heading>
                <Text type="supporting" color="secondary" hasTabularNumbers>
                  {formatPhoneDisplay(client.phoneE164)}
                </Text>
                <HStack gap={2} wrap="wrap" align="center">
                  {client.instagramHandle ? (
                    <Link
                      href={formatInstagramUrl(client.instagramHandle)}
                      isExternalLink
                      type="supporting"
                    >
                      {formatInstagramDisplay(client.instagramHandle)}
                    </Link>
                  ) : null}
                  <StatusTag
                    tone="neutral"
                    hasTabularNumbers
                    label={`${nonCanceledCount} ${nonCanceledCount === 1 ? 'visita' : 'visitas'}`}
                  />
                  {noShowStats && noShowStats.noShowCount > 0 ? (
                    <StatusTag
                      tone={noShowStats.noShowCount >= noShowThreshold ? 'warning' : 'neutral'}
                      hasTabularNumbers
                      label={`${noShowStats.ratePercent}% inasistencias`}
                    />
                  ) : null}
                </HStack>
              </VStack>
            </HStack>

            <Button
              label="WhatsApp"
              variant="primary"
              size="sm"
              icon={<MessageCircle size={14} aria-hidden="true" />}
              href={buildWhatsAppLink(
                client.phoneE164,
                `Hola ${client.fullName}, te saludamos de ${salonName}!`,
              )}
              target="_blank"
              rel="noopener noreferrer"
            />
          </HStack>

          {editError ? <Banner status="error" role="alert" title={editError} /> : null}

          {(noShowStats?.noShowCount ?? client.noShowCount) >= noShowThreshold ? (
            <SurfaceCard tone="warning" padded>
              <HStack gap={2} align="center">
                <AlertTriangle size={15} aria-hidden="true" />
                <Text type="supporting" weight="semibold" hasTabularNumbers>
                  {noShowStats?.noShowCount ?? client.noShowCount} inasistencias registradas
                  {noShowStats && noShowStats.evaluatedCount > 0
                    ? ` (${noShowStats.ratePercent}% de inasistencias)`
                    : ''}{' '}
                  · Al agendar se le solicita anticipo para apartar su lugar.
                </Text>
              </HStack>
            </SurfaceCard>
          ) : null}

          {loyalty ? (
            <SurfaceCard tone={loyalty.isRewardReady ? 'accent' : 'subtle'} padded>
              <VStack gap={2}>
                <HStack justify="between" align="center" wrap="wrap" gap={2}>
                  <HStack gap={1.5} align="center">
                    <Award size={15} aria-hidden="true" />
                    <Text weight="semibold">{loyalty.programName}</Text>
                  </HStack>
                  <StatusTag
                    tone={loyalty.isRewardReady ? 'success' : 'accent'}
                    hasTabularNumbers
                    label={`${loyalty.currentStamps}/${loyalty.stampsRequired} sellos`}
                  />
                </HStack>
                <ProgressBar
                  label="Progreso de sellos"
                  isLabelHidden
                  value={loyalty.currentStamps}
                  max={loyalty.stampsRequired}
                  variant={loyalty.isRewardReady ? 'success' : 'accent'}
                />
                <Text type="supporting" color="secondary">
                  {loyalty.isRewardReady
                    ? `¡Premio listo para canjear! (${loyalty.rewardLabel})`
                    : `Faltan ${loyalty.remainingForReward} visita(s) para: ${loyalty.rewardLabel}`}
                </Text>
              </VStack>
            </SurfaceCard>
          ) : null}

          <ClientProfilePackagesSection
            clientId={client.id}
            canManageClients={canManageClients}
            clientPackages={clientPackages}
            activeCatalogPackages={activeCatalogPackages}
            assigningPkg={assigningPkg}
            redeemingPkgId={redeemingPkgId}
            onAssignPackage={onAssignPackage}
            onRedeemPackageSession={onRedeemPackageSession}
          />

          {clientVisits.length > 0 ? (
            <SurfaceCard
              title="Últimas visitas"
              headingLevel={3}
              icon={<Calendar size={15} aria-hidden="true" />}
              count={Math.min(5, clientVisits.length)}
            >
              <VStack className="ad-row-list" gap={0}>
                {clientVisits.slice(0, 5).map((visit) => (
                  <ActionRow
                    key={visit.id}
                    title={visit.service.name}
                    subtitle={`${formatDateShortInTimezone(visit.startAt, tz)} · ${formatTimeInTimezone(visit.startAt, tz, true)} con ${visit.staff.name}`}
                    status={
                      <BookingStatusTag
                        status={visit.status}
                        hasPaymentProof={Boolean(visit.paymentProofUrl)}
                      />
                    }
                  />
                ))}
              </VStack>
            </SurfaceCard>
          ) : null}

          <VStack gap={3}>
            <TextInput
              label="Instagram (@usuario)"
              placeholder="@usuario"
              value={instagramDraft}
              onChange={setInstagramDraft}
              isOptional
            />
            <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
              <TextInput
                label="Correo electrónico"
                type="email"
                value={emailDraft}
                onChange={setEmailDraft}
                isOptional
              />
              <TextInput
                label="Cumpleaños"
                placeholder="Ej. 1997-08-15 (año-mes-día)"
                value={birthdayDraft}
                onChange={setBirthdayDraft}
                isOptional
              />
            </Grid>
            <TextArea
              label="Notas y preferencias (alergias, largo, forma o tono favorito)"
              placeholder="Ej. Almendra corta, base milky nude, sensibilidad a acetona..."
              value={notesDraft}
              onChange={setNotesDraft}
              rows={3}
            />
            <Button
              type="button"
              label="Guardar ficha"
              variant="primary"
              width="100%"
              isLoading={savingEdit}
              onClick={() => void handleSave()}
            />
          </VStack>

          {canManageClients ? (
            <Collapsible
              className="ad-disclosure"
              defaultIsOpen={false}
              trigger={
                <HStack gap={2} align="center">
                  <Shield size={15} aria-hidden="true" />
                  <Text weight="semibold" size="sm">
                    Privacidad
                  </Text>
                </HStack>
              }
            >
              <VStack gap={2} paddingBlockStart={2}>
                <Text type="supporting" color="secondary">
                  Descarga una copia del expediente de esta clienta con sus datos y citas (sin tus
                  notas privadas del salón).
                </Text>
                <HStack justify="start">
                  <Button
                    label="Descargar expediente"
                    variant="secondary"
                    size="sm"
                    icon={<Download size={14} aria-hidden="true" />}
                    href={`/api/admin/clients?exportClientId=${encodeURIComponent(client.id)}`}
                  />
                </HStack>
              </VStack>
            </Collapsible>
          ) : null}
        </VStack>
      ) : null}
    </Dialog>
  );
}
