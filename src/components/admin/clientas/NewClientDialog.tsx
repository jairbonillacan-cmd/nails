'use client';

import type React from 'react';
import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Grid } from '@astryxdesign/core/Grid';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { DateInput } from '@astryxdesign/core/DateInput';
import type { ISODateString } from '@astryxdesign/core/Calendar';
import { FormDialog, type FormDialogControls } from '@/components/ui/FormDialog';
import {
  FORM_SUBMIT_OK,
  formSubmitError,
  type FormSubmitResult,
} from '@/lib/forms/form-submit';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toIsoDateString(value: string): ISODateString | undefined {
  return ISO_DATE_RE.test(value) ? (value as ISODateString) : undefined;
}

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

interface NewClientFormBodyProps {
  newName: string;
  setNewName: (value: string) => void;
  newPhone: string;
  setNewPhone: (value: string) => void;
  newEmail: string;
  setNewEmail: (value: string) => void;
  newInstagram: string;
  setNewInstagram: (value: string) => void;
  newBirthday: string;
  setNewBirthday: (value: string) => void;
  newNotes: string;
  setNewNotes: (value: string) => void;
  onCreateClient: NewClientDialogProps['onCreateClient'];
  controls: FormDialogControls;
}

function NewClientFormBody({
  newName,
  setNewName,
  newPhone,
  setNewPhone,
  newEmail,
  setNewEmail,
  newInstagram,
  setNewInstagram,
  newBirthday,
  setNewBirthday,
  newNotes,
  setNewNotes,
  onCreateClient,
  controls,
}: NewClientFormBodyProps) {
  const createClient = async (): Promise<FormSubmitResult> => {
    const result = await onCreateClient({
      fullName: newName.trim(),
      phone: newPhone.trim(),
      email: newEmail.trim() || null,
      instagramHandle: newInstagram.trim() || null,
      birthday: newBirthday.trim() || null,
      technicalNotes: newNotes.trim(),
    });
    if (!result.ok) {
      return formSubmitError(
        result.error ||
          (result.conflict
            ? 'Ya existe una clienta registrada con ese WhatsApp.'
            : 'Revisa los datos ingresados.'),
      );
    }
    return FORM_SUBMIT_OK;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) return;
    controls.submit(createClient);
  };

  return (
    <form id="new-client-form" onSubmit={handleSubmit}>
      <VStack gap={3}>
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
          <DateInput
            label="Cumpleaños"
            value={toIsoDateString(newBirthday)}
            format="date_long"
            placeholder="Selecciona una fecha"
            hasClear
            isOptional
            onChange={(val) => setNewBirthday(val ?? '')}
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
  );
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

  const resetForm = () => {
    setNewName('');
    setNewPhone('');
    setNewEmail('');
    setNewInstagram('');
    setNewBirthday('');
    setNewNotes('');
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) resetForm();
    onOpenChange(open);
  };

  return (
    <FormDialog
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      title="Nueva clienta"
      subtitle="Agrega a tu clienta al directorio del salón."
      width="min(32rem, 96vw)"
      submitFooter={{
        formId: 'new-client-form',
        submitLabel: 'Guardar clienta',
        isSubmitDisabled: !newName.trim() || !newPhone.trim(),
      }}
    >
      {(controls) => (
        <NewClientFormBody
          newName={newName}
          setNewName={setNewName}
          newPhone={newPhone}
          setNewPhone={setNewPhone}
          newEmail={newEmail}
          setNewEmail={setNewEmail}
          newInstagram={newInstagram}
          setNewInstagram={setNewInstagram}
          newBirthday={newBirthday}
          setNewBirthday={setNewBirthday}
          newNotes={newNotes}
          setNewNotes={setNewNotes}
          onCreateClient={onCreateClient}
          controls={controls}
        />
      )}
    </FormDialog>
  );
}
