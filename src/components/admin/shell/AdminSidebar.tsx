'use client';

import NextLink from 'next/link';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import type { AdminOverviewPayload } from '../AdminProvider';
import type { NavGroupConfig, NavItemConfig, SidebarStaffRow } from './adminNavConfig';
import { AdminNavGroups } from './AdminNavGroups';
import { AdminFooterControls } from './AdminFooterControls';

interface AdminSidebarProps {
  data: AdminOverviewPayload;
  pathname: string;
  brandLogo: string;
  sidebarCollapsed: boolean;
  primaryNavGroups: NavGroupConfig[];
  footerNavItems: NavItemConfig[];
  staffRows: SidebarStaffRow[];
  soundActive: boolean;
  soundFeedbackMessage: string | null;
  isDark: boolean;
  onPrefetchRoute: (routeId: string, href: string) => void;
  onToggleMute: () => void;
  onTestSound: () => void;
  onToggleTheme: () => void;
  onSwitchDemoUser: (email: string) => void;
  onLogout: () => void;
}

export function AdminSidebar({
  data,
  pathname,
  brandLogo,
  sidebarCollapsed,
  primaryNavGroups,
  footerNavItems,
  staffRows,
  soundActive,
  soundFeedbackMessage,
  isDark,
  onPrefetchRoute,
  onToggleMute,
  onTestSound,
  onToggleTheme,
  onSwitchDemoUser,
  onLogout,
}: AdminSidebarProps) {
  return (
    <VStack
      as="aside"
      className="ad-side"
      data-collapsed={sidebarCollapsed ? 'true' : 'false'}
      gap={4}
      aria-label="Menú lateral"
    >
      {sidebarCollapsed ? (
        <HStack justify="center" align="center" className="ad-side-top-compact">
          <Tooltip content={data.settings.name} placement="end" hasHoverIndication={false}>
            <NextLink
              href="/admin"
              aria-label={`${data.settings.name}, inicio del panel`}
              className="ad-logo-link ad-logo-compact fx-press"
            >
              <img
                src={brandLogo}
                alt=""
                width={44}
                height={12}
                aria-hidden="true"
                className="ad-logo"
              />
            </NextLink>
          </Tooltip>
        </HStack>
      ) : (
        <HStack align="center" gap={2} className="ad-side-top">
          <NextLink
            href="/admin"
            aria-label={`${data.settings.name}, inicio del panel`}
            className="ad-logo-link"
          >
            <img
              src={brandLogo}
              alt={data.settings.name}
              width={118}
              height={32}
              className="ad-logo"
            />
          </NextLink>
        </HStack>
      )}

      <AdminNavGroups
        pathname={pathname}
        primaryNavGroups={primaryNavGroups}
        footerNavItems={footerNavItems}
        staffRows={staffRows}
        isCompactRail={sidebarCollapsed}
        onPrefetchRoute={onPrefetchRoute}
      />

      <AdminFooterControls
        data={data}
        isCompactRail={sidebarCollapsed}
        soundActive={soundActive}
        soundFeedbackMessage={soundFeedbackMessage}
        isDark={isDark}
        onToggleMute={onToggleMute}
        onTestSound={onTestSound}
        onToggleTheme={onToggleTheme}
        onSwitchDemoUser={onSwitchDemoUser}
        onLogout={onLogout}
      />
    </VStack>
  );
}
