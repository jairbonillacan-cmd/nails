'use client';

import React, { useCallback, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Section } from '@astryxdesign/core/Section';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { TextArea } from '@astryxdesign/core/TextArea';
import { List, ListItem } from '@astryxdesign/core/List';
import { Link } from '@astryxdesign/core/Link';
import { AspectRatio } from '@astryxdesign/core/AspectRatio';
import {
  CalendarPlus,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  ExternalLink,
  MapPin,
  MessageCircle,
  RefreshCw,
  Star,
  XCircle,
} from 'lucide-react';
import type { BookingWithRelations } from '@/lib/types';
import type {
  PublicLoyaltySummaryDTO,
  PublicServiceDTO,
  PublicSettingsDTO,
  PublicStaffDTO,
} from '@/lib/public-dto';
import type { AvailableSlot, DayAvailabilitySummary } from '@/lib/availability/engine';
import {
  CANCELLATION_REASON_OPTIONS,
  RESCHEDULE_REASON_OPTIONS,
} from '@/lib/notifications/cascade';
import {
  formatCurrency,
  formatDateLongInTimezone,
  formatDateShortInTimezone,
  formatDuration,
  formatTimeInTimezone,
  getDateKeyInTimezone,
} from '@/lib/format';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import { LoyaltyStampCard } from './LoyaltyStampCard';
import { PublicShell } from './PublicShell';

type PublicManageBooking = Omit<BookingWithRelations, 'staff' | 'service'> & {
  staff: PublicStaffDTO;
  service: PublicServiceDTO;
};

interface ManageBookingViewProps {
  initialBooking: PublicManageBooking;
  settings: PublicSettingsDTO;
  calendarLinks: {
    google: string;
    outlook: string;
    office365: string;
    icsDownload: string;
  };
  whatsappUrl: string;
  initialLoyaltySummary?: PublicLoyaltySummaryDTO | null;
  initialAction?: 'reschedule' | 'cancel';
}

const STATUS_META: Record<
  BookingWithRelations['status'],
  { label: string; variant: 'success' | 'warning' | 'error' | 'info' | 'neutral' }
> = {
  confirmed: { label: 'Confirmada', variant: 'success' },
  pending_confirmation: { label: 'Pendiente de confirmación', variant: 'warning' },
  pending_payment: { label: 'Anticipo pendiente', variant: 'warning' },
  completed: { label: 'Completada', variant: 'info' },
  canceled: { label: 'Cancelada', variant: 'error' },
  no_show: { label: 'No asistió', variant: 'error' },
};

function resolveSafeCheckoutUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

