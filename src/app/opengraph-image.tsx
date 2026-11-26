import { getRepository } from '@/lib/repositories/db';
import { OG_SIZE, renderOgCard } from '@/lib/seo/og-card';

export const dynamic = 'force-dynamic';

export const alt = 'LAIKONA NAILS · Manicure, Rubber, Acrílico y Nail Art en Puebla';

export const size = OG_SIZE;

export const contentType = 'image/png';

export default async function Image() {
  const settings = await getRepository().getSalonSettings();
  return renderOgCard({
    palette: settings.publicPalette ?? 'laikona',
    studioName: settings.name || 'LAIKONA NAILS',
    location: settings.city || 'Puebla',
    title: 'El arte está en tus uñas',
    subtitle: 'Rubber, acrílico, softgel y nail art. Solo con cita.',
    facts: [
      { label: 'Agenda', value: 'En línea, 24/7' },
      { label: 'Instagram', value: settings.instagramHandle || '@laikona.nailsss' },
    ],
    cta: 'Reserva tu cita',
  });
}
