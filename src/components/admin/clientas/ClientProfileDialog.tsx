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
import { Selector } from '@astryxdesign/core/Selector';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import {
  AlertTriangle,
  Award,
  Calendar,
  Download,
  MessageCircle,
  Package,
  PackageCheck,
  Shield,
} from 'lucide-react';
import {
  buildWhatsAppLink,
  formatDateShortInTimezone,
  formatTimeInTimezone,
} from '@/lib/format';
import type { computeClientLoyaltySummary } from '@/lib/loyalty/stamps';
import type {
  BookingWithRelations,
  ClientProfile,
  ServicePackage,
} from '@/lib/types';
import {
  formatBookingStatusLabel,
  formatInstagramDisplay,
  formatInstagramUrl,
  type ClientPackageRow,
} from './clientasTypes';

type LoyaltySummary = ReturnType<typeof computeClientLoyaltySummary>;

interface ClientProfileDialogProps {
  client: ClientProfile | null;
  onClose: () => void;
  salonName: string;
  tz: string;
  noShowThreshold: number;
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
  const [fichaPackageId, setFichaPackageId] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const clientVisits = useMemo(() => {
    if (!client) return [];
    return bookings
      .filter((b) => b.clientId === client.id)
      .toSorted((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
  }, [bookings, client]);

  const effectiveFichaPackageId = fichaPackageId || activeCatalogPackages[0]?.id || '';

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
      if (errorText) {
        setEditError(errorText);
      }
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <Dialog
      isOpen={Boolean(client)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      width={540}
      padding={5}
    >
      <DialogHeader
        title="Ficha de clienta"
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      />
      {client ? (
        <VStack gap={4} paddingBlockStart={3} className="fx-sheet-in">
          <HStack
            className="ad-contact-head"
            justify="between"
            align="center"
            wrap="wrap"
            gap={3}
          >
            <HStack gap={3} align="center" className="rb-grow">
              <Avatar name={client.fullName} size="lg" />
              <VStack gap={0.5} className="rb-grow">
                <Heading level={3} className="lk-serif ad-h3">
                  {client.fullName}
                </Heading>
                <Text type="supporting" color="secondary" hasTabularNumbers>
                  {client.phoneE164}
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
                  <Text color="inherit" className="ad-chip" data-tone="neutral" hasTabularNumbers>
                    {clientVisits.filter((v) => v.status !== 'canceled').length}{' '}
                    {clientVisits.filter((v) => v.status !== 'canceled').length === 1
                      ? 'visita'
                      : 'visitas'}
                  </Text>
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

          {editError ? <Banner status="error" title={editError} /> : null}

          {client.noShowCount >= noShowThreshold ? (
            <HStack
              className="ad-surface"
              data-tone="warning"
              data-padded="true"
              gap={2}
              align="center"
            >
              <AlertTriangle size={15} aria-hidden="true" />
              <Text type="supporting" weight="semibold" hasTabularNumbers>
                {client.noShowCount} inasistencias registradas · Al agendar se le solicita
                anticipo para apartar su lugar.
              </Text>
            </HStack>
          ) : null}

          {loyalty ? (
            <VStack
              className="ad-surface"
              data-tone={loyalty.isRewardReady ? 'accent' : 'subtle'}
              data-padded="true"
              gap={2}
            >
              <HStack justify="between" align="center" wrap="wrap" gap={2}>
                <HStack gap={1.5} align="center">
                  <Award size={15} aria-hidden="true" />
                  <Text weight="semibold">{loyalty.programName}</Text>
                </HStack>
                <Text
                  color="inherit"
                  className="ad-chip"
                  data-tone={loyalty.isRewardReady ? 'success' : 'accent'}
                  hasTabularNumbers
                >
                  {loyalty.currentStamps}/{loyalty.stampsRequired} sellos
                </Text>
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
          ) : null}

          {clientPackages.length > 0 || (canManageClients && activeCatalogPackages.length > 0) ? (
            <VStack gap={2}>
              <HStack justify="between" align="center" gap={2}>
                <HStack gap={1.5} align="center">
                  <Package size={15} aria-hidden="true" />
                  <Text weight="semibold" size="sm">
                    Paquetes de sesiones
                  </Text>
                </HStack>
                <Text color="inherit" className="ad-chip" data-tone="neutral" hasTabularNumbers>
                  {clientPackages.length}
                </Text>
              </HStack>

              {clientPackages.map((pkg) => {
                const totalPips = Math.min(12, Math.max(1, pkg.totalSessions));
                const usedPips = Math.min(totalPips, pkg.usedSessions);
                return (
                  <VStack key={pkg.id} className="ad-pkg-card" gap={1.5}>
                    <HStack justify="between" align="center" wrap="wrap" gap={2}>
                      <Text weight="semibold" size="sm">
                        {pkg.packageName}
                      </Text>
                      <Text
                        color="inherit"
                        className="ad-chip"
                        data-tone={
                          pkg.status === 'active' && !pkg.isExpired ? 'accent' : 'neutral'
                        }
                        hasTabularNumbers
                      >
                        {pkg.remainingSessions}/{pkg.totalSessions} disponibles
                      </Text>
                    </HStack>
                    <ul
                      className="ad-pkg-pips"
                      aria-label={`${pkg.usedSessions} de ${pkg.totalSessions} sesiones usadas`}
                    >
                      {Array.from({ length: totalPips }, (_, idx) => (
                        <li
                          key={idx}
                          className="ad-pkg-pip"
                          data-used={idx < usedPips ? 'true' : 'false'}
                        />
                      ))}
                    </ul>
                    {canManageClients &&
                    pkg.status === 'active' &&
                    !pkg.isExpired &&
                    pkg.remainingSessions > 0 ? (
                      <HStack justify="end">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          icon={<PackageCheck size={13} aria-hidden="true" />}
                          label="Usar 1 sesión"
                          isLoading={redeemingPkgId === pkg.id}
                          onClick={() => void onRedeemPackageSession(pkg)}
                        />
                      </HStack>
                    ) : null}
                  </VStack>
                );
              })}

              {canManageClients && activeCatalogPackages.length > 0 ? (
                <HStack gap={2} align="end" wrap="wrap">
                  <VStack className="rb-grow">
                    <Selector
                      label="Asignar paquete"
                      size="sm"
                      value={effectiveFichaPackageId}
                      onChange={(v) => v && setFichaPackageId(v)}
                      options={activeCatalogPackages.map((p) => ({
                        value: p.id,
                        label: `${p.name} (${p.totalSessions} ses.)`,
                      }))}
                    />
                  </VStack>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    label="Asignar"
                    isLoading={assigningPkg}
                    isDisabled={assigningPkg || !effectiveFichaPackageId}
                    onClick={() =>
                      void onAssignPackage(client.id, effectiveFichaPackageId, '')
                    }
                  />
                </HStack>
              ) : null}
            </VStack>
          ) : null}

          {clientVisits.length > 0 ? (
            <VStack gap={2}>
              <HStack gap={1.5} align="center">
                <Calendar size={15} aria-hidden="true" />
                <Text weight="semibold" size="sm">
                  Últimas visitas
                </Text>
              </HStack>
              <VStack className="ad-surface" gap={0}>
                <VStack className="ad-row-list" gap={0}>
                  {clientVisits.slice(0, 5).map((visit) => {
                    const statusMeta = formatBookingStatusLabel(visit.status);
                    return (
                      <HStack
                        key={visit.id}
                        className="ad-row-item"
                        justify="between"
                        align="center"
                        wrap="wrap"
                        gap={2}
                      >
                        <VStack gap={0} className="rb-grow">
                          <Text weight="medium" size="sm">
                            {visit.service.name}
                          </Text>
                          <Text type="supporting" color="secondary" hasTabularNumbers>
                            {formatDateShortInTimezone(visit.startAt, tz)} ·{' '}
                            {formatTimeInTimezone(visit.startAt, tz, true)} con{' '}
                            {visit.staff.name}
                          </Text>
                        </VStack>
                        <Text
                          color="inherit"
                          className="ad-chip"
                          data-tone={statusMeta.tone}
                        >
                          {statusMeta.label}
                        </Text>
                      </HStack>
                    );
                  })}
                </VStack>
              </VStack>
            </VStack>
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
                label="Cumpleaños (AAAA-MM-DD)"
                placeholder="1997-08-15"
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
