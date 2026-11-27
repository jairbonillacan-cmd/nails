'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu';
import {
  Ban,
  Check,
  Copy,
  HelpCircle,
  MessageCircle,
  Plus,
  Sparkles,
} from 'lucide-react';
import { PageSkeleton, SkeletonBlock } from '@/components/ui/SkeletonBlock';
import type { BlockTimePrefill } from '@/components/admin/disponibilidad/BlockTimeForm';
import {
  AgendaStatusChips,
  AgendaToolbar,
} from '@/components/admin/citas/BookingsFiltersBar';
import { BookingsListView } from '@/components/admin/citas/BookingsListView';
import { CitasDialogsHost } from '@/components/admin/citas/CitasDialogsHost';
import {
  resolveSuggestedBlockWindow,
  shiftDateKey,
} from '@/components/admin/citas/scheduleGridGeometry';
import { useCitasBookingActions } from '@/components/admin/citas/useCitasBookingActions';
import { useCitasWorkspace } from '@/components/admin/citas/useCitasWorkspace';
import type { CalendarEmptySlotSelection } from '@/components/admin/citas/VisualScheduleGrid';
import { horariosHref } from '@/lib/admin-links';
import { buildRetouchPrefill } from '@/lib/booking/recurrence';
import { getDateKeyInTimezone } from '@/lib/format';
import { roleCanAccess } from '@/lib/rbac';

const CalendarSlotActionDialog = dynamic(
  () =>
    import('@/components/admin/citas/CalendarSlotActionDialog').then(
      (mod) => mod.CalendarSlotActionDialog,
    ),
  { ssr: false },
);

const BlockTimeForm = dynamic(
  () =>
    import('@/components/admin/disponibilidad/BlockTimeForm').then(
      (mod) => mod.BlockTimeForm,
    ),
  { ssr: false },
);

function ScheduleGridFallback() {
  return (
    <VStack gap={3} role="status" aria-live="polite" aria-label="Cargando agenda visual">
      <SkeletonBlock width="100%" height="3.5rem" radius={3} index={0} />
      <SkeletonBlock width="100%" height="14rem" radius={3} index={1} />
    </VStack>
  );
}

const VisualScheduleGrid = dynamic(
  () =>
    import('@/components/admin/citas/VisualScheduleGrid').then(
      (mod) => mod.VisualScheduleGrid,
    ),
  { ssr: false, loading: ScheduleGridFallback },
);

