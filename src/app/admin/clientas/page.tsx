'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Link } from '@astryxdesign/core/Link';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Switch } from '@astryxdesign/core/Switch';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Divider } from '@astryxdesign/core/Divider';
import {
  Award,
  Cake,
  Download,
  MessageCircle,
  Search,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import { computeClientLoyaltySummary } from '@/lib/loyalty/stamps';
import type { ClientProfile } from '@/lib/types';
import { buildWhatsAppLink, formatDateShortInTimezone } from '@/lib/format';

type ClientsTab = 'directory' | 'retention' | 'rewards';

interface InactiveClientRow {
  clientId: string;
  fullName: string;
  phoneE164: string;
  instagramHandle: string | null;
  lastVisitAt: string | null;
  daysSinceLastVisit: number | null;
  totalVisits: number;
}

const INACTIVE_DAY_PRESETS = [
  { days: 21, label: '21 días · Retoque' },
  { days: 30, label: '30 días' },
  { days: 45, label: '45 días · Reactivación' },
  { days: 60, label: '60 días' },
] as const;

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

function resolveTabParam(param: string | null): ClientsTab | null {
  if (param === 'retencion' || param === 'retention') return 'retention';
  if (param === 'premios' || param === 'rewards') return 'rewards';
  if (param === 'directorio' || param === 'directory') return 'directory';
  return null;
}

export default function AdminClientsPage() {
  const { data, refresh } = useAdminData();
  const searchParams = useSearchParams();
  const paramTab = searchParams.get('tab');
  const paramQuery = searchParams.get('q')?.trim() ?? '';

  const [activeTab, setActiveTab] = useState<ClientsTab>(
    () => resolveTabParam(paramTab) ?? 'directory',
  );
  const [query, setQuery] = useState<string>(() => paramQuery);
  const [onlyBirthdays, setOnlyBirthdays] = useState(false);

  const [inactiveDays, setInactiveDays] = useState<number>(21);
  const [inactiveResult, setInactiveResult] = useState<{
    days: number;
    clients: InactiveClientRow[];
  } | null>(null);
  const [inactiveLoading, setInactiveLoading] = useState(false);
  const [inactiveError, setInactiveError] = useState<string | null>(null);

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
  const lastUrlKeyRef = useRef(`${paramTab ?? ''}|${paramQuery}`);

  const canManageClients = Boolean(
    data && (data.session.user.role === 'owner' || data.session.user.role === 'admin'),
  );

  useExternalSync(`clients-url|${paramTab ?? ''}|${paramQuery}`, async (signal) => {
    if (signal.aborted) return;
    const key = `${paramTab ?? ''}|${paramQuery}`;
    if (lastUrlKeyRef.current === key) return;
    lastUrlKeyRef.current = key;
    const nextTab = resolveTabParam(paramTab);
    if (nextTab) setActiveTab(nextTab);
    if (paramQuery) setQuery(paramQuery);
  });

  useExternalSync(
    activeTab === 'retention' && canManageClients
      ? `inactive-clients-${inactiveDays}`
      : 'inactive-clients-idle',
    async (signal, key) => {
      if (key === 'inactive-clients-idle') return;
      setInactiveLoading(true);
      setInactiveError(null);
      try {
        const res = await fetch(`/api/admin/clients?inactiveDays=${inactiveDays}`, {
          cache: 'no-store',
          signal,
        });
        if (signal.aborted) return;
        const json = (await res.json()) as {
          error?: string;
          inactiveDays?: number;
          clients?: InactiveClientRow[];
        };
        if (!res.ok) {
          setInactiveError(json.error || 'No se pudo consultar el filtro de inactividad.');
          return;
        }
        setInactiveResult({
          days: json.inactiveDays ?? inactiveDays,
          clients: json.clients ?? [],
        });
      } catch {
        if (!signal.aborted) {
          setInactiveError('Error de conexión al consultar clientas inactivas.');
        }
      } finally {
        if (!signal.aborted) {
          setInactiveLoading(false);
        }
      }
    },
  );

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

  const loyaltyByClientId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeClientLoyaltySummary>>();
    if (!data || !data.loyaltyProgram) return map;
    const rewardServiceName = data.loyaltyProgram.rewardServiceId
      ? (data.services.find((s) => s.id === data.loyaltyProgram?.rewardServiceId)?.name ??
        null)
      : null;
    for (const client of data.clients) {
      map.set(
        client.id,
        computeClientLoyaltySummary(
          data.loyaltyProgram,
          data.loyaltyStamps,
          client.id,
          rewardServiceName,
        ),
      );
    }
    return map;
  }, [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    const trimmed = query.trim();
    const q = trimmed.toLowerCase();
    const qDigits = trimmed.replace(/\D/g, '');
    const filtered = data.clients.filter((c) => {
      if (onlyBirthdays && (!c.birthday || c.birthday.slice(5, 7) !== currentMonth)) {
        return false;
      }
      if (!trimmed) return true;
      const phoneDigits = c.phoneE164.replace(/\D/g, '');
      return (
        c.fullName.toLowerCase().includes(q) ||
        c.phoneE164.toLowerCase().includes(q) ||
        (qDigits.length >= 4 && phoneDigits.includes(qDigits)) ||
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

  const tz = data.settings.timezone || 'America/Mexico_City';
  const nearRewardClients = data.nearRewardClients;
  const displayedInactiveClients: InactiveClientRow[] = canManageClients
    ? (inactiveResult?.clients ?? retention.inactiveClients)
    : retention.inactiveClients.filter((item) => item.daysSinceLastVisit >= inactiveDays);
  const selectedLoyalty = selected ? (loyaltyByClientId.get(selected.id) ?? null) : null;

  const openNotes = (c: ClientProfile) => {
    setSelected(c);
    setNotesDraft(c.notes);
    setBirthdayDraft(c.birthday || '');
    setEmailDraft(c.email || '');
    setInstagramDraft(c.instagramHandle || '');
    setEditError(null);
  };

  const openClientById = (clientId: string) => {
    const found = data.clients.find((c) => c.id === clientId);
    if (found) {
      openNotes(found);
    }
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
    <VStack gap={5} className="ad-page fx-fade-up">
      <HStack as="header" className="ad-page-head" justify="between" align="end" wrap="wrap" gap={3}>
        <VStack gap={1} className="ad-head-copy">
          <Heading level={1} className="ad-page-title">
            Directorio de clientas
          </Heading>
          <Text className="ad-page-sub">
            Directorio A–Z, filtro inverso de retoques y reactivación, sellos de fidelidad y exportación LFPDPPP (ARCO).
          </Text>
        </VStack>

        <HStack gap={2} align="center" wrap="wrap">
          {canManageClients ? (
            <Button
              label="Nueva clienta"
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

      <section aria-label="Indicadores de clientas" className="ad-kpi-grid fx-stagger" data-cols="4">
        <VStack as="article" className="ad-card ad-kpi-card fx-card-lift" gap={1}>
          <Text type="supporting" color="secondary" weight="medium" className="ad-kpi-label">
            Total clientas
          </Text>
          <Text className="lk-serif ad-kpi-val fx-tabular" hasTabularNumbers>
            {data.clients.length}
          </Text>
          <Text type="supporting" color="secondary" className="ad-kpi-sub">
            Directorio activo
          </Text>
        </VStack>
        <VStack as="article" className="ad-card ad-kpi-card fx-card-lift" gap={1}>
          <Text type="supporting" color="secondary" weight="medium" className="ad-kpi-label">
            Recurrentes (2+)
          </Text>
          <Text className="lk-serif ad-kpi-val fx-tabular" data-tone="success" hasTabularNumbers>
            {retention.returningClientsCount}
          </Text>
          <Text type="supporting" color="secondary" className="ad-kpi-sub">
            Con 2 o más visitas
          </Text>
        </VStack>
        <VStack as="article" className="ad-card ad-kpi-card fx-card-lift" gap={1}>
          <Text type="supporting" color="secondary" weight="medium" className="ad-kpi-label">
            Sin reserva ({inactiveDays}+ d)
          </Text>
          <Text
            className="lk-serif ad-kpi-val fx-tabular"
            data-tone={displayedInactiveClients.length > 0 ? 'warning' : 'success'}
            hasTabularNumbers
          >
            {displayedInactiveClients.length}
          </Text>
          <Text type="supporting" color="secondary" className="ad-kpi-sub">
            Oportunidad de retoque
          </Text>
        </VStack>
        <VStack as="article" className="ad-card ad-kpi-card fx-card-lift" gap={1}>
          <Text type="supporting" color="secondary" weight="medium" className="ad-kpi-label">
            Cerca de premio
          </Text>
          <Text className="lk-serif ad-kpi-val fx-tabular" hasTabularNumbers>
            {nearRewardClients.length}
          </Text>
          <Text type="supporting" color="secondary" className="ad-kpi-sub">
            Tarjeta de sellos
          </Text>
        </VStack>
      </section>

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
        onChange={(v) => setActiveTab(v as ClientsTab)}
        hasDivider
      >
        <Tab value="directory" label={`Directorio A–Z (${rows.length})`} />
        <Tab
          value="retention"
          label={`Retención (${displayedInactiveClients.length})`}
        />
        <Tab
          value="rewards"
          label={`Cerca de su premio (${nearRewardClients.length})`}
        />
      </TabList>

      {activeTab === 'directory' ? (
        <VStack gap={4} key="directory" className="fx-step-in">
          <HStack className="ad-toolbar" justify="between" align="center" wrap="wrap" gap={3}>
            <TextInput
              type="search"
              label="Buscar clienta"
              isLabelHidden
              placeholder="Buscar clienta, WhatsApp o @ig..."
              startIcon={<Search size={14} />}
              size="sm"
              width="min(21rem, 100%)"
              hasClear
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
            <VStack className="ad-surface" gap={0}>
              <VStack className="ad-empty" gap={2}>
                <EmptyState
                  isCompact
                  title="No se encontraron clientas"
                  description="Ajusta la búsqueda o registra una nueva clienta manualmente."
                  actions={
                    canManageClients ? (
                      <Button
                        label="Nueva clienta"
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
              </VStack>
            </VStack>
          ) : (
            <VStack gap={4} className="fx-stagger">
              {groupedByLetter.map(([letter, clientsInGroup]) => (
                <VStack key={letter} className="ad-surface" gap={0}>
                  <HStack className="ad-section-head" justify="between" align="center" gap={2}>
                    <HStack gap={2} align="center">
                      <Text className="lk-serif ad-h3">{letter}</Text>
                      <Text
                        color="inherit"
                        className="ad-chip"
                        data-tone="neutral"
                        hasTabularNumbers
                      >
                        {clientsInGroup.length} {clientsInGroup.length === 1 ? 'clienta' : 'clientas'}
                      </Text>
                    </HStack>
                  </HStack>

                  <VStack className="ad-row-list" gap={0}>
                    {clientsInGroup.map((c) => {
                      const visits = visitCountByClient.get(c.id) ?? 0;
                      const loyalty = loyaltyByClientId.get(c.id) ?? null;
                      return (
                        <HStack
                          key={c.id}
                          className="ad-row-item"
                          justify="between"
                          align="center"
                          wrap="wrap"
                          gap={3}
                        >
                          <HStack gap={3} align="center" className="rb-grow">
                            <Avatar name={c.fullName} size="sm" />
                            <VStack gap={0.5} className="rb-grow">
                              <Text weight="semibold">{c.fullName}</Text>
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
                                    <Text type="supporting" color="secondary" hasTabularNumbers>
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
                          </HStack>

                          <HStack gap={1.5} align="center" wrap="wrap">
                            <Text
                              color="inherit"
                              className="ad-chip"
                              data-tone="neutral"
                              hasTabularNumbers
                            >
                              {visits} {visits === 1 ? 'cita' : 'citas'}
                            </Text>
                            {loyalty && loyalty.currentStamps > 0 ? (
                              <Text
                                color="inherit"
                                className="ad-chip"
                                data-tone={loyalty.isRewardReady ? 'success' : 'accent'}
                                hasTabularNumbers
                              >
                                {loyalty.currentStamps} / {loyalty.stampsRequired} sellos
                              </Text>
                            ) : null}
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
                        </HStack>
                      );
                    })}
                  </VStack>
                </VStack>
              ))}
            </VStack>
          )}
        </VStack>
      ) : activeTab === 'retention' ? (
        <VStack gap={5} key="retention" className="fx-step-in">
          {nearRewardClients.length > 0 ? (
            <HStack
              className="ad-surface"
              data-tone="accent"
              data-padded="true"
              justify="between"
              align="center"
              wrap="wrap"
              gap={3}
            >
              <HStack gap={3} align="center" className="rb-grow">
                <Sparkles size={17} aria-hidden="true" />
                <VStack gap={0.5} className="rb-grow">
                  <Text weight="semibold">
                    {nearRewardClients.length} clienta{nearRewardClients.length === 1 ? '' : 's'} cerca o lista para canjear su premio de sellos
                  </Text>
                  <Text type="supporting" color="secondary">
                    Envíales un recordatorio personalizado para impulsar su próxima visita.
                  </Text>
                </VStack>
              </HStack>
              <Button
                label="Ver clientas cerca de premio"
                variant="secondary"
                size="sm"
                onClick={() => setActiveTab('rewards')}
              />
            </HStack>
          ) : null}

          <VStack className="ad-surface" gap={0}>
            <HStack className="ad-section-head" justify="between" align="center" wrap="wrap" gap={3}>
              <VStack gap={0.5} className="rb-grow">
                <Heading level={2} className="lk-serif ad-h2">
                  Sin reserva en los últimos {inactiveDays} días
                </Heading>
                <Text type="supporting" color="secondary">
                  Filtro inverso para detectar retoques vencidos (21 días) o clientas inactivas (45–60 días) sin cita próxima y reactivarlas por WhatsApp.
                </Text>
              </VStack>
              <HStack gap={1.5} wrap="wrap">
                {INACTIVE_DAY_PRESETS.map((preset) => (
                  <button
                    key={preset.days}
                    type="button"
                    className="ad-pill fx-press"
                    data-on={inactiveDays === preset.days ? 'true' : 'false'}
                    aria-pressed={inactiveDays === preset.days}
                    onClick={() => setInactiveDays(preset.days)}
                  >
                    {preset.label}
                  </button>
                ))}
              </HStack>
            </HStack>

            {inactiveError ? (
              <VStack padding={4}>
                <Banner status="error" title={inactiveError} />
              </VStack>
            ) : null}

            {inactiveLoading ? (
              <VStack padding={4} gap={2} role="status" aria-busy="true">
                <Text className="rb-sr-only">Consultando clientas sin reserva...</Text>
                <VStack className="ad-skeleton" data-size="row" aria-hidden="true" />
                <VStack className="ad-skeleton" data-size="row" aria-hidden="true" />
                <VStack className="ad-skeleton" data-size="row" aria-hidden="true" />
              </VStack>
            ) : displayedInactiveClients.length === 0 ? (
              <VStack className="ad-empty" gap={2}>
                <EmptyState
                  isCompact
                  title={`Sin clientas inactivas en los últimos ${inactiveDays} días`}
                  description="Todas tus clientas ya tienen visita reciente o una cita próxima agendada en ese periodo."
                />
              </VStack>
            ) : (
              <VStack className="ad-row-list fx-stagger" gap={0}>
                {displayedInactiveClients.map((item) => {
                  const comebackMsg =
                    item.daysSinceLastVisit !== null
                      ? inactiveDays <= 21
                        ? `Hola ${item.fullName}, te saludamos de ${data.settings.name}! Ya pasaron ${item.daysSinceLastVisit} días desde tu última cita — ¿te apartamos horario para tu retoque?`
                        : `Hola ${item.fullName}, te extrañamos en ${data.settings.name}! Ya pasaron ${item.daysSinceLastVisit} días desde tu última visita. ¿Te apartamos horario para tu nuevo set o retoque?`
                      : `Hola ${item.fullName}, te saludamos de ${data.settings.name}! ¿Te gustaría agendar tu próxima cita con nosotras?`;
                  return (
                    <HStack
                      key={item.clientId}
                      className="ad-row-item"
                      justify="between"
                      align="center"
                      wrap="wrap"
                      gap={3}
                    >
                      <HStack gap={3} align="center" className="rb-grow">
                        <Avatar name={item.fullName} size="sm" />
                        <VStack gap={0.5} className="rb-grow">
                          <Text weight="semibold">{item.fullName}</Text>
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
                            <Text type="supporting" color="secondary" hasTabularNumbers>
                              {item.lastVisitAt
                                ? `Última visita: ${formatDateShortInTimezone(item.lastVisitAt, tz)}`
                                : 'Sin visitas completadas aún'}
                            </Text>
                          </HStack>
                        </VStack>
                      </HStack>

                      <HStack gap={2} align="center" wrap="wrap">
                        <Badge
                          variant={
                            item.daysSinceLastVisit !== null &&
                            item.daysSinceLastVisit >= 45
                              ? 'error'
                              : 'warning'
                          }
                          label={
                            item.daysSinceLastVisit !== null
                              ? `Hace ${item.daysSinceLastVisit} días`
                              : 'Sin visita'
                          }
                        />
                        <Button
                          label="Enviar mensaje de regreso (WhatsApp)"
                          variant="primary"
                          size="sm"
                          icon={<MessageCircle size={14} />}
                          href={buildWhatsAppLink(item.phoneE164, comebackMsg)}
                        />
                      </HStack>
                    </HStack>
                  );
                })}
              </VStack>
            )}
          </VStack>

          <VStack className="ad-surface" gap={0}>
            <HStack className="ad-section-head" justify="between" align="center" gap={2}>
              <Heading level={3} className="lk-serif ad-h3">
                Clientas frecuentes
              </Heading>
              <Text color="inherit" className="ad-chip" data-tone="success" hasTabularNumbers>
                {returningClients.length}
              </Text>
            </HStack>
            {returningClients.length === 0 ? (
              <VStack className="ad-empty" gap={1}>
                <Text type="supporting" color="secondary">
                  Aquí aparecerán tus clientas con 2 o más citas completadas o confirmadas.
                </Text>
              </VStack>
            ) : (
              <VStack className="ad-row-list" gap={0}>
                {returningClients.map(({ client, visits }) => (
                  <HStack
                    key={client.id}
                    className="ad-row-item"
                    justify="between"
                    align="center"
                    wrap="wrap"
                    gap={3}
                  >
                    <HStack gap={3} align="center" className="rb-grow">
                      <Avatar name={client.fullName} size="sm" />
                      <VStack gap={0.5} className="rb-grow">
                        <Text weight="semibold">{client.fullName}</Text>
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
                      </VStack>
                    </HStack>
                    <Text color="inherit" className="ad-chip" data-tone="success" hasTabularNumbers>
                      {visits} visitas
                    </Text>
                  </HStack>
                ))}
              </VStack>
            )}
          </VStack>
        </VStack>
      ) : (
        <VStack gap={4} key="rewards" className="fx-step-in">
          <VStack className="ad-surface" gap={0}>
            <HStack className="ad-section-head" justify="between" align="center" wrap="wrap" gap={2}>
              <VStack gap={0.5} className="rb-grow">
                <Heading level={2} className="lk-serif ad-h2">
                  Clientas cerca de su premio
                </Heading>
                <Text type="supporting" color="secondary">
                  {data.loyaltyProgram
                    ? `${data.loyaltyProgram.name} (${data.loyaltyProgram.stampsRequired} sellos). Invita a tus clientas más fieles a completar o canjear su beneficio.`
                    : 'Activa tu Tarjeta de Sellos en Marca y Políticas para seguir el progreso de fidelidad.'}
                </Text>
              </VStack>
              <Text color="inherit" className="ad-chip" data-tone="accent" hasTabularNumbers>
                {nearRewardClients.length} {nearRewardClients.length === 1 ? 'clienta' : 'clientas'}
              </Text>
            </HStack>

            {nearRewardClients.length === 0 ? (
              <VStack className="ad-empty" gap={2}>
                <EmptyState
                  isCompact
                  title="Sin clientas cerca de su premio aún"
                  description="Cuando una clienta esté a 2 visitas o menos de llenar su tarjeta aparecerá aquí automáticamente."
                />
              </VStack>
            ) : (
              <VStack className="ad-row-list fx-stagger" gap={0}>
                {nearRewardClients.map((entry) => {
                  const required = Math.max(1, entry.summary.stampsRequired);
                  const totalSlots = Math.min(12, required);
                  const filledSlots = Math.min(
                    totalSlots,
                    Math.round((entry.summary.currentStamps / required) * totalSlots),
                  );
                  const nudgeMsg = entry.summary.isRewardReady
                    ? `Hola ${entry.fullName}! Ya juntaste ${entry.summary.currentStamps} de ${entry.summary.stampsRequired} sellos en ${entry.summary.programName} de ${data.settings.name}. Tienes listo tu premio (${entry.summary.rewardLabel}) para tu próxima cita!`
                    : `Hola ${entry.fullName}! Llevas ${entry.summary.currentStamps} de ${entry.summary.stampsRequired} sellos en ${entry.summary.programName} de ${data.settings.name}. Te faltan solo ${entry.summary.remainingForReward} visita(s) para ganar ${entry.summary.rewardLabel}. ¿Agendamos tu siguiente cita?`;
                  return (
                    <HStack
                      key={entry.clientId}
                      className="ad-row-item"
                      justify="between"
                      align="center"
                      wrap="wrap"
                      gap={3}
                    >
                      <HStack gap={3} align="start" className="rb-grow">
                        <Avatar name={entry.fullName} size="sm" />
                        <VStack gap={1.5} className="rb-grow">
                          <HStack gap={2} align="center" wrap="wrap">
                            <Text weight="semibold">{entry.fullName}</Text>
                            <Text
                              color="inherit"
                              className="ad-chip"
                              data-tone={entry.summary.isRewardReady ? 'success' : 'accent'}
                              hasTabularNumbers
                            >
                              {entry.summary.currentStamps} / {entry.summary.stampsRequired} sellos
                            </Text>
                          </HStack>
                          <HStack gap={2} wrap="wrap" align="center">
                            <Text type="supporting" color="secondary" hasTabularNumbers>
                              {entry.phoneE164}
                            </Text>
                            {entry.instagramHandle ? (
                              <Link
                                href={formatInstagramUrl(entry.instagramHandle)}
                                isExternalLink
                                type="supporting"
                              >
                                {formatInstagramDisplay(entry.instagramHandle)}
                              </Link>
                            ) : null}
                            <Text type="supporting" color="secondary">
                              Beneficio: {entry.summary.rewardLabel}
                            </Text>
                          </HStack>
                          <ul className="ad-stamps" aria-hidden="true">
                            {Array.from({ length: totalSlots }, (_, idx) => (
                              <li
                                key={idx}
                                className="ad-stamp"
                                data-on={idx < filledSlots ? 'true' : 'false'}
                              />
                            ))}
                          </ul>
                        </VStack>
                      </HStack>

                      <HStack gap={1.5} align="center" wrap="wrap">
                        <Text
                          color="inherit"
                          className="ad-chip"
                          data-tone={entry.summary.isRewardReady ? 'success' : 'neutral'}
                          hasTabularNumbers
                        >
                          {entry.summary.isRewardReady
                            ? '¡Premio listo!'
                            : `Faltan ${entry.summary.remainingForReward}`}
                        </Text>
                        <Button
                          label="Ficha"
                          size="sm"
                          variant="secondary"
                          onClick={() => openClientById(entry.clientId)}
                        />
                        <Button
                          label="Recordar por WhatsApp"
                          size="sm"
                          variant="primary"
                          icon={<MessageCircle size={14} />}
                          href={buildWhatsAppLink(entry.phoneE164, nudgeMsg)}
                        />
                      </HStack>
                    </HStack>
                  );
                })}
              </VStack>
            )}
          </VStack>
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
          <VStack gap={3} paddingBlockStart={4} className="fx-sheet-in">
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
            <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
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
            <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
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
        width={500}
        padding={5}
      >
        <DialogHeader
          title={selected?.fullName || 'Ficha de clienta'}
          subtitle={selected?.phoneE164}
          onOpenChange={() => setSelected(null)}
        />
        <VStack gap={3} paddingBlockStart={4} className="fx-sheet-in">
          {editError ? <Banner status="error" title={editError} /> : null}

          {selectedLoyalty ? (
            <VStack
              className="ad-surface"
              data-tone={selectedLoyalty.isRewardReady ? 'accent' : 'subtle'}
              data-padded="true"
              gap={2}
            >
              <HStack justify="between" align="center" wrap="wrap" gap={2}>
                <HStack gap={1.5} align="center">
                  <Award size={15} aria-hidden="true" />
                  <Text weight="semibold">{selectedLoyalty.programName}</Text>
                </HStack>
                <Text
                  color="inherit"
                  className="ad-chip"
                  data-tone={selectedLoyalty.isRewardReady ? 'success' : 'accent'}
                  hasTabularNumbers
                >
                  {selectedLoyalty.currentStamps} / {selectedLoyalty.stampsRequired} sellos
                </Text>
              </HStack>
              <ProgressBar
                label="Sellos de fidelidad"
                isLabelHidden
                value={selectedLoyalty.currentStamps}
                max={selectedLoyalty.stampsRequired}
                variant={selectedLoyalty.isRewardReady ? 'success' : 'accent'}
              />
              <Text type="supporting" color="secondary">
                {selectedLoyalty.isRewardReady
                  ? `¡Premio listo para canjear! (${selectedLoyalty.rewardLabel})`
                  : `Faltan ${selectedLoyalty.remainingForReward} visita(s) para: ${selectedLoyalty.rewardLabel}`}
              </Text>
            </VStack>
          ) : null}

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
          <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
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
          {canManageClients && selected ? (
            <>
              <Divider />
              <HStack justify="between" align="center" wrap="wrap" gap={2}>
                <Text type="supporting" color="secondary">
                  Derechos ARCO (LFPDPPP) · Exportación JSON sin notas internas
                </Text>
                <Button
                  label="Descargar datos (ARCO)"
                  variant="secondary"
                  size="sm"
                  icon={<Download size={14} />}
                  href={`/api/admin/clients?exportClientId=${encodeURIComponent(selected.id)}`}
                />
              </HStack>
            </>
          ) : null}
        </VStack>
      </Dialog>
    </VStack>
  );
}
