'use client';

import React, { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { agendaHref } from '@/lib/admin-links';
import {
  ADMIN_CACHE_KEYS,
  fetchAdminJson,
  invalidateAdminCache,
  setAdminCacheScope,
  useAdminCachedQuery,
  useAdminCacheSessionSync,
} from '@/lib/hooks/useAdminCache';
import { useAdminIdlePrefetch } from '@/lib/hooks/useAdminIdlePrefetch';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import { useBookingAlertSound } from '@/lib/hooks/useBookingAlertSound';
import {
  useAdminGlobalShortcuts,
  useKeyboardShortcut,
} from '@/lib/hooks/useKeyboardShortcut';
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed';
import { AdminShellSkeleton } from '@/components/ui/SkeletonBlock';
import { LANDING_ASSETS } from '../landing/landingContent';
import { useSalonAppearance } from '../SalonThemeProvider';
import { useAdminData, type AdminOverviewPayload } from './AdminProvider';
import {
  buildFooterNavItems,
  buildPrimaryNavGroups,
  buildSidebarStaffRows,
  prefetchAdminRoute,
} from './shell/adminNavConfig';
import { AdminSidebar } from './shell/AdminSidebar';
import { AdminTopBar } from './shell/AdminTopBar';
import { AdminMobileNav } from './shell/AdminMobileNav';

const AdminQuickSearchDialog = dynamic(
  () => import('./AdminQuickSearchDialog').then((mod) => mod.AdminQuickSearchDialog),
  { ssr: false },
);

export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    data: providerData,
    loading,
    error: providerError,
    bookingEventSeq,
    refresh,
    dismissError,
    switchDemoUser,
    logout,
  } = useAdminData();
  const { mode, setMode } = useSalonAppearance();
  const soundFeedback = useEphemeralMessage(2200);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const [dismissedCacheError, setDismissedCacheError] = useState<string | null>(null);
  const [sidebarCollapsed, toggleSidebarCollapsed] = useSidebarCollapsed();

  const isLoginRoute = pathname === '/admin/login';
  const sessionScopeKey =
    !isLoginRoute && providerData
      ? `${providerData.session.user.id}:${providerData.session.user.role}`
      : null;

  useAdminCacheSessionSync(sessionScopeKey, isLoginRoute ? null : providerData);

  const overviewCacheQuery = useAdminCachedQuery<AdminOverviewPayload>(
    sessionScopeKey ? ADMIN_CACHE_KEYS.overview : null,
    (signal) => fetchAdminJson<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, signal),
    { enabled: false, initialData: providerData ?? undefined },
  );

  const data = overviewCacheQuery.data ?? providerData;
  const rawCacheError = overviewCacheQuery.error ? overviewCacheQuery.error.message : null;
  const visibleCacheError =
    rawCacheError && rawCacheError !== dismissedCacheError ? rawCacheError : null;
  const overviewError = providerError ?? visibleCacheError;

  const handleRetryOverview = useCallback(() => {
    setDismissedCacheError(null);
    void refresh();
  }, [refresh]);

  const handleDismissOverviewError = useCallback(() => {
    dismissError();
    if (rawCacheError) {
      setDismissedCacheError(rawCacheError);
    }
  }, [dismissError, rawCacheError]);
  const soundConfigured = data?.settings.soundAlertsEnabled ?? true;
  const { playBookingChime, isMuted, toggleMute } = useBookingAlertSound({
    enabled: Boolean(data) && !isLoginRoute,
    defaultEnabled: soundConfigured,
    eventSeq: bookingEventSeq,
    salonName: data?.settings.name,
  });

  const handleSwitchDemoUser = useCallback(
    async (email: string) => {
      invalidateAdminCache();
      setAdminCacheScope(null);
      await switchDemoUser(email);
    },
    [switchDemoUser],
  );

  const handleLogout = useCallback(async () => {
    invalidateAdminCache();
    setAdminCacheScope(null);
    await logout();
  }, [logout]);

  const handlePrefetchRoute = useCallback(
    (routeId: string, href: string) => {
      prefetchAdminRoute(routeId, href, data, (path) => router.prefetch(path));
    },
    [data, router],
  );

  const primaryNavGroups = useMemo(
    () => (data ? buildPrimaryNavGroups(data) : []),
    [data],
  );

  const footerNavItems = useMemo(
    () => (data ? buildFooterNavItems(data) : []),
    [data],
  );

  const staffRows = useMemo(
    () => (data ? buildSidebarStaffRows(data) : []),
    [data],
  );

  const idlePrefetchRoutes = useMemo(
    () =>
      primaryNavGroups
        .flatMap((group) => group.items)
        .filter(
          (item) =>
            item.href !== pathname &&
            (item.id === 'bookings' ||
              item.id === 'whatsapp' ||
              item.id === 'cash' ||
              item.id === 'clients' ||
              item.id === 'reports' ||
              item.id === 'overview'),
        )
        .map((item) => item.href),
    [primaryNavGroups, pathname],
  );

  useAdminIdlePrefetch({
    enabled: Boolean(data) && !isLoginRoute,
    routes: idlePrefetchRoutes,
    prefetch: useCallback((href: string) => router.prefetch(href), [router]),
  });

  const handleToggleQuickSearch = useCallback(
    () => setQuickSearchOpen((prev) => !prev),
    [],
  );

  useKeyboardShortcut('k', handleToggleQuickSearch, {
    enabled: Boolean(data) && !isLoginRoute,
    requireModifier: true,
  });

  useKeyboardShortcut('b', toggleSidebarCollapsed, {
    enabled: Boolean(data) && !isLoginRoute,
    requireModifier: true,
  });

  const allowedShortcutRoutes = useMemo(
    () =>
      new Set(
        primaryNavGroups
          .flatMap((group) => group.items)
          .map((item) => item.href),
      ),
    [primaryNavGroups],
  );

  const handleOpenQuickSearch = useCallback(() => setQuickSearchOpen(true), []);
  const handleOpenMobileMenu = useCallback(() => setMobileMenuOpen(true), []);
  const handleNewBooking = useCallback(() => router.push(agendaHref({ new: true })), [router]);
  const handleNavigate = useCallback((href: string) => router.push(href), [router]);

  useAdminGlobalShortcuts({
    enabled: Boolean(data) && !isLoginRoute && !quickSearchOpen && !mobileMenuOpen,
    onQuickSearch: handleOpenQuickSearch,
    onNewBooking: handleNewBooking,
    onNavigate: handleNavigate,
    allowedRoutes: allowedShortcutRoutes,
  });

  const isDark = mode === 'dark';

  const handleTestSound = useCallback(() => {
    void playBookingChime().then((played) => {
      soundFeedback.show(played ? 'Así va a sonar' : 'El navegador bloqueó el sonido');
    });
  }, [playBookingChime, soundFeedback]);

  const handleToggleTheme = useCallback(() => {
    setMode(isDark ? 'light' : 'dark');
  }, [isDark, setMode]);

  if (isLoginRoute) {
    return <>{children}</>;
  }

  if (!data && overviewError && !loading) {
    return (
      <VStack
        as="main"
        className="ad-sheet"
        gap={4}
        padding={6}
        align="center"
        justify="center"
        style={{ minHeight: '100dvh' }}
      >
        <VStack width="100%" gap={3} style={{ maxWidth: '32rem' }}>
          <Banner
            collapsible={false}
            status="error"
            role="alert"
            title="No pudimos cargar tu panel"
            description={overviewError}
          >
            <HStack justify="start" gap={2} wrap="wrap" paddingBlockStart={2}>
              <Button
                type="button"
                label="Reintentar"
                variant="primary"
                size="md"
                onClick={handleRetryOverview}
              />
              <Button
                label="Volver a iniciar sesión"
                variant="secondary"
                size="md"
                href="/admin/login"
              />
            </HStack>
          </Banner>
        </VStack>
      </VStack>
    );
  }

  if (loading || !data) {
    return (
      <AdminShellSkeleton ariaLabel="Abriendo tu panel" />
    );
  }

  const soundActive = !isMuted;
  const brandLogo = isDark ? LANDING_ASSETS.logoWhite : LANDING_ASSETS.logoBlack;

  return (
    <VStack className="ad-shell" gap={0}>
      <HStack
        className="ad-frame"
        data-collapsed={sidebarCollapsed ? 'true' : 'false'}
        gap={0}
        align="stretch"
      >
        <AdminSidebar
          data={data}
          pathname={pathname}
          brandLogo={brandLogo}
          sidebarCollapsed={sidebarCollapsed}
          primaryNavGroups={primaryNavGroups}
          footerNavItems={footerNavItems}
          staffRows={staffRows}
          soundActive={soundActive}
          soundFeedbackMessage={soundFeedback.message}
          isDark={isDark}
          onToggleSidebar={toggleSidebarCollapsed}
          onPrefetchRoute={handlePrefetchRoute}
          onToggleMute={toggleMute}
          onTestSound={handleTestSound}
          onToggleTheme={handleToggleTheme}
          onSwitchDemoUser={(email) => void handleSwitchDemoUser(email)}
          onLogout={() => void handleLogout()}
        />

        <VStack className="ad-main-wrap" gap={0}>
          <AdminTopBar
            data={data}
            brandLogo={brandLogo}
            mobileMenuOpen={mobileMenuOpen}
            soundActive={soundActive}
            onOpenMobileMenu={handleOpenMobileMenu}
            onOpenQuickSearch={handleOpenQuickSearch}
            onToggleMute={toggleMute}
          />

          <VStack as="main" className="ad-sheet" gap={5}>
            <VStack gap={5} width="100%" className="ad-content-inner">
              {overviewError ? (
                <Banner
                  collapsible={false}
                  status="error"
                  role="alert"
                  title="No pudimos actualizar los datos del panel"
                  description={overviewError}
                  isDismissable
                  dismissLabel="Cerrar aviso"
                  onDismiss={handleDismissOverviewError}
                >
                  <HStack justify="start" paddingBlockStart={2}>
                    <Button
                      type="button"
                      label="Reintentar"
                      variant="primary"
                      size="md"
                      onClick={handleRetryOverview}
                    />
                  </HStack>
                </Banner>
              ) : null}
              {children}
            </VStack>
          </VStack>
        </VStack>
      </HStack>

      <AdminMobileNav
        data={data}
        pathname={pathname}
        brandLogo={brandLogo}
        mobileMenuOpen={mobileMenuOpen}
        primaryNavGroups={primaryNavGroups}
        footerNavItems={footerNavItems}
        staffRows={staffRows}
        soundActive={soundActive}
        soundFeedbackMessage={soundFeedback.message}
        isDark={isDark}
        onMobileMenuOpenChange={setMobileMenuOpen}
        onPrefetchRoute={handlePrefetchRoute}
        onToggleMute={toggleMute}
        onTestSound={handleTestSound}
        onToggleTheme={handleToggleTheme}
        onSwitchDemoUser={(email) => void handleSwitchDemoUser(email)}
        onLogout={() => void handleLogout()}
      />

      {quickSearchOpen ? (
        <AdminQuickSearchDialog
          isOpen={quickSearchOpen}
          onOpenChange={setQuickSearchOpen}
          data={data}
        />
      ) : null}
    </VStack>
  );
}
