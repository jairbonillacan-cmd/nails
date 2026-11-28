import type { AvailableSlot, DayAvailabilitySummary } from '@/lib/availability/engine';
import {
  formatDateLongInTimezone,
  formatDateShortInTimezone,
  formatDuration,
  getDateKeyInTimezone,
} from '@/lib/format';
import type { PublicServiceDTO, PublicSettingsDTO, PublicStaffDTO } from '@/lib/public-dto';
import type { BookingLayoutView, ServiceAddon } from '@/lib/types';
import type { SummaryRow } from './BookingSummaryCard';
import type { ScheduleLayout } from './ScheduleCalendarView';
import { isPostHoldStep, type BookingFlowState, type BookingStep } from './bookingMachine';

export type BookingTopNoticeKind = 'offer' | 'draft' | 'repeat' | null;

export function resolveTopBookingNotice(input: {
  hasWaitlistOffer: boolean;
  hasRestoredDraft: boolean;
  canShowRepeat: boolean;
}): BookingTopNoticeKind {
  if (input.hasWaitlistOffer) return 'offer';
  if (input.hasRestoredDraft) return 'draft';
  if (input.canShowRepeat) return 'repeat';
  return null;
}

function shouldSkipStaffStepForSlot(input: {
  skipsStaffStep: boolean;
  slot: AvailableSlot | null;
}): boolean {
  if (input.skipsStaffStep) return true;
  if (!input.slot) return false;
  return input.slot.availableStaffIds.length <= 1;
}

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

function toScheduleLayout(view: BookingLayoutView | undefined): ScheduleLayout {
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
  if (flow.holdError?.message) return flow.holdError.message;
  if (flow.conflict?.message) {
    return flow.conflict.kind === 'expired'
      ? flow.conflict.message
      : `Horario recién ocupado. ${flow.conflict.message}`;
  }
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
  skipsStaffStep?: boolean;
  totalDurationMinutes: number;
}): SummaryRow[] {
  const slot = input.flow.selectedSlot;
  const slotTime = slot ? (input.timeFormat === '24h' ? slot.localTime24 : slot.localTime12) : '';
  const staffDecided = Boolean(slot) && (input.flow.step === 'staff' || isPostHoldStep(input.flow.step));
  const autoAssignedStaff =
    Boolean(slot) &&
    shouldSkipStaffStepForSlot({
      skipsStaffStep: Boolean(input.skipsStaffStep),
      slot,
    });
  const hasService = Boolean(input.selectedService);
  return [
    {
      key: 'service',
      label: 'Servicio',
      value: hasService
        ? [input.selectedService?.name, ...input.selectedExtraServices.map((srv) => srv.name)]
            .filter(Boolean)
            .join(' + ')
        : 'Elige un servicio',
      sub: hasService
        ? input.activeSelectedAddons.map((a) => a.name).join(' · ') || 'Sin extras'
        : 'Aún sin seleccionar',
      mark: '1',
      isDone: hasService,
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
      label: 'Profesional',
      value: !staffDecided
        ? 'Por elegir'
        : input.chosenStaffId === 'any' && !input.isPinned && !autoAssignedStaff
          ? 'Cualquier profesional'
          : autoAssignedStaff && slot
            ? `Te atiende ${slot.staffName}`
            : (slot?.staffName ?? 'Por elegir'),
      sub:
        staffDecided && input.chosenStaffId === 'any' && !input.isPinned && !autoAssignedStaff && slot
          ? `Te atiende ${slot.staffName}`
          : staffDecided && autoAssignedStaff && !input.isPinned && slot
            ? 'Única profesional libre en este horario'
            : null,
      mark: '3',
      isDone: staffDecided,
    },
    {
      key: 'duration',
      label: 'Duración',
      value: input.totalDurationMinutes > 0 ? formatDuration(input.totalDurationMinutes) : 'Por definir',
      sub: null,
      mark: 'clock',
      isDone: input.totalDurationMinutes > 0,
    },
  ];
}

