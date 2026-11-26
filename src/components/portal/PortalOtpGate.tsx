'use client';

import type React from 'react';
import { useRef, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { TextInput } from '@astryxdesign/core/TextInput';
import { CalendarCheck, ShieldCheck } from 'lucide-react';
import { SurfaceCard } from '@/components/ui/SurfaceCard';

interface PortalOtpGateProps {
  showDemoHint: boolean;
  infoMessage: string | null;
  onDismissInfo: () => void;
  onSetInfo: (message: string | null) => void;
  onLoadSnapshot: () => Promise<boolean>;
}

export function PortalOtpGate({
  showDemoHint,
  infoMessage,
  onDismissInfo,
  onSetInfo,
  onLoadSnapshot,
}: PortalOtpGateProps) {
  const [authStep, setAuthStep] = useState<'phone' | 'code'>('phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [verifiedPhoneE164, setVerifiedPhoneE164] = useState('');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [otpChannel, setOtpChannel] = useState<'whatsapp' | 'sms' | 'email'>('whatsapp');
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const digitRefs = useRef<Array<HTMLInputElement | null>>([]);
  const otpCode = otpDigits.join('');

  const focusDigit = (index: number) => {
    const target = digitRefs.current[index];
    if (target) {
      target.focus();
      target.select();
    }
  };

  const handleDigitChange = (index: number, raw: string) => {
    const onlyDigits = raw.replace(/\D/g, '');
    if (onlyDigits.length > 1) {
      const next = [...otpDigits];
      for (let i = 0; i < 6; i += 1) {
        const ch = onlyDigits[i];
        if (ch !== undefined) next[i] = ch;
      }
      setOtpDigits(next);
      focusDigit(Math.min(onlyDigits.length, 5));
      return;
    }
    const next = [...otpDigits];
    next[index] = onlyDigits;
    setOtpDigits(next);
    if (onlyDigits && index < 5) {
      focusDigit(index + 1);
    }
  };

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      focusDigit(index - 1);
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      focusDigit(index - 1);
    } else if (e.key === 'ArrowRight' && index < 5) {
      e.preventDefault();
      focusDigit(index + 1);
    }
  };

  const handleDigitPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const next = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i += 1) {
      next[i] = pasted[i] ?? '';
    }
    setOtpDigits(next);
    focusDigit(Math.min(pasted.length, 5));
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErrorMessage(null);
    onSetInfo(null);
    if (phoneInput.replace(/\D/g, '').length < 10) {
      setErrorMessage('Escribe tu número de WhatsApp a 10 dígitos.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/client-portal/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request', phone: phoneInput }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        phoneE164?: string;
        channel?: 'whatsapp' | 'sms' | 'email';
        demoCode?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setErrorMessage(data.error || 'No pudimos enviar tu código. Intenta de nuevo.');
        return;
      }
      const nextChannel = data.channel ?? 'whatsapp';
      setVerifiedPhoneE164(data.phoneE164 || phoneInput);
      setOtpChannel(nextChannel);
      setDemoCode(data.demoCode ?? null);
      setOtpDigits(['', '', '', '', '', '']);
      setAuthStep('code');
      onSetInfo(
        nextChannel === 'email'
          ? 'Te enviamos un código de 6 dígitos al correo registrado con tu número (válido 5 minutos).'
          : nextChannel === 'sms'
            ? 'Te enviamos un código de 6 dígitos por SMS (válido 5 minutos).'
            : 'Te enviamos un código de 6 dígitos por WhatsApp (válido 5 minutos).',
      );
    } catch {
      setErrorMessage('Error de conexión al enviar el código. Revisa tu internet.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErrorMessage(null);
    onSetInfo(null);
    if (otpCode.length !== 6) {
      setErrorMessage('Ingresa los 6 dígitos de tu código de verificación.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/client-portal/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify',
          phone: verifiedPhoneE164 || phoneInput,
          code: otpCode,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        attemptsRemaining?: number;
      };
      if (!res.ok || !data.ok) {
        const extra =
          typeof data.attemptsRemaining === 'number' && data.attemptsRemaining > 0
            ? ` Te quedan ${data.attemptsRemaining} intento(s).`
            : '';
        setErrorMessage(`${data.error || 'Código incorrecto.'}${extra}`);
        return;
      }

      const loaded = await onLoadSnapshot();
      if (!loaded) {
        setErrorMessage('Sesión iniciada, pero no pudimos cargar tus citas. Recarga la página.');
        return;
      }
      setDemoCode(null);
      setOtpDigits(['', '', '', '', '', '']);
    } catch {
      setErrorMessage('Error de conexión al verificar el código.');
    } finally {
      setBusy(false);
    }
  };

  const handleFillDemoCode = () => {
    if (!demoCode || demoCode.length !== 6) return;
    setOtpDigits(demoCode.split(''));
    setErrorMessage(null);
  };

  return (
    <VStack gap={4} maxWidth={520} width="100%" style={{ marginInline: 'auto' }}>
      <SurfaceCard
        id="pt-login-title"
        headingLevel={2}
        title={authStep === 'phone' ? 'Accede con tu WhatsApp' : 'Ingresa tu código'}
        subtitle={
          authStep === 'phone'
            ? 'Sin contraseñas. Te mandamos un código temporal de 6 dígitos para proteger tu historial.'
            : otpChannel === 'email'
              ? 'Enviamos un código de 6 dígitos al correo asociado a tu número.'
              : `Enviamos un código de 6 dígitos al ${verifiedPhoneE164}.`
        }
        icon={<ShieldCheck size={20} aria-hidden="true" className="lk-cereza-text" />}
        padded
        className="pt-card fx-fade-up"
      >
        <VStack gap={4}>
          <HStack
            gap={4}
            wrap="wrap"
            align="center"
            className="pt-steps"
            aria-label="Pasos de verificación"
          >
            <Text
              type="supporting"
              className="pt-step"
              data-state={authStep === 'phone' ? 'active' : 'done'}
            >
              01 · Tu WhatsApp
            </Text>
            <Text
              type="supporting"
              className="pt-step"
              data-state={authStep === 'code' ? 'active' : 'pending'}
            >
              02 · Código de 6 dígitos
            </Text>
          </HStack>

          {errorMessage ? (
            <Banner
              status="error"
              role="alert"
              title="No pudimos verificar"
              description={errorMessage}
              isDismissable
              onDismiss={() => setErrorMessage(null)}
            />
          ) : null}

          {infoMessage ? (
            <Banner
              status="info"
              role="status"
              title={infoMessage}
              isDismissable
              onDismiss={onDismissInfo}
            />
          ) : null}

          {authStep === 'phone' ? (
            <form onSubmit={(e) => void handleRequestOtp(e)} noValidate>
              <VStack gap={4}>
                <TextInput
                  label="Tu WhatsApp"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  size="lg"
                  placeholder="222 412 3987"
                  startIcon={<Text weight="semibold">+52</Text>}
                  value={phoneInput}
                  onChange={(nextValue) => {
                    setPhoneInput(nextValue);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  isRequired
                  description={
                    showDemoHint
                      ? 'Modo de prueba: usa 222 412 3987 (Sofía Ramírez).'
                      : 'Usa el mismo número con el que agendaste tus citas.'
                  }
                />
                <HStack gap={2} wrap="wrap">
                  <Button
                    type="submit"
                    label="Enviar código de verificación"
                    variant="primary"
                    size="lg"
                    width="100%"
                    isLoading={busy}
                    className="fx-press"
                  />
                  {showDemoHint ? (
                    <Button
                      type="button"
                      label="Usar teléfono demo (Sofía)"
                      variant="ghost"
                      size="md"
                      width="100%"
                      className="fx-press"
                      onClick={() => {
                        setPhoneInput('222 412 3987');
                        setErrorMessage(null);
                      }}
                    />
                  ) : null}
                </HStack>
              </VStack>
            </form>
          ) : (
            <form onSubmit={(e) => void handleVerifyOtp(e)} noValidate>
              <VStack gap={4}>
                {demoCode ? (
                  <VStack gap={2}>
                    <Banner
                      status="info"
                      title={`Código de prueba local: ${demoCode}`}
                      description="Visible solo en entorno de demostración sin WhatsApp Cloud."
                    />
                    <HStack>
                      <Button
                        type="button"
                        label="Rellenar código demo"
                        variant="secondary"
                        size="md"
                        className="fx-press"
                        onClick={handleFillDemoCode}
                      />
                    </HStack>
                  </VStack>
                ) : null}

                <VStack gap={1.5}>
                  <Text type="label" weight="semibold">
                    Código de 6 dígitos
                  </Text>
                  <HStack className="pt-otp-grid" role="group" aria-label="Código de verificación de 6 dígitos">
                    {otpDigits.map((digit, index) => (
                      <input
                        key={index}
                        ref={(el) => {
                          digitRefs.current[index] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        autoComplete={index === 0 ? 'one-time-code' : 'off'}
                        maxLength={6}
                        aria-label={`Dígito ${index + 1} de 6`}
                        value={digit}
                        onChange={(e) => handleDigitChange(index, e.target.value)}
                        onKeyDown={(e) => handleDigitKeyDown(index, e)}
                        onPaste={handleDigitPaste}
                      />
                    ))}
                  </HStack>
                </VStack>

                <Button
                  type="submit"
                  label="Verificar y entrar"
                  variant="primary"
                  size="lg"
                  width="100%"
                  isLoading={busy}
                  isDisabled={otpCode.length !== 6}
                  className="fx-press"
                />

                <HStack justify="between" gap={2} wrap="wrap">
                  <Button
                    type="button"
                    label="Cambiar número"
                    variant="ghost"
                    size="md"
                    className="fx-press"
                    onClick={() => {
                      setAuthStep('phone');
                      setErrorMessage(null);
                      setDemoCode(null);
                    }}
                  />
                  <Button
                    type="button"
                    label="Reenviar código"
                    variant="ghost"
                    size="md"
                    className="fx-press"
                    isDisabled={busy}
                    onClick={(e) => void handleRequestOtp(e)}
                  />
                </HStack>
              </VStack>
            </form>
          )}
        </VStack>
      </SurfaceCard>

      <VStack gap={2} align="center">
        <HStack justify="center" align="center" gap={2} wrap="wrap">
          <Text type="supporting" color="secondary">
            ¿Primera vez en LAIKONA NAILS?
          </Text>
          <Button
            label="Agendar mi primera cita"
            variant="ghost"
            size="md"
            className="fx-press"
            icon={<CalendarCheck size={15} aria-hidden="true" />}
            href="/reservar"
          />
        </HStack>
        <Button
          label="Tus datos están protegidos · Aviso de privacidad"
          variant="ghost"
          size="sm"
          href="/aviso-de-privacidad"
        />
      </VStack>
    </VStack>
  );
}
