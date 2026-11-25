import type { MetadataRoute } from 'next';
import { getSnapshot } from '@/lib/repositories/db';

export default function manifest(): MetadataRoute.Manifest {
  const db = getSnapshot();
  return {
    name: `${db.settings.name} — Agenda y Estudio de Uñas`,
    short_name: db.settings.name,
    description: db.settings.tagline,
    start_url: '/admin',
    display: 'standalone',
    background_color: '#FAF8F6',
    theme_color: db.settings.brandAccentLight || '#9E5C64',
    lang: 'es-MX',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
