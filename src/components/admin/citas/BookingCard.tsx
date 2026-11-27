'use client';

import { memo } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Token } from '@astryxdesign/core/Token';
import { Link } from '@astryxdesign/core/Link';
import { Divider } from '@astryxdesign/core/Divider';
import { BookingStatusTag, StatusTag } from '@/components/ui';
import {
  AtSign,
  CalendarClock,
  Check,
  CheckCircle2,
  DollarSign,
  MessageCircle,
  UserRound,
  UserX,
} from 'lucide-react';
import {
  computeBookingBalance,
  isPendingDepositStatus,
} from '@/lib/booking/balance';
import { canTransitionBookingStatus } from '@/lib/booking/state-machine';
import { roleCanAccess } from '@/lib/rbac';
import type {
  BookingStatus,
  BookingWithRelations,
  CashRegisterEntry,
  PaymentSplit,
  Service,
} from '@/lib/types';
import {
  buildWhatsAppLink,
  formatCurrency,
  formatDateShortInTimezone,
  formatDuration,
  formatTimeInTimezone,
  formatPhoneDisplay,
} from '@/lib/format';
import { useAdminData } from '../AdminProvider';

export const BOOKING_STATUS_BADGE: Record<
  BookingStatus,
  { label: string; variant: 'success' | 'warning' | 'error' | 'info' | 'neutral' }
> = {
  confirmed: { label: 'Confirmada', variant: 'success' },
  pending_confirmation: { label: 'Por confirmar', variant: 'warning' },
  pending_payment: { label: 'Falta anticipo', variant: 'warning' },
  completed: { label: 'Completada', variant: 'info' },
  canceled: { label: 'Cancelada', variant: 'error' },
  no_show: { label: 'No llegó', variant: 'error' },
};

const IG_SAFE_RE = /^[a-zA-Z0-9._]{1,30}$/;

export function buildInstagramProfileUrl(handle?: string | null): string | null {
  if (!handle) return null;
  const cleaned = handle.trim().replace(/^@+/, '');
  if (!cleaned || !IG_SAFE_RE.test(cleaned)) return null;
  return `https://www.instagram.com/${cleaned}/`;
}

export function isDisplayableProofImage(
  url: string | null,
  method?: BookingWithRelations['proofDeliveryMethod'],
): url is string {
  if (!url) return false;
  if (method === 'web_link' || url.startsWith('https://')) return false;
  return url.startsWith('/api/media/');
}

export function getProofBadgeMeta(
  booking: BookingWithRelations,
): { label: string; color: 'green' | 'orange' | 'purple' | 'gray' } | null {
  if (booking.proofDeliveryMethod === 'web_upload' || booking.paymentProofUrl) {
    return { label: 'Comprobante subido', color: 'green' };
  }
  if (booking.proofDeliveryMethod === 'instagram_dm') {
    return { label: 'Comprobante por Instagram', color: 'purple' };
  }
  if (booking.depositAmountCents > 0) {
    return { label: 'Falta comprobante', color: 'orange' };
  }
  return null;
}

interface BookingCardProps {
  booking: BookingWithRelations;
  allServices: Service[];
  paymentSplits?: PaymentSplit[];
  cashEntries?: CashRegisterEntry[];
  nowMs?: number;
  salonName: string;
  currency: 'MXN' | 'USD';
  timezone: string;
  canViewClients?: boolean;
  busyStatus?: BookingStatus | null;
  isRequestingReschedule?: boolean;
  onSelectBooking?: (booking: BookingWithRelations) => void;
  onUpdateStatus: (bookingId: string, status: BookingStatus) => void;
  onOpenCheckout: (booking: BookingWithRelations) => void;
  onRequestReschedule?: (bookingId: string) => void;
}

