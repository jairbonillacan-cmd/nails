'use client';

import type React from 'react';
import NextLink from 'next/link';
import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock,
  LayoutGrid,
  Package,
  Palette,
  Plug,
  Scissors,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import type {
  NavGroupConfig,
  NavIconId,
  NavItemConfig,
  SidebarStaffRow,
} from './adminNavConfig';

function renderNavIcon(iconId: NavIconId): React.ReactNode {
  switch (iconId) {
    case 'overview':
      return <LayoutGrid size={16} strokeWidth={1.85} aria-hidden="true" />;
    case 'bookings':
      return <CalendarDays size={16} strokeWidth={1.85} aria-hidden="true" />;
    case 'clients':
      return <Users size={16} strokeWidth={1.85} aria-hidden="true" />;
    case 'cash':
      return <Wallet size={16} strokeWidth={1.85} aria-hidden="true" />;
    case 'services':
      return <Scissors size={16} strokeWidth={1.85} aria-hidden="true" />;
    case 'availability':
      return <Clock size={16} strokeWidth={1.85} aria-hidden="true" />;
    case 'team':
      return <UserCheck size={16} strokeWidth={1.85} aria-hidden="true" />;
    case 'brand':
      return <Palette size={16} strokeWidth={1.85} aria-hidden="true" />;
    case 'reports':
      return <BarChart3 size={16} strokeWidth={1.85} aria-hidden="true" />;
    case 'inventory':
      return <Package size={16} strokeWidth={1.85} aria-hidden="true" />;
    case 'integrations':
      return <Plug size={16} strokeWidth={1.85} aria-hidden="true" />;
    case 'onboarding':
      return <CheckCircle2 size={16} strokeWidth={1.85} aria-hidden="true" />;
  }
}

interface AdminNavGroupsProps {
  pathname: string;
  primaryNavGroups: NavGroupConfig[];
  footerNavItems: NavItemConfig[];
  staffRows: SidebarStaffRow[];
  isCompactRail: boolean;
  onPrefetchRoute: (routeId: string, href: string) => void;
  onItemClick?: () => void;
}

export function AdminNavGroups({
  pathname,
  primaryNavGroups,
  footerNavItems,
  staffRows,
  isCompactRail,
  onPrefetchRoute,
  onItemClick,
}: AdminNavGroupsProps) {
  const renderNavItem = (item: NavItemConfig) => {
    const isSelected = pathname === item.matchPath;
    const tooltipText = item.badge ? `${item.label} (${item.badge})` : item.label;
    const linkNode = (
      <NextLink
        href={item.href}
        className={isCompactRail ? 'ad-nav ad-nav-compact fx-press' : 'ad-nav fx-press'}
        data-on={isSelected ? 'true' : 'false'}
        aria-current={isSelected ? 'page' : undefined}
        aria-label={isCompactRail ? tooltipText : undefined}
        onMouseEnter={() => onPrefetchRoute(item.id, item.href)}
        onFocus={() => onPrefetchRoute(item.id, item.href)}
        onClick={onItemClick}
      >
        <Text color="inherit" className="ad-nav-icon" aria-hidden="true">
          {renderNavIcon(item.id)}
        </Text>
        {!isCompactRail ? (
          <Text color="inherit" className="ad-nav-label">
            {item.label}
          </Text>
        ) : null}
        {item.badge ? (
          isCompactRail ? (
            <Text className="ad-rail-dot" aria-hidden="true">
              {'\u200B'}
            </Text>
          ) : (
            <Text color="inherit" weight="semibold" className="ad-nav-count" hasTabularNumbers>
              {item.badge}
            </Text>
          )
        ) : null}
      </NextLink>
    );

    return (
      <li key={item.id}>
        {isCompactRail ? (
          <Tooltip content={tooltipText} placement="end" hasHoverIndication={false}>
            {linkNode}
          </Tooltip>
        ) : (
          linkNode
        )}
      </li>
    );
  };

  return (
    <VStack as="nav" aria-label="Panel" gap={isCompactRail ? 2 : 4} className="ad-nav-wrap">
      {primaryNavGroups.map((group, groupIdx) => (
        <VStack
          key={group.title}
          gap={1}
          className={isCompactRail && groupIdx > 0 ? 'ad-nav-group-rail' : undefined}
        >
          {!isCompactRail ? (
            <Text type="supporting" weight="medium" className="ad-nav-group-title">
              {group.title}
            </Text>
          ) : null}
          <VStack as="ul" gap={0.5} className="ad-nav-list">
            {group.items.map(renderNavItem)}
          </VStack>
        </VStack>
      ))}

      {!isCompactRail && staffRows.length > 0 ? (
        <VStack gap={1}>
          <Text type="supporting" weight="medium" className="ad-nav-group-title">
            Profesionales
          </Text>
          <VStack as="ul" gap={0.5} className="ad-nav-list">
            {staffRows.map((member) => (
              <li key={member.id}>
                <NextLink
                  href={member.href}
                  className="ad-nav ad-nav-staff fx-press"
                  onMouseEnter={() => onPrefetchRoute('bookings', member.href)}
                  onFocus={() => onPrefetchRoute('bookings', member.href)}
                  onClick={onItemClick}
                >
                  <Text
                    className="ad-staff-dot"
                    data-active={member.todayCount > 0 ? 'true' : 'false'}
                    aria-hidden="true"
                  >
                    {'\u200B'}
                  </Text>
                  <Text color="inherit" className="ad-nav-label">
                    {member.firstName}
                  </Text>
                  <Text type="supporting" className="ad-staff-meta" hasTabularNumbers>
                    {member.todayCount > 0 ? `${member.todayCount} hoy` : 'Libre'}
                  </Text>
                </NextLink>
              </li>
            ))}
          </VStack>
        </VStack>
      ) : null}

      {footerNavItems.length > 0 ? (
        <VStack
          gap={0.5}
          className={isCompactRail ? 'ad-nav-group-rail ad-nav-utility' : 'ad-nav-utility'}
        >
          <VStack as="ul" gap={0.5} className="ad-nav-list">
            {footerNavItems.map(renderNavItem)}
          </VStack>
        </VStack>
      ) : null}
    </VStack>
  );
}
