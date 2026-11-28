import type {
  OnboardingProfileState,
  OnboardingServiceState,
} from '@/components/admin/onboarding/OnboardingStepFormCard';
import { fetchJsonWithTimeout } from '@/lib/http/client-fetch';
import type { PaymentMode } from '@/lib/types';

export async function postOnboardingJson(
  url: string,
  method: 'POST' | 'PATCH',
  body: Record<string, unknown>,
  fallbackError: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await fetchJsonWithTimeout(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!result.ok) {
    return { ok: false, error: result.error || fallbackError };
  }
  return { ok: true };
}

export async function submitOnboardingStep(params: {
  stepIndex: number;
  profile: OnboardingProfileState;
  fallbackSalonName: string;
  currentPaymentMode: PaymentMode;
  depositEnabled: boolean;
  depositAmountMxn: number;
  depositBank: string;
  depositHolder: string;
  depositClabe: string;
  instagramHandle: string;
  serviceDraft: OnboardingServiceState;
}): Promise<{ ok: true; nextStep: number; openNotifDialog?: boolean } | { ok: false; error: string }> {
  const {
    stepIndex,
    profile,
    fallbackSalonName,
    currentPaymentMode,
    depositEnabled,
    depositAmountMxn,
    depositBank,
    depositHolder,
    depositClabe,
    instagramHandle,
    serviceDraft,
  } = params;

  if (stepIndex === 0) {
    const trimmedName = profile.salonName.trim();
    if (trimmedName.length < 2) {
      return {
        ok: false,
        error: 'Escribe al menos 2 letras para el nombre de tu salón.',
      };
    }
    const result = await postOnboardingJson(
      '/api/admin/onboarding',
      'POST',
      { ...profile, salonName: trimmedName, address: profile.address.trim() },
      'No se pudo guardar este paso.',
    );
    return result.ok ? { ok: true, nextStep: 1 } : result;
  }

  if (stepIndex === 1) {
    const nextPaymentMode: PaymentMode = depositEnabled
      ? currentPaymentMode === 'none'
        ? 'manual_transfer'
        : currentPaymentMode
      : 'none';
    const result = await postOnboardingJson(
      '/api/admin/brand',
      'PATCH',
      {
        paymentMode: nextPaymentMode,
        depositAmountCents: Math.max(0, Math.round(depositAmountMxn * 100)),
        depositBankName: depositBank.trim(),
        depositBeneficiary: depositHolder.trim(),
        depositAccountHolder: depositHolder.trim(),
        depositClabe: depositClabe.trim(),
        instagramHandle: instagramHandle.trim(),
      },
      'No se pudieron guardar los datos del anticipo.',
    );
    return result.ok ? { ok: true, nextStep: 2 } : result;
  }

  const trimmedService = serviceDraft.name.trim();
  if (trimmedService.length < 2) {
    return { ok: false, error: 'Escribe el nombre de tu servicio principal.' };
  }
  const result = await postOnboardingJson(
    '/api/admin/onboarding',
    'POST',
    {
      ...profile,
      salonName: profile.salonName.trim() || fallbackSalonName,
      address: profile.address.trim(),
      onboardingCompleted: true,
      starterService: {
        id: serviceDraft.id ?? undefined,
        name: trimmedService,
        priceCents: Math.max(0, Math.round(serviceDraft.priceMxn * 100)),
        durationMinutes: serviceDraft.durationMinutes,
        isStartingPrice: serviceDraft.isStartingPrice,
      },
    },
    'No se pudo guardar este paso.',
  );
  return result.ok ? { ok: true, nextStep: 3, openNotifDialog: true } : result;
}
