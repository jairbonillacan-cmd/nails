import { getSnapshot } from '@/lib/repositories/db';
import {
  toPublicServiceDTO,
  toPublicSettingsDTO,
  toPublicStaffDTO,
} from '@/lib/public-dto';
import { LandingView } from '@/components/LandingView';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const db = getSnapshot();
  const reviewsCount = db.reviews.length;
  const average =
    reviewsCount > 0
      ? Number(
          (
            db.reviews.reduce((sum, r) => sum + r.rating, 0) / reviewsCount
          ).toFixed(1),
        )
      : 5.0;

  return (
    <LandingView
      initialSettings={toPublicSettingsDTO(db.settings)}
      categories={db.categories.toSorted((a, b) => a.displayOrder - b.displayOrder)}
      services={db.services
        .filter((s) => s.isActive)
        .toSorted((a, b) => a.displayOrder - b.displayOrder)
        .map(toPublicServiceDTO)}
      addons={db.addons
        .filter((a) => a.isActive)
        .toSorted((a, b) => a.displayOrder - b.displayOrder)}
      staff={db.staff
        .filter((s) => s.isActive)
        .toSorted((a, b) => a.displayOrder - b.displayOrder)
        .map(toPublicStaffDTO)}
      gallery={db.gallery.toSorted((a, b) => a.displayOrder - b.displayOrder)}
      reviewsSummary={{ count: reviewsCount, average }}
    />
  );
}
