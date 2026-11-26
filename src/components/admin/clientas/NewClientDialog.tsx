'use client';

import React, { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';

interface NewClientDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateClient: (input: {
    fullName: string;
    phone: string;
    email: string | null;
    instagramHandle: string | null;
    birthday: string | null;
    technicalNotes: string;
  }) => Promise<{ ok: boolean; error?: string; conflict?: boolean }>;
}

export function NewClientDialog({
  isOpen,
  onOpenChange,
  onCreateClient,
}: NewClientDialogProps) {
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newInstagram, setNewInstagram] = useState('');
  const [newBirthday, setNewBirthday] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createConflict, setCreateConflict] = useState(false);
  const [creating, setCreating] = useState(false);

  const resetForm = () => {
    setNewName('');
    setNewPhone('');
    setNewEmail('');
    setNewInstagram('');
    setNewBirthday('');
    setNewNotes('');
    setCreateError(null);
    setCreateConflict(false);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) resetForm();
    onOpenChange(open);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    setCreateConflict(false);
    try {
      const result = await onCreateClient({
        fullName: newName,
        phone: newPhone,
        email: newEmail.trim() || null,
        instagramHandle: newInstagram.trim() || null,
        birthday: newBirthday.trim() || null,
        technicalNotes: newNotes.trim(),
      });
      if (!result.ok) {
        setCreateConflict(Boolean(result.conflict));
        setCreateError(result.error || 'Revisa los datos ingresados.');
        return;
      }
      resetForm();
      onOpenChange(false);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog isOpen={isOpen} onOpenChange={handleOpenChange} width={500} padding={5}>
      <DialogHeader
        title="Nueva clienta"
        subtitle="Agrega a tu clienta al directorio del salón."
        onOpenChange={handleOpenChange}
      />
      <form onSubmit={(e) => void handleSubmit(e)}>
        <VStack gap={3} paddingBlockStart={4} className="fx-sheet-in">
          {createError ? (
            <Banner
              status={createConflict ? 'warning' : 'error'}
              title={
                createConflict ? 'WhatsApp ya registrado' : 'No se pudo guardar la clienta'
              }
              description={createError}
            />
          ) : null}
          <TextInput
            label="Nombre completo"
            placeholder="Ej. Sofía Ramírez"
            value={newName}
            onChange={setNewName}
            isRequired
          />
          <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
            <TextInput
              label="WhatsApp"
              type="tel"
              placeholder="222 123 4567"
              value={newPhone}
              onChange={setNewPhone}
              isRequired
            />
            <TextInput
              label="Instagram"
              placeholder="@usuario"
              value={newInstagram}
              onChange={setNewInstagram}
              isOptional
            />
          </Grid>
          <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
            <TextInput
              label="Correo electrónico"
              type="email"
              placeholder="clienta@correo.com"
              value={newEmail}
              onChange={setNewEmail}
              isOptional
            />
            <TextInput
              label="Cumpleaños (AAAA-MM-DD)"
              placeholder="1997-08-15"
              value={newBirthday}
              onChange={setNewBirthday}
              isOptional
            />
          </Grid>
          <TextArea
            label="Notas y preferencias (uñas, tonos, alergias)"
            placeholder="Ej. Forma almendra corta, base milky nude..."
            value={newNotes}
            onChange={setNewNotes}
            rows={3}
            isOptional
          />
          <Button
            type="submit"
            label="Guardar clienta"
            variant="primary"
            width="100%"
            isLoading={creating}
          />
        </VStack>
      </form>
    </Dialog>
  );
}
