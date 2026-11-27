'use client';

import type React from 'react';
import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { Banner } from '@astryxdesign/core/Banner';
import { OwnerPinDialog } from '@/components/admin/config/OwnerPinDialog';
import type { ClientProfile, Service, ServiceAddon, StaffMember } from '@/lib/types';
import {
  NewBookingAdvancedSection,
  createInitialAdvancedState,
  type NewBookingAdvancedState,
} from './NewBookingAdvancedSection';
import { NewBookingClientStep } from './NewBookingClientStep';
import {
  NewBookingServiceStep,
  computeCatalogSelectionTotals,
} from './NewBookingServiceStep';
import { NewBookingSlotStep } from './NewBookingSlotStep';
import { submitAdminBookingRequest, validateNewBookingInput } from './newBookingApi';
import { useNewBookingSlots } from './useNewBookingSlots';

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

  const [serviceId, setServiceId] = useState(defaultServiceId);
  const [extraServiceIds, setExtraServiceIds] = useState<string[]>(prefill?.extraServiceIds ?? []);
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [staffId, setStaffId] = useState(defaultStaffSelection);
  const [startDate, setStartDate] = useState(prefill?.startDate || todayKey);
  const [clientName, setClientName] = useState(prefill?.clientName ?? '');
  const [clientPhone, setClientPhone] = useState(prefill?.clientPhone ?? '');
  const [clientInstagram, setClientInstagram] = useState(prefill?.clientInstagram ?? '');
  const [advanced, setAdvanced] = useState<NewBookingAdvancedState>(() =>
    createInitialAdvancedState(prefill?.internalNotes ?? ''),
  );
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const effectiveServiceId = serviceId || defaultServiceId;
  const effectiveStaffId = lockedStaffId ?? staffId;
  const applicableAddons = useMemo(
    () =>
      addons
        .filter((a) => a.isActive && (a.appliesToAll || a.serviceIds.includes(effectiveServiceId)))
        .toSorted((a, b) => a.displayOrder - b.displayOrder),
    [addons, effectiveServiceId],
  );
  const selectedExtras = activeServices.filter(
    (s) => extraServiceIds.includes(s.id) && s.id !== effectiveServiceId,
  );
  const selectedAddons = applicableAddons.filter((a) => addonIds.includes(a.id));
  const catalogTotals = computeCatalogSelectionTotals(
    activeServices,
    addons,
    effectiveServiceId,
    extraServiceIds,
    addonIds,
  );
  const activeDurationMinutes = advanced.useCustomOverride
    ? advanced.customDuration
    : catalogTotals.durationMinutes;
  const activePriceCents = advanced.useCustomOverride
    ? Math.max(0, Math.round(advanced.customPriceMxn * 100))
    : catalogTotals.priceCents;

  const { slots, loadingSlots, selectedSlot, setSelectedSlot } = useNewBookingSlots({
    isOpen,
    serviceId: effectiveServiceId,
    extraServiceIds,
    addonIds: selectedAddons.map((a) => a.id),
    staffId: effectiveStaffId,
    startDate,
    preferredStartAt: prefill?.preferredStartAt,
    preferredStaffId: prefill?.staffId,
    onSyncStart: () => setFormError(null),
  });

  const patchAdvanced = (patch: Partial<NewBookingAdvancedState>) => {
    setAdvanced((prev) => ({ ...prev, ...patch }));
  };

  const syncCustomWithCatalog = (
    nextExtraIds: string[],
    nextAddonIds: string[],
    nextServiceId: string,
  ) => {
    if (!advanced.useCustomOverride) return;
    const totals = computeCatalogSelectionTotals(
      activeServices,
      addons,
      nextServiceId,
      nextExtraIds,
      nextAddonIds,
    );
    patchAdvanced({
      customDuration: totals.durationMinutes,
      customPriceMxn: Math.round(totals.priceCents / 100),
    });
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
    patchAdvanced(
      checked
        ? { useCustomOverride: true, customDuration: catalogTotals.durationMinutes, customPriceMxn: Math.round(catalogTotals.priceCents / 100) }
        : { useCustomOverride: false },
    );
  };

  const submitBookingRequest = async (ownerPin?: string) => {
    if (saving) return;
    const validationError = validateNewBookingInput({ serviceId: effectiveServiceId, selectedSlot, clientName, clientPhone });
    if (validationError || !selectedSlot) {
      setFormError(validationError ?? 'Elige un horario disponible para guardar la cita.');
      return;
    }
    const customPriceCents = Math.max(0, Math.round(advanced.customPriceMxn * 100));
    const hasPriceOverride = advanced.useCustomOverride && customPriceCents !== catalogTotals.priceCents;
    if (hasPriceOverride && requireOwnerPinForPriceOverride && !ownerPin) {
      setPinError(null);
      setPinDialogOpen(true);
      return;
    }
    setSaving(true);
    setFormError(null);
    setPinError(null);
    try {
      const result = await submitAdminBookingRequest({
        ...advanced,
        serviceId: effectiveServiceId,
        extraServiceIds: selectedExtras.map((s) => s.id),
        addonIds: selectedAddons.map((a) => a.id),
        staffId: selectedSlot.staffId,
        startAt: selectedSlot.startAt,
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim(),
        clientInstagram: clientInstagram.trim() || null,
        internalNotes: advanced.internalNotes.trim() || undefined,
        customPriceCents,
        ownerPin,
        timezone,
      });
      if (!result.ok) {
        if (result.pinRequired) {
          setPinError(result.pinError);
          setPinDialogOpen(true);
        } else {
          setFormError(result.error);
        }
        return;
      }
      setClientName('');
      setClientPhone('');
      setClientInstagram('');
      setExtraServiceIds([]);
      setAddonIds([]);
      setAdvanced(createInitialAdvancedState());
      setPinDialogOpen(false);
      onOpenChange(false);
      await onCreated(result.message, result.description);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!saving) onOpenChange(open);
  };

  return (
    <>
      <Dialog
        isOpen={isOpen}
        onOpenChange={handleOpenChange}
        width={620}
        maxHeight="min(90dvh, calc(100dvh - 2rem))"
        padding={5}
      >
        <Layout
          header={
            <DialogHeader
              title="Nueva cita"
              subtitle="Clienta, servicio y horario."
              hasDivider
              onOpenChange={handleOpenChange}
            />
          }
          content={
            <LayoutContent>
              <form
                id="new-booking-form"
                onSubmit={(e: React.FormEvent) => {
                  e.preventDefault();
                  void submitBookingRequest();
                }}
              >
                <VStack
                  gap={4}
                  className={saving ? 'fx-busy' : undefined}
                  aria-busy={saving || undefined}
                >
                  {formError ? (
                    <Banner status="error" role="alert" title={formError} isDismissable onDismiss={() => setFormError(null)} />
                  ) : null}

                  <NewBookingClientStep
                    clients={clients}
                    clientName={clientName}
                    clientPhone={clientPhone}
                    clientInstagram={clientInstagram}
                    onChangeName={(val) => {
                      setClientName(val);
                      if (formError) setFormError(null);
                    }}
                    onChangePhone={(val) => {
                      setClientPhone(val);
                      if (formError) setFormError(null);
                    }}
                    onChangeInstagram={setClientInstagram}
                    onPickExistingClient={(client) => {
                      setClientName(client.fullName);
                      setClientPhone(client.phoneE164);
                      setClientInstagram(client.instagramHandle ?? '');
                      if (formError) setFormError(null);
                    }}
                  />

                  <NewBookingServiceStep
                    activeServices={activeServices}
                    applicableAddons={applicableAddons}
                    effectiveServiceId={effectiveServiceId}
                    extraServiceIds={extraServiceIds}
                    addonIds={addonIds}
                    activeDurationMinutes={activeDurationMinutes}
                    activePriceCents={activePriceCents}
                    currency={currency}
                    onChangeService={(val) => {
                      const nextExtras = extraServiceIds.filter((id) => id !== val);
                      setServiceId(val);
                      setExtraServiceIds(nextExtras);
                      syncCustomWithCatalog(nextExtras, addonIds, val);
                    }}
                    onToggleExtra={handleToggleExtra}
                    onToggleAddon={handleToggleAddon}
                  />

                  <NewBookingSlotStep
                    activeStaff={activeStaff}
                    effectiveStaffId={effectiveStaffId}
                    lockedStaffId={lockedStaffId}
                    startDate={startDate}
                    todayKey={todayKey}
                    timezone={timezone}
                    loadingSlots={loadingSlots}
                    slots={slots}
                    selectedSlot={selectedSlot}
                    onChangeStaff={setStaffId}
                    onChangeDate={setStartDate}
                    onSelectSlot={setSelectedSlot}
                  />

                  <NewBookingAdvancedSection
                    currency={currency}
                    timezone={timezone}
                    selectedSlot={selectedSlot}
                    catalogDurationMinutes={catalogTotals.durationMinutes}
                    catalogPriceCents={catalogTotals.priceCents}
                    activeDurationMinutes={activeDurationMinutes}
                    state={advanced}
                    onPatch={patchAdvanced}
                    onToggleCustomOverride={handleToggleCustomOverride}
                  />
                </VStack>
              </form>
            </LayoutContent>
          }
          footer={
            <LayoutFooter hasDivider>
              <Button
                type="submit"
                form="new-booking-form"
                label={
                  saving
                    ? advanced.isRecurring
                      ? 'Agendando retoques…'
                      : 'Guardando cita…'
                    : advanced.isRecurring
                      ? `Guardar serie (${advanced.recurrenceCount} citas)`
                      : 'Guardar cita'
                }
                variant="primary"
                size="md"
                width="100%"
                isLoading={saving}
                isDisabled={!selectedSlot || saving}
              />
            </LayoutFooter>
          }
        />
      </Dialog>

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
    </>
  );
}
