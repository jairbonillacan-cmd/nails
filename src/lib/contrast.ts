export interface ThemeContrastCheckResult {
  lightRatio: number;
  darkRatio: number;
  lightSurfaceRatio: number;
  darkSurfaceRatio: number;
  lightPassesAA: boolean;
  darkPassesAA: boolean;
  lightWarning: string | null;
  darkWarning: string | null;
}

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

const SHORT_HEX_RE = /^#([0-9a-fA-F]{3})$/;
const FULL_HEX_RE = /^#([0-9a-fA-F]{6})$/;

function parseHexColor(raw: string): RgbColor | null {
  const trimmed = raw.trim();
  const shortMatch = SHORT_HEX_RE.exec(trimmed);
  if (shortMatch?.[1]) {
    const [r, g, b] = shortMatch[1].split('');
    if (!r || !g || !b) return null;
    return {
      r: Number.parseInt(`${r}${r}`, 16),
      g: Number.parseInt(`${g}${g}`, 16),
      b: Number.parseInt(`${b}${b}`, 16),
    };
  }
  const fullMatch = FULL_HEX_RE.exec(trimmed);
  if (fullMatch?.[1]) {
    const hex = fullMatch[1];
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
    };
  }
  return null;
}

function channelToLinear(value255: number): number {
  const srgb = value255 / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(rgb: RgbColor): number {
  return (
    0.2126 * channelToLinear(rgb.r) +
    0.7152 * channelToLinear(rgb.g) +
    0.0722 * channelToLinear(rgb.b)
  );
}

export function getContrastRatio(hexA: string, hexB: string): number {
  const a = parseHexColor(hexA);
  const b = parseHexColor(hexB);
  if (!a || !b) return 0;
  const lumA = relativeLuminance(a);
  const lumB = relativeLuminance(b);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

export function checkThemeAccentContrast(params: {
  accentLight: string;
  accentDark: string;
  lightSurface?: string;
  darkSurface?: string;
}): ThemeContrastCheckResult {
  const lightSurface = params.lightSurface ?? '#FAF7F5';
  const darkSurface = params.darkSurface ?? '#191617';

  const lightRatio = getContrastRatio(params.accentLight, '#FFFFFF');
  const lightSurfaceRatio = getContrastRatio(params.accentLight, lightSurface);
  const darkRatio = getContrastRatio(params.accentDark, '#141414');
  const darkSurfaceRatio = getContrastRatio(params.accentDark, darkSurface);

  const lightPassesAA = lightRatio >= 4.5 && lightSurfaceRatio >= 3.0;
  const darkPassesAA = darkRatio >= 4.5 && darkSurfaceRatio >= 3.0;

  let lightWarning: string | null = null;
  if (lightRatio === 0) {
    lightWarning = 'Color acento claro inválido; usa formato hexadecimal #RRGGBB.';
  } else if (!lightPassesAA) {
    lightWarning = `Contraste bajo en modo claro (${lightRatio}:1 con texto blanco, mín. 4.5:1; ${lightSurfaceRatio}:1 sobre fondo, mín. 3.0:1). Elige un tono más oscuro.`;
  }

  let darkWarning: string | null = null;
  if (darkRatio === 0) {
    darkWarning = 'Color acento oscuro inválido; usa formato hexadecimal #RRGGBB.';
  } else if (!darkPassesAA) {
    darkWarning = `Contraste bajo en modo oscuro (${darkRatio}:1 con texto oscuro, mín. 4.5:1; ${darkSurfaceRatio}:1 sobre fondo, mín. 3.0:1). Elige un tono más luminoso.`;
  }

  return {
    lightRatio,
    darkRatio,
    lightSurfaceRatio,
    darkSurfaceRatio,
    lightPassesAA,
    darkPassesAA,
    lightWarning,
    darkWarning,
  };
}
