'use client';

import { useMemo, useState } from 'react';
import type { ClientPortalProfile } from '@/lib/contracts';
import type { PublicServiceDTO, PublicSettingsDTO, PublicStaffDTO } from '@/lib/public-dto';
import type { BookingLayoutView, ServiceAddon, ServiceCategory } from '@/lib/types';
import type { ScheduleLayout } from '@/components/booking/ScheduleStep';
import { buildServiceComboOptions, filterRedundantAddons, toggleExtraServiceInZone } from '@/components/booking/serviceCombos';
import {
  formatBirthdayInput,
  formatMxPhoneDisplay,
  getStaffScheduleLabel,
  hasConfiguredDeposit,
  resolveDepositAmountCents,
  type ProofDeliveryMethod,
} from '@/components/booking/bookingHelpers';
import {
  getNextMonthStartKey,
  resolveInitialBookingSelections,
  shiftPlainDateKey,
} from '@/components/booking/bookingViewHelpers';
import { profileToContactFields } from '@/components/booking/clientAccountHelpers';

interface UseBookingSelectionStateInput {
  settings: PublicSettingsDTO;
  categories: ServiceCategory[];
  services: PublicServiceDTO[];
  addons: ServiceAddon[];
  staff: PublicStaffDTO[];
  initialTodayKey: string;
  initialServiceSlug?: string;
  initialExtraServiceSlugs?: string[];
  initialAddonIds?: string[];
  initialStaffSlug?: string;
  initialDate?: string;
  initialLayout?: BookingLayoutView;
  initialInspoNote?: string;
  initialClientProfile?: ClientPortalProfile | null;
}

