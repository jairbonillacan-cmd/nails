import { getSnapshot } from '@/lib/repositories/db';
import { getDateKeyInTimezone } from '@/lib/format';
import { BookingWidget } from '@/components/BookingWidget';

export const dynamic = 'force-dynamic';

export default async function ReservarPage({
  searchParams,
}: {
  searchParams: Promise<{ staff?: string; inspo?: string; servicio?: string }>;
}) {
  const params = await searchParams;
  const db = getSnapshot();
  const initialTodayKey = getDateKeyInTimezone(
    new Date(),
    db.settings.timezone || 'America/Mexico_City',
  );

  return (
    <BookingWidget
      settings={db.settings}
      services={db.services
        .filter((s) => s.isActive)
        .sort((a, b) => a.displayOrder - b.displayOrder)}
      addons={db.addons
        .filter((a) => a.isActive)
        .sort((a, b) => a.displayOrder - b.displayOrder)}
      staff={db.staff
        .filter((s) => s.isActive)
        .sort((a, b) => a.displayOrder - b.displayOrder)}
      initialTodayKey={initialTodayKey}
      initialServiceSlug={params.servicio}
      initialStaffSlug={params.staff}
      initialInspoNote={params.inspo}
    />
  );
}
