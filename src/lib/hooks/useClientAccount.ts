'use client';

import { useState } from 'react';
import { ClientPortalProfileResponseSchema, type ClientPortalProfile } from '@/lib/contracts';

const PROFILE_ENDPOINT = '/api/client-portal/profile';
const SESSION_ENDPOINT = '/api/client-portal/otp';

async function fetchClientProfile(): Promise<ClientPortalProfile | null> {
  const res = await fetch(PROFILE_ENDPOINT, { cache: 'no-store', credentials: 'same-origin' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error('profile_unavailable');
  const parsed = ClientPortalProfileResponseSchema.safeParse(await res.json());
  if (!parsed.success) throw new Error('profile_invalid');
  return parsed.data.authenticated ? parsed.data.profile : null;
}

export function useClientAccount(initialProfile: ClientPortalProfile | null) {
  const [profile, setProfile] = useState<ClientPortalProfile | null>(initialProfile);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const refreshProfile = async (): Promise<ClientPortalProfile | null> => {
    try {
      const next = await fetchClientProfile();
      setProfile(next);
      return next;
    } catch {
      return null;
    }
  };

  const signOut = async (): Promise<ClientPortalProfile | null> => {
    const previous = profile;
    setIsSigningOut(true);
    try {
      await fetch(SESSION_ENDPOINT, { method: 'DELETE', credentials: 'same-origin' });
    } catch {
      setIsSigningOut(false);
      return null;
    }
    setProfile(null);
    setIsSigningOut(false);
    return previous;
  };

  return { profile, isSigningOut, refreshProfile, signOut };
}

