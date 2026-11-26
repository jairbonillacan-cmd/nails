'use client';

import type React from 'react';
import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Avatar } from '@astryxdesign/core/Avatar';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Switch } from '@astryxdesign/core/Switch';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Divider } from '@astryxdesign/core/Divider';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Check, Copy, Pencil, Save, UserPlus, Users } from 'lucide-react';
import {
  ActionRow,
  CopyableField,
  EmptyStateCard,
  StatusTag,
  SurfaceCard,
} from '@/components/ui';
import { staffAvatar } from '@/components/landing/landingContent';
import { useCopyToClipboard } from '@/lib/hooks/useCopyToClipboard';
import type { Service, StaffMember } from '@/lib/types';

interface StaffEditorSectionProps {
  staff: StaffMember[];
  services: Service[];
  appUrl: string;
  defaultCommissionPercent: number;
  busyId: string | null;
  onRequestToggleStaffActive: (st: StaffMember, checked: boolean) => void;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}

export function StaffEditorSection({
  staff,
  services,
  appUrl,
  defaultCommissionPercent,
  busyId,
  onRequestToggleStaffActive,
  onRefresh,
  onError,
  onNotice,
}: StaffEditorSectionProps) {
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [sName, setSName] = useState('');
  const [sRoleTitle, setSRoleTitle] = useState('Manicurista');
  const [sBio, setSBio] = useState('');
  const [sCommission, setSCommission] = useState(defaultCommissionPercent || 35);
  const [sServiceIds, setSServiceIds] = useState<string[] | null>(null);
  const [savingStaff, setSavingStaff] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const clipboard = useCopyToClipboard(2400);

  const allServiceIds = services.map((s) => s.id);
  const effectiveServiceIds = sServiceIds ?? allServiceIds;
  const baseOrigin = (
    appUrl.trim() ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://laikona.nails')
  ).replace(/\/+$/, '');
  const editingStaff = editingStaffId
    ? (staff.find((item) => item.id === editingStaffId) ?? null)
    : null;

  const startEditingStaff = (st: StaffMember) => {
    setEditingStaffId(st.id);
    setSName(st.name);
    setSRoleTitle(st.roleTitle);
    setSBio(st.bio);
    setSCommission(st.commissionPercent);
    setSServiceIds(st.serviceIds.length > 0 ? [...st.serviceIds] : [...allServiceIds]);
  };

  const resetStaffForm = () => {
    setEditingStaffId(null);
    setSName('');
    setSRoleTitle('Manicurista');
    setSBio('');
    setSCommission(defaultCommissionPercent || 35);
    setSServiceIds(null);
  };

  const toggleStaffService = (serviceId: string, checked: boolean) => {
    setSServiceIds((prev) => {
      const base = prev ?? allServiceIds;
      return checked ? Array.from(new Set([...base, serviceId])) : base.filter((id) => id !== serviceId);
    });
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sName.trim().length < 2 || savingStaff) return;
    setSavingStaff(true);
    try {
      const existing = editingStaffId ? staff.find((item) => item.id === editingStaffId) : null;
      const res = await fetch('/api/admin/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'staff',
          data: {
            ...(existing ? { id: existing.id, isActive: existing.isActive } : {}),
            name: sName.trim(),
            roleTitle: sRoleTitle.trim() || 'Manicurista',
            bio: sBio.trim(),
            commissionPercent: sCommission,
            serviceIds: effectiveServiceIds.length > 0 ? effectiveServiceIds : allServiceIds,
          },
        }),
      });
      if (res.ok) {
        const wasEditing = Boolean(editingStaffId);
        await onRefresh();
        resetStaffForm();
        onNotice(wasEditing ? 'Cambios guardados' : 'Manicurista agregada');
      } else {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        onError(err?.error || 'No se pudo guardar a la manicurista.');
      }
    } catch {
      onError('Error de conexión al guardar los cambios.');
    } finally {
      setSavingStaff(false);
    }
  };

  const handleCopyStaffLink = async (slug: string, name: string) => {
    const url = `${baseOrigin}/reservar?staff=${slug}`;
    setCopiedSlug(slug);
    await clipboard.copy(
      url,
      `Link directo de ${name} copiado.`,
      `Copia manualmente /reservar?staff=${slug}`,
    );
  };

  return (
    <VStack gap={4}>
      <Text type="supporting" color="secondary" role="status" aria-live="polite" className="rb-sr-only">
        {clipboard.feedback ?? ''}
      </Text>

      <SurfaceCard
        id="team-staff-heading"
        title="Manicuristas del salón"
        subtitle="Cada una tiene su link propio de citas y porcentaje de comisión."
        count={staff.length}
      >
        {staff.length === 0 ? (
          <VStack className="ad-empty" gap={2}>
            <EmptyStateCard
              framed={false}
              isCompact
              icon={<Users size={22} aria-hidden="true" />}
              title="Aún no hay manicuristas"
              description="Agrega a tu primera manicurista para abrir horarios y recibir citas."
            />
          </VStack>
        ) : (
          <VStack as="ul" className="ad-row-list" gap={0}>
            {staff.map((st, idx) => {
              const isEditingThis = editingStaffId === st.id;
              const isCopied = copiedSlug === st.bookingSlug && clipboard.copied;
              const isRowBusy = busyId === st.id;
              return (
                <li key={st.id} className={isRowBusy ? 'fx-busy' : undefined} aria-busy={isRowBusy || undefined}>
                  <ActionRow
                    leading={<Avatar name={st.name} src={staffAvatar(st.avatarUrl, idx)} size="md" />}
                    title={
                      <HStack gap={1.5} align="center" wrap="wrap">
                        <Text weight="semibold">{st.name}</Text>
                        <StatusTag tone="neutral" label={`${st.commissionPercent}% comisión`} hasTabularNumbers />
                        <StatusTag tone="neutral" label={`${st.serviceIds.length} servicios`} hasTabularNumbers />
                      </HStack>
                    }
                    subtitle={`${st.roleTitle}${st.bio ? ` · ${st.bio}` : ''}`}
                    isSelected={isEditingThis}
                    isMuted={!st.isActive}
                    onClick={() => startEditingStaff(st)}
                    actions={
                      <HStack gap={2} align="center" wrap="wrap">
                        <Button
                          type="button"
                          label={isCopied ? 'Link copiado' : 'Copiar link'}
                          variant={isCopied ? 'primary' : 'secondary'}
                          size="sm"
                          icon={isCopied ? <Check size={13} aria-hidden="true" className="fx-pop" /> : <Copy size={13} aria-hidden="true" />}
                          onClick={() => void handleCopyStaffLink(st.bookingSlug, st.name)}
                        />
                        <Button
                          type="button"
                          label={isEditingThis ? 'Editando' : 'Editar'}
                          variant={isEditingThis ? 'primary' : 'ghost'}
                          size="sm"
                          icon={<Pencil size={13} aria-hidden="true" />}
                          isDisabled={savingStaff}
                          onClick={() => startEditingStaff(st)}
                        />
                        <Switch
                          label={`Activa ${st.name}`}
                          isLabelHidden
                          size="sm"
                          value={st.isActive}
                          isLoading={isRowBusy}
                          onChange={(checked) => onRequestToggleStaffActive(st, checked)}
                        />
                      </HStack>
                    }
                  />
                </li>
              );
            })}
          </VStack>
        )}
      </SurfaceCard>

      <SurfaceCard
        id="team-add-staff-heading"
        title={editingStaffId ? 'Editar manicurista' : 'Agregar manicurista'}
        subtitle="Define su nombre, comisión y los servicios que realiza."
        actions={
          editingStaffId ? (
            <Button type="button" label="Cancelar" variant="ghost" size="sm" isDisabled={savingStaff} onClick={resetStaffForm} />
          ) : undefined
        }
      >
        <form onSubmit={handleSaveStaff}>
          <VStack gap={3} className={savingStaff ? 'ad-card-body fx-busy' : 'ad-card-body'} paddingBlockStart={4} aria-busy={savingStaff || undefined}>
            {editingStaff ? (
              <CopyableField
                label={`Link directo de ${editingStaff.name}`}
                value={`${baseOrigin}/reservar?staff=${editingStaff.bookingSlug}`}
                displayValue={`/reservar?staff=${editingStaff.bookingSlug}`}
                copyLabel="Copiar link"
                copiedLabel="Link copiado"
                feedbackMessage={`Link directo de ${editingStaff.name} copiado.`}
                monospace
              />
            ) : null}

            <TextInput label="Nombre" placeholder="Ej. Fernanda Ruiz" value={sName} onChange={setSName} isRequired />
            <Grid columns={{ minWidth: 140, max: 2 }} gap={3}>
              <TextInput label="Especialidad" value={sRoleTitle} onChange={setSRoleTitle} />
              <NumberInput label="Comisión (%)" value={sCommission} min={0} max={100} isIntegerOnly onChange={setSCommission} />
            </Grid>
            <TextInput
              label="Presentación breve"
              placeholder="Especialista en Rubber y diseños minimalistas"
              value={sBio}
              onChange={setSBio}
              isOptional
            />

            {services.length > 0 ? (
              <>
                <Divider />
                <Collapsible
                  className="ad-disclosure"
                  defaultIsOpen={Boolean(editingStaffId)}
                  trigger={
                    <HStack gap={2} align="center">
                      <Text weight="semibold" size="sm">Servicios que realiza</Text>
                      <StatusTag tone="neutral" label={`${effectiveServiceIds.length} de ${services.length}`} hasTabularNumbers />
                    </HStack>
                  }
                >
                  <VStack paddingBlockStart={2}>
                    <Grid columns={{ minWidth: 150, max: 2 }} gap={1.5}>
                      {services.map((srv) => (
                        <CheckboxInput
                          key={srv.id}
                          size="sm"
                          label={srv.name}
                          value={effectiveServiceIds.includes(srv.id)}
                          onChange={(checked) => toggleStaffService(srv.id, checked)}
                        />
                      ))}
                    </Grid>
                  </VStack>
                </Collapsible>
              </>
            ) : null}

            <Button
              type="submit"
              label={savingStaff ? 'Guardando...' : editingStaffId ? 'Guardar cambios' : 'Agregar manicurista'}
              variant="primary"
              icon={editingStaffId ? <Save size={15} aria-hidden="true" /> : <UserPlus size={15} aria-hidden="true" />}
              width="100%"
              isLoading={savingStaff}
              isDisabled={sName.trim().length < 2 || savingStaff}
            />
          </VStack>
        </form>
      </SurfaceCard>
    </VStack>
  );
}
