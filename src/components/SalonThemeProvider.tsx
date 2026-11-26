'use client';

import React, { createContext, useContext, useMemo, useState } from 'react';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import Script from 'next/script';
import {
  defineTheme,
  generateThemeCSS,
  Theme,
  type DefinedTheme,
} from '@astryxdesign/core/theme';
import { InternationalizationProvider } from '@astryxdesign/core/i18n';
import esES from '@astryxdesign/core/locales/es-ES.generated.js';
import { LinkProvider } from '@astryxdesign/core/Link';
import { themes, defaultThemeSlug } from '../astryx-themes';
import {
  CORNER_RADIUS_MAP,
  DEFAULT_BRAND_ACCENT_DARK,
  DEFAULT_BRAND_ACCENT_LIGHT,
} from '@/lib/theme-presets';
import { usePersistedThemeMode } from '@/lib/hooks/usePersistedThemeMode';
import type { SalonSettings, ThemeModePreference } from '@/lib/types';
import type { PublicSettingsDTO } from '@/lib/public-dto';

const ASTRYX_MESSAGES = { 'es-MX': esES };

type AppearanceSettings = PublicSettingsDTO | SalonSettings;

interface AppearanceContextValue {
  mode: ThemeModePreference;
  setMode: (mode: ThemeModePreference) => void;
  settings: AppearanceSettings;
  setSettingsOverride: (next: AppearanceSettings) => void;
}

interface ResolvedSalonTheme {
  theme: DefinedTheme;
  ssrStyleId: string | null;
  ssrCss: string | null;
}

const THEME_LAYER_ORDER = '@layer reset, astryx-base, astryx-theme;';
const SAFE_HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const SAFE_GA4_ID_RE = /^(?:G|GT|AW|DC)-[A-Z0-9]{4,20}$/i;
const SAFE_META_PIXEL_ID_RE = /^\d{5,20}$/;

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function useSalonAppearance() {
  const ctx = useContext(AppearanceContext);
  if (!ctx) {
    throw new Error('useSalonAppearance must be used inside SalonThemeProvider');
  }
  return ctx;
}

const NextLinkAdapter = React.forwardRef<
  HTMLAnchorElement,
  React.AnchorHTMLAttributes<HTMLAnchorElement> & { href?: string }
>(function NextLinkAdapter({ href, ...rest }, ref) {
  if (
    !href ||
    href.startsWith('http') ||
    href.startsWith('mailto:') ||
    href.startsWith('tel:') ||
    href.startsWith('#') ||
    href.startsWith('/api/')
  ) {
    return <a ref={ref} href={href} {...rest} />;
  }
  return <NextLink ref={ref} href={href} {...rest} />;
});

function normalizeHexColor(value: string | undefined | null, fallback: string): string {
  const trimmed = value?.trim() ?? '';
  return SAFE_HEX_COLOR_RE.test(trimmed) ? trimmed : fallback;
}

function sanitizeGa4MeasurementId(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return SAFE_GA4_ID_RE.test(trimmed) ? trimmed.toUpperCase() : null;
}

function sanitizeMetaPixelId(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return SAFE_META_PIXEL_ID_RE.test(trimmed) ? trimmed : null;
}

function resolveSalonTheme(settings: AppearanceSettings): ResolvedSalonTheme {
  const baseTheme = themes[defaultThemeSlug];
  const cornerStyle = settings.cornerStyle ?? 'soft';
  const accentLight = normalizeHexColor(
    settings.brandAccentLight,
    DEFAULT_BRAND_ACCENT_LIGHT,
  );
  const accentDark = normalizeHexColor(
    settings.brandAccentDark,
    DEFAULT_BRAND_ACCENT_DARK,
  );

  if (
    cornerStyle === 'soft' &&
    accentLight.toLowerCase() === DEFAULT_BRAND_ACCENT_LIGHT.toLowerCase() &&
    accentDark.toLowerCase() === DEFAULT_BRAND_ACCENT_DARK.toLowerCase()
  ) {
    return { theme: baseTheme, ssrStyleId: null, ssrCss: null };
  }

  const radii = CORNER_RADIUS_MAP[cornerStyle] ?? CORNER_RADIUS_MAP.soft;
  const themeName = `salon-${cornerStyle}-${accentLight.slice(1).toLowerCase()}-${accentDark.slice(1).toLowerCase()}`;

  const extended = defineTheme({
    name: themeName,
    extends: baseTheme,
    tokens: {
      '--color-accent': [accentLight, accentDark],
      '--focus-outline-color': [accentLight, accentDark],
      '--radius-element': radii.element,
      '--radius-container': radii.container,
      '--radius-inner': radii.inner,
    },
  });

  const { prose, component } = generateThemeCSS(extended);
  const cssBlocks: string[] = [THEME_LAYER_ORDER];
  if (prose) {
    cssBlocks.push(`@layer reset {\n${prose}\n}`);
  }
  if (component) {
    cssBlocks.push(`@layer astryx-theme {\n${component}\n}`);
  }

  const preRenderedTheme: DefinedTheme = {
    ...extended,
    __built: true,
  };

  return {
    theme: preRenderedTheme,
    ssrStyleId: `astryx-theme-${themeName}`,
    ssrCss: cssBlocks.join('\n'),
  };
}

export function SalonThemeProvider({
  initialSettings,
  children,
}: {
  initialSettings: AppearanceSettings;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [settings, setSettingsOverride] = useState<AppearanceSettings>(initialSettings);
  const defaultMode = initialSettings.defaultPublicMode || 'light';
  const [mode, setMode] = usePersistedThemeMode(defaultMode);

  const safePathname = pathname ?? '';
  const isLightLockedPublicRoute =
    safePathname === '/' ||
    safePathname.startsWith('/reservar') ||
    safePathname.startsWith('/cita') ||
    safePathname === '/links' ||
    safePathname === '/aviso-de-privacidad';
  const effectiveMode: ThemeModePreference = isLightLockedPublicRoute ? 'light' : mode;

  const resolvedTheme = useMemo(() => resolveSalonTheme(settings), [settings]);
  const safeGa4Id = sanitizeGa4MeasurementId(settings.ga4MeasurementId);
  const safeMetaPixelId = sanitizeMetaPixelId(settings.metaPixelId);

  const contextValue = useMemo(
    () => ({ mode, setMode, settings, setSettingsOverride }),
    [mode, setMode, settings],
  );

  return (
    <AppearanceContext.Provider value={contextValue}>
      <InternationalizationProvider locale="es-MX" messages={ASTRYX_MESSAGES}>
        <LinkProvider component={NextLinkAdapter}>
          {resolvedTheme.ssrStyleId && resolvedTheme.ssrCss ? (
            <style href={resolvedTheme.ssrStyleId} precedence="astryx-theme">
              {resolvedTheme.ssrCss}
            </style>
          ) : null}
          <Theme theme={resolvedTheme.theme} mode={effectiveMode}>
            {safeGa4Id ? (
              <>
                <Script
                  src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(safeGa4Id)}`}
                  strategy="afterInteractive"
                />
                <Script id="nails-ga4" strategy="afterInteractive">
                  {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', ${JSON.stringify(safeGa4Id)});`}
                </Script>
              </>
            ) : null}

            {safeMetaPixelId ? (
              <Script id="nails-meta-pixel" strategy="afterInteractive">
                {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', ${JSON.stringify(safeMetaPixelId)});
fbq('track', 'PageView');`}
              </Script>
            ) : null}

            {children}
          </Theme>
        </LinkProvider>
      </InternationalizationProvider>
    </AppearanceContext.Provider>
  );
}
