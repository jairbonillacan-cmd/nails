'use client';

import dynamic from 'next/dynamic';
import { Drawer, DrawerHeader } from '@astryxdesign/core/Drawer';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import type { AdminOverviewPayload } from '@/components/admin/AdminProvider';
import { normalizeTouchUpDays } from '@/lib/booking/recurrence';
import { invalidateAdminDomain } from '@/lib/hooks/useAdminCache';
import { roleCanAccess } from '@/lib/rbac';
import type {
  BookingStatus,
  BookingWithRelations,
  CashRegisterEntry,
  PaymentSplit,
  StaffMember,
} from '@/lib/types';
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

interface CitasDialogScope {
  data: AdminOverviewPayload;
  allBookings: readonly BookingWithRelations[];
  paymentSplits: PaymentSplit[];
  cashEntries: CashRegisterEntry[];
  tz: string;
  todayKey: string;
  activeVisualDate: string;
  lockedStaffId: string | null;
  visibleStaff: StaffMember[];
  hasActiveOwnerPin: boolean;
  canViewWaitlist: boolean;
  canViewClients: boolean;
}

interface CitasDialogState {
  quickFinderOpen: boolean;
  manualOpen: boolean;
  manualInitStaffId: string;
  manualPrefill: NewBookingPrefill | null;
  manualSessionKey: number;
  popoverBooking: BookingWithRelations | null;
  checkoutBooking: BookingWithRelations | null;
  checkoutSessionKey: number;
  blockOpen: boolean;
  blockSessionKey: number;
  waitlistOpen: boolean;
  pendingCancelBooking: BookingWithRelations | null;
  busyAction: { bookingId: string; status: BookingStatus } | null;
  checkingInId: string | null;
  rejectingDepositId: string | null;
  remindingId: string | null;
  requestingRescheduleId: string | null;
  pinSubmitting: boolean;
  pinError: string | null;
}

