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

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSent(false);
    }
    onOpenChange(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceId) return;
    const res = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serviceId,
        preferredStaffId: selectedStaffId === 'any' ? null : selectedStaffId,
        desiredDate: selectedDate,
        preferredWindow: windowPref,
        clientName: name,
        clientPhoneE164: phone,
        notes: 'Solicitado desde agenda web',
      }),
    });
    if (res.ok) {
      setSent(true);
    }
  };

  return (
    <Dialog isOpen={isOpen} onOpenChange={handleOpenChange} width={460} padding={5}>
      <DialogHeader
        title="Lista de espera"
        subtitle={`Te avisaremos por WhatsApp si se libera un espacio el ${selectedDate}.`}
        onOpenChange={handleOpenChange}
      />
      {sent ? (
        <VStack gap={4} paddingBlockStart={4}>
          <Banner
            status="success"
            title="¡Te anotamos en la lista de espera!"
            description="En cuanto se libere un espacio compatible te escribiremos de inmediato."
          />
          <Button
            label="Cerrar"
            variant="primary"
            width="100%"
            onClick={() => handleOpenChange(false)}
          />
        </VStack>
      ) : (
        <form onSubmit={handleSubmit}>
          <VStack gap={3} paddingBlockStart={4}>
            <TextInput
              label="Tu nombre"
              value={name}
              onChange={setName}
              isRequired
            />
            <TextInput
              label="Tu WhatsApp"
              type="tel"
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
            />
          </VStack>
        </form>
      )}
    </Dialog>
  );
}
