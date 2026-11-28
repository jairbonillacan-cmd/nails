'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';
import { Banner } from '@astryxdesign/core/Banner';
import { Check } from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import { AdminAccessGuard } from '@/components/admin/AdminAccessGuard';
import {
  ConfirmActionDialog,
  PageHeader,
  PageSkeleton,
} from '@/components/ui';
import { StaffEditorSection } from '@/components/admin/equipo/StaffEditorSection';
import {
  AdminAccessSection,
  cleanAccessDisplayName,
} from '@/components/admin/equipo/AdminAccessSection';
import { equipoHref, parseEquipoParams } from '@/lib/admin-links';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import { fetchJsonWithTimeout } from '@/lib/http/client-fetch';
import type { AdminUser, StaffMember } from '@/lib/types';

type PendingDeactivateTarget =
  | { kind: 'staff'; item: StaffMember }
  | { kind: 'access'; item: AdminUser }
  | null;

export default function AdminTeamPage() {
  const { data, loading, refresh } = useAdminData();
  const router = useRouter();
  const searchParams = useSearchParams();
  const parsedParams = parseEquipoParams(searchParams);
  const [msg, setMsg] = useState<{ status: 'success' | 'error'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [optimisticStaffActive, setOptimisticStaffActive] = useState<Record<string, boolean>>({});
  const [optimisticAccessActive, setOptimisticAccessActive] = useState<Record<string, boolean>>({});
  const [pendingDeactivate, setPendingDeactivate] = useState<PendingDeactivateTarget>(null);
  const saveNotice = useEphemeralMessage(3200);

  const displayStaff = useMemo(
    () =>
      data
        ? data.staff.map((st) => {
            const override = optimisticStaffActive[st.id];
            return override !== undefined ? { ...st, isActive: override } : st;
          })
        : [],
    [data, optimisticStaffActive],
  );

  const displayAdminUsers = useMemo(
    () =>
      data
        ? data.adminUsers.map((u) => {
            const override = optimisticAccessActive[u.id];
            return override !== undefined ? { ...u, isActive: override } : u;
          })
        : [],
    [data, optimisticAccessActive],
  );

  if (loading || !data) {
    return <PageSkeleton kpiCount={0} withSplit ariaLabel="Cargando equipo y accesos" />;
  }

  const isOwner = data.session.user.role === 'owner';
  const canManageCommissions =
    data.session.user.role === 'owner' || data.session.user.role === 'admin';
  const retailCommissionPercent =
    data.settings.landingContent?.cajaConfig?.retailCommissionPercent ?? 10;

  const applyToggleStaffActive = async (st: StaffMember, checked: boolean) => {
    if (busyId) return;
    setBusyId(st.id);
    setOptimisticStaffActive((prev) => ({ ...prev, [st.id]: checked }));
    setMsg(null);
    try {
      const result = await fetchJsonWithTimeout('/api/admin/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'staff', data: { ...st, isActive: checked } }),
      });
      if (result.ok) {
        await refresh();
        saveNotice.show(checked ? `${st.name} activada` : `${st.name} pausada`);
      } else {
        setMsg({ status: 'error', text: result.error || 'No se pudo actualizar el estado.' });
      }
    } finally {
      setBusyId(null);
      setOptimisticStaffActive((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([key]) => key !== st.id)),
      );
    }
  };

  const applyToggleAccessActive = async (user: AdminUser, checked: boolean) => {
    if (!isOwner || user.id === data.session.user.id || busyId) return;
    setBusyId(user.id);
    setOptimisticAccessActive((prev) => ({ ...prev, [user.id]: checked }));
    setMsg(null);
    try {
      const result = await fetchJsonWithTimeout('/api/admin/team', {
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
      if (result.ok) {
        await refresh();
        const displayName = cleanAccessDisplayName(user.fullName);
        saveNotice.show(
          checked ? `Acceso reactivado · ${displayName}` : `Acceso pausado · ${displayName}`,
        );
      } else {
        setMsg({ status: 'error', text: result.error || 'No se pudo actualizar el acceso.' });
      }
    } finally {
      setBusyId(null);
      setOptimisticAccessActive((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([key]) => key !== user.id)),
      );
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
    <AdminAccessGuard role={data.session.user.role} section="team" sectionLabel="Equipo">
    <VStack className="ad-page">
      <PageHeader
        title="Equipo"
        subtitle="Tus profesionales y quién puede entrar al panel."
        meta={
          busyId ? (
            <Text className="fx-save-pill" data-state="saving" role="status" aria-live="polite">
              Guardando…
            </Text>
          ) : saveNotice.message ? (
            <Text className="fx-save-pill" data-state="saved" role="status" aria-live="polite">
              <Check size={12} aria-hidden="true" />
              {saveNotice.message}
            </Text>
          ) : undefined
        }
      />

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
          staff={displayStaff}
          services={data.services}
          appUrl={data.integration.appUrl}
          currency={data.settings.currency}
          defaultCommissionPercent={data.settings.defaultCommissionPercent || 35}
          retailCommissionPercent={retailCommissionPercent}
          canManageCommissions={canManageCommissions}
          busyId={busyId}
          focusStaffId={parsedParams.staffId ?? null}
          onClearFocusStaffId={() => {
            if (parsedParams.staffId) {
              router.replace(equipoHref(), { scroll: false });
            }
          }}
          onRequestToggleStaffActive={(st, checked) => {
            if (!checked) {
              setPendingDeactivate({ kind: 'staff', item: st });
            } else {
              void applyToggleStaffActive(st, true);
            }
          }}
          onRefresh={refresh}
          onNotice={saveNotice.show}
        />

        <AdminAccessSection
          adminUsers={displayAdminUsers}
          staff={displayStaff}
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
    </AdminAccessGuard>
  );
}
