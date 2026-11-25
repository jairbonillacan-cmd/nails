import type { MetadataRoute } from 'next';
import { getRuntimeIntegrationStatus } from '@/lib/env';

export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getRuntimeIntegrationStatus().appUrl.replace(/\/+$/, '');
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin/', '/api/', '/cita/'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