interface CitasDialogHandlers {
  onQuickFinderOpenChange: (open: boolean) => void;
  onManualOpenChange: (open: boolean) => void;
  onClosePopover: () => void;
  onCloseCheckout: () => void;
  onBlockOpenChange: (open: boolean) => void;
  onWaitlistOpenChange: (open: boolean) => void;
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

interface CitasDialogsHostProps {
  scope: CitasDialogScope;
  state: CitasDialogState;
  handlers: CitasDialogHandlers;
}

export function CitasDialogsHost({
  scope,
  state,
  handlers,
}: CitasDialogsHostProps) {
  const {
    data,
    allBookings,
    paymentSplits,
    cashEntries,
    tz,
    todayKey,
    activeVisualDate,
    lockedStaffId,
    visibleStaff,
    hasActiveOwnerPin,
    canViewWaitlist,
    canViewClients,
  } = scope;
  const touchUpDays = normalizeTouchUpDays(data.settings.landingContent?.touchUpDays);
  const activeWaitingCount = data.waitlist.filter((w) => w.status === 'waiting').length;

  return (
    <>
      {state.quickFinderOpen ? (
        <QuickSlotFinderDialog
          isOpen={state.quickFinderOpen}
          onOpenChange={handlers.onQuickFinderOpenChange}
          services={data.services}
          staff={data.staff}
          currency={data.settings.currency}
          timezone={tz}
          todayKey={todayKey}
          lockedStaffId={lockedStaffId}
          onPickSlot={(selection) =>
            handlers.onOpenManualModal(selection.staffId, {
              serviceId: selection.serviceId,
              extraServiceIds: selection.extraServiceIds,
              staffId: selection.staffId,
              startDate: selection.dateKey,
              preferredStartAt: selection.startAt,
            })
          }
        />
      ) : null}

      {state.popoverBooking ? (
        <BookingQuickPopover
          booking={state.popoverBooking}
          allBookings={allBookings}
          allServices={data.services}
          clients={data.clients}
          loyaltyProgram={data.loyaltyProgram}
          loyaltyStamps={data.loyaltyStamps}
          paymentSplits={paymentSplits}
          cashEntries={cashEntries}
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
            state.busyAction?.bookingId === state.popoverBooking.id
              ? state.busyAction.status
              : null
          }
          isCheckingIn={state.checkingInId === state.popoverBooking.id}
          isRejectingDeposit={state.rejectingDepositId === state.popoverBooking.id}
          isReminding={state.remindingId === state.popoverBooking.id}
          isRequestingReschedule={state.requestingRescheduleId === state.popoverBooking.id}
          onClose={handlers.onClosePopover}
          onUpdateStatus={(id, status) => handlers.onUpdateStatus(id, status)}
          onCheckIn={handlers.onCheckIn}
          onRejectDeposit={handlers.onRejectDeposit}
          onOpenCheckout={handlers.onOpenCheckout}
          onScheduleRetouch={(booking) => {
            handlers.onClosePopover();
            handlers.onScheduleRetouch(booking);
          }}
          onSendReminder={handlers.onSendReminder}
          onRequestReschedule={handlers.onRequestReschedule}
        />
      ) : null}

      {state.manualOpen ? (
        <NewBookingDialog
          key={`${state.manualInitStaffId}-${state.manualSessionKey}`}
          isOpen={state.manualOpen}
          onOpenChange={handlers.onManualOpenChange}
          services={data.services}
          addons={data.addons}
          staff={data.staff}
          clients={data.clients}
          todayKey={todayKey}
          currency={data.settings.currency}
          timezone={tz}
          initialStaffId={state.manualInitStaffId}
          lockedStaffId={lockedStaffId}
          prefill={state.manualPrefill}
          requireOwnerPinForPriceOverride={hasActiveOwnerPin}
          onCreated={async (message, description) => {
            invalidateAdminDomain('bookings');
            await handlers.onRefresh();
            if (description) {
              handlers.onSetFeedback({ status: 'success', title: message, description });
            } else {
              handlers.onShowNotice(message);
            }
          }}
        />
      ) : null}

      {state.checkoutBooking ? (
        <CheckoutDrawerDialog
          key={`${state.checkoutBooking.id}-${state.checkoutSessionKey}`}
          booking={state.checkoutBooking}
          existingSplits={paymentSplits.filter((s) => s.bookingId === state.checkoutBooking?.id)}
          existingCashEntries={cashEntries.filter((e) => e.bookingId === state.checkoutBooking?.id)}
          inventory={data.inventory}
          staff={data.staff}
          loyaltyProgram={data.loyaltyProgram}
          loyaltyStamps={data.loyaltyStamps}
          currency={data.settings.currency}
          touchUpDays={touchUpDays}
          onClose={handlers.onCloseCheckout}
          onCompleted={async () => {
            invalidateAdminDomain('bookings', 'cash');
            await handlers.onRefresh();
          }}
          onScheduleRetouch={handlers.onScheduleRetouch}
        />
      ) : null}

      {state.blockOpen ? (
        <BlockTimeForm
          key={`block-${state.blockSessionKey}`}
          isOpen={state.blockOpen}
          onOpenChange={handlers.onBlockOpenChange}
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
            await handlers.onRefresh();
            handlers.onShowNotice(notice);
          }}
        />
      ) : null}

      {canViewWaitlist ? (
        <Drawer
          isOpen={state.waitlistOpen}
          onOpenChange={handlers.onWaitlistOpenChange}
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
                onOpenChange={handlers.onWaitlistOpenChange}
                hasDivider
              />
            }
            content={
              <LayoutContent>
                {state.waitlistOpen ? (
                  <WaitlistPanel
                    embedded
                    waitlist={data.waitlist}
                    services={data.services}
                    salonName={data.settings.name}
                    onStatusUpdated={async (message) => {
                      await handlers.onRefresh();
                      handlers.onShowNotice(message);
                    }}
                    onBookEntry={(entry) => {
                      handlers.onWaitlistOpenChange(false);
                      handlers.onOpenManualModal('any', {
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

      {state.pendingCancelBooking ? (
        <OwnerPinDialog
          isOpen
          onOpenChange={(open) => {
            if (!open) handlers.onDismissCancelPin();
          }}
          title="Autorizar cancelación"
          description={`Cancelar la cita ${state.pendingCancelBooking.bookingCode} de ${state.pendingCancelBooking.client.fullName} requiere el PIN de autorización de Dueña.`}
          actionLabel="Confirmar cancelación"
          isSubmitting={state.pinSubmitting}
          error={state.pinError}
          onConfirm={async (pin) => {
            if (!state.pendingCancelBooking) return;
            await handlers.onUpdateStatus(state.pendingCancelBooking.id, 'canceled', pin);
          }}
        />
      ) : null}
    </>
  );
}
