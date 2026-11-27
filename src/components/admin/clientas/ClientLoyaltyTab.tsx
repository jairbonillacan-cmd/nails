'use client';

import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Link } from '@astryxdesign/core/Link';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Selector } from '@astryxdesign/core/Selector';
import { MessageCircle, Package, PackageCheck, Search, X } from 'lucide-react';
import type { AdminOverviewPayload } from '@/components/admin/AdminProvider';
import {
  buildWhatsAppLink,
  formatCurrency,
  formatDateShortInTimezone,
  formatPhoneDisplay,
} from '@/lib/format';
import type { ClientProfile, LoyaltyProgram, ServicePackage } from '@/lib/types';
import {
  ActionRow,
  ConfirmActionDialog,
  EmptyStateCard,
  PackageStatusTag,
  SkeletonBlock,
  StatusTag,
  SurfaceCard,
} from '@/components/ui';
import {
  formatInstagramDisplay,
  formatInstagramUrl,
  type ClientPackageRow,
} from './clientasTypes';

function normalizeToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

interface ClientLoyaltyTabProps {
  nearRewardClients: AdminOverviewPayload['nearRewardClients'];
  loyaltyProgram: LoyaltyProgram | null;
  clients: readonly ClientProfile[];
  clientPackages: readonly ClientPackageRow[];
  activeClientPackagesCount: number;
  activeCatalogPackages: readonly ServicePackage[];
  packagesLoading: boolean;
  canManageClients: boolean;
  salonName: string;
  tz: string;
  currency: 'MXN' | 'USD';
  assigningPkg: boolean;
  redeemingPkgId: string | null;
  cancelingPkgId: string | null;
  onOpenClientById: (clientId: string) => void;
  onAssignPackage: (
    targetClientId: string,
    targetPackageId: string,
    notesText: string,
  ) => Promise<boolean>;
  onRedeemPackageSession: (pkg: ClientPackageRow) => Promise<void>;
  onCancelPackage: (pkg: ClientPackageRow) => Promise<void>;
}