export function computeStepNavigation(input: {
  flow: BookingFlowState;
  hasSelectedService: boolean;
  requiresConfirmation: boolean;
  totalDurationMinutes: number;
  extrasSelectedCount: number;
  chosenStaffId: string;
  skipsStaffStep?: boolean;
  showsDeposit: boolean;
}) {
  const { flow } = input;
  const step = flow.step;
  const hasSlot = Boolean(flow.selectedSlot);
  const skipStaff = shouldSkipStaffStepForSlot({
    skipsStaffStep: Boolean(input.skipsStaffStep),
    slot: flow.selectedSlot,
  });

  const completedSteps = new Set<BookingStep>();
  if (input.hasSelectedService) completedSteps.add('service');
  if (hasSlot) completedSteps.add('schedule');
  if (hasSlot && isPostHoldStep(step)) completedSteps.add('staff');

  const skippedSteps = new Set<BookingStep>();
  if (skipStaff) skippedSteps.add('staff');

  const backTarget: BookingStep | null =
    step === 'details'
      ? skipStaff
        ? 'schedule'
        : 'staff'
      : step === 'staff'
        ? 'schedule'
        : step === 'schedule'
          ? 'service'
          : null;

  const canContinue =
    step === 'service'
      ? input.hasSelectedService
      : step === 'schedule' || step === 'staff'
        ? hasSlot
        : hasSlot && !flow.holdExpired;

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
      ? !input.hasSelectedService
        ? 'Elige un servicio'
        : input.extrasSelectedCount > 0
          ? `${input.extrasSelectedCount} extra${input.extrasSelectedCount > 1 ? 's' : ''} · ${formatDuration(input.totalDurationMinutes)}`
          : `${formatDuration(input.totalDurationMinutes)} en total`
      : step === 'schedule'
        ? hasSlot
          ? 'Horario apartado'
          : 'Elige un horario'
        : step === 'staff'
          ? input.chosenStaffId === 'any'
            ? 'Cualquier profesional'
            : ''
          : flow.holdExpired
            ? 'Reverifica tu horario arriba'
            : flow.phase === 'confirmed'
              ? ''
              : flow.phase === 'submitting'
                ? 'Guardando tu reserva…'
                : input.showsDeposit
                  ? 'Subes tu comprobante desde tu link'
                  : '';

  return { completedSteps, skippedSteps, skipStaff, backTarget, canContinue, nextLabel, nextHint };
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
  initialSlot?: string;
  initialLayout?: BookingLayoutView;
}) {
  const initialService = input.initialServiceSlug
    ? (input.services.find((s) => s.slug === input.initialServiceSlug) ?? null)
    : null;
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

  const slotDerivedDate = (() => {
    const rawSlot = input.initialSlot?.trim();
    if (!rawSlot) return null;
    const ms = Date.parse(rawSlot);
    if (!Number.isFinite(ms)) return null;
    return getDateKeyInTimezone(new Date(ms), input.settings.timezone || 'America/Mexico_City');
  })();

  const initialDate =
    input.initialDate && input.initialDate >= input.initialTodayKey
      ? input.initialDate
      : slotDerivedDate && slotDerivedDate >= input.initialTodayKey
        ? slotDerivedDate
        : input.initialTodayKey;

  const enabledLayoutsRaw = Array.from(
    new Set(input.settings.enabledBookingLayouts.map((view) => toScheduleLayout(view))),
  );
  const enabledScheduleLayouts: ScheduleLayout[] =
    enabledLayoutsRaw.length > 0 ? enabledLayoutsRaw : ['month', 'week'];
  const configuredDefault = toScheduleLayout(input.settings.defaultBookingLayout);
  const defaultScheduleLayout: ScheduleLayout = enabledScheduleLayouts.includes(configuredDefault)
    ? configuredDefault
    : (enabledScheduleLayouts[0] ?? 'month');
  const requestedLayout = input.initialLayout ? toScheduleLayout(input.initialLayout) : null;
  const initialLayoutOverride: ScheduleLayout | null =
    requestedLayout && enabledScheduleLayouts.includes(requestedLayout) ? requestedLayout : null;

  return {
    initialServiceId: initialService?.id ?? '',
    initialPinnedStaff,
    initialExtraIds,
    initialAddonIds,
    initialDate,
    enabledScheduleLayouts,
    defaultScheduleLayout,
    initialLayoutOverride,
  };
}
