'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { MessageCircle, UserPlus } from 'lucide-react';
import {
  useAdminData,
  type AdminOverviewPayload,
} from '@/components/admin/AdminProvider';
import { ClientDirectoryTab } from '@/components/admin/clientas/ClientDirectoryTab';
import { ClientRetentionTab } from '@/components/admin/clientas/ClientRetentionTab';
import { ClientLoyaltyTab } from '@/components/admin/clientas/ClientLoyaltyTab';
import { ClientProfileDialog } from '@/components/admin/clientas/ClientProfileDialog';
import { NewClientDialog } from '@/components/admin/clientas/NewClientDialog';
import {
  getInitialLetter,
  resolveClientasTabParam,
  type BannerNotice,
  type CampaignsPayload,
  type ClientPackageRow,
  type ClientsTab,
  type InactiveClientRow,
} from '@/components/admin/clientas/clientasTypes';
import {
  ADMIN_CACHE_KEYS,
  fetchAdminJson,
  invalidateAdminCache,
  useAdminCachedQuery,
} from '@/lib/hooks/useAdminCache';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import { computeClientLoyaltySummary } from '@/lib/loyalty/stamps';
import type { ClientProfile, ServicePackage } from '@/lib/types';

interface ClientsQueryPayload {
  clients: ClientProfile[];
  nearRewardClients: AdminOverviewPayload['nearRewardClients'];
}

interface PackagesQueryPayload {
  servicePackages?: ServicePackage[];
  clientPackages?: ClientPackageRow[];
}

interface InactiveClientsQueryPayload {
  inactiveDays?: number;
  clients?: InactiveClientRow[];
}

