import type { PublicSettingsDTO } from './public-dto';
import type { LandingFaqItem, LandingSectionToggles, SalonSettings } from './types';

export interface ResolvedLandingSections {
  showMarquee: boolean;
  showHeroRating: boolean;
  showMenu: boolean;
  showCreations: boolean;
  showReviews: boolean;
  showTeam: boolean;
  showConnect: boolean;
  showFaq: boolean;
  showVisit: boolean;
  showMapEmbed: boolean;
}

export interface ResolvedLandingConfig {
  heroTitle: string;
  heroSubtitle: string;
  heroPrimaryCta: string;
  heroSecondaryCta: string;
  heroImageDesktopUrl: string;
  heroImageMobileUrl: string;
  customLogoUrl: string | null;
  marqueeItems: string[];
  menuTitle: string;
  menuBannerText: string | null;
  creationsTitle: string;
  creationsSubtitle: string;
  galleryMode: 'mix' | 'custom_only';
  reviewsTitle: string;
  reviewsSubtitle: string;
  teamTitle: string;
  teamSubtitle: string;
  connectTitle: string;
  connectSubtitle: string;
  faqTitle: string;
  faqSubtitle: string;
  customFaqs: LandingFaqItem[];
  visitTitle: string;
  visitHoursDays: string;
  visitHoursText: string;
  sections: ResolvedLandingSections;
}

export const DEFAULT_HERO_DESKTOP_IMAGE = '/landing/hero-escritorio.webp';
export const DEFAULT_HERO_MOBILE_IMAGE = '/landing/hero-movil.webp';

const DEFAULT_LANDING_SECTIONS: ResolvedLandingSections = {
  showMarquee: true,
  showHeroRating: true,
  showMenu: true,
  showCreations: true,
  showReviews: true,
  showTeam: true,
  showConnect: true,
  showFaq: true,
  showVisit: true,
  showMapEmbed: true,
};

const SAFE_BRAND_MEDIA_RE =
  /^\/(?:landing|brand|gallery|api\/media\/gallery)\/[a-zA-Z0-9._/-]+\.(?:webp|png|jpe?g|avif|svg)$/i;

export function isSafeBrandMediaPath(value: string | null | undefined): boolean {
  const trimmed = value?.trim() ?? '';
  if (!trimmed || trimmed.includes('..') || trimmed.includes('\\')) {
    return false;
  }
  return SAFE_BRAND_MEDIA_RE.test(trimmed);
}

function resolveSafeBrandImage(
  candidate: string | null | undefined,
  fallback: string,
): string {
  const trimmed = candidate?.trim() ?? '';
  if (isSafeBrandMediaPath(trimmed)) {
    return trimmed;
  }
  return fallback;
}

function resolveLandingSections(
  sections?: LandingSectionToggles,
): ResolvedLandingSections {
  return {
    showMarquee: sections?.showMarquee ?? DEFAULT_LANDING_SECTIONS.showMarquee,
    showHeroRating: sections?.showHeroRating ?? DEFAULT_LANDING_SECTIONS.showHeroRating,
    showMenu: sections?.showMenu ?? DEFAULT_LANDING_SECTIONS.showMenu,
    showCreations: sections?.showCreations ?? DEFAULT_LANDING_SECTIONS.showCreations,
    showReviews: sections?.showReviews ?? DEFAULT_LANDING_SECTIONS.showReviews,
    showTeam: sections?.showTeam ?? DEFAULT_LANDING_SECTIONS.showTeam,
    showConnect: sections?.showConnect ?? DEFAULT_LANDING_SECTIONS.showConnect,
    showFaq: sections?.showFaq ?? DEFAULT_LANDING_SECTIONS.showFaq,
    showVisit: sections?.showVisit ?? DEFAULT_LANDING_SECTIONS.showVisit,
    showMapEmbed: sections?.showMapEmbed ?? DEFAULT_LANDING_SECTIONS.showMapEmbed,
  };
}

