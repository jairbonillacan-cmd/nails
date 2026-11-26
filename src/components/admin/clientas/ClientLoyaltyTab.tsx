'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Link } from '@astryxdesign/core/Link';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Selector } from '@astryxdesign/core/Selector';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { MessageCircle, Package, PackageCheck } from 'lucide-react';
import type { AdminOverviewPayload } from '@/components/admin/AdminProvider';
import {
  buildWhatsAppLink,
  formatCurrency,
  formatDateShortInTimezone,
} from '@/lib/format';
import type { ClientProfile, LoyaltyProgram, ServicePackage } from '@/lib/types';
import {
  formatInstagramDisplay,
  formatInstagramUrl,
  type ClientPackageRow,
} from './clientasTypes';

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
  onOpenClientById: (clientId: string) => void;
  onAssignPackage: (
    targetClientId: string,
    targetPackageId: string,
    notesText: string,
  ) => Promise<boolean>;
  onRedeemPackageSession: (pkg: ClientPackageRow) => Promise<void>;
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
  onOpenClientById,
  onAssignPackage,
  onRedeemPackageSession,
}: ClientLoyaltyTabProps) {
  const [assignClientId, setAssignClientId] = useState('');
  const [assignPackageId, setAssignPackageId] = useState('');
  const [assignNotes, setAssignNotes] = useState('');

  const effectiveAssignClientId = assignClientId || clients[0]?.id || '';
  const effectiveAssignPackageId = assignPackageId || activeCatalogPackages[0]?.id || '';

  return (
    <VStack gap={5} className="fx-step-in">
      <VStack className="ad-surface" gap={0}>
        <HStack className="ad-section-head" justify="between" align="center" wrap="wrap" gap={2}>
          <VStack gap={0.5} className="rb-grow">
            <Heading level={2} className="lk-serif ad-h2">
              Cerca de su premio
            </Heading>
            <Text type="supporting" color="secondary">
              {loyaltyProgram
                ? `${loyaltyProgram.name} (${loyaltyProgram.stampsRequired} sellos). Invita a tus clientas más fieles a canjear o completar su tarjeta.`
                : 'Activa tu tarjeta de sellos en Mi página para premiar a tus clientas frecuentes.'}
            </Text>
          </VStack>
          <Text color="inherit" className="ad-chip" data-tone="accent" hasTabularNumbers>
            {nearRewardClients.length}{' '}
            {nearRewardClients.length === 1 ? 'clienta' : 'clientas'}
          </Text>
        </HStack>

        {nearRewardClients.length === 0 ? (
          <VStack className="ad-empty" gap={2}>
            <EmptyState
              isCompact
              title="Aún no hay clientas cerca de su premio"
              description="Cuando una clienta esté a 2 visitas o menos de llenar su tarjeta aparecerá aquí."
            />
          </VStack>
        ) : (
          <VStack className="ad-row-list fx-stagger" gap={0}>
            {nearRewardClients.map((entry) => {
              const required = Math.max(1, entry.summary.stampsRequired);
              const totalSlots = Math.min(12, required);
              const filledSlots = Math.min(
                totalSlots,
                Math.round((entry.summary.currentStamps / required) * totalSlots),
              );
              const nudgeMsg = entry.summary.isRewardReady
                ? `Hola ${entry.fullName}! Ya juntaste ${entry.summary.currentStamps} de ${entry.summary.stampsRequired} sellos en ${entry.summary.programName} de ${salonName}. Tienes listo tu premio (${entry.summary.rewardLabel}) para tu próxima cita!`
                : `Hola ${entry.fullName}! Llevas ${entry.summary.currentStamps} de ${entry.summary.stampsRequired} sellos en ${entry.summary.programName} de ${salonName}. Te faltan solo ${entry.summary.remainingForReward} visita(s) para ganar ${entry.summary.rewardLabel}. ¿Agendamos tu siguiente cita?`;

              return (
                <HStack
                  key={entry.clientId}
                  className="ad-row-item"
                  justify="between"
                  align="center"
                  wrap="wrap"
                  gap={3}
                >
                  <HStack gap={3} align="start" className="rb-grow">
                    <Avatar name={entry.fullName} size="sm" />
                    <VStack gap={1.5} className="rb-grow">
                      <HStack gap={2} align="center" wrap="wrap">
                        <Text weight="semibold">{entry.fullName}</Text>
                        <Text
                          color="inherit"
                          className="ad-chip"
                          data-tone={entry.summary.isRewardReady ? 'success' : 'accent'}
                          hasTabularNumbers
                        >
                          {entry.summary.currentStamps}/{entry.summary.stampsRequired} sellos
                        </Text>
                      </HStack>
                      <HStack gap={2} wrap="wrap" align="center">
                        <Text type="supporting" color="secondary" hasTabularNumbers>
                          {entry.phoneE164}
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
                      <ul className="ad-stamps" aria-hidden="true">
                        {Array.from({ length: totalSlots }, (_, idx) => (
                          <li
                            key={idx}
                            className="ad-stamp"
                            data-on={idx < filledSlots ? 'true' : 'false'}
                          />
                        ))}
                      </ul>
                    </VStack>
                  </HStack>

                  <HStack gap={1.5} align="center" wrap="wrap">
                    <Text
                      color="inherit"
                      className="ad-chip"
                      data-tone={entry.summary.isRewardReady ? 'success' : 'neutral'}
                      hasTabularNumbers
                    >
                      {entry.summary.isRewardReady
                        ? '¡Premio listo!'
                        : `Faltan ${entry.summary.remainingForReward}`}
                    </Text>
                    <Button
                      type="button"
                      label="Ver ficha"
                      size="sm"
                      variant="secondary"
                      onClick={() => onOpenClientById(entry.clientId)}
                    />
                    <Button
                      label="WhatsApp"
                      size="sm"
                      variant="primary"
                      icon={<MessageCircle size={14} aria-hidden="true" />}
                      href={buildWhatsAppLink(entry.phoneE164, nudgeMsg)}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  </HStack>
                </HStack>
              );
            })}
          </VStack>
        )}
      </VStack>

      <VStack className="ad-split" gap={0}>
        <VStack className="ad-surface" gap={0}>
          <HStack className="ad-section-head" justify="between" align="center" wrap="wrap" gap={2}>
            <VStack gap={0.5} className="rb-grow">
              <Heading level={2} className="lk-serif ad-h2">
                Paquetes de sesiones
              </Heading>
              <Text type="supporting" color="secondary">
                Lleva el control de sesiones usadas y disponibles; también se descuentan al cobrar
                en Agenda.
              </Text>
            </VStack>
            <Text color="inherit" className="ad-chip" data-tone="accent" hasTabularNumbers>
              {activeClientPackagesCount}{' '}
              {activeClientPackagesCount === 1 ? 'activo' : 'activos'}
            </Text>
          </HStack>

          {packagesLoading && clientPackages.length === 0 ? (
            <VStack padding={4} gap={2} role="status" aria-busy="true">
              <VStack className="ad-skeleton" data-size="row" aria-hidden="true" />
              <VStack className="ad-skeleton" data-size="row" aria-hidden="true" />
            </VStack>
          ) : clientPackages.length === 0 ? (
            <VStack className="ad-empty" gap={2}>
              <EmptyState
                isCompact
                title="Sin paquetes asignados todavía"
                description="Asigna un paquete prepagado a una clienta desde el panel derecho."
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

                      <HStack gap={1.5} align="center" wrap="wrap">
                        <Badge
                          variant={
                            pkg.status === 'active' && !pkg.isExpired
                              ? 'success'
                              : pkg.status === 'exhausted'
                                ? 'info'
                                : 'neutral'
                          }
                          label={
                            pkg.isExpired
                              ? 'Vencido'
                              : pkg.status === 'active'
                                ? 'Activo'
                                : pkg.status === 'exhausted'
                                  ? 'Completado'
                                  : 'Cancelado'
                          }
                        />
                        {canRedeem ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            icon={<PackageCheck size={14} aria-hidden="true" />}
                            label="Usar 1 sesión"
                            isLoading={redeemingPkgId === pkg.id}
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
        </VStack>

        {canManageClients ? (
          <VStack className="ad-surface" data-padded="true" gap={3}>
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
                }
              }}
            >
              <VStack gap={3}>
                <Heading level={3} className="lk-serif ad-h3">
                  Asignar paquete a clienta
                </Heading>
                <Text type="supporting" color="secondary">
                  Crea o ajusta los paquetes disponibles en Caja → Promos y paquetes.
                </Text>
                <Selector
                  label="Clienta"
                  value={effectiveAssignClientId}
                  onChange={(v) => v && setAssignClientId(v)}
                  options={clients.map((c) => ({
                    value: c.id,
                    label: `${c.fullName} (${c.phoneE164})`,
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
                  placeholder="Ej. Pagado en efectivo o transferencia"
                  value={assignNotes}
                  onChange={setAssignNotes}
                  isOptional
                />
                <Button
                  type="submit"
                  label="Asignar paquete"
                  variant="primary"
                  width="100%"
                  icon={<Package size={14} aria-hidden="true" />}
                  isLoading={assigningPkg}
                  isDisabled={
                    assigningPkg || !effectiveAssignClientId || !effectiveAssignPackageId
                  }
                />
              </VStack>
            </form>
          </VStack>
        ) : null}
      </VStack>
    </VStack>
  );
}
