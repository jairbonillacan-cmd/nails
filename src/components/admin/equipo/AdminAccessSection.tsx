'use client';

import type React from 'react';
import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Avatar } from '@astryxdesign/core/Avatar';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { Pencil, Save, Shield, UserPlus } from 'lucide-react';
import {
  ActionRow,
  StatusTag,
  SurfaceCard,
  type StatusTagTone,
} from '@/components/ui';
import { FormDialog, type FormDialogControls } from '@/components/ui/FormDialog';
import { FormDialogLauncher } from '@/components/ui/FormDialogLauncher';
import {
  FORM_SUBMIT_OK,
  formSubmitError,
  formSubmitResultFromResponse,
  type FormSubmitResult,
} from '@/lib/forms/form-submit';
import type { AdminRole, AdminUser, StaffMember } from '@/lib/types';

const ROLE_META: Record<AdminRole, { label: string; tone: StatusTagTone }> = {
  owner: { label: 'Dueña', tone: 'neutral' },
  admin: { label: 'Recepción', tone: 'neutral' },
  specialist: { label: 'Profesional', tone: 'neutral' },
};

const ROLE_OPTIONS: Array<{ value: AdminRole; label: string }> = [
  { value: 'admin', label: 'Recepción' },
  { value: 'specialist', label: 'Profesional' },
  { value: 'owner', label: 'Dueña' },
];

const ROLE_HINT: Record<AdminRole, string> = {
  owner: 'Ve y cambia todo, incluso pagos y conexiones.',
  admin: 'Agenda, cobros, servicios y clientas.',
  specialist: 'Solo su agenda, horarios y comisiones.',
};

export function cleanAccessDisplayName(fullName: string): string {
  const stripped = fullName.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return stripped || fullName.trim();
}

interface AdminAccessSectionProps {
  adminUsers: AdminUser[];
  staff: StaffMember[];
  currentUserId: string;
  isOwner: boolean;
  busyId: string | null;
  onRequestToggleAccessActive: (user: AdminUser, checked: boolean) => void;
  onRefresh: () => Promise<void>;
  onNotice: (message: string) => void;
}

