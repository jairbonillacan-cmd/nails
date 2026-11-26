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
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import type { AdminRole, AdminUser, StaffMember } from '@/lib/types';

const ROLE_META: Record<
  AdminRole,
  { label: string; tone: 'accent' | 'neutral' | 'success' }
> = {
  owner: { label: 'Dueña (Owner)', tone: 'accent' },
  admin: { label: 'Admin / Recepción', tone: 'neutral' },
  specialist: { label: 'Manicurista', tone: 'success' },
};

export default function AdminTeamPage() {
  const { data, loading, refresh } = useAdminData();
  const [msg, setMsg] = useState<{ status: 'success' | 'error'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const copyFeedback = useEphemeralMessage(2400);

  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [sName, setSName] = useState('');
  const [sRoleTitle, setSRoleTitle] = useState('Nail Artist');
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
      sub: `de ${data.staff.length} en el estudio`,
    },
    {
      id: 'web-mode',
      label: 'Selección en web',
      value: activeStaffCount <= 1 ? 'Directa' : 'Por artista',
      sub:
        activeStaffCount <= 1
          ? 'Modo 1 especialista (automático)'
          : 'Clienta elige o "Me da igual"',
    },
    {
      id: 'admin-users',
      label: 'Accesos al panel',
      value: String(activeAdminCount),
      sub: `${data.adminUsers.length} cuentas RBAC sin costo extra`,
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
    setSRoleTitle('Nail Artist');
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
    if (sName.trim().length < 2) return;
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
            roleTitle: sRoleTitle.trim() || 'Nail Artist',
            bio: sBio.trim(),
            commissionPercent: sCommission,
            serviceIds: effectiveServiceIds.length > 0 ? effectiveServiceIds : allServiceIds,
          },
        }),
      });
      if (res.ok) {
        const wasEditing = Boolean(editingStaffId);
        resetStaffForm();
        setMsg({
          status: 'success',
          text: wasEditing
            ? 'Datos de la especialista actualizados.'
            : 'Especialista agregada con horario base listo.',
        });
        await refresh();
      } else {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        setMsg({
          status: 'error',
          text: err?.error || 'No se pudo guardar la especialista.',
        });
      }
    } catch {
      setMsg({ status: 'error', text: 'Error de conexión al guardar la especialista.' });
    } finally {
      setSavingStaff(false);
    }
  };

  const handleToggleStaffActive = async (st: StaffMember, checked: boolean) => {
    setBusyId(st.id);
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
        setMsg({
          status: 'success',
          text: checked
            ? `${st.name} activada para recibir citas.`
            : `${st.name} pausada en la agenda pública.`,
        });
        await refresh();
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
      copyFeedback.show(`Enlace directo de ${name} copiado.`);
    } catch {
      setMsg({
        status: 'error',
        text: `Copia manualmente /reservar?staff=${slug}`,
      });
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aEmail.trim() || !aName.trim()) return;
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
          text: json?.error || 'No se pudo agregar el usuario.',
        });
        return;
      }
      setAName('');
      setAEmail('');
      setARole('admin');
      setAStaffId('none');
      setMsg({
        status: 'success',
        text: 'Usuario agregado. Ya puede entrar al panel con su rol asignado.',
      });
      await refresh();
    } catch {
      setMsg({ status: 'error', text: 'Error de conexión al invitar usuario.' });
    } finally {
      setSavingAdmin(false);
    }
  };

  const handleToggleAdminActive = async (user: AdminUser, checked: boolean) => {
    if (!isOwner || user.id === data.session.user.id) return;
    setBusyId(user.id);
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
        setMsg({
          status: 'success',
          text: checked
            ? `Acceso reactivado para ${user.fullName}.`
            : `Acceso pausado para ${user.fullName}.`,
        });
        await refresh();
      } else {
        setMsg({ status: 'error', text: 'No se pudo actualizar el acceso del usuario.' });
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <VStack className="ad-page">
      <AdminConfigPageHeader
        eyebrow="Equipo y permisos"
        title="Equipo y accesos"
        subtitle="Agrega manicuristas con % de comisión y servicios asignados, y administra usuarios del panel con roles diferenciados (Dueña, Admin/Recepción y Manicurista)."
      />

      <AdminConfigKpiStrip ariaLabel="Resumen de equipo" items={kpiItems} cols={3} />

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
            title="Manicuristas"
            subtitle="Cada especialista tiene su enlace directo de reserva y % de comisión."
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
                title="Aún no hay especialistas"
                description="Registra a tu primera manicurista para habilitar horarios y reservas en línea."
              />
            ) : (
              <VStack as="ul" className="ad-row-list" gap={0}>
                {data.staff.map((st) => {
                  const isEditingThis = editingStaffId === st.id;
                  const isCopied = copiedSlug === st.bookingSlug && Boolean(copyFeedback.message);
                  return (
                    <li
                      key={st.id}
                      className="ad-list-row"
                      data-selected={isEditingThis ? 'true' : undefined}
                      data-muted={!st.isActive ? 'true' : undefined}
                    >
                      <VStack gap={2} width="100%">
                        <HStack justify="between" align="center" gap={3} wrap="wrap">
                          <HStack gap={2} align="center" className="rb-grow">
                            <Avatar name={st.name} size="md" />
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
                              <Text type="supporting" color="secondary">
                                {st.roleTitle} · /reservar?staff={st.bookingSlug}
                              </Text>
                            </VStack>
                          </HStack>

                          <Switch
                            label={`Activa ${st.name}`}
                            isLabelHidden
                            size="sm"
                            value={st.isActive}
                            isLoading={busyId === st.id}
                            onChange={(checked) => void handleToggleStaffActive(st, checked)}
                          />
                        </HStack>

                        <HStack gap={1.5} wrap="wrap">
                          <Button
                            type="button"
                            label={isCopied ? 'Enlace copiado' : 'Copiar enlace'}
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
            title={editingStaffId ? 'Editar especialista' : 'Agregar nueva manicurista'}
            subtitle="Configura puesto, comisión y los servicios que realiza."
            actions={
              editingStaffId ? (
                <Button
                  type="button"
                  label="Cancelar"
                  variant="ghost"
                  size="sm"
                  onClick={resetStaffForm}
                />
              ) : null
            }
          >
            <form onSubmit={handleSaveStaff}>
              <VStack gap={3} className="ad-card-body" paddingBlockStart={4}>
                <TextInput
                  label="Nombre"
                  placeholder="Ej. Fernanda Ruiz"
                  value={sName}
                  onChange={setSName}
                  isRequired
                />
                <Grid columns={{ minWidth: 140, max: 2 }} gap={3}>
                  <TextInput
                    label="Especialidad / Puesto"
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
                  label="Bio corta"
                  placeholder="Especialista en gelish y diseños minimalistas"
                  value={sBio}
                  onChange={setSBio}
                />

                {data.services.length > 0 ? (
                  <>
                    <Divider />
                    <Collapsible
                      defaultIsOpen={Boolean(editingStaffId)}
                      trigger={
                        <HStack gap={2} align="center">
                          <Text weight="semibold" size="sm">
                            Servicios asignados
                          </Text>
                          <AdminConfigChip
                            tone="neutral"
                            label={`${effectiveServiceIds.length} de ${data.services.length}`}
                            hasTabularNumbers
                          />
                        </HStack>
                      }
                    >
                      <Grid
                        columns={{ minWidth: 150, max: 2 }}
                        gap={1.5}
                        xstyle={undefined}
                      >
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
                    </Collapsible>
                  </>
                ) : null}

                <Button
                  type="submit"
                  label={editingStaffId ? 'Guardar cambios' : 'Agregar especialista'}
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
            id="team-admins-heading"
            icon={<Shield size={16} aria-hidden="true" />}
            title="Usuarios del panel admin"
            subtitle="Permisos RBAC desacoplados: Dueña, Admin/Recepción y Manicurista."
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
                const isSelf = u.id === data.session.user.id;
                const linkedStaff = u.staffMemberId ? staffNameById.get(u.staffMemberId) : null;

                return (
                  <li
                    key={u.id}
                    className="ad-row-item"
                    data-muted={!u.isActive ? 'true' : undefined}
                  >
                    <HStack gap={2} align="center" className="rb-grow">
                      <Avatar name={u.fullName} size="sm" />
                      <VStack gap={0.5} className="rb-grow">
                        <HStack gap={1.5} align="center" wrap="wrap">
                          <Text weight="semibold">{u.fullName}</Text>
                          {isSelf ? <AdminConfigChip label="Tú" tone="accent" /> : null}
                          {!u.isActive ? (
                            <AdminConfigChip label="Pausado" tone="neutral" />
                          ) : null}
                        </HStack>
                        <Text type="supporting" color="secondary">
                          {u.email}
                          {linkedStaff ? ` · Vinculada a ${linkedStaff}` : ''}
                        </Text>
                      </VStack>
                    </HStack>

                    <HStack gap={2} align="center" wrap="wrap">
                      <AdminConfigChip label={roleMeta.label} tone={roleMeta.tone} />
                      {isOwner && !isSelf ? (
                        <Switch
                          label={`Acceso de ${u.fullName}`}
                          isLabelHidden
                          size="sm"
                          value={u.isActive}
                          isLoading={busyId === u.id}
                          onChange={(checked) => void handleToggleAdminActive(u, checked)}
                        />
                      ) : null}
                    </HStack>
                  </li>
                );
              })}
            </VStack>
          </AdminConfigSection>

          <AdminConfigSection
            id="team-invite-admin-heading"
            title="Invitar / Agregar administrador"
            subtitle="Otorga acceso seguro con permisos limitados a su rol."
          >
            {isOwner ? (
              <form onSubmit={handleAddAdmin}>
                <VStack gap={3} className="ad-card-body" paddingBlockStart={4}>
                  <TextInput
                    label="Nombre completo"
                    placeholder="Ej. Recepción Turno Tarde"
                    value={aName}
                    onChange={setAName}
                    isRequired
                  />
                  <TextInput
                    label="Correo de acceso"
                    type="email"
                    placeholder="equipo@nails.studio"
                    value={aEmail}
                    onChange={setAEmail}
                    isRequired
                  />
                  <Selector
                    label="Rol y permisos"
                    value={aRole}
                    onChange={(v) => v && setARole(v as AdminRole)}
                    options={[
                      { value: 'owner', label: 'Dueña (Control total + marca + integraciones)' },
                      {
                        value: 'admin',
                        label: 'Admin / Recepción (Citas, caja, servicios, clientas)',
                      },
                      {
                        value: 'specialist',
                        label: 'Manicurista (Solo su agenda, horarios y comisiones)',
                      },
                    ]}
                  />
                  {aRole === 'specialist' ? (
                    <Selector
                      label="Vincular con manicurista"
                      value={aStaffId}
                      onChange={(v) => v && setAStaffId(v)}
                      options={[
                        { value: 'none', label: 'Sin vincular' },
                        ...data.staff.map((s) => ({ value: s.id, label: s.name })),
                      ]}
                    />
                  ) : null}
                  <Button
                    type="submit"
                    label="Agregar usuario al panel"
                    variant="primary"
                    icon={<UserPlus size={15} aria-hidden="true" />}
                    width="100%"
                    isLoading={savingAdmin}
                    isDisabled={!aName.trim() || !aEmail.trim() || savingAdmin}
                  />
                </VStack>
              </form>
            ) : (
              <VStack className="ad-card-body" paddingBlockStart={4}>
                <Banner
                  status="info"
                  title="Permiso de Dueña requerido"
                  description="Solo el rol Dueña (Owner) puede invitar nuevos administradores o modificar permisos."
                />
              </VStack>
            )}
          </AdminConfigSection>
        </VStack>
      </VStack>
    </VStack>
  );
}
