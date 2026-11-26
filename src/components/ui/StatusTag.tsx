'use client';

import type { ReactNode } from 'react';
import { Token, type TokenColor } from '@astryxdesign/core/Token';
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

const TONE_TO_TOKEN_COLOR: Record<StatusTagTone, TokenColor> = {
  neutral: 'gray',
  success: 'green',
  warning: 'yellow',
  danger: 'red',
  info: 'blue',
  accent: 'pink',
};

const TONE_TO_DOT_VARIANT: Record<StatusTagTone, StatusDotVariant> = {
  neutral: 'neutral',
  success: 'success',
  warning: 'warning',
  danger: 'error',
  info: 'accent',
  accent: 'accent',
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
      return { label: 'Completada', tone: 'info' };
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
  const leadingIcon =
    icon ??
    (showDot ? (
      <StatusDot variant={TONE_TO_DOT_VARIANT[tone]} label={label} aria-hidden="true" />
    ) : undefined);

  return (
    <Token
      label={label}
      color={TONE_TO_TOKEN_COLOR[tone]}
      size={size}
      icon={leadingIcon}
      className={className}
      style={hasTabularNumbers ? { fontVariantNumeric: 'tabular-nums' } : undefined}
    />
  );
}

export function BookingStatusTag({
  status,
  hasPaymentProof = false,
  size = 'sm',
  showDot = true,
  className,
}: BookingStatusTagProps) {
  const meta = resolveBookingStatusMeta(status, hasPaymentProof);
  return <StatusTag label={meta.label} tone={meta.tone} size={size} showDot={showDot} className={className} />;
}

export function WaitlistStatusTag({
  status,
  size = 'sm',
  showDot = true,
  className,
}: WaitlistStatusTagProps) {
  const meta = WAITLIST_STATUS_META[status];
  return <StatusTag label={meta.label} tone={meta.tone} size={size} showDot={showDot} className={className} />;
}

export function PackageStatusTag({
  status,
  isExpired = false,
  size = 'sm',
  showDot = true,
  className,
}: PackageStatusTagProps) {
  const meta = PACKAGE_STATUS_META[isExpired ? 'expired' : status];
  return <StatusTag label={meta.label} tone={meta.tone} size={size} showDot={showDot} className={className} />;
}
