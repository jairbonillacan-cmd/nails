'use client';

import { useCallback, useState } from 'react';
import { ClientPortalProfileResponseSchema, type ClientPortalProfile } from '@/lib/contracts';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import { fetchJsonWithTimeout } from '@/lib/http/client-fetch';

const PROFILE_ENDPOINT = '/api/client-portal/profile';

export interface ClientPortalProfileUpdateInput {
  fullName: string;
  email: string | null;
  instagramHandle: string | null;
  birthday: string | null;
}

export function useClientPortalProfile(shouldLoad: boolean) {
  const [profile, setProfile] = useState<ClientPortalProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const syncProfile = useCallback(async (signal: AbortSignal) => {
    if (!shouldLoad) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetchJsonWithTimeout<unknown>(PROFILE_ENDPOINT, {
        cache: 'no-store',
        credentials: 'same-origin',
        signal,
      });
      if (res.aborted || signal.aborted) return;
      if (!res.ok) {
        setLoadError(res.error || 'No pudimos cargar tus datos. Intenta de nuevo.');
        return;
      }
      const parsed = ClientPortalProfileResponseSchema.safeParse(res.data);
      if (!parsed.success || !parsed.data.authenticated) {
        setLoadError('Tu sesión expiró o no pudimos leer tus datos. Recarga la página.');
        return;
      }
      setProfile(parsed.data.profile);
      setLoadError(null);
    } finally {
      if (!signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [shouldLoad]);

  useExternalSync(
    shouldLoad ? `client-portal-profile:${reloadNonce}` : 'client-portal-profile:idle',
    syncProfile,
  );

  const saveProfile = useCallback(
    async (input: ClientPortalProfileUpdateInput): Promise<ClientPortalProfile | null> => {
      if (isSaving) return null;
      setIsSaving(true);
      setSaveError(null);
      setSaveSuccess(null);
      try {
        const res = await fetchJsonWithTimeout<unknown>(PROFILE_ENDPOINT, {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        if (!res.ok) {
          setSaveError(res.error || 'No pudimos guardar tus datos. Intenta de nuevo.');
          return null;
        }
        const parsed = ClientPortalProfileResponseSchema.safeParse(res.data);
        if (!parsed.success || !parsed.data.authenticated) {
          setSaveError('Recibimos una respuesta inesperada al guardar tus datos. Intenta de nuevo.');
          return null;
        }
        setProfile(parsed.data.profile);
        setSaveSuccess('Tus datos se guardaron correctamente.');
        return parsed.data.profile;
      } finally {
        setIsSaving(false);
      }
    },
    [isSaving],
  );

  const retryLoad = useCallback(() => {
    setReloadNonce((prev) => prev + 1);
  }, []);

  const dismissFeedback = useCallback(() => {
    setSaveError(null);
    setSaveSuccess(null);
  }, []);

  const reset = useCallback(() => {
    setProfile(null);
    setIsLoading(false);
    setLoadError(null);
    setIsSaving(false);
    setSaveError(null);
    setSaveSuccess(null);
  }, []);

  return {
    profile,
    isLoading,
    loadError,
    isSaving,
    saveError,
    saveSuccess,
    retryLoad,
    saveProfile,
    dismissFeedback,
    reset,
  };
}
