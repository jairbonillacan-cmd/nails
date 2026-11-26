'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Switch } from '@astryxdesign/core/Switch';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { AlertTriangle, History, KeyRound, Trash2 } from 'lucide-react';
import {
  ActionRow,
  ConfirmActionDialog,
  EmptyStateCard,
  StatusTag,
  SurfaceCard,
  type StatusTagTone,
} from '@/components/ui';
import { formatDateShortInTimezone, formatTimeInTimezone } from '@/lib/format';
import type { AdminRole, AuditAction, AuditLogEntry } from '@/lib/types';

const ROLE_LABELS: Record<AdminRole, string> = {
  owner: 'Dueña',
  admin: 'Recepción',
  specialist: 'Manicurista',
};

const HISTORY_ACTION_META: Record<
  AuditAction,
  { label: string; tone: StatusTagTone }
> = {
  booking_canceled: { label: 'Cita cancelada', tone: 'warning' },
  booking_price_override: { label: 'Precio ajustado', tone: 'warning' },
  csv_exported: { label: 'Reporte descargado', tone: 'neutral' },
  past_booking_override: { label: 'Cita pasada editada', tone: 'warning' },
  deposit_approved: { label: 'Anticipo aprobado', tone: 'success' },
  loyalty_redeemed: { label: 'Premio canjeado', tone: 'accent' },
  media_retention_warned: { label: 'Aviso de respaldo de fotos', tone: 'warning' },
  media_retention_purged: { label: 'Fotos antiguas eliminadas', tone: 'neutral' },
};

function friendlyEntityLabel(entityType: string): string {
  const lower = entityType.toLowerCase();
  if (lower === 'booking') return 'Cita';
  if (lower === 'client') return 'Clienta';
  if (lower === 'report' || lower === 'cash') return 'Reporte';
  if (lower === 'settings') return 'Ajustes';
  if (lower === 'loyalty') return 'Sellos';
  if (lower === 'media_asset') return 'Comprobante o foto';
  return 'Registro';
}

interface OwnerPinAndNoShowCardsProps {
  noShowDepositThreshold: number;
  flaggedNoShowClientsCount: number;
  hasOwnerPin: boolean;
  ownerPinEnabled: boolean;
  onChangeNoShowThreshold: (value: number) => void;
  onSyncOwnerPinEnabled: (enabled: boolean) => void;
  onRefresh: () => Promise<void>;
  onNotify: (message: string) => void;
}

