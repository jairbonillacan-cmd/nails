import { formatCurrency } from '@/lib/format';
import { resolveLandingContent } from '@/lib/landing-config';
import type { MetricTileItem } from '@/components/ui';
import type { LandingContent, LoyaltyProgram, SalonSettings, Service } from '@/lib/types';

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

function serializeLandingContent(content: LandingContent): string {
  return JSON.stringify({
    heroEyebrow: content.heroEyebrow ?? '',
    heroTitle: content.heroTitle ?? '',
    heroSubtitle: content.heroSubtitle ?? '',
    aboutTitle: content.aboutTitle ?? '',
    aboutBody: content.aboutBody ?? '',
    heroPrimaryCta: content.heroPrimaryCta ?? '',
    heroSecondaryCta: content.heroSecondaryCta ?? '',
    heroImageDesktopUrl: content.heroImageDesktopUrl ?? null,
    heroImageMobileUrl: content.heroImageMobileUrl ?? null,
    marqueeItems: content.marqueeItems ?? [],
    menuTitle: content.menuTitle ?? '',
    menuBannerText: content.menuBannerText ?? '',
    creationsTitle: content.creationsTitle ?? '',
    creationsSubtitle: content.creationsSubtitle ?? '',
    galleryMode: content.galleryMode ?? 'mix',
    reviewsTitle: content.reviewsTitle ?? '',
    reviewsSubtitle: content.reviewsSubtitle ?? '',
    teamTitle: content.teamTitle ?? '',
    teamSubtitle: content.teamSubtitle ?? '',
    connectTitle: content.connectTitle ?? '',
    connectSubtitle: content.connectSubtitle ?? '',
    faqTitle: content.faqTitle ?? '',
    faqSubtitle: content.faqSubtitle ?? '',
    customFaqs: (content.customFaqs ?? []).map((item) => ({
      id: item.id,
      question: item.question,
      answer: item.answer,
    })),
    visitTitle: content.visitTitle ?? '',
    visitHoursDays: content.visitHoursDays ?? '',
    visitHoursText: content.visitHoursText ?? '',
    sections: {
      showMarquee: content.sections?.showMarquee ?? true,
      showHeroRating: content.sections?.showHeroRating ?? true,
      showMenu: content.sections?.showMenu ?? true,
      showCreations: content.sections?.showCreations ?? true,
      showReviews: content.sections?.showReviews ?? true,
      showTeam: content.sections?.showTeam ?? true,
      showConnect: content.sections?.showConnect ?? true,
      showFaq: content.sections?.showFaq ?? true,
      showVisit: content.sections?.showVisit ?? true,
      showMapEmbed: content.sections?.showMapEmbed ?? true,
    },
  });
}

export function areSettingsEqual(a: SalonSettings, b: SalonSettings): boolean {
  return (
    a.name === b.name &&
    a.tagline === b.tagline &&
    (a.logoUrl ?? null) === (b.logoUrl ?? null) &&
    (a.coverImageUrl ?? null) === (b.coverImageUrl ?? null) &&
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
    serializeLandingContent(a.landingContent) ===
      serializeLandingContent(b.landingContent)
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

export function countVisibleLandingSections(settings: SalonSettings): number {
  const { sections } = resolveLandingContent(settings);
  const toggles = [
    sections.showMarquee,
    sections.showMenu,
    sections.showCreations,
    sections.showReviews,
    sections.showTeam,
    sections.showConnect,
    sections.showFaq,
    sections.showVisit,
  ];
  return toggles.filter(Boolean).length;
}

export function buildBrandKpis(params: {
  colorsReadable: boolean;
  isDepositEnabled: boolean;
  depositAmountCents: number;
  draft: SalonSettings;
  loyaltyDraft: LoyaltyProgram;
  customGalleryCount: number;
}): MetricTileItem[] {
  const {
    colorsReadable,
    isDepositEnabled,
    depositAmountCents,
    draft,
    loyaltyDraft,
    customGalleryCount,
  } = params;
  const visibleSections = countVisibleLandingSections(draft);
  const resolved = resolveLandingContent(draft);

  return [
    {
      id: 'sections',
      label: 'Secciones activas',
      value: `${visibleSections} de 8`,
      sub: colorsReadable ? 'Colores con buena lectura' : 'Revisa el contraste en Estilo',
      tone: colorsReadable ? 'success' : 'warning',
    },
    {
      id: 'gallery',
      label: 'Galería propia',
      value: customGalleryCount === 1 ? '1 foto' : `${customGalleryCount} fotos`,
      sub:
        resolved.galleryMode === 'custom_only'
          ? 'Mostrando solo tus fotos'
          : 'Tus fotos + galería base',
      tone: customGalleryCount > 0 ? 'accent' : 'default',
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
        : 'Actívala en Negocio',
      tone: loyaltyDraft.isActive ? 'accent' : 'default',
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