export default function AdminClientsPage() {
  const { data: providerData, bookingEventSeq, refresh } = useAdminData();
  const searchParams = useSearchParams();
  const paramTab = searchParams.get('tab');
  const paramQuery = searchParams.get('q')?.trim() ?? '';

  const [activeTab, setActiveTab] = useState<ClientsTab>(
    () => resolveClientasTabParam(paramTab) ?? 'directory',
  );
  const [query, setQuery] = useState<string>(() => paramQuery);
  const [onlyBirthdays, setOnlyBirthdays] = useState(false);
  const [inactiveDays, setInactiveDays] = useState<number>(21);

  const [selected, setSelected] = useState<ClientProfile | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [bannerMsg, setBannerMsg] = useState<BannerNotice | null>(null);

  const [campaignsSeq, setCampaignsSeq] = useState(0);
  const [dispatchingKey, setDispatchingKey] = useState<string | null>(null);
  const [packagesSeq, setPackagesSeq] = useState(0);
  const [assigningPkg, setAssigningPkg] = useState(false);
  const [redeemingPkgId, setRedeemingPkgId] = useState<string | null>(null);

  const lastUrlKeyRef = useRef(`${paramTab ?? ''}|${paramQuery}`);

  const canManageClients = Boolean(
    providerData &&
      (providerData.session.user.role === 'owner' ||
        providerData.session.user.role === 'admin'),
  );

  useExternalSync(`clients-url|${paramTab ?? ''}|${paramQuery}`, async (signal) => {
    if (signal.aborted) return;
    const key = `${paramTab ?? ''}|${paramQuery}`;
    if (lastUrlKeyRef.current === key) return;
    lastUrlKeyRef.current = key;
    const nextTab = resolveClientasTabParam(paramTab);
    if (nextTab) setActiveTab(nextTab);
    if (paramQuery) setQuery(paramQuery);
  });

  const fetchClients = useCallback(
    (signal: AbortSignal) =>
      fetchAdminJson<ClientsQueryPayload>(ADMIN_CACHE_KEYS.clients, signal),
    [],
  );
  const fetchPackages = useCallback(
    (signal: AbortSignal) =>
      fetchAdminJson<PackagesQueryPayload>(ADMIN_CACHE_KEYS.packages, signal),
    [],
  );
  const fetchCampaigns = useCallback(
    (signal: AbortSignal) =>
      fetchAdminJson<CampaignsPayload>(ADMIN_CACHE_KEYS.campaigns, signal),
    [],
  );
  const inactiveKey = ADMIN_CACHE_KEYS.clientsInactive(inactiveDays);
  const fetchInactive = useCallback(
    (signal: AbortSignal) =>
      fetchAdminJson<InactiveClientsQueryPayload>(inactiveKey, signal),
    [inactiveKey],
  );

  const clientsQuery = useAdminCachedQuery<ClientsQueryPayload>(
    canManageClients ? ADMIN_CACHE_KEYS.clients : null,
    fetchClients,
    {
      enabled: canManageClients,
      initialData: providerData
        ? {
            clients: providerData.clients,
            nearRewardClients: providerData.nearRewardClients,
          }
        : undefined,
      staleTimeMs: 10_000,
      revalidateKey: bookingEventSeq,
    },
  );

  const packagesQuery = useAdminCachedQuery<PackagesQueryPayload>(
    providerData ? ADMIN_CACHE_KEYS.packages : null,
    fetchPackages,
    {
      enabled: Boolean(providerData),
      staleTimeMs: 10_000,
      revalidateKey: packagesSeq,
    },
  );

  const campaignsQuery = useAdminCachedQuery<CampaignsPayload>(
    canManageClients ? ADMIN_CACHE_KEYS.campaigns : null,
    fetchCampaigns,
    {
      enabled: canManageClients,
      staleTimeMs: 10_000,
      revalidateKey: campaignsSeq,
    },
  );

  const inactiveQuery = useAdminCachedQuery<InactiveClientsQueryPayload>(
    activeTab === 'retention' && canManageClients ? inactiveKey : null,
    fetchInactive,
    {
      enabled: activeTab === 'retention' && canManageClients,
      staleTimeMs: 10_000,
      revalidateKey: bookingEventSeq,
    },
  );

  const data = useMemo<AdminOverviewPayload | null>(() => {
    if (!providerData) return null;
    const cachedClients = clientsQuery.data;
    if (!cachedClients) return providerData;
    return {
      ...providerData,
      clients: cachedClients.clients,
      nearRewardClients: cachedClients.nearRewardClients,
    };
  }, [providerData, clientsQuery.data]);

  const servicePackages = useMemo(
    () => packagesQuery.data?.servicePackages ?? [],
    [packagesQuery.data],
  );
  const clientPackages = useMemo(
    () => packagesQuery.data?.clientPackages ?? [],
    [packagesQuery.data],
  );
  const campaigns = campaignsQuery.data ?? null;
  const inactiveResult = useMemo(
    () =>
      inactiveQuery.data
        ? {
            days: inactiveQuery.data.inactiveDays ?? inactiveDays,
            clients: inactiveQuery.data.clients ?? [],
          }
        : null,
    [inactiveQuery.data, inactiveDays],
  );

  const currentMonth = data ? data.serverTodayKey.slice(5, 7) : '';

  const visitCountByClient = useMemo(() => {
    const map = new Map<string, number>();
    if (!data) return map;
    for (const b of data.bookings) {
      if (b.status === 'canceled') continue;
      map.set(b.clientId, (map.get(b.clientId) ?? 0) + 1);
    }
    return map;
  }, [data]);

  const loyaltyByClientId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeClientLoyaltySummary>>();
    if (!data || !data.loyaltyProgram) return map;
    const rewardServiceName = data.loyaltyProgram.rewardServiceId
      ? (data.services.find((s) => s.id === data.loyaltyProgram?.rewardServiceId)?.name ??
        null)
      : null;
    for (const client of data.clients) {
      map.set(
        client.id,
        computeClientLoyaltySummary(
          data.loyaltyProgram,
          data.loyaltyStamps,
          client.id,
          rewardServiceName,
        ),
      );
    }
    return map;
  }, [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    const trimmed = query.trim();
    const q = trimmed.toLowerCase();
    const qDigits = trimmed.replace(/\D/g, '');
    const filtered = data.clients.filter((c) => {
      if (onlyBirthdays && (!c.birthday || c.birthday.slice(5, 7) !== currentMonth)) {
        return false;
      }
      if (!trimmed) return true;
      const phoneDigits = c.phoneE164.replace(/\D/g, '');
      return (
        c.fullName.toLowerCase().includes(q) ||
        c.phoneE164.toLowerCase().includes(q) ||
        (qDigits.length >= 4 && phoneDigits.includes(qDigits)) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.instagramHandle || '').toLowerCase().includes(q) ||
        c.notes.toLowerCase().includes(q)
      );
    });
    return filtered.toSorted((a, b) => a.fullName.localeCompare(b.fullName, 'es'));
  }, [data, query, onlyBirthdays, currentMonth]);

  const groupedByLetter = useMemo(() => {
    const groups = new Map<string, ClientProfile[]>();
    for (const client of rows) {
      const letter = getInitialLetter(client.fullName);
      const list = groups.get(letter) ?? [];
      list.push(client);
      groups.set(letter, list);
    }
    return Array.from(groups.entries()).toSorted(([a], [b]) => {
      if (a === '#') return 1;
      if (b === '#') return -1;
      return a.localeCompare(b, 'es');
    });
  }, [rows]);

  const returningClients = useMemo(() => {
    if (!data) return [];
    return data.clients
      .map((client) => ({
        client,
        visits: visitCountByClient.get(client.id) ?? 0,
      }))
      .filter((entry) => entry.visits >= 2)
      .toSorted((a, b) => b.visits - a.visits);
  }, [data, visitCountByClient]);

  const packagesByClientId = useMemo(() => {
    const map = new Map<string, ClientPackageRow[]>();
    for (const pkg of clientPackages) {
      const list = map.get(pkg.clientId) ?? [];
      list.push(pkg);
      map.set(pkg.clientId, list);
    }
    return map;
  }, [clientPackages]);

  const activeClientPackages = useMemo(
    () =>
      clientPackages.filter(
        (pkg) => pkg.status === 'active' && !pkg.isExpired && pkg.remainingSessions > 0,
      ),
    [clientPackages],
  );

  const retention = data?.retention ?? null;
  if (!data || !retention) return null;

  const tz = data.settings.timezone || 'America/Mexico_City';
  const currency = data.settings.currency;
  const noShowThreshold = data.settings.noShowDepositThreshold ?? 2;
  const nearRewardClients = data.nearRewardClients;
  const activeCatalogPackages = servicePackages.filter((p) => p.isActive);
  const displayedInactiveClients: InactiveClientRow[] = canManageClients
    ? (inactiveResult?.clients ?? retention.inactiveClients)
    : retention.inactiveClients.filter((item) => item.daysSinceLastVisit >= inactiveDays);

  const dispatchedTodayKeys = new Set(
    (campaigns?.recentDispatches ?? []).map((d) => `${d.kind}:${d.clientId}`),
  );
  const comebackCount =
    displayedInactiveClients.length + (campaigns?.birthdays.length ?? 0);
  const loyaltyHighlightsCount =
    nearRewardClients.length + activeClientPackages.length;

  const handleSaveClient = async (input: {
    clientId: string;
    notes: string;
    birthday: string | null;
    email: string | null;
    instagramHandle: string | null;
  }): Promise<string | null> => {
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        return json.error || 'No se pudo actualizar la ficha.';
      }
      setSelected(null);
      setBannerMsg({ status: 'success', title: 'Ficha de clienta actualizada.' });
      invalidateAdminCache('/api/admin/clients');
      await refresh();
      void clientsQuery.revalidate();
      return null;
    } catch {
      return 'No se pudo conectar para guardar la ficha.';
    }
  };

  const handleCreateClient = async (input: {
    fullName: string;
    phone: string;
    email: string | null;
    instagramHandle: string | null;
    birthday: string | null;
    technicalNotes: string;
  }): Promise<{ ok: boolean; error?: string; conflict?: boolean }> => {
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json = (await res.json()) as { error?: string };
      if (res.status === 409) {
        return {
          ok: false,
          conflict: true,
          error: json.error || 'Ya existe una clienta registrada con ese WhatsApp.',
        };
      }
      if (!res.ok) {
        return { ok: false, error: json.error || 'Revisa los datos ingresados.' };
      }
      setBannerMsg({
        status: 'success',
        title: 'Clienta agregada al directorio.',
      });
      invalidateAdminCache('/api/admin/clients');
      await refresh();
      void clientsQuery.revalidate();
      return { ok: true };
    } catch {
      return { ok: false, error: 'No se pudo conectar para guardar la clienta.' };
    }
  };

  const handleDispatchCampaign = async (params: {
    kind: 'birthday' | 'reactivation';
    clientId: string;
    clientName: string;
    messagePreview: string;
    fallbackUrl: string;
  }) => {
    const key = `${params.kind}:${params.clientId}`;
    setDispatchingKey(key);
    try {
      const res = await fetch('/api/admin/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: params.kind,
          clientId: params.clientId,
          messagePreview: params.messagePreview,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: string;
        whatsappUrl?: string;
      } | null;
      if (!res.ok) {
        setBannerMsg({
          status: 'error',
          title: json?.error || 'No se pudo registrar el envío.',
        });
        return;
      }
      const targetUrl = json?.whatsappUrl || params.fallbackUrl;
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
      setCampaignsSeq((prev) => prev + 1);
      setBannerMsg({
        status: 'success',
        title:
          params.kind === 'birthday'
            ? `Felicitación de cumpleaños lista para ${params.clientName}.`
            : `Mensaje de regreso listo para ${params.clientName}.`,
        whatsappUrl: targetUrl,
      });
    } catch {
      setBannerMsg({
        status: 'error',
        title: 'No se pudo conectar para registrar el mensaje.',
      });
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
      const res = await fetch('/api/admin/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'assign',
          clientId: targetClientId,
          packageId: targetPackageId,
          notes: notesText.trim(),
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setBannerMsg({
          status: 'error',
          title: json?.error || 'No se pudo asignar el paquete.',
        });
        return false;
      }
      setPackagesSeq((prev) => prev + 1);
      setBannerMsg({
        status: 'success',
        title: 'Paquete asignado a la clienta.',
      });
      return true;
    } catch {
      setBannerMsg({
        status: 'error',
        title: 'No se pudo conectar para asignar el paquete.',
      });
      return false;
    } finally {
      setAssigningPkg(false);
    }
  };

  const handleRedeemPackageSession = async (pkg: ClientPackageRow) => {
    setRedeemingPkgId(pkg.id);
    try {
      const res = await fetch('/api/admin/packages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'redeem',
          clientPackageId: pkg.id,
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setBannerMsg({
          status: 'error',
          title: json?.error || 'No se pudo descontar la sesión.',
        });
        return;
      }
      setPackagesSeq((prev) => prev + 1);
      setBannerMsg({
        status: 'success',
        title: `Se descontó 1 sesión de "${pkg.packageName}" (${pkg.clientName}).`,
      });
    } catch {
      setBannerMsg({
        status: 'error',
        title: 'No se pudo conectar para descontar la sesión.',
      });
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
      <HStack
        as="header"
        className="ad-page-head"
        justify="between"
        align="end"
        wrap="wrap"
        gap={3}
      >
        <VStack gap={1} className="ad-head-copy">
          <Heading level={1} className="ad-page-title">
            Clientas
          </Heading>
          <Text className="ad-page-sub">
            Busca tus clientas, revisa sus sellos y paquetes, y escribe a quienes no han vuelto.
          </Text>
        </VStack>

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

      <section aria-label="Resumen de clientas" className="ad-kpis-3 fx-stagger">
        <VStack as="article" className="ad-card ad-kpi-card fx-card-lift" gap={1}>
          <Text type="supporting" color="secondary" weight="medium" className="ad-kpi-label">
            Clientas
          </Text>
          <Text className="lk-serif ad-kpi-val fx-tabular" hasTabularNumbers>
            {data.clients.length}
          </Text>
          <Text type="supporting" color="secondary" className="ad-kpi-sub" hasTabularNumbers>
            {retention.returningClientsCount} frecuentes (2+ visitas)
          </Text>
        </VStack>

        <VStack as="article" className="ad-card ad-kpi-card fx-card-lift" gap={1}>
          <Text type="supporting" color="secondary" weight="medium" className="ad-kpi-label">
            Para invitar de vuelta
          </Text>
          <Text
            className="lk-serif ad-kpi-val fx-tabular"
            data-tone={comebackCount > 0 ? 'warning' : 'success'}
            hasTabularNumbers
          >
            {comebackCount}
          </Text>
          <Text type="supporting" color="secondary" className="ad-kpi-sub" hasTabularNumbers>
            {campaigns?.birthdays.length ?? 0} cumpleaños · {displayedInactiveClients.length}{' '}
            sin cita ({inactiveDays}+ días)
          </Text>
        </VStack>

        <VStack as="article" className="ad-card ad-kpi-card fx-card-lift" gap={1}>
          <Text type="supporting" color="secondary" weight="medium" className="ad-kpi-label">
            Sellos y paquetes
          </Text>
          <Text className="lk-serif ad-kpi-val fx-tabular" hasTabularNumbers>
            {loyaltyHighlightsCount}
          </Text>
          <Text type="supporting" color="secondary" className="ad-kpi-sub" hasTabularNumbers>
            {nearRewardClients.length} cerca de premio · {activeClientPackages.length} paquetes
            activos
          </Text>
        </VStack>
      </section>

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

      <TabList
        value={activeTab}
        onChange={(v) => setActiveTab(v as ClientsTab)}
        hasDivider
      >
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
          inactiveLoading={inactiveQuery.isLoading}
          inactiveError={inactiveQuery.error ? inactiveQuery.error.message : null}
          campaigns={campaigns}
          campaignsLoading={campaignsQuery.isLoading}
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
          packagesLoading={packagesQuery.isLoading}
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

      <NewClientDialog
        isOpen={createOpen}
        onOpenChange={setCreateOpen}
        onCreateClient={handleCreateClient}
      />

      <ClientProfileDialog
        key={selected?.id ?? 'none'}
        client={selected}
        onClose={() => setSelected(null)}
        salonName={data.settings.name}
        tz={tz}
        noShowThreshold={noShowThreshold}
        canManageClients={canManageClients}
        loyalty={selected ? (loyaltyByClientId.get(selected.id) ?? null) : null}
        clientPackages={selected ? (packagesByClientId.get(selected.id) ?? []) : []}
        activeCatalogPackages={activeCatalogPackages}
        bookings={data.bookings}
        assigningPkg={assigningPkg}
        redeemingPkgId={redeemingPkgId}
        onSaveClient={handleSaveClient}
        onAssignPackage={handleAssignPackage}
        onRedeemPackageSession={handleRedeemPackageSession}
      />
    </VStack>
  );
}
