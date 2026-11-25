'use client';

import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Table } from '@astryxdesign/core/Table';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Switch } from '@astryxdesign/core/Switch';
import { Cake, MessageCircle, Search } from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import type { ClientProfile } from '@/lib/types';
import { buildWhatsAppLink } from '@/lib/format';

export default function AdminClientsPage() {
  const { data, refresh } = useAdminData();
  const [query, setQuery] = useState('');
  const [onlyBirthdays, setOnlyBirthdays] = useState(false);
  const [selected, setSelected] = useState<ClientProfile | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [birthdayDraft, setBirthdayDraft] = useState('');

  const currentMonth = data ? data.serverTodayKey.slice(5, 7) : '';

  const rows = useMemo(() => {
    if (!data) return [];
    return data.clients.filter((c) => {
      if (onlyBirthdays && (!c.birthday || c.birthday.slice(5, 7) !== currentMonth)) {
        return false;
      }
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        c.fullName.toLowerCase().includes(q) ||
        c.phoneE164.includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        c.notes.toLowerCase().includes(q)
      );
    });
  }, [data, query, onlyBirthdays, currentMonth]);

  if (!data) return null;

  const openNotes = (c: ClientProfile) => {
    setSelected(c);
    setNotesDraft(c.notes);
    setBirthdayDraft(c.birthday || '');
  };

  const saveClient = async () => {
    if (!selected) return;
    await fetch('/api/admin/clients', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: selected.id,
        notes: notesDraft,
        birthday: birthdayDraft || null,
      }),
    });
    setSelected(null);
    await refresh();
  };

  return (
    <VStack gap={5}>
      <HStack justify="between" align="center" wrap="wrap" gap={3}>
        <VStack gap={0.5}>
          <Heading level={1}>Directorio de Clientas</Heading>
          <Text color="secondary">
            Se llena automáticamente con cada reserva. Guarda fórmulas, forma de uña, alergias y cumpleaños.
          </Text>
        </VStack>

        <HStack gap={3} align="center" wrap="wrap">
          <Switch
            label="Cumpleañeras del mes"
            size="sm"
            value={onlyBirthdays}
            onChange={setOnlyBirthdays}
          />
          <TextInput
            label="Buscar clienta"
            isLabelHidden
            placeholder="Nombre, WhatsApp o nota..."
            startIcon={<Search size={14} />}
            size="sm"
            value={query}
            onChange={setQuery}
          />
        </HStack>
      </HStack>

      <Card padding={0}>
        <Table
          idKey="id"
          hasHover
          data={rows}
          columns={[
            {
              key: 'fullName',
              header: 'Clienta',
              renderCell: (c) => (
                <VStack gap={0}>
                  <Text weight="semibold">{c.fullName}</Text>
                  <Text type="supporting" color="secondary">
                    {c.email || 'Sin correo'}
                  </Text>
                </VStack>
              ),
            },
            {
              key: 'phoneE164',
              header: 'WhatsApp',
              renderCell: (c) => <Text hasTabularNumbers>{c.phoneE164}</Text>,
            },
            {
              key: 'birthday',
              header: 'Cumpleaños',
              renderCell: (c) =>
                c.birthday ? (
                  <HStack gap={1} align="center">
                    <Cake size={14} aria-hidden="true" />
                    <Text type="supporting">{c.birthday}</Text>
                  </HStack>
                ) : (
                  <Text type="supporting" color="secondary">
                    —
                  </Text>
                ),
            },
            {
              key: 'notes',
              header: 'Notas técnicas (uñas / tonos / alergias)',
              renderCell: (c) => (
                <Text type="supporting" color="secondary" maxLines={2}>
                  {c.notes || 'Sin notas aún'}
                </Text>
              ),
            },
            {
              key: 'noShowCount',
              header: 'Historial',
              renderCell: (c) => {
                const visits = data.bookings.filter((b) => b.clientId === c.id).length;
                return (
                  <HStack gap={1.5}>
                    <Badge variant="neutral" label={`${visits} citas`} />
                    {c.noShowCount > 0 ? (
                      <Badge variant="error" label={`${c.noShowCount} no-show`} />
                    ) : null}
                  </HStack>
                );
              },
            },
            {
              key: 'actions',
              header: 'Acciones',
              renderCell: (c) => (
                <HStack gap={1.5}>
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
              ),
            },
          ]}
        />
      </Card>

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
          <TextInput
            label="Cumpleaños (YYYY-MM-DD)"
            value={birthdayDraft}
            onChange={setBirthdayDraft}
          />
          <TextArea
            label="Notas técnicas privadas (base favorita, alergias, largo, tono)"
            value={notesDraft}
            onChange={setNotesDraft}
            rows={4}
          />
          <Button label="Guardar ficha" variant="primary" width="100%" onClick={saveClient} />
        </VStack>
      </Dialog>
    </VStack>
  );
}
