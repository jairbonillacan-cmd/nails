'use client';

import React, { useMemo, useRef, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Banner } from '@astryxdesign/core/Banner';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import {
  Calendar,
  CalendarClock,
  CalendarX,
  List as ListIcon,
  MessageCircle,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import {
  BOOKING_STATUS_BADGE,
  BookingCard,
} from '@/components/admin/citas/BookingCard';
import { BookingQuickPopover } from '@/components/admin/citas/BookingQuickPopover';
import { CheckoutDrawerDialog } from '@/components/admin/citas/CheckoutDrawerDialog';
import {
  NewBookingDialog,
  type NewBookingPrefill,
} from '@/components/admin/citas/NewBookingDialog';
import { QuickSlotFinderDialog } from '@/components/admin/citas/QuickSlotFinderDialog';
import { VisualScheduleGrid } from '@/components/admin/citas/VisualScheduleGrid';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import type { BookingStatus, BookingWithRelations } from '@/lib/types';
import {
  buildWhatsAppLink,
  formatDateShortInTimezone,
  formatTimeInTimezone,
  getDateKeyInTimezone,
} from '@/lib/format';

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [y = 2026, m = 1, d = 1] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

interface FeedbackState {
  status: 'success' | 'error';
  title: string;
  description?: string;
  waMeUrl?: string;
}

export default function AdminBookingsPage() {
  const { data, refresh } = useAdminData();
  const [tab, setTab] = useState('upcoming');
  const [viewMode, setViewMode] = useState<'visual' | 'list' | 'calendar'>('visual');
  const [search, setSearch] = useState('');
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [selectedVisualDate, setSelectedVisualDate] = useState<string | null>(null);

  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickFinderOpen, setQuickFinderOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualInitStaffId, setManualInitStaffId] = useState('any');
  const [manualPrefill, setManualPrefill] = useState<NewBookingPrefill | null>(null);
  const [manualSessionKey, setManualSessionKey] = useState(0);
  const [remindingId, setRemindingId] = useState<string | null>(null);

  const [popoverBookingId, setPopoverBookingId] = useState<string | null>(null);
  const [checkoutBookingId, setCheckoutBookingId] = useState<string | null>(null);
  const [checkoutSessionKey, setCheckoutSessionKey] = useState(0);

  const [blockOpen, setBlockOpen] = useState(false);
  const [blockStaffId, setBlockStaffId] = useState('');
  const [blockDate, setBlockDate] = useState('');
  const [blockReason, setBlockReason] = useState('Bloqueo rápido');

  const handledUrlParamsRef = useRef(false);

  const tz = data?.settings.timezone || 'America/Mexico_City';

  useExternalSync(data ? 'citas-ready' : 'citas-loading', async (signal, key) => {
    if (signal.aborted || key !== 'citas-ready' || !data || typeof window === 'undefined') return;
    if (handledUrlParamsRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const collectId = params.get('collect')?.trim();
    if (collectId) {
      const target = data.bookings.find((b) => b.id === collectId);
      if (target) {
        handledUrlParamsRef.current = true;
        setCheckoutBookingId(target.id);
        setCheckoutSessionKey((prev) => prev + 1);
        return;
      }
    }
    if (params.get('new') === '1') {
      handledUrlParamsRef.current = true;
      setManualInitStaffId('any');
      setManualPrefill(null);
      setManualSessionKey((prev) => prev + 1);
      setManualOpen(true);
    }
  });

  const filteredBookings = useMemo(() => {
    if (!data) return [];
    const nowMs = new Date(data.serverNowIso).getTime();
    return data.bookings.filter((b) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const ig = (b.clientInstagram ?? b.client.instagramHandle ?? '').toLowerCase();
        const hit =
          b.client.fullName.toLowerCase().includes(q) ||
          b.service.name.toLowerCase().includes(q) ||
          b.bookingCode.toLowerCase().includes(q) ||
          b.client.phoneE164.includes(q) ||
          ig.includes(q);
        if (!hit) return false;
      }
      if (tab === 'upcoming') {
        return (
          ['confirmed', 'pending_confirmation', 'pending_payment'].includes(b.status) &&
          new Date(b.endAt).getTime() >= nowMs - 86_400_000
        );
      }
      if (tab === 'unconfirmed') {
        return b.status === 'pending_confirmation' || b.status === 'pending_payment';
      }
      if (tab === 'past') {
        return b.status === 'completed' || b.status === 'no_show';
      }
      if (tab === 'canceled') {
        return b.status === 'canceled';
      }
      return true;
    });
  }, [data, tab, search]);

  const groupedByDate = useMemo(() => {
    const map = new Map<string, BookingWithRelations[]>();
    for (const b of filteredBookings) {
      const key = getDateKeyInTimezone(new Date(b.startAt), tz);
      const list = map.get(key) ?? [];
      list.push(b);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [filteredBookings, tz]);

  if (!data) return null;

  const isSpecialistOnly =
    data.session.user.role === 'specialist' && Boolean(data.session.user.staffMemberId);
  const lockedStaffId = isSpecialistOnly ? data.session.user.staffMemberId : null;
  const visibleStaff = lockedStaffId
    ? data.staff.filter((s) => s.id === lockedStaffId)
    : data.staff;

  const activeVisualDate =
    selectedVisualDate ??
    (filteredBookings[0]
      ? getDateKeyInTimezone(new Date(filteredBookings[0].startAt), tz)
      : data.serverTodayKey);

  const openManualModal = (
    preferredStaffId = 'any',
    prefill: NewBookingPrefill | null = null,
  ) => {
    setManualInitStaffId(lockedStaffId ?? preferredStaffId);
    setManualPrefill(prefill);
    setManualSessionKey((prev) => prev + 1);
    setQuickAddOpen(false);
    setManualOpen(true);
  };

  const openCheckoutDrawer = (booking: BookingWithRelations) => {
    setPopoverBookingId(null);
    setCheckoutBookingId(booking.id);
    setCheckoutSessionKey((prev) => prev + 1);
  };

  const handleScheduleRetouch = (booking: BookingWithRelations) => {
    const baseDateKey = getDateKeyInTimezone(new Date(booking.startAt), tz);
    const retouchDateKey = shiftDateKey(baseDateKey, 21);
    setCheckoutBookingId(null);
    openManualModal(booking.staffId, {
      serviceId: booking.serviceId,
      extraServiceIds: booking.extraServiceIds ?? [],
      staffId: booking.staffId,
      startDate: retouchDateKey,
      clientName: booking.client.fullName,
      clientPhone: booking.client.phoneE164,
      clientInstagram: booking.clientInstagram ?? booking.client.instagramHandle ?? '',
      internalNotes: `Retoque +21 días (${booking.bookingCode})`,
    });
  };

  const openBlockModal = () => {
    setBlockStaffId(lockedStaffId ?? data.staff[0]?.id ?? '');
    setBlockDate(activeVisualDate || data.serverTodayKey);
    setQuickAddOpen(false);
    setBlockOpen(true);
  };

  const popoverBooking = popoverBookingId
    ? data.bookings.find((b) => b.id === popoverBookingId) ?? null
    : null;
  const checkoutBooking = checkoutBookingId
    ? data.bookings.find((b) => b.id === checkoutBookingId) ?? null
    : null;

  const updateStatus = async (bookingId: string, status: BookingStatus) => {
    const res = await fetch('/api/admin/bookings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId, status }),
    });
    if (res.ok) {
      setFeedback({
        status: 'success',
        title: `Estado actualizado a: ${BOOKING_STATUS_BADGE[status].label}`,
      });
      await refresh();
    } else {
      const json = (await res.json().catch(() => null)) as {
        error?: string;
        code?: string;
      } | null;
      setFeedback({
        status: 'error',
        title:
          res.status === 403 && json?.code === 'PAST_BOOKING_LOCKED'
            ? json.error ||
              'Las citas pasadas están bloqueadas; solo la Dueña puede modificarlas.'
            : json?.error || 'No se pudo actualizar el estado de la cita.',
      });
    }
  };

  const sendReminder = async (bookingId: string) => {
    setRemindingId(bookingId);
    try {
      const res = await fetch('/api/admin/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_reminder',
          bookingId,
          channel: 'whatsapp',
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: string;
        waMeUrl?: string;
        messagePreview?: string;
      } | null;
      if (res.ok) {
        setFeedback({
          status: 'success',
          title: 'Recordatorio registrado y enviado por WhatsApp.',
          description: json?.messagePreview,
          waMeUrl: json?.waMeUrl,
        });
        await refresh();
      } else {
        setFeedback({
          status: 'error',
          title: json?.error || 'No se pudo enviar el recordatorio.',
        });
      }
    } finally {
      setRemindingId(null);
    }
  };

  const submitQuickBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockStaffId || !blockDate) return;
    const res = await fetch('/api/admin/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staffId: blockStaffId,
        overrideDate: blockDate,
        isUnavailable: true,
        startTime: null,
        endTime: null,
        reason: blockReason,
      }),
    });
    if (res.ok) {
      setBlockOpen(false);
      setFeedback({
        status: 'success',
        title: `Día ${blockDate} bloqueado en la agenda pública.`,
      });
      await refresh();
    } else {
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      setFeedback({
        status: 'error',
        title: json?.error || 'No se pudo bloquear esa fecha.',
      });
    }
  };

  return (
    <VStack gap={5}>
      <HStack justify="between" align="center" wrap="wrap" gap={3}>
        <VStack gap={0.5}>
          <Heading level={1}>Citas y Agenda</Heading>
          <Text color="secondary">
            Agenda visual por especialista, búsqueda rápida de hora, pago dividido y retoque en 1 clic.
          </Text>
        </VStack>

        <HStack gap={2} wrap="wrap">
          <Button
            label="Búsqueda rápida de hora"
            variant="secondary"
            size="sm"
            icon={<Sparkles size={14} />}
            onClick={() => setQuickFinderOpen(true)}
          />
          <Button
            label="Bloquear día"
            variant="secondary"
            size="sm"
            onClick={openBlockModal}
          />
          <Button
            label="Agregar"
            variant="primary"
            size="sm"
            icon={<Plus size={15} />}
            onClick={() => setQuickAddOpen(true)}
          />
        </HStack>
      </HStack>

      {feedback ? (
        <Banner
          status={feedback.status}
          role={feedback.status === 'error' ? 'alert' : 'status'}
          title={feedback.title}
          description={feedback.description}
          endContent={
            feedback.waMeUrl ? (
              <Button
                label="Abrir WhatsApp"
                variant="primary"
                size="sm"
                icon={<MessageCircle size={14} />}
                href={feedback.waMeUrl}
                target="_blank"
                rel="noopener noreferrer"
              />
            ) : undefined
          }
          isDismissable
          onDismiss={() => setFeedback(null)}
        />
      ) : null}

      <HStack justify="between" align="center" wrap="wrap" gap={3}>
        <TabList value={tab} onChange={setTab}>
          <Tab value="upcoming" label="Próximas" />
          <Tab
            value="unconfirmed"
            label="Por confirmar"
            endContent={
              data.kpis.pendingConfirmationsCount > 0 ? (
                <Badge
                  variant="warning"
                  label={String(data.kpis.pendingConfirmationsCount)}
                />
              ) : undefined
            }
          />
          <Tab value="past" label="Pasadas" />
          <Tab value="canceled" label="Canceladas" />
          <Tab
            value="waitlist"
            label="Lista de espera"
            endContent={
              data.kpis.waitlistCount > 0 ? (
                <Badge variant="info" label={String(data.kpis.waitlistCount)} />
              ) : undefined
            }
          />
        </TabList>

        <HStack gap={2} align="center" wrap="wrap">
          <TextInput
            type="search"
            label="Buscar cita"
            isLabelHidden
            placeholder="Clienta, @instagram, código..."
            startIcon={<Search size={14} />}
            size="sm"
            autoCapitalize="none"
            hasAutoCorrect={false}
            hasSpellCheck={false}
            enterKeyHint="search"
            value={search}
            onChange={setSearch}
          />
          {tab !== 'waitlist' ? (
            <SegmentedControl
              label="Vista de citas"
              size="sm"
              value={viewMode}
              onChange={(v) => setViewMode(v as 'visual' | 'list' | 'calendar')}
            >
              <SegmentedControlItem
                value="visual"
                label="Agenda visual"
                icon={<CalendarClock size={14} />}
              />
              <SegmentedControlItem
                value="list"
                label="Lista"
                icon={<ListIcon size={14} />}
              />
              <SegmentedControlItem
                value="calendar"
                label="Por día"
                icon={<Calendar size={14} />}
              />
            </SegmentedControl>
          ) : null}
        </HStack>
      </HStack>

      {tab === 'waitlist' ? (
        <VStack gap={3}>
          {data.waitlist.length === 0 ? (
            <EmptyState
              title="Sin personas en lista de espera"
              description="Cuando un día esté lleno, tus clientas podrán apuntarse desde el calendario público."
            />
          ) : (
            data.waitlist.map((w) => {
              const srv = data.services.find((s) => s.id === w.serviceId);
              const waHref = buildWhatsAppLink(
                w.clientPhoneE164,
                `Hola ${w.clientName}, se abrió un lugar en ${data.settings.name} para ${srv?.name || 'tu servicio'} el ${w.desiredDate}. ¿Te gustaría agendarlo?`,
              );
              return (
                <Card key={w.id} padding={4}>
                  <HStack justify="between" align="center" wrap="wrap" gap={3}>
                    <VStack gap={0.5}>
                      <HStack gap={2} align="center">
                        <Text weight="semibold">{w.clientName}</Text>
                        <Badge
                          variant={w.status === 'waiting' ? 'warning' : 'success'}
                          label={w.status === 'waiting' ? 'En espera' : w.status}
                        />
                      </HStack>
                      <Text type="supporting" color="secondary">
                        {srv?.name} · Fecha deseada: {w.desiredDate} ({w.preferredWindow}) ·{' '}
                        {w.clientPhoneE164}
                      </Text>
                      {w.notes ? (
                        <Text type="supporting" color="secondary">
                          {w.notes}
                        </Text>
                      ) : null}
                    </VStack>
                    <HStack gap={2}>
                      <Button
                        label="Avisar por WhatsApp"
                        variant="primary"
                        size="sm"
                        icon={<MessageCircle size={14} />}
                        href={waHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={async () => {
                          await fetch('/api/admin/operations', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              kind: 'waitlist',
                              id: w.id,
                              status: 'notified',
                            }),
                          });
                          await refresh();
                        }}
                      />
                    </HStack>
                  </HStack>
                </Card>
              );
            })
          )}
        </VStack>
      ) : viewMode === 'visual' ? (
        <VisualScheduleGrid
          dateKey={activeVisualDate}
          todayKey={data.serverTodayKey}
          timezone={tz}
          staff={visibleStaff}
          schedules={data.schedules}
          recurringBlocks={data.recurringBlocks}
          paymentSplits={data.paymentSplits}
          bookings={filteredBookings}
          allServices={data.services}
          remindingBookingId={remindingId}
          onChangeDate={setSelectedVisualDate}
          onOpenNewForStaff={(staffId) => openManualModal(staffId)}
          onSelectBooking={(b) => setPopoverBookingId(b.id)}
          onUpdateStatus={(id, status) => void updateStatus(id, status)}
          onOpenCheckout={openCheckoutDrawer}
          onSendReminder={(id) => void sendReminder(id)}
        />
      ) : filteredBookings.length === 0 ? (
        <EmptyState
          title="No hay citas en esta vista"
          description="Puedes crear una cita manual o compartir tu link público."
          actions={
            <Button
              label="Nueva cita manual"
              variant="primary"
              onClick={() => openManualModal()}
            />
          }
        />
      ) : viewMode === 'list' ? (
        <VStack gap={3}>
          {filteredBookings.map((b) => (
            <BookingCard
              key={b.id}
              booking={b}
              allServices={data.services}
              paymentSplits={data.paymentSplits}
              salonName={data.settings.name}
              currency={data.settings.currency}
              timezone={tz}
              isReminding={remindingId === b.id}
              onSelectBooking={(bk) => setPopoverBookingId(bk.id)}
              onUpdateStatus={(id, status) => void updateStatus(id, status)}
              onOpenCheckout={openCheckoutDrawer}
              onSendReminder={(id) => void sendReminder(id)}
            />
          ))}
        </VStack>
      ) : (
        <Grid columns={{ minWidth: 300, max: 3 }} gap={4} align="start">
          {groupedByDate.map(([dateKey, items]) => (
            <Card key={dateKey} variant="muted" padding={4}>
              <VStack gap={3}>
                <HStack justify="between" align="center">
                  <Heading level={3}>
                    {formatDateShortInTimezone(`${dateKey}T18:00:00Z`, tz)}
                  </Heading>
                  <Badge variant="neutral" label={String(items.length)} />
                </HStack>
                {items.map((b) => (
                  <Card key={b.id} padding={3}>
                    <VStack gap={1.5}>
                      <HStack justify="between" align="center">
                        <Text weight="semibold">
                          {formatTimeInTimezone(b.startAt, tz)}
                        </Text>
                        <Badge
                          variant={BOOKING_STATUS_BADGE[b.status].variant}
                          label={BOOKING_STATUS_BADGE[b.status].label}
                        />
                      </HStack>
                      <Text weight="medium">{b.client.fullName}</Text>
                      <Text type="supporting" color="secondary">
                        {b.service.name} · {b.staff.name}
                      </Text>
                      <HStack gap={1.5}>
                        <Button
                          label="Gestionar"
                          size="sm"
                          variant="secondary"
                          onClick={() => setPopoverBookingId(b.id)}
                        />
                        {b.status === 'confirmed' ? (
                          <Button
                            label="$ Cobrar"
                            size="sm"
                            variant="primary"
                            onClick={() => openCheckoutDrawer(b)}
                          />
                        ) : null}
                      </HStack>
                    </VStack>
                  </Card>
                ))}
              </VStack>
            </Card>
          ))}
        </Grid>
      )}

      <Dialog isOpen={quickAddOpen} onOpenChange={setQuickAddOpen} width={420} padding={5}>
        <DialogHeader
          title="¿Qué deseas agregar?"
          subtitle="Elige una acción rápida para tu agenda."
          onOpenChange={setQuickAddOpen}
        />
        <VStack gap={3} paddingBlockStart={4}>
          <Button
            label="Nueva cita (manual / DM / walk-in)"
            variant="primary"
            width="100%"
            icon={<Plus size={15} />}
            onClick={() => openManualModal()}
          />
          <Button
            label="Búsqueda rápida de hora"
            variant="secondary"
            width="100%"
            icon={<Sparkles size={15} />}
            onClick={() => {
              setQuickAddOpen(false);
              setQuickFinderOpen(true);
            }}
          />
          <Button
            label="Bloquear horario / cerrar día"
            variant="secondary"
            width="100%"
            icon={<CalendarX size={15} />}
            onClick={openBlockModal}
          />
        </VStack>
      </Dialog>

      <QuickSlotFinderDialog
        isOpen={quickFinderOpen}
        onOpenChange={setQuickFinderOpen}
        services={data.services}
        staff={data.staff}
        currency={data.settings.currency}
        timezone={tz}
        todayKey={data.serverTodayKey}
        lockedStaffId={lockedStaffId}
        onPickSlot={(selection) => {
          openManualModal(selection.staffId, {
            serviceId: selection.serviceId,
            extraServiceIds: selection.extraServiceIds,
            staffId: selection.staffId,
            startDate: selection.dateKey,
            preferredStartAt: selection.startAt,
          });
        }}
      />

      <BookingQuickPopover
        booking={popoverBooking}
        allServices={data.services}
        paymentSplits={data.paymentSplits}
        salonName={data.settings.name}
        currency={data.settings.currency}
        timezone={tz}
        isReminding={Boolean(popoverBooking && remindingId === popoverBooking.id)}
        onClose={() => setPopoverBookingId(null)}
        onUpdateStatus={(id, status) => void updateStatus(id, status)}
        onOpenCheckout={openCheckoutDrawer}
        onSendReminder={(id) => void sendReminder(id)}
      />

      <NewBookingDialog
        key={`${manualInitStaffId}-${manualSessionKey}`}
        isOpen={manualOpen}
        onOpenChange={setManualOpen}
        services={data.services}
        staff={data.staff}
        currency={data.settings.currency}
        timezone={tz}
        initialStaffId={manualInitStaffId}
        lockedStaffId={lockedStaffId}
        prefill={manualPrefill}
        onCreated={async (message) => {
          setFeedback({ status: 'success', title: message });
          await refresh();
        }}
      />

      <CheckoutDrawerDialog
        key={`${checkoutBookingId ?? 'closed'}-${checkoutSessionKey}`}
        booking={checkoutBooking}
        existingSplits={
          checkoutBooking
            ? data.paymentSplits.filter((s) => s.bookingId === checkoutBooking.id)
            : []
        }
        inventory={data.inventory}
        staff={data.staff}
        loyaltyProgram={data.loyaltyProgram}
        loyaltyStamps={data.loyaltyStamps}
        currency={data.settings.currency}
        onClose={() => setCheckoutBookingId(null)}
        onCompleted={async () => {
          await refresh();
        }}
        onScheduleRetouch={handleScheduleRetouch}
      />

      <Dialog
        isOpen={blockOpen}
        onOpenChange={setBlockOpen}
        purpose="form"
        width={440}
        padding={5}
      >
        <DialogHeader
          title="Bloqueo rápido de día"
          subtitle="Cierra un día completo para una especialista sin salir de Citas."
          onOpenChange={setBlockOpen}
        />
        <form onSubmit={submitQuickBlock}>
          <VStack gap={3} paddingBlockStart={4}>
            <Selector
              label="Especialista"
              value={blockStaffId}
              isDisabled={Boolean(lockedStaffId)}
              onChange={(v) => v && setBlockStaffId(v)}
              options={visibleStaff.map((s) => ({ value: s.id, label: s.name }))}
            />
            <TextInput
              label="Fecha (YYYY-MM-DD)"
              value={blockDate}
              autoCapitalize="none"
              hasAutoCorrect={false}
              hasSpellCheck={false}
              onChange={setBlockDate}
              isRequired
            />
            <TextInput
              label="Motivo"
              value={blockReason}
              onChange={setBlockReason}
            />
            <Button type="submit" label="Bloquear fecha" variant="primary" width="100%" />
          </VStack>
        </form>
      </Dialog>
    </VStack>
  );
}
