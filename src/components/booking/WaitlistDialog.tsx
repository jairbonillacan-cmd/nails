'use client';

import type React from 'react';
import { useRef, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { TextInput } from '@astryxdesign/core/TextInput';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { normalizePhoneE164 } from '@/lib/format';
import {
  formatMxPhoneDisplay,
  isValidMxPhone,
  prefersReducedMotion,
} from './bookingHelpers';

interface WaitlistDialogProps {
  isOpen: boolean;
  serviceId: string | undefined;
  selectedStaffId: string;
  selectedDate: string;
  onOpenChange: (open: boolean) => void;
}

function focusWaitlistField(
  primary: HTMLInputElement | null,
  form: HTMLFormElement,
  fallbackSelector: string,
): void {
  const target = primary ?? form.querySelector<HTMLElement>(fallbackSelector);
  if (!target) return;
  target.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'center',
  });
  target.focus({ preventScroll: true });
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
  const submitLockRef = useRef(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSent(false);
      setErrorMsg(null);
      submitLockRef.current = false;
    }
    onOpenChange(next);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!serviceId || submitting || submitLockRef.current) return;
    if (!name.trim()) {
      setErrorMsg('Escribe tu nombre y un WhatsApp de 10 dígitos.');
      focusWaitlistField(nameInputRef.current, e.currentTarget, 'input[name="waitlistName"]');
      return;
    }
    if (!isValidMxPhone(phone)) {
      setErrorMsg('Escribe tu nombre y un WhatsApp de 10 dígitos.');
      focusWaitlistField(phoneInputRef.current, e.currentTarget, 'input[name="waitlistPhone"]');
      return;
    }
    submitLockRef.current = true;
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
          clientPhoneE164: normalizePhoneE164(phone),
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
      submitLockRef.current = false;
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
              role="status"
              title="Estás en la lista de espera"
              description="Si se libera un lugar que te sirva, te avisamos por WhatsApp."
            />
            <Button
              label="Cerrar"
              variant="primary"
              size="lg"
              width="100%"
              className="fx-press"
              onClick={() => handleOpenChange(false)}
            />
          </VStack>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <VStack
              gap={3}
              paddingBlockStart={4}
              className="fx-busy"
              data-busy={submitting ? 'true' : 'false'}
              aria-busy={submitting ? 'true' : 'false'}
            >
              {errorMsg ? (
                <Banner status="error" role="alert" title="Revisa tus datos" description={errorMsg} />
              ) : null}
              <TextInput
                ref={nameInputRef}
                htmlName="waitlistName"
                label="Tu nombre"
                placeholder="Ej. Sofía Ramírez"
                autoComplete="name"
                autoCapitalize="words"
                size="lg"
                value={name}
                onChange={setName}
                isRequired
              />
              <TextInput
                ref={phoneInputRef}
                htmlName="waitlistPhone"
                label="Tu WhatsApp"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="222 123 4567"
                startIcon={<Text weight="semibold">+52</Text>}
                size="lg"
                value={phone}
                onChange={(val) => setPhone(formatMxPhoneDisplay(val))}
                isRequired
              />
              <SegmentedControl
                label="Horario preferido"
                size="md"
                value={windowPref}
                onChange={(v) =>
                  setWindowPref(v === 'morning' || v === 'afternoon' ? v : 'any')
                }
              >
                <SegmentedControlItem value="morning" label="Mañana" />
                <SegmentedControlItem value="afternoon" label="Tarde" />
                <SegmentedControlItem value="any" label="Cualquiera" />
              </SegmentedControl>
              <Button
                type="submit"
                label={submitting ? 'Anotando…' : 'Anotarme en lista de espera'}
                variant="primary"
                size="lg"
                width="100%"
                className="fx-press"
                isDisabled={submitting}
                isLoading={submitting}
              />
            </VStack>
          </form>
        )}
      </VStack>
    </Dialog>
  );
}
