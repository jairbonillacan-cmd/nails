import { formatCurrency } from '@/lib/format';
import type { MetricTileItem } from '@/components/ui';
import type { LoyaltyProgram, SalonSettings, Service } from '@/lib/types';

export const DEFAULT_LOYALTY_PROGRAM: LoyaltyProgram = {
  id: 'loy-laikona-default',
  isActive: true,
  name: 'Tarjeta de Sellos LAIKONA',
  stampsRequired: 8,
  rewardType: 'percent_discount',
  rewardServiceId: null,
  discountPercent: 50,
  maxDiscountCents: 25000,
  validDays: 90,
};

export function areSettingsEqual(a: SalonSettings, b: SalonSettings): boolean {
  return (
    a.name === b.name &&
    a.tagline === b.tagline &&
    a.address === b.address &&
    (a.city ?? '') === (b.city ?? '') &&
    a.mapsUrl === b.mapsUrl &&
    a.instagramHandle === b.instagramHandle &&
    (a.instagramUrl ?? '') === (b.instagramUrl ?? '') &&
    (a.sisterStudioHandle ?? '') === (b.sisterStudioHandle ?? '') &&
    a.whatsappNumber === b.whatsappNumber &&
    a.brandAccentLight === b.brandAccentLight &&
    a.brandAccentDark === b.brandAccentDark &&
    a.defaultPublicMode === b.defaultPublicMode &&
    a.cornerStyle === b.cornerStyle &&
    a.defaultBookingLayout === b.defaultBookingLayout &&
    Boolean(a.optimizeContinuousSlots) === Boolean(b.optimizeContinuousSlots) &&
    a.enableSlotHold === b.enableSlotHold &&
    a.slotHoldMinutes === b.slotHoldMinutes &&
    a.minBookingNoticeMinutes === b.minBookingNoticeMinutes &&
    a.minCancelHours === b.minCancelHours &&
    a.cancellationPolicyText === b.cancellationPolicyText &&
    a.paymentMode === b.paymentMode &&
    a.depositBankName === b.depositBankName &&
    (a.depositBeneficiary ?? a.depositAccountHolder) ===
      (b.depositBeneficiary ?? b.depositAccountHolder) &&
    a.depositClabe === b.depositClabe &&
    (a.depositAmountCents ?? 20000) === (b.depositAmountCents ?? 20000) &&
    a.depositInstructions === b.depositInstructions &&
    (a.serviceMode ?? 'studio') === (b.serviceMode ?? 'studio') &&
    (a.soundAlertsEnabled ?? true) === (b.soundAlertsEnabled ?? true) &&
    (a.lockPastBookings ?? true) === (b.lockPastBookings ?? true) &&
    (a.maxActiveBookingsPerClient ?? 3) === (b.maxActiveBookingsPerClient ?? 3) &&
    (a.privacyPolicyVersion ?? '2026-11') === (b.privacyPolicyVersion ?? '2026-11') &&
    (a.noShowDepositThreshold ?? 2) === (b.noShowDepositThreshold ?? 2) &&
    Boolean(a.ownerPinEnabled) === Boolean(b.ownerPinEnabled) &&
    a.landingContent.heroTitle === b.landingContent.heroTitle &&
    a.landingContent.heroSubtitle === b.landingContent.heroSubtitle
  );
}

export function areLoyaltyProgramsEqual(a: LoyaltyProgram, b: LoyaltyProgram): boolean {
  return (
    a.isActive === b.isActive &&
    a.name === b.name &&
    a.stampsRequired === b.stampsRequired &&
    a.rewardType === b.rewardType &&
    a.rewardServiceId === b.rewardServiceId &&
    a.discountPercent === b.discountPercent &&
    a.maxDiscountCents === b.maxDiscountCents &&
    a.validDays === b.validDays
  );
}

