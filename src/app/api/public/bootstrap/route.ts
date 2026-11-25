import { NextResponse } from 'next/server';
import { getSnapshot } from '@/lib/repositories/db';
import { getRuntimeIntegrationStatus } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getSnapshot();
  const integration = getRuntimeIntegrationStatus();
  const activeStaff = db.staff.filter((s) => s.isActive);

  return NextResponse.json({
    settings: db.settings,
    categories: db.categories,
    services: db.services
      .filter((s) => s.isActive)
      .sort((a, b) => a.displayOrder - b.displayOrder),
    addons: db.addons
      .filter((a) => a.isActive)
      .sort((a, b) => a.displayOrder - b.displayOrder),
    staff: activeStaff.sort((a, b) => a.displayOrder - b.displayOrder),
    gallery: db.gallery.sort((a, b) => a.displayOrder - b.displayOrder),
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
