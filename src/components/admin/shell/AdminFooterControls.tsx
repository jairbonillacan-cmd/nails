'use client';

import NextLink from 'next/link';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Selector } from '@astryxdesign/core/Selector';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import {
  ExternalLink,
  LogOut,
  Moon,
  Sun,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { AdminOverviewPayload } from '../AdminProvider';
import { cleanDisplayName, getInitials, ROLE_LABELS } from './adminNavConfig';

interface AdminFooterControlsProps {
  data: AdminOverviewPayload;
  isCompactRail: boolean;
  soundActive: boolean;
  soundFeedbackMessage: string | null;
  isDark: boolean;
  onExpandSidebar: () => void;
  onToggleMute: () => void;
  onTestSound: () => void;
  onToggleTheme: () => void;
  onSwitchDemoUser: (email: string) => void;
  onLogout: () => void;
  closeDrawer?: () => void;
}

export function AdminFooterControls({
  data,
  isCompactRail,
  soundActive,
  soundFeedbackMessage,
  isDark,
  onExpandSidebar,
  onToggleMute,
  onTestSound,
  onToggleTheme,
  onSwitchDemoUser,
  onLogout,
  closeDrawer,
}: AdminFooterControlsProps) {
  const role = data.session.user.role;
  const displayName = cleanDisplayName(data.session.user.fullName);
  const initials = getInitials(displayName);

  if (isCompactRail) {
    return (
      <VStack gap={1.5} align="center" className="ad-side-foot ad-side-foot-compact">
        <Tooltip
          content={`${displayName} · ${ROLE_LABELS[role]}`}
          placement="end"
          hasHoverIndication={false}
        >
          <button
            type="button"
            className="ad-avatar-btn"
            aria-label={`${displayName} (${ROLE_LABELS[role]}). Expandir barra lateral`}
            onClick={onExpandSidebar}
          >
            <Text color="inherit" weight="bold" className="ad-avatar" aria-hidden="true">
              {initials}
            </Text>
            <Text className="ad-online-dot" aria-hidden="true">
              {'\u200B'}
            </Text>
          </button>
        </Tooltip>

        <Tooltip
          content={
            soundActive ? 'Quitar sonido de citas nuevas' : 'Sonar con cada cita nueva'
          }
          placement="end"
          hasHoverIndication={false}
        >
          <button
            type="button"
            className="ad-rail-btn"
            aria-label={
              soundActive ? 'Quitar sonido de citas nuevas' : 'Sonar con cada cita nueva'
            }
            aria-pressed={soundActive}
            onClick={onToggleMute}
          >
            {soundActive ? (
              <Volume2 size={16} strokeWidth={1.85} aria-hidden="true" />
            ) : (
              <VolumeX size={16} strokeWidth={1.85} aria-hidden="true" />
            )}
          </button>
        </Tooltip>

        <Tooltip
          content={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          placement="end"
          hasHoverIndication={false}
        >
          <button
            type="button"
            className="ad-rail-btn"
            aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            aria-pressed={isDark}
            onClick={onToggleTheme}
          >
            {isDark ? (
              <Sun size={16} strokeWidth={1.85} aria-hidden="true" />
            ) : (
              <Moon size={16} strokeWidth={1.85} aria-hidden="true" />
            )}
          </button>
        </Tooltip>

        <Tooltip content="Ver mi página" placement="end" hasHoverIndication={false}>
          <NextLink href="/" className="ad-rail-btn" aria-label="Ver mi página">
            <ExternalLink size={16} strokeWidth={1.85} aria-hidden="true" />
          </NextLink>
        </Tooltip>

        <Tooltip content="Salir" placement="end" hasHoverIndication={false}>
          <button
            type="button"
            className="ad-rail-btn"
            aria-label="Salir"
            onClick={onLogout}
          >
            <LogOut size={16} strokeWidth={1.85} aria-hidden="true" />
          </button>
        </Tooltip>
      </VStack>
    );
  }

  return (
    <VStack gap={2} className="ad-side-foot">
      <HStack gap={2} align="center">
        <HStack className="ad-avatar-wrap" aria-hidden="true">
          <Text color="inherit" weight="bold" className="ad-avatar">
            {initials}
          </Text>
          <Text className="ad-online-dot">{'\u200B'}</Text>
        </HStack>
        <VStack gap={0} className="rb-grow">
          <Text weight="semibold" size="sm" maxLines={1}>
            {displayName}
          </Text>
          <Text type="supporting" color="secondary" size="sm">
            {ROLE_LABELS[role]}
          </Text>
        </VStack>
      </HStack>

      {data.integration.mode === 'demo' ? (
        <Selector
          label="Ver panel como"
          isLabelHidden
          size="sm"
          width="100%"
          value={data.session.user.email}
          onChange={(val) => {
            if (val) {
              onSwitchDemoUser(val);
              if (closeDrawer) closeDrawer();
            }
          }}
          options={data.adminUsers
            .filter((u) => u.isActive)
            .map((u) => ({
              value: u.email,
              label: `${cleanDisplayName(u.fullName).split(' ')[0]} · ${ROLE_LABELS[u.role]}`,
            }))}
        />
      ) : null}

      <button
        type="button"
        className="ad-pill ad-foot-pill fx-press"
        aria-pressed={soundActive}
        onClick={() => {
          onToggleMute();
          if (!soundActive) onTestSound();
        }}
      >
        {soundActive ? (
          <Volume2 size={14} aria-hidden="true" />
        ) : (
          <VolumeX size={14} aria-hidden="true" />
        )}
        <Text color="inherit" size="sm" weight="semibold" maxLines={1}>
          {soundFeedbackMessage
            ? soundFeedbackMessage
            : soundActive
              ? 'Sonar con cada cita nueva'
              : 'Sin sonido'}
        </Text>
      </button>

      <HStack justify="between" align="center" gap={1}>
        <Tooltip content={isDark ? 'Modo claro' : 'Modo oscuro'} hasHoverIndication={false}>
          <button
            type="button"
            className="ad-rail-btn"
            aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            aria-pressed={isDark}
            onClick={onToggleTheme}
          >
            {isDark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
          </button>
        </Tooltip>
        <NextLink href="/" className="ad-foot-link" onClick={closeDrawer}>
          <ExternalLink size={14} aria-hidden="true" />
          <Text color="inherit" size="sm">
            Mi página
          </Text>
        </NextLink>
        <button
          type="button"
          className="ad-foot-link"
          onClick={() => {
            if (closeDrawer) closeDrawer();
            onLogout();
          }}
        >
          <LogOut size={14} aria-hidden="true" />
          <Text color="inherit" size="sm">
            Salir
          </Text>
        </button>
      </HStack>
    </VStack>
  );
}
