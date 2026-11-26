'use client';

import React, { useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import {
  ADMIN_CACHE_KEYS,
  fetchAdminJson,
  invalidateAdminCache,
  setAdminCacheScope,
  useAdminCachedQuery,
  useAdminCacheSessionSync,
} from '@/lib/hooks/useAdminCache';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import { useBookingAlertSound } from '@/lib/hooks/useBookingAlertSound';
import { useKeyboardShortcut } from '@/lib/hooks/useKeyboardShortcut';
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed';
import { AdminShellSkeleton } from '@/components/ui';
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
  const { data: providerData, loading, bookingEventSeq, switchDemoUser, logout } = useAdminData();
  const { mode, setMode } = useSalonAppearance();
  const soundFeedback = useEphemeralMessage(2200);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
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
  const soundConfigured = data?.settings.soundAlertsEnabled ?? true;
  const { playBookingChime, isMuted, toggleMute } = useBookingAlertSound({
    enabled: Boolean(data) && !isLoginRoute && soundConfigured,
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

  useKeyboardShortcut(
    'k',
    () => setQuickSearchOpen((prev) => !prev),
    { enabled: Boolean(data) && !isLoginRoute, requireModifier: true },
  );

  useKeyboardShortcut(
    'b',
    toggleSidebarCollapsed,
    { enabled: Boolean(data) && !isLoginRoute, requireModifier: true },
  );

  if (isLoginRoute) {
    return <>{children}</>;
  }

  if (loading || !data) {
    return (
      <AdminShellSkeleton
        isDark={mode === 'dark'}
        ariaLabel="Abriendo tu panel"
      />
    );
  }

  const soundActive = soundConfigured && !isMuted;
  const isDark = mode === 'dark';
  const brandLogo = isDark ? LANDING_ASSETS.logoWhite : LANDING_ASSETS.logoBlack;
  const primaryNavGroups = buildPrimaryNavGroups(data);
  const footerNavItems = buildFooterNavItems(data);
  const staffRows = buildSidebarStaffRows(data);

  const handleTestSound = () => {
    void playBookingChime().then((played) => {
      soundFeedback.show(played ? 'Así va a sonar' : 'El navegador bloqueó el sonido');
    });
  };

  const handleToggleTheme = () => {
    setMode(isDark ? 'light' : 'dark');
  };

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
            sidebarCollapsed={sidebarCollapsed}
            mobileMenuOpen={mobileMenuOpen}
            soundActive={soundActive}
            onToggleSidebar={toggleSidebarCollapsed}
            onOpenMobileMenu={() => setMobileMenuOpen(true)}
            onOpenQuickSearch={() => setQuickSearchOpen(true)}
            onToggleMute={toggleMute}
          />

          <VStack as="main" className="ad-sheet" gap={5}>
            <VStack gap={5} width="100%" className="ad-content-inner">
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