export const BookingCard = memo(function BookingCard({
  booking: b,
  allServices,
  paymentSplits = [],
  cashEntries = [],
  nowMs,
  salonName,
  currency,
  timezone,
  canViewClients = true,
  busyStatus = null,
  isRequestingReschedule = false,
  onSelectBooking,
  onUpdateStatus,
  onOpenCheckout,
  onRequestReschedule,
}: BookingCardProps) {
  const { data: adminData } = useAdminData();
  const canOpenWhatsAppInbox = Boolean(
    adminData && roleCanAccess(adminData.session.user.role, 'whatsapp'),
  );
  const isBusy = Boolean(busyStatus);
  const extraServiceNames = (b.extraServiceIds ?? [])
    .map((id) => allServices.find((s) => s.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const igHandle = b.clientInstagram ?? b.client.instagramHandle ?? null;
  const igUrl = buildInstagramProfileUrl(igHandle);
  const proofMeta = getProofBadgeMeta(b);
  const hasDisplayableProof = isDisplayableProofImage(b.paymentProofUrl, b.proofDeliveryMethod);
  const balance = computeBookingBalance(b, paymentSplits, cashEntries, nowMs);
  const isPastUnclosed = balance.isPastUnclosed;
  const isPending = isPendingDepositStatus(b.status);
  const canReschedule = isPending || b.status === 'confirmed';
  const canCollect =
    b.status === 'confirmed' ||
    (b.status === 'completed' && balance.isUncollected) ||
    isPastUnclosed;
  const canMarkCompleted = canTransitionBookingStatus(b.status, 'completed');
  const canMarkNoShow = canTransitionBookingStatus(b.status, 'no_show');

  const waInboxHref = `/admin/whatsapp?phone=${encodeURIComponent(b.client.phoneE164)}&bookingId=${encodeURIComponent(b.id)}`;
  const waHref = buildWhatsAppLink(
    b.client.phoneE164,
    `Hola ${b.client.fullName}, te escribimos de ${salonName} sobre tu cita (${b.bookingCode}) de ${b.service.name} el ${formatDateShortInTimezone(
      b.startAt,
      timezone,
    )} a las ${formatTimeInTimezone(b.startAt, timezone)}.`,
  );

  return (
    <VStack
      as="article"
      className={isBusy ? 'ad-surface fx-card-lift fx-busy' : 'ad-surface fx-card-lift'}
      data-padded="true"
      aria-busy={isBusy || undefined}
      gap={3}
    >
      <HStack justify="between" align="start" wrap="wrap" gap={3}>
        <VStack gap={1} className="rb-grow">
          <HStack gap={2} align="center" wrap="wrap">
            {onSelectBooking ? (
              <button
                type="button"
                className="ad-inline-link fx-press"
                disabled={isBusy}
                onClick={() => onSelectBooking(b)}
                style={{
                  border: 0,
                  background: 'transparent',
                  padding: 0,
                  font: 'inherit',
                  textAlign: 'start',
                  cursor: 'pointer',
                  color: 'var(--color-text-primary)',
                }}
              >
                <Text weight="semibold" size="lg">
                  {b.client.fullName}
                </Text>
              </button>
            ) : (
              <Text weight="semibold" size="lg">
                {b.client.fullName}
              </Text>
            )}
            {isPastUnclosed ? (
              <StatusTag tone="warning" showDot label="Pasada sin cerrar" />
            ) : (
              <BookingStatusTag status={b.status} hasPaymentProof={Boolean(b.paymentProofUrl)} />
            )}
            {isBusy ? (
              <Text className="fx-save-pill" data-state="saving" role="status" aria-live="polite">
                Actualizando…
              </Text>
            ) : null}
            {b.status !== 'canceled' && b.status !== 'no_show' ? (
              <StatusTag
                tone={balance.isFullyPaid ? 'success' : 'warning'}
                hasTabularNumbers
                label={
                  balance.isFullyPaid
                    ? 'Pagado'
                    : `Falta cobrar ${formatCurrency(balance.remainingCents, currency)}`
                }
              />
            ) : null}
            <Token size="sm" label={b.bookingCode} />
            <Token
              size="sm"
              color={b.source === 'whatsapp' ? 'green' : 'default'}
              label={
                b.source === 'whatsapp'
                  ? 'WhatsApp'
                  : b.source === 'walk_in'
                    ? 'Llegó sin cita'
                    : b.source === 'manual'
                      ? 'En salón'
                      : 'En línea'
              }
            />
          </HStack>

          <Text weight="medium">
            {b.service.name}
            {extraServiceNames.length > 0 ? ` + ${extraServiceNames.join(' + ')}` : ''}
            {b.addons.length > 0
              ? ` · Extras: ${b.addons.map((a) => a.name).join(', ')}`
              : ''}
          </Text>

          <Text type="supporting" color="secondary" hasTabularNumbers>
            {formatDateShortInTimezone(b.startAt, timezone)} ·{' '}
            {formatTimeInTimezone(b.startAt, timezone)} –{' '}
            {formatTimeInTimezone(b.endAt, timezone)} (
            {formatDuration(b.totalDurationMinutes)}) · Profesional: {b.staff.name}
          </Text>

          <HStack gap={2} align="center" wrap="wrap">
            {igHandle && igUrl ? (
              <HStack gap={1} align="center">
                <AtSign size={13} aria-hidden="true" />
                <Link href={igUrl} isExternalLink size="sm" weight="medium">
                  {igHandle}
                </Link>
              </HStack>
            ) : null}
            {proofMeta ? (
              <Token size="sm" color={proofMeta.color} label={proofMeta.label} />
            ) : null}
            {balance.depositPaidCents > 0 ? (
              <Token
                size="sm"
                color="green"
                label={`Anticipo pagado ${formatCurrency(balance.depositPaidCents, currency)}`}
              />
            ) : b.depositAmountCents > 0 ? (
              <Token
                size="sm"
                color="default"
                label={`Anticipo ${formatCurrency(b.depositAmountCents, currency)}`}
              />
            ) : null}
          </HStack>

          {b.clientNotes ? (
            <Text type="supporting" color="secondary">
              Nota de la clienta: {b.clientNotes}
            </Text>
          ) : null}
          {b.internalNotes ? (
            <Text type="supporting" color="secondary">
              Nota interna: {b.internalNotes}
            </Text>
          ) : null}
        </VStack>

        <HStack gap={3} align="center">
          {hasDisplayableProof && b.paymentProofUrl && onSelectBooking ? (
            <button
              type="button"
              className="ad-proof-thumb"
              aria-label={`Ver comprobante de ${b.client.fullName}`}
              onClick={() => onSelectBooking(b)}
            >
              <img
                src={b.paymentProofUrl}
                alt={`Comprobante de anticipo de ${b.client.fullName}`}
              />
            </button>
          ) : null}
          <VStack align="end" gap={0.5}>
            <Text className="lk-serif ad-h2 fx-tabular" hasTabularNumbers>
              {formatCurrency(b.totalPriceCents, currency)}
            </Text>
            <Text type="supporting" color="secondary" hasTabularNumbers>
              {formatPhoneDisplay(b.client.phoneE164)}
            </Text>
          </VStack>
        </HStack>
      </HStack>

      <Divider />

      <HStack gap={2} wrap="wrap" justify="between" align="center">
        <HStack gap={1.5} wrap="wrap">
          {isPastUnclosed ? (
            <>
              {canCollect ? (
                <Button
                  type="button"
                  label="Cobrar"
                  variant="primary"
                  size="sm"
                  icon={<DollarSign size={14} aria-hidden="true" />}
                  isDisabled={isBusy}
                  onClick={() => onOpenCheckout(b)}
                />
              ) : null}
              {canMarkCompleted ? (
                <Button
                  type="button"
                  label={busyStatus === 'completed' ? 'Guardando…' : 'Terminada'}
                  variant="secondary"
                  size="sm"
                  icon={<CheckCircle2 size={14} aria-hidden="true" />}
                  isLoading={busyStatus === 'completed'}
                  isDisabled={isBusy}
                  onClick={() => onUpdateStatus(b.id, 'completed')}
                />
              ) : null}
              {canMarkNoShow ? (
                <Button
                  type="button"
                  label={busyStatus === 'no_show' ? 'Marcando…' : 'No llegó'}
                  variant="ghost"
                  size="sm"
                  icon={<UserX size={14} aria-hidden="true" />}
                  isLoading={busyStatus === 'no_show'}
                  isDisabled={isBusy}
                  onClick={() => onUpdateStatus(b.id, 'no_show')}
                />
              ) : null}
              {isPending ? (
                <Button
                  type="button"
                  label={busyStatus === 'confirmed' ? 'Confirmando…' : 'Confirmar'}
                  variant="secondary"
                  size="sm"
                  icon={<Check size={14} aria-hidden="true" />}
                  isLoading={busyStatus === 'confirmed'}
                  isDisabled={isBusy}
                  onClick={() => onUpdateStatus(b.id, 'confirmed')}
                />
              ) : null}
            </>
          ) : (
            <>
              {isPending ? (
                <Button
                  type="button"
                  label={busyStatus === 'confirmed' ? 'Confirmando…' : 'Confirmar'}
                  variant="primary"
                  size="sm"
                  icon={<Check size={14} />}
                  isLoading={busyStatus === 'confirmed'}
                  isDisabled={isBusy}
                  onClick={() => onUpdateStatus(b.id, 'confirmed')}
                />
              ) : null}
              {canCollect ? (
                <Button
                  type="button"
                  label="Cobrar"
                  variant="primary"
                  size="sm"
                  icon={<DollarSign size={14} aria-hidden="true" />}
                  isDisabled={isBusy}
                  onClick={() => onOpenCheckout(b)}
                />
              ) : null}
            </>
          )}
          {canOpenWhatsAppInbox ? (
            <Button
              label="Abrir chat"
              variant="secondary"
              size="sm"
              icon={<MessageCircle size={14} aria-hidden="true" />}
              href={waInboxHref}
            />
          ) : (
            <Button
              label="WhatsApp"
              variant="secondary"
              size="sm"
              icon={<MessageCircle size={14} aria-hidden="true" />}
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
            />
          )}
          {onSelectBooking ? (
            <Button
              type="button"
              label="Ver opciones"
              variant="secondary"
              size="sm"
              isDisabled={isBusy}
              onClick={() => onSelectBooking(b)}
            />
          ) : null}
        </HStack>

        <HStack gap={1.5} wrap="wrap">
          {canReschedule && onRequestReschedule ? (
            <Button
              type="button"
              label={isRequestingReschedule ? 'Generando…' : 'Reagendar'}
              variant="ghost"
              size="sm"
              icon={<CalendarClock size={14} />}
              isLoading={isRequestingReschedule}
              isDisabled={isBusy || isRequestingReschedule}
              onClick={() => onRequestReschedule(b.id)}
            />
          ) : null}
          {canViewClients ? (
            <Button
              label="Ver clienta"
              variant="ghost"
              size="sm"
              icon={<UserRound size={14} />}
              href={`/admin/clientas?q=${encodeURIComponent(b.client.phoneE164)}`}
            />
          ) : null}
        </HStack>
      </HStack>
    </VStack>
  );
});