export default function AdminBookingsPage() {
  const ws = useCitasWorkspace();
  const [slotChoice, setSlotChoice] = useState<CalendarEmptySlotSelection | null>(null);
  const [blockTimePrefill, setBlockTimePrefill] = useState<BlockTimePrefill | null>(null);
  const [blockTimeSessionKey, setBlockTimeSessionKey] = useState(0);
  const hasActiveOwnerPin = Boolean(
    ws.data?.settings.ownerPinEnabled && ws.data?.settings.hasOwnerPin,
  );
  const actions = useCitasBookingActions({
    data: ws.data,
    bookings: ws.bookings,
    hasActiveOwnerPin,
    refresh: ws.refresh,
  });

  if (!ws.data) {
    return <PageSkeleton kpiCount={0} withSplit={false} ariaLabel="Cargando agenda" />;
  }

  const data = ws.data;
  const canViewClients = roleCanAccess(data.session.user.role, 'clients');
  const canViewAvailability = roleCanAccess(data.session.user.role, 'availability');
  const canViewWaitlist = !ws.isSpecialistOnly;
  const visibleStaff = ws.lockedStaffId
    ? ws.orderedStaff.filter((s) => s.id === ws.lockedStaffId)
    : ws.orderedStaff;
  const scheduleStaff =
    ws.selectedStaffFilter === 'all' || ws.lockedStaffId
      ? visibleStaff
      : visibleStaff.filter((s) => s.id === ws.selectedStaffFilter);

  const popoverBooking = ws.popoverBookingId
    ? ws.bookings.find((b) => b.id === ws.popoverBookingId) ?? null
    : null;
  const checkoutBooking = ws.checkoutBookingId
    ? ws.bookings.find((b) => b.id === ws.checkoutBookingId) ?? null
    : null;
  const pendingCancelBooking = actions.pendingCancelBookingId
    ? ws.bookings.find((b) => b.id === actions.pendingCancelBookingId) ?? null
    : null;

  const noShowThreshold = data.settings.noShowDepositThreshold ?? 2;

  const isScheduleView = ws.resolvedView === 'day' || ws.resolvedView === 'week';
  const scheduleVisibleCount = isScheduleView
    ? ws.statusFilteredBookings.filter((b) => {
        const bDate = getDateKeyInTimezone(new Date(b.startAt), ws.tz);
        if (ws.resolvedView === 'day') return bDate === ws.dateKey;
        const weekEnd = shiftDateKey(ws.dateKey, 6);
        return bDate >= ws.dateKey && bDate <= weekEnd;
      }).length
    : 0;
  const firstFilteredBooking = ws.statusFilteredBookings[0];
  const firstFilteredBookingDate = firstFilteredBooking
    ? getDateKeyInTimezone(new Date(firstFilteredBooking.startAt), ws.tz)
    : null;
  const hasOffRangeFilteredMatches =
    isScheduleView &&
    (ws.status !== 'upcoming' || Boolean(ws.search.trim())) &&
    ws.statusFilteredBookings.length > 0 &&
    scheduleVisibleCount === 0;

  const renderListView = () => (
    <BookingsListView
      bookings={ws.listBookings}
      status={ws.status}
      dateKey={ws.dateKey}
      search={ws.search}
      allServices={data.services}
      paymentSplits={ws.paymentSplits}
      cashEntries={ws.cashEntries}
      serverNowIso={data.serverNowIso}
      salonName={data.settings.name}
      currency={data.settings.currency}
      timezone={ws.tz}
      noShowThreshold={noShowThreshold}
      canViewClients={canViewClients}
      busyBookingId={actions.busyAction?.bookingId ?? null}
      busyStatus={actions.busyAction?.status ?? null}
      requestingRescheduleId={actions.requestingRescheduleId}
      onSelectWeekView={() => ws.setView('week')}
      onResetFilters={() => {
        ws.setSearch('');
        ws.updateFilters({ status: 'upcoming', q: '' });
      }}
      onOpenNewBooking={() => ws.openManualModal()}
      onSelectBooking={(bk) => ws.setPopoverBookingId(bk.id)}
      onUpdateStatus={(id, status) => void actions.updateStatus(id, status)}
      onOpenCheckout={ws.openCheckoutDrawer}
      onRequestReschedule={(id) => void actions.requestReschedule(id)}
    />
  );

  const feedback = actions.feedback;
  const freedMatch = feedback?.freedSlotMatch ?? null;

  return (
    <VStack gap={2} className="ad-page ad-agenda-page">
      <HStack className="ad-agenda-header" justify="between" align="center" gap={2}>
        <HStack gap={2} align="center" wrap="wrap">
          <Heading level={1} className="lk-serif">
            Agenda
          </Heading>
          {actions.busyAction || actions.reschedulingId || actions.checkingInId ? (
            <Text className="fx-save-pill" data-state="saving" role="status" aria-live="polite">
              Actualizando…
            </Text>
          ) : actions.inlineNotice.message ? (
            <Text className="fx-save-pill" data-state="saved" role="status" aria-live="polite">
              <Check size={12} aria-hidden="true" />
              {actions.inlineNotice.message}
            </Text>
          ) : null}
        </HStack>

        <HStack gap={1.5} align="center">
          <Button
            type="button"
            label="Nueva cita"
            variant="primary"
            size="sm"
            icon={<Plus size={14} aria-hidden="true" />}
            onClick={() => ws.openManualModal()}
          />
          <DropdownMenu
            alignment="end"
            placement="below"
            presentation="adaptive"
            menuWidth="16.5rem"
            hasChevron
            button={{
              label: 'Más',
              variant: 'secondary',
              size: 'sm',
            }}
            items={[
              {
                id: 'quick-finder',
                label: 'Buscar hora libre',
                description: 'Encuentra el próximo espacio disponible',
                icon: <Sparkles size={15} aria-hidden="true" />,
                onClick: () => ws.setQuickFinderOpen(true),
              },
              {
                id: 'block-time',
                label: 'Bloquear horario o día',
                description: 'Cierre puntual, descanso o vacaciones',
                icon: <Ban size={15} aria-hidden="true" />,
                onClick: ws.openBlockModal,
              },
              ...(canViewAvailability
                ? [
                    {
                      id: 'troubleshoot',
                      label: '¿Por qué no sale una hora?',
                      description: 'Diagnosticar bloqueos y horarios',
                      icon: <HelpCircle size={15} aria-hidden="true" />,
                      href: horariosHref({
                        tab: 'diagnostico',
                        staff:
                          ws.selectedStaffFilter !== 'all'
                            ? ws.selectedStaffFilter
                            : undefined,
                        date: ws.dateKey,
                      }),
                    },
                  ]
                : []),
            ]}
          />
        </HStack>
      </HStack>

      <AgendaToolbar
        resolvedView={ws.resolvedView}
        dateKey={ws.dateKey}
        todayKey={ws.todayKey}
        timezone={ws.tz}
        selectedStaffFilter={ws.selectedStaffFilter}
        search={ws.search}
        isSpecialistOnly={ws.isSpecialistOnly}
        visibleStaff={visibleStaff}
        allStaffColorIndex={ws.allStaffColorIndex}
        onChangeView={ws.setView}
        onChangeDate={ws.setDate}
        onChangeStaffFilter={ws.setStaff}
        onChangeSearch={ws.setSearch}
      />

      <AgendaStatusChips
        status={ws.status}
        pendingCount={ws.chipCounts.pendingCount}
        uncollectedCount={ws.chipCounts.uncollectedCount}
        uncollectedTotalCents={ws.chipCounts.uncollectedTotalCents}
        currency={data.settings.currency}
        todayWaitingCount={ws.chipCounts.todayWaitingCount}
        totalWaitingCount={ws.chipCounts.totalWaitingCount}
        waitlistOpen={ws.waitlistOpen}
        canViewWaitlist={canViewWaitlist}
        onChangeStatus={ws.setStatus}
        onToggleWaitlist={() => ws.setWaitlistOpen(!ws.waitlistOpen)}
      />

      {feedback ? (
        <Banner
          status={feedback.status}
          role={feedback.status === 'error' ? 'alert' : 'status'}
          title={feedback.title}
          description={feedback.description}
          endContent={
            freedMatch || feedback.waMeUrl || feedback.rescheduleUrl ? (
              <HStack gap={1.5} wrap="wrap">
                {freedMatch ? (
                  <>
                    <Button
                      label="Avisar a la lista de espera"
                      variant="primary"
                      size="sm"
                      icon={<MessageCircle size={14} aria-hidden="true" />}
                      href={freedMatch.waMeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() =>
                        void actions.notifyWaitlistCandidate(freedMatch.candidate.id)
                      }
                    />
                    {canViewWaitlist ? (
                      <Button
                        type="button"
                        label="Ver lista"
                        variant="secondary"
                        size="sm"
                        onClick={() => ws.setWaitlistOpen(true)}
                      />
                    ) : null}
                  </>
                ) : null}
                {feedback.waMeUrl ? (
                  <Button
                    label="Abrir WhatsApp"
                    variant="primary"
                    size="sm"
                    icon={<MessageCircle size={14} aria-hidden="true" />}
                    href={feedback.waMeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                ) : null}
                {feedback.rescheduleUrl ? (
                  <Button
                    type="button"
                    label={actions.rescheduleCopy.feedback ?? 'Copiar enlace'}
                    variant="secondary"
                    size="sm"
                    icon={<Copy size={14} aria-hidden="true" />}
                    onClick={() =>
                      feedback.rescheduleUrl &&
                      void actions.rescheduleCopy.copy(
                        feedback.rescheduleUrl,
                        'Enlace copiado',
                        'Copia el enlace manualmente',
                      )
                    }
                  />
                ) : null}
              </HStack>
            ) : undefined
          }
          isDismissable
          onDismiss={() => actions.setFeedback(null)}
        />
      ) : null}

      {hasOffRangeFilteredMatches ? (
        <Banner
          status="info"
          role="status"
          title={`Hay ${ws.statusFilteredBookings.length} ${
            ws.statusFilteredBookings.length === 1 ? 'cita' : 'citas'
          } en otras fechas con este filtro`}
          endContent={
            <HStack gap={1.5} wrap="wrap">
              {firstFilteredBookingDate ? (
                <Button
                  type="button"
                  label="Ir a la primera"
                  variant="secondary"
                  size="sm"
                  onClick={() => ws.setDate(firstFilteredBookingDate)}
                />
              ) : null}
              <Button
                type="button"
                label="Ver en Lista"
                variant="ghost"
                size="sm"
                onClick={() => ws.setView('list')}
              />
            </HStack>
          }
        />
      ) : null}

      {ws.resolvedView === null ? (
        <>
          <VStack className="ad-agenda-default-mobile" gap={0}>
            {renderListView()}
          </VStack>
          <VStack className="ad-agenda-default-desktop" gap={0}>
            <ScheduleGridFallback />
          </VStack>
        </>
      ) : ws.resolvedView === 'list' ? (
        renderListView()
      ) : (
        <VisualScheduleGrid
          rangeMode={ws.resolvedView}
          hideInternalToolbar
          dateKey={ws.dateKey}
          todayKey={ws.todayKey}
          serverNowIso={data.serverNowIso}
          timezone={ws.tz}
          staff={scheduleStaff}
          allStaffColorIndex={ws.allStaffColorIndex}
          schedules={data.schedules}
          dateOverrides={data.dateOverrides}
          recurringBlocks={data.recurringBlocks}
          paymentSplits={ws.paymentSplits}
          cashEntries={ws.cashEntries}
          bookings={ws.statusFilteredBookings}
          allServices={data.services}
          isSpecialistLocked={Boolean(ws.lockedStaffId)}
          busyBookingId={actions.busyAction?.bookingId ?? null}
          busyStatus={actions.busyAction?.status ?? null}
          reschedulingBookingId={actions.reschedulingId}
          onChangeDate={ws.setDate}
          onJumpToDay={(nextDateKey) => {
            ws.updateFilters({ view: 'day', dateKey: nextDateKey });
          }}
          onOpenNewForStaff={(staffId, preferredDate, preferredStartAt) =>
            ws.openManualModal(
              staffId,
              preferredDate || preferredStartAt
                ? {
                    ...(preferredDate ? { startDate: preferredDate } : {}),
                    ...(preferredStartAt ? { preferredStartAt } : {}),
                  }
                : null,
            )
          }
          onSelectEmptySlot={(slot) => setSlotChoice(slot)}
          onSelectBooking={(b) => ws.setPopoverBookingId(b.id)}
          onUpdateStatus={(id, status) => void actions.updateStatus(id, status)}
          onRescheduleBooking={actions.rescheduleAdmin}
          onOpenCheckout={ws.openCheckoutDrawer}
        />
      )}

      <CitasDialogsHost
        scope={{
          data,
          allBookings: ws.bookings,
          paymentSplits: ws.paymentSplits,
          cashEntries: ws.cashEntries,
          tz: ws.tz,
          todayKey: ws.todayKey,
          activeVisualDate: ws.dateKey,
          lockedStaffId: ws.lockedStaffId,
          visibleStaff,
          hasActiveOwnerPin,
          canViewWaitlist,
          canViewClients,
        }}
        state={{
          quickFinderOpen: ws.quickFinderOpen,
          manualOpen: ws.manualOpen,
          manualInitStaffId: ws.manualInitStaffId,
          manualPrefill: ws.manualPrefill,
          manualSessionKey: ws.manualSessionKey,
          popoverBooking,
          checkoutBooking,
          checkoutSessionKey: ws.checkoutSessionKey,
          blockOpen: ws.blockOpen,
          blockSessionKey: ws.blockSessionKey,
          waitlistOpen: ws.waitlistOpen,
          pendingCancelBooking,
          busyAction: actions.busyAction,
          checkingInId: actions.checkingInId,
          rejectingDepositId: actions.rejectingDepositId,
          remindingId: actions.remindingId,
          requestingRescheduleId: actions.requestingRescheduleId,
          pinSubmitting: actions.pinSubmitting,
          pinError: actions.pinError,
        }}
        handlers={{
          onQuickFinderOpenChange: ws.setQuickFinderOpen,
          onManualOpenChange: ws.setManualOpen,
          onClosePopover: () => ws.setPopoverBookingId(null),
          onCloseCheckout: () => ws.setCheckoutBookingId(null),
          onBlockOpenChange: ws.setBlockOpen,
          onWaitlistOpenChange: ws.setWaitlistOpen,
          onDismissCancelPin: () => {
            actions.setPendingCancelBookingId(null);
            actions.setPinError(null);
          },
          onOpenManualModal: ws.openManualModal,
          onOpenCheckout: ws.openCheckoutDrawer,
          onScheduleRetouch: (booking) => {
            const prefill = buildRetouchPrefill(booking, data.settings, ws.tz);
            ws.setCheckoutBookingId(null);
            ws.openManualModal(prefill.staffId, {
              serviceId: prefill.serviceId,
              extraServiceIds: prefill.extraServiceIds,
              staffId: prefill.staffId,
              startDate: prefill.startDate,
              clientName: prefill.clientName,
              clientPhone: prefill.clientPhone,
              clientInstagram: prefill.clientInstagram,
              internalNotes: prefill.internalNotes,
            });
          },
          onUpdateStatus: actions.updateStatus,
          onCheckIn: actions.checkInBooking,
          onRejectDeposit: actions.rejectDeposit,
          onSendReminder: (id) => void actions.sendReminder(id),
          onRequestReschedule: (id) => void actions.requestReschedule(id),
          onRefresh: ws.refresh,
          onShowNotice: actions.inlineNotice.show,
          onSetFeedback: actions.setFeedback,
        }}
      />

      {slotChoice ? (
        <CalendarSlotActionDialog
          slot={slotChoice}
          timezone={ws.tz}
          onClose={() => setSlotChoice(null)}
          onChooseManualBooking={(slot) => {
            setSlotChoice(null);
            ws.openManualModal(slot.staffId, {
              startDate: slot.dateKey,
              preferredStartAt: slot.startAtIso,
            });
          }}
          onChooseBlockTime={(slot) => {
            setSlotChoice(null);
            const targetStaffId =
              ws.lockedStaffId ??
              (slot.staffId !== 'any'
                ? slot.staffId
                : ws.selectedStaffFilter !== 'all'
                  ? ws.selectedStaffFilter
                  : (visibleStaff[0]?.id ?? ''));
            const suggestedWindow = resolveSuggestedBlockWindow({
              slot,
              schedules: data.schedules,
              dateOverrides: data.dateOverrides,
              staffId: targetStaffId,
            });
            setBlockTimePrefill({
              mode: 'partial',
              dateKey: slot.dateKey,
              startTimeHHMM: suggestedWindow.startTimeHHMM,
              endTimeHHMM: suggestedWindow.endTimeHHMM,
              staffId: targetStaffId,
            });
            setBlockTimeSessionKey((prev) => prev + 1);
          }}
        />
      ) : null}

      {blockTimePrefill ? (
        <BlockTimeForm
          key={`block-time-${blockTimeSessionKey}`}
          isOpen
          onOpenChange={(open) => {
            if (!open) setBlockTimePrefill(null);
          }}
          prefill={blockTimePrefill}
          visibleStaff={visibleStaff}
          allStaff={data.staff}
          lockedStaffId={ws.lockedStaffId}
          todayKey={ws.todayKey}
          onSaved={async (notice) => {
            await ws.refresh();
            actions.inlineNotice.show(notice);
          }}
        />
      ) : null}
    </VStack>
  );
}
