'use client';

import React, { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Token } from '@astryxdesign/core/Token';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import {
  Ban,
  Calendar,
  Check,
  CheckCheck,
  List as ListIcon,
  MessageCircle,
  Plus,
  Search,
  UserX,
} from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import type { BookingStatus, BookingWithRelations, PaymentMethod } from '@/lib/types';
import type { AvailableSlot } from '@/lib/availability/engine';
import {
  buildWhatsAppLink,
  formatCurrency,
  formatDateShortInTimezone,
  formatDuration,
  formatTimeInTimezone,
  getDateKeyInTimezone,
} from '@/lib/format';

const STATUS_BADGE: Record<
  BookingStatus,
  { label: string; variant: 'success' | 'warning' | 'error' | 'info' | 'neutral' }
> = {
  confirmed: { label: 'Confirmada', variant: 'success' },
  pending_confirmation: { label: 'Por confirmar', variant: 'warning' },
  pending_payment: { label: 'Anticipo pendiente', variant: 'warning' },
  completed: { label: 'Completada', variant: 'info' },
  canceled: { label: 'Cancelada', variant: 'error' },
  no_show: { label: 'No asistió', variant: 'error' },
};

export default function AdminBookingsPage() {
  const { data, refresh } = useAdminData();
  const [tab, setTab] = useState('upcoming');
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [search, setSearch] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const [manualOpen, setManualOpen] = useState(false);
  const [mServiceId, setMServiceId] = useState('');
  const [mStaffId, setMStaffId] = useState('any');
  const [mQuickSlots, setMQuickSlots] = useState<Array<AvailableSlot & { date: string }>>([]);
  const [mSelectedSlot, setMSelectedSlot] = useState<AvailableSlot | null>(null);
  const [mName, setMName] = useState('');
  const [mPhone, setMPhone] = useState('');
  const [mSource, setMSource] = useState<'manual' | 'walk_in'>('manual');
  const [mSaving, setMSaving] = useState(false);

  const [checkoutBooking, setCheckoutBooking] = useState<BookingWithRelations | null>(null);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('card');
  const [tipMxn, setTipMxn] = useState<number>(0);

  const [blockOpen, setBlockOpen] = useState(false);
  const [blockStaffId, setBlockStaffId] = useState('');
  const [blockDate, setBlockDate] = useState('');
  const [blockReason, setBlockReason] = useState('Bloqueo rápido');

  const tz = data?.settings.timezone || 'America/Mexico_City';

  const filteredBookings = useMemo(() => {
    if (!data) return [];
    const nowMs = new Date(data.serverNowIso).getTime();
    return data.bookings.filter((b) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const hit =
          b.client.fullName.toLowerCase().includes(q) ||
          b.service.name.toLowerCase().includes(q) ||
          b.bookingCode.toLowerCase().includes(q) ||
          b.client.phoneE164.includes(q);
        if (!hit) return false;
      }
      if (tab === 'upcoming') {
        return ['confirmed', 'pending_confirmation', 'pending_payment'].includes(b.status) &&
          new Date(b.endAt).getTime() >= nowMs - 86_400_000;
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

  const updateStatus = async (
    bookingId: string,
    status: BookingStatus,
    extra?: { paymentMethod?: PaymentMethod; tipCents?: number },
  ) => {
    const res = await fetch('/api/admin/bookings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId, status, ...extra }),
    });
    if (res.ok) {
      setFeedback(`Estado actualizado a: ${STATUS_BADGE[status].label}`);
      setCheckoutBooking(null);
      await refresh();
    }
  };

  const loadQuickSlots = async (serviceId: string, staffId: string) => {
    const qs = new URLSearchParams({ mode: 'quick', serviceId });
    if (staffId && staffId !== 'any') qs.set('staffId', staffId);
    const res = await fetch(`/api/availability?${qs.toString()}`);
    const json = await res.json();
    setMQuickSlots(json.slots || []);
    setMSelectedSlot(json.slots?.[0] ?? null);
  };

  const openManualModal = () => {
    const firstSrv = data.services[0]?.id || '';
    setMServiceId(firstSrv);
    setMStaffId('any');
    setManualOpen(true);
    if (firstSrv) void loadQuickSlots(firstSrv, 'any');
  };

  const submitManualBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mServiceId || !mSelectedSlot) return;
    setMSaving(true);
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId: mServiceId,
          addonIds: [],
          staffId: mSelectedSlot.staffId,
          startAt: mSelectedSlot.startAt,
          clientName: mName,
          clientPhone: mPhone,
          source: mSource,
          forceConfirmed: true,
        }),
      });
      if (res.ok) {
        setManualOpen(false);
        setMName('');
        setMPhone('');
        setFeedback('Cita manual registrada y bloqueada en tiempo real.');
        await refresh();
      }
    } finally {
      setMSaving(false);
    }
  };

  const submitQuickBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockStaffId || !blockDate) return;
    await fetch('/api/admin/availability', {
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
    setBlockOpen(false);
    setFeedback(`Día ${blockDate} bloqueado en la agenda pública.`);
    await refresh();
  };

  const renderBookingCard = (b: BookingWithRelations) => {
    const meta = STATUS_BADGE[b.status];
    const waHref = buildWhatsAppLink(
      b.client.phoneE164,
      `Hola ${b.client.fullName}, te escribimos de ${data.settings.name} sobre tu cita (${b.bookingCode}) de ${b.service.name} el ${formatDateShortInTimezone(
        b.startAt,
        tz,
      )} a las ${formatTimeInTimezone(b.startAt, tz)}.`,
    );

    return (
      <Card key={b.id} padding={4}>
        <VStack gap={3}>
          <HStack justify="between" align="start" wrap="wrap" gap={2}>
            <VStack gap={0.5}>
              <HStack gap={2} align="center" wrap="wrap">
                <Text weight="semibold" size="lg">
                  {b.client.fullName}
                </Text>
                <Badge variant={meta.variant} label={meta.label} />
                <Token size="sm" label={b.bookingCode} />
                <Token
                  size="sm"
                  color={b.source === 'whatsapp' ? 'green' : 'default'}
                  label={
                    b.source === 'whatsapp'
                      ? 'WhatsApp'
                      : b.source === 'walk_in'
                        ? 'Walk-in'
                        : b.source === 'manual'
                          ? 'Manual'
                          : 'Web'
                  }
                />
              </HStack>
              <Text weight="medium">
                {b.service.name}
                {b.addons.length > 0
                  ? ` + ${b.addons.map((a) => a.name).join(', ')}`
                  : ''}
              </Text>
              <Text type="supporting" color="secondary">
                {formatDateShortInTimezone(b.startAt, tz)} ·{' '}
                {formatTimeInTimezone(b.startAt, tz)} – {formatTimeInTimezone(b.endAt, tz)} (
                {formatDuration(b.totalDurationMinutes)}) · Especialista: {b.staff.name}
              </Text>
              {b.clientNotes ? (
                <Text type="supporting" color="secondary">
                  Nota clienta: {b.clientNotes}
                </Text>
              ) : null}
              {b.paymentProofUrl ? (
                <Token size="sm" color="orange" label="Comprobante SPEI adjunto" />
              ) : null}
            </VStack>

            <VStack align="end" gap={1}>
              <Text weight="bold" size="lg" hasTabularNumbers>
                {formatCurrency(b.totalPriceCents, data.settings.currency)}
              </Text>
              <Text type="supporting" color="secondary">
                {b.client.phoneE164}
              </Text>
            </VStack>
          </HStack>

          <Divider />

          <HStack gap={2} wrap="wrap" justify="between" align="center">
            <HStack gap={1.5} wrap="wrap">
              {b.status === 'pending_confirmation' || b.status === 'pending_payment' ? (
                <Button
                  label="Confirmar"
                  variant="primary"
                  size="sm"
                  icon={<Check size={14} />}
                  onClick={() => void updateStatus(b.id, 'confirmed')}
                />
              ) : null}
              {b.status === 'confirmed' ? (
                <Button
                  label="Completar y cobrar"
                  variant="primary"
                  size="sm"
                  icon={<CheckCheck size={14} />}
                  onClick={() => {
                    setCheckoutBooking(b);
                    setPayMethod('card');
                    setTipMxn(0);
                  }}
                />
              ) : null}
              {b.status !== 'no_show' && b.status !== 'canceled' && b.status !== 'completed' ? (
                <Button
                  label="No asistió"
                  variant="secondary"
                  size="sm"
                  icon={<UserX size={14} />}
                  onClick={() => void updateStatus(b.id, 'no_show')}
                />
              ) : null}
              {b.status !== 'canceled' && b.status !== 'completed' ? (
                <Button
                  label="Cancelar"
                  variant="ghost"
                  size="sm"
                  icon={<Ban size={14} />}
                  onClick={() => void updateStatus(b.id, 'canceled')}
                />
              ) : null}
            </HStack>

            <HStack gap={1.5}>
              <Button
                label="Hablar por WhatsApp"
                variant="secondary"
                size="sm"
                icon={<MessageCircle size={14} />}
                href={waHref}
              />
              <Button
                label="Link clienta"
                variant="ghost"
                size="sm"
                href={`/cita/${b.manageToken}`}
              />
            </HStack>
          </HStack>
        </VStack>
      </Card>
    );
  };

  return (
    <VStack gap={5}>
      <HStack justify="between" align="center" wrap="wrap" gap={3}>
        <VStack gap={0.5}>
          <Heading level={1}>Citas y Agenda</Heading>
          <Text color="secondary">
            Gestiona confirmaciones, walk-ins, lista de espera y cobro directo a caja.
          </Text>
        </VStack>

        <HStack gap={2} wrap="wrap">
          <Button
            label="Bloquear día"
            variant="secondary"
            size="sm"
            onClick={() => {
              setBlockStaffId(data.staff[0]?.id || '');
              setBlockDate(getDateKeyInTimezone(new Date(), tz));
              setBlockOpen(true);
            }}
          />
          <Button
            label="Nueva cita manual / Walk-in"
            variant="primary"
            size="sm"
            icon={<Plus size={15} />}
            onClick={openManualModal}
          />
        </HStack>
      </HStack>

      {feedback ? (
        <Banner
          status="success"
          title={feedback}
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

        <HStack gap={2} align="center">
          <TextInput
            label="Buscar cita"
            isLabelHidden
            placeholder="Clienta, código o servicio..."
            startIcon={<Search size={14} />}
            size="sm"
            value={search}
            onChange={setSearch}
          />
          {tab !== 'waitlist' ? (
            <SegmentedControl
              label="Vista de citas"
              size="sm"
              value={viewMode}
              onChange={(v) => setViewMode(v as 'list' | 'calendar')}
            >
              <SegmentedControlItem value="list" label="Lista" icon={<ListIcon size={14} />} />
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
      ) : filteredBookings.length === 0 ? (
        <EmptyState
          title="No hay citas en esta vista"
          description="Puedes crear una cita manual o compartir tu link público."
          actions={
            <Button label="Nueva cita manual" variant="primary" onClick={openManualModal} />
          }
        />
      ) : viewMode === 'list' ? (
        <VStack gap={3}>{filteredBookings.map(renderBookingCard)}</VStack>
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
                    <VStack gap={1}>
                      <HStack justify="between" align="center">
                        <Text weight="semibold">
                          {formatTimeInTimezone(b.startAt, tz)}
                        </Text>
                        <Badge
                          variant={STATUS_BADGE[b.status].variant}
                          label={STATUS_BADGE[b.status].label}
                        />
                      </HStack>
                      <Text weight="medium">{b.client.fullName}</Text>
                      <Text type="supporting" color="secondary">
                        {b.service.name} · {b.staff.name}
                      </Text>
                    </VStack>
                  </Card>
                ))}
              </VStack>
            </Card>
          ))}
        </Grid>
      )}

      <Dialog isOpen={manualOpen} onOpenChange={setManualOpen} width={540} padding={5}>
        <DialogHeader
          title="Nueva cita manual / Walk-in"
          subtitle="Elige primero el servicio y selecciona uno de los próximos horarios libres reales."
          onOpenChange={setManualOpen}
        />
        <form onSubmit={submitManualBooking}>
          <VStack gap={3} paddingBlockStart={4}>
            <Selector
              label="Servicio"
              value={mServiceId}
              onChange={(val) => {
                if (val) {
                  setMServiceId(val);
                  void loadQuickSlots(val, mStaffId);
                }
              }}
              options={data.services.map((s) => ({
                value: s.id,
                label: `${s.name} (${s.durationMinutes}m · ${formatCurrency(
                  s.priceCents,
                  data.settings.currency,
                )})`,
              }))}
            />

            <Selector
              label="Especialista"
              value={mStaffId}
              onChange={(val) => {
                const next = val || 'any';
                setMStaffId(next);
                if (mServiceId) void loadQuickSlots(mServiceId, next);
              }}
              options={[
                { value: 'any', label: 'Cualquier disponible' },
                ...data.staff
                  .filter((s) => s.isActive)
                  .map((s) => ({ value: s.id, label: s.name })),
              ]}
            />

            <VStack gap={1.5}>
              <Text type="label" weight="semibold">
                Próximos horarios libres encontrados
              </Text>
              <HStack gap={1.5} wrap="wrap">
                {mQuickSlots.map((slot) => (
                  <Button
                    key={`${slot.staffId}-${slot.startAt}`}
                    size="sm"
                    variant={
                      mSelectedSlot?.startAt === slot.startAt ? 'primary' : 'secondary'
                    }
                    label={`${formatDateShortInTimezone(slot.startAt, tz)} · ${slot.localTime12}`}
                    onClick={() => setMSelectedSlot(slot)}
                  />
                ))}
              </HStack>
            </VStack>

            <Grid columns={2} gap={3}>
              <TextInput
                label="Nombre de clienta"
                value={mName}
                onChange={setMName}
                isRequired
              />
              <TextInput
                label="WhatsApp"
                value={mPhone}
                onChange={setMPhone}
                placeholder="55 1234 5678"
                isRequired
              />
            </Grid>

            <SegmentedControl
              label="Origen"
              size="sm"
              value={mSource}
              onChange={(v) => setMSource(v as 'manual' | 'walk_in')}
            >
              <SegmentedControlItem value="manual" label="Cita por DM / Teléfono" />
              <SegmentedControlItem value="walk_in" label="Llegó directo (Walk-in)" />
            </SegmentedControl>

            <Button
              type="submit"
              label="Guardar y bloquear horario"
              variant="primary"
              width="100%"
              isLoading={mSaving}
              isDisabled={!mSelectedSlot}
            />
          </VStack>
        </form>
      </Dialog>

      <Dialog
        isOpen={Boolean(checkoutBooking)}
        onOpenChange={(open) => {
          if (!open) setCheckoutBooking(null);
        }}
        width={460}
        padding={5}
      >
        <DialogHeader
          title="Completar cita y registrar en Caja"
          subtitle={
            checkoutBooking
              ? `${checkoutBooking.client.fullName} · ${checkoutBooking.service.name} (${formatCurrency(
                  checkoutBooking.totalPriceCents,
                  data.settings.currency,
                )})`
              : undefined
          }
          onOpenChange={() => setCheckoutBooking(null)}
        />
        {checkoutBooking ? (
          <VStack gap={3} paddingBlockStart={4}>
            <Selector
              label="Método de pago"
              value={payMethod}
              onChange={(v) => v && setPayMethod(v as PaymentMethod)}
              options={[
                { value: 'card', label: 'Tarjeta (Terminal / Clip / Mercado Pago)' },
                { value: 'cash', label: 'Efectivo' },
                { value: 'transfer', label: 'Transferencia SPEI' },
                { value: 'gift_card', label: 'Gift Card' },
              ]}
            />
            <NumberInput
              label="Propina opcional (MXN)"
              value={tipMxn}
              min={0}
              onChange={setTipMxn}
            />
            <Text type="supporting" color="secondary">
              La comisión de {checkoutBooking.staff.name} ({checkoutBooking.staff.commissionPercent}%) se calculará automáticamente en el corte de caja.
            </Text>
            <Button
              label="Confirmar cobro y completar"
              variant="primary"
              width="100%"
              onClick={() =>
                void updateStatus(checkoutBooking.id, 'completed', {
                  paymentMethod: payMethod,
                  tipCents: Math.round((tipMxn || 0) * 100),
                })
              }
            />
          </VStack>
        ) : null}
      </Dialog>

      <Dialog isOpen={blockOpen} onOpenChange={setBlockOpen} width={440} padding={5}>
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
              onChange={(v) => v && setBlockStaffId(v)}
              options={data.staff.map((s) => ({ value: s.id, label: s.name }))}
            />
            <TextInput
              label="Fecha (YYYY-MM-DD)"
              value={blockDate}
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