function AccessFormBody({
  initialUser,
  staff,
  onRefresh,
  onNotice,
  controls,
}: {
  initialUser?: AdminUser | null;
  staff: StaffMember[];
  onRefresh: () => Promise<void>;
  onNotice: (message: string) => void;
  controls: FormDialogControls;
}) {
  const [aName, setAName] = useState(
    initialUser ? cleanAccessDisplayName(initialUser.fullName) : '',
  );
  const [aEmail, setAEmail] = useState(initialUser?.email ?? '');
  const [aRole, setARole] = useState<AdminRole>(initialUser?.role ?? 'admin');
  const [aStaffId, setAStaffId] = useState<string>(initialUser?.staffMemberId ?? 'none');
  const { isSubmitting } = controls;
  const isEditing = Boolean(initialUser);

  const saveAccess = async (): Promise<FormSubmitResult> => {
    try {
      const res = await fetch('/api/admin/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'admin_user',
          data: {
            ...(initialUser ? { id: initialUser.id, isActive: initialUser.isActive } : { isActive: true }),
            fullName: aName.trim(),
            email: aEmail.trim(),
            role: aRole,
            staffMemberId: aRole === 'specialist' && aStaffId !== 'none' ? aStaffId : null,
          },
        }),
      });
      if (!res.ok) {
        return formSubmitResultFromResponse(
          res,
          isEditing
            ? 'No se pudieron guardar los cambios de acceso.'
            : 'No se pudo dar acceso a esta persona.',
        );
      }
      await onRefresh();
      onNotice(isEditing ? 'Acceso actualizado' : 'Acceso creado');
      return FORM_SUBMIT_OK;
    } catch {
      return formSubmitError('Sin conexión. No se pudo guardar el acceso.');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aEmail.trim() || !aName.trim()) return;
    controls.submit(saveAccess);
  };

  return (
    <form onSubmit={handleSubmit}>
      <VStack gap={3}>
        <TextInput label="Nombre" value={aName} onChange={setAName} autoComplete="off" isRequired />
        <TextInput
          label="Correo con el que entrará"
          type="email"
          value={aEmail}
          onChange={setAEmail}
          autoComplete="off"
          isDisabled={isEditing}
          isRequired
        />
        <Selector
          label="Qué puede hacer"
          description={ROLE_HINT[aRole]}
          value={aRole}
          onChange={(v) => {
            const next = ROLE_OPTIONS.find((option) => option.value === v);
            if (next) setARole(next.value);
          }}
          options={ROLE_OPTIONS}
        />
        {aRole === 'specialist' ? (
          <Selector
            label="¿Cuál es su agenda?"
            value={aStaffId}
            onChange={(v) => v && setAStaffId(v)}
            options={[
              { value: 'none', label: 'Elegir después' },
              ...staff.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
        ) : null}
        <HStack gap={2} justify="end" wrap="wrap">
          <Button
            type="button"
            label="Cancelar"
            variant="secondary"
            isDisabled={isSubmitting}
            onClick={controls.close}
          />
          <Button
            type="submit"
            label={isEditing ? 'Guardar cambios' : 'Dar acceso'}
            variant="primary"
            icon={isEditing ? <Save size={15} aria-hidden="true" /> : <UserPlus size={15} aria-hidden="true" />}
            isLoading={isSubmitting}
            isDisabled={!aName.trim() || !aEmail.trim() || isSubmitting}
          />
        </HStack>
      </VStack>
    </form>
  );
}

export function AdminAccessSection({
  adminUsers,
  staff,
  currentUserId,
  isOwner,
  busyId,
  onRequestToggleAccessActive,
  onRefresh,
  onNotice,
}: AdminAccessSectionProps) {
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const staffNameById = new Map(staff.map((st) => [st.id, st.name]));

  return (
    <VStack gap={4}>
      <SurfaceCard
        id="team-access-heading"
        icon={<Shield size={16} aria-hidden="true" />}
        title="Accesos al panel"
        subtitle="Quién puede entrar y qué puede ver: Dueña, Recepción o Profesional."
        count={adminUsers.length}
        actions={
          isOwner ? (
            <FormDialogLauncher
              triggerLabel="Agregar persona"
              title="Agregar persona al panel"
              subtitle="Entrará con su propio correo y solo verá lo que le permitas."
              triggerVariant="secondary"
              triggerSize="sm"
              icon={<UserPlus size={14} aria-hidden="true" />}
              width="min(30rem, 96vw)"
            >
              {(controls) => (
                <AccessFormBody
                  staff={staff}
                  onRefresh={onRefresh}
                  onNotice={onNotice}
                  controls={controls}
                />
              )}
            </FormDialogLauncher>
          ) : undefined
        }
      >
        <VStack as="ul" className="ad-row-list" gap={0}>
          {adminUsers.map((u) => {
            const roleMeta = ROLE_META[u.role];
            const displayName = cleanAccessDisplayName(u.fullName);
            const isSelf = u.id === currentUserId;
            const linkedStaff = u.staffMemberId ? staffNameById.get(u.staffMemberId) : null;
            const isRowBusy = busyId === u.id;

            return (
              <li
                key={u.id}
                className={isRowBusy ? 'fx-busy' : undefined}
                aria-busy={isRowBusy || undefined}
              >
                <ActionRow
                  leading={<Avatar name={displayName} size="sm" />}
                  title={
                    <HStack gap={1.5} align="center" wrap="wrap">
                      <Text weight="semibold">{displayName}</Text>
                      {isSelf ? <StatusTag label="Tú" tone="accent" /> : null}
                      {!u.isActive ? <StatusTag label="Pausado" tone="neutral" /> : null}
                    </HStack>
                  }
                  subtitle={`${u.email}${linkedStaff ? ` · Agenda de ${linkedStaff}` : ''}`}
                  isMuted={!u.isActive}
                  status={<StatusTag label={roleMeta.label} tone={roleMeta.tone} />}
                  actions={
                    isOwner && !isSelf ? (
                      <HStack gap={2} align="center" wrap="wrap">
                        <Button
                          type="button"
                          label="Editar"
                          variant="ghost"
                          size="sm"
                          icon={<Pencil size={13} aria-hidden="true" />}
                          isDisabled={Boolean(busyId)}
                          onClick={() => setEditingUser(u)}
                        />
                        <Switch
                          label={`Acceso de ${displayName}`}
                          isLabelHidden
                          size="sm"
                          value={u.isActive}
                          isLoading={isRowBusy}
                          isDisabled={Boolean(busyId) && !isRowBusy}
                          onChange={(checked) => onRequestToggleAccessActive(u, checked)}
                        />
                      </HStack>
                    ) : undefined
                  }
                />
              </li>
            );
          })}
        </VStack>
      </SurfaceCard>

      <FormDialog
        isOpen={Boolean(editingUser)}
        onOpenChange={(open) => {
          if (!open) setEditingUser(null);
        }}
        title={
          editingUser
            ? `Editar acceso de ${cleanAccessDisplayName(editingUser.fullName)}`
            : 'Editar acceso'
        }
        subtitle="Cambia su rol o vincula su agenda individual."
        width="min(30rem, 96vw)"
      >
        {(controls) =>
          editingUser ? (
            <AccessFormBody
              key={editingUser.id}
              initialUser={editingUser}
              staff={staff}
              onRefresh={onRefresh}
              onNotice={onNotice}
              controls={controls}
            />
          ) : null
        }
      </FormDialog>
    </VStack>
  );
}
