'use client';

import React, { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Switch } from '@astryxdesign/core/Switch';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import type { AvailableSlot } from '@/lib/availability/engine';
import type { Service, StaffMember } from '@/lib/types';
import {
  formatCurrency,
  formatDateShortInTimezone,
  formatDuration,
  formatTimeInTimezone,
} from '@/lib/format';

interface QuickSlotOption extends AvailableSlot {
  date: string;
}

export interface NewBookingPrefill {
  serviceId?: string;
  extraServiceIds?: string[];
  staffId?: string;
  startDate?: string;
  preferredStartAt?: string;
  clientName?: string;
  clientPhone?: string;
  clientInstagram?: string;
  internalNotes?: string;
}

interface NewBookingDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  services: Service[];
  staff: StaffMember[];
  currency: 'MXN' | 'USD';
  timezone: string;
  initialStaffId: string;
  lockedStaffId: string | null;
  prefill?: NewBookingPrefill | null;
  onCreated: (message: string) => Promise<void>;
}

export function NewBookingDialog({
  isOpen,
  onOpenChange,
  services,
  staff,
  currency,
  timezone,
  initialStaffId,
  lockedStaffId,
  prefill,
  onCreated,
}: NewBookingDialogProps) {
  const activeServices = useMemo(
    () => services.filter((s) => s.isActive).toSorted((a, b) => a.displayOrder - b.displayOrder),
    [services],
  );
  const activeStaff = useMemo(
    () => staff.filter((s) => s.isActive).toSorted((a, b) => a.displayOrder - b.displayOrder),
    [staff],
  );

  const defaultServiceId = prefill?.serviceId || activeServices[0]?.id || '';
  const defaultStaffSelection = lockedStaffId ?? (prefill?.staffId || initialStaffId || 'any');

  const [serviceId, setServiceId] = useState(defaultServiceId);
  const [extraServiceIds, setExtraServiceIds] = useState<string[]>(
    prefill?.extraServiceIds ?? [],
  );
  const [staffId, setStaffId] = useState(defaultStaffSelection);
  const [slots, setSlots] = useState<QuickSlotOption[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<QuickSlotOption | null>(null);

  const [clientName, setClientName] = useState(prefill?.clientName ?? '');
  const [clientPhone, setClientPhone] = useState(prefill?.clientPhone ?? '');
  const [clientInstagram, setClientInstagram] = useState(prefill?.clientInstagram ?? '');
  const [internalNotes, setInternalNotes] = useState(prefill?.internalNotes ?? '');
  const [source, setSource] = useState<'manual' | 'walk_in'>('manual');

  const [useCustomOverride, setUseCustomOverride] = useState(false);
  const [customDuration, setCustomDuration] = useState<number>(120);
  const [customPriceMxn, setCustomPriceMxn] = useState<number>(350);

  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(true);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const effectiveServiceId = serviceId || defaultServiceId;
  const effectiveStaffId = lockedStaffId ?? staffId;

  const primaryService = activeServices.find((s) => s.id === effectiveServiceId) ?? null;
  const selectedExtras = activeServices.filter(
    (s) => extraServiceIds.includes(s.id) && s.id !== effectiveServiceId,
  );

  const catalogDurationMinutes =
    (primaryService?.durationMinutes ?? 60) +
    selectedExtras.reduce((sum, s) => sum + s.durationMinutes, 0);
  const catalogPriceCents =
    (primaryService?.priceCents ?? 0) +
    selectedExtras.reduce((sum, s) => sum + s.priceCents, 0);

  const activeDurationMinutes = useCustomOverride ? customDuration : catalogDurationMinutes;

  const availabilitySyncKey = isOpen
    ? `${effectiveServiceId}|${extraServiceIds.join(',')}|${effectiveStaffId}|${prefill?.startDate ?? ''}|${prefill?.preferredStartAt ?? ''}`
    : 'closed';

  useExternalSync(availabilitySyncKey, async (signal, key) => {
    if (key === 'closed' || !effectiveServiceId) return;
    setLoadingSlots(true);
    setFormError(null);
    try {
      const qs = new URLSearchParams({
        mode: 'range',
        serviceId: effectiveServiceId,
        days: '14',
      });
      if (prefill?.startDate) {
        qs.set('startDate', prefill.startDate);
      }
      const cleanExtras = extraServiceIds.filter((id) => id !== effectiveServiceId);
      if (cleanExtras.length > 0) {
        qs.set('extraServiceIds', cleanExtras.join(','));
      }
      if (effectiveStaffId && effectiveStaffId !== 'any') {
        qs.set('staffId', effectiveStaffId);
      }
      const res = await fetch(`/api/availability?${qs.toString()}`, { signal });
      if (signal.aborted) return;
      if (!res.ok) {
        setSlots([]);
        setSelectedSlot(null);
        return;
      }
      const json = (await res.json()) as {
        days?: Array<{ date: string; slots: AvailableSlot[] }>;
      };
      if (signal.aborted) return;
      const flattened: QuickSlotOption[] = [];
      for (const day of json.days ?? []) {
        for (const slot of day.slots) {
          flattened.push({ ...slot, date: day.date });
          if (flattened.length >= 16) break;
        }
        if (flattened.length >= 16) break;
      }
      setSlots(flattened);
      const matchedPreferred = prefill?.preferredStartAt
        ? flattened.find(
            (s) =>
              s.startAt === prefill.preferredStartAt &&
              (!prefill.staffId || s.staffId === prefill.staffId),
          )
        : null;
      setSelectedSlot(matchedPreferred ?? flattened[0] ?? null);
    } catch {
      if (!signal.aborted) {
        setSlots([]);
        setSelectedSlot(null);
      }
    } finally {
      if (!signal.aborted) {
        setLoadingSlots(false);
      }
    }
  });

  const handleToggleExtra = (extraId: string, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...extraServiceIds, extraId]))
      : extraServiceIds.filter((id) => id !== extraId);
    setExtraServiceIds(next);
    if (useCustomOverride) {
      const nextExtras = activeServices.filter(
        (s) => next.includes(s.id) && s.id !== effectiveServiceId,
      );
      setCustomDuration(
        (primaryService?.durationMinutes ?? 60) +
          nextExtras.reduce((sum, s) => sum + s.durationMinutes, 0),
      );
      setCustomPriceMxn(
        Math.round(
          ((primaryService?.priceCents ?? 0) +
            nextExtras.reduce((sum, s) => sum + s.priceCents, 0)) /
            100,
        ),
      );
    }
  };

  const handleToggleCustomOverride = (checked: boolean) => {
    setUseCustomOverride(checked);
    if (checked) {
      setCustomDuration(catalogDurationMinutes);
      setCustomPriceMxn(Math.round(catalogPriceCents / 100));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveServiceId || !selectedSlot) {
      setFormError('Selecciona un horario libre para registrar la cita.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch('/api/admin/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId: effectiveServiceId,
          extraServiceIds: selectedExtras.map((s) => s.id),
          addonIds: [],
          staffId: selectedSlot.staffId,
          startAt: selectedSlot.startAt,
          clientName: clientName.trim(),
          clientPhone: clientPhone.trim(),
          clientInstagram: clientInstagram.trim() || null,
          internalNotes: internalNotes.trim() || undefined,
          ...(useCustomOverride
            ? {
                customDurationMinutes: Math.max(15, Math.min(480, Math.round(customDuration))),
                customPriceCents: Math.max(0, Math.round(customPriceMxn * 100)),
              }
            : {}),
          notifyEmail,
          notifyWhatsapp,
          source,
          forceConfirmed: true,
        }),
      });
      if (!res.ok) {
        const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
        setFormError(errJson?.error || 'No se pudo registrar la cita.');
        return;
      }
      setClientName('');
      setClientPhone('');
      setClientInstagram('');
      setInternalNotes('');
      setExtraServiceIds([]);
      setUseCustomOverride(false);
      onOpenChange(false);
      await onCreated('Cita registrada y bloqueada en tiempo real.');
    } finally {
      setSaving(false);
    }
  };

  const computedEndIso = selectedSlot
    ? new Date(
        new Date(selectedSlot.startAt).getTime() + activeDurationMinutes * 60_000,
      ).toISOString()
    : null;

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      width={600}
      padding={5}
    >
      <DialogHeader
        title="Nueva cita manual / Walk-in"
        subtitle="Combina servicios, ajusta duración o precio si lo necesitas y elige un horario real."
        onOpenChange={onOpenChange}
      />
      <form onSubmit={handleSubmit}>
        <VStack gap={3} paddingBlockStart={4}>
          {formError ? (
            <Banner
              status="error"
              role="alert"
              title={formError}
              isDismissable
              onDismiss={() => setFormError(null)}
            />
          ) : null}

          <Grid columns={{ minWidth: 220, max: 2 }} gap={3}>
            <Selector
              label="Servicio principal"
              value={effectiveServiceId}
              onChange={(val) => {
                if (val) {
                  setServiceId(val);
                  setExtraServiceIds((prev) => prev.filter((id) => id !== val));
                }
              }}
              options={activeServices.map((s) => ({
                value: s.id,
                label: `${s.name} (${formatDuration(s.durationMinutes)} · ${
                  s.isStartingPrice ? 'Desde ' : ''
                }${formatCurrency(s.priceCents, currency)})`,
              }))}
            />

            <Selector
              label="Especialista"
              value={effectiveStaffId}
              isDisabled={Boolean(lockedStaffId)}
              onChange={(val) => {
                if (!lockedStaffId) {
                  setStaffId(val || 'any');
                }
              }}
              options={[
                { value: 'any', label: 'Cualquier disponible' },
                ...activeStaff.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
          </Grid>

          <VStack gap={1.5}>
            <Text type="label" weight="semibold">
              Servicios adicionales en esta cita (opcional)
            </Text>
            <Grid columns={{ minWidth: 180, max: 2 }} gap={1.5}>
              {activeServices
                .filter((s) => s.id !== effectiveServiceId)
                .map((srv) => (
                  <CheckboxInput
                    key={srv.id}
                    size="sm"
                    label={`${srv.name} (+${formatDuration(srv.durationMinutes)})`}
                    value={extraServiceIds.includes(srv.id)}
                    onChange={(checked) => handleToggleExtra(srv.id, checked)}
                  />
                ))}
            </Grid>
          </VStack>

          <Card variant="muted" padding={3}>
            <VStack gap={2}>
              <HStack justify="between" align="center" wrap="wrap" gap={2}>
                <HStack gap={1.5} align="center">
                  <StatusDot
                    variant={selectedSlot ? 'success' : 'warning'}
                    label={
                      selectedSlot
                        ? 'Primer horario libre disponible'
                        : 'Sin horarios libres cercanos'
                    }
                  />
                  <Text weight="semibold" size="sm">
                    {loadingSlots
                      ? 'Buscando horarios reales...'
                      : selectedSlot
                        ? `Primer horario libre disponible: ${formatDateShortInTimezone(
                            selectedSlot.startAt,
                            timezone,
                          )} · ${selectedSlot.localTime12} (${selectedSlot.staffName})`
                        : 'No encontramos horarios libres en los próximos 14 días.'}
                  </Text>
                </HStack>
              </HStack>

              <HStack gap={1.5} wrap="wrap">
                {slots.map((slot) => (
                  <Button
                    key={`${slot.staffId}-${slot.startAt}`}
                    type="button"
                    size="sm"
                    variant={
                      selectedSlot?.startAt === slot.startAt &&
                      selectedSlot?.staffId === slot.staffId
                        ? 'primary'
                        : 'secondary'
                    }
                    label={`${formatDateShortInTimezone(slot.startAt, timezone)} · ${slot.localTime12} (${slot.staffName})`}
                    onClick={() => setSelectedSlot(slot)}
                  />
                ))}
              </HStack>
            </VStack>
          </Card>

          <Card variant="muted" padding={3}>
            <VStack gap={2}>
              <HStack justify="between" align="center" wrap="wrap" gap={2}>
                <Switch
                  label="Personalizar duración / precio para esta cita"
                  size="sm"
                  value={useCustomOverride}
                  onChange={handleToggleCustomOverride}
                />
                <Text type="supporting" color="secondary" hasTabularNumbers>
                  Del catálogo: {formatDuration(catalogDurationMinutes)} ·{' '}
                  {formatCurrency(catalogPriceCents, currency)}
                </Text>
              </HStack>

              {useCustomOverride ? (
                <VStack gap={2}>
                  <Grid columns={2} gap={3}>
                    <NumberInput
                      label="Duración personalizada (min)"
                      value={customDuration}
                      min={15}
                      max={480}
                      onChange={setCustomDuration}
                    />
                    <NumberInput
                      label={`Precio personalizado (${currency})`}
                      value={customPriceMxn}
                      min={0}
                      onChange={setCustomPriceMxn}
                    />
                  </Grid>
                  {selectedSlot && computedEndIso ? (
                    <Text type="supporting" color="secondary">
                      La hora de inicio se mantiene:{' '}
                      {formatTimeInTimezone(selectedSlot.startAt, timezone)} –{' '}
                      {formatTimeInTimezone(computedEndIso, timezone)} (
                      {formatDuration(activeDurationMinutes)})
                    </Text>
                  ) : null}
                </VStack>
              ) : null}
            </VStack>
          </Card>

          <Grid columns={{ minWidth: 200, max: 3 }} gap={3}>
            <TextInput
              label="Nombre de clienta"
              value={clientName}
              onChange={setClientName}
              autoComplete="name"
              isRequired
            />
            <TextInput
              type="tel"
              label="WhatsApp"
              value={clientPhone}
              onChange={setClientPhone}
              placeholder="222 123 4567"
              autoComplete="tel"
              inputMode="tel"
              isRequired
            />
            <TextInput
              label="Instagram (opcional)"
              value={clientInstagram}
              onChange={setClientInstagram}
              placeholder="@usuario"
              autoCapitalize="none"
              hasAutoCorrect={false}
              hasSpellCheck={false}
            />
          </Grid>

          <TextArea
            label="Nota interna (solo equipo)"
            placeholder="Ej. Diseño largo #4, anticipo confirmado por DM, alergias..."
            value={internalNotes}
            onChange={setInternalNotes}
            rows={2}
          />

          <Divider />

          <HStack justify="between" align="center" wrap="wrap" gap={3}>
            <HStack gap={3} wrap="wrap">
              <Switch
                label="Notificar por WhatsApp"
                size="sm"
                value={notifyWhatsapp}
                onChange={setNotifyWhatsapp}
              />
              <Switch
                label="Notificar por Correo"
                size="sm"
                value={notifyEmail}
                onChange={setNotifyEmail}
              />
            </HStack>

            <SegmentedControl
              label="Origen"
              size="sm"
              value={source}
              onChange={(v) => setSource(v as 'manual' | 'walk_in')}
            >
              <SegmentedControlItem value="manual" label="DM / Teléfono" />
              <SegmentedControlItem value="walk_in" label="Walk-in" />
            </SegmentedControl>
          </HStack>

          <Button
            type="submit"
            label="Guardar y bloquear horario"
            variant="primary"
            width="100%"
            isLoading={saving}
            isDisabled={!selectedSlot || saving}
          />
        </VStack>
      </form>
    </Dialog>
  );
}
