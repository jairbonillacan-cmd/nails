'use client';

import { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Link } from '@astryxdesign/core/Link';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import {
  Award,
  Check,
  MessageCircle,
  RotateCcw,
  Save,
  Users,
  Wallet,
} from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import { AdminAccessGuard } from '@/components/admin/AdminAccessGuard';
import {
  ActionRow,
  ConfirmActionDialog,
  EmptyStateCard,
  MetricGrid,
  PageHeader,
  PageSkeleton,
  SkeletonBlock,
  StatusTag,
  SurfaceCard,
  type MetricTileItem,
} from '@/components/ui';
import { LoyaltySettingsSection } from '@/components/admin/marca/LoyaltySettingsSection';
import {
  areLoyaltyProgramsEqual,
  buildBrandPatchPayload,
  DEFAULT_LOYALTY_PROGRAM,
} from '@/components/admin/marca/brandFormUtils';
import {
  deleteCajaCoupon,
  saveCajaCoupon,
  saveCajaPackage,
  toggleCajaCouponActive,
  toggleCajaPackage,
  type SaveCajaPackageInput,
} from '@/components/admin/caja/cajaActions';
import {
  classifyCouponStatus,
  type CouponPayloadData,
} from '@/components/admin/caja/cajaMetrics';
import type { ServicePackageCatalogRow } from '@/components/admin/caja/cajaTypes';
import {
  assignClientPackageRequest,
  buildReturningClients,
  buildVisitCountByClient,
  cancelClientPackageRequest,
  dispatchRetentionCampaignRequest,
  redeemClientPackageSessionRequest,
} from '@/components/admin/clientas/clientasActions';
import {
  formatInstagramDisplay,
  formatInstagramUrl,
  type BannerNotice,
  type CampaignsPayload,
  type ClientPackageRow,
  type InactiveClientRow,
} from '@/components/admin/clientas/clientasTypes';
import {
  cajaHref,
  clientasHref,
  parseFidelizacionParams,
  whatsappHref,
  type FidelizacionTabParam,
} from '@/lib/admin-links';
import { normalizeTouchUpDays } from '@/lib/booking/recurrence';
import { formatCurrency, formatPhoneDisplay } from '@/lib/format';
import type { FormSubmitResult } from '@/lib/forms/form-submit';
import {
  ADMIN_CACHE_KEYS,
  fetchAdminJson,
  invalidateAdminCache,
  useAdminCachedQuery,
} from '@/lib/hooks/useAdminCache';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import type { Coupon, LoyaltyProgram, ServicePackage } from '@/lib/types';

function FidelizacionTabFallback() {
  return (
    <VStack gap={3} role="status" aria-live="polite" aria-label="Cargando sección de fidelización">
      <SkeletonBlock width="100%" height="5.5rem" radius={3} index={0} />
      <SkeletonBlock width="100%" height="12rem" radius={3} index={1} />
    </VStack>
  );
}

const PackagesSubSection = dynamic(
  () =>
    import('@/components/admin/caja/PackagesSubSection').then(
      (mod) => mod.PackagesSubSection,
    ),
  { ssr: false, loading: FidelizacionTabFallback },
);

const CouponsSubSection = dynamic(
  () =>
    import('@/components/admin/caja/CouponsSubSection').then(
      (mod) => mod.CouponsSubSection,
    ),
  { ssr: false, loading: FidelizacionTabFallback },
);

const ClientLoyaltyTab = dynamic(
  () =>
    import('@/components/admin/clientas/ClientLoyaltyTab').then(
      (mod) => mod.ClientLoyaltyTab,
    ),
  { ssr: false, loading: FidelizacionTabFallback },
);

const ClientRetentionTab = dynamic(
  () =>
    import('@/components/admin/clientas/ClientRetentionTab').then(
      (mod) => mod.ClientRetentionTab,
    ),
  { ssr: false, loading: FidelizacionTabFallback },
);

interface PackagesQueryPayload {
  servicePackages?: ServicePackage[];
  clientPackages?: ClientPackageRow[];
}

interface InactiveClientsQueryPayload {
  inactiveDays?: number;
  clients?: InactiveClientRow[];
}

