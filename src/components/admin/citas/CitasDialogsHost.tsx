'use client';

import dynamic from 'next/dynamic';
import { Drawer, DrawerHeader } from '@astryxdesign/core/Drawer';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import type { AdminOverviewPayload } from '@/components/admin/AdminProvider';
import { normalizeTouchUpDays } from '@/lib/booking/recurrence';
import { ADMIN_CACHE_KEYS, invalidateAdminCache } from '@/lib/hooks/useAdminCache';
import { roleCanAccess } from '@/lib/rbac';
import type { BookingStatus, BookingWithRelations, StaffMember } from '@/lib/types';
import type { NewBookingPrefill } from './NewBookingDialog';
import type { CitasFeedbackState } from './useCitasBookingActions';

const BlockTimeForm = dynamic(
  () =>
    import('@/components/admin/disponibilidad/BlockTimeForm').then(
      (mod) => mod.BlockTimeForm,
    ),
  { ssr: false },
);

const BookingQuickPopover = dynamic(
  () => import('./BookingQuickPopover').then((mod) => mod.BookingQuickPopover),
  { ssr: false },
);

const OwnerPinDialog = dynamic(
  () => import('@/components/admin/config/OwnerPinDialog').then((mod) => mod.OwnerPinDialog),
  { ssr: false },
);

const NewBookingDialog = dynamic(
  () => import('./NewBookingDialog').then((mod) => mod.NewBookingDialog),
  { ssr: false },
);

const CheckoutDrawerDialog = dynamic(
  () => import('./CheckoutDrawerDialog').then((mod) => mod.CheckoutDrawerDialog),
  { ssr: false },
);

const QuickSlotFinderDialog = dynamic(
  () => import('./QuickSlotFinderDialog').then((mod) => mod.QuickSlotFinderDialog),
  { ssr: false },
);

const WaitlistPanel = dynamic(
  () => import('./WaitlistPanel').then((mod) => mod.WaitlistPanel),
  { ssr: false },
);

interface CitasDialogsHostProps {
  data: AdminOverviewPayload;
  tz: string;
  todayKey: string;
  activeVisualDate: string;
  lockedStaffId: string | null;
  visibleStaff: StaffMember[];
  hasActiveOwnerPin: boolean;
  quickFinderOpen: boolean;
  onQuickFinderOpenChange: (open: boolean) => void;
  manualOpen: boolean;
  onManualOpenChange: (open: boolean) => void;
  manualInitStaffId: string;
  manualPrefill: NewBookingPrefill | null;
  manualSessionKey: number;
  popoverBooking: BookingWithRelations | null;
  onClosePopover: () => void;
  checkoutBooking: BookingWithRelations | null;
  checkoutSessionKey: number;
  onCloseCheckout: () => void;
  blockOpen: boolean;
  blockSessionKey: number;
  onBlockOpenChange: (open: boolean) => void;
  waitlistOpen: boolean;
  onWaitlistOpenChange: (open: boolean) => void;
  canViewWaitlist: boolean;
  canViewClients: boolean;
  busyAction: { bookingId: string; status: BookingStatus } | null;
  checkingInId: string | null;
  rejectingDepositId: string | null;
  remindingId: string | null;
  requestingRescheduleId: string | null;
  pendingCancelBooking: BookingWithRelations | null;
  pinSubmitting: boolean;
  pinError: string | null;
  onDismissCancelPin: () => void;
  onOpenManualModal: (staffId?: string, prefill?: NewBookingPrefill | null) => void;
  onOpenCheckout: (booking: BookingWithRelations) => void;
  onScheduleRetouch: (booking: BookingWithRelations) => void;
  onUpdateStatus: (bookingId: string, status: BookingStatus, pin?: string) => Promise<boolean>;
  onCheckIn: (bookingId: string) => Promise<boolean>;
  onRejectDeposit: (bookingId: string, bookingCode: string, reason?: string) => Promise<boolean>;
  onSendReminder: (bookingId: string) => void;
  onRequestReschedule: (bookingId: string) => void;
  onRefresh: () => Promise<void>;
  onShowNotice: (text: string) => void;
  onSetFeedback: (feedback: CitasFeedbackState | null) => void;
}

