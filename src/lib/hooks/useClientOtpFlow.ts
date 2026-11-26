'use client';

import { useState } from 'react';
import { ClientPortalOtpResponseSchema, type ClientPortalOtpResponse } from '@/lib/contracts';

type OtpStep = 'phone' | 'code';
type OtpChannel = NonNullable<ClientPortalOtpResponse['channel']>;

const OTP_ENDPOINT = '/api/client-portal/otp';

async function postOtp(body: Record<string, string>): Promise<{ ok: boolean; data: ClientPortalOtpResponse }> {
  const res = await fetch(OTP_ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const parsed = ClientPortalOtpResponseSchema.safeParse(await res.json().catch(() => ({})));
  const data = parsed.success ? parsed.data : {};
  return { ok: res.ok && data.ok === true, data };
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

  const requestCode = async (): Promise<void> => {
    if (isBusy) return;
    setError(null);
    if (phone.replace(/\D/g, '').length < 10) {
      setError('Escribe tu WhatsApp a 10 dígitos.');
      return;
    }
    setIsBusy(true);
    try {
      const { ok, data } = await postOtp({ action: 'request', phone });
      if (!ok) {
        setError(data.error || 'No pudimos mandar tu código. Intenta de nuevo.');
        return;
      }
      setSentToPhone(data.phoneE164 || phone);
      setChannel(data.channel ?? 'whatsapp');
      setDemoCode(data.demoCode ?? null);
      setCode('');
      setStep('code');
    } catch {
      setError('Sin conexión. Revisa tu internet e intenta de nuevo.');
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
      const { ok, data } = await postOtp({ action: 'verify', phone: sentToPhone || phone, code });
      if (!ok) {
        const remaining =
          typeof data.attemptsRemaining === 'number' && data.attemptsRemaining > 0
            ? ` Te quedan ${data.attemptsRemaining} intentos.`
            : '';
        setError(`${data.error || 'Código incorrecto.'}${remaining}`);
        return false;
      }
      setDemoCode(null);
      return true;
    } catch {
      setError('Sin conexión. Revisa tu internet e intenta de nuevo.');
      return false;
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
    fillDemoCode: () => {
      if (demoCode) setCode(demoCode);
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