export function OwnerPinAndNoShowCards({
  noShowDepositThreshold,
  flaggedNoShowClientsCount,
  hasOwnerPin,
  ownerPinEnabled,
  onChangeNoShowThreshold,
  onSyncOwnerPinEnabled,
  onRefresh,
  onNotify,
}: OwnerPinAndNoShowCardsProps) {
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  const [pinSuccessMsg, setPinSuccessMsg] = useState<string | null>(null);
  const [pinErrorMsg, setPinErrorMsg] = useState<string | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const handleToggleOwnerPin = (nextEnabled: boolean) => {
    setPinErrorMsg(null);
    setPinSuccessMsg(null);
    if (nextEnabled && !hasOwnerPin) {
      setPinErrorMsg('Primero crea un PIN de 4 a 6 números y pulsa "Guardar PIN".');
      return;
    }
    onSyncOwnerPinEnabled(nextEnabled);
  };

  const handleSaveOwnerPin = async () => {
    if (pinSaving) return;
    setPinErrorMsg(null);
    setPinSuccessMsg(null);
    if (!/^\d{4,6}$/.test(newPin)) {
      setPinErrorMsg('El PIN debe tener entre 4 y 6 números.');
      return;
    }
    if (newPin !== confirmPin) {
      setPinErrorMsg('Los dos PIN no coinciden.');
      return;
    }
    setPinSaving(true);
    try {
      const res = await fetch('/api/admin/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerPin: newPin, ownerPinEnabled: true }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setPinErrorMsg(json?.error || 'No se pudo guardar el PIN de dueña.');
        return;
      }
      await onRefresh();
      setNewPin('');
      setConfirmPin('');
      onSyncOwnerPinEnabled(true);
      setPinSuccessMsg(
        hasOwnerPin ? 'PIN de dueña actualizado y activado.' : 'PIN de dueña creado y activado.',
      );
      onNotify('PIN guardado');
    } catch {
      setPinErrorMsg('Error de conexión al guardar el PIN.');
    } finally {
      setPinSaving(false);
    }
  };

  const handleClearOwnerPin = async () => {
    if (pinSaving) return;
    setPinErrorMsg(null);
    setPinSuccessMsg(null);
    setPinSaving(true);
    try {
      const res = await fetch('/api/admin/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearOwnerPin: true, ownerPinEnabled: false }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setPinErrorMsg(json?.error || 'No se pudo borrar el PIN.');
        return;
      }
      await onRefresh();
      setNewPin('');
      setConfirmPin('');
      onSyncOwnerPinEnabled(false);
      setPinSuccessMsg('PIN de dueña borrado y desactivado.');
      onNotify('PIN borrado');
    } catch {
      setPinErrorMsg('Error de conexión al borrar el PIN.');
    } finally {
      setPinSaving(false);
    }
  };

  return (
    <VStack gap={4}>
      <SurfaceCard
        id="brand-noshow-policy-heading"
        icon={<AlertTriangle size={16} aria-hidden="true" />}
        title="Política si no llegan"
        subtitle="Pide anticipo obligatorio en automático a clientas que han faltado sin avisar."
        badge={
          <StatusTag
            tone={flaggedNoShowClientsCount > 0 ? 'warning' : 'success'}
            label={
              flaggedNoShowClientsCount > 0
                ? `${flaggedNoShowClientsCount} clienta${flaggedNoShowClientsCount === 1 ? '' : 's'} con aviso`
                : 'Sin clientas marcadas'
            }
            hasTabularNumbers
          />
        }
      >
        <VStack gap={3} className="ad-card-body" paddingBlockStart={4}>
          <NumberInput
            label="¿Después de cuántas faltas pedir anticipo obligatorio? (1 a 5)"
            description="Cuando una clienta llega a este número de inasistencias, el sistema siempre le pedirá anticipo."
            value={noShowDepositThreshold}
            min={1}
            max={5}
            isIntegerOnly
            onChange={(v) =>
              onChangeNoShowThreshold(Math.max(1, Math.min(5, Math.round(v || 2))))
            }
          />
          <HStack className="ad-subpanel" justify="between" align="center" wrap="wrap" gap={2}>
            <Text type="supporting" color="secondary" hasTabularNumbers>
              Con {noShowDepositThreshold} o más faltas → se pide anticipo obligatorio.
            </Text>
            <StatusTag
              tone="accent"
              label={`Límite: ${noShowDepositThreshold} falta${noShowDepositThreshold === 1 ? '' : 's'}`}
              hasTabularNumbers
            />
          </HStack>
        </VStack>
      </SurfaceCard>

      <SurfaceCard
        id="brand-owner-pin-heading"
        icon={<KeyRound size={16} aria-hidden="true" />}
        title="PIN de dueña"
        subtitle="Protege cancelaciones, cambios manuales de precio y descargas de reportes."
        badge={
          <StatusTag
            tone={
              hasOwnerPin && ownerPinEnabled
                ? 'success'
                : hasOwnerPin
                  ? 'neutral'
                  : 'warning'
            }
            showDot
            label={
              hasOwnerPin && ownerPinEnabled
                ? 'Activo'
                : hasOwnerPin
                  ? 'Pausado'
                  : 'Sin configurar'
            }
          />
        }
      >
        <VStack
          gap={3}
          className={pinSaving ? 'ad-card-body fx-busy' : 'ad-card-body'}
          paddingBlockStart={4}
          aria-busy={pinSaving || undefined}
        >
          {pinSuccessMsg ? (
            <Banner
              status="success"
              role="status"
              title={pinSuccessMsg}
              isDismissable
              onDismiss={() => setPinSuccessMsg(null)}
            />
          ) : null}
          {pinErrorMsg ? (
            <Banner
              status="error"
              role="alert"
              title={pinErrorMsg}
              isDismissable
              onDismiss={() => setPinErrorMsg(null)}
            />
          ) : null}

          <Switch
            label="Pedir PIN de dueña en acciones importantes"
            description="Lo pedirá al cancelar citas, cambiar precios a mano o descargar reportes."
            value={ownerPinEnabled}
            onChange={handleToggleOwnerPin}
          />

          <Divider />

          <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
            <TextInput
              type="password"
              label={hasOwnerPin ? 'Nuevo PIN (4 a 6 números)' : 'Crear PIN (4 a 6 números)'}
              placeholder="••••"
              inputMode="numeric"
              autoComplete="new-password"
              containerClassName="ad-pin-input"
              value={newPin}
              onChange={(val) => setNewPin(val.replace(/\D/g, '').slice(0, 6))}
            />
            <TextInput
              type="password"
              label="Repite el PIN"
              placeholder="••••"
              inputMode="numeric"
              autoComplete="new-password"
              containerClassName="ad-pin-input"
              value={confirmPin}
              onChange={(val) => setConfirmPin(val.replace(/\D/g, '').slice(0, 6))}
            />
          </Grid>

          <Text type="supporting" color="secondary">
            Tu PIN se guarda protegido y nunca se muestra en pantalla.
          </Text>

          <HStack gap={2} wrap="wrap">
            <Button
              type="button"
              label={
                pinSaving ? 'Guardando PIN...' : hasOwnerPin ? 'Cambiar PIN' : 'Guardar PIN'
              }
              variant="primary"
              size="sm"
              icon={<KeyRound size={14} aria-hidden="true" />}
              isLoading={pinSaving}
              isDisabled={pinSaving || newPin.length < 4 || confirmPin.length < 4}
              onClick={() => void handleSaveOwnerPin()}
            />
            {hasOwnerPin ? (
              <Button
                type="button"
                label={pinSaving ? 'Borrando...' : 'Quitar PIN'}
                variant="ghost"
                size="sm"
                icon={<Trash2 size={14} aria-hidden="true" />}
                isLoading={pinSaving}
                isDisabled={pinSaving}
                onClick={() => setConfirmClearOpen(true)}
              />
            ) : null}
          </HStack>
        </VStack>
      </SurfaceCard>

      <ConfirmActionDialog
        isOpen={confirmClearOpen}
        onOpenChange={setConfirmClearOpen}
        title="¿Quitar el PIN de dueña?"
        description="Se desactivará la protección por PIN en cancelaciones, cambios de precio y descargas de reportes hasta que crees uno nuevo."
        confirmLabel="Quitar PIN"
        variant="destructive"
        isLoading={pinSaving}
        onConfirm={async () => {
          await handleClearOwnerPin();
          setConfirmClearOpen(false);
        }}
      />
    </VStack>
  );
}