export function CitasDialogsHost({
  data,
  tz,
  todayKey,
  activeVisualDate,
  lockedStaffId,
  visibleStaff,
  hasActiveOwnerPin,
  quickFinderOpen,
  onQuickFinderOpenChange,
  manualOpen,
  onManualOpenChange,
  manualInitStaffId,
  manualPrefill,
  manualSessionKey,
  popoverBooking,
  onClosePopover,
  checkoutBooking,
  checkoutSessionKey,
  onCloseCheckout,
  blockOpen,
  blockSessionKey,
  onBlockOpenChange,
  waitlistOpen,
  onWaitlistOpenChange,
  canViewWaitlist,
  canViewClients,
  busyAction,
  checkingInId,
  rejectingDepositId,
  remindingId,
  requestingRescheduleId,
  pendingCancelBooking,
  pinSubmitting,
  pinError,
  onDismissCancelPin,
  onOpenManualModal,
  onOpenCheckout,
  onScheduleRetouch,
  onUpdateStatus,
  onCheckIn,
  onRejectDeposit,
  onSendReminder,
  onRequestReschedule,
  onRefresh,
  onShowNotice,
  onSetFeedback,
}: CitasDialogsHostProps) {
  const touchUpDays = normalizeTouchUpDays(data.settings.landingContent?.touchUpDays);
  const activeWaitingCount = data.waitlist.filter((w) => w.status === 'waiting').length;

  return (
    <>
      {quickFinderOpen ? (
        <QuickSlotFinderDialog
          isOpen={quickFinderOpen}
          onOpenChange={onQuickFinderOpenChange}
          services={data.services}
          staff={data.staff}
          currency={data.settings.currency}
          timezone={tz}
          todayKey={todayKey}
          lockedStaffId={lockedStaffId}
          onPickSlot={(selection) =>
            onOpenManualModal(selection.staffId, {
              serviceId: selection.serviceId,
              extraServiceIds: selection.extraServiceIds,
              staffId: selection.staffId,
              startDate: selection.dateKey,
              preferredStartAt: selection.startAt,
            })
          }
        />
      ) : null}

      {popoverBooking ? (
        <BookingQuickPopover
          booking={popoverBooking}
          allBookings={data.bookings}
          allServices={data.services}
          clients={data.clients}
          loyaltyProgram={data.loyaltyProgram}
          loyaltyStamps={data.loyaltyStamps}
          paymentSplits={data.paymentSplits}
          cashEntries={data.cashEntries}
          serverNowIso={data.serverNowIso}
          noShowThreshold={data.settings.noShowDepositThreshold ?? 2}
          touchUpDays={touchUpDays}
          salonName={data.settings.name}
          googleReviewUrl={data.settings.googleReviewUrl ?? null}
          currency={data.settings.currency}
          timezone={tz}
          canViewClients={canViewClients}
          canManageIntegrations={roleCanAccess(data.session.user.role, 'integrations')}
          busyStatus={
            busyAction?.bookingId === popoverBooking.id ? busyAction.status : null
          }
          isCheckingIn={checkingInId === popoverBooking.id}
          isRejectingDeposit={rejectingDepositId === popoverBooking.id}
          isReminding={remindingId === popoverBooking.id}
          isRequestingReschedule={requestingRescheduleId === popoverBooking.id}
          onClose={onClosePopover}
          onUpdateStatus={(id, status) => onUpdateStatus(id, status)}
          onCheckIn={onCheckIn}
          onRejectDeposit={onRejectDeposit}
          onOpenCheckout={onOpenCheckout}
          onScheduleRetouch={(booking) => {
            onClosePopover();
            onScheduleRetouch(booking);
          }}
          onSendReminder={onSendReminder}
          onRequestReschedule={onRequestReschedule}
        />
      ) : null}

      {manualOpen ? (
        <NewBookingDialog
          key={`${manualInitStaffId}-${manualSessionKey}`}
          isOpen={manualOpen}
          onOpenChange={onManualOpenChange}
          services={data.services}
          addons={data.addons}
          staff={data.staff}
          clients={data.clients}
          todayKey={todayKey}
          currency={data.settings.currency}
          timezone={tz}
          initialStaffId={manualInitStaffId}
          lockedStaffId={lockedStaffId}
          prefill={manualPrefill}
          requireOwnerPinForPriceOverride={hasActiveOwnerPin}
          onCreated={async (message, description) => {
            invalidateAdminCache('/api/admin/reports');
            await onRefresh();
            if (description) {
              onSetFeedback({ status: 'success', title: message, description });
            } else {
              onShowNotice(message);
            }
          }}
        />
      ) : null}

      {checkoutBooking ? (
        <CheckoutDrawerDialog
          key={`${checkoutBooking.id}-${checkoutSessionKey}`}
          booking={checkoutBooking}
          existingSplits={data.paymentSplits.filter((s) => s.bookingId === checkoutBooking.id)}
          existingCashEntries={data.cashEntries.filter((e) => e.bookingId === checkoutBooking.id)}
          inventory={data.inventory}
          staff={data.staff}
          loyaltyProgram={data.loyaltyProgram}
          loyaltyStamps={data.loyaltyStamps}
          currency={data.settings.currency}
          touchUpDays={touchUpDays}
          onClose={onCloseCheckout}
          onCompleted={async () => {
            invalidateAdminCache('/api/admin/reports');
            invalidateAdminCache(ADMIN_CACHE_KEYS.packages);
            await onRefresh();
          }}
          onScheduleRetouch={onScheduleRetouch}
        />
      ) : null}

      {blockOpen ? (
        <BlockTimeForm
          key={`block-${blockSessionKey}`}
          isOpen={blockOpen}
          onOpenChange={onBlockOpenChange}
          visibleStaff={visibleStaff}
          allStaff={data.staff}
          lockedStaffId={lockedStaffId}
          todayKey={todayKey}
          prefill={{
            mode: 'closed',
            staffId: lockedStaffId ?? visibleStaff[0]?.id ?? '',
            dateKey: activeVisualDate || todayKey,
          }}
          onSaved={async (notice) => {
            await onRefresh();
            onShowNotice(notice);
          }}
        />
      ) : null}

      {canViewWaitlist ? (
        <Drawer
          isOpen={waitlistOpen}
          onOpenChange={onWaitlistOpenChange}
          side="end"
          width={460}
          label="Lista de espera"
        >
          <Layout
            header={
              <DrawerHeader
                title="Lista de espera"
                subtitle={
                  activeWaitingCount > 0
                    ? `${activeWaitingCount} ${activeWaitingCount === 1 ? 'clienta esperando espacio' : 'clientas esperando espacio'}`
                    : 'Sin solicitudes activas por ahora'
                }
                onOpenChange={onWaitlistOpenChange}
                hasDivider
              />
            }
            content={
              <LayoutContent>
                {waitlistOpen ? (
                  <WaitlistPanel
                    embedded
                    waitlist={data.waitlist}
                    services={data.services}
                    salonName={data.settings.name}
                    onStatusUpdated={async (message) => {
                      await onRefresh();
                      onShowNotice(message);
                    }}
                    onBookEntry={(entry) => {
                      onWaitlistOpenChange(false);
                      onOpenManualModal('any', {
                        serviceId: entry.serviceId,
                        startDate: entry.desiredDate,
                        clientName: entry.clientName,
                        clientPhone: entry.clientPhoneE164,
                        internalNotes: entry.notes || 'Agendada desde lista de espera',
                      });
                    }}
                  />
                ) : null}
              </LayoutContent>
            }
          />
        </Drawer>
      ) : null}

      {pendingCancelBooking ? (
        <OwnerPinDialog
          isOpen
          onOpenChange={(open) => {
            if (!open) onDismissCancelPin();
          }}
          title="Autorizar cancelación"
          description={`Cancelar la cita ${pendingCancelBooking.bookingCode} de ${pendingCancelBooking.client.fullName} requiere el PIN de autorización de Dueña.`}
          actionLabel="Confirmar cancelación"
          isSubmitting={pinSubmitting}
          error={pinError}
          onConfirm={async (pin) => {
            await onUpdateStatus(pendingCancelBooking.id, 'canceled', pin);
          }}
        />
      ) : null}
    </>
  );
}
