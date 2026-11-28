import {
  selectClientPortalProfile,
  type ClientPortalHistoryContext,
} from '../client-account';
import type { ClientPortalProfile } from '../contracts';
import type { PublicServiceDTO, PublicStaffDTO } from '../public-dto';
import { getRepository } from '../repositories/db';
import { readClientPortalSession } from './client-portal-otp';

export async function readSignedInClientProfile(catalog?: {
  services: readonly PublicServiceDTO[];
  staff: readonly PublicStaffDTO[];
}): Promise<ClientPortalProfile | null> {
  const session = await readClientPortalSession();
  if (!session) return null;
  const record = await getRepository().getClientPortalRecordByPhone(session.phoneE164);
  const history: ClientPortalHistoryContext | undefined =
    record.client && catalog
      ? {
          bookings: record.latestBooking ? [record.latestBooking] : [],
          services: catalog.services.map((srv) => ({
            id: srv.id,
            slug: srv.slug,
            name: srv.name,
            isActive: true,
            isPrivate: srv.isPrivate,
          })),
          staff: catalog.staff.map((member) => ({
            id: member.id,
            bookingSlug: member.bookingSlug,
            name: member.name,
            isActive: true,
          })),
        }
      : undefined;
  return selectClientPortalProfile(
    record.client ? [record.client] : [],
    session.phoneE164,
    history,
  );
}
