import { cache, Suspense } from 'react';
import type { Metadata, Viewport } from 'next';
import { DM_Sans, Source_Serif_4 } from 'next/font/google';
import './globals.css';
import { isSiteNoIndexEnabled } from '@/lib/env';
import { getRepository } from '@/lib/repositories/db';
import { toPublicSettingsDTO, type PublicSettingsDTO } from '@/lib/public-dto';
import { getSiteMetadataBase } from '@/lib/seo/site-url';
import {
  DEFAULT_BRAND_ACCENT_DARK,
  DEFAULT_BRAND_ACCENT_LIGHT,
  MONOCHROME_INK,
} from '@/lib/theme-presets';
import { SalonThemeProvider } from '@/components/SalonThemeProvider';
import { PwaOfflineBootstrap } from '@/components/PwaOfflineBootstrap';
import { RouteProgressBar } from '@/components/RouteProgressBar';

export const dynamic = 'force-dynamic';

const DEFAULT_THEME_SLUG = 'nails';

const publicSans = DM_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '700'],
  variable: '--font-public-sans',
  display: 'swap',
  adjustFontFallback: true,
});

const publicSerif = Source_Serif_4({
  subsets: ['latin', 'latin-ext'],
  weight: ['500', '600'],
  variable: '--font-public-serif',
  display: 'swap',
  adjustFontFallback: true,
});

const THEME_BOOT_SCRIPT =
  "(function(){try{var d=document.documentElement;var p=new URLSearchParams(location.search).get('paleta');if(p==='laikona'||p==='monochrome'){d.dataset.palette=p;}if(!location.pathname.startsWith('/admin'))return;var m=localStorage.getItem('laikona.themeMode');if(m==='dark'||m==='light'){d.dataset.theme=m;}}catch(e){}})();";

const SAFE_HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function normalizeHexColor(value: string | undefined | null, fallback: string): string {
  const trimmed = value?.trim() ?? '';
  return SAFE_HEX_COLOR_RE.test(trimmed) ? trimmed : fallback;
}

function resolveInitialThemeName(settings: PublicSettingsDTO): string {
  const accentLight = normalizeHexColor(
    settings.brandAccentLight,
    DEFAULT_BRAND_ACCENT_LIGHT,
  );
  const accentDark = normalizeHexColor(
    settings.brandAccentDark,
    DEFAULT_BRAND_ACCENT_DARK,
  );
  const cornerStyle = settings.cornerStyle ?? 'soft';
  if (
    cornerStyle === 'soft' &&
    accentLight.toLowerCase() === DEFAULT_BRAND_ACCENT_LIGHT.toLowerCase() &&
    accentDark.toLowerCase() === DEFAULT_BRAND_ACCENT_DARK.toLowerCase()
  ) {
    return DEFAULT_THEME_SLUG;
  }
  return `salon-${cornerStyle}-${accentLight.slice(1).toLowerCase()}-${accentDark.slice(1).toLowerCase()}`;
}

const getLayoutSettings = cache(async () => getRepository().getSalonSettings());

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getLayoutSettings();
  const socialTitle = `${settings.name} — Agenda tu cita en línea`;
  const noIndex = isSiteNoIndexEnabled();
  return {
    metadataBase: getSiteMetadataBase(),
    ...(noIndex ? { robots: { index: false, follow: false } } : {}),
    title: {
      default: `${settings.name} — ${settings.tagline}`,
      template: `%s · ${settings.name}`,
    },
    description: settings.description,
    applicationName: settings.name,
    icons: {
      icon: [
        { url: '/brand/laikona-favicon.ico', sizes: 'any' },
        { url: '/brand/laikona-app-192.png', type: 'image/png', sizes: '192x192' },
        { url: '/brand/laikona-avatar.svg', type: 'image/svg+xml' },
      ],
      apple: [
        {
          url: '/brand/laikona-apple-touch.png',
          sizes: '180x180',
          type: 'image/png',
        },
      ],
    },
    appleWebApp: {
      capable: true,
      title: settings.name,
      statusBarStyle: 'default',
    },
    openGraph: {
      title: socialTitle,
      description: settings.description,
      url: '/',
      siteName: settings.name,
      type: 'website',
      locale: 'es_MX',
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description: settings.description,
    },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const settings = await getLayoutSettings();
  return {
    themeColor:
      settings.publicPalette === 'monochrome'
        ? MONOCHROME_INK
        : normalizeHexColor(settings.brandAccentLight, DEFAULT_BRAND_ACCENT_LIGHT),
    colorScheme: 'light',
    width: 'device-width',
    initialScale: 1,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settings = await getLayoutSettings();
  const publicSettings = toPublicSettingsDTO(settings);
  const initialThemeName = resolveInitialThemeName(publicSettings);

  return (
    <html
      lang="es-MX"
      className={`${publicSans.variable} ${publicSerif.variable}`}
      data-astryx-theme={initialThemeName}
      data-theme="light"
      data-palette={publicSettings.publicPalette}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <SalonThemeProvider initialSettings={publicSettings}>
          <Suspense fallback={null}>
            <RouteProgressBar />
          </Suspense>
          {children}
          <PwaOfflineBootstrap />
        </SalonThemeProvider>
      </body>
    </html>
  );
}
