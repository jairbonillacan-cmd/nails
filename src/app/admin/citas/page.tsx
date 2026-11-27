'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import NextLink from 'next/link';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Ban, Check, Copy, MessageCircle, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageSkeleton, SkeletonBlock } from '@/components/ui/SkeletonBlock';
import type { BlockTimePrefill } from '@/components/admin/disponibilidad/BlockTimeForm';
import {
  AgendaRangeControls,
  AgendaStaffControls,
  BookingsFiltersBar,
} from '@/components/admin/citas/BookingsFiltersBar';
import { BookingsListView } from '@/components/admin/citas/BookingsListView';
import { CitasDialogsHost } from '@/components/admin/citas/CitasDialogsHost';
import { resolveSuggestedBlockWindow } from '@/components/admin/citas/scheduleGridGeometry';
import { useCitasBookingActions } from '@/components/admin/citas/useCitasBookingActions';
import { useCitasWorkspace } from '@/components/admin/citas/useCitasWorkspace';
import type { CalendarEmptySlotSelection } from '@/components/admin/citas/VisualScheduleGrid';
import { WaitlistPanel } from '@/components/admin/citas/WaitlistPanel';
import { cajaHref } from '@/lib/admin-links';
import { buildRetouchPrefill } from '@/lib/booking/recurrence';
import { formatCurrency } from '@/lib/format';
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
    hasActiveOwnerPin,
    refresh: ws.refresh,
  });

  if (!ws.data) {
    return <PageSkeleton kpiCount={3} withSplit={false} ariaLabel="Cargando citas y agenda" />;
  }

  const data = ws.data;
  const canViewClients = roleCanAccess(data.session.user.role, 'clients');
  const visibleStaff = ws.lockedStaffId
    ? ws.orderedStaff.filter((s) => s.id === ws.lockedStaffId)
    : ws.orderedStaff;
  const scheduleStaff =
    ws.selectedStaffFilter === 'all' || ws.lockedStaffId
      ? visibleStaff
      : visibleStaff.filter((s) => s.id === ws.selectedStaffFilter);
  const activeVisualDate =
    ws.selectedVisualDate ?? (ws.agendaRange === 'tomorrow' ? ws.tomorrowKey : ws.todayKey);

  const popoverBooking = ws.popoverBookingId
    ? data.bookings.find((b) => b.id === ws.popoverBookingId) ?? null
    : null;
  const checkoutBooking = ws.checkoutBookingId
    ? data.bookings.find((b) => b.id === ws.checkoutBookingId) ?? null
    : null;
  const pendingCancelBooking = actions.pendingCancelBookingId
    ? data.bookings.find((b) => b.id === actions.pendingCancelBookingId) ?? null
    : null;

  const noShowThreshold = data.settings.noShowDepositThreshold ?? 2;
  const flaggedBookings = ws.tabFilteredBookings.filter(
    (b) =>
      (b.client.noShowCount >= noShowThreshold || Boolean(b.noShowPolicyEnforced)) &&
      b.status !== 'canceled',
  );
  const isDateRangeActive =
    ws.tab === 'upcoming' &&
    !ws.search.trim() &&
    (ws.viewMode === 'schedule' || ws.viewMode === 'list');

  const uncollectedTotalCents = data.uncollectedBookings.reduce(
    (sum, item) => sum + item.remainingCents,
    0,
  );
  const isScheduleView = ws.tab !== 'waitlist' && ws.viewMode === 'schedule';

  return (
    <VStack gap={3} className="ad-page">
      <VStack gap={2} style={{ minWidth: 0, width: '100%' }}>
        <PageHeader
          title="Agenda"
          meta={
            actions.busyAction || actions.reschedulingId ? (
              <Text className="fx-save-pill" data-state="saving" role="status" aria-live="polite">
                Actualizando…
              </Text>
            ) : actions.inlineNotice.message ? (
              <Text className="fx-save-pill" data-state="saved" role="status" aria-live="polite">
                <Check size={12} aria-hidden="true" />
                {actions.inlineNotice.message}
              </Text>
            ) : undefined
          }
          actions={
            <>
              <Button
                type="button"
                label="Buscar hora libre"
                variant="secondary"
                size="sm"
                icon={<Sparkles size={14} aria-hidden="true" />}
                onClick={() => ws.setQuickFinderOpen(true)}
              />
              <Button
                type="button"
                label="Bloquear día"
                variant="ghost"
                size="sm"
                icon={<Ban size={14} aria-hidden="true" />}
                onClick={ws.openBlockModal}
              />
            </>
          }
        />

        <HStack
          className="ad-cal-kpi-strip"
          gap={2}
          align="center"
          wrap="wrap"
          aria-label="Resumen de agenda"
        >
          <HStack gap={1.5} align="center" className="ad-cal-strip-item">
            <Text className="lk-serif ad-cal-strip-num" hasTabularNumbers>
              {data.kpis.todayBookingsCount}
            </Text>
            <Text type="supporting" color="secondary">
              {data.kpis.todayBookingsCount === 1 ? 'cita hoy' : 'citas hoy'}
            </Text>
          </HStack>
          <Text color="secondary" aria-hidden="true">·</Text>
          <button
            type="button"
            className="ad-cal-strip-btn"
            onClick={() => {
              ws.setTab('unconfirmed');
              ws.setViewMode('list');
            }}
          >
            <Text
              className="lk-serif ad-cal-strip-num"
              color={data.kpis.pendingConfirmationsCount > 0 ? 'accent' : 'primary'}
              hasTabularNumbers
            >
              {data.kpis.pendingConfirmationsCount}
            </Text>
            <Text type="supporting" color="secondary">
              por confirmar
            </Text>
          </button>
          <Text color="secondary" aria-hidden="true">·</Text>
          <NextLink
            href={cajaHref({ tab: 'sin-cobrar' })}
            className="ad-cal-strip-btn"
            style={{ textDecoration: 'none' }}
          >
            <Text
              className="lk-serif ad-cal-strip-num"
              color={data.uncollectedBookings.length > 0 ? 'accent' : 'primary'}
              hasTabularNumbers
            >
              {data.uncollectedBookings.length}
            </Text>
            <Text type="supporting" color="secondary" hasTabularNumbers>
              {uncollectedTotalCents > 0
                ? `por cobrar · ${formatCurrency(uncollectedTotalCents, data.settings.currency)}`
                : 'por cobrar'}
            </Text>
          </NextLink>
        </HStack>

        {actions.feedback ? (
          <Banner
            status={actions.feedback.status}
            role={actions.feedback.status === 'error' ? 'alert' : 'status'}
            title={actions.feedback.title}
            description={actions.feedback.description}
            endContent={
              actions.feedback.waMeUrl || actions.feedback.rescheduleUrl ? (
                <HStack gap={1.5} wrap="wrap">
                  {actions.feedback.waMeUrl ? (
                    <Button
                      label="Abrir WhatsApp"
                      variant="primary"
                      size="sm"
                      icon={<MessageCircle size={14} aria-hidden="true" />}
                      href={actions.feedback.waMeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  ) : null}
                  {actions.feedback.rescheduleUrl ? (
                    <Button
                      label={actions.rescheduleCopy.feedback ?? 'Copiar enlace'}
                      variant="secondary"
                      size="sm"
                      icon={<Copy size={14} aria-hidden="true" />}
                      onClick={() =>
                        actions.feedback?.rescheduleUrl &&
                        void actions.rescheduleCopy.copy(
                          actions.feedback.rescheduleUrl,
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

        <BookingsFiltersBar
          tab={ws.tab}
          viewMode={ws.viewMode}
          agendaRange={ws.agendaRange}
          selectedStaffFilter={ws.selectedStaffFilter}
          search={ws.search}
          pendingConfirmationsCount={data.kpis.pendingConfirmationsCount}
          waitlistCount={data.kpis.waitlistCount}
          isDateRangeActive={isDateRangeActive}
          isTodaySelected={ws.agendaRange === 'today' && activeVisualDate === ws.todayKey}
          isTomorrowSelected={ws.agendaRange === 'tomorrow' && activeVisualDate === ws.tomorrowKey}
          listCount={ws.listBookings.length}
          isSpecialistOnly={ws.isSpecialistOnly}
          visibleStaff={visibleStaff}
          allStaffColorIndex={ws.allStaffColorIndex}
          flaggedBookings={flaggedBookings}
          noShowThreshold={noShowThreshold}
          showSecondaryRow={!isScheduleView}
          onChangeTab={(nextTab) => {
            ws.setTab(nextTab);
            if (nextTab === 'past' || nextTab === 'canceled' || nextTab === 'unconfirmed') {
              ws.setViewMode('list');
            }
          }}
          onChangeSearch={(val) => {
            ws.setSearch(val);
            if (val.trim() && ws.viewMode === 'schedule') ws.setViewMode('list');
          }}
          onChangeViewMode={ws.setViewMode}
          onSelectRange={ws.handleSelectRange}
          onChangeStaffFilter={ws.setSelectedStaffFilter}
          onInspectFlaggedBooking={ws.setPopoverBookingId}
        />
      </VStack>

      {ws.tab === 'waitlist' ? (
        <WaitlistPanel
          waitlist={data.waitlist}
          services={data.services}
          salonName={data.settings.name}
          onStatusUpdated={async (message) => {
            await ws.refresh();
            actions.inlineNotice.show(message);
          }}
          onBookEntry={(entry) =>
            ws.openManualModal('any', {
              serviceId: entry.serviceId,
              startDate: entry.desiredDate,
              clientName: entry.clientName,
              clientPhone: entry.clientPhoneE164,
              internalNotes: entry.notes || 'Agendada desde lista de espera',
            })
          }
        />
      ) : ws.viewMode === 'schedule' ? (
        <VisualScheduleGrid
          rangeMode={ws.agendaRange === 'week' ? 'week' : 'day'}
          dateKey={activeVisualDate}
          todayKey={ws.todayKey}
          serverNowIso={data.serverNowIso}
          timezone={ws.tz}
          staff={scheduleStaff}
          allStaffColorIndex={ws.allStaffColorIndex}
          schedules={data.schedules}
          dateOverrides={data.dateOverrides}
          recurringBlocks={data.recurringBlocks}
          paymentSplits={data.paymentSplits}
          cashEntries={data.cashEntries}
          bookings={ws.tabFilteredBookings}
          allServices={data.services}
          isSpecialistLocked={Boolean(ws.lockedStaffId)}
          busyBookingId={actions.busyAction?.bookingId ?? null}
          busyStatus={actions.busyAction?.status ?? null}
          reschedulingBookingId={actions.reschedulingId}
          rangeControls={
            isDateRangeActive || ws.search.trim() ? (
              <AgendaRangeControls
                agendaRange={ws.agendaRange}
                isDateRangeActive={isDateRangeActive}
                isTodaySelected={ws.agendaRange === 'today' && activeVisualDate === ws.todayKey}
                isTomorrowSelected={
                  ws.agendaRange === 'tomorrow' && activeVisualDate === ws.tomorrowKey
                }
                search={ws.search}
                onSelectRange={ws.handleSelectRange}
              />
            ) : undefined
          }
          staffControls={
            <AgendaStaffControls
              isSpecialistOnly={ws.isSpecialistOnly}
              visibleStaff={visibleStaff}
              allStaffColorIndex={ws.allStaffColorIndex}
              selectedStaffFilter={ws.selectedStaffFilter}
              onChangeStaffFilter={ws.setSelectedStaffFilter}
            />
          }
          onChangeDate={(nextDateKey) => {
            ws.setSelectedVisualDate(nextDateKey);
            if (ws.agendaRange !== 'week') {
              if (nextDateKey === ws.todayKey) ws.setAgendaRange('today');
              else if (nextDateKey === ws.tomorrowKey) ws.setAgendaRange('tomorrow');
            }
          }}
          onJumpToDay={(nextDateKey) => {
            ws.setSelectedVisualDate(nextDateKey);
            ws.setAgendaRange(nextDateKey === ws.tomorrowKey ? 'tomorrow' : 'today');
            ws.setViewMode('schedule');
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
      ) : (
        <BookingsListView
          bookings={ws.listBookings}
          tab={ws.tab}
          agendaRange={ws.agendaRange}
          search={ws.search}
          allServices={data.services}
          paymentSplits={data.paymentSplits}
          cashEntries={data.cashEntries}
          serverNowIso={data.serverNowIso}
          salonName={data.settings.name}
          currency={data.settings.currency}
          timezone={ws.tz}
          noShowThreshold={noShowThreshold}
          canViewClients={canViewClients}
          busyBookingId={actions.busyAction?.bookingId ?? null}
          busyStatus={actions.busyAction?.status ?? null}
          requestingRescheduleId={actions.requestingRescheduleId}
          onSelectRangeWeek={() => ws.handleSelectRange('week')}
          onClearSearch={() => ws.setSearch('')}
          onOpenNewBooking={() => ws.openManualModal()}
          onSelectBooking={(bk) => ws.setPopoverBookingId(bk.id)}
          onUpdateStatus={(id, status) => void actions.updateStatus(id, status)}
          onOpenCheckout={ws.openCheckoutDrawer}
          onRequestReschedule={(id) => void actions.requestReschedule(id)}
        />
      )}

      <CitasDialogsHost
        data={data}
        tz={ws.tz}
        todayKey={ws.todayKey}
        activeVisualDate={activeVisualDate}
        lockedStaffId={ws.lockedStaffId}
        visibleStaff={visibleStaff}
        hasActiveOwnerPin={hasActiveOwnerPin}
        quickFinderOpen={ws.quickFinderOpen}
        onQuickFinderOpenChange={ws.setQuickFinderOpen}
        manualOpen={ws.manualOpen}
        onManualOpenChange={ws.setManualOpen}
        manualInitStaffId={ws.manualInitStaffId}
        manualPrefill={ws.manualPrefill}
        manualSessionKey={ws.manualSessionKey}
        popoverBooking={popoverBooking}
        onClosePopover={() => ws.setPopoverBookingId(null)}
        checkoutBooking={checkoutBooking}
        checkoutSessionKey={ws.checkoutSessionKey}
        onCloseCheckout={() => ws.setCheckoutBookingId(null)}
        blockOpen={ws.blockOpen}
        blockSessionKey={ws.blockSessionKey}
        onBlockOpenChange={ws.setBlockOpen}
        canViewClients={canViewClients}
        busyAction={actions.busyAction}
        rejectingDepositId={actions.rejectingDepositId}
        remindingId={actions.remindingId}
        requestingRescheduleId={actions.requestingRescheduleId}
        pendingCancelBooking={pendingCancelBooking}
        pinSubmitting={actions.pinSubmitting}
        pinError={actions.pinError}
        onDismissCancelPin={() => {
          actions.setPendingCancelBookingId(null);
          actions.setPinError(null);
        }}
        onOpenManualModal={ws.openManualModal}
        onOpenCheckout={ws.openCheckoutDrawer}
        onScheduleRetouch={(booking) => {
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
        }}
        onUpdateStatus={actions.updateStatus}
        onRejectDeposit={actions.rejectDeposit}
        onSendReminder={(id) => void actions.sendReminder(id)}
        onRequestReschedule={(id) => void actions.requestReschedule(id)}
        onRefresh={ws.refresh}
        onShowNotice={actions.inlineNotice.show}
        onSetFeedback={actions.setFeedback}
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
