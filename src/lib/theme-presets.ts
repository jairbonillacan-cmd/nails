import type { CornerStyle } from './types';

export const DEFAULT_BRAND_ACCENT_LIGHT = '#8B1E2B';
export const DEFAULT_BRAND_ACCENT_DARK = '#E57A89';

export interface AccentPreset {
  label: string;
  light: string;
  dark: string;
}

export const ACCENT_PRESETS: readonly AccentPreset[] = [
  { label: 'Laikona Cherry', light: '#8B1E2B', dark: '#E57A89' },
  { label: 'Studio Sage', light: '#2F4536', dark: '#8DB59A' },
  { label: 'Obsidian Editorial', light: '#141414', dark: '#E8E4E2' },
  { label: 'Rosewood', light: '#9E5C64', dark: '#D89BA3' },
  { label: 'Espresso', light: '#7C4D3A', dark: '#D1A08B' },
];

export const CORNER_RADIUS_MAP: Record<
  CornerStyle,
  { element: string; container: string; inner: string }
> = {
  sharp: { element: '0.25rem', container: '0.375rem', inner: '0.1875rem' },
  soft: { element: '0.625rem', container: '0.875rem', inner: '0.5rem' },
  rounded: { element: '0.875rem', container: '1.25rem', inner: '0.625rem' },
  pill: { element: '999rem', container: '1.5rem', inner: '0.875rem' },
};
