import { selectClientPortalProfile } from '../client-account';
import type { ClientPortalProfile } from '../contracts';
import type { ClientProfile } from '../types';
import { readClientPortalSession } from './client-portal-otp';

export async function readSignedInClientProfile(
  clients: readonly ClientProfile[],
): Promise<ClientPortalProfile | null> {
  const session = await readClientPortalSession();
  return session ? selectClientPortalProfile(clients, session.phoneE164) : null;
}
