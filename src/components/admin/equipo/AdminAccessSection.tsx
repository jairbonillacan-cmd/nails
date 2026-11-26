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
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Shield, UserPlus } from 'lucide-react';
import {
  ActionRow,
  StatusTag,
  SurfaceCard,
  type StatusTagTone,
} from '@/components/ui';
import type { AdminRole, AdminUser, StaffMember } from '@/lib/types';

const ROLE_META: Record<AdminRole, { label: string; tone: StatusTagTone }> = {
  owner: { label: 'Dueña', tone: 'accent' },
  admin: { label: 'Recepción', tone: 'neutral' },
  specialist: { label: 'Manicurista', tone: 'success' },
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
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}

export function AdminAccessSection({
  adminUsers,
  staff,
  currentUserId,
  isOwner,
  busyId,
  onRequestToggleAccessActive,
  onRefresh,
  onError,
  onNotice,
}: AdminAccessSectionProps) {
  const [aName, setAName] = useState('');
  const [aEmail, setAEmail] = useState('');
  const [aRole, setARole] = useState<AdminRole>('admin');
  const [aStaffId, setAStaffId] = useState<string>('none');
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  const staffNameById = new Map(staff.map((st) => [st.id, st.name]));

  const handleAddAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aEmail.trim() || !aName.trim() || savingAdmin) return;
    setSavingAdmin(true);
    try {
      const res = await fetch('/api/admin/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'admin_user',
          data: {
            fullName: aName.trim(),
            email: aEmail.trim(),
            role: aRole,
            staffMemberId: aRole === 'specialist' && aStaffId !== 'none' ? aStaffId : null,
            isActive: true,
          },
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        onError(json?.error || 'No se pudo agregar a esta persona.');
        return;
      }
      await onRefresh();
      setIsInviteOpen(false);
      setAName('');
      setAEmail('');
      setARole('admin');
      setAStaffId('none');
      onNotice('Acceso creado');
    } catch {
      onError('Error de conexión al crear el acceso.');
    } finally {
      setSavingAdmin(false);
    }
  };

  return (
    <VStack gap={4}>
      <SurfaceCard
        id="team-access-heading"
        icon={<Shield size={16} aria-hidden="true" />}
        title="Accesos al panel"
        subtitle="Quién puede entrar y qué puede ver: Dueña, Recepción o Manicurista."
        count={adminUsers.length}
        actions={
          isOwner ? (
            <Button
              type="button"
              label="Agregar persona"
              variant="secondary"
              size="sm"
              icon={<UserPlus size={14} aria-hidden="true" />}
              onClick={() => setIsInviteOpen(true)}
            />
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
                      <Switch
                        label={`Acceso de ${displayName}`}
                        isLabelHidden
                        size="sm"
                        value={u.isActive}
                        isLoading={isRowBusy}
                        onChange={(checked) => onRequestToggleAccessActive(u, checked)}
                      />
                    ) : undefined
                  }
                />
              </li>
            );
          })}
        </VStack>
      </SurfaceCard>

      <Dialog
        isOpen={isInviteOpen}
        onOpenChange={(open) => {
          if (!savingAdmin) setIsInviteOpen(open);
        }}
        purpose="form"
        width="min(30rem, 96vw)"
        padding={5}
      >
        <VStack gap={4} className="fx-sheet-in">
          <DialogHeader
            title="Agregar persona al panel"
            subtitle="Entrará con su propio correo y solo verá lo que su permiso le deje."
            onOpenChange={(open) => {
              if (!savingAdmin) setIsInviteOpen(open);
            }}
          />
              <form onSubmit={handleAddAccess}>
                <VStack
                  gap={3}
                  className={savingAdmin ? 'fx-busy' : undefined}
                  aria-busy={savingAdmin || undefined}
                >
                  <TextInput
                    label="Nombre completo"
                    placeholder="Ej. Recepción Turno Tarde"
                    value={aName}
                    onChange={setAName}
                    isRequired
                  />
                  <TextInput
                    label="Correo para entrar"
                    type="email"
                    value={aEmail}
                    onChange={setAEmail}
                    isRequired
                  />
                  <Selector
                    label="Tipo de permiso"
                    value={aRole}
                    onChange={(v) => {
                      if (v === 'owner' || v === 'admin' || v === 'specialist') {
                        setARole(v);
                      }
                    }}
                    options={[
                      {
                        value: 'owner',
                        label: 'Dueña (Todo el salón, mi página y conexiones)',
                      },
                      {
                        value: 'admin',
                        label: 'Recepción (Citas, cobros, servicios y clientas)',
                      },
                      {
                        value: 'specialist',
                        label: 'Manicurista (Solo su agenda, horarios y comisiones)',
                      },
                    ]}
                  />
                  {aRole === 'specialist' ? (
                    <Selector
                      label="Conectar con manicurista"
                      value={aStaffId}
                      onChange={(v) => v && setAStaffId(v)}
                      options={[
                        { value: 'none', label: 'Sin conectar' },
                        ...staff.map((s) => ({ value: s.id, label: s.name })),
                      ]}
                    />
                  ) : null}
                  <HStack gap={2} justify="end" wrap="wrap">
                    <Button
                      type="button"
                      label="Cancelar"
                      variant="secondary"
                      isDisabled={savingAdmin}
                      onClick={() => setIsInviteOpen(false)}
                    />
                    <Button
                      type="submit"
                      label={savingAdmin ? 'Agregando...' : 'Dar acceso'}
                      variant="primary"
                      icon={<UserPlus size={15} aria-hidden="true" />}
                      isLoading={savingAdmin}
                      isDisabled={!aName.trim() || !aEmail.trim() || savingAdmin}
                    />
                  </HStack>
                </VStack>
              </form>
        </VStack>
      </Dialog>
    </VStack>
  );
}
