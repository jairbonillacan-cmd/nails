'use client';

import type { ReactNode } from 'react';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { StatusDot, type StatusDotVariant } from '@astryxdesign/core/StatusDot';
import type { BookingStatus, ClientPackage, WaitlistEntry } from '@/lib/types';

export type StatusTagTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

interface StatusTagProps {
  label: string;
  tone?: StatusTagTone;
  showDot?: boolean;
  icon?: ReactNode;
  size?: 'sm' | 'md';
  hasTabularNumbers?: boolean;
  className?: string;
}

interface DomainTagBaseProps {
  size?: 'sm' | 'md';
  showDot?: boolean;
  className?: string;
}

interface BookingStatusTagProps extends DomainTagBaseProps {
  status: BookingStatus;
  hasPaymentProof?: boolean;
}

interface WaitlistStatusTagProps extends DomainTagBaseProps {
  status: WaitlistEntry['status'];
}

interface PackageStatusTagProps extends DomainTagBaseProps {
  status: ClientPackage['status'];
  isExpired?: boolean;
}

const TONE_TO_DOT_VARIANT: Record<StatusTagTone, StatusDotVariant> = {
  neutral: 'neutral',
  success: 'success',
  warning: 'warning',
  danger: 'error',
  info: 'accent',
  accent: 'accent',
};

const TONE_TEXT_COLOR: Record<StatusTagTone, string> = {
  neutral: 'var(--color-text-secondary)',
  success: 'var(--color-text-success)',
  warning: 'var(--color-text-warning)',
  danger: 'var(--color-text-error)',
  info: 'var(--color-text-info)',
  accent: 'var(--color-text-accent)',
};

const WAITLIST_STATUS_META: Record<
  WaitlistEntry['status'],
  { label: string; tone: StatusTagTone }
> = {
  waiting: { label: 'En espera', tone: 'warning' },
  notified: { label: 'Avisada', tone: 'info' },
  booked: { label: 'Agendada', tone: 'success' },
  expired: { label: 'Vencida', tone: 'neutral' },
};

const PACKAGE_STATUS_META: Record<
  ClientPackage['status'],
  { label: string; tone: StatusTagTone }
> = {
  active: { label: 'Activo', tone: 'success' },
  exhausted: { label: 'Completado', tone: 'info' },
  expired: { label: 'Vencido', tone: 'neutral' },
  canceled: { label: 'Cancelado', tone: 'danger' },
};

function resolveBookingStatusMeta(
  status: BookingStatus,
  hasPaymentProof: boolean,
): { label: string; tone: StatusTagTone } {
  switch (status) {
    case 'confirmed':
      return { label: 'Confirmada', tone: 'success' };
    case 'pending_confirmation':
      return {
        label: hasPaymentProof ? 'Comprobante en revisión' : 'Por confirmar',
        tone: 'warning',
      };
    case 'pending_payment':
      return {
        label: hasPaymentProof ? 'Comprobante en revisión' : 'Falta anticipo',
        tone: 'warning',
      };
    case 'completed':
      return { label: 'Completada', tone: 'neutral' };
    case 'canceled':
      return { label: 'Cancelada', tone: 'danger' };
    case 'no_show':
      return { label: 'No llegó', tone: 'danger' };
  }
}

export function StatusTag({
  label,
  tone = 'neutral',
  showDot = false,
  icon,
  size = 'sm',
  hasTabularNumbers = false,
  className,
}: StatusTagProps) {
  const rootClass = className ? `ad-status-tag ${className}` : 'ad-status-tag';
  const leading =
    icon ??
    (showDot ? (
      <StatusDot variant={TONE_TO_DOT_VARIANT[tone]} label={label} aria-hidden="true" />
    ) : null);

  return (
    <HStack
      align="center"
      gap={1.5}
      className={rootClass}
      data-tone={tone}
      data-size={size}
      style={{
        display: 'inline-flex',
        flexShrink: 0,
        color: TONE_TEXT_COLOR[tone],
        fontVariantNumeric: hasTabularNumbers ? 'tabular-nums' : undefined,
      }}
    >
      {leading}
      <Text
        color="inherit"
        weight="semibold"
        size={size === 'md' ? 'base' : 'sm'}
        hasTabularNumbers={hasTabularNumbers}
      >
        {label}
      </Text>
    </HStack>
  );
}

export function BookingStatusTag({
  status,
  hasPaymentProof = false,
  size = 'sm',
  showDot = false,
  className,
}: BookingStatusTagProps) {
  const meta = resolveBookingStatusMeta(status, hasPaymentProof);
  return <StatusTag label={meta.label} tone={meta.tone} size={size} showDot={showDot} className={className} />;
}

export function WaitlistStatusTag({
  status,
  size = 'sm',
  showDot = false,
  className,
}: WaitlistStatusTagProps) {
  const meta = WAITLIST_STATUS_META[status];
  return <StatusTag label={meta.label} tone={meta.tone} size={size} showDot={showDot} className={className} />;
}

export function PackageStatusTag({
  status,
  isExpired = false,
  size = 'sm',
  showDot = false,
  className,
}: PackageStatusTagProps) {
  const meta = PACKAGE_STATUS_META[isExpired ? 'expired' : status];
  return <StatusTag label={meta.label} tone={meta.tone} size={size} showDot={showDot} className={className} />;
}
