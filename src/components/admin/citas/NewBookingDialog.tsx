'use client';

import React, { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { DateInput } from '@astryxdesign/core/DateInput';
import type { ISODateString } from '@astryxdesign/core/Calendar';
import { Selector } from '@astryxdesign/core/Selector';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Switch } from '@astryxdesign/core/Switch';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { Repeat } from 'lucide-react';
import { OwnerPinDialog } from '@/components/admin/config/OwnerPinDialog';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import type { AvailableSlot } from '@/lib/availability/engine';
import type { ClientProfile, Service, ServiceAddon, StaffMember } from '@/lib/types';
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
  addons?: ServiceAddon[];
  staff: StaffMember[];
  clients?: ClientProfile[];
  todayKey: string;
  currency: 'MXN' | 'USD';
  timezone: string;
  initialStaffId: string;
  lockedStaffId: string | null;
  prefill?: NewBookingPrefill | null;
  requireOwnerPinForPriceOverride?: boolean;
  onCreated: (message: string, description?: string) => Promise<void>;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toIsoDateString(value: string): ISODateString | undefined {
  return ISO_DATE_RE.test(value) ? (value as ISODateString) : undefined;
}

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [y = 2026, m = 1, d = 1] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

export function NewBookingDialog({
  isOpen,
  onOpenChange,
  services,
  addons = [],
  staff,
  clients = [],
  todayKey,
  currency,
  timezone,
  initialStaffId,
  lockedStaffId,
  prefill,
  requireOwnerPinForPriceOverride = false,
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
  const defaultStartDate = prefill?.startDate || todayKey;

  const [serviceId, setServiceId] = useState(defaultServiceId);
  const [extraServiceIds, setExtraServiceIds] = useState<string[]>(
    prefill?.extraServiceIds ?? [],
  );
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [staffId, setStaffId] = useState(defaultStaffSelection);
  const [startDate, setStartDate] = useState(defaultStartDate);
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

  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceIntervalWeeks, setRecurrenceIntervalWeeks] = useState<2 | 3 | 4>(3);
  const [recurrenceCount, setRecurrenceCount] = useState<number>(3);

  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

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
  const applicableAddons = useMemo(
    () =>
      addons
        .filter(
          (a) =>
            a.isActive &&
            (a.appliesToAll || a.serviceIds.includes(effectiveServiceId)),
        )
        .toSorted((a, b) => a.displayOrder - b.displayOrder),
    [addons, effectiveServiceId],
  );
  const selectedAddons = applicableAddons.filter((a) => addonIds.includes(a.id));

  const catalogDurationMinutes =
    (primaryService?.durationMinutes ?? 60) +
    selectedExtras.reduce((sum, s) => sum + s.durationMinutes, 0) +
    selectedAddons.reduce((sum, a) => sum + a.extraMinutes, 0);
  const catalogPriceCents =
    (primaryService?.priceCents ?? 0) +
    selectedExtras.reduce((sum, s) => sum + s.priceCents, 0) +
    selectedAddons.reduce((sum, a) => sum + a.extraPriceCents, 0);

  const activeDurationMinutes = useCustomOverride ? customDuration : catalogDurationMinutes;
  const activePriceCents = useCustomOverride
    ? Math.max(0, Math.round(customPriceMxn * 100))
    : catalogPriceCents;

  const clientSuggestions = useMemo(() => {
    if (clients.length === 0) return [];
    const query = clientName.trim().toLowerCase();
    const phoneDigits = clientPhone.replace(/\D/g, '');
    const exactMatched = clients.some(
      (c) =>
        c.fullName.toLowerCase() === query &&
        phoneDigits.length >= 10 &&
        c.phoneE164.replace(/\D/g, '').endsWith(phoneDigits.slice(-10)),
    );
    if (exactMatched) return [];

    if (query.length >= 2 || phoneDigits.length >= 3) {
      return clients
        .filter((c) => {
          const nameHit = query.length >= 2 && c.fullName.toLowerCase().includes(query);
          const igHit =
            query.length >= 2 && (c.instagramHandle ?? '').toLowerCase().includes(query);
          const phoneHit =
            phoneDigits.length >= 3 && c.phoneE164.replace(/\D/g, '').includes(phoneDigits);
          return nameHit || igHit || phoneHit;
        })
        .slice(0, 4);
    }

    if (!query && !phoneDigits) {
      return clients.slice(0, 3);
    }

    return [];
  }, [clients, clientName, clientPhone]);

  const handlePickExistingClient = (client: ClientProfile) => {
    setClientName(client.fullName);
    setClientPhone(client.phoneE164);
    setClientInstagram(client.instagramHandle ?? '');
    if (formError) setFormError(null);
  };

  const availabilitySyncKey = isOpen
    ? `${effectiveServiceId}|${extraServiceIds.join(',')}|${selectedAddons
        .map((a) => a.id)
        .join(',')}|${effectiveStaffId}|${startDate}|${prefill?.preferredStartAt ?? ''}`
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
      if (startDate && ISO_DATE_RE.test(startDate)) {
        qs.set('startDate', startDate);
      }
      const cleanExtras = extraServiceIds.filter((id) => id !== effectiveServiceId);
      if (cleanExtras.length > 0) {
        qs.set('extraServiceIds', cleanExtras.join(','));
      }
      if (selectedAddons.length > 0) {
        qs.set('addonIds', selectedAddons.map((a) => a.id).join(','));
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

  const slotsByDate = useMemo(() => {
    const map = new Map<string, QuickSlotOption[]>();
    for (const slot of slots) {
      const list = map.get(slot.date) ?? [];
      list.push(slot);
      map.set(slot.date, list);
    }
    return Array.from(map.entries());
  }, [slots]);

  const syncCustomWithCatalog = (
    nextExtraIds: string[],
    nextAddonIds: string[],
    nextServiceId: string,
  ) => {
    if (!useCustomOverride) return;
    const base = activeServices.find((s) => s.id === nextServiceId) ?? null;
    const extras = activeServices.filter(
      (s) => nextExtraIds.includes(s.id) && s.id !== nextServiceId,
    );
    const chosenAddons = addons.filter(
      (a) =>
        a.isActive &&
        nextAddonIds.includes(a.id) &&
        (a.appliesToAll || a.serviceIds.includes(nextServiceId)),
    );
    setCustomDuration(
      (base?.durationMinutes ?? 60) +
        extras.reduce((sum, s) => sum + s.durationMinutes, 0) +
        chosenAddons.reduce((sum, a) => sum + a.extraMinutes, 0),
    );
    setCustomPriceMxn(
      Math.round(
        ((base?.priceCents ?? 0) +
          extras.reduce((sum, s) => sum + s.priceCents, 0) +
          chosenAddons.reduce((sum, a) => sum + a.extraPriceCents, 0)) /
          100,
      ),
    );
  };

  const handleToggleExtra = (extraId: string, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...extraServiceIds, extraId]))
      : extraServiceIds.filter((id) => id !== extraId);
    setExtraServiceIds(next);
    syncCustomWithCatalog(next, addonIds, effectiveServiceId);
  };

  const handleToggleAddon = (addonId: string, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...addonIds, addonId]))
      : addonIds.filter((id) => id !== addonId);
    setAddonIds(next);
    syncCustomWithCatalog(extraServiceIds, next, effectiveServiceId);
  };

  const handleToggleCustomOverride = (checked: boolean) => {
    setUseCustomOverride(checked);
    if (checked) {
      setCustomDuration(catalogDurationMinutes);
      setCustomPriceMxn(Math.round(catalogPriceCents / 100));
    }
  };

  const submitBookingRequest = async (ownerPin?: string) => {
    if (saving) return;
    if (!effectiveServiceId || !selectedSlot) {
      setFormError('Elige un horario disponible para guardar la cita.');
      return;
    }
    if (clientName.trim().length < 2) {
      setFormError('Escribe el nombre completo de la clienta.');
      return;
    }
    const cleanPhoneDigits = clientPhone.replace(/\D/g, '');
    if (cleanPhoneDigits.length < 10) {
      setFormError('Escribe un WhatsApp válido de al menos 10 dígitos.');
      return;
    }

    const customPriceCents = Math.max(0, Math.round(customPriceMxn * 100));
    const hasPriceOverride = useCustomOverride && customPriceCents !== catalogPriceCents;
    if (hasPriceOverride && requireOwnerPinForPriceOverride && !ownerPin) {
      setPinError(null);
      setPinDialogOpen(true);
      return;
    }

    setSaving(true);
    setFormError(null);
    setPinError(null);
    try {
      const clampedCount = Math.max(2, Math.min(6, Math.round(recurrenceCount || 2)));
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (ownerPin) {
        headers['x-owner-pin'] = ownerPin;
      }

      const res = await fetch('/api/admin/bookings', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          serviceId: effectiveServiceId,
          extraServiceIds: selectedExtras.map((s) => s.id),
          addonIds: selectedAddons.map((a) => a.id),
          staffId: selectedSlot.staffId,
          startAt: selectedSlot.startAt,
          clientName: clientName.trim(),
          clientPhone: clientPhone.trim(),
          clientInstagram: clientInstagram.trim() || null,
          internalNotes: internalNotes.trim() || undefined,
          ...(useCustomOverride
            ? {
                customDurationMinutes: Math.max(15, Math.min(480, Math.round(customDuration))),
                customPriceCents,
              }
            : {}),
          ...(isRecurring
            ? {
                recurrence: {
                  intervalWeeks: recurrenceIntervalWeeks,
                  count: clampedCount,
                },
              }
            : {}),
          ...(ownerPin ? { ownerPin } : {}),
          notifyEmail,
          notifyWhatsapp,
          source,
          forceConfirmed: true,
        }),
      });
      if (!res.ok) {
        const errJson = (await res.json().catch(() => null)) as {
          error?: string;
          code?: string;
        } | null;
        if (
          res.status === 403 &&
          (errJson?.code === 'OWNER_PIN_REQUIRED' || errJson?.code === 'OWNER_PIN_INVALID')
        ) {
          setPinError(
            errJson.code === 'OWNER_PIN_INVALID'
              ? errJson.error || 'PIN de autorización incorrecto.'
              : null,
          );
          setPinDialogOpen(true);
          return;
        }
        setFormError(errJson?.error || 'No se pudo guardar la cita.');
        return;
      }

      const okJson = (await res.json().catch(() => null)) as {
        bookings?: Array<{ bookingCode?: string; startAt?: string }>;
        skippedConflicts?: Array<{ startAt?: string; dateKey?: string; reason?: string }>;
      } | null;

      let successMessage = 'Cita agendada correctamente.';
      let successDescription: string | undefined;

      if (isRecurring) {
        const createdCount = okJson?.bookings?.length ?? 1;
        const skipped = okJson?.skippedConflicts ?? [];
        if (skipped.length > 0) {
          const skippedDates = skipped
            .map((item) =>
              item.startAt
                ? formatDateShortInTimezone(item.startAt, timezone)
                : item.dateKey || 'Fecha ocupada',
            )
            .join(', ');
          successMessage = `Retoques agendados: ${createdCount} de ${clampedCount} citas (${skipped.length} fecha${skipped.length === 1 ? '' : 's'} ocupada${skipped.length === 1 ? '' : 's'}).`;
          successDescription = `Fechas omitidas por disponibilidad: ${skippedDates}.`;
        } else {
          successMessage = `Retoques agendados: ${createdCount} citas cada ${recurrenceIntervalWeeks} semanas.`;
        }
      }

      setClientName('');
      setClientPhone('');
      setClientInstagram('');
      setInternalNotes('');
      setExtraServiceIds([]);
      setAddonIds([]);
      setUseCustomOverride(false);
      setIsRecurring(false);
      setRecurrenceIntervalWeeks(3);
      setRecurrenceCount(3);
      setPinDialogOpen(false);
      onOpenChange(false);
      await onCreated(successMessage, successDescription);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitBookingRequest();
  };

  const computedEndIso = selectedSlot
    ? new Date(
        new Date(selectedSlot.startAt).getTime() + activeDurationMinutes * 60_000,
      ).toISOString()
    : null;

  const tomorrowKey = shiftDateKey(todayKey, 1);
  const extrasTotalCount = selectedExtras.length + selectedAddons.length;
  const activeAdvancedCount =
    (isRecurring ? 1 : 0) +
    (useCustomOverride ? 1 : 0) +
    (internalNotes.trim() ? 1 : 0) +
    (source === 'walk_in' ? 1 : 0);

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!saving) onOpenChange(open);
      }}
      width={620}
      padding={5}
    >
      <DialogHeader
        title="Nueva cita"
        subtitle="Completa los 3 pasos para apartar el horario en segundos."
        onOpenChange={(open) => {
          if (!saving) onOpenChange(open);
        }}
      />
      <form onSubmit={handleSubmit}>
        <VStack
          gap={4}
          paddingBlockStart={4}
          className={saving ? 'fx-sheet-in fx-busy' : 'fx-sheet-in'}
          aria-busy={saving || undefined}
        >
          {formError ? (
            <Banner
              status="error"
              role="alert"
              title={formError}
              isDismissable
              onDismiss={() => setFormError(null)}
            />
          ) : null}

          <VStack className="ad-surface" data-tone="subtle" data-padded="true" gap={3}>
            <HStack justify="between" align="center" gap={2}>
              <Text weight="semibold" size="base">
                1. Clienta
              </Text>
              <Text type="supporting" color="secondary">
                Nombre y WhatsApp obligatorios
              </Text>
            </HStack>

            <Grid columns={{ minWidth: 180, max: 3 }} gap={3}>
              <TextInput
                label="Nombre"
                value={clientName}
                onChange={(val) => {
                  setClientName(val);
                  if (formError) setFormError(null);
                }}
                placeholder="Ej. Sofía Ramírez"
                autoComplete="name"
                isRequired
              />
              <TextInput
                type="tel"
                label="WhatsApp"
                value={clientPhone}
                onChange={(val) => {
                  setClientPhone(val);
                  if (formError) setFormError(null);
                }}
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

            {clientSuggestions.length > 0 ? (
              <VStack gap={1.5}>
                <Text type="supporting" color="secondary">
                  {clientName.trim() || clientPhone.trim()
                    ? 'Clientas encontradas (toca para rellenar):'
                    : 'Clientas frecuentes (toca para rellenar):'}
                </Text>
                <HStack gap={1.5} wrap="wrap">
                  {clientSuggestions.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      className="ad-pill fx-press"
                      data-on="false"
                      onClick={() => handlePickExistingClient(client)}
                    >
                      {client.fullName}
                    </button>
                  ))}
                </HStack>
              </VStack>
            ) : null}
          </VStack>

          <VStack className="ad-surface" data-tone="subtle" data-padded="true" gap={3}>
            <HStack justify="between" align="center" wrap="wrap" gap={2}>
              <Text weight="semibold" size="base">
                2. Servicio
              </Text>
              <Text
                color="inherit"
                className="ad-chip"
                data-tone="accent"
                hasTabularNumbers
              >
                {formatDuration(activeDurationMinutes)} ·{' '}
                {formatCurrency(activePriceCents, currency)}
              </Text>
            </HStack>

            <Selector
              label="Servicio principal"
              value={effectiveServiceId}
              onChange={(val) => {
                if (val) {
                  const nextExtras = extraServiceIds.filter((id) => id !== val);
                  setServiceId(val);
                  setExtraServiceIds(nextExtras);
                  syncCustomWithCatalog(nextExtras, addonIds, val);
                }
              }}
              options={activeServices.map((s) => ({
                value: s.id,
                label: `${s.name} (${formatDuration(s.durationMinutes)} · ${
                  s.isStartingPrice ? 'Desde ' : ''
                }${formatCurrency(s.priceCents, currency)})`,
              }))}
            />

            {applicableAddons.length > 0 || activeServices.length > 1 ? (
              <Collapsible
                className="ad-disclosure"
                defaultIsOpen={extrasTotalCount > 0}
                trigger={
                  <HStack gap={2} align="center">
                    <Text weight="semibold" size="sm">
                      Agregar extra o segundo servicio (opcional)
                    </Text>
                    {extrasTotalCount > 0 ? (
                      <Text
                        color="inherit"
                        className="ad-chip"
                        data-tone="accent"
                        hasTabularNumbers
                      >
                        +{extrasTotalCount}
                      </Text>
                    ) : null}
                  </HStack>
                }
              >
                <VStack gap={3} paddingBlockStart={2}>
                  {applicableAddons.length > 0 ? (
                    <VStack gap={1.5}>
                      <Text type="supporting" weight="semibold" color="secondary">
                        Extras y acabados
                      </Text>
                      <Grid columns={{ minWidth: 180, max: 2 }} gap={1.5}>
                        {applicableAddons.map((addon) => (
                          <CheckboxInput
                            key={addon.id}
                            size="sm"
                            label={`${addon.name} (+${formatCurrency(
                              addon.extraPriceCents,
                              currency,
                            )})`}
                            value={addonIds.includes(addon.id)}
                            onChange={(checked) => handleToggleAddon(addon.id, checked)}
                          />
                        ))}
                      </Grid>
                    </VStack>
                  ) : null}

                  {activeServices.length > 1 ? (
                    <VStack gap={1.5}>
                      <Text type="supporting" weight="semibold" color="secondary">
                        Otro servicio en la misma visita
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
                  ) : null}
                </VStack>
              </Collapsible>
            ) : null}
          </VStack>

          <VStack className="ad-surface" data-tone="subtle" data-padded="true" gap={3}>
            <HStack justify="between" align="center" wrap="wrap" gap={2}>
              <Text weight="semibold" size="base">
                3. Día y hora
              </Text>
              <HStack gap={1.5} align="center">
                <StatusDot
                  variant={selectedSlot ? 'success' : 'warning'}
                  label={selectedSlot ? 'Horario elegido' : 'Sin horarios cercanos'}
                />
                <Text weight="semibold" size="sm" hasTabularNumbers>
                  {loadingSlots
                    ? 'Buscando turnos...'
                    : selectedSlot
                      ? `${formatDateShortInTimezone(
                          selectedSlot.startAt,
                          timezone,
                        )} · ${selectedSlot.localTime12} (${selectedSlot.staffName})`
                      : 'Sin espacios en los próximos 14 días'}
                </Text>
              </HStack>
            </HStack>

            <Grid columns={{ minWidth: 200, max: 2 }} gap={3}>
              <Selector
                label="Manicurista"
                value={effectiveStaffId}
                isDisabled={Boolean(lockedStaffId)}
                onChange={(val) => {
                  if (!lockedStaffId) {
                    setStaffId(val || 'any');
                  }
                }}
                options={[
                  { value: 'any', label: 'Cualquier manicurista disponible' },
                  ...activeStaff.map((s) => ({ value: s.id, label: s.name })),
                ]}
              />

              <DateInput
                label="Desde la fecha"
                value={toIsoDateString(startDate)}
                min={toIsoDateString(todayKey)}
                format="date_weekday"
                onChange={(val) => {
                  if (val) setStartDate(val);
                }}
              />
            </Grid>

            <HStack gap={1.5} wrap="wrap">
              <button
                type="button"
                className="ad-pill fx-press"
                data-on={startDate === todayKey ? 'true' : 'false'}
                aria-pressed={startDate === todayKey}
                onClick={() => setStartDate(todayKey)}
              >
                Hoy
              </button>
              <button
                type="button"
                className="ad-pill fx-press"
                data-on={startDate === tomorrowKey ? 'true' : 'false'}
                aria-pressed={startDate === tomorrowKey}
                onClick={() => setStartDate(tomorrowKey)}
              >
                Mañana
              </button>
            </HStack>

            {loadingSlots ? (
              <HStack gap={1.5} wrap="wrap" aria-hidden="true">
                <VStack className="ad-skeleton" data-size="pill" />
                <VStack className="ad-skeleton" data-size="pill" />
                <VStack className="ad-skeleton" data-size="pill" />
                <VStack className="ad-skeleton" data-size="pill" />
              </HStack>
            ) : slotsByDate.length === 0 ? (
              <Text type="supporting" color="secondary">
                No hay turnos libres desde esta fecha. Prueba eligiendo otra fecha o cualquier
                manicurista.
              </Text>
            ) : (
              <VStack gap={3}>
                {slotsByDate.map(([dateKey, daySlots]) => (
                  <VStack key={dateKey} gap={1.5}>
                    <Text type="supporting" weight="semibold" color="secondary">
                      {dateKey === todayKey
                        ? `Hoy · ${formatDateShortInTimezone(`${dateKey}T18:00:00Z`, timezone)}`
                        : dateKey === tomorrowKey
                          ? `Mañana · ${formatDateShortInTimezone(`${dateKey}T18:00:00Z`, timezone)}`
                          : formatDateShortInTimezone(`${dateKey}T18:00:00Z`, timezone)}
                    </Text>
                    <HStack gap={1.5} wrap="wrap">
                      {daySlots.map((slot) => {
                        const isChosen =
                          selectedSlot?.startAt === slot.startAt &&
                          selectedSlot?.staffId === slot.staffId;
                        return (
                          <Button
                            key={`${slot.staffId}-${slot.startAt}`}
                            type="button"
                            size="sm"
                            variant={isChosen ? 'primary' : 'secondary'}
                            label={`${slot.localTime12} · ${slot.staffName}`}
                            onClick={() => setSelectedSlot(slot)}
                          />
                        );
                      })}
                    </HStack>
                  </VStack>
                ))}
              </VStack>
            )}
          </VStack>

          <Collapsible
            className="ad-disclosure"
            defaultIsOpen={false}
            trigger={
              <HStack gap={2} align="center" wrap="wrap">
                <Text weight="semibold" size="sm">
                  Más opciones
                </Text>
                <Text type="supporting" color="secondary">
                  Repetir cita, precio, duración o notas internas
                </Text>
                {activeAdvancedCount > 0 ? (
                  <Text
                    color="inherit"
                    className="ad-chip"
                    data-tone="accent"
                    hasTabularNumbers
                  >
                    {activeAdvancedCount}
                  </Text>
                ) : null}
              </HStack>
            }
          >
            <VStack gap={3} paddingBlockStart={3}>
              <VStack gap={2}>
                <Switch
                  label="Repetir cita (retoque)"
                  description="Agenda automáticamente la serie de retoques en el mismo horario; si una fecha está ocupada se omite."
                  size="sm"
                  value={isRecurring}
                  onChange={setIsRecurring}
                />

                {isRecurring ? (
                  <VStack gap={2} paddingBlockStart={1} className="fx-step-in">
                    <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
                      <Selector
                        label="Cada cuándo"
                        size="sm"
                        value={String(recurrenceIntervalWeeks)}
                        onChange={(val) => {
                          if (val === '2' || val === '3' || val === '4') {
                            setRecurrenceIntervalWeeks(Number(val) as 2 | 3 | 4);
                          }
                        }}
                        options={[
                          { value: '2', label: 'Cada 2 semanas' },
                          { value: '3', label: 'Cada 3 semanas' },
                          { value: '4', label: 'Cada 4 semanas' },
                        ]}
                      />
                      <NumberInput
                        label="Número de citas (2–6)"
                        value={recurrenceCount}
                        min={2}
                        max={6}
                        isIntegerOnly
                        onChange={(v) =>
                          setRecurrenceCount(Math.max(2, Math.min(6, Math.round(v || 2))))
                        }
                      />
                    </Grid>
                    <HStack gap={1.5} align="center">
                      <Repeat size={13} aria-hidden="true" />
                      <Text type="supporting" color="secondary" hasTabularNumbers>
                        Se agendarán {recurrenceCount} citas cada {recurrenceIntervalWeeks}{' '}
                        semanas.
                      </Text>
                    </HStack>
                  </VStack>
                ) : null}
              </VStack>

              <Divider />

              <VStack gap={2}>
                <HStack justify="between" align="center" wrap="wrap" gap={2}>
                  <Switch
                    label="Cambiar precio o duración de esta cita"
                    size="sm"
                    value={useCustomOverride}
                    onChange={handleToggleCustomOverride}
                  />
                  <Text type="supporting" color="secondary" hasTabularNumbers>
                    Catálogo: {formatDuration(catalogDurationMinutes)} ·{' '}
                    {formatCurrency(catalogPriceCents, currency)}
                  </Text>
                </HStack>

                {useCustomOverride ? (
                  <VStack gap={2}>
                    <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
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
                      <Text type="supporting" color="secondary" hasTabularNumbers>
                        Horario final:{' '}
                        {formatTimeInTimezone(selectedSlot.startAt, timezone, true)} –{' '}
                        {formatTimeInTimezone(computedEndIso, timezone, true)} (
                        {formatDuration(activeDurationMinutes)})
                      </Text>
                    ) : null}
                  </VStack>
                ) : null}

                <TextArea
                  label="Notas internas (solo equipo)"
                  placeholder="Ej. Diseño largo #4, anticipo confirmado por Instagram, alergias..."
                  value={internalNotes}
                  onChange={setInternalNotes}
                  rows={2}
                />
              </VStack>

              <Divider />

              <HStack justify="between" align="center" wrap="wrap" gap={3}>
                <HStack gap={3} wrap="wrap">
                  <Switch
                    label="Avisar por WhatsApp"
                    size="sm"
                    value={notifyWhatsapp}
                    onChange={setNotifyWhatsapp}
                  />
                  <Switch
                    label="Avisar por correo"
                    size="sm"
                    value={notifyEmail}
                    onChange={setNotifyEmail}
                  />
                </HStack>

                <SegmentedControl
                  label="Cómo llegó"
                  size="sm"
                  value={source}
                  onChange={(v) => setSource(v as 'manual' | 'walk_in')}
                >
                  <SegmentedControlItem value="manual" label="WhatsApp / Teléfono" />
                  <SegmentedControlItem value="walk_in" label="Llegó sin cita" />
                </SegmentedControl>
              </HStack>
            </VStack>
          </Collapsible>

          <Button
            type="submit"
            label={
              saving
                ? isRecurring
                  ? 'Agendando retoques...'
                  : 'Guardando cita...'
                : isRecurring
                  ? `Guardar serie (${recurrenceCount} citas)`
                  : 'Guardar cita'
            }
            variant="primary"
            size="md"
            width="100%"
            isLoading={saving}
            isDisabled={!selectedSlot || saving}
          />
        </VStack>
      </form>
      <OwnerPinDialog
        isOpen={pinDialogOpen}
        onOpenChange={(open) => {
          setPinDialogOpen(open);
          if (!open) setPinError(null);
        }}
        title="Autorizar cambio de precio"
        description="Cambiar el precio respecto al catálogo requiere el PIN de autorización de Dueña."
        actionLabel="Autorizar y guardar cita"
        isSubmitting={saving}
        error={pinError}
        onConfirm={(pin) => submitBookingRequest(pin)}
      />
    </Dialog>
  );
}
