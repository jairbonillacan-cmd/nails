'use client';

import NextLink from 'next/link';
import { MobileNav } from '@astryxdesign/core/MobileNav';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import {
  CalendarDays,
  LayoutGrid,
  Menu,
  Users,
  Wallet,
} from 'lucide-react';
import { roleCanAccess } from '@/lib/rbac';
import type { AdminOverviewPayload } from '../AdminProvider';
import type { NavGroupConfig, NavItemConfig, SidebarStaffRow } from './adminNavConfig';
import { AdminNavGroups } from './AdminNavGroups';
import { AdminFooterControls } from './AdminFooterControls';

interface AdminMobileNavProps {
  data: AdminOverviewPayload;
  pathname: string;
  brandLogo: string;
  mobileMenuOpen: boolean;
  primaryNavGroups: NavGroupConfig[];
  footerNavItems: NavItemConfig[];
  staffRows: SidebarStaffRow[];
  soundActive: boolean;
  soundFeedbackMessage: string | null;
  isDark: boolean;
  onMobileMenuOpenChange: (open: boolean) => void;
  onPrefetchRoute: (routeId: string, href: string) => void;
  onToggleMute: () => void;
  onTestSound: () => void;
  onToggleTheme: () => void;
  onSwitchDemoUser: (email: string) => void;
  onLogout: () => void;
}

export function AdminMobileNav({
  data,
  pathname,
  brandLogo,
  mobileMenuOpen,
  primaryNavGroups,
  footerNavItems,
  staffRows,
  soundActive,
  soundFeedbackMessage,
  isDark,
  onMobileMenuOpenChange,
  onPrefetchRoute,
  onToggleMute,
  onTestSound,
  onToggleTheme,
  onSwitchDemoUser,
  onLogout,
}: AdminMobileNavProps) {
  const closeDrawer = () => onMobileMenuOpenChange(false);
  const role = data.session.user.role;
  const pendingCount = data.kpis.pendingConfirmationsCount;

  const bottomItems = [
    {
      id: 'overview',
      label: 'Resumen',
      href: '/admin',
      icon: <LayoutGrid size={18} strokeWidth={1.8} aria-hidden="true" />,
      dot: false,
      visible: true,
    },
    {
      id: 'bookings',
      label: 'Agenda',
      href: '/admin/citas',
      icon: <CalendarDays size={18} strokeWidth={1.8} aria-hidden="true" />,
      dot: pendingCount > 0,
      visible: true,
    },
    {
      id: 'cash',
      label: 'Caja',
      href: '/admin/caja',
      icon: <Wallet size={18} strokeWidth={1.8} aria-hidden="true" />,
      dot: false,
      visible: roleCanAccess(role, 'cash'),
    },
    {
      id: 'clients',
      label: 'Clientas',
      href: '/admin/clientas',
      icon: <Users size={18} strokeWidth={1.8} aria-hidden="true" />,
      dot: false,
      visible: roleCanAccess(role, 'clients'),
    },
  ].filter((item) => item.visible);

  return (
    <>
      <HStack
        as="nav"
        aria-label="Rápida móvil"
        className="ad-bottom"
        justify="around"
        align="center"
        gap={0}
      >
        {bottomItems.map((item) => {
          const isCurrent = pathname === item.href;
          return (
            <NextLink
              key={item.id}
              href={item.href}
              className="ad-bottom-item fx-press"
              data-on={isCurrent ? 'true' : 'false'}
              aria-current={isCurrent ? 'page' : undefined}
              onTouchStart={() => onPrefetchRoute(item.id, item.href)}
            >
              <VStack className="ad-bottom-icon" align="center" justify="center" gap={0}>
                {item.icon}
                {item.dot ? (
                  <Text className="ad-bottom-dot" aria-hidden="true">
                    {'\u200B'}
                  </Text>
                ) : null}
              </VStack>
              <Text color="inherit" className="ad-bottom-label">
                {item.label}
              </Text>
            </NextLink>
          );
        })}

        <button
          type="button"
          className="ad-bottom-item fx-press"
          data-on={mobileMenuOpen ? 'true' : 'false'}
          aria-expanded={mobileMenuOpen}
          aria-label="Abrir todo el menú"
          onClick={() => onMobileMenuOpenChange(true)}
        >
          <VStack className="ad-bottom-icon" align="center" justify="center" gap={0}>
            <Menu size={18} strokeWidth={1.8} aria-hidden="true" />
          </VStack>
          <Text color="inherit" className="ad-bottom-label">
            Menú
          </Text>
        </button>
      </HStack>

      <MobileNav
        isOpen={mobileMenuOpen}
        onOpenChange={onMobileMenuOpenChange}
        label="Menú del salón"
        width={288}
        header={
          <NextLink
            href="/admin"
            aria-label={`${data.settings.name}, inicio del panel`}
            className="ad-logo-link"
            onClick={closeDrawer}
          >
            <img
              src={brandLogo}
              alt={data.settings.name}
              width={112}
              height={30}
              className="ad-logo-sm"
            />
          </NextLink>
        }
      >
        <VStack gap={4} paddingInline={2} paddingBlock={2} className="ad-drawer-body">
          <AdminNavGroups
            pathname={pathname}
            primaryNavGroups={primaryNavGroups}
            footerNavItems={footerNavItems}
            staffRows={staffRows}
            isCompactRail={false}
            idPrefix="drawer"
            onPrefetchRoute={onPrefetchRoute}
            onItemClick={closeDrawer}
          />
          <AdminFooterControls
            data={data}
            isCompactRail={false}
            soundActive={soundActive}
            soundFeedbackMessage={soundFeedbackMessage}
            isDark={isDark}
            onToggleMute={onToggleMute}
            onTestSound={onTestSound}
            onToggleTheme={onToggleTheme}
            onSwitchDemoUser={onSwitchDemoUser}
            onLogout={onLogout}
            closeDrawer={closeDrawer}
          />
        </VStack>
      </MobileNav>
    </>
  );
}
