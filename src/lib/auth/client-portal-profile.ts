import {
  selectClientPortalProfile,
  type ClientPortalHistoryContext,
} from '../client-account';
import type { ClientPortalProfile } from '../contracts';
import type { ClientProfile } from '../types';
import { readClientPortalSession } from './client-portal-otp';

export async function readSignedInClientProfile(
  clients: readonly ClientProfile[],
  history?: ClientPortalHistoryContext,
): Promise<ClientPortalProfile | null> {
  const session = await readClientPortalSession();
  return session ? selectClientPortalProfile(clients, session.phoneE164, history) : null;
}
