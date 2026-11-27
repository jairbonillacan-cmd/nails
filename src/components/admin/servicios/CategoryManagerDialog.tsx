'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Save } from 'lucide-react';
import { FormDialog } from '@/components/ui/FormDialog';
import {
  FORM_SUBMIT_OK,
  formSubmitError,
  formSubmitResultFromResponse,
  type FormSubmitResult,
} from '@/lib/forms/form-submit';
import type { ServiceCategory } from '@/lib/types';

interface CategoryManagerDialogProps {
  isOpen: boolean;
  categories: ServiceCategory[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}

export function CategoryManagerDialog({
  isOpen,
  categories,
  onOpenChange,
  onSaved,
}: CategoryManagerDialogProps) {
  const ordered = categories.toSorted((a, b) => a.displayOrder - b.displayOrder);
  const [names, setNames] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState('');

  const changed = ordered.filter((cat) => {
    const draft = names[cat.id];
    return draft !== undefined && draft.trim() !== cat.name && draft.trim().length >= 2;
  });
  const hasNew = newName.trim().length >= 2;
  const canSave = changed.length > 0 || hasNew;

  const reset = () => {
    setNames({});
    setNewName('');
  };

  const save = async (): Promise<FormSubmitResult> => {
    try {
      for (const cat of changed) {
        const res = await fetch('/api/admin/services', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'category',
            data: { id: cat.id, name: (names[cat.id] ?? cat.name).trim() },
          }),
        });
        if (!res.ok) return formSubmitResultFromResponse(res, 'No se pudo renombrar la categoría.');
      }
      if (hasNew) {
        const res = await fetch('/api/admin/services', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'category',
            data: { name: newName.trim(), displayOrder: ordered.length },
          }),
        });
        if (!res.ok) return formSubmitResultFromResponse(res, 'No se pudo crear la categoría.');
      }
      await onSaved();
      reset();
      return FORM_SUBMIT_OK;
    } catch {
      return formSubmitError('Sin conexión. No se pudieron guardar las categorías.');
    }
  };

  return (
    <FormDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) reset();
        onOpenChange(open);
      }}
      title="Categorías del menú"
      subtitle="Así se agrupan tus servicios en tu página. Cambia un nombre o agrega una nueva."
      width="min(30rem, 96vw)"
    >
      {(controls) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSave) return;
            controls.submit(save);
          }}
        >
          <VStack gap={3}>
            {ordered.map((cat, index) => (
              <TextInput
                key={cat.id}
                label={`Categoría ${index + 1}`}
                value={names[cat.id] ?? cat.name}
                onChange={(v) => setNames((prev) => ({ ...prev, [cat.id]: v }))}
                isDisabled={controls.isSubmitting}
              />
            ))}
            <TextInput
              label="Nueva categoría"
              placeholder="Ejemplo: Pestañas"
              value={newName}
              onChange={setNewName}
              isOptional
              isDisabled={controls.isSubmitting}
            />
            <HStack gap={2} justify="end" wrap="wrap">
              <Button
                type="button"
                label="Cancelar"
                variant="secondary"
                isDisabled={controls.isSubmitting}
                onClick={controls.close}
              />
              <Button
                type="submit"
                label="Guardar"
                variant="primary"
                icon={<Save size={15} aria-hidden="true" />}
                isLoading={controls.isSubmitting}
                isDisabled={!canSave || controls.isSubmitting}
              />
            </HStack>
          </VStack>
        </form>
      )}
    </FormDialog>
  );
}
