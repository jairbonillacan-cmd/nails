import { formatCurrency, formatDuration } from '@/lib/format';
import { toPublicServiceDTO, toPublicSettingsDTO } from '@/lib/public-dto';
import { getRepository } from '@/lib/repositories/db';
import { OG_SIZE, renderOgCard } from '@/lib/seo/og-card';

export const dynamic = 'force-dynamic';

export const alt = 'Reserva tu cita · LAIKONA NAILS Puebla';

export const size = OG_SIZE;

export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await getRepository().getSnapshot();
  const settings = toPublicSettingsDTO(db.settings);
  const base = {
    palette: settings.publicPalette,
    studioName: settings.name || 'LAIKONA NAILS',
    location: db.settings.city || 'Puebla',
    cta: 'Reserva tu cita',
  };
  const matched = db.services.find((entry) => entry.isActive && entry.slug === slug);
  const service = matched ? toPublicServiceDTO(matched) : null;

  if (!service || service.isPrivate === true) {
    return renderOgCard({
      ...base,
      title: 'Reserva tu cita',
      subtitle: 'Elige servicio, día y hora. Te confirmamos por WhatsApp.',
    });
  }

  const price = formatCurrency(service.priceCents, settings.currency);
  return renderOgCard({
    ...base,
    title: service.name,
    subtitle: db.categories.find((cat) => cat.id === service.categoryId)?.name,
    facts: [
      { label: 'Precio', value: service.isStartingPrice ? `Desde ${price}` : price },
      { label: 'Duración', value: formatDuration(service.durationMinutes) },
    ],
  });
}
