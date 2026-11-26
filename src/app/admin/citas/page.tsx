'use client';

import dynamic from 'next/dynamic';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Ban, Check, Copy, MessageCircle, Plus, Sparkles } from 'lucide-react';
import { MetricGrid, PageHeader, PageSkeleton, SkeletonBlock } from '@/components/ui';
import { BookingsFiltersBar } from '@/components/admin/citas/BookingsFiltersBar';
import { BookingsListView } from '@/components/admin/citas/BookingsListView';
import { CitasDialogsHost } from '@/components/admin/citas/CitasDialogsHost';
import { useCitasBookingActions } from '@/components/admin/citas/useCitasBookingActions';
import { useCitasWorkspace } from '@/components/admin/citas/useCitasWorkspace';
import { WaitlistPanel } from '@/components/admin/citas/WaitlistPanel';

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
  const hasActiveOwnerPin = Boolean(
    ws.data?.settings.ownerPinEnabled && ws.data?.settings.hasOwnerPin,
  );
  const actions = useCitasBookingActions({
    data: ws.data,
    hasActiveOwnerPin,
    refresh: ws.refresh,
    revalidateBookings: ws.revalidateBookings,
  });

  if (!ws.data) {
    return <PageSkeleton kpiCount={3} withSplit={false} ariaLabel="Cargando citas y agenda" />;
  }

  const data = ws.data;
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

  return (
    <VStack gap={5} className="ad-page fx-fade-up">
      <PageHeader
        title="Agenda"
        subtitle="Revisa tus citas del día, confirma anticipos y cobra en un par de toques."
        meta={
          actions.busyAction ? (
            <Text className="fx-save-pill" data-state="saving" role="status" aria-live="polite">
              Actualizando...
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
              size="md"
              icon={<Sparkles size={15} aria-hidden="true" />}
              onClick={() => ws.setQuickFinderOpen(true)}
            />
            <Button
              type="button"
              label="Bloquear día"
              variant="ghost"
              size="md"
              icon={<Ban size={15} aria-hidden="true" />}
              onClick={ws.openBlockModal}
            />
            <Button
              type="button"
              label="Nueva cita"
              variant="primary"
              size="md"
              icon={<Plus size={16} aria-hidden="true" />}
              onClick={() => ws.openManualModal()}
            />
          </>
        }
      />

      <MetricGrid
        ariaLabel="Resumen de agenda"
        cols={3}
        items={[
          {
            id: 'today',
            label: 'Citas hoy',
            value: String(data.kpis.todayBookingsCount),
            sub: 'En agenda hoy',
            interactive: true,
          },
          {
            id: 'pending',
            label: 'Por confirmar',
            value: String(data.kpis.pendingConfirmationsCount),
            sub:
              data.kpis.pendingConfirmationsCount > 0
                ? 'Anticipos por revisar'
                : 'Todo confirmado',
            tone: data.kpis.pendingConfirmationsCount > 0 ? 'warning' : 'success',
            interactive: true,
          },
          {
            id: 'uncollected',
            label: 'Falta cobrar',
            value: String(data.uncollectedBookings.length),
            sub: data.uncollectedBookings.length > 0 ? 'Con saldo pendiente' : 'Todo cobrado',
            tone: data.uncollectedBookings.length > 0 ? 'warning' : 'success',
            interactive: true,
          },
        ]}
      />

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

      {ws.tab === 'waitlist' ? (
        <WaitlistPanel
          waitlist={data.waitlist}
          services={data.services}
          salonName={data.settings.name}
          onNotified={async () => {
            await ws.refresh();
            actions.inlineNotice.show('Clienta marcada como avisada');
          }}
        />
      ) : ws.viewMode === 'schedule' ? (
        <VisualScheduleGrid
          rangeMode={ws.agendaRange === 'week' ? 'week' : 'day'}
          dateKey={activeVisualDate}
          todayKey={ws.todayKey}
          timezone={ws.tz}
          staff={scheduleStaff}
          allStaffColorIndex={ws.allStaffColorIndex}
          schedules={data.schedules}
          recurringBlocks={data.recurringBlocks}
          paymentSplits={data.paymentSplits}
          bookings={ws.tabFilteredBookings}
          allServices={data.services}
          busyBookingId={actions.busyAction?.bookingId ?? null}
          busyStatus={actions.busyAction?.status ?? null}
          onChangeDate={(nextDateKey) => {
            ws.setSelectedVisualDate(nextDateKey);
            if (nextDateKey === ws.todayKey) ws.setAgendaRange('today');
            else if (nextDateKey === ws.tomorrowKey) ws.setAgendaRange('tomorrow');
          }}
          onJumpToDay={(nextDateKey) => {
            ws.setSelectedVisualDate(nextDateKey);
            ws.setAgendaRange(nextDateKey === ws.tomorrowKey ? 'tomorrow' : 'today');
            ws.setViewMode('schedule');
          }}
          onOpenNewForStaff={(staffId, preferredDate) =>
            ws.openManualModal(staffId, preferredDate ? { startDate: preferredDate } : null)
          }
          onSelectBooking={(b) => ws.setPopoverBookingId(b.id)}
          onUpdateStatus={(id, status) => void actions.updateStatus(id, status)}
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
          salonName={data.settings.name}
          currency={data.settings.currency}
          timezone={ws.tz}
          noShowThreshold={noShowThreshold}
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
        busyAction={actions.busyAction}
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
        onScheduleRetouch={ws.handleScheduleRetouch}
        onUpdateStatus={actions.updateStatus}
        onSendReminder={(id) => void actions.sendReminder(id)}
        onRequestReschedule={(id) => void actions.requestReschedule(id)}
        onRefresh={ws.refresh}
        onRevalidateBookings={ws.revalidateBookings}
        onShowNotice={actions.inlineNotice.show}
        onSetFeedback={actions.setFeedback}
      />
    </VStack>
  );
}
