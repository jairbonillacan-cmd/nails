import type { MetadataRoute } from 'next';
import { toPublicSettingsDTO } from '@/lib/public-dto';
import { getSnapshot } from '@/lib/repositories/db';
import { DEFAULT_BRAND_ACCENT_LIGHT } from '@/lib/theme-presets';

export default function manifest(): MetadataRoute.Manifest {
  const settings = toPublicSettingsDTO(getSnapshot().settings);
  return {
    name: `${settings.name} — Agenda y Estudio de Uñas`,
    short_name: settings.name,
    description: settings.tagline,
    start_url: '/admin',
    display: 'standalone',
    background_color: '#FAF7F5',
    theme_color: settings.brandAccentLight || DEFAULT_BRAND_ACCENT_LIGHT,
    lang: 'es-MX',
    icons: [
      {
        src: '/brand/laikona-app-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/brand/laikona-app-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/brand/laikona-app-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/brand/laikona-avatar.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
