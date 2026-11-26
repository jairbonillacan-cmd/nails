'use client';

import React, { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Avatar } from '@astryxdesign/core/Avatar';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import {
  Check,
  Copy,
  Pencil,
  Save,
  Shield,
  UserPlus,
  Users,
} from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import {
  AdminConfigChip,
  AdminConfigEmpty,
  AdminConfigKpiStrip,
  AdminConfigPageHeader,
  AdminConfigSection,
  AdminConfigSkeleton,
  type AdminConfigKpiItem,
} from '@/components/admin/config/AdminConfigPrimitives';
import { staffAvatar } from '@/components/landing/landingContent';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import type { AdminRole, AdminUser, StaffMember } from '@/lib/types';

const ROLE_META: Record<
  AdminRole,
  { label: string; tone: 'accent' | 'neutral' | 'success' }
> = {
  owner: { label: 'Dueña', tone: 'accent' },
  admin: { label: 'Recepción', tone: 'neutral' },
  specialist: { label: 'Manicurista', tone: 'success' },
};

function cleanAccessDisplayName(fullName: string): string {
  const stripped = fullName.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return stripped || fullName.trim();
}

export default function AdminTeamPage() {
  const { data, loading, refresh } = useAdminData();
  const [msg, setMsg] = useState<{ status: 'success' | 'error'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const copyFeedback = useEphemeralMessage(2400);
  const saveNotice = useEphemeralMessage(3200);

  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [sName, setSName] = useState('');
  const [sRoleTitle, setSRoleTitle] = useState('Manicurista');
  const [sBio, setSBio] = useState('');
  const [sCommission, setSCommission] = useState(35);
  const [sServiceIds, setSServiceIds] = useState<string[] | null>(null);
  const [savingStaff, setSavingStaff] = useState(false);

  const [aName, setAName] = useState('');
  const [aEmail, setAEmail] = useState('');
  const [aRole, setARole] = useState<AdminRole>('admin');
  const [aStaffId, setAStaffId] = useState<string>('none');
  const [savingAdmin, setSavingAdmin] = useState(false);

  if (loading || !data) {
    return <AdminConfigSkeleton kpiCount={3} withSplit />;
  }

  const isOwner = data.session.user.role === 'owner';
  const activeStaffCount = data.staff.filter((s) => s.isActive).length;
  const activeAdminCount = data.adminUsers.filter((u) => u.isActive).length;
  const allServiceIds = data.services.map((s) => s.id);
  const effectiveServiceIds = sServiceIds ?? allServiceIds;
  const staffNameById = new Map(data.staff.map((st) => [st.id, st.name]));

  const kpiItems: AdminConfigKpiItem[] = [
    {
      id: 'active-staff',
      label: 'Manicuristas activas',
      value: String(activeStaffCount),
      sub: `de ${data.staff.length} en tu salón`,
    },
    {
      id: 'web-mode',
      label: 'Al reservar',
      value: activeStaffCount <= 1 ? 'Directa' : 'Por artista',
      sub:
        activeStaffCount <= 1
          ? 'Se asigna en automático'
          : 'Clienta elige o "Me da igual"',
    },
    {
      id: 'panel-access',
      label: 'Personas con acceso',
      value: String(activeAdminCount),
      sub: `de ${data.adminUsers.length} cuentas activas`,
    },
  ];

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
    setSCommission(data.settings.defaultCommissionPercent || 35);
    setSServiceIds(null);
  };

  const toggleStaffService = (serviceId: string, checked: boolean) => {
    setSServiceIds((prev) => {
      const base = prev ?? allServiceIds;
      if (checked) {
        return Array.from(new Set([...base, serviceId]));
      }
      return base.filter((id) => id !== serviceId);
    });
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sName.trim().length < 2 || savingStaff) return;
    setSavingStaff(true);
    setMsg(null);
    try {
      const existing = editingStaffId
        ? data.staff.find((item) => item.id === editingStaffId)
        : null;
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
        await refresh();
        resetStaffForm();
        saveNotice.show(wasEditing ? 'Cambios guardados' : 'Manicurista agregada');
      } else {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        setMsg({
          status: 'error',
          text: err?.error || 'No se pudo guardar a la manicurista.',
        });
      }
    } catch {
      setMsg({ status: 'error', text: 'Error de conexión al guardar los cambios.' });
    } finally {
      setSavingStaff(false);
    }
  };

  const handleToggleStaffActive = async (st: StaffMember, checked: boolean) => {
    if (busyId) return;
    setBusyId(st.id);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'staff',
          data: { ...st, isActive: checked },
        }),
      });
      if (res.ok) {
        await refresh();
        saveNotice.show(checked ? `${st.name} activada` : `${st.name} pausada`);
      } else {
        setMsg({ status: 'error', text: 'No se pudo actualizar el estado.' });
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleCopyStaffLink = async (slug: string, name: string) => {
    const url = `${window.location.origin}/reservar?staff=${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedSlug(slug);
      copyFeedback.show(`Link directo de ${name} copiado.`);
    } catch {
      setMsg({
        status: 'error',
        text: `Copia manualmente /reservar?staff=${slug}`,
      });
    }
  };

  const handleAddAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aEmail.trim() || !aName.trim() || savingAdmin) return;
    setSavingAdmin(true);
    setMsg(null);
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
        setMsg({
          status: 'error',
          text: json?.error || 'No se pudo agregar a esta persona.',
        });
        return;
      }
      await refresh();
      setAName('');
      setAEmail('');
      setARole('admin');
      setAStaffId('none');
      saveNotice.show('Acceso creado');
    } catch {
      setMsg({ status: 'error', text: 'Error de conexión al crear el acceso.' });
    } finally {
      setSavingAdmin(false);
    }
  };

  const handleToggleAccessActive = async (user: AdminUser, checked: boolean) => {
    if (!isOwner || user.id === data.session.user.id || busyId) return;
    setBusyId(user.id);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'admin_user',
          data: {
            id: user.id,
            fullName: user.fullName,
            email: user.email,
            role: user.role,
            staffMemberId: user.staffMemberId,
            isActive: checked,
          },
        }),
      });
      if (res.ok) {
        await refresh();
        const displayName = cleanAccessDisplayName(user.fullName);
        saveNotice.show(
          checked ? `Acceso reactivado · ${displayName}` : `Acceso pausado · ${displayName}`,
        );
      } else {
        setMsg({ status: 'error', text: 'No se pudo actualizar el acceso.' });
      }
    } finally {
      setBusyId(null);
    }
  };

  const isAnyBusy = savingStaff || savingAdmin || Boolean(busyId);

  return (
    <VStack className="ad-page">
      <AdminConfigPageHeader
        eyebrow="Tu equipo"
        title="Equipo"
        subtitle="Administra a tus manicuristas, sus comisiones y quién puede entrar al panel del salón."
        meta={
          isAnyBusy ? (
            <Text className="fx-save-pill" data-state="saving" role="status" aria-live="polite">
              Guardando...
            </Text>
          ) : saveNotice.message ? (
            <Text className="fx-save-pill" data-state="saved" role="status" aria-live="polite">
              <Check size={12} aria-hidden="true" />
              {saveNotice.message}
            </Text>
          ) : null
        }
      />

      <AdminConfigKpiStrip ariaLabel="Resumen del equipo" items={kpiItems} cols={3} />

      {msg ? (
        <Banner
          status={msg.status}
          role={msg.status === 'error' ? 'alert' : 'status'}
          title={msg.text}
          isDismissable
          onDismiss={() => setMsg(null)}
        />
      ) : null}

      <Text
        type="supporting"
        color="secondary"
        role="status"
        aria-live="polite"
        className="rb-sr-only"
      >
        {copyFeedback.message ?? ''}
      </Text>

      <VStack className="ad-config-grid-equal" gap={5}>
        <VStack gap={4}>
          <AdminConfigSection
            id="team-staff-heading"
            title="Manicuristas del salón"
            subtitle="Cada una tiene su link propio de citas y porcentaje de comisión."
            badge={
              <AdminConfigChip
                label={String(data.staff.length)}
                tone="neutral"
                hasTabularNumbers
              />
            }
          >
            {data.staff.length === 0 ? (
              <AdminConfigEmpty
                icon={<Users size={22} aria-hidden="true" />}
                title="Aún no hay manicuristas"
                description="Agrega a tu primera manicurista para abrir horarios y recibir citas."
              />
            ) : (
              <VStack as="ul" className="ad-row-list" gap={0}>
                {data.staff.map((st, idx) => {
                  const isEditingThis = editingStaffId === st.id;
                  const isCopied = copiedSlug === st.bookingSlug && Boolean(copyFeedback.message);
                  const isRowBusy = busyId === st.id;
                  return (
                    <li
                      key={st.id}
                      className={isRowBusy ? 'ad-list-row fx-busy' : 'ad-list-row'}
                      data-selected={isEditingThis ? 'true' : undefined}
                      data-muted={!st.isActive ? 'true' : undefined}
                      aria-busy={isRowBusy || undefined}
                    >
                      <VStack gap={2} width="100%">
                        <HStack justify="between" align="center" gap={3} wrap="wrap">
                          <HStack gap={2} align="center" className="rb-grow">
                            <Avatar
                              name={st.name}
                              src={staffAvatar(st.avatarUrl, idx)}
                              size="md"
                            />
                            <VStack gap={0.5} className="rb-grow">
                              <HStack gap={1.5} align="center" wrap="wrap">
                                <Text weight="semibold">{st.name}</Text>
                                <AdminConfigChip
                                  tone="neutral"
                                  label={`${st.commissionPercent}% comisión`}
                                  hasTabularNumbers
                                />
                                <AdminConfigChip
                                  tone="neutral"
                                  label={`${st.serviceIds.length} servicios`}
                                  hasTabularNumbers
                                />
                              </HStack>
                              <Text type="supporting" color="secondary" maxLines={1}>
                                {st.roleTitle}
                                {st.bio ? ` · ${st.bio}` : ''}
                              </Text>
                            </VStack>
                          </HStack>

                          <Switch
                            label={`Activa ${st.name}`}
                            isLabelHidden
                            size="sm"
                            value={st.isActive}
                            isLoading={isRowBusy}
                            onChange={(checked) => void handleToggleStaffActive(st, checked)}
                          />
                        </HStack>

                        <HStack gap={1.5} wrap="wrap">
                          <Button
                            type="button"
                            label={isCopied ? 'Link copiado' : 'Copiar link'}
                            variant={isCopied ? 'primary' : 'secondary'}
                            size="sm"
                            icon={
                              isCopied ? (
                                <Check size={13} aria-hidden="true" className="fx-pop" />
                              ) : (
                                <Copy size={13} aria-hidden="true" />
                              )
                            }
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
                        </HStack>
                      </VStack>
                    </li>
                  );
                })}
              </VStack>
            )}
          </AdminConfigSection>

          <AdminConfigSection
            id="team-add-staff-heading"
            title={editingStaffId ? 'Editar manicurista' : 'Agregar manicurista'}
            subtitle="Define su nombre, comisión y los servicios que realiza."
            actions={
              editingStaffId ? (
                <Button
                  type="button"
                  label="Cancelar"
                  variant="ghost"
                  size="sm"
                  isDisabled={savingStaff}
                  onClick={resetStaffForm}
                />
              ) : null
            }
          >
            <form onSubmit={handleSaveStaff}>
              <VStack
                gap={3}
                className={savingStaff ? 'ad-card-body fx-busy' : 'ad-card-body'}
                paddingBlockStart={4}
                aria-busy={savingStaff || undefined}
              >
                <TextInput
                  label="Nombre"
                  placeholder="Ej. Fernanda Ruiz"
                  value={sName}
                  onChange={setSName}
                  isRequired
                />
                <Grid columns={{ minWidth: 140, max: 2 }} gap={3}>
                  <TextInput
                    label="Especialidad"
                    value={sRoleTitle}
                    onChange={setSRoleTitle}
                  />
                  <NumberInput
                    label="Comisión (%)"
                    value={sCommission}
                    min={0}
                    max={100}
                    isIntegerOnly
                    onChange={setSCommission}
                  />
                </Grid>
                <TextInput
                  label="Presentación breve"
                  placeholder="Especialista en Rubber y diseños minimalistas"
                  value={sBio}
                  onChange={setSBio}
                  isOptional
                />

                {data.services.length > 0 ? (
                  <>
                    <Divider />
                    <Collapsible
                      className="ad-disclosure"
                      defaultIsOpen={Boolean(editingStaffId)}
                      trigger={
                        <HStack gap={2} align="center">
                          <Text weight="semibold" size="sm">
                            Servicios que realiza
                          </Text>
                          <AdminConfigChip
                            tone="neutral"
                            label={`${effectiveServiceIds.length} de ${data.services.length}`}
                            hasTabularNumbers
                          />
                        </HStack>
                      }
                    >
                      <VStack paddingBlockStart={2}>
                        <Grid columns={{ minWidth: 150, max: 2 }} gap={1.5}>
                          {data.services.map((srv) => (
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
                  label={
                    savingStaff
                      ? 'Guardando...'
                      : editingStaffId
                        ? 'Guardar cambios'
                        : 'Agregar manicurista'
                  }
                  variant="primary"
                  icon={
                    editingStaffId ? (
                      <Save size={15} aria-hidden="true" />
                    ) : (
                      <UserPlus size={15} aria-hidden="true" />
                    )
                  }
                  width="100%"
                  isLoading={savingStaff}
                  isDisabled={sName.trim().length < 2 || savingStaff}
                />
              </VStack>
            </form>
          </AdminConfigSection>
        </VStack>

        <VStack gap={4}>
          <AdminConfigSection
            id="team-access-heading"
            icon={<Shield size={16} aria-hidden="true" />}
            title="Accesos al panel"
            subtitle="Elige qué puede ver y hacer cada persona: Dueña, Recepción o Manicurista."
            badge={
              <AdminConfigChip
                label={String(data.adminUsers.length)}
                tone="neutral"
                hasTabularNumbers
              />
            }
          >
            <VStack as="ul" className="ad-row-list" gap={0}>
              {data.adminUsers.map((u) => {
                const roleMeta = ROLE_META[u.role];
                const displayName = cleanAccessDisplayName(u.fullName);
                const isSelf = u.id === data.session.user.id;
                const linkedStaff = u.staffMemberId ? staffNameById.get(u.staffMemberId) : null;
                const isRowBusy = busyId === u.id;

                return (
                  <li
                    key={u.id}
                    className={isRowBusy ? 'ad-row-item fx-busy' : 'ad-row-item'}
                    data-muted={!u.isActive ? 'true' : undefined}
                    aria-busy={isRowBusy || undefined}
                  >
                    <HStack gap={2} align="center" className="rb-grow">
                      <Avatar name={displayName} size="sm" />
                      <VStack gap={0.5} className="rb-grow">
                        <HStack gap={1.5} align="center" wrap="wrap">
                          <Text weight="semibold">{displayName}</Text>
                          {isSelf ? <AdminConfigChip label="Tú" tone="accent" /> : null}
                          {!u.isActive ? (
                            <AdminConfigChip label="Pausado" tone="neutral" />
                          ) : null}
                        </HStack>
                        <Text type="supporting" color="secondary">
                          {u.email}
                          {linkedStaff ? ` · Agenda de ${linkedStaff}` : ''}
                        </Text>
                      </VStack>
                    </HStack>

                    <HStack gap={2} align="center" wrap="wrap">
                      <AdminConfigChip label={roleMeta.label} tone={roleMeta.tone} />
                      {isOwner && !isSelf ? (
                        <Switch
                          label={`Acceso de ${displayName}`}
                          isLabelHidden
                          size="sm"
                          value={u.isActive}
                          isLoading={isRowBusy}
                          onChange={(checked) => void handleToggleAccessActive(u, checked)}
                        />
                      ) : null}
                    </HStack>
                  </li>
                );
              })}
            </VStack>
          </AdminConfigSection>

          <AdminConfigSection
            id="team-invite-heading"
            title="Dar acceso a alguien del equipo"
            subtitle="Crea un acceso separado para recepción o para que cada manicurista vea solo su agenda."
          >
            {isOwner ? (
              <VStack className="ad-card-body" paddingBlockStart={4}>
                <Collapsible
                  className="ad-disclosure"
                  defaultIsOpen={false}
                  trigger={
                    <HStack gap={2} align="center">
                      <UserPlus size={14} aria-hidden="true" />
                      <Text weight="semibold" size="sm">
                        Agregar persona al panel
                      </Text>
                    </HStack>
                  }
                >
                  <form onSubmit={handleAddAccess}>
                    <VStack
                      gap={3}
                      paddingBlockStart={3}
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
                        placeholder="equipo@nails.studio"
                        value={aEmail}
                        onChange={setAEmail}
                        isRequired
                      />
                      <Selector
                        label="Tipo de permiso"
                        value={aRole}
                        onChange={(v) => v && setARole(v as AdminRole)}
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
                            ...data.staff.map((s) => ({ value: s.id, label: s.name })),
                          ]}
                        />
                      ) : null}
                      <Button
                        type="submit"
                        label={savingAdmin ? 'Agregando...' : 'Crear acceso'}
                        variant="primary"
                        icon={<UserPlus size={15} aria-hidden="true" />}
                        width="100%"
                        isLoading={savingAdmin}
                        isDisabled={!aName.trim() || !aEmail.trim() || savingAdmin}
                      />
                    </VStack>
                  </form>
                </Collapsible>
              </VStack>
            ) : (
              <VStack className="ad-card-body" paddingBlockStart={4}>
                <Banner
                  status="info"
                  title="Solo disponible para la Dueña"
                  description="Únicamente la Dueña puede agregar cuentas nuevas o cambiar permisos del panel."
                />
              </VStack>
            )}
          </AdminConfigSection>
        </VStack>
      </VStack>
    </VStack>
  );
}
