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
  ChevronDown,
  ChevronRight,
  Clock,
  Home,
  Package,
  Palette,
  Plug,
  Scissors,
  SlidersHorizontal,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import type { NavGroupConfig, NavIconId, NavItemConfig } from './adminNavConfig';

function renderNavIcon(iconId: NavIconId): React.ReactNode {
  switch (iconId) {
    case 'overview':
      return <Home size={17} strokeWidth={1.85} aria-hidden="true" />;
    case 'bookings':
      return <CalendarDays size={17} strokeWidth={1.85} aria-hidden="true" />;
    case 'clients':
      return <Users size={17} strokeWidth={1.85} aria-hidden="true" />;
    case 'cash':
      return <Wallet size={17} strokeWidth={1.85} aria-hidden="true" />;
    case 'services':
      return <Scissors size={17} strokeWidth={1.85} aria-hidden="true" />;
    case 'availability':
      return <Clock size={17} strokeWidth={1.85} aria-hidden="true" />;
    case 'team':
      return <UserCheck size={17} strokeWidth={1.85} aria-hidden="true" />;
    case 'brand':
      return <Palette size={17} strokeWidth={1.85} aria-hidden="true" />;
    case 'reports':
      return <BarChart3 size={17} strokeWidth={1.85} aria-hidden="true" />;
    case 'inventory':
      return <Package size={17} strokeWidth={1.85} aria-hidden="true" />;
    case 'integrations':
      return <Plug size={17} strokeWidth={1.85} aria-hidden="true" />;
    case 'onboarding':
      return <CheckCircle2 size={17} strokeWidth={1.85} aria-hidden="true" />;
  }
}

interface AdminNavGroupsProps {
  pathname: string;
  primaryNavGroups: NavGroupConfig[];
  secondaryNavItems: NavItemConfig[];
  isSecondaryRouteActive: boolean;
  isMoreToolsOpen: boolean;
  isCompactRail: boolean;
  idPrefix: 'side' | 'drawer';
  onToggleMoreTools: () => void;
  onPrefetchRoute: (routeId: string, href: string) => void;
  onItemClick?: () => void;
}

export function AdminNavGroups({
  pathname,
  primaryNavGroups,
  secondaryNavItems,
  isSecondaryRouteActive,
  isMoreToolsOpen,
  isCompactRail,
  idPrefix,
  onToggleMoreTools,
  onPrefetchRoute,
  onItemClick,
}: AdminNavGroupsProps) {
  const moreListId = `ad-more-tools-${idPrefix}`;
  const secondaryHasBadge = secondaryNavItems.some((item) => Boolean(item.badge));

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
        {renderNavIcon(item.id)}
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
            <Text color="inherit" weight="bold" className="ad-nav-badge" hasTabularNumbers>
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
    <VStack as="nav" aria-label="Panel" gap={isCompactRail ? 1.5 : 2} className="ad-nav-wrap">
      {primaryNavGroups.map((group, groupIdx) => (
        <VStack
          key={group.title}
          gap={0.5}
          className={isCompactRail && groupIdx > 0 ? 'ad-nav-group-rail' : undefined}
        >
          {!isCompactRail ? (
            <Text type="supporting" weight="semibold" className="ad-nav-group-title">
              {group.title}
            </Text>
          ) : null}
          <VStack as="ul" gap={0.5} className="ad-nav-list">
            {group.items.map(renderNavItem)}
          </VStack>
        </VStack>
      ))}

      {secondaryNavItems.length > 0 ? (
        <VStack gap={0.5} className={isCompactRail ? 'ad-nav-group-rail' : undefined}>
          {isCompactRail ? (
            <Tooltip
              content={isMoreToolsOpen ? 'Ocultar más herramientas' : 'Más herramientas'}
              placement="end"
              hasHoverIndication={false}
            >
              <button
                type="button"
                className="ad-nav ad-nav-compact fx-press"
                data-on={isSecondaryRouteActive && !isMoreToolsOpen ? 'true' : 'false'}
                aria-label="Más herramientas"
                aria-expanded={isMoreToolsOpen}
                aria-controls={moreListId}
                onClick={onToggleMoreTools}
              >
                <SlidersHorizontal size={16} strokeWidth={1.85} aria-hidden="true" />
                {!isMoreToolsOpen && secondaryHasBadge ? (
                  <Text className="ad-rail-dot" aria-hidden="true">
                    {'\u200B'}
                  </Text>
                ) : null}
              </button>
            </Tooltip>
          ) : (
            <button
              type="button"
              className="ad-nav-more-btn fx-press"
              data-open={isMoreToolsOpen ? 'true' : 'false'}
              aria-expanded={isMoreToolsOpen}
              aria-controls={moreListId}
              onClick={onToggleMoreTools}
            >
              <Text color="inherit" size="sm" weight="semibold">
                Más herramientas
              </Text>
              {isMoreToolsOpen ? (
                <ChevronDown size={15} strokeWidth={1.9} aria-hidden="true" />
              ) : (
                <ChevronRight size={15} strokeWidth={1.9} aria-hidden="true" />
              )}
            </button>
          )}

          {isMoreToolsOpen ? (
            <VStack as="ul" id={moreListId} gap={0.5} className="ad-nav-list">
              {secondaryNavItems.map(renderNavItem)}
            </VStack>
          ) : null}
        </VStack>
      ) : null}
    </VStack>
  );
}