export function useBookingSelectionState({
  settings,
  categories,
  services,
  addons,
  staff,
  initialTodayKey,
  initialServiceSlug,
  initialExtraServiceSlugs,
  initialAddonIds,
  initialStaffSlug,
  initialDate,
  initialLayout,
  initialInspoNote,
  initialClientProfile,
}: UseBookingSelectionStateInput) {
  const initial = useMemo(
    () =>
      resolveInitialBookingSelections({
        settings,
        services,
        addons,
        staff,
        initialTodayKey,
        initialServiceSlug,
        initialExtraServiceSlugs,
        initialAddonIds,
        initialStaffSlug,
        initialDate,
        initialLayout,
      }),
    [
      addons,
      initialAddonIds,
      initialDate,
      initialExtraServiceSlugs,
      initialLayout,
      initialServiceSlug,
      initialStaffSlug,
      initialTodayKey,
      services,
      settings,
      staff,
    ],
  );

  const [selectedServiceId, setSelectedServiceId] = useState(initial.initialServiceId);
  const [selectedExtraServiceIds, setSelectedExtraServiceIds] = useState<string[]>(initial.initialExtraIds);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>(initial.initialAddonIds);
  const [pinnedStaffId, setPinnedStaffId] = useState(initial.initialPinnedStaff);
  const [layoutView, setLayoutView] = useState<ScheduleLayout>(initial.initialLayout);
  const [timeFormat, setTimeFormat] = useState<'12h' | '24h'>('12h');
  const [windowStartDate, setWindowStartDate] = useState(initial.initialDate);
  const [selectedDate, setSelectedDate] = useState(initial.initialDate);

  const [initialContact] = useState(() =>
    initialClientProfile ? profileToContactFields(initialClientProfile) : null,
  );
  const [clientName, setClientName] = useState(initialContact?.clientName ?? '');
  const [clientPhone, setClientPhone] = useState(initialContact?.clientPhone ?? '');
  const [clientInstagram, setClientInstagram] = useState(initialContact?.clientInstagram ?? '');
  const [clientEmail, setClientEmail] = useState(initialContact?.clientEmail ?? '');
  const [clientBirthday, setClientBirthday] = useState(initialContact?.clientBirthday ?? '');
  const [clientNotes, setClientNotes] = useState(
    initialInspoNote ? `Referencia de galería: ${initialInspoNote}` : '',
  );
  const [inspoFile, setInspoFile] = useState<File | null>(null);
  const [inspoDataUrl, setInspoDataUrl] = useState<string | null>(null);
  const [proofDeliveryMethod, setProofDeliveryMethod] = useState<ProofDeliveryMethod>('web_upload');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofDataUrl, setProofDataUrl] = useState<string | null>(null);

  const selectedService = useMemo(
    () => services.find((s) => s.id === selectedServiceId) ?? services[0],
    [services, selectedServiceId],
  );
  const combos = useMemo(
    () =>
      buildServiceComboOptions({
        primary: selectedService,
        services,
        categories,
        allAddons: addons.filter((addon) => addon.isActive),
        selectedExtraIds: selectedExtraServiceIds,
      }),
    [selectedService, services, categories, addons, selectedExtraServiceIds],
  );
  const selectedExtraServices = combos.selectedExtraServices;
  const selectedServiceIdSet = useMemo(() => {
    const ids = selectedExtraServices.map((srv) => srv.id);
    if (selectedService) ids.push(selectedService.id);
    return new Set(ids);
  }, [selectedService, selectedExtraServices]);
  const extraServices = combos.extraServices;
  const compatibleAddons = useMemo(
    () =>
      selectedService
        ? filterRedundantAddons(
            addons.filter((a) => a.appliesToAll || a.serviceIds.some((id) => selectedServiceIdSet.has(id))),
            [selectedService, ...selectedExtraServices],
          )
        : [],
    [addons, selectedService, selectedExtraServices, selectedServiceIdSet],
  );
  const hasExtrasOptions = compatibleAddons.length > 0 || extraServices.length > 0;
  const activeSelectedAddons = useMemo(
    () => compatibleAddons.filter((a) => selectedAddonIds.includes(a.id)),
    [compatibleAddons, selectedAddonIds],
  );
  const eligibleStaff = useMemo(() => {
    if (!selectedService) return staff;
    const requiredIds = Array.from(selectedServiceIdSet);
    return staff.filter(
      (member) => member.serviceIds.length === 0 || requiredIds.every((id) => member.serviceIds.includes(id)),
    );
  }, [staff, selectedService, selectedServiceIdSet]);

  const isPinned = pinnedStaffId !== 'any';
  const pinnedStaff = isPinned ? (staff.find((m) => m.id === pinnedStaffId) ?? null) : null;
  const pinnedStaffSchedule = pinnedStaff ? getStaffScheduleLabel(pinnedStaff, timeFormat) : null;
  const skipsStaffStep = isPinned || eligibleStaff.length <= 1;

  const totalDurationMinutes = useMemo(() => {
    if (!selectedService) return 0;
    return (
      selectedService.durationMinutes +
      selectedExtraServices.reduce((sum, srv) => sum + srv.durationMinutes, 0) +
      activeSelectedAddons.reduce((sum, a) => sum + a.extraMinutes, 0)
    );
  }, [selectedService, selectedExtraServices, activeSelectedAddons]);

  const subtotalCents = useMemo(() => {
    if (!selectedService) return 0;
    return (
      selectedService.priceCents +
      selectedExtraServices.reduce((sum, srv) => sum + srv.priceCents, 0) +
      activeSelectedAddons.reduce((sum, a) => sum + a.extraPriceCents, 0)
    );
  }, [selectedService, selectedExtraServices, activeSelectedAddons]);

  const hasStartingPrice = Boolean(
    selectedService?.isStartingPrice || selectedExtraServices.some((srv) => srv.isStartingPrice),
  );
  const depositAmountCents = useMemo(
    () => resolveDepositAmountCents(settings, selectedService, selectedExtraServices),
    [settings, selectedService, selectedExtraServices],
  );
  const showsDeposit = hasConfiguredDeposit(settings, depositAmountCents);
  const activeExtraServiceIds = useMemo(
    () => selectedExtraServices.map((srv) => srv.id),
    [selectedExtraServices],
  );
  const activeAddonIds = useMemo(() => activeSelectedAddons.map((a) => a.id), [activeSelectedAddons]);

  const maxAllowedDateKey = useMemo(
    () => shiftPlainDateKey(initialTodayKey, Math.max(35, settings.maxBookingDaysAhead || 45)),
    [initialTodayKey, settings.maxBookingDaysAhead],
  );
  const nextMonthStartKey = useMemo(() => {
    const base = selectedDate >= windowStartDate ? selectedDate : windowStartDate;
    const candidate = getNextMonthStartKey(base);
    return candidate > windowStartDate ? candidate : shiftPlainDateKey(windowStartDate, 30);
  }, [selectedDate, windowStartDate]);
  const canAdvanceMonth = nextMonthStartKey <= maxAllowedDateKey;

  const clientForm = {
    clientName,
    clientPhone,
    clientInstagram,
    clientEmail,
    clientBirthday,
    clientNotes,
    inspoFile,
    inspoDataUrl,
    proofDeliveryMethod,
    proofFile,
    proofDataUrl,
    onChangeClientName: setClientName,
    onChangeClientPhone: (value: string) => setClientPhone(formatMxPhoneDisplay(value)),
    onChangeClientInstagram: setClientInstagram,
    onChangeClientEmail: setClientEmail,
    onChangeClientBirthday: (value: string) => setClientBirthday(formatBirthdayInput(value)),
    onChangeClientNotes: setClientNotes,
    onChangeInspoFile: (file: File | null, dataUrl: string | null) => {
      setInspoFile(file);
      setInspoDataUrl(dataUrl);
    },
    onChangeProofMethod: setProofDeliveryMethod,
    onChangeProofFile: (file: File | null, dataUrl: string | null) => {
      setProofFile(file);
      setProofDataUrl(dataUrl);
    },
  };

  const selectDateWithinWindow = (
    nextDate: string,
    loadedStart: string | undefined,
    loadedEnd: string | undefined,
  ) => {
    setSelectedDate(nextDate);
    if (loadedEnd && nextDate > loadedEnd && nextDate <= maxAllowedDateKey && nextDate !== windowStartDate) {
      setWindowStartDate(nextDate);
    } else if (loadedStart && nextDate < loadedStart && nextDate >= initialTodayKey && nextDate !== windowStartDate) {
      setWindowStartDate(nextDate);
    }
  };

  const nextExtraServiceIds = (serviceId: string, checked: boolean) =>
    toggleExtraServiceInZone({
      selectedIds: selectedExtraServices.map((srv) => srv.id),
      serviceId,
      checked,
      zoneById: combos.zoneById,
    });

  const advanceMonthWindow = (loadingAvail: boolean) => {
    if (!canAdvanceMonth || loadingAvail || nextMonthStartKey === windowStartDate) return;
    setWindowStartDate(nextMonthStartKey);
    setSelectedDate(nextMonthStartKey);
  };

  const returnToTodayWindow = (loadingAvail: boolean) => {
    if (loadingAvail || windowStartDate === initialTodayKey) return;
    setWindowStartDate(initialTodayKey);
    setSelectedDate(initialTodayKey);
  };

  return {
    selectedServiceId,
    setSelectedServiceId,
    selectedExtraServiceIds,
    setSelectedExtraServiceIds,
    selectedAddonIds,
    setSelectedAddonIds,
    pinnedStaffId,
    setPinnedStaffId,
    layoutView,
    setLayoutView,
    timeFormat,
    setTimeFormat,
    windowStartDate,
    selectedDate,
    selectDateWithinWindow,
    nextExtraServiceIds,
    advanceMonthWindow,
    returnToTodayWindow,
    selectedService,
    selectedExtraServices,
    extraServices,
    compatibleAddons,
    hasExtrasOptions,
    activeSelectedAddons,
    eligibleStaff,
    isPinned,
    pinnedStaff,
    pinnedStaffSchedule,
    skipsStaffStep,
    totalDurationMinutes,
    subtotalCents,
    hasStartingPrice,
    depositAmountCents,
    showsDeposit,
    activeExtraServiceIds,
    activeAddonIds,
    nextMonthStartKey,
    canAdvanceMonth,
    clientForm,
  };
}

export type BookingSelectionState = ReturnType<typeof useBookingSelectionState>;
