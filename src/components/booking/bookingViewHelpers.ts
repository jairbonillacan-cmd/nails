import type { DayAvailabilitySummary } from '@/lib/availability/engine';
import {
  formatDateLongInTimezone,
  formatDateShortInTimezone,
  formatDuration,
} from '@/lib/format';
import type { PublicServiceDTO, PublicSettingsDTO, PublicStaffDTO } from '@/lib/public-dto';
import type { BookingLayoutView, ServiceAddon } from '@/lib/types';
import type { SummaryRow } from './BookingSummaryCard';
import type { ScheduleLayout } from './ScheduleCalendarView';
import type { ProofDeliveryMethod } from './bookingHelpers';
import { BOOKING_STEPS, type BookingFlowState, type BookingStep } from './bookingMachine';

export function shiftPlainDateKey(dateKey: string, deltaDays: number): string {
  const parts = dateKey.split('-').map(Number);
  const dt = new Date(
    Date.UTC(parts[0] ?? 2026, (parts[1] ?? 1) - 1, (parts[2] ?? 1) + deltaDays, 12, 0, 0),
  );
  return dt.toISOString().slice(0, 10);
}

export function getNextMonthStartKey(dateKey: string): string {
  const parts = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(parts[0] ?? 2026, parts[1] ?? 1, 1, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

export function toScheduleLayout(view: BookingLayoutView | undefined): ScheduleLayout {
  return view === 'week' || view === 'column' ? 'week' : 'month';
}

export function buildIdempotencyKey(suffixSeed: string): string {
  const randomSuffix =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${suffixSeed}`;
  return `idem-${randomSuffix}`;
}

export function buildLiveAnnouncement(input: {
  flow: BookingFlowState;
  holdRemainingSec: number;
  holdTotalSec: number;
  slotHoldMinutes: number;
  realtimeMessage: string | null;
  loadingAvail: boolean;
  selectedDaySummary: DayAvailabilitySummary | null;
  timezone: string;
}): string {
  const { flow, holdRemainingSec, holdTotalSec, slotHoldMinutes, realtimeMessage, loadingAvail, selectedDaySummary, timezone } = input;
  if (flow.holdExpired && flow.holdExpiredMessage) return flow.holdExpiredMessage;
  if (flow.conflict?.message) return `Horario recién ocupado. ${flow.conflict.message}`;
  if (flow.formErrorCode === 'MAX_ACTIVE_BOOKINGS' && flow.formError) {
    return `Límite de citas activas alcanzado. ${flow.formError}`;
  }
  if (holdRemainingSec === holdTotalSec) {
    return `Horario apartado por ${slotHoldMinutes || 5} minutos mientras terminas.`;
  }
  if (holdRemainingSec === 60) return 'Te queda 1 minuto para terminar tu reserva.';
  if (holdRemainingSec === 30) return 'Te quedan 30 segundos para terminar tu reserva.';
  if (holdRemainingSec === 10) return 'Te quedan 10 segundos de apartado.';
  if (realtimeMessage) return realtimeMessage;
  if (flow.step === 'schedule' && !loadingAvail && selectedDaySummary) {
    const dateLabel = formatDateShortInTimezone(`${selectedDaySummary.date}T18:00:00Z`, timezone);
    return selectedDaySummary.slotCount > 0
      ? `${selectedDaySummary.slotCount} horarios disponibles para ${dateLabel}.`
      : `Sin horarios disponibles para ${dateLabel}.`;
  }
  return '';
}

export function buildSummaryRows(input: {
  selectedService: PublicServiceDTO | undefined;
  selectedExtraServices: readonly PublicServiceDTO[];
  activeSelectedAddons: readonly ServiceAddon[];
  flow: BookingFlowState;
  timeFormat: '12h' | '24h';
  timezone: string;
  address: string;
  chosenStaffId: string;
  isPinned: boolean;
  skipsStaffForSlot: boolean;
  totalDurationMinutes: number;
}): SummaryRow[] {
  const slot = input.flow.selectedSlot;
  const slotTime = slot ? (input.timeFormat === '24h' ? slot.localTime24 : slot.localTime12) : '';
  const staffDecided = Boolean(slot) && (input.skipsStaffForSlot || input.flow.step === 'details');
  return [
    {
      key: 'service',
      label: 'Servicio',
      value: [input.selectedService?.name, ...input.selectedExtraServices.map((srv) => srv.name)]
        .filter(Boolean)
        .join(' + '),
      sub: input.activeSelectedAddons.map((a) => a.name).join(' · ') || 'Sin extras',
      mark: '1',
      isDone: true,
    },
    {
      key: 'when',
      label: 'Cuándo',
      value: slot ? `${formatDateLongInTimezone(slot.startAt, input.timezone)} · ${slotTime}` : 'Por elegir',
      sub: slot ? input.address : null,
      mark: '2',
      isDone: Boolean(slot) && !input.flow.holdExpired,
    },
    {
      key: 'staff',
      label: 'Artista',
      value: !staffDecided
        ? 'Por elegir'
        : input.chosenStaffId === 'any' && !input.isPinned
          ? 'Me da igual'
          : (slot?.staffName ?? 'Por elegir'),
      sub:
        staffDecided && input.chosenStaffId === 'any' && !input.isPinned && slot
          ? `Te atiende ${slot.staffName}`
          : null,
      mark: '3',
      isDone: staffDecided,
    },
    {
      key: 'duration',
      label: 'Duración',
      value: formatDuration(input.totalDurationMinutes),
      sub: null,
      mark: 'clock',
      isDone: true,
    },
  ];
}

export function computeStepNavigation(input: {
  flow: BookingFlowState;
  hasExtrasOptions: boolean;
  hasSelectedService: boolean;
  requiresConfirmation: boolean;
  skipsStaffForSlot: boolean;
  totalDurationMinutes: number;
  extrasSelectedCount: number;
  chosenStaffId: string;
  isSubmittingBooking: boolean;
  showsDeposit: boolean;
  proofDataUrl: string | null;
  proofDeliveryMethod: ProofDeliveryMethod;
}) {
  const { flow, hasExtrasOptions, skipsStaffForSlot } = input;
  const step = flow.step;
  const stepIndex = BOOKING_STEPS.indexOf(step);
  const hasSlot = Boolean(flow.selectedSlot);

  const completedSteps = new Set<BookingStep>(['service']);
  if (stepIndex > BOOKING_STEPS.indexOf('extras') || !hasExtrasOptions) {
    completedSteps.add('extras');
  }
  if (hasSlot) completedSteps.add('schedule');
  if (hasSlot && (skipsStaffForSlot || step === 'details')) completedSteps.add('staff');

  const backTarget: BookingStep | null =
    step === 'details'
      ? skipsStaffForSlot
        ? 'schedule'
        : 'staff'
      : step === 'staff'
        ? 'schedule'
        : step === 'schedule'
          ? hasExtrasOptions
            ? 'extras'
            : 'service'
          : step === 'extras'
            ? 'service'
            : null;

  const canContinue =
    step === 'service' || step === 'extras'
      ? input.hasSelectedService
      : step === 'schedule' || step === 'staff'
        ? hasSlot
        : !flow.holdExpired;

  const nextLabel =
    step === 'details'
      ? flow.phase === 'confirmed'
        ? 'Abriendo tu cita…'
        : flow.phase === 'submitting'
          ? 'Apartando tu cita...'
          : input.showsDeposit || input.requiresConfirmation
            ? 'Apartar mi cita'
            : 'Confirmar cita'
      : 'Continuar';

  const nextHint =
    step === 'service'
      ? `${formatDuration(input.totalDurationMinutes)} en total`
      : step === 'extras'
        ? input.extrasSelectedCount > 0
          ? `${input.extrasSelectedCount} extra${input.extrasSelectedCount > 1 ? 's' : ''} · ${formatDuration(input.totalDurationMinutes)}`
          : 'Paso opcional · Sin extras'
        : step === 'schedule'
          ? hasSlot
            ? 'Horario apartado'
            : 'Elige un horario'
          : step === 'staff'
            ? input.chosenStaffId === 'any'
              ? 'Te asignamos a quien esté libre'
              : ''
            : flow.holdExpired
              ? 'Reverifica tu horario arriba'
              : input.isSubmittingBooking
                ? 'Guardando tu reserva…'
                : input.showsDeposit && input.proofDataUrl && input.proofDeliveryMethod !== 'instagram_dm'
                  ? 'Comprobante listo para enviar'
                  : input.showsDeposit && input.proofDeliveryMethod === 'instagram_dm'
                    ? 'Envías tu anticipo por Instagram DM'
                    : input.showsDeposit
                      ? 'Después subes tu anticipo'
                      : '';

  return { completedSteps, backTarget, canContinue, nextLabel, nextHint };
}

export function resolveInitialBookingSelections(input: {
  settings: PublicSettingsDTO;
  services: readonly PublicServiceDTO[];
  addons: readonly ServiceAddon[];
  staff: readonly PublicStaffDTO[];
  initialTodayKey: string;
  initialServiceSlug?: string;
  initialExtraServiceSlugs?: string[];
  initialAddonIds?: string[];
  initialStaffSlug?: string;
  initialDate?: string;
  initialLayout?: BookingLayoutView;
}) {
  const initialService =
    input.services.find((s) => s.slug === input.initialServiceSlug) ?? input.services[0] ?? null;
  const initialPinnedStaff =
    input.staff.length === 1 && input.staff[0]
      ? input.staff[0].id
      : (input.staff.find(
          (member) =>
            member.bookingSlug === input.initialStaffSlug || member.id === input.initialStaffSlug,
        )?.id ?? 'any');

  const primaryId = initialService?.id ?? '';
  const initialExtraIds = input.initialExtraServiceSlugs?.length
    ? Array.from(
        new Set(
          input.initialExtraServiceSlugs
            .map((token) => input.services.find((srv) => srv.slug === token || srv.id === token)?.id)
            .filter((id): id is string => Boolean(id) && id !== primaryId),
        ),
      ).slice(0, 8)
    : [];

  const activeAddonIds = new Set(input.addons.map((addon) => addon.id));
  const initialAddonIds = input.initialAddonIds?.length
    ? Array.from(new Set(input.initialAddonIds.filter((id) => activeAddonIds.has(id))))
    : [];

  const initialDate =
    input.initialDate && input.initialDate >= input.initialTodayKey
      ? input.initialDate
      : input.initialTodayKey;

  const initialLayout = toScheduleLayout(
    input.initialLayout &&
      (input.settings.enabledBookingLayouts.length === 0 ||
        input.settings.enabledBookingLayouts.includes(input.initialLayout))
      ? input.initialLayout
      : input.settings.defaultBookingLayout,
  );

  return {
    initialServiceId: initialService?.id ?? '',
    initialPinnedStaff,
    initialExtraIds,
    initialAddonIds,
    initialDate,
    initialLayout,
  };
}
