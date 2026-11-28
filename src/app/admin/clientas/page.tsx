'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Gift, MessageCircle, UserPlus } from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import { AdminAccessGuard } from '@/components/admin/AdminAccessGuard';
import { ClientDirectoryTab } from '@/components/admin/clientas/ClientDirectoryTab';
import {
  assignClientPackageRequest,
  cancelClientPackageRequest,
  createClientProfileRequest,
  deleteClientProfileRequest,
  redeemClientPackageSessionRequest,
  saveClientProfileRequest,
} from '@/components/admin/clientas/clientasActions';
import {
  computeClientDirectoryKpis,
  computeClientMetricsMap,
  filterAndSortClients,
  type ClientDirectoryFilter,
  type ClientDirectorySort,
} from '@/components/admin/clientas/clientasMetrics';
import { useClientasData } from '@/components/admin/clientas/useClientasData';
import type { BannerNotice, ClientPackageRow } from '@/components/admin/clientas/clientasTypes';
import {
  MetricGrid,
  PageHeader,
  PageSkeleton,
  type MetricTileItem,
} from '@/components/ui';
import {
  clientasHref,
  fidelizacionHref,
  parseClientasParams,
} from '@/lib/admin-links';
import { normalizeTouchUpDays } from '@/lib/booking/recurrence';
import { invalidateAdminDomain } from '@/lib/hooks/useAdminCache';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import { roleCanAccess } from '@/lib/rbac';
import type { ClientProfile } from '@/lib/types';

const ClientProfileDialog = dynamic(
  () =>
    import('@/components/admin/clientas/ClientProfileDialog').then(
      (mod) => mod.ClientProfileDialog,
    ),
  { ssr: false },
);

const NewClientDialog = dynamic(
  () =>
    import('@/components/admin/clientas/NewClientDialog').then(
      (mod) => mod.NewClientDialog,
    ),
  { ssr: false },
);

function resolveLegacyClientasRedirect(
  rawTab: string | null,
  parsedTab: 'directorio' | 'retencion' | 'paquetes' | undefined,
  q: string | undefined,
): string | null {
  const cleaned = (rawTab ?? '').trim().toLowerCase();
  if (
    parsedTab === 'retencion' ||
    cleaned === 'retencion' ||
    cleaned === 'retention' ||
    cleaned === 'campanas' ||
    cleaned === 'campañas'
  ) {
    return fidelizacionHref({ tab: 'campanas', ...(q ? { q } : {}) });
  }
  if (
    parsedTab === 'paquetes' ||
    cleaned === 'paquetes' ||
    cleaned === 'packages'
  ) {
    return fidelizacionHref({ tab: 'paquetes', ...(q ? { q } : {}) });
  }
  if (
    cleaned === 'fidelidad' ||
    cleaned === 'fidelizacion' ||
    cleaned === 'sellos' ||
    cleaned === 'lealtad' ||
    cleaned === 'loyalty' ||
    cleaned === 'premios' ||
    cleaned === 'rewards'
  ) {
    return fidelizacionHref({ tab: 'sellos', ...(q ? { q } : {}) });
  }
  return null;
}

