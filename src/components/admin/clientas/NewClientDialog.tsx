'use client';

import React, { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';

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
    <Dialog
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      width={520}
      maxHeight="min(90dvh, calc(100dvh - 2rem))"
      padding={5}
    >
      <Layout
        header={
          <DialogHeader
            title="Nueva clienta"
            subtitle="Agrega a tu clienta al directorio del salón."
            hasDivider
            onOpenChange={handleOpenChange}
          />
        }
        content={
          <LayoutContent>
            <form id="new-client-form" onSubmit={(e) => void handleSubmit(e)}>
              <VStack gap={3}>
                {createError ? (
                  <Banner
                    status={createConflict ? 'warning' : 'error'}
                    role="alert"
                    title={
                      createConflict ? 'WhatsApp ya registrado' : 'No se pudo guardar la clienta'
                    }
                    description={createError}
                  />
                ) : null}
                <TextInput
                  label="Nombre completo"
                  placeholder="Ejemplo: Sofía Ramírez"
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
                    label="Cumpleaños"
                    placeholder="Ejemplo: 1997-08-15 (año-mes-día)"
                    value={newBirthday}
                    onChange={setNewBirthday}
                    isOptional
                  />
                </Grid>
                <TextArea
                  label="Notas y preferencias (uñas, tonos, alergias)"
                  placeholder="Ejemplo: Forma almendra corta, base milky nude…"
                  value={newNotes}
                  onChange={setNewNotes}
                  rows={3}
                  isOptional
                />
              </VStack>
            </form>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack gap={2} justify="end" wrap="wrap">
              <Button
                type="button"
                label="Cancelar"
                variant="secondary"
                isDisabled={creating}
                onClick={() => handleOpenChange(false)}
              />
              <Button
                type="submit"
                form="new-client-form"
                label="Guardar clienta"
                variant="primary"
                isLoading={creating}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
