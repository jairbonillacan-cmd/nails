'use client';

import type React from 'react';
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
import { DateInput } from '@astryxdesign/core/DateInput';
import type { ISODateString } from '@astryxdesign/core/Calendar';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import {
  AlertTriangle,
  Award,
  CalendarPlus,
  Download,
  ExternalLink,
  MessageCircle,
  Shield,
  Trash2,
} from 'lucide-react';
import { extractMxPhoneDigits } from '@/components/booking/bookingHelpers';
import { whatsappHref } from '@/lib/admin-links';
import {
  buildWhatsAppLink,
  formatCurrency,
  formatDateShortInTimezone,
  formatPhoneDisplay,
} from '@/lib/format';
import type { computeClientLoyaltySummary } from '@/lib/loyalty/stamps';
import type { BookingWithRelations, ClientProfile, ServicePackage } from '@/lib/types';
import { ConfirmActionDialog, StatusTag, SurfaceCard } from '@/components/ui';
import type { ClientNoShowStats } from './clientasActions';
import {
  buildClientNewBookingUrl,
  computeSingleClientMetrics,
  type EnrichedClientMetrics,
} from './clientasMetrics';
import {
  formatInstagramDisplay,
  formatInstagramUrl,
  type ClientPackageRow,
} from './clientasTypes';
import {
  formatNailTechBadges,
  parseNailTechNotes,
  serializeNailTechNotes,
  type NailTechProfile,
} from './nailTechProfile';
import { ClientProfilePackagesSection } from './ClientProfilePackagesSection';
import { ClientNailTechEditor } from './ClientNailTechEditor';
import { ClientVisitHistorySection } from './ClientVisitHistorySection';

type LoyaltySummary = ReturnType<typeof computeClientLoyaltySummary>;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toIsoDateString(value: string): ISODateString | undefined {
  return ISO_DATE_RE.test(value) ? (value as ISODateString) : undefined;
}

interface ClientProfileDialogProps {
  client: ClientProfile | null;
  onClose: () => void;
  salonName: string;
  tz: string;
  currency?: 'MXN' | 'USD';
  noShowThreshold: number;
  noShowStats: ClientNoShowStats | null;
  canManageClients: boolean;
  loyalty: LoyaltySummary | null;
  metrics?: EnrichedClientMetrics | null;
  clientPackages: readonly ClientPackageRow[];
  activeCatalogPackages: readonly ServicePackage[];
  bookings: readonly BookingWithRelations[];
  assigningPkg: boolean;
  redeemingPkgId: string | null;
  cancelingPkgId: string | null;
  packageNotice?: { status: 'success' | 'error'; title: string } | null;
  onDismissPackageNotice?: () => void;
  onSaveClient: (input: {
    clientId: string;
    fullName?: string;
    phone?: string;
    notes: string;
    birthday: string | null;
    email: string | null;
    instagramHandle: string | null;
  }) => Promise<string | null>;
  onDeleteClient?: (
    clientId: string,
  ) => Promise<{ ok: boolean; error?: string; code?: string }>;
  onAssignPackage: (
    targetClientId: string,
    targetPackageId: string,
    notesText: string,
  ) => Promise<boolean>;
  onRedeemPackageSession: (pkg: ClientPackageRow) => Promise<void>;
  onCancelPackage: (pkg: ClientPackageRow) => Promise<void>;
}

