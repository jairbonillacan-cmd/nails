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

export const LANDING_GALLERY: readonly string[] = [
  `${SET}/foto-007.webp`,
  `${SET}/01-azul-joya-4x5.webp`,
  `${SET}/foto-010.webp`,
  `${SET}/03-flor-coral-4x5.webp`,
  `${SET}/foto-004.webp`,
  `${SET}/11-estampados-mixtos-4x5.webp`,
  `${SET}/foto-013.webp`,
  `${SET}/05-rojo-oliva-3d-4x5.webp`,
  `${SET}/foto-015.webp`,
  `${SET}/07-rubi-y-negro-4x5.webp`,
  `${SET}/foto-017.webp`,
  `${SET}/12-rojo-laca-dorado-4x5.webp`,
  `${SET}/foto-021.webp`,
  `${SET}/10-vino-metalizado-4x5.webp`,
  `${SET}/foto-023.webp`,
  `${SET}/06-estampado-retro-4x5.webp`,
  `${SET}/foto-031.webp`,
  `${SET}/08-verde-oliva-oscuro-4x5.webp`,
  `${SET}/foto-033.webp`,
  `${SET}/foto-037.webp`,
  `${SET}/foto-040.webp`,
  `${SET}/foto-042.webp`,
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
  '/landing/avatar-cereza.png',
  '/landing/avatar-obsidiana.png',
  '/landing/avatar-marfil.png',
] as const;

export function staffAvatar(avatarUrl: string | null, index: number): string {
  const custom = avatarUrl?.trim();
  if (custom) return custom;
  return STAFF_AVATARS[index % STAFF_AVATARS.length] ?? STAFF_AVATARS[0];
}

export function staffPortfolio(index: number): string[] {
  const start = (index * 6) % LANDING_GALLERY.length;
  return Array.from({ length: 6 }, (_, offset) => LANDING_GALLERY[(start + offset) % LANDING_GALLERY.length] ?? '');
}
