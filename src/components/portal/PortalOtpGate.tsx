'use client';

import { BrandIcon } from '@/components/brand/BrandIcon';
import type React from 'react';
import { useRef, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { TextInput } from '@astryxdesign/core/TextInput';
import { ShieldCheck } from 'lucide-react';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import { useClientOtpFlow } from '@/lib/hooks/useClientOtpFlow';
import { formatMxPhoneDisplay } from '../booking/bookingHelpers';

interface PortalOtpGateProps {
  salonName: string;
  showDemoHint: boolean;
  infoMessage: string | null;
  onDismissInfo: () => void;
  onSetInfo: (message: string | null) => void;
  onLoadSnapshot: () => Promise<boolean>;
}

export function PortalOtpGate({
  salonName,
  showDemoHint,
  infoMessage,
  onDismissInfo,
  onSetInfo,
  onLoadSnapshot,
}: PortalOtpGateProps) {
  const otp = useClientOtpFlow('');
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const digitRefs = useRef<Array<HTMLInputElement | null>>([]);

  const busy = otp.isBusy || loadingSnapshot;
  const errorMessage = snapshotError ?? otp.error;
  const otpDigits = Array.from({ length: 6 }, (_, index) => otp.code[index] ?? '');
  const formattedSentPhone = formatMxPhoneDisplay(otp.sentToPhone || otp.phone);

  const clearErrors = () => {
    setSnapshotError(null);
    otp.clearError();
  };

  const focusDigit = (index: number) => {
    const target = digitRefs.current[index];
    if (target) {
      target.focus();
      target.select();
    }
  };

  const handleDigitChange = (index: number, raw: string) => {
    const onlyDigits = raw.replace(/\D/g, '');
    setSnapshotError(null);
    if (onlyDigits.length > 1) {
      const next = [...otpDigits];
      for (let i = 0; i < 6; i += 1) {
        const ch = onlyDigits[i];
        if (ch !== undefined) next[i] = ch;
      }
      otp.setCode(next.join(''));
      focusDigit(Math.min(onlyDigits.length, 5));
      return;
    }
    const next = [...otpDigits];
    next[index] = onlyDigits;
    otp.setCode(next.join(''));
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
    setSnapshotError(null);
    otp.setCode(pasted);
    focusDigit(Math.min(pasted.length, 5));
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setSnapshotError(null);
    onSetInfo(null);
    const result = await otp.requestCode();
    if (!result.ok) return;
    onSetInfo(
      result.channel === 'email'
        ? 'Te enviamos un código de 6 dígitos al correo registrado con tu número (válido 5 minutos).'
        : result.channel === 'sms'
          ? 'Te enviamos un código de 6 dígitos por SMS (válido 5 minutos).'
          : 'Te enviamos un código de 6 dígitos por WhatsApp (válido 5 minutos).',
    );
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setSnapshotError(null);
    onSetInfo(null);
    const verified = await otp.verifyCode();
    if (!verified) return;
    setLoadingSnapshot(true);
    try {
      const loaded = await onLoadSnapshot();
      if (!loaded) {
        setSnapshotError('Sesión iniciada, pero no pudimos cargar tus citas. Recarga la página.');
        return;
      }
      otp.setCode('');
    } finally {
      setLoadingSnapshot(false);
    }
  };

  return (
    <VStack gap={4} maxWidth={520} width="100%" style={{ marginInline: 'auto' }}>
      <SurfaceCard
        id="pt-login-title"
        headingLevel={2}
        title={otp.step === 'phone' ? 'Accede con tu WhatsApp' : 'Ingresa tu código'}
        subtitle={
          otp.step === 'phone'
            ? 'Sin contraseñas. Te mandamos un código temporal de 6 dígitos para proteger tu historial.'
            : otp.channel === 'email'
              ? 'Enviamos un código de 6 dígitos al correo asociado a tu número.'
              : `Enviamos un código de 6 dígitos al +52 ${formattedSentPhone}.`
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
              data-state={otp.step === 'phone' ? 'active' : 'done'}
            >
              01 · Tu WhatsApp
            </Text>
            <Text
              type="supporting"
              className="pt-step"
              data-state={otp.step === 'code' ? 'active' : 'pending'}
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
              dismissLabel="Cerrar aviso"
              onDismiss={clearErrors}
            />
          ) : null}

          {infoMessage ? (
            <Banner
              status="info"
              role="status"
              title={infoMessage}
              isDismissable
              dismissLabel="Cerrar aviso"
              onDismiss={onDismissInfo}
            />
          ) : null}

          {otp.step === 'phone' ? (
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
                  value={otp.phone}
                  onChange={(nextValue) => {
                    setSnapshotError(null);
                    otp.setPhone(formatMxPhoneDisplay(nextValue));
                  }}
                  isDisabled={busy}
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
                      isDisabled={busy}
                      onClick={() => {
                        setSnapshotError(null);
                        otp.setPhone('222 412 3987');
                      }}
                    />
                  ) : null}
                </HStack>
              </VStack>
            </form>
          ) : (
            <form onSubmit={(e) => void handleVerifyOtp(e)} noValidate>
              <VStack gap={4}>
                {otp.demoCode ? (
                  <VStack gap={2}>
                    <Banner
                      status="info"
                      title={`Código de prueba local: ${otp.demoCode}`}
                      description="Visible solo en entorno de demostración sin WhatsApp Cloud."
                    />
                    <HStack>
                      <Button
                        type="button"
                        label="Rellenar código demo"
                        variant="secondary"
                        size="md"
                        className="fx-press"
                        isDisabled={busy}
                        onClick={() => {
                          setSnapshotError(null);
                          otp.fillDemoCode();
                        }}
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
                        disabled={busy}
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
                  isDisabled={otp.code.length !== 6 || busy}
                  className="fx-press"
                />

                <HStack justify="between" gap={2} wrap="wrap">
                  <Button
                    type="button"
                    label="Cambiar número"
                    variant="ghost"
                    size="md"
                    className="fx-press"
                    isDisabled={busy}
                    onClick={() => {
                      setSnapshotError(null);
                      onSetInfo(null);
                      otp.changePhone();
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
            ¿Primera vez en {salonName}?
          </Text>
          <Button
            label="Agendar mi primera cita"
            variant="ghost"
            size="md"
            className="fx-press"
            icon={<BrandIcon name="calendario" size={1.125} />}
            href="/reservar"
          />
        </HStack>
        <Button
          label="Tus datos están protegidos · Aviso de privacidad"
          variant="ghost"
          size="md"
          href="/aviso-de-privacidad"
        />
      </VStack>
    </VStack>
  );
}
