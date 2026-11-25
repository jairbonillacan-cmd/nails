import type { CornerStyle } from './types';

export const DEFAULT_BRAND_ACCENT_LIGHT = '#9E5C64';
export const DEFAULT_BRAND_ACCENT_DARK = '#D89BA3';

export interface AccentPreset {
  label: string;
  light: string;
  dark: string;
}

export const ACCENT_PRESETS: readonly AccentPreset[] = [
  { label: 'Palo de rosa editorial', light: '#9E5C64', dark: '#D89BA3' },
  { label: 'Espresso & Terracota', light: '#7C4D3A', dark: '#D1A08B' },
  { label: 'Matcha Botánico', light: '#4E6E58', dark: '#9FC5A9' },
  { label: 'Noir Cal.com', light: '#1B1B1B', dark: '#F1F1F1' },
  { label: 'Ciruela Velvet', light: '#6B3FA0', dark: '#C8A6F0' },
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
