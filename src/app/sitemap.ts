import type { MetadataRoute } from 'next';
import { getRuntimeIntegrationStatus } from '@/lib/env';
import { getSnapshot } from '@/lib/repositories/db';

export const dynamic = 'force-dynamic';

function resolveLastModified(value: string): Date {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getRuntimeIntegrationStatus().appUrl.replace(/\/+$/, '');
  const db = getSnapshot();
  const lastModified = resolveLastModified(db.settings.updatedAt);

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}/reservar`,
      lastModified,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/links`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/aviso-de-privacidad`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
  ];

  const serviceEntries: MetadataRoute.Sitemap = db.services
    .filter((service) => service.isActive)
    .toSorted((a, b) => a.displayOrder - b.displayOrder)
    .map((service) => ({
      url: `${baseUrl}/reservar/${encodeURIComponent(service.slug)}`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.8,
    }));

  return [...staticEntries, ...serviceEntries];
}