export default function AdminLoyaltyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const parsedParams = parseFidelizacionParams(searchParams);
  const { data, loading, bookingEventSeq, refresh } = useAdminData();

  const urlTab = parsedParams.tab ?? '';
  const [prevUrlTab, setPrevUrlTab] = useState(urlTab);
  const [activeTab, setActiveTab] = useState<FidelizacionTabParam>(
    () => parsedParams.tab ?? 'sellos',
  );
  if (prevUrlTab !== urlTab) {
    setPrevUrlTab(urlTab);
    if (parsedParams.tab) {
      setActiveTab(parsedParams.tab);
    }
  }

  const [loyaltyOverride, setLoyaltyOverride] = useState<LoyaltyProgram | null>(null);
  const [savingLoyalty, setSavingLoyalty] = useState(false);
  const [bannerMsg, setBannerMsg] = useState<BannerNotice | null>(null);
  const [inactiveDays, setInactiveDays] = useState(21);
  const [packagesSeq, setPackagesSeq] = useState(0);
  const [campaignsSeq, setCampaignsSeq] = useState(0);
  const [togglingPkgId, setTogglingPkgId] = useState<string | null>(null);
  const [assigningPkg, setAssigningPkg] = useState(false);
  const [redeemingPkgId, setRedeemingPkgId] = useState<string | null>(null);
  const [cancelingPkgId, setCancelingPkgId] = useState<string | null>(null);
  const [togglingCouponId, setTogglingCouponId] = useState<string | null>(null);
  const [deletingCouponId, setDeletingCouponId] = useState<string | null>(null);
  const [confirmDeleteCoupon, setConfirmDeleteCoupon] = useState<Coupon | null>(null);
  const [dispatchingKey, setDispatchingKey] = useState<string | null>(null);
  const saveNotice = useEphemeralMessage(3200);

  const canManage = Boolean(
    data &&
      (data.session.user.role === 'owner' || data.session.user.role === 'admin'),
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

  const packagesQuery = useAdminCachedQuery<PackagesQueryPayload>(
    data ? ADMIN_CACHE_KEYS.packages : null,
    fetchPackages,
    {
      enabled: Boolean(data),
      staleTimeMs: 10_000,
      revalidateKey: packagesSeq,
    },
  );

  const campaignsQuery = useAdminCachedQuery<CampaignsPayload>(
    canManage ? ADMIN_CACHE_KEYS.campaigns : null,
    fetchCampaigns,
    {
      enabled: canManage && activeTab === 'campanas',
      staleTimeMs: 10_000,
      revalidateKey: campaignsSeq,
    },
  );

  const inactiveQuery = useAdminCachedQuery<InactiveClientsQueryPayload>(
    canManage && activeTab === 'campanas' ? inactiveKey : null,
    fetchInactive,
    {
      enabled: canManage && activeTab === 'campanas',
      staleTimeMs: 10_000,
      revalidateKey: bookingEventSeq,
    },
  );

  const servicePackages = useMemo(
    () => packagesQuery.data?.servicePackages ?? [],
    [packagesQuery.data],
  );
  const activeCatalogPackages = useMemo(
    () => servicePackages.filter((pkg) => pkg.isActive),
    [servicePackages],
  );
  const clientPackages = useMemo(
    () => packagesQuery.data?.clientPackages ?? [],
    [packagesQuery.data],
  );
  const activeClientPackages = useMemo(
    () =>
      clientPackages.filter(
        (pkg) => pkg.status === 'active' && !pkg.isExpired && pkg.remainingSessions > 0,
      ),
    [clientPackages],
  );

  const visitCountByClient = useMemo(() => buildVisitCountByClient(data), [data]);
  const returningClients = useMemo(
    () => buildReturningClients(data, visitCountByClient),
    [data, visitCountByClient],
  );

  const lastServiceByClientId = useMemo(() => {
    const map = new Map<string, string | null>();
    if (!data) return map;
    const sorted = data.bookings.toSorted(
      (a, b) => Date.parse(b.startAt) - Date.parse(a.startAt),
    );
    for (const bk of sorted) {
      if (!map.has(bk.client.id)) {
        map.set(bk.client.id, bk.service.name);
      }
    }
    return map;
  }, [data]);

  const dispatchedTodayKeys = useMemo(
    () =>
      new Set(
        (campaignsQuery.data?.recentDispatches ?? []).map((d) => `${d.kind}:${d.clientId}`),
      ),
    [campaignsQuery.data],
  );

  if (loading || !data) {
    return (
      <PageSkeleton
        kpiCount={4}
        withSplit={false}
        ariaLabel="Cargando programa de fidelización"
      />
    );
  }

  const isOwner = data.session.user.role === 'owner';
  const tz = data.settings.timezone || 'America/Mexico_City';
  const currency = data.settings.currency;
  const nowMs = Date.parse(data.serverNowIso) || 0;
  const touchUpDays = normalizeTouchUpDays(data.settings.landingContent?.touchUpDays);
  const baseLoyalty = data.loyaltyProgram ?? DEFAULT_LOYALTY_PROGRAM;
  const loyaltyDraft = loyaltyOverride ?? baseLoyalty;
  const activeServices = data.services.filter((s) => s.isActive);
  const isLoyaltyDirty = !areLoyaltyProgramsEqual(loyaltyDraft, baseLoyalty);
  const activeCouponsCount = data.coupons.filter(
    (coupon) => classifyCouponStatus(coupon, nowMs).status === 'active',
  ).length;
  const displayedInactiveClients: InactiveClientRow[] = data.retention
    ? (inactiveQuery.data?.clients ?? data.retention.inactiveClients)
    : [];
  const comebackCount =
    displayedInactiveClients.length + (campaignsQuery.data?.birthdays.length ?? 0);

  const kpiItems: MetricTileItem[] = [
    {
      id: 'near-reward',
      label: 'Cerca de premio',
      value: String(data.nearRewardClients.length),
      sub: baseLoyalty.isActive
        ? `Tarjeta de ${baseLoyalty.stampsRequired} sellos`
        : 'Tarjeta pausada',
      tone: data.nearRewardClients.length > 0 ? 'accent' : 'default',
    },
    {
      id: 'active-packages',
      label: 'Paquetes activos',
      value: String(activeClientPackages.length),
      sub: `${activeCatalogPackages.length} en catálogo`,
    },
    {
      id: 'active-coupons',
      label: 'Cupones activos',
      value: String(activeCouponsCount),
      sub: `${data.coupons.length} códigos registrados`,
    },
    {
      id: 'campaigns-pending',
      label: 'Por contactar',
      value: String(comebackCount),
      sub: `Sin visita +${touchUpDays} d y cumpleaños`,
      tone: comebackCount > 0 ? 'warning' : 'success',
    },
  ];

  const openClientById = (clientId: string) => {
    const found = data.clients.find((c) => c.id === clientId);
    router.push(clientasHref(found ? { q: found.phoneE164 } : { clientId }));
  };

  const handleSaveLoyalty = async () => {
    if (!isOwner || !isLoyaltyDirty || savingLoyalty) return;
    setSavingLoyalty(true);
    setBannerMsg(null);
    try {
      const res = await fetch('/api/admin/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify(
          buildBrandPatchPayload({
            draft: data.settings,
            loyaltyDraft,
            activeServices,
            hasOwnerPin: Boolean(data.settings.hasOwnerPin),
          }),
        ),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setBannerMsg({
          status: 'error',
          title: json?.error || 'No se pudo guardar la tarjeta de sellos.',
        });
        return;
      }
      await refresh();
      setLoyaltyOverride(null);
      saveNotice.show('Tarjeta de sellos guardada');
    } catch {
      setBannerMsg({
        status: 'error',
        title: 'Error de conexión al guardar la tarjeta de sellos.',
      });
    } finally {
      setSavingLoyalty(false);
    }
  };

  const handleSavePackage = async (input: SaveCajaPackageInput): Promise<FormSubmitResult> => {
    const result = await saveCajaPackage(input);
    if (!result.ok) {
      return { ok: false, error: result.error || 'No se pudo guardar el paquete.' };
    }
    invalidateAdminCache(ADMIN_CACHE_KEYS.packages);
    setPackagesSeq((prev) => prev + 1);
    saveNotice.show(result.message || 'Paquete guardado');
    return { ok: true };
  };

  const handleTogglePackage = async (
    pkg: ServicePackageCatalogRow,
    nextActive: boolean,
  ) => {
    setTogglingPkgId(pkg.id);
    setBannerMsg(null);
    try {
      const result = await toggleCajaPackage(pkg, nextActive);
      if (result.ok) {
        invalidateAdminCache(ADMIN_CACHE_KEYS.packages);
        setPackagesSeq((prev) => prev + 1);
        saveNotice.show(result.message || 'Paquete actualizado');
      } else {
        setBannerMsg({
          status: 'error',
          title: result.error || 'No se pudo actualizar el paquete.',
        });
      }
    } finally {
      setTogglingPkgId(null);
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
      if (result.ok) {
        invalidateAdminCache(ADMIN_CACHE_KEYS.packages);
        setPackagesSeq((prev) => prev + 1);
      }
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
      if (result.ok) {
        invalidateAdminCache(ADMIN_CACHE_KEYS.packages);
        setPackagesSeq((prev) => prev + 1);
      }
      setBannerMsg(result.notice);
    } finally {
      setRedeemingPkgId(null);
    }
  };

  const handleCancelPackage = async (pkg: ClientPackageRow) => {
    setCancelingPkgId(pkg.id);
    try {
      const result = await cancelClientPackageRequest(pkg);
      if (result.ok) {
        invalidateAdminCache(ADMIN_CACHE_KEYS.packages);
        setPackagesSeq((prev) => prev + 1);
      }
      setBannerMsg(result.notice);
    } finally {
      setCancelingPkgId(null);
    }
  };

  const handleSaveCoupon = async (
    payload: CouponPayloadData,
  ): Promise<FormSubmitResult> => {
    const result = await saveCajaCoupon(payload);
    if (!result.ok) {
      return { ok: false, error: result.error || 'No se pudo guardar el código.' };
    }
    await refresh();
    saveNotice.show(result.message || 'Código guardado');
    return { ok: true };
  };

  const handleToggleCouponActive = async (coupon: Coupon, nextActive: boolean) => {
    setTogglingCouponId(coupon.id);
    setBannerMsg(null);
    try {
      const result = await toggleCajaCouponActive(coupon, nextActive);
      if (result.ok) {
        await refresh();
        saveNotice.show(result.message || 'Código actualizado');
      } else {
        setBannerMsg({
          status: 'error',
          title: result.error || 'No se pudo actualizar el código.',
        });
      }
    } finally {
      setTogglingCouponId(null);
    }
  };

  const handleConfirmDeleteCoupon = async () => {
    if (!confirmDeleteCoupon) return;
    const target = confirmDeleteCoupon;
    setDeletingCouponId(target.id);
    setBannerMsg(null);
    try {
      const result = await deleteCajaCoupon(target.id, target.code);
      if (result.ok) {
        await refresh();
        saveNotice.show(result.message || 'Código eliminado');
      } else {
        setBannerMsg({
          status: 'error',
          title: result.error || 'No se pudo eliminar el código.',
        });
      }
    } finally {
      setDeletingCouponId(null);
      setConfirmDeleteCoupon(null);
    }
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
        setCampaignsSeq((prev) => prev + 1);
      }
      setBannerMsg(result.notice);
    } finally {
      setDispatchingKey(null);
    }
  };

  const rewardSummaryText =
    baseLoyalty.rewardType === 'free_service'
      ? `Servicio gratis: ${data.services.find((s) => s.id === baseLoyalty.rewardServiceId)?.name ?? 'servicio seleccionado'}`
      : `${baseLoyalty.discountPercent ?? 50}% de descuento${
          baseLoyalty.maxDiscountCents !== null
            ? ` (tope ${formatCurrency(baseLoyalty.maxDiscountCents, currency)})`
            : ''
        }`;

  return (
    <AdminAccessGuard
      role={data.session.user.role}
      section="loyalty"
      sectionLabel="Fidelización"
    >
      <VStack className="ad-page" gap={5}>
        <PageHeader
          title="Fidelización"
          subtitle="Sellos, paquetes de sesiones, cupones y campañas de retorno en un solo lugar."
          meta={
            savingLoyalty ? (
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
          actions={
            <HStack gap={2} wrap="wrap">
              <Button
                label="Clientas"
                variant="secondary"
                size="sm"
                icon={<Users size={14} aria-hidden="true" />}
                href={clientasHref()}
              />
              <Button
                label="Caja"
                variant="ghost"
                size="sm"
                icon={<Wallet size={14} aria-hidden="true" />}
                href={cajaHref({ tab: 'promos' })}
              />
            </HStack>
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
          ariaLabel="Resumen de fidelización"
          className="ad-dash-kpis"
          cols={4}
          items={kpiItems}
        />

        <TabList
          value={activeTab}
          onChange={(v) => setActiveTab(v as FidelizacionTabParam)}
          hasDivider
        >
          <Tab
            value="sellos"
            label={
              data.nearRewardClients.length > 0
                ? `Sellos (${data.nearRewardClients.length})`
                : 'Sellos'
            }
          />
          <Tab
            value="paquetes"
            label={
              activeClientPackages.length > 0
                ? `Paquetes (${activeClientPackages.length})`
                : 'Paquetes'
            }
          />
          <Tab
            value="cupones"
            label={
              data.coupons.length > 0
                ? `Cupones y tarjetas (${data.coupons.length})`
                : 'Cupones y tarjetas'
            }
          />
          <Tab
            value="campanas"
            label={comebackCount > 0 ? `Campañas (${comebackCount})` : 'Campañas'}
          />
        </TabList>

        {activeTab === 'sellos' ? (
          <VStack gap={5}>
            {isOwner ? (
              <VStack gap={3}>
                <LoyaltySettingsSection
                  loyaltyDraft={loyaltyDraft}
                  activeServices={activeServices}
                  currency={currency}
                  onUpdateLoyaltyDraft={(patch) =>
                    setLoyaltyOverride({ ...loyaltyDraft, ...patch })
                  }
                />
                {isLoyaltyDirty ? (
                  <HStack
                    className="ad-sticky-bar fx-sheet-in"
                    justify="between"
                    align="center"
                    gap={3}
                    wrap="wrap"
                    role="region"
                    aria-label="Cambios sin guardar en sellos"
                  >
                    <HStack gap={2} align="center" wrap="wrap">
                      <StatusTag label="Sin guardar" tone="warning" />
                      <Text size="sm" weight="medium">
                        Tienes cambios pendientes en tu tarjeta de sellos.
                      </Text>
                    </HStack>
                    <HStack gap={2} align="center" wrap="wrap">
                      <Button
                        type="button"
                        label="Descartar"
                        variant="ghost"
                        size="sm"
                        icon={<RotateCcw size={14} aria-hidden="true" />}
                        isDisabled={savingLoyalty}
                        onClick={() => setLoyaltyOverride(null)}
                      />
                      <Button
                        type="button"
                        label={savingLoyalty ? 'Guardando…' : 'Guardar cambios'}
                        variant="primary"
                        size="sm"
                        icon={<Save size={14} aria-hidden="true" />}
                        isLoading={savingLoyalty}
                        isDisabled={savingLoyalty}
                        onClick={() => void handleSaveLoyalty()}
                      />
                    </HStack>
                  </HStack>
                ) : null}
              </VStack>
            ) : (
              <SurfaceCard
                icon={<Award size={16} aria-hidden="true" />}
                title={baseLoyalty.name}
                subtitle={`${baseLoyalty.stampsRequired} sellos para premio · ${rewardSummaryText}`}
                badge={
                  <StatusTag
                    tone={baseLoyalty.isActive ? 'success' : 'neutral'}
                    showDot
                    label={baseLoyalty.isActive ? 'Activa' : 'Pausada'}
                  />
                }
              >
                <VStack className="ad-card-body" paddingBlockStart={3}>
                  <Banner
                    status="info"
                    role="status"
                    title="Solo la Dueña puede editar las reglas de sellos"
                    description="Aquí puedes ver qué clientas están cerca de su premio y gestionar paquetes, cupones y campañas."
                  />
                </VStack>
              </SurfaceCard>
            )}

            <SurfaceCard
              title="Clientas cerca de su premio"
              subtitle="Clientas a 2 visitas o menos de completar su tarjeta o listas para canjear."
              count={data.nearRewardClients.length}
            >
              {data.nearRewardClients.length === 0 ? (
                <VStack padding={4}>
                  <EmptyStateCard
                    framed={false}
                    isCompact
                    title="Aún no hay clientas cerca de su premio"
                    description="Cada cita cobrada suma un sello automáticamente. Cuando alguna esté a 2 visitas o menos aparecerá aquí."
                  />
                </VStack>
              ) : (
                <VStack className="ad-row-list" gap={0}>
                  {data.nearRewardClients.map((entry) => {
                    const required = Math.max(1, entry.summary.stampsRequired);
                    const totalSlots = Math.min(12, required);
                    const filledSlots = Math.min(
                      totalSlots,
                      Math.round((entry.summary.currentStamps / required) * totalSlots),
                    );
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
                              label="Ver ficha"
                              size="sm"
                              variant="secondary"
                              className="ad-cl-touch-btn"
                              href={clientasHref({ q: entry.phoneE164 })}
                            />
                            <Button
                              label="WhatsApp"
                              size="sm"
                              variant="primary"
                              className="ad-cl-touch-btn"
                              icon={<MessageCircle size={14} aria-hidden="true" />}
                              href={whatsappHref({ phone: entry.phoneE164 })}
                            />
                          </HStack>
                        }
                      />
                    );
                  })}
                </VStack>
              )}
            </SurfaceCard>
          </VStack>
        ) : null}

        {activeTab === 'paquetes' ? (
          <VStack gap={5}>
            <PackagesSubSection
              packagesCatalog={servicePackages}
              packagesLoading={packagesQuery.isLoading}
              services={data.services}
              currency={currency}
              canManagePackages={canManage}
              hideAssignLink
              togglingPkgId={togglingPkgId}
              onSavePackage={handleSavePackage}
              onTogglePackage={handleTogglePackage}
            />
            <ClientLoyaltyTab
              hideNearRewards
              showCatalogLink={false}
              nearRewardClients={data.nearRewardClients}
              loyaltyProgram={data.loyaltyProgram}
              clients={data.clients}
              clientPackages={clientPackages}
              activeClientPackagesCount={activeClientPackages.length}
              activeCatalogPackages={activeCatalogPackages}
              packagesLoading={packagesQuery.isLoading}
              canManageClients={canManage}
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
          </VStack>
        ) : null}

        {activeTab === 'cupones' ? (
          <CouponsSubSection
            coupons={data.coupons}
            currency={currency}
            tz={tz}
            todayKey={data.serverTodayKey}
            nowMs={nowMs}
            canManageCoupons={canManage}
            togglingCouponId={togglingCouponId}
            deletingCouponId={deletingCouponId}
            onSaveCoupon={handleSaveCoupon}
            onToggleCouponActive={handleToggleCouponActive}
            onRequestDeleteCoupon={setConfirmDeleteCoupon}
          />
        ) : null}

        {activeTab === 'campanas' ? (
          <ClientRetentionTab
            canManageClients={canManage}
            salonName={data.settings.name}
            tz={tz}
            touchUpDays={touchUpDays}
            inactiveDays={inactiveDays}
            onInactiveDaysChange={setInactiveDays}
            displayedInactiveClients={displayedInactiveClients}
            lastServiceByClientId={lastServiceByClientId}
            inactiveLoading={inactiveQuery.isLoading}
            inactiveError={inactiveQuery.error ? inactiveQuery.error.message : null}
            campaigns={campaignsQuery.data ?? null}
            campaignsLoading={campaignsQuery.isLoading}
            dispatchedTodayKeys={dispatchedTodayKeys}
            dispatchingKey={dispatchingKey}
            nearRewardCount={data.nearRewardClients.length}
            returningClients={returningClients}
            onOpenClientById={openClientById}
            onOpenLoyalty={() => setActiveTab('sellos')}
            onDispatchCampaign={handleDispatchCampaign}
          />
        ) : null}

        <ConfirmActionDialog
          isOpen={Boolean(confirmDeleteCoupon)}
          onOpenChange={(open) => {
            if (!open && !deletingCouponId) setConfirmDeleteCoupon(null);
          }}
          title={
            confirmDeleteCoupon
              ? `¿Eliminar código ${confirmDeleteCoupon.code}?`
              : '¿Eliminar código?'
          }
          description="El código dejará de funcionar en tu página de reservas. Esta acción no se puede deshacer."
          confirmLabel="Eliminar código"
          variant="destructive"
          isLoading={Boolean(deletingCouponId)}
          onConfirm={handleConfirmDeleteCoupon}
        />
      </VStack>
    </AdminAccessGuard>
  );
}
