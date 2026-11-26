'use client';

import type React from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { useClientOtpFlow } from '@/lib/hooks/useClientOtpFlow';
import { formatMxPhoneDisplay } from './bookingHelpers';

export type ClientSignInIntent = 'signin' | 'register';

interface ClientSignInDialogProps {
  intent: ClientSignInIntent;
  initialPhone: string;
  onClose: () => void;
  onVerified: () => Promise<void>;
}

function describeChannel(channel: 'whatsapp' | 'sms' | 'email', phone: string): string {
  if (channel === 'email') return 'Te mandamos un código de 6 dígitos al correo de tu cuenta.';
  if (channel === 'sms') return `Te mandamos un código de 6 dígitos por SMS al ${phone}.`;
  return `Te mandamos un código de 6 dígitos por WhatsApp al ${phone}.`;
}

export function ClientSignInDialog({ intent, initialPhone, onClose, onVerified }: ClientSignInDialogProps) {
  const otp = useClientOtpFlow(formatMxPhoneDisplay(initialPhone));
  const title = intent === 'register' ? 'Crea tu cuenta' : 'Inicia sesión';
  const phoneSubtitle =
    intent === 'register'
      ? 'Sin contraseñas. Verifica tu WhatsApp y guardamos tus datos para tus próximas citas.'
      : 'Sin contraseñas. Te mandamos un código por WhatsApp y listo.';
  const sentToDisplay = formatMxPhoneDisplay(otp.sentToPhone || otp.phone);

  const handleRequest = (e: React.FormEvent) => {
    e.preventDefault();
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
        if (!next && !otp.isBusy) onClose();
      }}
      purpose="form"
      width="min(26rem, 94vw)"
      padding={5}
    >
      <VStack gap={4} className="lk-portal fx-sheet-in">
        <DialogHeader
          title={title}
          subtitle={
            otp.step === 'phone'
              ? phoneSubtitle
              : describeChannel(otp.channel, sentToDisplay)
          }
          onOpenChange={(next) => {
            if (!next && !otp.isBusy) onClose();
          }}
        />

        {otp.error ? (
          <Banner status="error" role="alert" title={otp.error} />
        ) : null}

        {otp.step === 'phone' ? (
          <form onSubmit={handleRequest} noValidate>
            <VStack gap={4}>
              <TextInput
                htmlName="signInPhone"
                label="Tu WhatsApp"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                enterKeyHint="send"
                size="lg"
                placeholder="222 123 4567"
                startIcon={<Text weight="semibold">+52</Text>}
                value={otp.phone}
                onChange={(value) => otp.setPhone(formatMxPhoneDisplay(value))}
                isDisabled={otp.isBusy}
                hasAutoFocus
                isRequired
              />
              <Button
                type="submit"
                label="Mandar código"
                variant="primary"
                size="lg"
                width="100%"
                className="fx-press"
                isLoading={otp.isBusy}
              />
              <Text type="supporting" color="secondary">
                Tu reserva y tu horario siguen apartados mientras tanto.
              </Text>
            </VStack>
          </form>
        ) : (
          <form onSubmit={(e) => void handleVerify(e)} noValidate>
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
              <TextInput
                htmlName="signInCode"
                label="Código de 6 dígitos"
                inputMode="numeric"
                autoComplete="one-time-code"
                enterKeyHint="done"
                size="lg"
                hasAutoCorrect={false}
                value={otp.code}
                onChange={otp.setCode}
                isDisabled={otp.isBusy}
                hasAutoFocus
                isRequired
              />
              <Button
                type="submit"
                label="Verificar"
                variant="primary"
                size="lg"
                width="100%"
                className="fx-press"
                isLoading={otp.isBusy}
                isDisabled={otp.code.length !== 6}
              />
              <HStack justify="between" gap={2} wrap="wrap">
                <Button
                  type="button"
                  label="Cambiar número"
                  variant="ghost"
                  size="md"
                  isDisabled={otp.isBusy}
                  onClick={otp.changePhone}
                />
                <Button
                  type="button"
                  label="Reenviar código"
                  variant="ghost"
                  size="md"
                  isDisabled={otp.isBusy}
                  onClick={() => void otp.requestCode()}
                />
              </HStack>
            </VStack>
          </form>
        )}
      </VStack>
    </Dialog>
  );
}