interface OwnerAuditHistoryCardProps {
  recentAuditLogs: AuditLogEntry[];
  timezone: string;
}

export function OwnerAuditHistoryCard({
  recentAuditLogs,
  timezone,
}: OwnerAuditHistoryCardProps) {
  return (
    <SurfaceCard
      id="brand-history-heading"
      icon={<History size={16} aria-hidden="true" />}
      title="Historial de cambios"
      subtitle="Cancelaciones, ajustes de precio, anticipos aprobados y premios canjeados."
      count={recentAuditLogs.length}
    >
      {recentAuditLogs.length === 0 ? (
        <VStack className="ad-empty" gap={2}>
          <EmptyStateCard
            framed={false}
            isCompact
            icon={<History size={22} aria-hidden="true" />}
            title="Aún no hay movimientos registrados"
            description="Cada cambio importante quedará guardado aquí con fecha y quién lo hizo."
          />
        </VStack>
      ) : (
        <VStack as="ul" className="ad-row-list" gap={0}>
          {recentAuditLogs.slice(0, 12).map((entry) => {
            const meta = HISTORY_ACTION_META[entry.action];
            const roleLabel = ROLE_LABELS[entry.actorRole] ?? 'Equipo';
            return (
              <li key={entry.id}>
                <ActionRow
                  title={`${meta.label} · ${friendlyEntityLabel(entry.entityType)}`}
                  meta={`${entry.actorEmail} (${roleLabel}) · ${formatDateShortInTimezone(entry.createdAt, timezone)} ${formatTimeInTimezone(entry.createdAt, timezone)}`}
                  status={<StatusTag label={meta.label} tone={meta.tone} />}
                />
              </li>
            );
          })}
        </VStack>
      )}
    </SurfaceCard>
  );
}