export function buildBrandKpis(params: {
  colorsReadable: boolean;
  isDepositEnabled: boolean;
  depositAmountCents: number;
  draft: SalonSettings;
  loyaltyDraft: LoyaltyProgram;
  hasOwnerPin: boolean;
  ownerPinEnabled: boolean;
  noShowDepositThreshold: number;
}): MetricTileItem[] {
  const {
    colorsReadable,
    isDepositEnabled,
    depositAmountCents,
    draft,
    loyaltyDraft,
    hasOwnerPin,
    ownerPinEnabled,
    noShowDepositThreshold,
  } = params;

  return [
    {
      id: 'contrast',
      label: 'Lectura de colores',
      value: colorsReadable ? 'AA óptimo' : 'Revisar',
      sub: colorsReadable ? 'Claro y oscuro legibles' : 'Ajusta el contraste',
      tone: colorsReadable ? 'success' : 'warning',
    },
    {
      id: 'deposit',
      label: 'Anticipo SPEI',
      value: isDepositEnabled
        ? formatCurrency(depositAmountCents, draft.currency)
        : 'Desactivado',
      sub: isDepositEnabled ? draft.depositBankName || 'Transferencia' : 'Reserva directa',
    },
    {
      id: 'loyalty',
      label: 'Tarjeta de sellos',
      value: loyaltyDraft.isActive ? `${loyaltyDraft.stampsRequired} sellos` : 'Pausada',
      sub: loyaltyDraft.isActive
        ? loyaltyDraft.rewardType === 'free_service'
          ? 'Premio: servicio gratis'
          : `Premio: ${loyaltyDraft.discountPercent ?? 50}% desc.`
        : 'Actívala abajo',
      tone: loyaltyDraft.isActive ? 'accent' : 'default',
    },
    {
      id: 'security',
      label: 'PIN de dueña',
      value: hasOwnerPin && ownerPinEnabled ? 'Activo' : hasOwnerPin ? 'Pausado' : 'Sin PIN',
      sub: `Límite faltas: ${noShowDepositThreshold}`,
      tone: hasOwnerPin && ownerPinEnabled ? 'success' : 'default',
    },
  ];
}

export function buildBrandPatchPayload(params: {
  draft: SalonSettings;
  loyaltyDraft: LoyaltyProgram;
  activeServices: Service[];
  hasOwnerPin: boolean;
}) {
  const { draft, loyaltyDraft, activeServices, hasOwnerPin } = params;
  const depositBeneficiary = draft.depositBeneficiary ?? draft.depositAccountHolder;
  const depositAmountCents = draft.depositAmountCents ?? 20000;
  const noShowDepositThreshold = draft.noShowDepositThreshold ?? 2;

  return {
    ...draft,
    depositBeneficiary,
    depositAccountHolder: depositBeneficiary,
    depositAmountCents,
    serviceMode: draft.serviceMode ?? 'studio',
    soundAlertsEnabled: draft.soundAlertsEnabled ?? true,
    lockPastBookings: draft.lockPastBookings ?? true,
    optimizeContinuousSlots: draft.optimizeContinuousSlots ?? false,
    maxActiveBookingsPerClient: draft.maxActiveBookingsPerClient ?? 3,
    privacyPolicyVersion: (draft.privacyPolicyVersion ?? '2026-11').trim() || '2026-11',
    noShowDepositThreshold: Math.max(1, Math.min(5, Math.round(noShowDepositThreshold))),
    ownerPinEnabled: hasOwnerPin ? Boolean(draft.ownerPinEnabled) : false,
    loyaltyProgram: {
      id: loyaltyDraft.id,
      isActive: loyaltyDraft.isActive,
      name: loyaltyDraft.name.trim() || DEFAULT_LOYALTY_PROGRAM.name,
      stampsRequired: Math.max(3, Math.min(10, Math.round(loyaltyDraft.stampsRequired))),
      rewardType: loyaltyDraft.rewardType,
      rewardServiceId:
        loyaltyDraft.rewardType === 'free_service'
          ? (loyaltyDraft.rewardServiceId ?? activeServices[0]?.id ?? null)
          : null,
      discountPercent:
        loyaltyDraft.rewardType === 'percent_discount'
          ? Math.max(1, Math.min(100, Math.round(loyaltyDraft.discountPercent ?? 50)))
          : null,
      maxDiscountCents:
        loyaltyDraft.rewardType === 'percent_discount'
          ? loyaltyDraft.maxDiscountCents
          : null,
      validDays: loyaltyDraft.validDays,
    },
  };
}
