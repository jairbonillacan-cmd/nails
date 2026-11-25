'use client';

import React, { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Link } from '@astryxdesign/core/Link';
import { List, ListItem } from '@astryxdesign/core/List';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Switch } from '@astryxdesign/core/Switch';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Cake, MessageCircle, Search, UserPlus } from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import type { ClientProfile } from '@/lib/types';
import { buildWhatsAppLink, formatDateShortInTimezone } from '@/lib/format';

function formatInstagramDisplay(handle: string): string {
  const clean = handle.trim().replace(/^@+/, '');
  return clean ? `@${clean}` : '';
}

function formatInstagramUrl(handle: string): string {
  const clean = handle.trim().replace(/^@+/, '');
  return `https://www.instagram.com/${encodeURIComponent(clean)}/`;
}

function getInitialLetter(fullName: string): string {
  const normalized = fullName
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  const first = normalized.charAt(0);
  return /^[A-Z]$/.test(first) ? first : '#';
}

export default function AdminClientsPage() {
  const { data, refresh } = useAdminData();
  const [activeTab, setActiveTab] = useState<'directory' | 'retention'>('directory');
  const [query, setQuery] = useState('');
  const [onlyBirthdays, setOnlyBirthdays] = useState(false);

  const [selected, setSelected] = useState<ClientProfile | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [birthdayDraft, setBirthdayDraft] = useState('');
  const [emailDraft, setEmailDraft] = useState('');
  const [instagramDraft, setInstagramDraft] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newInstagram, setNewInstagram] = useState('');
  const [newBirthday, setNewBirthday] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createConflict, setCreateConflict] = useState(false);
  const [creating, setCreating] = useState(false);

  const [bannerMsg, setBannerMsg] = useState<string | null>(null);

  const currentMonth = data ? data.serverTodayKey.slice(5, 7) : '';

  const visitCountByClient = useMemo(() => {
    const map = new Map<string, number>();
    if (!data) return map;
    for (const b of data.bookings) {
      if (b.status === 'canceled') continue;
      map.set(b.clientId, (map.get(b.clientId) ?? 0) + 1);
    }
    return map;
  }, [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    const filtered = data.clients.filter((c) => {
      if (onlyBirthdays && (!c.birthday || c.birthday.slice(5, 7) !== currentMonth)) {
        return false;
      }
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        c.fullName.toLowerCase().includes(q) ||
        c.phoneE164.includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.instagramHandle || '').toLowerCase().includes(q) ||
        c.notes.toLowerCase().includes(q)
      );
    });
    return filtered.toSorted((a, b) => a.fullName.localeCompare(b.fullName, 'es'));
  }, [data, query, onlyBirthdays, currentMonth]);

  const groupedByLetter = useMemo(() => {
    const groups = new Map<string, ClientProfile[]>();
    for (const client of rows) {
      const letter = getInitialLetter(client.fullName);
      const list = groups.get(letter) ?? [];
      list.push(client);
      groups.set(letter, list);
    }
    return Array.from(groups.entries()).toSorted(([a], [b]) => {
      if (a === '#') return 1;
      if (b === '#') return -1;
      return a.localeCompare(b, 'es');
    });
  }, [rows]);

  const retention = data?.retention ?? null;

  const returningClients = useMemo(() => {
    if (!data) return [];
    return data.clients
      .map((client) => ({
        client,
        visits: visitCountByClient.get(client.id) ?? 0,
      }))
      .filter((entry) => entry.visits >= 2)
      .toSorted((a, b) => b.visits - a.visits);
  }, [data, visitCountByClient]);

  if (!data || !retention) return null;

  const canManageClients =
    data.session.user.role === 'owner' || data.session.user.role === 'admin';
  const tz = data.settings.timezone || 'America/Mexico_City';

  const openNotes = (c: ClientProfile) => {
    setSelected(c);
    setNotesDraft(c.notes);
    setBirthdayDraft(c.birthday || '');
    setEmailDraft(c.email || '');
    setInstagramDraft(c.instagramHandle || '');
    setEditError(null);
  };

  const saveClient = async () => {
    if (!selected) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selected.id,
          notes: notesDraft,
          birthday: birthdayDraft.trim() || null,
          email: emailDraft.trim() || null,
          instagramHandle: instagramDraft.trim() || null,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setEditError(json.error || 'No se pudo actualizar la ficha.');
        return;
      }
      setSelected(null);
      setBannerMsg('Ficha de clienta actualizada.');
      await refresh();
    } catch {
      setEditError('Error de conexión al guardar la ficha.');
    } finally {
      setSavingEdit(false);
    }
  };

  const resetCreateForm = () => {
    setNewName('');
    setNewPhone('');
    setNewEmail('');
    setNewInstagram('');
    setNewBirthday('');
    setNewNotes('');
    setCreateError(null);
    setCreateConflict(false);
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    setCreateConflict(false);
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: newName,
          phone: newPhone,
          email: newEmail.trim() || null,
          instagramHandle: newInstagram.trim() || null,
          birthday: newBirthday.trim() || null,
          technicalNotes: newNotes.trim(),
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (res.status === 409) {
        setCreateConflict(true);
        setCreateError(
          json.error || 'Ya existe una clienta registrada con ese WhatsApp.',
        );
        return;
      }
      if (!res.ok) {
        setCreateError(json.error || 'Revisa los datos ingresados.');
        return;
      }
      setCreateOpen(false);
      resetCreateForm();
      setBannerMsg('Clienta registrada correctamente en el directorio.');
      await refresh();
    } catch {
      setCreateError('Error de conexión al registrar la clienta.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <VStack gap={5}>
      <HStack justify="between" align="center" wrap="wrap" gap={3}>
        <VStack gap={0.5}>
          <Heading level={1}>Directorio de Clientas</Heading>
          <Text color="secondary">
            Directorio A–Z con Instagram, historial de visitas, fórmulas técnicas y seguimiento de retención.
          </Text>
        </VStack>

        <HStack gap={2} align="center" wrap="wrap">
          {canManageClients ? (
            <Button
              label="+ Nueva clienta"
              variant="primary"
              size="sm"
              icon={<UserPlus size={15} />}
              onClick={() => {
                resetCreateForm();
                setCreateOpen(true);
              }}
            />
          ) : null}
        </HStack>
      </HStack>

      {bannerMsg ? (
        <Banner
          status="success"
          title={bannerMsg}
          isDismissable
          onDismiss={() => setBannerMsg(null)}
        />
      ) : null}

      <TabList
        value={activeTab}
        onChange={(v) => setActiveTab(v as 'directory' | 'retention')}
        hasDivider
      >
        <Tab value="directory" label={`Directorio A–Z (${rows.length})`} />
        <Tab
          value="retention"
          label={`Retención (${retention.inactiveClients.length} inactivas)`}
        />
      </TabList>

      {activeTab === 'directory' ? (
        <VStack gap={4}>
          <HStack justify="between" align="center" wrap="wrap" gap={3}>
            <TextInput
              label="Buscar clienta"
              isLabelHidden
              placeholder="Nombre, WhatsApp, @instagram o nota..."
              startIcon={<Search size={14} />}
              size="sm"
              value={query}
              onChange={setQuery}
            />
            <Switch
              label="Cumpleañeras del mes"
              size="sm"
              value={onlyBirthdays}
              onChange={setOnlyBirthdays}
            />
          </HStack>

          {groupedByLetter.length === 0 ? (
            <Card padding={5}>
              <EmptyState
                isCompact
                title="No se encontraron clientas"
                description="Ajusta la búsqueda o registra una nueva clienta manualmente."
                actions={
                  canManageClients ? (
                    <Button
                      label="+ Nueva clienta"
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        resetCreateForm();
                        setCreateOpen(true);
                      }}
                    />
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <VStack gap={4}>
              {groupedByLetter.map(([letter, clientsInGroup]) => (
                <VStack key={letter} gap={2}>
                  <HStack gap={2} align="center">
                    <Badge variant="info" label={letter} />
                    <Text type="supporting" color="secondary">
                      {clientsInGroup.length} clienta(s)
                    </Text>
                  </HStack>
                  <Card padding={0}>
                    <List hasDividers>
                      {clientsInGroup.map((c) => {
                        const visits = visitCountByClient.get(c.id) ?? 0;
                        return (
                          <ListItem
                            key={c.id}
                            startContent={<Avatar name={c.fullName} size="sm" />}
                            label={c.fullName}
                            description={
                              <VStack gap={0.5}>
                                <HStack gap={2} wrap="wrap" align="center">
                                  <Text
                                    type="supporting"
                                    color="secondary"
                                    hasTabularNumbers
                                  >
                                    {c.phoneE164}
                                  </Text>
                                  {c.instagramHandle ? (
                                    <Link
                                      href={formatInstagramUrl(c.instagramHandle)}
                                      isExternalLink
                                      type="supporting"
                                    >
                                      {formatInstagramDisplay(c.instagramHandle)}
                                    </Link>
                                  ) : null}
                                  {c.birthday ? (
                                    <HStack gap={1} align="center">
                                      <Cake size={13} aria-hidden="true" />
                                      <Text type="supporting" color="secondary">
                                        {c.birthday}
                                      </Text>
                                    </HStack>
                                  ) : null}
                                </HStack>
                                {c.notes ? (
                                  <Text type="supporting" color="secondary" maxLines={2}>
                                    {c.notes}
                                  </Text>
                                ) : null}
                              </VStack>
                            }
                            endContent={
                              <HStack gap={1.5} align="center" wrap="wrap">
                                <Badge variant="neutral" label={`${visits} citas`} />
                                {c.noShowCount > 0 ? (
                                  <Badge
                                    variant="error"
                                    label={`${c.noShowCount} no-show`}
                                  />
                                ) : null}
                                <Button
                                  label="Ficha"
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => openNotes(c)}
                                />
                                <Button
                                  label="WhatsApp"
                                  size="sm"
                                  variant="ghost"
                                  icon={<MessageCircle size={14} />}
                                  href={buildWhatsAppLink(
                                    c.phoneE164,
                                    `Hola ${c.fullName}, te saludamos de ${data.settings.name}!`,
                                  )}
                                />
                              </HStack>
                            }
                          />
                        );
                      })}
                    </List>
                  </Card>
                </VStack>
              ))}
            </VStack>
          )}
        </VStack>
      ) : (
        <VStack gap={5}>
          <Grid columns={{ minWidth: 200, max: 3 }} gap={4}>
            <Card padding={4}>
              <VStack gap={0.5}>
                <Text type="label" color="secondary">
                  Clientas recurrentes (2+ visitas)
                </Text>
                <Heading level={2}>{retention.returningClientsCount}</Heading>
              </VStack>
            </Card>
            <Card padding={4}>
              <VStack gap={0.5}>
                <Text type="label" color="secondary">
                  Inactivas (30+ días sin visita)
                </Text>
                <Heading level={2}>{retention.inactiveClients.length}</Heading>
              </VStack>
            </Card>
            <Card padding={4} variant="muted">
              <VStack gap={0.5}>
                <Text type="label" color="accent">
                  Total en directorio
                </Text>
                <Heading level={2}>{data.clients.length}</Heading>
              </VStack>
            </Card>
          </Grid>

          <Card padding={5}>
            <VStack gap={3}>
              <VStack gap={0.5}>
                <Heading level={2}>
                  Clientas inactivas (30+ días sin visita)
                </Heading>
                <Text type="supporting" color="secondary">
                  Recupera clientas que no han agendado su retoque o nuevo set en más de un mes con un mensaje directo por WhatsApp.
                </Text>
              </VStack>

              {retention.inactiveClients.length === 0 ? (
                <EmptyState
                  isCompact
                  title="Sin clientas inactivas por ahora"
                  description="Todas tus clientas con visitas pasadas han vuelto recientemente o ya tienen próxima cita."
                />
              ) : (
                <List hasDividers>
                  {retention.inactiveClients.map((item) => {
                    const comebackMsg = `Hola ${item.fullName}, te extrañamos en ${data.settings.name}! Ya pasaron ${item.daysSinceLastVisit} días desde tu última visita. ¿Te apartamos horario para tu nuevo set o retoque?`;
                    return (
                      <ListItem
                        key={item.clientId}
                        startContent={<Avatar name={item.fullName} size="sm" />}
                        label={item.fullName}
                        description={
                          <HStack gap={2} wrap="wrap" align="center">
                            <Text type="supporting" color="secondary" hasTabularNumbers>
                              {item.phoneE164}
                            </Text>
                            {item.instagramHandle ? (
                              <Link
                                href={formatInstagramUrl(item.instagramHandle)}
                                isExternalLink
                                type="supporting"
                              >
                                {formatInstagramDisplay(item.instagramHandle)}
                              </Link>
                            ) : null}
                            <Text type="supporting" color="secondary">
                              Última visita: {formatDateShortInTimezone(item.lastVisitAt, tz)}
                            </Text>
                          </HStack>
                        }
                        endContent={
                          <HStack gap={2} align="center" wrap="wrap">
                            <Badge
                              variant="warning"
                              label={`Hace ${item.daysSinceLastVisit} días`}
                            />
                            <Button
                              label="Enviar mensaje de regreso (WhatsApp)"
                              variant="primary"
                              size="sm"
                              icon={<MessageCircle size={14} />}
                              href={buildWhatsAppLink(item.phoneE164, comebackMsg)}
                            />
                          </HStack>
                        }
                      />
                    );
                  })}
                </List>
              )}
            </VStack>
          </Card>

          <Card padding={5}>
            <VStack gap={3}>
              <Heading level={3}>Clientas frecuentes ({returningClients.length})</Heading>
              {returningClients.length === 0 ? (
                <Text type="supporting" color="secondary">
                  Aquí aparecerán tus clientas con 2 o más citas completadas o confirmadas.
                </Text>
              ) : (
                <List hasDividers>
                  {returningClients.map(({ client, visits }) => (
                    <ListItem
                      key={client.id}
                      startContent={<Avatar name={client.fullName} size="sm" />}
                      label={client.fullName}
                      description={
                        <HStack gap={2} wrap="wrap">
                          <Text type="supporting" color="secondary" hasTabularNumbers>
                            {client.phoneE164}
                          </Text>
                          {client.instagramHandle ? (
                            <Link
                              href={formatInstagramUrl(client.instagramHandle)}
                              isExternalLink
                              type="supporting"
                            >
                              {formatInstagramDisplay(client.instagramHandle)}
                            </Link>
                          ) : null}
                        </HStack>
                      }
                      endContent={
                        <Badge variant="success" label={`${visits} visitas`} />
                      }
                    />
                  ))}
                </List>
              )}
            </VStack>
          </Card>
        </VStack>
      )}

      <Dialog
        isOpen={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) resetCreateForm();
        }}
        width={500}
        padding={5}
      >
        <DialogHeader
          title="Nueva clienta"
          subtitle="Registra manualmente una clienta en el directorio del salón."
          onOpenChange={setCreateOpen}
        />
        <form onSubmit={handleCreateClient}>
          <VStack gap={3} paddingBlockStart={4}>
            {createError ? (
              <Banner
                status={createConflict ? 'warning' : 'error'}
                title={
                  createConflict
                    ? 'WhatsApp ya registrado'
                    : 'No se pudo registrar la clienta'
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
            <Grid columns={{ minWidth: 180, max: 2 }} gap={3}>
              <TextInput
                label="Teléfono / WhatsApp"
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
            <Grid columns={{ minWidth: 180, max: 2 }} gap={3}>
              <TextInput
                label="Correo electrónico"
                type="email"
                placeholder="clienta@correo.com"
                value={newEmail}
                onChange={setNewEmail}
                isOptional
              />
              <TextInput
                label="Cumpleaños (YYYY-MM-DD)"
                placeholder="1997-08-15"
                value={newBirthday}
                onChange={setNewBirthday}
                isOptional
              />
            </Grid>
            <TextArea
              label="Notas técnicas (uñas, tonos, alergias)"
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

      <Dialog
        isOpen={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
        width={480}
        padding={5}
      >
        <DialogHeader
          title={selected?.fullName || 'Ficha de clienta'}
          subtitle={selected?.phoneE164}
          onOpenChange={() => setSelected(null)}
        />
        <VStack gap={3} paddingBlockStart={4}>
          {editError ? <Banner status="error" title={editError} /> : null}
          {selected?.instagramHandle ? (
            <HStack gap={2} align="center">
              <Text type="supporting" color="secondary">
                Perfil actual:
              </Text>
              <Link
                href={formatInstagramUrl(selected.instagramHandle)}
                isExternalLink
                type="supporting"
              >
                {formatInstagramDisplay(selected.instagramHandle)}
              </Link>
            </HStack>
          ) : null}
          <TextInput
            label="Instagram (@usuario)"
            placeholder="@usuario"
            value={instagramDraft}
            onChange={setInstagramDraft}
            isOptional
          />
          <Grid columns={{ minWidth: 180, max: 2 }} gap={3}>
            <TextInput
              label="Correo electrónico"
              type="email"
              value={emailDraft}
              onChange={setEmailDraft}
              isOptional
            />
            <TextInput
              label="Cumpleaños (YYYY-MM-DD)"
              value={birthdayDraft}
              onChange={setBirthdayDraft}
              isOptional
            />
          </Grid>
          <TextArea
            label="Notas técnicas privadas (base favorita, alergias, largo, tono)"
            value={notesDraft}
            onChange={setNotesDraft}
            rows={4}
          />
          <Button
            label="Guardar ficha"
            variant="primary"
            width="100%"
            isLoading={savingEdit}
            onClick={saveClient}
          />
        </VStack>
      </Dialog>
    </VStack>
  );
}
