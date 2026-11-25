import type { MetadataRoute } from 'next';
import { getSnapshot } from '@/lib/repositories/db';
import { DEFAULT_BRAND_ACCENT_LIGHT } from '@/lib/theme-presets';

export default function manifest(): MetadataRoute.Manifest {
  const db = getSnapshot();
  return {
    name: `${db.settings.name} — Agenda y Estudio de Uñas`,
    short_name: db.settings.name,
    description: db.settings.tagline,
    start_url: '/admin',
    display: 'standalone',
    background_color: '#FAF7F5',
    theme_color: db.settings.brandAccentLight || DEFAULT_BRAND_ACCENT_LIGHT,
    lang: 'es-MX',
    icons: [
      {
        src: '/brand/laikona-avatar.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
