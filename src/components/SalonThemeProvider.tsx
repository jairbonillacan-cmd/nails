'use client';

import React, { createContext, useContext, useMemo, useState } from 'react';
import NextLink from 'next/link';
import Script from 'next/script';
import { defineTheme, Theme } from '@astryxdesign/core/theme';
import { InternationalizationProvider } from '@astryxdesign/core/i18n';
import { LinkProvider } from '@astryxdesign/core/Link';
import { themes, defaultThemeSlug } from '../astryx-themes';
import {
  CORNER_RADIUS_MAP,
  DEFAULT_BRAND_ACCENT_DARK,
  DEFAULT_BRAND_ACCENT_LIGHT,
} from '@/lib/theme-presets';
import type { SalonSettings, ThemeModePreference } from '@/lib/types';
import type { PublicSettingsDTO } from '@/lib/public-dto';

type AppearanceSettings = PublicSettingsDTO | SalonSettings;

interface AppearanceContextValue {
  mode: ThemeModePreference;
  setMode: (mode: ThemeModePreference) => void;
  settings: AppearanceSettings;
  setSettingsOverride: (next: AppearanceSettings) => void;
}

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

function buildDynamicSalonTheme(settings: AppearanceSettings) {
  const baseTheme = themes[defaultThemeSlug];
  const radii = CORNER_RADIUS_MAP[settings.cornerStyle] ?? CORNER_RADIUS_MAP.soft;
  const accentLight = settings.brandAccentLight || DEFAULT_BRAND_ACCENT_LIGHT;
  const accentDark = settings.brandAccentDark || DEFAULT_BRAND_ACCENT_DARK;

  return defineTheme({
    name: `salon-${settings.cornerStyle}-${accentLight.replace('#', '')}`,
    extends: baseTheme,
    tokens: {
      '--color-accent': [accentLight, accentDark],
      '--focus-outline-color': [accentLight, accentDark],
      '--radius-element': radii.element,
      '--radius-container': radii.container,
      '--radius-inner': radii.inner,
    },
  });
}

export function SalonThemeProvider({
  initialSettings,
  children,
}: {
  initialSettings: AppearanceSettings;
  children: React.ReactNode;
}) {
  const [settings, setSettingsOverride] = useState<AppearanceSettings>(initialSettings);
  const [mode, setMode] = useState<ThemeModePreference>(
    initialSettings.defaultPublicMode || 'light',
  );

  const dynamicTheme = useMemo(() => buildDynamicSalonTheme(settings), [settings]);

  const contextValue = useMemo(
    () => ({ mode, setMode, settings, setSettingsOverride }),
    [mode, settings],
  );

  return (
    <AppearanceContext.Provider value={contextValue}>
      <InternationalizationProvider locale="es-MX">
        <LinkProvider component={NextLinkAdapter}>
          <Theme theme={dynamicTheme} mode={mode}>
            {settings.ga4MeasurementId ? (
              <>
                <Script
                  src={`https:
                    settings.ga4MeasurementId,
                  )}`}
                  strategy="afterInteractive"
                />
                <Script id="nails-ga4" strategy="afterInteractive">
                  {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${settings.ga4MeasurementId}');`}
                </Script>
              </>
            ) : null}

            {settings.metaPixelId ? (
              <Script id="nails-meta-pixel" strategy="afterInteractive">
                {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${settings.metaPixelId}');
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
