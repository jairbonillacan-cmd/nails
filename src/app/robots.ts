import type { MetadataRoute } from 'next';
import { isSiteNoIndexEnabled } from '@/lib/env';
import { getSiteOrigin } from '@/lib/seo/site-url';

export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  if (isSiteNoIndexEnabled()) {
    return {
      rules: {
        userAgent: '*',
        disallow: '/',
      },
    };
  }
  const origin = getSiteOrigin();
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/admin/', '/api/', '/cita/', '/mis-citas'],
    },
    sitemap: `${origin}/sitemap.xml`,
  };
}
