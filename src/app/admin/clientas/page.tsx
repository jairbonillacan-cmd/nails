'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { VStack } from '@astryxdesign/core/VStack';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { MessageCircle, UserPlus } from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import { ClientDirectoryTab } from '@/components/admin/clientas/ClientDirectoryTab';
import {
  assignClientPackageRequest,
  createClientProfileRequest,
  dispatchRetentionCampaignRequest,
  redeemClientPackageSessionRequest,
  saveClientProfileRequest,
} from '@/components/admin/clientas/clientasActions';
import { useClientasData } from '@/components/admin/clientas/useClientasData';
import type {
  BannerNotice,
  ClientPackageRow,
  ClientsTab,
} from '@/components/admin/clientas/clientasTypes';
import { MetricGrid, PageHeader, PageSkeleton, SkeletonBlock } from '@/components/ui';
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
  const {
    data,
    canManageClients,
    activeTab,
    setActiveTab,
    query,
    setQuery,
    onlyBirthdays,
    setOnlyBirthdays,
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
    kpiItems,
    visitCountByClient,
    noShowStatsByClient,
    loyaltyByClientId,
    rows,
    groupedByLetter,
    returningClients,
    packagesByClientId,
    packagesLoading,
    campaignsLoading,
    inactiveLoading,
    inactiveError,
    revalidateClients,
    reloadCampaigns,
    reloadPackages,
  } = useClientasData(
    providerData,
    bookingEventSeq,
    searchParams.get('tab'),
    searchParams.get('q')?.trim() ?? '',
  );

  const [selected, setSelected] = useState<ClientProfile | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [bannerMsg, setBannerMsg] = useState<BannerNotice | null>(null);
  const [dispatchingKey, setDispatchingKey] = useState<string | null>(null);
  const [assigningPkg, setAssigningPkg] = useState(false);
  const [redeemingPkgId, setRedeemingPkgId] = useState<string | null>(null);

  if (!data || !data.retention) {
    return <PageSkeleton kpiCount={3} withSplit={false} ariaLabel="Cargando clientas" />;
  }

  const tz = data.settings.timezone || 'America/Mexico_City';
  const currency = data.settings.currency;
  const noShowThreshold = data.settings.noShowDepositThreshold ?? 2;
  const nearRewardClients = data.nearRewardClients;

  const handleSaveClient = async (input: {
    clientId: string;
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
    revalidateClients();
    return null;
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
    revalidateClients();
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

  const openClientById = (clientId: string) => {
    const found = data.clients.find((c) => c.id === clientId);
    if (found) setSelected(found);
  };

  return (
    <VStack gap={5} className="ad-page fx-fade-up">
      <PageHeader
        title="Clientas"
        subtitle="Busca tus clientas, revisa sus sellos y paquetes, y escribe a quienes no han vuelto."
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

      <MetricGrid ariaLabel="Resumen de clientas" cols={3} items={kpiItems} />

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

      <TabList value={activeTab} onChange={(v) => setActiveTab(v as ClientsTab)} hasDivider>
        <Tab value="directory" label={`Directorio (${rows.length})`} />
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
          onlyBirthdays={onlyBirthdays}
          onOnlyBirthdaysChange={setOnlyBirthdays}
          groupedByLetter={groupedByLetter}
          visitCountByClient={visitCountByClient}
          noShowStatsByClient={noShowStatsByClient}
          loyaltyByClientId={loyaltyByClientId}
          packagesByClientId={packagesByClientId}
          noShowThreshold={noShowThreshold}
          salonName={data.settings.name}
          canManageClients={canManageClients}
          onSelectClient={setSelected}
          onOpenNewClient={() => setCreateOpen(true)}
        />
      ) : activeTab === 'retention' ? (
        <ClientRetentionTab
          canManageClients={canManageClients}
          salonName={data.settings.name}
          tz={tz}
          inactiveDays={inactiveDays}
          onInactiveDaysChange={setInactiveDays}
          displayedInactiveClients={displayedInactiveClients}
          inactiveLoading={inactiveLoading}
          inactiveError={inactiveError}
          campaigns={campaigns}
          campaignsLoading={campaignsLoading}
          dispatchedTodayKeys={dispatchedTodayKeys}
          dispatchingKey={dispatchingKey}
          nearRewardCount={nearRewardClients.length}
          returningClients={returningClients}
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
          onOpenClientById={openClientById}
          onAssignPackage={handleAssignPackage}
          onRedeemPackageSession={handleRedeemPackageSession}
        />
      )}

      {createOpen ? (
        <NewClientDialog
          isOpen={createOpen}
          onOpenChange={setCreateOpen}
          onCreateClient={handleCreateClient}
        />
      ) : null}

      {selected ? (
        <ClientProfileDialog
          key={selected.id}
          client={selected}
          onClose={() => setSelected(null)}
          salonName={data.settings.name}
          tz={tz}
          noShowThreshold={noShowThreshold}
          noShowStats={noShowStatsByClient.get(selected.id) ?? null}
          canManageClients={canManageClients}
          loyalty={loyaltyByClientId.get(selected.id) ?? null}
          clientPackages={packagesByClientId.get(selected.id) ?? []}
          activeCatalogPackages={activeCatalogPackages}
          bookings={data.bookings}
          assigningPkg={assigningPkg}
          redeemingPkgId={redeemingPkgId}
          onSaveClient={handleSaveClient}
          onAssignPackage={handleAssignPackage}
          onRedeemPackageSession={handleRedeemPackageSession}
        />
      ) : null}
    </VStack>
  );
}