export function ClientProfileDialog({
  client,
  onClose,
  salonName,
  tz,
  currency = 'MXN',
  noShowThreshold,
  noShowStats,
  canManageClients,
  loyalty,
  metrics = null,
  clientPackages,
  activeCatalogPackages,
  bookings,
  assigningPkg,
  redeemingPkgId,
  cancelingPkgId,
  packageNotice = null,
  onDismissPackageNotice,
  onSaveClient,
  onDeleteClient,
  onAssignPackage,
  onRedeemPackageSession,
  onCancelPackage,
}: ClientProfileDialogProps) {
  const initialParsed = parseNailTechNotes(client?.notes ?? '');
  const clientSignature = client
    ? `${client.id}|${client.updatedAt}|${client.fullName}|${client.phoneE164}|${client.notes}|${client.birthday ?? ''}|${client.email ?? ''}|${client.instagramHandle ?? ''}`
    : '';
  const currentClientId = client?.id ?? '';

  const [lastSignature, setLastSignature] = useState(clientSignature);
  const [lastClientId, setLastClientId] = useState(currentClientId);
  const [fullNameDraft, setFullNameDraft] = useState(client?.fullName ?? '');
  const [phoneDraft, setPhoneDraft] = useState(client?.phoneE164 ?? '');
  const [birthdayDraft, setBirthdayDraft] = useState(client?.birthday ?? '');
  const [emailDraft, setEmailDraft] = useState(client?.email ?? '');
  const [instagramDraft, setInstagramDraft] = useState(client?.instagramHandle ?? '');
  const [techProfileDraft, setTechProfileDraft] = useState<NailTechProfile>(
    initialParsed.profile,
  );
  const [freeNotesDraft, setFreeNotesDraft] = useState(initialParsed.freeNotes);
  const [editError, setEditError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deletingClient, setDeletingClient] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (lastClientId !== currentClientId) {
    setLastClientId(currentClientId);
    setSaveSuccess(false);
    setConfirmDeleteOpen(false);
    setDeleteError(null);
  }

  if (lastSignature !== clientSignature) {
    setLastSignature(clientSignature);
    const parsed = parseNailTechNotes(client?.notes ?? '');
    setFullNameDraft(client?.fullName ?? '');
    setPhoneDraft(client?.phoneE164 ?? '');
    setBirthdayDraft(client?.birthday ?? '');
    setEmailDraft(client?.email ?? '');
    setInstagramDraft(client?.instagramHandle ?? '');
    setTechProfileDraft(parsed.profile);
    setFreeNotesDraft(parsed.freeNotes);
    setEditError(null);
  }

  const clientVisits = useMemo(() => {
    if (!client) return [];
    return bookings
      .filter((b) => b.clientId === client.id)
      .toSorted((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
  }, [bookings, client]);

  const resolvedMetrics = useMemo(() => {
    if (!client) return null;
    if (metrics && metrics.clientId === client.id) return metrics;
    return computeSingleClientMetrics({
      client,
      bookings: clientVisits,
      clientPackages,
      loyalty,
      noShowStats,
      noShowThreshold,
      currentMonth: '',
    });
  }, [client, metrics, clientVisits, clientPackages, loyalty, noShowStats, noShowThreshold]);

  const hasHistory = clientVisits.length > 0 || clientPackages.length > 0;
  const headerTechBadges = resolvedMetrics
    ? formatNailTechBadges(resolvedMetrics.techProfile)
    : [];

  const newBookingUrl = client
    ? buildClientNewBookingUrl({
        fullName: client.fullName,
        phoneE164: client.phoneE164,
        usualStaffId: resolvedMetrics?.usualStaffId ?? null,
        instagramHandle: client.instagramHandle ?? null,
      })
    : '/admin/citas';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || savingEdit || !canManageClients) return;
    const trimmedName = fullNameDraft.trim();
    const trimmedPhone = phoneDraft.trim();
    if (trimmedName.length < 2) {
      setEditError('Escribe el nombre completo de la clienta.');
      return;
    }
    if (extractMxPhoneDigits(trimmedPhone).length !== 10) {
      setEditError('Escribe un número de WhatsApp válido de 10 dígitos.');
      return;
    }

    setSavingEdit(true);
    setEditError(null);
    setSaveSuccess(false);
    try {
      const serializedNotes = serializeNailTechNotes(techProfileDraft, freeNotesDraft);
      const errorText = await onSaveClient({
        clientId: client.id,
        fullName: trimmedName,
        phone: trimmedPhone,
        notes: serializedNotes,
        birthday: birthdayDraft.trim() || null,
        email: emailDraft.trim() || null,
        instagramHandle: instagramDraft.trim() || null,
      });
      if (errorText) {
        setEditError(errorText);
      } else {
        setSaveSuccess(true);
      }
    } finally {
      setSavingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!client || !onDeleteClient || deletingClient) return;
    setDeletingClient(true);
    setDeleteError(null);
    setEditError(null);
    try {
      const result = await onDeleteClient(client.id);
      setConfirmDeleteOpen(false);
      if (!result.ok) {
        const message =
          result.error ||
          'No se puede eliminar esta clienta porque ya tiene citas o paquetes registrados.';
        setDeleteError(message);
        setEditError(message);
        return;
      }
      onClose();
    } finally {
      setDeletingClient(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !savingEdit && !deletingClient) {
      onClose();
    }
  };

  return (
    <>
      <Dialog
        isOpen={Boolean(client)}
        onOpenChange={handleOpenChange}
        width="min(42rem, 96vw)"
        maxHeight="min(92dvh, calc(100dvh - 2rem))"
        padding={5}
      >
        <Layout
          header={
            <DialogHeader
              title="Ficha de clienta"
              subtitle={
                client
                  ? `${client.fullName} · ${formatPhoneDisplay(client.phoneE164)}`
                  : undefined
              }
              hasDivider
              onOpenChange={handleOpenChange}
            />
          }
          content={
            <LayoutContent>
              {client && resolvedMetrics ? (
                <VStack gap={4}>
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
                          {formatPhoneDisplay(client.phoneE164)}
                        </Text>
                        <HStack gap={1.5} wrap="wrap" align="center">
                          {client.instagramHandle ? (
                            <Link
                              href={formatInstagramUrl(client.instagramHandle)}
                              isExternalLink
                              type="supporting"
                            >
                              {formatInstagramDisplay(client.instagramHandle)}
                            </Link>
                          ) : null}
                          {resolvedMetrics.isVip ? (
                            <StatusTag tone="accent" label="VIP" />
                          ) : null}
                          <StatusTag
                            tone="neutral"
                            hasTabularNumbers
                            label={`${resolvedMetrics.nonCanceledVisits} ${resolvedMetrics.nonCanceledVisits === 1 ? 'visita' : 'visitas'}`}
                          />
                          {resolvedMetrics.effectiveNoShows > 0 ? (
                            <StatusTag
                              tone={resolvedMetrics.hasNoShowAlert ? 'warning' : 'neutral'}
                              hasTabularNumbers
                              label={`Faltó ${resolvedMetrics.effectiveNoShows} ${resolvedMetrics.effectiveNoShows === 1 ? 'vez' : 'veces'}`}
                            />
                          ) : null}
                          {headerTechBadges.map((badge) => (
                            <StatusTag
                              key={`${badge.tone}-${badge.label}`}
                              tone={badge.tone}
                              label={badge.label}
                            />
                          ))}
                        </HStack>
                      </VStack>
                    </HStack>

                    <HStack gap={1.5} align="center" wrap="wrap">
                      <Button
                        label="Abrir chat"
                        variant="primary"
                        size="md"
                        icon={<MessageCircle size={14} aria-hidden="true" />}
                        href={whatsappHref({ phone: client.phoneE164 })}
                      />
                      <Button
                        label="wa.me"
                        variant="ghost"
                        size="md"
                        icon={<ExternalLink size={13} aria-hidden="true" />}
                        href={buildWhatsAppLink(
                          client.phoneE164,
                          `Hola ${client.fullName}, te saludamos de ${salonName}!`,
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    </HStack>
                  </HStack>

                  {editError ? (
                    <Banner
                      status="error"
                      role="alert"
                      title={editError}
                      isDismissable
                      onDismiss={() => setEditError(null)}
                    />
                  ) : null}

                  {saveSuccess ? (
                    <Banner
                      status="success"
                      role="status"
                      title="Ficha actualizada correctamente."
                      isDismissable
                      onDismiss={() => setSaveSuccess(false)}
                    />
                  ) : null}

                  {packageNotice ? (
                    <Banner
                      status={packageNotice.status}
                      role={packageNotice.status === 'error' ? 'alert' : 'status'}
                      title={packageNotice.title}
                      isDismissable={Boolean(onDismissPackageNotice)}
                      onDismiss={onDismissPackageNotice}
                    />
                  ) : null}

                  <Grid
                    columns={{ minWidth: 112, max: 5 }}
                    gap={2}
                    className="ad-client-kpi-grid"
                  >
                    <VStack gap={0.5} className="ad-client-kpi-cell">
                      <Text type="supporting" color="secondary">
                        Total gastado
                      </Text>
                      <Text weight="semibold" size="sm" hasTabularNumbers>
                        {formatCurrency(resolvedMetrics.totalSpentCents, currency)}
                      </Text>
                    </VStack>
                    <VStack gap={0.5} className="ad-client-kpi-cell">
                      <Text type="supporting" color="secondary">
                        Completadas
                      </Text>
                      <Text weight="semibold" size="sm" hasTabularNumbers>
                        {resolvedMetrics.completedVisits}{' '}
                        {resolvedMetrics.completedVisits === 1 ? 'visita' : 'visitas'}
                      </Text>
                    </VStack>
                    <VStack gap={0.5} className="ad-client-kpi-cell">
                      <Text type="supporting" color="secondary">
                        Ticket promedio
                      </Text>
                      <Text weight="semibold" size="sm" hasTabularNumbers>
                        {resolvedMetrics.completedVisits > 0
                          ? formatCurrency(resolvedMetrics.avgTicketCents, currency)
                          : '—'}
                      </Text>
                    </VStack>
                    <VStack gap={0.5} className="ad-client-kpi-cell">
                      <Text type="supporting" color="secondary">
                        Profesional
                      </Text>
                      <Text weight="semibold" size="sm" textWrap="pretty">
                        {resolvedMetrics.usualStaffName ?? 'Sin preferencia'}
                      </Text>
                    </VStack>
                    <VStack gap={0.5} className="ad-client-kpi-cell">
                      <Text type="supporting" color="secondary">
                        Última visita
                      </Text>
                      <Text weight="semibold" size="sm" hasTabularNumbers>
                        {resolvedMetrics.lastVisitAt
                          ? formatDateShortInTimezone(resolvedMetrics.lastVisitAt, tz)
                          : 'Sin visitas'}
                      </Text>
                    </VStack>
                  </Grid>

                  {resolvedMetrics.hasNoShowAlert ? (
                    <SurfaceCard tone="warning" padded>
                      <HStack gap={2} align="center">
                        <AlertTriangle size={15} aria-hidden="true" />
                        <Text type="supporting" weight="semibold" hasTabularNumbers>
                          {resolvedMetrics.effectiveNoShows} inasistencias registradas
                          {noShowStats && noShowStats.evaluatedCount > 0
                            ? ` (${noShowStats.ratePercent}% de inasistencias)`
                            : ''}{' '}
                          · Al agendar se le solicita anticipo para apartar su lugar.
                        </Text>
                      </HStack>
                    </SurfaceCard>
                  ) : null}

                  {loyalty ? (
                    <SurfaceCard
                      tone={loyalty.isRewardReady ? 'accent' : 'subtle'}
                      padded
                    >
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
                            : `Le ${loyalty.remainingForReward === 1 ? 'falta 1 visita' : `faltan ${loyalty.remainingForReward} visitas`} para: ${loyalty.rewardLabel}`}
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
                    cancelingPkgId={cancelingPkgId}
                    onAssignPackage={onAssignPackage}
                    onRedeemPackageSession={onRedeemPackageSession}
                    onCancelPackage={onCancelPackage}
                  />

                  <ClientVisitHistorySection
                    clientId={client.id}
                    visits={clientVisits}
                    tz={tz}
                    currency={currency}
                  />

                  <form id="client-profile-form" noValidate onSubmit={(e) => void handleSave(e)}>
                    <VStack gap={3}>
                      <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
                        <TextInput
                          label="Nombre completo"
                          value={fullNameDraft}
                          onChange={(value) => {
                            setSaveSuccess(false);
                            setFullNameDraft(value);
                          }}
                          isDisabled={!canManageClients}
                          isRequired
                        />
                        <TextInput
                          label="WhatsApp"
                          type="tel"
                          value={phoneDraft}
                          onChange={(value) => {
                            setSaveSuccess(false);
                            setPhoneDraft(value);
                          }}
                          isDisabled={!canManageClients}
                          isRequired
                        />
                      </Grid>

                      <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
                        <TextInput
                          label="Instagram (@usuario)"
                          placeholder="@usuario"
                          value={instagramDraft}
                          onChange={(value) => {
                            setSaveSuccess(false);
                            setInstagramDraft(value);
                          }}
                          isDisabled={!canManageClients}
                          isOptional
                        />
                        <TextInput
                          label="Correo electrónico"
                          type="email"
                          value={emailDraft}
                          onChange={(value) => {
                            setSaveSuccess(false);
                            setEmailDraft(value);
                          }}
                          isDisabled={!canManageClients}
                          isOptional
                        />
                      </Grid>

                      <DateInput
                        label="Cumpleaños"
                        value={toIsoDateString(birthdayDraft)}
                        format="date_long"
                        placeholder="Selecciona una fecha"
                        hasClear
                        isOptional
                        isDisabled={!canManageClients}
                        onChange={(val) => {
                          setSaveSuccess(false);
                          setBirthdayDraft(val ?? '');
                        }}
                      />

                      <ClientNailTechEditor
                        value={techProfileDraft}
                        canEdit={canManageClients}
                        onChange={(next) => {
                          setSaveSuccess(false);
                          setTechProfileDraft(next);
                        }}
                      />

                      <TextArea
                        label="Notas adicionales (tonos, diseños o preferencias)"
                        placeholder="Ejemplo: Prefiere tonos milky nude, french delgado o cita por la tarde…"
                        value={freeNotesDraft}
                        onChange={(value) => {
                          setSaveSuccess(false);
                          setFreeNotesDraft(value);
                        }}
                        isDisabled={!canManageClients}
                        rows={3}
                      />
                    </VStack>
                  </form>

                  {canManageClients ? (
                    <Collapsible
                      className="ad-disclosure"
                      defaultIsOpen={false}
                      trigger={
                        <HStack gap={2} align="center">
                          <Shield size={15} aria-hidden="true" />
                          <Text weight="semibold" size="sm">
                            Privacidad y gestión
                          </Text>
                        </HStack>
                      }
                    >
                      <VStack gap={3} paddingBlockStart={2}>
                        <VStack gap={1.5}>
                          <Text type="supporting" color="secondary">
                            Descarga una copia del expediente de esta clienta con sus datos y
                            citas (sin tus notas privadas del salón).
                          </Text>
                          <HStack justify="start">
                            <Button
                              label="Descargar expediente (ARCO)"
                              variant="secondary"
                              size="sm"
                              icon={<Download size={14} aria-hidden="true" />}
                              href={`/api/admin/clients?exportClientId=${encodeURIComponent(client.id)}`}
                            />
                          </HStack>
                        </VStack>

                        {onDeleteClient ? (
                          <VStack gap={1.5}>
                            {deleteError ? (
                              <Banner
                                status="error"
                                role="alert"
                                title={deleteError}
                                isDismissable
                                onDismiss={() => setDeleteError(null)}
                              />
                            ) : null}
                            <Text type="supporting" color="secondary">
                              {hasHistory
                                ? 'Esta clienta tiene citas o paquetes registrados; solo se pueden eliminar fichas sin historial.'
                                : 'Elimina permanentemente esta ficha si fue creada por error y no tiene citas ni paquetes.'}
                            </Text>
                            <HStack justify="start">
                              <Button
                                type="button"
                                label="Eliminar clienta"
                                variant="destructive"
                                size="sm"
                                icon={<Trash2 size={14} aria-hidden="true" />}
                                isDisabled={savingEdit || deletingClient}
                                onClick={() => {
                                  setDeleteError(null);
                                  setConfirmDeleteOpen(true);
                                }}
                              />
                            </HStack>
                          </VStack>
                        ) : null}
                      </VStack>
                    </Collapsible>
                  ) : null}
                </VStack>
              ) : null}
            </LayoutContent>
          }
          footer={
            client ? (
              <LayoutFooter hasDivider>
                <HStack justify="between" align="center" gap={2} wrap="wrap">
                  <Button
                    label="Agendar cita"
                    variant="secondary"
                    size="md"
                    icon={<CalendarPlus size={14} aria-hidden="true" />}
                    href={newBookingUrl}
                  />
                  <HStack gap={2} align="center" wrap="wrap">
                    <Button
                      type="button"
                      label="Cerrar"
                      variant="secondary"
                      size="md"
                      isDisabled={savingEdit || deletingClient}
                      onClick={onClose}
                    />
                    {canManageClients ? (
                      <Button
                        type="submit"
                        form="client-profile-form"
                        label="Guardar ficha"
                        variant="primary"
                        size="md"
                        isLoading={savingEdit}
                        isDisabled={
                          savingEdit ||
                          deletingClient ||
                          !fullNameDraft.trim() ||
                          !phoneDraft.trim()
                        }
                      />
                    ) : null}
                  </HStack>
                </HStack>
              </LayoutFooter>
            ) : undefined
          }
        />
      </Dialog>

      {client && onDeleteClient ? (
        <ConfirmActionDialog
          isOpen={confirmDeleteOpen}
          onOpenChange={(open) => {
            if (!open && !deletingClient) setConfirmDeleteOpen(false);
          }}
          title={`¿Eliminar a ${client.fullName}?`}
          description={
            hasHistory
              ? 'Esta clienta ya tiene citas o paquetes registrados; el sistema conservará su historial y bloqueará el borrado.'
              : 'Se eliminará permanentemente esta ficha del directorio del salón. Esta acción no se puede deshacer.'
          }
          confirmLabel="Sí, eliminar clienta"
          cancelLabel="Cancelar"
          variant="destructive"
          isLoading={deletingClient}
          onConfirm={handleConfirmDelete}
        />
      ) : null}
    </>
  );
}
