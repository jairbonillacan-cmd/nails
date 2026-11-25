'use client';

import React, { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Avatar } from '@astryxdesign/core/Avatar';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { Banner } from '@astryxdesign/core/Banner';
import { List, ListItem } from '@astryxdesign/core/List';
import { Shield, UserPlus } from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import type { AdminRole } from '@/lib/types';

export default function AdminTeamPage() {
  const { data, refresh } = useAdminData();
  const [msg, setMsg] = useState<string | null>(null);

  const [sName, setSName] = useState('');
  const [sRoleTitle, setSRoleTitle] = useState('Nail Artist');
  const [sBio, setSBio] = useState('');
  const [sCommission, setSCommission] = useState(35);

  const [aName, setAName] = useState('');
  const [aEmail, setAEmail] = useState('');
  const [aRole, setARole] = useState<AdminRole>('admin');
  const [aStaffId, setAStaffId] = useState<string>('none');

  if (!data) return null;
  const isOwner = data.session.user.role === 'owner';

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sName.trim()) return;
    const res = await fetch('/api/admin/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'staff',
        data: {
          name: sName,
          roleTitle: sRoleTitle,
          bio: sBio,
          commissionPercent: sCommission,
        },
      }),
    });
    if (res.ok) {
      setSName('');
      setSBio('');
      setMsg('Especialista agregada con horario base listo.');
      await refresh();
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aEmail.trim() || !aName.trim()) return;
    const res = await fetch('/api/admin/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'admin_user',
        data: {
          fullName: aName,
          email: aEmail,
          role: aRole,
          staffMemberId: aStaffId === 'none' ? null : aStaffId,
          isActive: true,
        },
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMsg(json.error || 'No se pudo agregar usuario.');
      return;
    }
    setAName('');
    setAEmail('');
    setMsg('Administrador agregado. Ya puede entrar al panel con su rol asignado.');
    await refresh();
  };

  return (
    <VStack gap={5}>
      <VStack gap={0.5}>
        <Heading level={1}>Equipo y Múltiples Administradores</Heading>
        <Text color="secondary">
          Agrega manicuristas sin costo extra por asiento y otorga accesos al panel con roles diferenciados (Dueña, Admin/Recepción y Manicurista).
        </Text>
      </VStack>

      {msg ? (
        <Banner status="info" title={msg} isDismissable onDismiss={() => setMsg(null)} />
      ) : null}

      <Grid columns={{ minWidth: 320, max: 2 }} gap={5} align="start">

        <VStack gap={4}>
          <Card padding={5}>
            <VStack gap={3}>
              <HStack justify="between" align="center">
                <Heading level={2}>Manicuristas ({data.staff.length})</Heading>
                <Badge
                  variant="info"
                  label={
                    data.staff.filter((s) => s.isActive).length <= 1
                      ? 'Modo 1 especialista (oculto en web)'
                      : 'Selección visible en web'
                  }
                />
              </HStack>
              <List hasDividers>
                {data.staff.map((st) => (
                  <ListItem
                    key={st.id}
                    startContent={<Avatar name={st.name} size="md" />}
                    label={st.name}
                    description={
                      <Text type="supporting" color="secondary">
                        {st.roleTitle} · Comisión {st.commissionPercent}% · /reservar?staff=
                        {st.bookingSlug}
                      </Text>
                    }
                    endContent={
                      <Switch
                        label="Activa"
                        size="sm"
                        value={st.isActive}
                        onChange={async (checked) => {
                          await fetch('/api/admin/team', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              kind: 'staff',
                              data: { ...st, isActive: checked },
                            }),
                          });
                          await refresh();
                        }}
                      />
                    }
                  />
                ))}
              </List>
            </VStack>
          </Card>

          <Card padding={5}>
            <form onSubmit={handleAddStaff}>
              <VStack gap={3}>
                <Heading level={3}>Agregar nueva manicurista</Heading>
                <TextInput
                  label="Nombre"
                  placeholder="Ej. Fernanda Ruiz"
                  value={sName}
                  onChange={setSName}
                  isRequired
                />
                <Grid columns={2} gap={3}>
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
                    onChange={setSCommission}
                  />
                </Grid>
                <TextInput
                  label="Bio corta"
                  placeholder="Especialista en gelish y diseños minimalistas"
                  value={sBio}
                  onChange={setSBio}
                />
                <Button
                  type="submit"
                  label="Agregar especialista"
                  variant="primary"
                  icon={<UserPlus size={15} />}
                  width="100%"
                />
              </VStack>
            </form>
          </Card>
        </VStack>

        <VStack gap={4}>
          <Card padding={5}>
            <VStack gap={3}>
              <HStack gap={2} align="center">
                <Shield size={18} aria-hidden="true" />
                <Heading level={2}>Usuarios del Panel Admin</Heading>
              </HStack>
              <Text type="supporting" color="secondary">
                Desacoplados de las manicuristas: puedes tener varias administradoras o recepcionistas sin costo adicional.
              </Text>
              <List hasDividers>
                {data.adminUsers.map((u) => (
                  <ListItem
                    key={u.id}
                    label={u.fullName}
                    description={
                      <Text type="supporting" color="secondary">
                        {u.email}
                      </Text>
                    }
                    endContent={
                      <Badge
                        variant={
                          u.role === 'owner'
                            ? 'purple'
                            : u.role === 'admin'
                              ? 'info'
                              : 'neutral'
                        }
                        label={
                          u.role === 'owner'
                            ? 'Dueña (Owner)'
                            : u.role === 'admin'
                              ? 'Admin / Recepción'
                              : 'Manicurista'
                        }
                      />
                    }
                  />
                ))}
              </List>
            </VStack>
          </Card>

          <Card padding={5}>
            {isOwner ? (
              <form onSubmit={handleAddAdmin}>
                <VStack gap={3}>
                  <Heading level={3}>Invitar / Agregar administrador</Heading>
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
                      { value: 'admin', label: 'Admin / Recepción (Citas, caja, servicios, clientas)' },
                      { value: 'specialist', label: 'Manicurista (Solo su agenda, horarios y comisiones)' },
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
                    width="100%"
                  />
                </VStack>
              </form>
            ) : (
              <Banner
                status="info"
                title="Permiso de Dueña requerido"
                description="Solo el rol Dueña (Owner) puede invitar nuevos administradores o modificar permisos."
              />
            )}
          </Card>
        </VStack>
      </Grid>
    </VStack>
  );
}