export default function AdminClientsPage() {
  const router = useRouter();
  const { data: providerData, bookingEventSeq, refresh } = useAdminData();
  const searchParams = useSearchParams();
  const parsedParams = parseClientasParams(searchParams);
  const legacyRedirectHref = resolveLegacyClientasRedirect(
    searchParams.get('tab'),
    parsedParams.tab,
    parsedParams.q,
  );

  useExternalSync(`clientas-redirect|${legacyRedirectHref ?? ''}`, async (signal) => {
    if (signal.aborted || !legacyRedirectHref) return;
    router.replace(legacyRedirectHref);
  });

  const [selected, setSelected] = useState<ClientProfile | null>(null);
  const urlFilter: ClientDirectoryFilter = parsedParams.filter ?? 'all';
  const [prevUrlFilter, setPrevUrlFilter] = useState<ClientDirectoryFilter>(urlFilter);
  const [directoryFilter, setDirectoryFilter] = useState<ClientDirectoryFilter>(urlFilter);
  const [directorySort, setDirectorySort] = useState<ClientDirectorySort>('alpha');

  if (prevUrlFilter !== urlFilter) {
    setPrevUrlFilter(urlFilter);
    setDirectoryFilter(urlFilter);
  }

  const {
    data,
    canManageClients,
    query,
    setQuery,
    activeCatalogPackages,
    activeClientPackages,
    noShowStatsByClient,
    loyaltyByClientId,
    returningClients,
    packagesByClientId,
    packagesSupported,
    reloadPackages,
  } = useClientasData(
    providerData,
    bookingEventSeq,
    null,
    parsedParams.q ?? '',
    Boolean(selected || parsedParams.clientId),
  );

  const urlClientId = parsedParams.clientId ?? '';
  const matchedUrlClient = useMemo(
    () => (data && urlClientId ? (data.clients.find((c) => c.id === urlClientId) ?? null) : null),
    [data, urlClientId],
  );
  const appliedClientSyncKey = matchedUrlClient ? matchedUrlClient.id : '';
  const [prevAppliedClientId, setPrevAppliedClientId] = useState('');
  if (prevAppliedClientId !== appliedClientSyncKey) {
    setPrevAppliedClientId(appliedClientSyncKey);
    if (matchedUrlClient) {
      setSelected(matchedUrlClient);
    }
  }

  const [createOpen, setCreateOpen] = useState(false);
  const [bannerMsg, setBannerMsg] = useState<BannerNotice | null>(null);
  const [savingClient, setSavingClient] = useState(false);
  const [assigningPkg, setAssigningPkg] = useState(false);
  const [redeemingPkgId, setRedeemingPkgId] = useState<string | null>(null);
  const [cancelingPkgId, setCancelingPkgId] = useState<string | null>(null);

  const touchUpDays = normalizeTouchUpDays(data?.settings.landingContent?.touchUpDays);
  const noShowThreshold = data?.settings.noShowDepositThreshold ?? 2;
  const currentMonth = data ? data.serverTodayKey.slice(5, 7) : '';
  const nowMs = data ? Date.parse(data.serverNowIso) || 0 : 0;

  const metricsByClientId = useMemo(
    () =>
      data
        ? computeClientMetricsMap({
            clients: data.clients,
            bookings: data.bookings,
            clientPackagesByClientId: packagesByClientId,
            loyaltyByClientId,
            noShowStatsByClient,
            noShowThreshold,
            currentMonth,
            nowMs,
            inactiveDaysThreshold: touchUpDays,
          })
        : new Map(),
    [
      data,
      packagesByClientId,
      loyaltyByClientId,
      noShowStatsByClient,
      noShowThreshold,
      currentMonth,
      nowMs,
      touchUpDays,
    ],
  );

  const directoryKpis = useMemo(
    () =>
      data
        ? computeClientDirectoryKpis(data.clients, metricsByClientId)
        : {
            totalClients: 0,
            vipClients: 0,
            packageOrRewardClients: 0,
            alertOrInactiveClients: 0,
          },
    [data, metricsByClientId],
  );

  const filteredClients = useMemo(
    () =>
      data
        ? filterAndSortClients({
            clients: data.clients,
            metricsByClientId,
            query,
            filter: directoryFilter,
            sort: directorySort,
          })
        : [],
    [data, metricsByClientId, query, directoryFilter, directorySort],
  );

  if (legacyRedirectHref || !data || !data.retention) {
    return (
      <PageSkeleton
        kpiCount={4}
        withSplit={false}
        ariaLabel={
          legacyRedirectHref
            ? 'Abriendo Fidelización'
            : 'Cargando clientas'
        }
      />
    );
  }

  const tz = data.settings.timezone || 'America/Mexico_City';
  const currency = data.settings.currency;
  const nearRewardClients = data.nearRewardClients;
  const selectedClient = selected
    ? (data.clients.find((client) => client.id === selected.id) ?? selected)
    : null;

  const syncDirectoryUrl = (next: {
    q?: string;
    filter?: ClientDirectoryFilter;
    clientId?: string | null;
  }) => {
    const nextQ = (next.q ?? query).trim();
    const nextFilter = next.filter ?? directoryFilter;
    const nextClientId =
      next.clientId === undefined ? parsedParams.clientId : (next.clientId ?? undefined);
    router.replace(
      clientasHref({
        ...(nextQ ? { q: nextQ } : {}),
        ...(nextFilter !== 'all' ? { filter: nextFilter } : {}),
        ...(nextClientId ? { clientId: nextClientId } : {}),
      }),
      { scroll: false },
    );
  };

  const handleCloseProfile = () => {
    setSelected(null);
    if (parsedParams.clientId) {
      syncDirectoryUrl({ clientId: null });
    }
  };

  const handleSelectClient = (client: ClientProfile) => {
    setSelected(client);
  };

  const handleFilterChange = (nextFilter: ClientDirectoryFilter) => {
    setDirectoryFilter(nextFilter);
    syncDirectoryUrl({ filter: nextFilter });
  };

  const handleQueryChange = (nextQuery: string) => {
    setQuery(nextQuery);
    syncDirectoryUrl({ q: nextQuery });
  };

  const clientKpiItems: MetricTileItem[] = [
    {
      id: 'total-clients',
      label: 'Total clientas',
      value: String(directoryKpis.totalClients),
      sub: `${returningClients.length} frecuentes (2+ visitas)`,
    },
    {
      id: 'vip-clients',
      label: 'Frecuentes / VIP',
      value: String(directoryKpis.vipClients),
      sub: '3+ visitas o mayor consumo',
      tone: directoryKpis.vipClients > 0 ? 'accent' : 'default',
    },
    {
      id: 'package-reward',
      label: 'Paquete o premio',
      value: String(directoryKpis.packageOrRewardClients),
      sub: `${activeClientPackages.length} ${activeClientPackages.length === 1 ? 'paquete' : 'paquetes'} · ${nearRewardClients.length} cerca de premio`,
    },
    {
      id: 'alerts-inactive',
      label: 'Alertas / inactivas',
      value: String(directoryKpis.alertOrInactiveClients),
      sub: `Sin visita +${touchUpDays} d o alertas`,
      tone: directoryKpis.alertOrInactiveClients > 0 ? 'warning' : 'success',
    },
  ];

  const handleSaveClient = async (input: {
    clientId: string;
    fullName?: string;
    phone?: string;
    notes: string;
    birthday: string | null;
    email: string | null;
    instagramHandle: string | null;
  }): Promise<string | null> => {
    if (savingClient) return null;
    setSavingClient(true);
    try {
      const errorText = await saveClientProfileRequest(input);
      if (errorText) return errorText;
      handleCloseProfile();
      setBannerMsg({ status: 'success', title: 'Ficha de clienta actualizada.' });
      invalidateAdminDomain('clients');
      await refresh();
      return null;
    } finally {
      setSavingClient(false);
    }
  };

  const handleDeleteClient = async (
    clientId: string,
  ): Promise<{ ok: boolean; error?: string; code?: string }> => {
    if (savingClient) return { ok: false };
    setSavingClient(true);
    try {
      const result = await deleteClientProfileRequest(clientId);
      if (!result.ok) return result;
      handleCloseProfile();
      setBannerMsg({ status: 'success', title: 'Clienta eliminada del directorio.' });
      invalidateAdminDomain('clients');
      await refresh();
      return result;
    } finally {
      setSavingClient(false);
    }
  };

  const handleCreateClient = async (input: {
    fullName: string;
    phone: string;
    email: string | null;
    instagramHandle: string | null;
    birthday: string | null;
    technicalNotes: string;
  }) => {
    if (savingClient) return { ok: false, error: 'Guardando cambios…' };
    setSavingClient(true);
    try {
      const result = await createClientProfileRequest(input);
      if (!result.ok) return result;
      setBannerMsg({ status: 'success', title: 'Clienta agregada al directorio.' });
      invalidateAdminDomain('clients');
      await refresh();
      return result;
    } finally {
      setSavingClient(false);
    }
  };

  const handleAssignPackage = async (
    targetClientId: string,
    targetPackageId: string,
    notesText: string,
  ): Promise<boolean> => {
    if (assigningPkg || !targetClientId || !targetPackageId) return false;
    setAssigningPkg(true);
    try {
      const result = await assignClientPackageRequest(
        targetClientId,
        targetPackageId,
        notesText,
      );
      if (result.ok) {
        invalidateAdminDomain('packages');
        reloadPackages();
      }
      setBannerMsg(result.notice);
      return result.ok;
    } finally {
      setAssigningPkg(false);
    }
  };

  const handleRedeemPackageSession = async (pkg: ClientPackageRow) => {
    if (redeemingPkgId || cancelingPkgId) return;
    setRedeemingPkgId(pkg.id);
    try {
      const result = await redeemClientPackageSessionRequest(pkg);
      if (result.ok) {
        invalidateAdminDomain('packages');
        reloadPackages();
      }
      setBannerMsg(result.notice);
    } finally {
      setRedeemingPkgId(null);
    }
  };

  const handleCancelPackage = async (pkg: ClientPackageRow) => {
    if (cancelingPkgId || redeemingPkgId) return;
    setCancelingPkgId(pkg.id);
    try {
      const result = await cancelClientPackageRequest(pkg);
      if (result.ok) {
        invalidateAdminDomain('packages');
        reloadPackages();
      }
      setBannerMsg(result.notice);
    } finally {
      setCancelingPkgId(null);
    }
  };

  return (
    <AdminAccessGuard role={data.session.user.role} section="clients" sectionLabel="Clientas">
      <VStack gap={5} className="ad-page">
        <PageHeader
          title="Clientas"
          subtitle="Directorio, ficha técnica de uñas, historial y seguimiento individual."
          actions={
            canManageClients || roleCanAccess(data.session.user.role, 'loyalty') ? (
              <HStack gap={2} wrap="wrap">
                {roleCanAccess(data.session.user.role, 'loyalty') ? (
                  <Button
                    label="Fidelización y campañas"
                    variant="secondary"
                    size="sm"
                    icon={<Gift size={15} aria-hidden="true" />}
                    href={fidelizacionHref({ tab: 'sellos' })}
                  />
                ) : null}
                {canManageClients ? (
                  <Button
                    type="button"
                    label="Nueva clienta"
                    variant="primary"
                    size="sm"
                    icon={<UserPlus size={15} aria-hidden="true" />}
                    onClick={() => setCreateOpen(true)}
                  />
                ) : null}
              </HStack>
            ) : undefined
          }
        />

        {bannerMsg ? (
          <Banner
            status={bannerMsg.status}
            role={bannerMsg.status === 'error' ? 'alert' : 'status'}
            title={bannerMsg.title}
            endContent={
              bannerMsg.whatsappUrl ? (
                <Button
                  label="Abrir WhatsApp"
                  variant="primary"
                  size="sm"
                  icon={<MessageCircle size={14} aria-hidden="true" />}
                  href={bannerMsg.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              ) : undefined
            }
            isDismissable
            onDismiss={() => setBannerMsg(null)}
          />
        ) : null}

        <MetricGrid
          ariaLabel="Resumen de clientas"
          className="ad-dash-kpis"
          cols={4}
          items={clientKpiItems}
        />

        <ClientDirectoryTab
          query={query}
          onQueryChange={handleQueryChange}
          filter={directoryFilter}
          onFilterChange={handleFilterChange}
          sort={directorySort}
          onSortChange={setDirectorySort}
          clients={filteredClients}
          metricsByClientId={metricsByClientId}
          loyaltyByClientId={loyaltyByClientId}
          tz={tz}
          currency={currency}
          canManageClients={canManageClients}
          onSelectClient={handleSelectClient}
          onOpenNewClient={() => setCreateOpen(true)}
        />

        {createOpen ? (
          <NewClientDialog
            isOpen={createOpen}
            onOpenChange={setCreateOpen}
            onCreateClient={handleCreateClient}
          />
        ) : null}

        {selectedClient ? (
          <ClientProfileDialog
            key={selectedClient.id}
            client={selectedClient}
            onClose={handleCloseProfile}
            salonName={data.settings.name}
            tz={tz}
            currency={currency}
            metrics={metricsByClientId.get(selectedClient.id) ?? null}
            noShowThreshold={noShowThreshold}
            noShowStats={noShowStatsByClient.get(selectedClient.id) ?? null}
            canManageClients={canManageClients}
            packagesSupported={packagesSupported}
            loyalty={loyaltyByClientId.get(selectedClient.id) ?? null}
            clientPackages={packagesByClientId.get(selectedClient.id) ?? []}
            activeCatalogPackages={activeCatalogPackages}
            bookings={data.bookings}
            assigningPkg={assigningPkg}
            redeemingPkgId={redeemingPkgId}
            cancelingPkgId={cancelingPkgId}
            packageNotice={
              bannerMsg ? { status: bannerMsg.status, title: bannerMsg.title } : null
            }
            onDismissPackageNotice={() => setBannerMsg(null)}
            onSaveClient={handleSaveClient}
            onDeleteClient={handleDeleteClient}
            onAssignPackage={handleAssignPackage}
            onRedeemPackageSession={handleRedeemPackageSession}
            onCancelPackage={handleCancelPackage}
          />
        ) : null}
      </VStack>
    </AdminAccessGuard>
  );
}
