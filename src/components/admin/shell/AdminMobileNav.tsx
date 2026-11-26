'use client';

import NextLink from 'next/link';
import { MobileNav } from '@astryxdesign/core/MobileNav';
import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';
import { LANDING_ASSETS } from '../../landing/landingContent';
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

  return (
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
          <Text className="ad-brand-tile" aria-hidden="true">
            <img
              src={LANDING_ASSETS.cherriesWhite}
              alt=""
              width={16}
              height={16}
              className="ad-brand-tile-mark"
            />
          </Text>
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
  );
}
