'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';
import { Banner } from '@astryxdesign/core/Banner';
import { Check } from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import {
  ConfirmActionDialog,
  MetricGrid,
  PageHeader,
  PageSkeleton,
  type MetricTileItem,
} from '@/components/ui';
import { StaffEditorSection } from '@/components/admin/equipo/StaffEditorSection';
import {
  AdminAccessSection,
  cleanAccessDisplayName,
} from '@/components/admin/equipo/AdminAccessSection';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import type { AdminUser, StaffMember } from '@/lib/types';

type PendingDeactivateTarget =
  | { kind: 'staff'; item: StaffMember }
  | { kind: 'access'; item: AdminUser }
  | null;

export default function AdminTeamPage() {
  const { data, loading, refresh } = useAdminData();
  const [msg, setMsg] = useState<{ status: 'success' | 'error'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDeactivate, setPendingDeactivate] = useState<PendingDeactivateTarget>(null);
  const saveNotice = useEphemeralMessage(3200);

  if (loading || !data) {
    return <PageSkeleton kpiCount={3} withSplit ariaLabel="Cargando equipo y accesos" />;
  }

  const isOwner = data.session.user.role === 'owner';
  const activeStaffCount = data.staff.filter((s) => s.isActive).length;
  const activeAdminCount = data.adminUsers.filter((u) => u.isActive).length;

  const kpiItems: MetricTileItem[] = [
    {
      id: 'active-staff',
      label: 'Manicuristas activas',
      value: String(activeStaffCount),
      sub: `de ${data.staff.length} en tu salón`,
    },
    {
      id: 'web-mode',
      label: 'Al reservar',
      value: activeStaffCount <= 1 ? 'Directa' : 'Por artista',
      sub:
        activeStaffCount <= 1
          ? 'Se asigna en automático'
          : 'La clienta elige o toma "Cualquier profesional"',
    },
    {
      id: 'panel-access',
      label: 'Personas con acceso',
      value: String(activeAdminCount),
      sub: `de ${data.adminUsers.length} cuentas activas`,
    },
  ];

  const applyToggleStaffActive = async (st: StaffMember, checked: boolean) => {
    if (busyId) return;
    setBusyId(st.id);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'staff', data: { ...st, isActive: checked } }),
      });
      if (res.ok) {
        await refresh();
        saveNotice.show(checked ? `${st.name} activada` : `${st.name} pausada`);
      } else {
        setMsg({ status: 'error', text: 'No se pudo actualizar el estado.' });
      }
    } finally {
      setBusyId(null);
    }
  };

  const applyToggleAccessActive = async (user: AdminUser, checked: boolean) => {
    if (!isOwner || user.id === data.session.user.id || busyId) return;
    setBusyId(user.id);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'admin_user',
          data: {
            id: user.id,
            fullName: user.fullName,
            email: user.email,
            role: user.role,
            staffMemberId: user.staffMemberId,
            isActive: checked,
          },
        }),
      });
      if (res.ok) {
        await refresh();
        const displayName = cleanAccessDisplayName(user.fullName);
        saveNotice.show(
          checked ? `Acceso reactivado · ${displayName}` : `Acceso pausado · ${displayName}`,
        );
      } else {
        setMsg({ status: 'error', text: 'No se pudo actualizar el acceso.' });
      }
    } finally {
      setBusyId(null);
    }
  };

  const dialogTitle =
    pendingDeactivate?.kind === 'staff'
      ? `¿Pausar a ${pendingDeactivate.item.name}?`
      : pendingDeactivate?.kind === 'access'
        ? `¿Pausar el acceso de ${cleanAccessDisplayName(pendingDeactivate.item.fullName)}?`
        : '';
  const dialogDesc =
    pendingDeactivate?.kind === 'staff'
      ? 'Dejará de aparecer como opción en la agenda pública hasta que vuelvas a activarla.'
      : 'Esta persona ya no podrá entrar al panel del salón hasta que reactives su acceso.';

  return (
    <VStack className="ad-page">
      <PageHeader
        eyebrow="Tu equipo"
        title="Equipo"
        subtitle="Administra a tus manicuristas, sus comisiones y quién puede entrar al panel del salón."
        meta={
          busyId ? (
            <Text className="fx-save-pill" data-state="saving" role="status" aria-live="polite">
              Guardando...
            </Text>
          ) : saveNotice.message ? (
            <Text className="fx-save-pill" data-state="saved" role="status" aria-live="polite">
              <Check size={12} aria-hidden="true" />
              {saveNotice.message}
            </Text>
          ) : undefined
        }
      />

      <MetricGrid ariaLabel="Resumen del equipo" items={kpiItems} cols={3} />

      {msg ? (
        <Banner
          status={msg.status}
          role={msg.status === 'error' ? 'alert' : 'status'}
          title={msg.text}
          isDismissable
          onDismiss={() => setMsg(null)}
        />
      ) : null}

      <VStack className="ad-config-grid-equal" gap={5}>
        <StaffEditorSection
          staff={data.staff}
          services={data.services}
          appUrl={data.integration.appUrl}
          defaultCommissionPercent={data.settings.defaultCommissionPercent || 35}
          busyId={busyId}
          onRequestToggleStaffActive={(st, checked) => {
            if (!checked) {
              setPendingDeactivate({ kind: 'staff', item: st });
            } else {
              void applyToggleStaffActive(st, true);
            }
          }}
          onRefresh={refresh}
          onError={(text) => setMsg({ status: 'error', text })}
          onNotice={saveNotice.show}
        />

        <AdminAccessSection
          adminUsers={data.adminUsers}
          staff={data.staff}
          currentUserId={data.session.user.id}
          isOwner={isOwner}
          busyId={busyId}
          onRequestToggleAccessActive={(user, checked) => {
            if (!checked) {
              setPendingDeactivate({ kind: 'access', item: user });
            } else {
              void applyToggleAccessActive(user, true);
            }
          }}
          onRefresh={refresh}
          onError={(text) => setMsg({ status: 'error', text })}
          onNotice={saveNotice.show}
        />
      </VStack>

      <ConfirmActionDialog
        isOpen={Boolean(pendingDeactivate)}
        onOpenChange={(open) => {
          if (!open) setPendingDeactivate(null);
        }}
        title={dialogTitle}
        description={dialogDesc}
        confirmLabel="Pausar"
        variant="destructive"
        isLoading={Boolean(busyId)}
        onConfirm={async () => {
          if (!pendingDeactivate) return;
          const target = pendingDeactivate;
          setPendingDeactivate(null);
          if (target.kind === 'staff') {
            await applyToggleStaffActive(target.item, false);
          } else {
            await applyToggleAccessActive(target.item, false);
          }
        }}
      />
    </VStack>
  );
}