export function ManageBookingView({
  initialBooking,
  settings,
  calendarLinks,
  whatsappUrl,
  initialLoyaltySummary = null,
  initialAction,
}: ManageBookingViewProps) {
  const [booking, setBooking] = useState<PublicManageBooking>(initialBooking);
  const [loyaltySummary, setLoyaltySummary] =
    useState<PublicLoyaltySummaryDTO | null>(initialLoyaltySummary);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const initialCanModify = !['canceled', 'completed', 'no_show'].includes(
    initialBooking.status,
  );
  const [cancelOpen, setCancelOpen] = useState(
    initialAction === 'cancel' && initialCanModify,
  );
  const [cancelReasonChoice, setCancelReasonChoice] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [busy, setBusy] = useState(false);

  const [rescheduleOpen, setRescheduleOpen] = useState(
    initialAction === 'reschedule' && initialCanModify,
  );
  const [rescheduleReasonChoice, setRescheduleReasonChoice] = useState<string | null>(
    null,
  );
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [rescheduleDays, setRescheduleDays] = useState<DayAvailabilitySummary[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(
    initialAction === 'reschedule' && initialCanModify,
  );

  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5>(
    initialBooking.review?.rating ?? 5,
  );
  const [reviewComment, setReviewComment] = useState(
    initialBooking.review?.comment ?? '',
  );
  const [reviewSaved, setReviewSaved] = useState(Boolean(initialBooking.review));

  const statusInfo = STATUS_META[booking.status];
  const tz = settings.timezone || 'America/Mexico_City';
  const canModify = !['canceled', 'completed', 'no_show'].includes(booking.status);
  const safeCheckoutUrl = resolveSafeCheckoutUrl(booking.checkoutUrl);

  const handleSelectCancelChip = (option: string) => {
    setCancelReasonChoice(option);
    if (option === 'Otro') {
      if (
        CANCELLATION_REASON_OPTIONS.some((preset) => preset === cancelReason.trim())
      ) {
        setCancelReason('');
      }
      return;
    }
    setCancelReason(option);
  };

  const handleSelectRescheduleChip = (option: string) => {
    setRescheduleReasonChoice(option);
    if (option === 'Otro') {
      if (
        RESCHEDULE_REASON_OPTIONS.some((preset) => preset === rescheduleReason.trim())
      ) {
        setRescheduleReason('');
      }
      return;
    }
    setRescheduleReason(option);
  };

  const syncManageState = useCallback(
    async (signal: AbortSignal) => {
      try {
        const res = await fetch(
          `/api/bookings/manage/${encodeURIComponent(initialBooking.manageToken)}`,
          { cache: 'no-store', signal },
        );
        if (!res.ok || signal.aborted) return;
        const data = (await res.json()) as {
          booking?: PublicManageBooking;
          loyaltySummary?: PublicLoyaltySummaryDTO | null;
        };
        if (signal.aborted) return;
        if (data.booking) {
          setBooking(data.booking);
        }
        if ('loyaltySummary' in data) {
          setLoyaltySummary(data.loyaltySummary ?? null);
        }
      } catch {
        return;
      }
    },
    [initialBooking.manageToken],
  );

  useExternalSync(initialBooking.manageToken, syncManageState);

  const extraServiceIdsKey = (booking.extraServiceIds ?? []).join(',');
  const addonIdsKey = booking.addons.map((a) => a.addonId).join(',');

  const loadRescheduleSlots = useCallback(
    async (signal?: AbortSignal) => {
      setLoadingSlots(true);
      try {
        const startDate = getDateKeyInTimezone(new Date(), tz);
        const qs = new URLSearchParams({
          serviceId: booking.serviceId,
          addonIds: addonIdsKey,
          staffId: booking.staffId,
          startDate,
          days: '14',
          manageToken: booking.manageToken,
        });
        if (extraServiceIdsKey) {
          qs.set('extraServiceIds', extraServiceIdsKey);
        }
        const res = await fetch(`/api/availability?${qs.toString()}`, {
          cache: 'no-store',
          signal,
        });
        if (signal?.aborted) return;
        const data = (await res.json()) as { days?: DayAvailabilitySummary[] };
        if (signal?.aborted) return;
        setRescheduleDays(
          (data.days ?? []).filter((d) => d.hasSlots).slice(0, 6),
        );
      } catch {
        return;
      } finally {
        if (!signal?.aborted) {
          setLoadingSlots(false);
        }
      }
    },
    [
      addonIdsKey,
      booking.manageToken,
      booking.serviceId,
      booking.staffId,
      extraServiceIdsKey,
      tz,
    ],
  );

  const syncRescheduleSlots = useCallback(
    async (signal: AbortSignal) => {
      if (!rescheduleOpen || !canModify) return;
      await loadRescheduleSlots(signal);
    },
    [canModify, loadRescheduleSlots, rescheduleOpen],
  );

  useExternalSync(
    rescheduleOpen && canModify
      ? `reschedule:${booking.id}:${booking.serviceId}:${extraServiceIdsKey}:${addonIdsKey}:${booking.staffId}`
      : 'reschedule:closed',
    syncRescheduleSlots,
  );

  const openReschedule = () => {
    setActionError(null);
    setLoadingSlots(true);
    setRescheduleOpen(true);
  };

  const handleConfirmReschedule = async (slot: AvailableSlot) => {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/bookings/manage/${booking.manageToken}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reschedule',
          newStartAt: slot.startAt,
          newStaffId: slot.staffId,
          reason: rescheduleReason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || 'No se pudo reagendar.');
        return;
      }
      setBooking(data.booking);
      setRescheduleOpen(false);
      setActionSuccess('¡Tu cita fue reagendada y tu calendario actualizado!');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmCancel = async () => {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/bookings/manage/${booking.manageToken}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancel',
          reason: cancelReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || 'No se pudo cancelar la cita.');
        return;
      }
      setBooking(data.booking);
      setCancelOpen(false);
      setActionSuccess('Cita cancelada correctamente. El espacio se liberó al instante.');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`/api/bookings/manage/${booking.manageToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment: reviewComment }),
      });
      if (res.ok) {
        setReviewSaved(true);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <PublicShell>
      <Section variant="transparent" paddingBlock={8} paddingInline={4}>
        <VStack gap={5} maxWidth={680} width="100%" style={{ marginInline: 'auto' }}>
          {actionSuccess ? (
            <Banner
              status="success"
              title={actionSuccess}
              isDismissable
              onDismiss={() => setActionSuccess(null)}
            />
          ) : null}
          {actionError ? (
            <Banner
              status="error"
              title="Aviso sobre tu cita"
              description={actionError}
              isDismissable
              onDismiss={() => setActionError(null)}
            />
          ) : null}

          <Card padding={6} elevation="low">
            <VStack gap={5}>

              <VStack gap={2} align="center">
                <CheckCircle2 size={36} aria-hidden="true" />
                <Badge variant={statusInfo.variant} label={statusInfo.label} />
                <Heading level={1} justify="center">
                  {booking.status === 'canceled'
                    ? 'Esta cita fue cancelada'
                    : booking.status === 'pending_confirmation'
                      ? 'Solicitud recibida y horario apartado'
                      : '¡Tu cita está agendada!'}
                </Heading>
                <Text color="secondary" justify="center">
                  Código <Text weight="semibold">{booking.bookingCode}</Text> · Enviamos los detalles a tu correo y WhatsApp.
                </Text>
              </VStack>

              <Divider />

              <List hasDividers>
                <ListItem
                  label="Servicio"
                  description={
                    <VStack gap={0.5}>
                      <Text weight="medium">{booking.service.name}</Text>
                      {booking.addons.length > 0 ? (
                        <Text type="supporting" color="secondary">
                          Extras: {booking.addons.map((a) => a.name).join(', ')}
                        </Text>
                      ) : null}
                    </VStack>
                  }
                  endContent={
                    <Text weight="semibold" hasTabularNumbers>
                      {formatCurrency(booking.totalPriceCents, settings.currency)}
                    </Text>
                  }
                />
                <ListItem
                  label="Fecha y hora"
                  description={
                    <VStack gap={0.5}>
                      <Text weight="medium">
                        {formatDateLongInTimezone(booking.startAt, tz)}
                      </Text>
                      <Text type="supporting" color="secondary">
                        {formatTimeInTimezone(booking.startAt, tz)} –{' '}
                        {formatTimeInTimezone(booking.endAt, tz)} (
                        {formatDuration(booking.totalDurationMinutes)} · {tz})
                      </Text>
                    </VStack>
                  }
                  startContent={<Clock size={18} aria-hidden="true" />}
                />
                <ListItem
                  label="Especialista y clienta"
                  description={
                    <Text type="supporting" color="secondary">
                      {booking.staff.name} · {booking.client.fullName} (
                      {booking.client.phoneE164})
                    </Text>
                  }
                />
                <ListItem
                  label="Ubicación"
                  description={
                    <Link href={settings.mapsUrl} isExternalLink type="supporting">
                      {settings.address}
                    </Link>
                  }
                  startContent={<MapPin size={18} aria-hidden="true" />}
                />
              </List>

              {booking.status === 'pending_payment' && safeCheckoutUrl ? (
                <Banner
                  status="warning"
                  title="Anticipo pendiente para confirmar tu cita"
                  description={`Completa tu anticipo de ${formatCurrency(
                    booking.depositAmountCents,
                    settings.currency,
                  )} para confirmar tu horario al instante.`}
                >
                  <VStack gap={2} paddingBlockStart={2}>
                    <Button
                      label="Pagar anticipo con Mercado Pago"
                      variant="primary"
                      size="md"
                      width="100%"
                      icon={<CreditCard size={16} aria-hidden="true" />}
                      href={safeCheckoutUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  </VStack>
                </Banner>
              ) : null}

              {booking.inspoPhotoUrl ? (
                <VStack gap={1.5}>
                  <Text type="label" weight="semibold">
                    Tu foto de inspiración adjunta
                  </Text>
                  <AspectRatio ratio={16 / 9} fit="cover">
                    <img
                      src={booking.inspoPhotoUrl}
                      alt="Referencia de diseño"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: 'var(--radius-inner)',
                      }}
                    />
                  </AspectRatio>
                </VStack>
              ) : null}

              {booking.status !== 'canceled' ? (
                <>
                  <Divider />
                  <VStack gap={3} align="center">
                    <Text type="label" weight="semibold">
                      Agregar a tu calendario
                    </Text>
                    <HStack gap={2} wrap="wrap" justify="center">
                      <Button
                        label="Google Calendar"
                        variant="secondary"
                        size="sm"
                        icon={<CalendarPlus size={15} />}
                        href={calendarLinks.google}
                      />
                      <Button
                        label="Apple / iPhone (.ics)"
                        variant="secondary"
                        size="sm"
                        icon={<Download size={15} />}
                        href={calendarLinks.icsDownload}
                      />
                      <Button
                        label="Outlook"
                        variant="secondary"
                        size="sm"
                        href={calendarLinks.outlook}
                      />
                      <Button
                        label="Enviar por WhatsApp"
                        variant="primary"
                        size="sm"
                        icon={<MessageCircle size={15} />}
                        href={whatsappUrl}
                      />
                    </HStack>
                  </VStack>
                </>
              ) : null}

              {canModify ? (
                <>
                  <Divider />
                  <HStack justify="center" gap={3} wrap="wrap">
                    <Text type="supporting" color="secondary">
                      ¿Necesitas hacer un cambio?
                    </Text>
                    <Button
                      label="Reagendar"
                      variant="ghost"
                      size="sm"
                      icon={<RefreshCw size={14} />}
                      onClick={openReschedule}
                    />
                    <Button
                      label="Cancelar cita"
                      variant="ghost"
                      size="sm"
                      icon={<XCircle size={14} />}
                      onClick={() => setCancelOpen(true)}
                    />
                  </HStack>
                </>
              ) : null}
            </VStack>
          </Card>

          {loyaltySummary ? (
            <LoyaltyStampCard
              loyaltySummary={loyaltySummary}
              studioName={settings.name}
            />
          ) : null}

          {booking.status === 'completed' ? (
            <Card padding={5} variant="muted">
              <VStack gap={4}>
                <VStack gap={0.5}>
                  <Heading level={2}>¿Cómo quedaron tus uñas?</Heading>
                  <Text type="supporting" color="secondary">
                    Tu opinión nos ayuda muchísimo a seguir mejorando cada detalle.
                  </Text>
                </VStack>

                {reviewSaved ? (
                  <VStack gap={3}>
                    <Banner
                      status="success"
                      title="¡Gracias por calificarnos!"
                      description={`Registramos tu calificación de ${rating}/5 estrellas.`}
                    />
                    {rating >= 4 && settings.googleReviewUrl ? (
                      <Card padding={4}>
                        <HStack justify="between" align="center" wrap="wrap" gap={3}>
                          <VStack gap={0.5}>
                            <Text weight="semibold">
                              ¿Nos regalas esa reseña en Google Maps?
                            </Text>
                            <Text type="supporting" color="secondary">
                              Toma 15 segundos y ayuda a que más clientas conozcan {settings.name}.
                            </Text>
                          </VStack>
                          <Button
                            label="Dejar reseña en Google"
                            variant="primary"
                            size="sm"
                            icon={<ExternalLink size={15} />}
                            href={settings.googleReviewUrl}
                          />
                        </HStack>
                      </Card>
                    ) : null}
                  </VStack>
                ) : (
                  <form onSubmit={handleSubmitReview}>
                    <VStack gap={3}>
                      <HStack gap={2} wrap="wrap">
                        {([1, 2, 3, 4, 5] as const).map((star) => (
                          <Button
                            key={star}
                            label={`${star} ★`}
                            variant={rating === star ? 'primary' : 'secondary'}
                            size="sm"
                            icon={<Star size={14} />}
                            onClick={() => setRating(star)}
                          />
                        ))}
                      </HStack>
                      <TextArea
                        label="Cuéntanos qué te gustó o qué podemos mejorar"
                        value={reviewComment}
                        onChange={setReviewComment}
                        isOptional
                      />
                      <Button
                        type="submit"
                        label="Enviar mi calificación"
                        variant="primary"
                        isLoading={busy}
                      />
                    </VStack>
                  </form>
                )}
              </VStack>
            </Card>
          ) : null}
        </VStack>
      </Section>

      <Dialog isOpen={rescheduleOpen} onOpenChange={setRescheduleOpen} width={560} padding={5}>
        <DialogHeader
          title="Reagendar tu cita"
          subtitle="Elige un nuevo horario libre; tu servicio y extras se mantienen."
          onOpenChange={setRescheduleOpen}
        />
        <VStack gap={3} paddingBlockStart={4}>
          <VStack gap={1.5}>
            <Text type="label" weight="semibold">
              Motivo del cambio (opcional)
            </Text>
            <HStack gap={1.5} wrap="wrap">
              {RESCHEDULE_REASON_OPTIONS.map((option) => (
                <Button
                  key={option}
                  type="button"
                  label={option}
                  size="sm"
                  variant={rescheduleReasonChoice === option ? 'primary' : 'secondary'}
                  onClick={() => handleSelectRescheduleChip(option)}
                />
              ))}
            </HStack>
            <TextArea
              label="Detalles adicionales"
              placeholder="Opcional: agrega cualquier nota sobre tu cambio de horario"
              value={rescheduleReason}
              onChange={setRescheduleReason}
              isOptional
              rows={2}
            />
          </VStack>

          {loadingSlots ? (
            <Text color="secondary">Cargando horarios disponibles...</Text>
          ) : rescheduleDays.length === 0 ? (
            <Text color="secondary">No hay horarios próximos libres en los siguientes 14 días.</Text>
          ) : (
            <Grid columns={{ minWidth: 220, max: 2 }} gap={3}>
              {rescheduleDays.map((day) => (
                <Card key={day.date} variant="muted" padding={3}>
                  <VStack gap={2}>
                    <Text weight="semibold">
                      {formatDateShortInTimezone(`${day.date}T18:00:00Z`, tz)}
                    </Text>
                    <HStack gap={1.5} wrap="wrap">
                      {day.slots.slice(0, 6).map((slot) => (
                        <Button
                          key={slot.startAt}
                          label={slot.localTime12}
                          variant="secondary"
                          size="sm"
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                          isDisabled={busy}
                          onClick={() => handleConfirmReschedule(slot)}
                        />
                      ))}
                    </HStack>
                  </VStack>
                </Card>
              ))}
            </Grid>
          )}
        </VStack>
      </Dialog>

      <Dialog isOpen={cancelOpen} onOpenChange={setCancelOpen} width={480} padding={5}>
        <DialogHeader
          title="¿Cancelar esta cita?"
          subtitle={`Política: mínimo ${settings.minCancelHours}h antes de tu horario.`}
          onOpenChange={setCancelOpen}
        />
        <VStack gap={3} paddingBlockStart={4}>
          <VStack gap={1.5}>
            <Text type="label" weight="semibold">
              ¿Cuál es el motivo?
            </Text>
            <HStack gap={1.5} wrap="wrap">
              {CANCELLATION_REASON_OPTIONS.map((option) => (
                <Button
                  key={option}
                  type="button"
                  label={option}
                  size="sm"
                  variant={cancelReasonChoice === option ? 'primary' : 'secondary'}
                  onClick={() => handleSelectCancelChip(option)}
                />
              ))}
            </HStack>
          </VStack>
          <TextArea
            label="Motivo de cancelación"
            placeholder="Opcional: agrega detalles adicionales"
            value={cancelReason}
            onChange={setCancelReason}
            isOptional
          />
          <HStack justify="end" gap={2}>
            <Button
              label="Conservar cita"
              variant="secondary"
              onClick={() => setCancelOpen(false)}
            />
            <Button
              label="Sí, cancelar cita"
              variant="destructive"
              isLoading={busy}
              onClick={handleConfirmCancel}
            />
          </HStack>
        </VStack>
      </Dialog>
    </PublicShell>
  );
}
