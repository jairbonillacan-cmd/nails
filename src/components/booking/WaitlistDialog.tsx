'use client';

import type React from 'react';
import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { TextInput } from '@astryxdesign/core/TextInput';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';

interface WaitlistDialogProps {
  isOpen: boolean;
  serviceId: string | undefined;
  selectedStaffId: string;
  selectedDate: string;
  onOpenChange: (open: boolean) => void;
}

export function WaitlistDialog({
  isOpen,
  serviceId,
  selectedStaffId,
  selectedDate,
  onOpenChange,
}: WaitlistDialogProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [windowPref, setWindowPref] = useState<'morning' | 'afternoon' | 'any'>('any');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSent(false);
      setErrorMsg(null);
    }
    onOpenChange(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceId || submitting) return;
    if (!name.trim() || phone.replace(/\D/g, '').length < 10) {
      setErrorMsg('Escribe tu nombre y un WhatsApp de 10 dígitos.');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId,
          preferredStaffId: selectedStaffId === 'any' ? null : selectedStaffId,
          desiredDate: selectedDate,
          preferredWindow: windowPref,
          clientName: name.trim(),
          clientPhoneE164: phone.trim(),
          notes: 'Solicitado desde agenda web',
        }),
      });
      if (res.ok) {
        setSent(true);
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setErrorMsg(data.error || 'No pudimos registrarte. Intenta nuevamente.');
      }
    } catch {
      setErrorMsg('Error de conexión. Intenta nuevamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      purpose="form"
      width="min(28.75rem, 94vw)"
      maxHeight="85dvh"
      padding={5}
    >
      <VStack className="lk-portal fx-sheet-in">
        <DialogHeader
          title="Lista de espera"
          subtitle={`Te avisaremos por WhatsApp si se libera un espacio el ${selectedDate}.`}
          onOpenChange={handleOpenChange}
        />
        {sent ? (
          <VStack gap={4} paddingBlockStart={4} className="fx-pop">
            <Banner
              status="success"
              title="¡Te anotamos en la lista de espera!"
              description="En cuanto se libere un espacio compatible te escribiremos de inmediato."
            />
            <Button
              label="Cerrar"
              variant="primary"
              width="100%"
              className="fx-press"
              onClick={() => handleOpenChange(false)}
            />
          </VStack>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <VStack gap={3} paddingBlockStart={4}>
              {errorMsg ? (
                <Banner status="error" title="Revisa tus datos" description={errorMsg} />
              ) : null}
              <TextInput
                label="Tu nombre"
                placeholder="Ej. Sofía Ramírez"
                autoComplete="name"
                value={name}
                onChange={setName}
                isRequired
              />
              <TextInput
                label="Tu WhatsApp"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="222 123 4567"
                value={phone}
                onChange={setPhone}
                isRequired
              />
              <SegmentedControl
                label="Horario preferido"
                value={windowPref}
                onChange={(v) => setWindowPref(v as 'morning' | 'afternoon' | 'any')}
              >
                <SegmentedControlItem value="morning" label="Mañana" />
                <SegmentedControlItem value="afternoon" label="Tarde" />
                <SegmentedControlItem value="any" label="Cualquiera" />
              </SegmentedControl>
              <Button
                type="submit"
                label="Anotarme en lista de espera"
                variant="primary"
                width="100%"
                className="fx-press"
                isLoading={submitting}
              />
            </VStack>
          </form>
        )}
      </VStack>
    </Dialog>
  );
}
