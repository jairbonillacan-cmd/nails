import { describe, expect, it } from 'vitest';
import {
  checkThemeAccentContrast,
  getContrastRatio,
  type ThemeContrastCheckResult,
} from './contrast';

describe('WCAG 2.1 Theme Accent Contrast Guard (C5)', () => {
  it('computes exact WCAG 2.1 relative luminance contrast ratios', () => {
    expect(getContrastRatio('#000000', '#FFFFFF')).toBe(21);
    expect(getContrastRatio('#FFFFFF', '#FFFFFF')).toBe(1);
    expect(getContrastRatio('#FFF', '#000')).toBe(21);
    expect(getContrastRatio('not-a-color', '#FFFFFF')).toBe(0);
    expect(getContrastRatio('#8B1E2B', '#FFFFFF')).toBeGreaterThan(8);
    expect(getContrastRatio('#E57A89', '#141414')).toBeGreaterThan(6);
  });

  it('passes AA for LAIKONA Cherry Lacquer light and Blush Cherry dark accents', () => {
    const res: ThemeContrastCheckResult = checkThemeAccentContrast({
      accentLight: '#8B1E2B',
      accentDark: '#E57A89',
    });

    expect(res.lightPassesAA).toBe(true);
    expect(res.darkPassesAA).toBe(true);
    expect(res.lightRatio).toBeGreaterThanOrEqual(4.5);
    expect(res.lightSurfaceRatio).toBeGreaterThanOrEqual(3.0);
    expect(res.darkRatio).toBeGreaterThanOrEqual(4.5);
    expect(res.darkSurfaceRatio).toBeGreaterThanOrEqual(3.0);
    expect(res.lightWarning).toBeNull();
    expect(res.darkWarning).toBeNull();
  });

  it('flags low-contrast pastel light accents and dark-on-dark accents with actionable warnings', () => {
    const bad = checkThemeAccentContrast({
      accentLight: '#F4C2C2',
      accentDark: '#3A1A1E',
    });

    expect(bad.lightPassesAA).toBe(false);
    expect(bad.darkPassesAA).toBe(false);
    expect(bad.lightWarning).toContain('modo claro');
    expect(bad.darkWarning).toContain('modo oscuro');

    const invalid = checkThemeAccentContrast({
      accentLight: 'rgb(1,2,3)',
      accentDark: '#ZZZ',
    });
    expect(invalid.lightPassesAA).toBe(false);
    expect(invalid.darkPassesAA).toBe(false);
    expect(invalid.lightWarning).toContain('inválido');
    expect(invalid.darkWarning).toContain('inválido');
  });
});
