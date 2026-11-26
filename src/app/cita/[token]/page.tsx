import type { Metadata } from 'next';
import '../../cita.css';
import { notFound } from 'next/navigation';
import { getRepository } from '@/lib/repositories/db';
import { buildCalendarAddLinks } from '@/lib/ics';
import { buildBookingWhatsAppFallbackUrl } from '@/lib/integrations/notifications';
import { getRuntimeIntegrationStatus } from '@/lib/env';
import { computeClientLoyaltySummary } from '@/lib/loyalty/stamps';
import {
  PublicLoyaltySummarySchema,
  toPublicServiceDTO,
  toPublicSettingsDTO,
  toPublicStaffDTO,
  type PublicLoyaltySummaryDTO,
} from '@/lib/public-dto';
import { ManageBookingView } from '@/components/ManageBookingView';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const booking = await getRepository().getBookingByToken(token);
  if (!booking) {
    notFound();
  }
  return {
    title: 'Tu cita',
    description:
      'Consulta, reagenda o gestiona tu cita en LAIKONA NAILS desde tu enlace personal.',
    robots: { index: false, follow: false },
  };
}

export default async function ManageBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ action?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const repo = getRepository();
  const booking = await repo.getBookingByToken(token);
  if (!booking) {
    notFound();
  }
  const db = await repo.getSnapshot();
  const env = getRuntimeIntegrationStatus();
  const manageUrl = `${env.appUrl}/cita/${booking.manageToken}`;
  const initialAction: 'reschedule' | 'cancel' | 'confirm' | undefined =
    query.action === 'reschedule'
      ? 'reschedule'
      : query.action === 'cancel'
        ? 'cancel'
        : query.action === 'confirm'
          ? 'confirm'
          : undefined;

  const activeLoyaltyProgram =
    (db.loyaltyPrograms ?? []).find((program) => program.isActive) ?? null;
  const rewardServiceName = activeLoyaltyProgram?.rewardServiceId
    ? db.services.find((srv) => srv.id === activeLoyaltyProgram.rewardServiceId)
        ?.name ?? null
    : null;
  const initialLoyaltySummary: PublicLoyaltySummaryDTO | null =
    activeLoyaltyProgram
      ? PublicLoyaltySummarySchema.parse(
          computeClientLoyaltySummary(
            activeLoyaltyProgram,
            db.loyaltyStamps ?? [],
            booking.clientId,
            rewardServiceName,
          ),
        )
      : null;

  const extraServices = (booking.extraServiceIds ?? [])
    .filter((id) => id !== booking.serviceId)
    .map((id) => db.services.find((srv) => srv.id === id))
    .filter((srv): srv is (typeof db.services)[number] => Boolean(srv))
    .map(toPublicServiceDTO);

  const initialBooking = {
    ...booking,
    internalNotes: '',
    client: {
      ...booking.client,
      notes: '',
    },
    staff: toPublicStaffDTO(booking.staff),
    service: toPublicServiceDTO(booking.service),
    extraServices,
  };

  return (
    <ManageBookingView
      initialBooking={initialBooking}
      settings={toPublicSettingsDTO(db.settings)}
      calendarLinks={buildCalendarAddLinks(booking, db.settings, manageUrl)}
      whatsappUrl={buildBookingWhatsAppFallbackUrl(booking, db.settings, env.appUrl)}
      manageUrl={manageUrl}
      initialLoyaltySummary={initialLoyaltySummary}
      initialAction={initialAction}
      renderedAtIso={new Date().toISOString()}
    />
  );
}