function cleanText(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : fallback;
}

export function resolveLandingContent(
  settings: Pick<
    SalonSettings | PublicSettingsDTO,
    'city' | 'logoUrl' | 'coverImageUrl' | 'landingContent'
  >,
): ResolvedLandingConfig {
  const content = settings.landingContent;
  const cityLabel = settings.city?.trim() || 'Puebla';
  const customLogo = settings.logoUrl?.trim() ?? '';
  const desktopCandidate = content.heroImageDesktopUrl ?? settings.coverImageUrl;
  const heroImageDesktopUrl = resolveSafeBrandImage(
    desktopCandidate,
    DEFAULT_HERO_DESKTOP_IMAGE,
  );
  const mobileCandidate =
    content.heroImageMobileUrl?.trim() ||
    (isSafeBrandMediaPath(desktopCandidate) ? desktopCandidate : null);
  const heroImageMobileUrl = resolveSafeBrandImage(
    mobileCandidate,
    DEFAULT_HERO_MOBILE_IMAGE,
  );

  const marqueeItems = (content.marqueeItems ?? [])
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 8);

  const customFaqs = (content.customFaqs ?? [])
    .map((item) => ({
      id: item.id.trim(),
      question: item.question.trim(),
      answer: item.answer.trim(),
    }))
    .filter((item) => item.id.length > 0 && item.question.length > 0 && item.answer.length > 0)
    .slice(0, 12);

  return {
    heroTitle: cleanText(content.heroTitle, 'El arte está en tus uñas'),
    heroSubtitle: cleanText(
      content.heroSubtitle,
      `Acrílico escultural, Softgel y Rubber en ${cityLabel}. Tú traes la idea.`,
    ),
    heroPrimaryCta: cleanText(content.heroPrimaryCta, 'Agendar cita'),
    heroSecondaryCta: cleanText(content.heroSecondaryCta, 'Ver creaciones'),
    heroImageDesktopUrl,
    heroImageMobileUrl,
    customLogoUrl: isSafeBrandMediaPath(customLogo) ? customLogo : null,
    marqueeItems,
    menuTitle: cleanText(content.menuTitle, 'El menú'),
    menuBannerText: content.menuBannerText?.trim() || null,
    creationsTitle: cleanText(content.creationsTitle, 'Algunas de nuestras creaciones'),
    creationsSubtitle: cleanText(
      content.creationsSubtitle,
      'Del french minimal al 3D con charms. Toca cualquier set para apartarlo.',
    ),
    galleryMode: content.galleryMode === 'custom_only' ? 'custom_only' : 'mix',
    reviewsTitle: cleanText(content.reviewsTitle, 'De tu idea a tus uñas'),
    reviewsSubtitle: cleanText(
      content.reviewsSubtitle,
      'Opiniones verificadas de clientas que ya salieron con su set.',
    ),
    teamTitle: cleanText(content.teamTitle, 'Elige a tu profesional'),
    teamSubtitle: cleanText(
      content.teamSubtitle,
      'Una clienta por bloque. Toca un perfil para ver turnos, servicios y portafolio.',
    ),
    connectTitle: cleanText(content.connectTitle, 'Conectemos'),
    connectSubtitle: cleanText(
      content.connectSubtitle,
      'Sets nuevos cada semana. Guarda tu favorito y tráelo a tu cita.',
    ),
    faqTitle: cleanText(content.faqTitle, 'Preguntas frecuentes'),
    faqSubtitle: cleanText(
      content.faqSubtitle,
      'Lo que más nos preguntan antes de tu primera cita.',
    ),
    customFaqs,
    visitTitle: cleanText(content.visitTitle, 'Visítanos'),
    visitHoursDays: cleanText(content.visitHoursDays, 'Lunes a sábado'),
    visitHoursText: cleanText(content.visitHoursText, 'Citas de 10:00 a 6:00 · Solo con cita'),
    sections: resolveLandingSections(content.sections),
  };
}
