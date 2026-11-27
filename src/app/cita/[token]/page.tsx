import { cache } from 'react';
import type { Metadata } from 'next';
import '../../cita.css';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/admin-session';
import { resolveStudioBarContext } from '@/lib/cita/studio-bar';
import {
  getBookingPaymentSummaryAsync,
  getClientLoyaltySummaryAsync,
  getRepository,
  getServicesByIdsAsync,
} from '@/lib/repositories/db';
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

const getManageBookingByToken = cache(async (token: string) =>
  getRepository().getBookingByToken(token),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const booking = await getManageBookingByToken(token);
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
  const booking = await getManageBookingByToken(token);
  if (!booking) {
    notFound();
  }
  const extraIds = (booking.extraServiceIds ?? []).filter(
    (id) => id !== booking.serviceId,
  );
  const [settings, extraServiceRecords, initialLoyaltySummary, adminSession] = await Promise.all([
    repo.getSalonSettings(),
    getServicesByIdsAsync(extraIds),
    getClientLoyaltySummaryAsync(booking.clientId),
    requireAdmin(),
  ]);
  const isAuthorizedStudioSession =
    adminSession !== null &&
    (adminSession.user.role === 'owner' ||
      adminSession.user.role === 'admin' ||
      (adminSession.user.role === 'specialist' &&
        Boolean(adminSession.user.staffMemberId) &&
        adminSession.user.staffMemberId === booking.staffId));
  const studioContext = isAuthorizedStudioSession
    ? resolveStudioBarContext({
        session: {
          role: adminSession.user.role,
          fullName: adminSession.user.fullName,
          staffMemberId: adminSession.user.staffMemberId,
        },
        booking: {
          id: booking.id,
          bookingCode: booking.bookingCode,
          staffId: booking.staffId,
          clientPhoneE164: booking.client.phoneE164,
        },
        paymentSummary: await getBookingPaymentSummaryAsync(
          booking.id,
          booking.totalPriceCents,
        ),
      })
    : null;
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

  const extraServices = extraIds
    .map((id) => extraServiceRecords.find((srv) => srv.id === id))
    .filter((srv): srv is (typeof extraServiceRecords)[number] => Boolean(srv))
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
      settings={toPublicSettingsDTO(settings)}
      calendarLinks={buildCalendarAddLinks(booking, settings, manageUrl)}
      whatsappUrl={buildBookingWhatsAppFallbackUrl(booking, settings, env.appUrl)}
      manageUrl={manageUrl}
      initialLoyaltySummary={initialLoyaltySummary}
      initialAction={initialAction}
      renderedAtIso={new Date().toISOString()}
      studioContext={studioContext}
    />
  );
}
