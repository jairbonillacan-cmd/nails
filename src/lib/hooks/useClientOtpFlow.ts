'use client';

import { useState } from 'react';
import { ClientPortalOtpResponseSchema, type ClientPortalOtpResponse } from '@/lib/contracts';
import { fetchJsonWithTimeout } from '@/lib/http/client-fetch';

type OtpStep = 'phone' | 'code';
type OtpChannel = NonNullable<ClientPortalOtpResponse['channel']>;

type RequestOtpResult =
  | { ok: true; channel: OtpChannel; phoneE164: string }
  | { ok: false };

const OTP_ENDPOINT = '/api/client-portal/otp';

async function postOtp(
  body: Record<string, string>,
): Promise<{ ok: boolean; status: number; data: ClientPortalOtpResponse; error?: string }> {
  const res = await fetchJsonWithTimeout<unknown>(OTP_ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const parsed = ClientPortalOtpResponseSchema.safeParse(res.data ?? {});
  const data = parsed.success ? parsed.data : {};
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      data,
      error: res.status === 429 ? res.error : (data.error || res.error),
    };
  }
  return { ok: data.ok === true, status: res.status, data };
}

function sanitizeOtpCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 6);
}

export function useClientOtpFlow(initialPhone: string) {
  const [step, setStep] = useState<OtpStep>('phone');
  const [phone, setPhone] = useState(initialPhone);
  const [sentToPhone, setSentToPhone] = useState('');
  const [code, setCode] = useState('');
  const [channel, setChannel] = useState<OtpChannel>('whatsapp');
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestCode = async (): Promise<RequestOtpResult> => {
    if (isBusy) return { ok: false };
    setError(null);
    if (phone.replace(/\D/g, '').length < 10) {
      setError('Escribe tu WhatsApp a 10 dígitos.');
      return { ok: false };
    }
    setIsBusy(true);
    try {
      const res = await postOtp({ action: 'request', phone });
      if (!res.ok) {
        setError(res.error || res.data.error || 'No pudimos mandar tu código. Intenta de nuevo.');
        return { ok: false };
      }
      const nextPhone = res.data.phoneE164 || phone;
      const nextChannel = res.data.channel ?? 'whatsapp';
      setSentToPhone(nextPhone);
      setChannel(nextChannel);
      setDemoCode(res.data.demoCode ?? null);
      setCode('');
      setStep('code');
      return { ok: true, channel: nextChannel, phoneE164: nextPhone };
    } finally {
      setIsBusy(false);
    }
  };

  const verifyCode = async (): Promise<boolean> => {
    if (isBusy) return false;
    setError(null);
    if (code.length !== 6) {
      setError('Escribe los 6 dígitos de tu código.');
      return false;
    }
    setIsBusy(true);
    try {
      const res = await postOtp({ action: 'verify', phone: sentToPhone || phone, code });
      if (!res.ok) {
        const remaining =
          typeof res.data.attemptsRemaining === 'number' && res.data.attemptsRemaining > 0
            ? ` Te quedan ${res.data.attemptsRemaining} intentos.`
            : '';
        setError(`${res.error || res.data.error || 'Código incorrecto.'}${remaining}`);
        return false;
      }
      setDemoCode(null);
      return true;
    } finally {
      setIsBusy(false);
    }
  };

  return {
    step,
    phone,
    sentToPhone,
    code,
    channel,
    demoCode,
    isBusy,
    error,
    setPhone: (value: string) => {
      setPhone(value);
      setError(null);
    },
    setCode: (value: string) => {
      setCode(sanitizeOtpCode(value));
      setError(null);
    },
    clearError: () => setError(null),
    fillDemoCode: () => {
      if (demoCode) {
        setCode(demoCode);
        setError(null);
      }
    },
    changePhone: () => {
      setStep('phone');
      setDemoCode(null);
      setCode('');
      setError(null);
    },
    requestCode,
    verifyCode,
  };
}
