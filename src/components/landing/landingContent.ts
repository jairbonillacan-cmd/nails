const SET = '/landing/sets';
const ICON = '/landing/icons';

export const LANDING_ASSETS = {
  logoWhite: '/landing/logo-blanco.svg',
  logoBlack: '/landing/logo-negro.svg',
  cherriesWhite: '/landing/cerezas-blanco.svg',
  cherriesCereza: '/landing/cerezas-cereza.svg',
  cherriesPorcelain: '/landing/cerezas-porcelana.svg',
  strokeCereza: '/landing/trazo-cereza.svg',
  strokePorcelain: '/landing/trazo-porcelana.svg',
  curvePorcelain: '/landing/curva-k-porcelana.svg',
  iconClock: `${ICON}/horario.svg`,
  iconPin: `${ICON}/ubicacion.svg`,
  iconMessage: `${ICON}/mensaje.svg`,
  iconInstagram: `${ICON}/instagram.svg`,
  iconInstagramLight: `${ICON}/instagram-marfil.svg`,
} as const;

export interface LandingCreation {
  src: string;
  title: string;
  styleTag: string;
  suggestedServiceSlug: string;
  width: number;
  height: number;
}

const OPTIMIZABLE_LOCAL_RASTER_RE =
  /^\/(?:landing|brand|gallery)\/[^?#]+\.(?:webp|png|jpe?g|avif)$/i;

export function isOptimizableLocalRasterImage(src: string): boolean {
  return OPTIMIZABLE_LOCAL_RASTER_RE.test(src.trim());
}

export const LANDING_CREATIONS: readonly LandingCreation[] = [
  {
    src: `${SET}/foto-007.webp`,
    title: 'Set editorial cereza',
    styleTag: 'Acrílico escultural',
    suggestedServiceSlug: 'unas-acrilicas',
    width: 800,
    height: 874,
  },
  {
    src: `${SET}/01-azul-joya-4x5.webp`,
    title: 'Azul joya',
    styleTag: 'Softgel con brillo',
    suggestedServiceSlug: 'unas-softgel',
    width: 800,
    height: 1000,
  },
  {
    src: `${SET}/foto-010.webp`,
    title: 'French minimal',
    styleTag: 'Base Rubber',
    suggestedServiceSlug: 'rubber',
    width: 800,
    height: 872,
  },
  {
    src: `${SET}/03-flor-coral-4x5.webp`,
    title: 'Flor coral',
    styleTag: 'Arte a mano alzada',
    suggestedServiceSlug: 'unas-softgel',
    width: 800,
    height: 1000,
  },
  {
    src: `${SET}/foto-004.webp`,
    title: 'Glazed natural',
    styleTag: 'Base Rubber',
    suggestedServiceSlug: 'rubber',
    width: 800,
    height: 874,
  },
  {
    src: `${SET}/11-estampados-mixtos-4x5.webp`,
    title: 'Estampados mixtos',
    styleTag: 'Acrílico editorial',
    suggestedServiceSlug: 'unas-acrilicas',
    width: 800,
    height: 1000,
  },
  {
    src: `${SET}/foto-013.webp`,
    title: 'Milky almendra',
    styleTag: 'Softgel natural',
    suggestedServiceSlug: 'unas-softgel',
    width: 800,
    height: 1050,
  },
  {
    src: `${SET}/05-rojo-oliva-3d-4x5.webp`,
    title: 'Rojo oliva 3D',
    styleTag: 'Relieve y textura',
    suggestedServiceSlug: 'unas-acrilicas',
    width: 800,
    height: 1000,
  },
  {
    src: `${SET}/foto-015.webp`,
    title: 'Rosa porcelana',
    styleTag: 'Base Rubber',
    suggestedServiceSlug: 'rubber',
    width: 800,
    height: 1048,
  },
  {
    src: `${SET}/07-rubi-y-negro-4x5.webp`,
    title: 'Rubí y negro',
    styleTag: 'Acrílico con contraste',
    suggestedServiceSlug: 'unas-acrilicas',
    width: 800,
    height: 1000,
  },
  {
    src: `${SET}/foto-017.webp`,
    title: 'Cat eye sutil',
    styleTag: 'Gel semipermanente',
    suggestedServiceSlug: 'gel-semipermanente-manos',
    width: 800,
    height: 908,
  },
  {
    src: `${SET}/12-rojo-laca-dorado-4x5.webp`,
    title: 'Rojo laca y dorado',
    styleTag: 'Acrílico escultural',
    suggestedServiceSlug: 'unas-acrilicas',
    width: 800,
    height: 1000,
  },
  {
    src: `${SET}/foto-021.webp`,
    title: 'Nude brillante',
    styleTag: 'Base Rubber',
    suggestedServiceSlug: 'rubber',
    width: 800,
    height: 1067,
  },
  {
    src: `${SET}/10-vino-metalizado-4x5.webp`,
    title: 'Vino metalizado',
    styleTag: 'Gel con acabado chrome',
    suggestedServiceSlug: 'gel-semipermanente-manos',
    width: 800,
    height: 1000,
  },
  {
    src: `${SET}/foto-023.webp`,
    title: 'Almendra suave',
    styleTag: 'Uñas Softgel',
    suggestedServiceSlug: 'unas-softgel',
    width: 800,
    height: 1032,
  },
  {
    src: `${SET}/06-estampado-retro-4x5.webp`,
    title: 'Estampado retro',
    styleTag: 'Arte a mano alzada',
    suggestedServiceSlug: 'unas-acrilicas',
    width: 800,
    height: 1000,
  },
  {
    src: `${SET}/foto-031.webp`,
    title: 'Brillo nacarado',
    styleTag: 'Base Rubber',
    suggestedServiceSlug: 'rubber',
    width: 800,
    height: 1050,
  },
  {
    src: `${SET}/08-verde-oliva-oscuro-4x5.webp`,
    title: 'Verde oliva oscuro',
    styleTag: 'Base Rubber',
    suggestedServiceSlug: 'rubber',
    width: 800,
    height: 1000,
  },
  {
    src: `${SET}/foto-033.webp`,
    title: 'Minimalista limpio',
    styleTag: 'Gel semipermanente',
    suggestedServiceSlug: 'gel-semipermanente-manos',
    width: 800,
    height: 995,
  },
  {
    src: `${SET}/foto-037.webp`,
    title: 'Detalle en relieve',
    styleTag: 'Softgel con 3D',
    suggestedServiceSlug: 'unas-softgel',
    width: 800,
    height: 1067,
  },
  {
    src: `${SET}/foto-040.webp`,
    title: 'Acabado cristal',
    styleTag: 'Acrílico escultural',
    suggestedServiceSlug: 'unas-acrilicas',
    width: 800,
    height: 1067,
  },
  {
    src: `${SET}/foto-042.webp`,
    title: 'Clásico atemporal',
    styleTag: 'Base Rubber',
    suggestedServiceSlug: 'rubber',
    width: 800,
    height: 928,
  },
];

export const GALLERY_INITIAL_COUNT = 11;

const TILE_PATTERN = [
  'lk-tile-a',
  '',
  'lk-tile-b',
  '',
  'lk-tile-b',
  '',
  'lk-tile-a',
  '',
  '',
  'lk-tile-w',
  '',
] as const;

export function galleryTileClass(index: number): string {
  return TILE_PATTERN[index % TILE_PATTERN.length] ?? '';
}

export function galleryTileSizes(index: number): string {
  const tile = galleryTileClass(index);
  const isWideDesktop = tile === 'lk-tile-a' || tile === 'lk-tile-w';
  const isWideMobile = index % 7 === 0 || index % 7 === 6;
  const mobileSize = isWideMobile ? '92vw' : '46vw';
  const desktopSize = isWideDesktop ? '48vw' : '24vw';
  return `(max-width: 47.5rem) ${mobileSize}, ${desktopSize}`;
}

export const INSTAGRAM_PHOTOS = {
  feature: `${SET}/foto-025.webp`,
  left: [`${SET}/foto-010.webp`, `${SET}/foto-013.webp`],
  right: [`${SET}/foto-021.webp`, `${SET}/foto-040.webp`],
} as const;

const SERVICE_PHOTOS: Readonly<Record<string, string>> = {
  'unas-acrilicas': `${SET}/12-rojo-laca-dorado-4x5.webp`,
  'unas-softgel': `${SET}/03-flor-coral-4x5.webp`,
  rubber: `${SET}/08-verde-oliva-oscuro-4x5.webp`,
  retoque: `${SET}/07-rubi-y-negro-4x5.webp`,
  'gel-semipermanente-manos': `${SET}/10-vino-metalizado-4x5.webp`,
  retiro: `${SET}/foto-033.webp`,
  'pedispa-gel': `${SET}/05-rojo-oliva-3d-4x5.webp`,
  'pedispa-acripie': `${SET}/06-estampado-retro-4x5.webp`,
  'gel-pies-en-seco': `${SET}/01-azul-joya-4x5.webp`,
};

export function servicePhoto(slug: string, imageUrl: string | null): string {
  const custom = imageUrl?.trim();
  if (custom) return custom;
  return SERVICE_PHOTOS[slug] ?? `${SET}/11-estampados-mixtos-4x5.webp`;
}

const ADDON_ICON_RULES: ReadonlyArray<{ match: RegExp; icon: string }> = [
  { match: /french|minimal/i, icon: `${ICON}/french.svg` },
  { match: /3d|mano alzada|relieve|charm/i, icon: `${ICON}/relieve.svg` },
  { match: /chrome|glazed|cat eye/i, icon: `${ICON}/cateye.svg` },
];

export function addonIcon(name: string): string {
  return ADDON_ICON_RULES.find((rule) => rule.match.test(name))?.icon ?? `${ICON}/lima.svg`;
}

export const NAIL_SHAPES: ReadonlyArray<{ name: string; icon: string }> = [
  { name: 'Natural', icon: `${ICON}/forma-natural.svg` },
  { name: 'Almendra', icon: `${ICON}/forma-almendra.svg` },
  { name: 'Cuadrada', icon: `${ICON}/forma-cuadrada.svg` },
  { name: 'Coffin', icon: `${ICON}/forma-coffin.svg` },
  { name: 'Stiletto', icon: `${ICON}/forma-stiletto.svg` },
];

const STAFF_AVATARS = [
  '/landing/avatar-cereza.webp',
  '/landing/avatar-obsidiana.webp',
  '/landing/avatar-marfil.webp',
] as const;

export function staffAvatar(avatarUrl: string | null, index: number): string {
  const custom = avatarUrl?.trim();
  if (custom) return custom;
  return STAFF_AVATARS[index % STAFF_AVATARS.length] ?? STAFF_AVATARS[0];
}

export function staffPortfolio(index: number): LandingCreation[] {
  const start = (index * 6) % LANDING_CREATIONS.length;
  const items: LandingCreation[] = [];
  for (let offset = 0; offset < 6; offset += 1) {
    const item = LANDING_CREATIONS[(start + offset) % LANDING_CREATIONS.length];
    if (item) items.push(item);
  }
  return items;
}
