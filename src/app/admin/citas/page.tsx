'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
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
  Copy,
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
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
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
  rescheduleUrl?: string;
}

export default function AdminBookingsPage() {
  const { data, refresh } = useAdminData();
  const searchParams = useSearchParams();
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
  const [requestingRescheduleId, setRequestingRescheduleId] = useState<string | null>(null);
  const copiedLink = useEphemeralMessage(2500);

  const [popoverBookingId, setPopoverBookingId] = useState<string | null>(null);
  const [checkoutBookingId, setCheckoutBookingId] = useState<string | null>(null);
  const [checkoutSessionKey, setCheckoutSessionKey] = useState(0);

  const [blockOpen, setBlockOpen] = useState(false);
  const [blockStaffId, setBlockStaffId] = useState('');
  const [blockDate, setBlockDate] = useState('');
  const [blockReason, setBlockReason] = useState('Bloqueo rápido');

  const lastHandledUrlKeyRef = useRef('');

  const tz = data?.settings.timezone || 'America/Mexico_City';
  const paramCollect = searchParams.get('collect')?.trim() ?? '';
  const paramNew = searchParams.get('new')?.trim() ?? '';
  const paramQuery = searchParams.get('q')?.trim() ?? '';
  const urlSyncKey = data
    ? `citas-ready|${paramCollect}|${paramNew}|${paramQuery}`
    : 'citas-loading';

  useExternalSync(urlSyncKey, async (signal, key) => {
    if (signal.aborted || !key.startsWith('citas-ready') || !data) return;
    if (lastHandledUrlKeyRef.current === key) return;
    lastHandledUrlKeyRef.current = key;

    if (paramCollect) {
      const target = data.bookings.find((b) => b.id === paramCollect);
      if (target) {
        setCheckoutBookingId(target.id);
        setCheckoutSessionKey((prev) => prev + 1);
        return;
      }
    }
    if (paramNew === '1') {
      setManualInitStaffId('any');
      setManualPrefill(null);
      setManualSessionKey((prev) => prev + 1);
      setManualOpen(true);
      return;
    }
    if (paramQuery) {
      setSearch(paramQuery);
      const qLower = paramQuery.toLowerCase();
      const matched = data.bookings.find(
        (b) =>
          b.bookingCode.toLowerCase() === qLower ||
          b.client.fullName.toLowerCase().includes(qLower),
      );
      if (matched) {
        if (matched.status === 'completed' || matched.status === 'no_show') {
          setTab('past');
        } else if (matched.status === 'canceled') {
          setTab('canceled');
        } else {
          setTab('upcoming');
        }
        setViewMode('list');
      }
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

  const requestReschedule = async (bookingId: string) => {
    setRequestingRescheduleId(bookingId);
    try {
      const res = await fetch('/api/admin/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'request_reschedule',
          bookingId,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: string;
        code?: string;
        waMeUrl?: string;
        rescheduleUrl?: string;
        messagePreview?: string;
      } | null;
      if (res.ok) {
        setFeedback({
          status: 'success',
          title: 'Enlace de reprogramación listo para enviar a la clienta.',
          description: json?.messagePreview,
          waMeUrl: json?.waMeUrl,
          rescheduleUrl: json?.rescheduleUrl,
        });
        await refresh();
      } else {
        setFeedback({
          status: 'error',
          title:
            res.status === 403 && json?.code === 'PAST_BOOKING_LOCKED'
              ? json.error ||
                'Las citas pasadas están bloqueadas; solo la Dueña puede modificarlas.'
              : json?.error || 'No se pudo generar la solicitud de reprogramación.',
        });
      }
    } finally {
      setRequestingRescheduleId(null);
    }
  };

  const handleCopyRescheduleUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      copiedLink.show('Enlace copiado');
    } catch {
      copiedLink.show('Copia el enlace manualmente');
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
    <VStack gap={5} className="ad-page fx-fade-up">
      <HStack as="header" className="ad-page-head" justify="between" align="end" wrap="wrap" gap={3}>
        <VStack gap={1} className="ad-head-copy">
          <Heading level={1} className="ad-page-title">
            Citas y agenda
          </Heading>
          <Text className="ad-page-sub">
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

      <section aria-label="Resumen de citas" className="ad-kpi-grid fx-stagger" data-cols="4">
        <VStack as="article" className="ad-card ad-kpi-card fx-card-lift" gap={1}>
          <Text type="supporting" color="secondary" weight="medium" className="ad-kpi-label">
            Citas hoy
          </Text>
          <Text className="lk-serif ad-kpi-val fx-tabular" hasTabularNumbers>
            {data.kpis.todayBookingsCount}
          </Text>
          <Text type="supporting" color="secondary" className="ad-kpi-sub">
            Agenda activa del día
          </Text>
        </VStack>
        <VStack as="article" className="ad-card ad-kpi-card fx-card-lift" gap={1}>
          <Text type="supporting" color="secondary" weight="medium" className="ad-kpi-label">
            Por confirmar
          </Text>
          <Text
            className="lk-serif ad-kpi-val fx-tabular"
            data-tone={data.kpis.pendingConfirmationsCount > 0 ? 'warning' : 'success'}
            hasTabularNumbers
          >
            {data.kpis.pendingConfirmationsCount}
          </Text>
          <Text type="supporting" color="secondary" className="ad-kpi-sub">
            {data.kpis.pendingConfirmationsCount > 0 ? 'Anticipos por validar' : 'Todo confirmado'}
          </Text>
        </VStack>
        <VStack as="article" className="ad-card ad-kpi-card fx-card-lift" gap={1}>
          <Text type="supporting" color="secondary" weight="medium" className="ad-kpi-label">
            Sin cobrar
          </Text>
          <Text
            className="lk-serif ad-kpi-val fx-tabular"
            data-tone={data.uncollectedBookings.length > 0 ? 'warning' : 'success'}
            hasTabularNumbers
          >
            {data.uncollectedBookings.length}
          </Text>
          <Text type="supporting" color="secondary" className="ad-kpi-sub">
            {data.uncollectedBookings.length > 0 ? 'Con saldo pendiente' : 'Cero fugas'}
          </Text>
        </VStack>
        <VStack as="article" className="ad-card ad-kpi-card fx-card-lift" gap={1}>
          <Text type="supporting" color="secondary" weight="medium" className="ad-kpi-label">
            Lista de espera
          </Text>
          <Text className="lk-serif ad-kpi-val fx-tabular" hasTabularNumbers>
            {data.kpis.waitlistCount}
          </Text>
          <Text type="supporting" color="secondary" className="ad-kpi-sub">
            Clientas esperando lugar
          </Text>
        </VStack>
      </section>

      {feedback ? (
        <Banner
          status={feedback.status}
          role={feedback.status === 'error' ? 'alert' : 'status'}
          title={feedback.title}
          description={feedback.description}
          endContent={
            feedback.waMeUrl || feedback.rescheduleUrl ? (
              <HStack gap={1.5} wrap="wrap">
                {feedback.waMeUrl ? (
                  <Button
                    label="Abrir WhatsApp"
                    variant="primary"
                    size="sm"
                    icon={<MessageCircle size={14} />}
                    href={feedback.waMeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                ) : null}
                {feedback.rescheduleUrl ? (
                  <Button
                    label={copiedLink.message ?? 'Copiar enlace'}
                    variant="secondary"
                    size="sm"
                    icon={<Copy size={14} />}
                    onClick={() =>
                      feedback.rescheduleUrl &&
                      void handleCopyRescheduleUrl(feedback.rescheduleUrl)
                    }
                  />
                ) : null}
              </HStack>
            ) : undefined
          }
          isDismissable
          onDismiss={() => setFeedback(null)}
        />
      ) : null}

      <HStack className="ad-toolbar" justify="between" align="center" wrap="wrap" gap={3}>
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
            placeholder="Buscar clienta o código..."
            startIcon={<Search size={14} />}
            size="sm"
            width="min(16rem, 100%)"
            hasClear
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
        <VStack className="ad-surface fx-step-in" key="waitlist" gap={0}>
          <HStack className="ad-section-head" justify="between" align="center" gap={2}>
            <Heading level={2} className="lk-serif ad-h3">
              Lista de espera
            </Heading>
            <Text color="inherit" className="ad-chip" data-tone="neutral" hasTabularNumbers>
              {data.waitlist.length} registro{data.waitlist.length === 1 ? '' : 's'}
            </Text>
          </HStack>
          {data.waitlist.length === 0 ? (
            <VStack className="ad-empty" gap={2}>
              <EmptyState
                isCompact
                title="Sin personas en lista de espera"
                description="Cuando un día esté lleno, tus clientas podrán apuntarse desde el calendario público."
              />
            </VStack>
          ) : (
            <VStack className="ad-row-list fx-stagger" gap={0}>
              {data.waitlist.map((w) => {
                const srv = data.services.find((s) => s.id === w.serviceId);
                const waHref = buildWhatsAppLink(
                  w.clientPhoneE164,
                  `Hola ${w.clientName}, se abrió un lugar en ${data.settings.name} para ${srv?.name || 'tu servicio'} el ${w.desiredDate}. ¿Te gustaría agendarlo?`,
                );
                return (
                  <HStack
                    key={w.id}
                    className="ad-row-item"
                    justify="between"
                    align="center"
                    wrap="wrap"
                    gap={3}
                  >
                    <VStack gap={0.5} className="rb-grow">
                      <HStack gap={2} align="center" wrap="wrap">
                        <Text weight="semibold">{w.clientName}</Text>
                        <Text
                          color="inherit"
                          className="ad-chip"
                          data-tone={w.status === 'waiting' ? 'warning' : 'success'}
                        >
                          {w.status === 'waiting' ? 'En espera' : w.status}
                        </Text>
                      </HStack>
                      <Text type="supporting" color="secondary" hasTabularNumbers>
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
                );
              })}
            </VStack>
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
        <VStack className="ad-surface fx-step-in" key={`${tab}-empty`} gap={0}>
          <VStack className="ad-empty" gap={2}>
            <EmptyState
              isCompact
              title="No hay citas en esta vista"
              description="Puedes crear una cita manual o compartir tu link público."
              actions={
                <Button
                  label="Nueva cita manual"
                  variant="primary"
                  size="sm"
                  onClick={() => openManualModal()}
                />
              }
            />
          </VStack>
        </VStack>
      ) : viewMode === 'list' ? (
        <VStack gap={3} key={`${tab}-list`} className="fx-step-in">
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
              isRequestingReschedule={requestingRescheduleId === b.id}
              onSelectBooking={(bk) => setPopoverBookingId(bk.id)}
              onUpdateStatus={(id, status) => void updateStatus(id, status)}
              onOpenCheckout={openCheckoutDrawer}
              onSendReminder={(id) => void sendReminder(id)}
              onRequestReschedule={(id) => void requestReschedule(id)}
            />
          ))}
        </VStack>
      ) : (
        <Grid
          key={`${tab}-cal`}
          className="fx-step-in"
          columns={{ minWidth: 280, max: 3 }}
          gap={4}
          align="start"
        >
          {groupedByDate.map(([dateKey, items]) => (
            <VStack key={dateKey} className="ad-surface" gap={0}>
              <HStack className="ad-section-head" justify="between" align="center" gap={2}>
                <Heading level={3} className="lk-serif ad-h3">
                  {formatDateShortInTimezone(`${dateKey}T18:00:00Z`, tz)}
                </Heading>
                <Text color="inherit" className="ad-chip" data-tone="neutral" hasTabularNumbers>
                  {items.length}
                </Text>
              </HStack>
              <VStack className="ad-row-list" gap={0}>
                {items.map((b) => (
                  <VStack key={b.id} className="ad-row-item" gap={2} align="stretch">
                    <HStack justify="between" align="center" gap={2} width="100%">
                      <Text weight="bold" hasTabularNumbers>
                        {formatTimeInTimezone(b.startAt, tz, true)}
                      </Text>
                      <Badge
                        variant={BOOKING_STATUS_BADGE[b.status].variant}
                        label={BOOKING_STATUS_BADGE[b.status].label}
                      />
                    </HStack>
                    <VStack gap={0.5} width="100%">
                      <Text weight="semibold">{b.client.fullName}</Text>
                      <Text type="supporting" color="secondary">
                        {b.service.name} · con {b.staff.name}
                      </Text>
                    </VStack>
                    <HStack gap={1.5} wrap="wrap" width="100%">
                      <Button
                        label="Gestionar"
                        size="sm"
                        variant="secondary"
                        onClick={() => setPopoverBookingId(b.id)}
                      />
                      {b.status === 'confirmed' ? (
                        <Button
                          label="Cobrar"
                          size="sm"
                          variant="primary"
                          onClick={() => openCheckoutDrawer(b)}
                        />
                      ) : null}
                    </HStack>
                  </VStack>
                ))}
              </VStack>
            </VStack>
          ))}
        </Grid>
      )}

      <Dialog isOpen={quickAddOpen} onOpenChange={setQuickAddOpen} width={420} padding={5}>
        <DialogHeader
          title="¿Qué deseas agregar?"
          subtitle="Elige una acción rápida para tu agenda."
          onOpenChange={setQuickAddOpen}
        />
        <VStack gap={3} paddingBlockStart={4} className="fx-sheet-in">
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
        isRequestingReschedule={Boolean(
          popoverBooking && requestingRescheduleId === popoverBooking.id,
        )}
        onClose={() => setPopoverBookingId(null)}
        onUpdateStatus={(id, status) => void updateStatus(id, status)}
        onOpenCheckout={openCheckoutDrawer}
        onSendReminder={(id) => void sendReminder(id)}
        onRequestReschedule={(id) => void requestReschedule(id)}
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
