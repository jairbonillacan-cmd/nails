import { NextResponse } from 'next/server';
import { getSnapshot } from '@/lib/repositories/db';
import { getRuntimeIntegrationStatus } from '@/lib/env';
import {
  toPublicServiceDTO,
  toPublicSettingsDTO,
  toPublicStaffDTO,
} from '@/lib/public-dto';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getSnapshot();
  const integration = getRuntimeIntegrationStatus();

  return NextResponse.json({
    settings: toPublicSettingsDTO(db.settings),
    categories: db.categories.toSorted((a, b) => a.displayOrder - b.displayOrder),
    services: db.services
      .filter((s) => s.isActive)
      .toSorted((a, b) => a.displayOrder - b.displayOrder)
      .map(toPublicServiceDTO),
    addons: db.addons
      .filter((a) => a.isActive)
      .toSorted((a, b) => a.displayOrder - b.displayOrder),
    staff: db.staff
      .filter((s) => s.isActive)
      .toSorted((a, b) => a.displayOrder - b.displayOrder)
      .map(toPublicStaffDTO),
    gallery: db.gallery.toSorted((a, b) => a.displayOrder - b.displayOrder),
    reviewsSummary: {
      count: db.reviews.length,
      average:
        db.reviews.length > 0
          ? Number(
              (
                db.reviews.reduce((sum, r) => sum + r.rating, 0) / db.reviews.length
              ).toFixed(1),
            )
          : 5.0,
    },
    integrationMode: integration.mode,
  });
}
