import { getSnapshot } from '@/lib/repositories/db';
import { getDateKeyInTimezone } from '@/lib/format';
import {
  toPublicServiceDTO,
  toPublicSettingsDTO,
  toPublicStaffDTO,
} from '@/lib/public-dto';
import { BookingWidget } from '@/components/BookingWidget';

export const dynamic = 'force-dynamic';

export default async function ReservarServicioPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ staff?: string; inspo?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const db = getSnapshot();
  const initialTodayKey = getDateKeyInTimezone(
    new Date(),
    db.settings.timezone || 'America/Mexico_City',
  );

  return (
    <BookingWidget
      settings={toPublicSettingsDTO(db.settings)}
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
      initialTodayKey={initialTodayKey}
      initialServiceSlug={slug}
      initialStaffSlug={query.staff}
      initialInspoNote={query.inspo}
    />
  );
}
