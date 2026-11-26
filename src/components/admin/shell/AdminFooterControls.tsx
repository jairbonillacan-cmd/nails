'use client';

import { useState } from 'react';
import NextLink from 'next/link';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Divider } from '@astryxdesign/core/Divider';
import { Popover } from '@astryxdesign/core/Popover';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import { VStack } from '@astryxdesign/core/VStack';
import {
  Check,
  ChevronsUpDown,
  Copy,
  ExternalLink,
  LogOut,
  Moon,
  Sun,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCopyToClipboard } from '@/lib/hooks/useCopyToClipboard';
import type { AdminOverviewPayload } from '../AdminProvider';
import {
  cleanDisplayName,
  getBookingCopyUrl,
  getDisplayBookingHost,
  ROLE_LABELS,
} from './adminNavConfig';

interface AdminFooterControlsProps {
  data: AdminOverviewPayload;
  isCompactRail: boolean;
  soundActive: boolean;
  soundFeedbackMessage: string | null;
  isDark: boolean;
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
  onToggleMute,
  onTestSound,
  onToggleTheme,
  onSwitchDemoUser,
  onLogout,
  closeDrawer,
}: AdminFooterControlsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { copied, feedback, copy } = useCopyToClipboard(2200);
  const role = data.session.user.role;
  const displayName = cleanDisplayName(data.session.user.fullName);
  const bookingDisplayLink = getDisplayBookingHost(data.integration.appUrl);
  const demoUserOptions =
    data.integration.mode === 'demo'
      ? data.adminUsers
          .filter((u) => u.isActive)
          .map((u) => ({
            value: u.email,
            label: `${cleanDisplayName(u.fullName).split(' ')[0]} · ${ROLE_LABELS[u.role]}`,
          }))
      : [];

  const handleCopyBookingLink = () => {
    void copy(
      getBookingCopyUrl(data.integration.appUrl),
      '¡Link de citas copiado!',
      'Copia /reservar',
    );
  };

  const popoverContent = (
    <VStack gap={1.5} className="ad-user-popover">
      <VStack gap={0.5} paddingInline={2} paddingBlock={1}>
        <Text weight="semibold" size="sm" maxLines={1}>
          {displayName}
        </Text>
        <Text type="supporting" color="secondary" size="sm" maxLines={1}>
          {ROLE_LABELS[role]} · {data.settings.name}
        </Text>
      </VStack>

      <Divider />

      {demoUserOptions.length > 1 ? (
        <VStack gap={1} paddingInline={1} paddingBlock={1}>
          <Text type="supporting" color="secondary" size="sm" className="ad-popover-kicker">
            Cambiar cuenta de prueba
          </Text>
          <Selector
            label="Ver panel como"
            isLabelHidden
            size="sm"
            width="100%"
            value={data.session.user.email}
            onChange={(val) => {
              if (val) {
                setMenuOpen(false);
                onSwitchDemoUser(val);
                if (closeDrawer) closeDrawer();
              }
            }}
            options={demoUserOptions}
          />
        </VStack>
      ) : null}

      <button
        type="button"
        className="ad-menu-row fx-press"
        onClick={handleCopyBookingLink}
      >
        {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
        <VStack gap={0} align="start" className="rb-grow">
          <Text color="inherit" size="sm" weight="medium">
            {copied ? '¡Link de citas copiado!' : 'Copiar link de citas'}
          </Text>
          <Text type="supporting" color="secondary" size="sm" className="ad-link-url">
            {bookingDisplayLink}
          </Text>
        </VStack>
      </button>

      <NextLink
        href="/"
        className="ad-menu-row fx-press"
        onClick={() => {
          setMenuOpen(false);
          if (closeDrawer) closeDrawer();
        }}
      >
        <ExternalLink size={15} aria-hidden="true" />
        <Text color="inherit" size="sm" weight="medium">
          Ver página pública
        </Text>
      </NextLink>

      <button
        type="button"
        className="ad-menu-row fx-press"
        aria-pressed={isDark}
        onClick={onToggleTheme}
      >
        {isDark ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
        <Text color="inherit" size="sm" weight="medium">
          {isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        </Text>
      </button>

      <button
        type="button"
        className="ad-menu-row fx-press"
        aria-pressed={soundActive}
        onClick={() => {
          onToggleMute();
          if (!soundActive) onTestSound();
        }}
      >
        {soundActive ? (
          <Volume2 size={15} aria-hidden="true" />
        ) : (
          <VolumeX size={15} aria-hidden="true" />
        )}
        <Text color="inherit" size="sm" weight="medium" maxLines={1}>
          {soundFeedbackMessage
            ? soundFeedbackMessage
            : soundActive
              ? 'Sonido de citas activo'
              : 'Sonido silenciado'}
        </Text>
      </button>

      <Divider />

      <button
        type="button"
        className="ad-menu-row ad-menu-row-danger fx-press"
        onClick={() => {
          setMenuOpen(false);
          if (closeDrawer) closeDrawer();
          onLogout();
        }}
      >
        <LogOut size={15} aria-hidden="true" />
        <Text color="inherit" size="sm" weight="medium">
          Cerrar sesión
        </Text>
      </button>
    </VStack>
  );

  return (
    <VStack
      gap={1}
      align={isCompactRail ? 'center' : 'stretch'}
      className={isCompactRail ? 'ad-side-foot ad-side-foot-compact' : 'ad-side-foot'}
    >
      <Text
        type="supporting"
        color="secondary"
        role="status"
        aria-live="polite"
        className="rb-sr-only"
      >
        {feedback ?? ''}
      </Text>

      <Popover
        isOpen={menuOpen}
        onOpenChange={setMenuOpen}
        placement={isCompactRail ? 'end' : 'above'}
        alignment="start"
        presentation="adaptive"
        width="16rem"
        padding={2}
        label="Opciones de cuenta"
        content={popoverContent}
      >
        {isCompactRail ? (
          <Tooltip
            content={`${displayName} · ${ROLE_LABELS[role]}`}
            placement="end"
            hasHoverIndication={false}
          >
            <button
              type="button"
              className="ad-user-trigger ad-user-trigger-compact fx-press"
              aria-label={`Cuenta de ${displayName} (${ROLE_LABELS[role]})`}
              aria-expanded={menuOpen}
            >
              <Avatar name={displayName} size={32} tooltip={false} />
            </button>
          </Tooltip>
        ) : (
          <button
            type="button"
            className="ad-user-trigger fx-press"
            aria-label={`Opciones de cuenta: ${displayName}`}
            aria-expanded={menuOpen}
          >
            <Avatar name={displayName} size={36} tooltip={false} />
            <VStack gap={0} align="start" className="rb-grow">
              <Text weight="semibold" size="sm" maxLines={1}>
                {displayName}
              </Text>
              <Text type="supporting" color="secondary" size="sm" maxLines={1}>
                {ROLE_LABELS[role]}
              </Text>
            </VStack>
            <ChevronsUpDown size={15} className="ad-user-chevron" aria-hidden="true" />
          </button>
        )}
      </Popover>
    </VStack>
  );
}
