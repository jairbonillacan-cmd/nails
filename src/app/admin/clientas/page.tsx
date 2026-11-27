'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { VStack } from '@astryxdesign/core/VStack';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { MessageCircle, UserPlus } from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import { AdminAccessGuard } from '@/components/admin/AdminAccessGuard';
import { ClientDirectoryTab } from '@/components/admin/clientas/ClientDirectoryTab';
import {
  assignClientPackageRequest,
  cancelClientPackageRequest,
  createClientProfileRequest,
  deleteClientProfileRequest,
  dispatchRetentionCampaignRequest,
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
import type {
  BannerNotice,
  ClientPackageRow,
  ClientsTab,
} from '@/components/admin/clientas/clientasTypes';
import {
  MetricGrid,
  PageHeader,
  PageSkeleton,
  SkeletonBlock,
  type MetricTileItem,
} from '@/components/ui';
import { parseClientasParams } from '@/lib/admin-links';
import { normalizeTouchUpDays } from '@/lib/booking/recurrence';
import { invalidateAdminCache } from '@/lib/hooks/useAdminCache';
import type { ClientProfile } from '@/lib/types';

function ClientsTabFallback() {
  return (
    <VStack gap={3} role="status" aria-live="polite" aria-label="Cargando sección">
      <SkeletonBlock width="100%" height="5rem" radius={3} index={0} />
      <SkeletonBlock width="100%" height="10rem" radius={3} index={1} />
    </VStack>
  );
}

const ClientRetentionTab = dynamic(
  () =>
    import('@/components/admin/clientas/ClientRetentionTab').then(
      (mod) => mod.ClientRetentionTab,
    ),
  { ssr: false, loading: ClientsTabFallback },
);

const ClientLoyaltyTab = dynamic(
  () =>
    import('@/components/admin/clientas/ClientLoyaltyTab').then(
      (mod) => mod.ClientLoyaltyTab,
    ),
  { ssr: false, loading: ClientsTabFallback },
);

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

export default function AdminClientsPage() {
  const { data: providerData, bookingEventSeq, refresh } = useAdminData();
  const searchParams = useSearchParams();
  const parsedParams = parseClientasParams(searchParams);
  const [selected, setSelected] = useState<ClientProfile | null>(null);
  const [directoryFilter, setDirectoryFilter] = useState<ClientDirectoryFilter>(
    () => parsedParams.filter ?? 'all',
  );
  const [directorySort, setDirectorySort] = useState<ClientDirectorySort>('alpha');

  const {
    data,
    canManageClients,
    activeTab,
    setActiveTab,
    query,
    setQuery,
    inactiveDays,
    setInactiveDays,
    activeCatalogPackages,
    clientPackages,
    activeClientPackages,
    campaigns,
    displayedInactiveClients,
    dispatchedTodayKeys,
    comebackCount,
    loyaltyHighlightsCount,
    noShowStatsByClient,
    loyaltyByClientId,
    returningClients,
    packagesByClientId,
    packagesLoading,
    campaignsLoading,
    inactiveLoading,
    inactiveError,
    reloadCampaigns,
    reloadPackages,
  } = useClientasData(
    providerData,
    bookingEventSeq,
    parsedParams.tab ?? searchParams.get('tab'),
    parsedParams.q ?? '',
    Boolean(selected),
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [bannerMsg, setBannerMsg] = useState<BannerNotice | null>(null);
  const [dispatchingKey, setDispatchingKey] = useState<string | null>(null);
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

  const lastServiceByClientId = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const [clientId, metrics] of metricsByClientId.entries()) {
      map.set(clientId, metrics.lastServiceName);
    }
    return map;
  }, [metricsByClientId]);

  if (!data || !data.retention) {
    return <PageSkeleton kpiCount={4} withSplit={false} ariaLabel="Cargando clientas" />;
  }

  const tz = data.settings.timezone || 'America/Mexico_City';
  const currency = data.settings.currency;
  const nearRewardClients = data.nearRewardClients;
  const selectedClient = selected
    ? (data.clients.find((client) => client.id === selected.id) ?? selected)
    : null;

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
    const errorText = await saveClientProfileRequest(input);
    if (errorText) return errorText;
    setSelected(null);
    setBannerMsg({ status: 'success', title: 'Ficha de clienta actualizada.' });
    invalidateAdminCache('/api/admin/clients');
    await refresh();
    return null;
  };

  const handleDeleteClient = async (
    clientId: string,
  ): Promise<{ ok: boolean; error?: string; code?: string }> => {
    const result = await deleteClientProfileRequest(clientId);
    if (!result.ok) return result;
    setSelected(null);
    setBannerMsg({ status: 'success', title: 'Clienta eliminada del directorio.' });
    invalidateAdminCache('/api/admin/clients');
    await refresh();
    return result;
  };

  const handleCreateClient = async (input: {
    fullName: string;
    phone: string;
    email: string | null;
    instagramHandle: string | null;
    birthday: string | null;
    technicalNotes: string;
  }) => {
    const result = await createClientProfileRequest(input);
    if (!result.ok) return result;
    setBannerMsg({ status: 'success', title: 'Clienta agregada al directorio.' });
    invalidateAdminCache('/api/admin/clients');
    await refresh();
    return result;
  };

  const handleDispatchCampaign = async (params: {
    kind: 'birthday' | 'reactivation';
    clientId: string;
    clientName: string;
    messagePreview: string;
    fallbackUrl: string;
  }) => {
    setDispatchingKey(`${params.kind}:${params.clientId}`);
    try {
      const result = await dispatchRetentionCampaignRequest(params);
      if (result.ok && result.targetUrl) {
        window.open(result.targetUrl, '_blank', 'noopener,noreferrer');
        reloadCampaigns();
      }
      setBannerMsg(result.notice);
    } finally {
      setDispatchingKey(null);
    }
  };

  const handleAssignPackage = async (
    targetClientId: string,
    targetPackageId: string,
    notesText: string,
  ): Promise<boolean> => {
    if (!targetClientId || !targetPackageId) return false;
    setAssigningPkg(true);
    try {
      const result = await assignClientPackageRequest(
        targetClientId,
        targetPackageId,
        notesText,
      );
      if (result.ok) reloadPackages();
      setBannerMsg(result.notice);
      return result.ok;
    } finally {
      setAssigningPkg(false);
    }
  };

  const handleRedeemPackageSession = async (pkg: ClientPackageRow) => {
    setRedeemingPkgId(pkg.id);
    try {
      const result = await redeemClientPackageSessionRequest(pkg);
      if (result.ok) reloadPackages();
      setBannerMsg(result.notice);
    } finally {
      setRedeemingPkgId(null);
    }
  };

  const handleCancelPackage = async (pkg: ClientPackageRow) => {
    setCancelingPkgId(pkg.id);
    try {
      const result = await cancelClientPackageRequest(pkg);
      if (result.ok) reloadPackages();
      setBannerMsg(result.notice);
    } finally {
      setCancelingPkgId(null);
    }
  };

  const openClientById = (clientId: string) => {
    const found = data.clients.find((c) => c.id === clientId);
    if (found) setSelected(found);
  };

  return (
    <AdminAccessGuard role={data.session.user.role} section="clients" sectionLabel="Clientas">
      <VStack gap={5} className="ad-page">
        <PageHeader
          title="Clientas"
          subtitle="Historial, ficha técnica de uñas, seguimiento y retención en un solo lugar."
          actions={
            canManageClients ? (
              <Button
                type="button"
                label="Nueva clienta"
                variant="primary"
                size="sm"
                icon={<UserPlus size={15} aria-hidden="true" />}
                onClick={() => setCreateOpen(true)}
              />
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

        <TabList value={activeTab} onChange={(v) => setActiveTab(v as ClientsTab)} hasDivider>
          <Tab value="directory" label={`Directorio (${filteredClients.length})`} />
          <Tab
            value="retention"
            label={
              comebackCount > 0
                ? `Traerlas de vuelta (${comebackCount})`
                : 'Traerlas de vuelta'
            }
          />
          <Tab
            value="loyalty"
            label={
              loyaltyHighlightsCount > 0
                ? `Sellos y paquetes (${loyaltyHighlightsCount})`
                : 'Sellos y paquetes'
            }
          />
        </TabList>

        {activeTab === 'directory' ? (
          <ClientDirectoryTab
            query={query}
            onQueryChange={setQuery}
            filter={directoryFilter}
            onFilterChange={setDirectoryFilter}
            sort={directorySort}
            onSortChange={setDirectorySort}
            clients={filteredClients}
            metricsByClientId={metricsByClientId}
            loyaltyByClientId={loyaltyByClientId}
            tz={tz}
            currency={currency}
            canManageClients={canManageClients}
            onSelectClient={setSelected}
            onOpenNewClient={() => setCreateOpen(true)}
          />
        ) : activeTab === 'retention' ? (
          <ClientRetentionTab
            canManageClients={canManageClients}
            salonName={data.settings.name}
            tz={tz}
            touchUpDays={touchUpDays}
            inactiveDays={inactiveDays}
            onInactiveDaysChange={setInactiveDays}
            displayedInactiveClients={displayedInactiveClients}
            lastServiceByClientId={lastServiceByClientId}
            inactiveLoading={inactiveLoading}
            inactiveError={inactiveError}
            campaigns={campaigns}
            campaignsLoading={campaignsLoading}
            dispatchedTodayKeys={dispatchedTodayKeys}
            dispatchingKey={dispatchingKey}
            nearRewardCount={nearRewardClients.length}
            returningClients={returningClients}
            onOpenClientById={openClientById}
            onOpenLoyalty={() => setActiveTab('loyalty')}
            onDispatchCampaign={handleDispatchCampaign}
          />
        ) : (
          <ClientLoyaltyTab
            nearRewardClients={nearRewardClients}
            loyaltyProgram={data.loyaltyProgram}
            clients={data.clients}
            clientPackages={clientPackages}
            activeClientPackagesCount={activeClientPackages.length}
            activeCatalogPackages={activeCatalogPackages}
            packagesLoading={packagesLoading}
            canManageClients={canManageClients}
            salonName={data.settings.name}
            tz={tz}
            currency={currency}
            assigningPkg={assigningPkg}
            redeemingPkgId={redeemingPkgId}
            cancelingPkgId={cancelingPkgId}
            onOpenClientById={openClientById}
            onAssignPackage={handleAssignPackage}
            onRedeemPackageSession={handleRedeemPackageSession}
            onCancelPackage={handleCancelPackage}
          />
        )}

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
            onClose={() => setSelected(null)}
            salonName={data.settings.name}
            tz={tz}
            currency={currency}
            metrics={metricsByClientId.get(selectedClient.id) ?? null}
            noShowThreshold={noShowThreshold}
            noShowStats={noShowStatsByClient.get(selectedClient.id) ?? null}
            canManageClients={canManageClients}
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