export function ClientLoyaltyTab({
  nearRewardClients,
  loyaltyProgram,
  clients,
  clientPackages,
  activeClientPackagesCount,
  activeCatalogPackages,
  packagesLoading,
  canManageClients,
  salonName,
  tz,
  currency,
  assigningPkg,
  redeemingPkgId,
  cancelingPkgId,
  onOpenClientById,
  onAssignPackage,
  onRedeemPackageSession,
  onCancelPackage,
}: ClientLoyaltyTabProps) {
  const [clientSearch, setClientSearch] = useState('');
  const [assignClientId, setAssignClientId] = useState('');
  const [assignPackageId, setAssignPackageId] = useState('');
  const [assignNotes, setAssignNotes] = useState('');
  const [confirmCancelPkg, setConfirmCancelPkg] = useState<ClientPackageRow | null>(null);

  const filteredAssignClients = useMemo(() => {
    const clean = normalizeToken(clientSearch);
    const sorted = clients.toSorted((a, b) => a.fullName.localeCompare(b.fullName, 'es'));
    if (!clean) return sorted;
    return sorted.filter((client) => {
      const haystack = normalizeToken(
        `${client.fullName} ${client.phoneE164} ${formatPhoneDisplay(client.phoneE164)} ${client.instagramHandle ?? ''}`,
      );
      return haystack.includes(clean);
    });
  }, [clients, clientSearch]);

  const effectiveAssignClientId = filteredAssignClients.some((c) => c.id === assignClientId)
    ? assignClientId
    : (filteredAssignClients[0]?.id ?? '');
  const effectiveAssignPackageId = assignPackageId || activeCatalogPackages[0]?.id || '';

  return (
    <VStack gap={5}>
      <SurfaceCard
        title="Cerca de su premio"
        subtitle={
          loyaltyProgram
            ? `${loyaltyProgram.name} (${loyaltyProgram.stampsRequired} sellos). Invita a tus clientas más fieles a canjear o completar su tarjeta.`
            : 'Activa tu tarjeta de sellos en Mi página para premiar a tus clientas frecuentes.'
        }
        count={nearRewardClients.length}
      >
        {nearRewardClients.length === 0 ? (
          <VStack padding={4}>
            <EmptyStateCard
              framed={false}
              isCompact
              title="Aún no hay clientas cerca de su premio"
              description="Cuando una clienta esté a 2 visitas o menos de llenar su tarjeta aparecerá aquí."
              actions={
                !loyaltyProgram || !loyaltyProgram.isActive ? (
                  <Button
                    label="Configurar en Mi página"
                    variant="secondary"
                    size="sm"
                    href="/admin/marca"
                  />
                ) : undefined
              }
            />
          </VStack>
        ) : (
          <VStack className="ad-row-list" gap={0}>
            {nearRewardClients.map((entry) => {
              const required = Math.max(1, entry.summary.stampsRequired);
              const totalSlots = Math.min(12, required);
              const filledSlots = Math.min(
                totalSlots,
                Math.round((entry.summary.currentStamps / required) * totalSlots),
              );
              const nudgeMsg = entry.summary.isRewardReady
                ? `Hola ${entry.fullName}! Ya juntaste ${entry.summary.currentStamps} de ${entry.summary.stampsRequired} sellos en ${entry.summary.programName} de ${salonName}. Tienes listo tu premio (${entry.summary.rewardLabel}) para tu próxima cita!`
                : `Hola ${entry.fullName}! Llevas ${entry.summary.currentStamps} de ${entry.summary.stampsRequired} sellos en ${entry.summary.programName} de ${salonName}. Te ${entry.summary.remainingForReward === 1 ? 'falta solo 1 visita' : `faltan solo ${entry.summary.remainingForReward} visitas`} para ganar ${entry.summary.rewardLabel}. ¿Agendamos tu siguiente cita?`;

              return (
                <ActionRow
                  key={entry.clientId}
                  leading={<Avatar name={entry.fullName} size="sm" />}
                  title={
                    <HStack gap={2} align="center" wrap="wrap">
                      <Text weight="semibold">{entry.fullName}</Text>
                      <StatusTag
                        tone={entry.summary.isRewardReady ? 'success' : 'accent'}
                        hasTabularNumbers
                        label={`${entry.summary.currentStamps}/${entry.summary.stampsRequired} sellos`}
                      />
                    </HStack>
                  }
                  subtitle={
                    <HStack gap={2} wrap="wrap" align="center">
                      <Text type="supporting" color="secondary" hasTabularNumbers>
                        {formatPhoneDisplay(entry.phoneE164)}
                      </Text>
                      {entry.instagramHandle ? (
                        <Link
                          href={formatInstagramUrl(entry.instagramHandle)}
                          isExternalLink
                          type="supporting"
                        >
                          {formatInstagramDisplay(entry.instagramHandle)}
                        </Link>
                      ) : null}
                      <Text type="supporting" color="secondary">
                        Premio: {entry.summary.rewardLabel}
                      </Text>
                    </HStack>
                  }
                  meta={
                    <ul className="ad-stamps" aria-hidden="true">
                      {Array.from({ length: totalSlots }, (_, idx) => (
                        <li
                          key={idx}
                          className="ad-stamp"
                          data-on={idx < filledSlots ? 'true' : 'false'}
                        />
                      ))}
                    </ul>
                  }
                  status={
                    <StatusTag
                      tone={entry.summary.isRewardReady ? 'success' : 'neutral'}
                      hasTabularNumbers
                      label={
                        entry.summary.isRewardReady
                          ? '¡Premio listo!'
                          : `Faltan ${entry.summary.remainingForReward}`
                      }
                    />
                  }
                  actions={
                    <HStack gap={2} align="center" wrap="wrap" className="ad-cl-row-actions">
                      <Button
                        type="button"
                        label="Ver ficha"
                        size="sm"
                        variant="secondary"
                        className="ad-cl-touch-btn"
                        onClick={() => onOpenClientById(entry.clientId)}
                      />
                      <Button
                        label="WhatsApp"
                        size="sm"
                        variant="primary"
                        className="ad-cl-touch-btn"
                        icon={<MessageCircle size={14} aria-hidden="true" />}
                        href={buildWhatsAppLink(entry.phoneE164, nudgeMsg)}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    </HStack>
                  }
                />
              );
            })}
          </VStack>
        )}
      </SurfaceCard>

      <VStack className="ad-split" gap={0}>
        <SurfaceCard
          title="Paquetes de sesiones"
          subtitle="Sesiones usadas y disponibles de cada clienta."
          count={activeClientPackagesCount}
        >
          {packagesLoading && clientPackages.length === 0 ? (
            <VStack padding={4} gap={2} role="status" aria-busy="true">
              <SkeletonBlock width="100%" height="4.5rem" radius={2} index={0} />
              <SkeletonBlock width="100%" height="4.5rem" radius={2} index={1} />
            </VStack>
          ) : clientPackages.length === 0 ? (
            <VStack padding={4}>
              <EmptyStateCard
                framed={false}
                isCompact
                title="Sin paquetes asignados todavía"
                description={
                  activeCatalogPackages.length === 0
                    ? 'Primero crea un paquete en Caja → Promos y paquetes para poder asignarlo aquí.'
                    : 'Asigna un paquete prepagado a una clienta desde el panel derecho.'
                }
                actions={
                  activeCatalogPackages.length === 0 ? (
                    <Button
                      label="Crear paquetes en Caja"
                      variant="secondary"
                      size="sm"
                      href="/admin/caja?tab=promos"
                    />
                  ) : undefined
                }
              />
            </VStack>
          ) : (
            <VStack padding={4} gap={3}>
              {clientPackages.map((pkg) => {
                const totalPips = Math.min(12, Math.max(1, pkg.totalSessions));
                const usedPips = Math.min(totalPips, pkg.usedSessions);
                const canRedeem =
                  canManageClients &&
                  pkg.status === 'active' &&
                  !pkg.isExpired &&
                  pkg.remainingSessions > 0;
                return (
                  <VStack key={pkg.id} className="ad-pkg-card" gap={2}>
                    <HStack justify="between" align="start" wrap="wrap" gap={2}>
                      <VStack gap={0.5} className="rb-grow">
                        <HStack gap={2} align="center" wrap="wrap">
                          <Package size={15} aria-hidden="true" />
                          <Text weight="semibold">{pkg.clientName}</Text>
                          <StatusTag
                            tone={pkg.status === 'active' && !pkg.isExpired ? 'accent' : 'neutral'}
                            hasTabularNumbers
                            label={`${pkg.remainingSessions}/${pkg.totalSessions} disponibles`}
                          />
                        </HStack>
                        <Text type="supporting" color="secondary" hasTabularNumbers>
                          {pkg.packageName} · {pkg.serviceName}
                          {pkg.expiresAt
                            ? ` · Vence ${formatDateShortInTimezone(pkg.expiresAt, tz)}`
                            : ''}
                        </Text>
                        {pkg.notes ? (
                          <Text type="supporting" color="secondary">
                            {pkg.notes}
                          </Text>
                        ) : null}
                      </VStack>

                      <HStack gap={1.5} align="center" wrap="wrap" className="ad-cl-row-actions">
                        <PackageStatusTag status={pkg.status} isExpired={pkg.isExpired} />
                        {canManageClients && pkg.status === 'active' && !pkg.isExpired ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="ad-cl-touch-btn"
                            icon={<X size={14} aria-hidden="true" />}
                            label="Cancelar"
                            isDisabled={redeemingPkgId === pkg.id || cancelingPkgId === pkg.id}
                            onClick={() => setConfirmCancelPkg(pkg)}
                          />
                        ) : null}
                        {canRedeem ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="ad-cl-touch-btn"
                            icon={<PackageCheck size={14} aria-hidden="true" />}
                            label="Usar 1 sesión"
                            isLoading={redeemingPkgId === pkg.id}
                            isDisabled={redeemingPkgId === pkg.id || cancelingPkgId === pkg.id}
                            onClick={() => void onRedeemPackageSession(pkg)}
                          />
                        ) : null}
                      </HStack>
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
                  </VStack>
                );
              })}
            </VStack>
          )}
        </SurfaceCard>

        {canManageClients ? (
          <SurfaceCard
            title="Asignar paquete a clienta"
            subtitle="Filtra por nombre o teléfono y asigna el paquete prepagado en segundos."
            headingLevel={3}
            padded
          >
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await onAssignPackage(
                  effectiveAssignClientId,
                  effectiveAssignPackageId,
                  assignNotes,
                );
                if (ok) {
                  setAssignNotes('');
                  setClientSearch('');
                }
              }}
            >
              <VStack gap={3}>
                <TextInput
                  type="search"
                  size="sm"
                  label="Buscar clienta"
                  placeholder="Filtra por nombre, WhatsApp o @instagram..."
                  startIcon={<Search size={14} aria-hidden="true" />}
                  hasClear
                  value={clientSearch}
                  onChange={setClientSearch}
                  description={
                    clientSearch.trim()
                      ? `${filteredAssignClients.length} ${filteredAssignClients.length === 1 ? 'coincidencia' : 'coincidencias'}`
                      : undefined
                  }
                />
                <Selector
                  label="Clienta"
                  value={effectiveAssignClientId}
                  onChange={(v) => v && setAssignClientId(v)}
                  hasSearch={filteredAssignClients.length > 6}
                  searchPlaceholder="Buscar en la lista..."
                  emptyText="Sin clientas con ese filtro"
                  options={filteredAssignClients.map((c) => ({
                    value: c.id,
                    label: `${c.fullName} (${formatPhoneDisplay(c.phoneE164)})`,
                  }))}
                />
                <Selector
                  label="Paquete de sesiones"
                  value={effectiveAssignPackageId}
                  onChange={(v) => v && setAssignPackageId(v)}
                  options={activeCatalogPackages.map((p) => ({
                    value: p.id,
                    label: `${p.name} (${p.totalSessions} ses. · ${formatCurrency(p.priceCents, currency)})`,
                  }))}
                />
                <TextInput
                  label="Nota (opcional)"
                  placeholder="Ejemplo: pagado en efectivo o transferencia"
                  value={assignNotes}
                  onChange={setAssignNotes}
                  isOptional
                />
                <Button
                  type="submit"
                  label="Asignar paquete"
                  variant="primary"
                  width="100%"
                  className="ad-cl-touch-btn"
                  icon={<Package size={14} aria-hidden="true" />}
                  isLoading={assigningPkg}
                  isDisabled={
                    assigningPkg || !effectiveAssignClientId || !effectiveAssignPackageId
                  }
                />
              </VStack>
            </form>
          </SurfaceCard>
        ) : null}
      </VStack>

      {confirmCancelPkg ? (
        <ConfirmActionDialog
          isOpen
          onOpenChange={(open) => {
            if (!open && !cancelingPkgId) setConfirmCancelPkg(null);
          }}
          title={`¿Cancelar paquete "${confirmCancelPkg.packageName}"?`}
          description={`Se cancelará el paquete de ${confirmCancelPkg.clientName} y sus ${confirmCancelPkg.remainingSessions} sesiones pendientes quedarán sin efecto.`}
          confirmLabel="Sí, cancelar paquete"
          cancelLabel="Volver"
          variant="destructive"
          isLoading={cancelingPkgId === confirmCancelPkg.id}
          onConfirm={async () => {
            await onCancelPackage(confirmCancelPkg);
            setConfirmCancelPkg(null);
          }}
        />
      ) : null}
    </VStack>
  );
}
