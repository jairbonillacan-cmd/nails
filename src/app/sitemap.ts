import type { MetadataRoute } from 'next';
import { toPublicServiceDTO } from '@/lib/public-dto';
import { getRepository } from '@/lib/repositories/db';
import { getSiteOrigin } from '@/lib/seo/site-url';

export const dynamic = 'force-dynamic';

function resolveLastModified(value: string): Date {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = getSiteOrigin();
  const db = await getRepository().getSnapshot();
  const lastModified = resolveLastModified(db.settings.updatedAt);

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${origin}/`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${origin}/reservar`,
      lastModified,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${origin}/links`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${origin}/aviso-de-privacidad`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
  ];

  const serviceEntries: MetadataRoute.Sitemap = db.services
    .filter((service) => service.isActive && !service.isPrivate)
    .toSorted((a, b) => a.displayOrder - b.displayOrder)
    .map(toPublicServiceDTO)
    .map((service) => ({
      url: `${origin}/reservar/${encodeURIComponent(service.slug)}`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.8,
    }));

  return [...staticEntries, ...serviceEntries];
}
