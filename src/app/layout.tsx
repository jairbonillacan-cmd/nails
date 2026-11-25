import type { Metadata, Viewport } from 'next';
import './globals.css';
import { getSnapshot } from '@/lib/repositories/db';
import { toPublicSettingsDTO } from '@/lib/public-dto';
import { SalonThemeProvider } from '@/components/SalonThemeProvider';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { settings } = getSnapshot();
  return {
    title: {
      default: `${settings.name} — ${settings.tagline}`,
      template: `%s · ${settings.name}`,
    },
    description: settings.description,
    applicationName: settings.name,
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
  return {
    themeColor: settings.brandAccentLight || '#9E5C64',
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

  return (
    <html lang="es-MX" suppressHydrationWarning>
      <body>
        <SalonThemeProvider initialSettings={toPublicSettingsDTO(settings)}>
          {children}
        </SalonThemeProvider>
      </body>
    </html>
  );
}
