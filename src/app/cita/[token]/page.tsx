import { notFound } from 'next/navigation';
import { getBookingByToken, getSnapshot } from '@/lib/repositories/db';
import { buildCalendarAddLinks } from '@/lib/ics';
import { buildBookingWhatsAppFallbackUrl } from '@/lib/integrations/notifications';
import { getRuntimeIntegrationStatus } from '@/lib/env';
import {
  toPublicServiceDTO,
  toPublicSettingsDTO,
  toPublicStaffDTO,
} from '@/lib/public-dto';
import { ManageBookingView } from '@/components/ManageBookingView';

export const dynamic = 'force-dynamic';

export default async function ManageBookingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const booking = getBookingByToken(token);
  if (!booking) {
    notFound();
  }
  const db = getSnapshot();
  const env = getRuntimeIntegrationStatus();
  const manageUrl = `${env.appUrl}/cita/${booking.manageToken}`;

  const initialBooking = {
    ...booking,
    internalNotes: '',
    staff: toPublicStaffDTO(booking.staff),
    service: toPublicServiceDTO(booking.service),
  };

  return (
    <ManageBookingView
      initialBooking={initialBooking}
      settings={toPublicSettingsDTO(db.settings)}
      calendarLinks={buildCalendarAddLinks(booking, db.settings, manageUrl)}
      whatsappUrl={buildBookingWhatsAppFallbackUrl(booking, db.settings, env.appUrl)}
    />
  );
}
