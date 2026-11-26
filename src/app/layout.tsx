import { Suspense } from 'react';
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { defaultThemeSlug } from '@/astryx-themes';
import { getSnapshot } from '@/lib/repositories/db';
import { toPublicSettingsDTO, type PublicSettingsDTO } from '@/lib/public-dto';
import {
  DEFAULT_BRAND_ACCENT_DARK,
  DEFAULT_BRAND_ACCENT_LIGHT,
} from '@/lib/theme-presets';
import { SalonThemeProvider } from '@/components/SalonThemeProvider';
import { PwaOfflineBootstrap } from '@/components/PwaOfflineBootstrap';
import { RouteProgressBar } from '@/components/RouteProgressBar';

export const dynamic = 'force-dynamic';

const ADMIN_THEME_BOOT_SCRIPT =
  "(function(){try{if(!location.pathname.startsWith('/admin'))return;var m=localStorage.getItem('laikona.themeMode');if(m==='dark'||m==='light'){document.documentElement.dataset.theme=m;}}catch(e){}})();";

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
    return defaultThemeSlug;
  }
  return `salon-${cornerStyle}-${accentLight.slice(1).toLowerCase()}-${accentDark.slice(1).toLowerCase()}`;
}

export async function generateMetadata(): Promise<Metadata> {
  const { settings } = getSnapshot();
  return {
    title: {
      default: `${settings.name} — ${settings.tagline}`,
      template: `%s · ${settings.name}`,
    },
    description: settings.description,
    applicationName: settings.name,
    icons: { icon: '/brand/laikona-avatar.svg' },
    appleWebApp: {
      capable: true,
      title: settings.name,
      statusBarStyle: 'default',
    },
    openGraph: {
      title: `${settings.name} — Agenda tu cita en línea`,
      description: settings.description,
      type: 'website',
      locale: 'es_MX',
    },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const { settings } = getSnapshot();
  const mode = settings.defaultPublicMode || 'light';
  return {
    themeColor: normalizeHexColor(
      settings.brandAccentLight,
      DEFAULT_BRAND_ACCENT_LIGHT,
    ),
    colorScheme: mode === 'system' ? 'light dark' : mode,
    width: 'device-width',
    initialScale: 1,
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { settings } = getSnapshot();
  const publicSettings = toPublicSettingsDTO(settings);
  const initialMode = publicSettings.defaultPublicMode || 'light';
  const initialThemeName = resolveInitialThemeName(publicSettings);

  return (
    <html
      lang="es-MX"
      data-astryx-theme={initialThemeName}
      data-theme={initialMode === 'system' ? undefined : initialMode}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: ADMIN_THEME_BOOT_SCRIPT }} />
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
