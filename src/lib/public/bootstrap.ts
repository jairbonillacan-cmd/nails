import { cache } from 'react';
import { getRepository } from '@/lib/repositories/db';

export const getCachedPublicBootstrap = cache(async () =>
  getRepository().getPublicBootstrap(),
);

export const getCachedPublicServiceBySlug = cache(async (slug: string) =>
  getRepository().getPublicServiceBySlug(slug),
);
