'use client';

import { BrandIcon } from '@/components/brand/BrandIcon';
import type React from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Dialog } from '@astryxdesign/core/Dialog';
import { ArrowLeft, ShieldCheck, X } from 'lucide-react';
import { useClientOtpFlow } from '@/lib/hooks/useClientOtpFlow';
import { LANDING_ASSETS } from '../landing/landingContent';
import { formatMxPhoneDisplay } from './bookingHelpers';

export type ClientSignInIntent = 'signin' | 'register';

interface ClientSignInDialogProps {
  intent: ClientSignInIntent;
  initialPhone: string;
  hasHeldSlot?: boolean;
  onClose: () => void;
  onVerified: () => Promise<void>;
}

function describeChannel(channel: 'whatsapp' | 'sms' | 'email', rawPhone: string): string {
  const phone = rawPhone.replace(/ /g, ' ');
  if (channel === 'email') return 'Lo mandamos al correo de tu cuenta.';
  if (channel === 'sms') return `Lo mandamos por SMS al ${phone}.`;
  return `Lo mandamos por WhatsApp al ${phone}.`;
}

export function ClientSignInDialog({
  intent,
  initialPhone,
  hasHeldSlot = false,
  onClose,
  onVerified,
}: ClientSignInDialogProps) {
  const otp = useClientOtpFlow(formatMxPhoneDisplay(initialPhone));
  const isCodeStep = otp.step !== 'phone';
  const title = isCodeStep
    ? 'Escribe tu código'
    : intent === 'register'
      ? 'Guarda tus datos'
      : 'Entra con tu WhatsApp';
  const subtitle = isCodeStep
    ? describeChannel(otp.channel, formatMxPhoneDisplay(otp.sentToPhone || otp.phone))
    : intent === 'register'
      ? 'Verificamos tu número y la próxima vez llenamos todo por ti.'
      : 'Sin contraseñas: te llega un código y llenamos tus datos por ti.';
  const phoneDigits = otp.phone.replace(/\D/g, '');

  const close = () => {
    if (!otp.isBusy) onClose();
  };

  const handleRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneDigits.length !== 10) return;
    void otp.requestCode();
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await otp.verifyCode();
    if (!ok) return;
    await onVerified();
    onClose();
  };

  return (
    <Dialog
      isOpen
      onOpenChange={(next) => {
        if (!next) close();
      }}
      purpose="form"
      width="min(27rem, 94vw)"
      maxHeight="92dvh"
      padding={0}
    >
      <VStack gap={0} className="lk-portal rb-signin">
        <VStack gap={3} className="rb-signin-head">
          <HStack justify="between" align="center" gap={2}>
            {isCodeStep ? (
              <Button
                type="button"
                label="Cambiar número"
                variant="ghost"
                size="sm"
                isIconOnly
                icon={<ArrowLeft size={18} aria-hidden="true" />}
                className="rb-signin-icon"
                isDisabled={otp.isBusy}
                onClick={otp.changePhone}
              />
            ) : (
              <img
                src={LANDING_ASSETS.logoWhite}
                alt=""
                aria-hidden="true"
                width={96}
                height={34}
                className="rb-signin-logo"
              />
            )}
            <HStack gap={2} align="center">
              <Text type="supporting" color="inherit" className="rb-signin-step" hasTabularNumbers>
                Paso {isCodeStep ? 2 : 1} de 2
              </Text>
              <Button
                type="button"
                label="Cerrar"
                variant="ghost"
                size="sm"
                isIconOnly
                icon={<X size={18} aria-hidden="true" />}
                className="rb-signin-icon"
                isDisabled={otp.isBusy}
                onClick={close}
              />
            </HStack>
          </HStack>
          <VStack gap={1} key={isCodeStep ? 'code' : 'phone'} className="fx-sheet-in">
            <Heading level={2} color="inherit" className="lk-serif rb-signin-title">
              {title}
            </Heading>
            <Text color="inherit" className="rb-signin-sub" textWrap="pretty">
              {subtitle}
            </Text>
          </VStack>
        </VStack>

        <VStack gap={4} className="rb-signin-body">
          {otp.error ? <Banner status="error" role="alert" title={otp.error} /> : null}

          {!isCodeStep ? (
            <form onSubmit={handleRequest} noValidate key="phone" className="fx-sheet-in">
              <VStack gap={4}>
                <TextInput
                  htmlName="signInPhone"
                  label="Tu número de WhatsApp"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  enterKeyHint="send"
                  size="lg"
                  placeholder="10 dígitos"
                  startIcon={<Text weight="semibold">+52</Text>}
                  value={otp.phone}
                  onChange={(value) => otp.setPhone(formatMxPhoneDisplay(value))}
                  isDisabled={otp.isBusy}
                  hasAutoFocus
                />
                <Button
                  type="submit"
                  label="Mandarme el código"
                  variant="primary"
                  size="lg"
                  width="100%"
                  icon={<BrandIcon name="whatsapp" size={1.375} />}
                  className="fx-press"
                  isLoading={otp.isBusy}
                  isDisabled={phoneDigits.length !== 10}
                />
                <HStack gap={2} align="start" className="rb-signin-note">
                  <ShieldCheck size={16} aria-hidden="true" />
                  <Text type="supporting" color="secondary" textWrap="pretty">
                    {hasHeldSlot
                      ? 'Tu horario sigue apartado mientras entras.'
                      : 'Solo lo usamos para tus citas. Nada de spam.'}
                  </Text>
                </HStack>
              </VStack>
            </form>
          ) : (
            <form onSubmit={(e) => void handleVerify(e)} noValidate key="code" className="fx-sheet-in">
              <VStack gap={4}>
                {otp.demoCode ? (
                  <Banner
                    status="info"
                    title={`Código de prueba: ${otp.demoCode}`}
                    description="Solo aparece en modo demo."
                    endContent={
                      <Button
                        type="button"
                        label="Usar código"
                        variant="secondary"
                        size="sm"
                        onClick={otp.fillDemoCode}
                      />
                    }
                  />
                ) : null}
                <VStack className="rb-signin-code" gap={0}>
                <TextInput
                  htmlName="signInCode"
                  label="Código de 6 dígitos"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  enterKeyHint="done"
                  size="lg"
                  placeholder="••••••"
                  hasAutoCorrect={false}
                  value={otp.code}
                  onChange={(value) => otp.setCode(value.replace(/\D/g, '').slice(0, 6))}
                  isDisabled={otp.isBusy}
                  hasAutoFocus
                />
                </VStack>
                <Button
                  type="submit"
                  label="Entrar"
                  variant="primary"
                  size="lg"
                  width="100%"
                  className="fx-press"
                  isLoading={otp.isBusy}
                  isDisabled={otp.code.length !== 6}
                />
                <HStack justify="center" gap={1} wrap="wrap" align="center">
                  <Text type="supporting" color="secondary">
                    ¿No te llegó?
                  </Text>
                  <Button
                    type="button"
                    label="Reenviar código"
                    variant="ghost"
                    size="sm"
                    isDisabled={otp.isBusy}
                    onClick={() => void otp.requestCode()}
                  />
                </HStack>
              </VStack>
            </form>
          )}
        </VStack>
      </VStack>
    </Dialog>
  );
}
