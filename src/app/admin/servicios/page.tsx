'use client';

import React, { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { ButtonGroup } from '@astryxdesign/core/ButtonGroup';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { Token } from '@astryxdesign/core/Token';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import {
  Check,
  Clock,
  Copy,
  ExternalLink,
  Lock,
  Pencil,
  Plus,
  Save,
  Scissors,
  Search,
  SlidersHorizontal,
  Sparkles,
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
import { formatCurrency, formatDuration } from '@/lib/format';
import type { Service, ServiceAddon } from '@/lib/types';

function formatServicePriceLabel(
  priceCents: number,
  isStartingPrice: boolean | undefined,
  currency: 'MXN' | 'USD',
): string {
  const formatted = formatCurrency(priceCents, currency);
  return isStartingPrice ? `Desde ${formatted}` : formatted;
}

function buildNewServiceDraft(
  defaultDepositCents: number,
  defaultCategoryId: string | null,
): Partial<Service> {
  return {
    categoryId: defaultCategoryId,
    name: '',
    description: '',
    durationMinutes: 120,
    priceCents: 35000,
    isStartingPrice: true,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    requiresConfirmation: true,
    depositRequired: true,
    depositAmountCents: defaultDepositCents,
    allowInspoPhoto: true,
    isActive: true,
    isFeatured: true,
    isPrivate: false,
  };
}

export default function AdminServicesPage() {
  const { data, loading, refresh } = useAdminData();
  const [section, setSection] = useState('services');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editing, setEditing] = useState<Partial<Service> | null>(null);
  const [bufferEnabledOverride, setBufferEnabledOverride] = useState<boolean | null>(null);
  const [savingService, setSavingService] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const copyFeedback = useEphemeralMessage(2400);
  const [savedMsg, setSavedMsg] = useState<{ status: 'success' | 'error'; text: string } | null>(
    null,
  );

  const [editingAddonId, setEditingAddonId] = useState<string | null>(null);
  const [addonName, setAddonName] = useState('');
  const [addonDesc, setAddonDesc] = useState('');
  const [addonMin, setAddonMin] = useState(15);
  const [addonPrice, setAddonPrice] = useState(100);
  const [savingAddon, setSavingAddon] = useState(false);

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    if (!data) return map;
    for (const cat of data.categories) {
      map.set(cat.id, cat.name);
    }
    return map;
  }, [data]);

  if (loading || !data) {
    return <AdminConfigSkeleton kpiCount={4} withSplit />;
  }

  const currency = data.settings.currency;
  const defaultDepositCents = data.settings.depositAmountCents ?? 20000;
  const activeDraft: Partial<Service> =
    editing ?? buildNewServiceDraft(defaultDepositCents, data.categories[0]?.id ?? null);

  const originalService = activeDraft.id
    ? (data.services.find((s) => s.id === activeDraft.id) ?? null)
    : null;

  const hasBuffer =
    bufferEnabledOverride !== null
      ? bufferEnabledOverride
      : (activeDraft.bufferBeforeMinutes ?? 0) > 0 ||
        (activeDraft.bufferAfterMinutes ?? 0) > 0;

  const trimmedName = (activeDraft.name ?? '').trim();
  const isServiceDirty = originalService
    ? trimmedName.length >= 2 &&
      (trimmedName !== originalService.name.trim() ||
        (activeDraft.categoryId ?? null) !== (originalService.categoryId ?? null) ||
        (activeDraft.description ?? '').trim() !== originalService.description.trim() ||
        (activeDraft.durationMinutes ?? originalService.durationMinutes) !==
          originalService.durationMinutes ||
        (activeDraft.priceCents ?? originalService.priceCents) !==
          originalService.priceCents ||
        Boolean(activeDraft.isStartingPrice) !== Boolean(originalService.isStartingPrice) ||
        (activeDraft.bufferBeforeMinutes ?? 0) !== originalService.bufferBeforeMinutes ||
        (activeDraft.bufferAfterMinutes ?? 0) !== originalService.bufferAfterMinutes ||
        Boolean(activeDraft.requiresConfirmation) !==
          originalService.requiresConfirmation ||
        Boolean(activeDraft.depositRequired) !== originalService.depositRequired ||
        (activeDraft.depositAmountCents ?? 0) !== originalService.depositAmountCents ||
        Boolean(activeDraft.allowInspoPhoto) !== originalService.allowInspoPhoto ||
        Boolean(activeDraft.isActive) !== originalService.isActive ||
        Boolean(activeDraft.isPrivate) !== Boolean(originalService.isPrivate))
    : trimmedName.length >= 2;

  const activeServicesCount = data.services.filter((s) => s.isActive).length;
  const privateServicesCount = data.services.filter((s) => s.isPrivate).length;
  const activeAddonsCount = data.addons.filter((a) => a.isActive).length;

  const kpiItems: AdminConfigKpiItem[] = [
    {
      id: 'active-services',
      label: 'Servicios activos',
      value: String(activeServicesCount),
      sub: `de ${data.services.length} en catálogo`,
    },
    {
      id: 'vip-services',
      label: 'Enlaces VIP',
      value: String(privateServicesCount),
      sub: privateServicesCount > 0 ? 'Ocultos de la portada' : 'Todos son públicos',
    },
    {
      id: 'active-addons',
      label: 'Extras activos',
      value: String(activeAddonsCount),
      sub: `de ${data.addons.length} add-ons`,
    },
    {
      id: 'base-deposit',
      label: 'Anticipo base',
      value: formatCurrency(defaultDepositCents, currency),
      sub: data.settings.depositBankName || 'Transferencia SPEI',
    },
  ];

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredServices = data.services.filter((srv) => {
    if (categoryFilter === 'vip' && !srv.isPrivate) return false;
    if (
      categoryFilter !== 'all' &&
      categoryFilter !== 'vip' &&
      srv.categoryId !== categoryFilter
    ) {
      return false;
    }
    if (!normalizedQuery) return true;
    const catLabel = srv.categoryId ? (categoryNameById.get(srv.categoryId) ?? '') : '';
    return (
      srv.name.toLowerCase().includes(normalizedQuery) ||
      srv.slug.toLowerCase().includes(normalizedQuery) ||
      srv.description.toLowerCase().includes(normalizedQuery) ||
      catLabel.toLowerCase().includes(normalizedQuery)
    );
  });

  const startEditingService = (srv: Service) => {
    setSection('services');
    setEditing({ ...srv });
    setBufferEnabledOverride(
      srv.bufferBeforeMinutes > 0 || srv.bufferAfterMinutes > 0,
    );
  };

  const startNewService = () => {
    setSection('services');
    setEditing(buildNewServiceDraft(defaultDepositCents, data.categories[0]?.id ?? null));
    setBufferEnabledOverride(false);
  };

  const startEditingAddon = (addon: ServiceAddon) => {
    setEditingAddonId(addon.id);
    setAddonName(addon.name);
    setAddonDesc(addon.description);
    setAddonMin(addon.extraMinutes);
    setAddonPrice(Math.round(addon.extraPriceCents / 100));
  };

  const resetAddonForm = () => {
    setEditingAddonId(null);
    setAddonName('');
    setAddonDesc('');
    setAddonMin(15);
    setAddonPrice(100);
  };

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isServiceDirty) return;
    setSavingService(true);
    try {
      const res = await fetch('/api/admin/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'service',
          data: {
            ...activeDraft,
            name: trimmedName,
            bufferBeforeMinutes: hasBuffer ? (activeDraft.bufferBeforeMinutes ?? 0) : 0,
            bufferAfterMinutes: hasBuffer ? (activeDraft.bufferAfterMinutes ?? 0) : 0,
            isPrivate: Boolean(activeDraft.isPrivate),
          },
        }),
      });
      if (res.ok) {
        setSavedMsg({
          status: 'success',
          text: activeDraft.isPrivate
            ? 'Servicio VIP guardado (accesible solo mediante su enlace directo).'
            : 'Servicio guardado y publicado en tu agenda.',
        });
        setEditing(null);
        setBufferEnabledOverride(null);
        await refresh();
      } else {
        const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
        setSavedMsg({
          status: 'error',
          text: errJson?.error || 'No se pudo guardar el servicio.',
        });
      }
    } catch {
      setSavedMsg({
        status: 'error',
        text: 'Error de conexión al guardar el servicio.',
      });
    } finally {
      setSavingService(false);
    }
  };

  const handleToggleServiceActive = async (srv: Service, checked: boolean) => {
    setTogglingId(srv.id);
    try {
      const res = await fetch('/api/admin/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'service',
          data: { ...srv, isActive: checked },
        }),
      });
      if (res.ok) {
        setSavedMsg({
          status: 'success',
          text: checked
            ? `${srv.name} activado en el catálogo.`
            : `${srv.name} pausado temporalmente.`,
        });
        await refresh();
      } else {
        setSavedMsg({
          status: 'error',
          text: 'No se pudo actualizar el estado del servicio.',
        });
      }
    } finally {
      setTogglingId(null);
    }
  };

  const handleSaveAddon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addonName.trim().length < 2) return;
    setSavingAddon(true);
    try {
      const existingAddon = editingAddonId
        ? data.addons.find((item) => item.id === editingAddonId)
        : null;
      const res = await fetch('/api/admin/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'addon',
          data: {
            ...(existingAddon ? { id: existingAddon.id, isActive: existingAddon.isActive } : {}),
            name: addonName.trim(),
            description: addonDesc.trim(),
            extraMinutes: addonMin,
            extraPriceCents: Math.round(addonPrice * 100),
            appliesToAll: true,
          },
        }),
      });
      if (res.ok) {
        const wasEditing = Boolean(editingAddonId);
        resetAddonForm();
        setSavedMsg({
          status: 'success',
          text: wasEditing
            ? 'Extra actualizado correctamente.'
            : 'Extra agregado al flujo de reservas.',
        });
        await refresh();
      } else {
        const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
        setSavedMsg({
          status: 'error',
          text: errJson?.error || 'No se pudo guardar el extra.',
        });
      }
    } finally {
      setSavingAddon(false);
    }
  };

  const handleToggleAddonActive = async (addon: ServiceAddon, checked: boolean) => {
    setTogglingId(addon.id);
    try {
      const res = await fetch('/api/admin/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'addon',
          data: { ...addon, isActive: checked },
        }),
      });
      if (res.ok) {
        await refresh();
      } else {
        setSavedMsg({
          status: 'error',
          text: 'No se pudo actualizar el estado del extra.',
        });
      }
    } finally {
      setTogglingId(null);
    }
  };

  const copyServiceLink = async (slug: string) => {
    const url = `${window.location.origin}/reservar/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedSlug(slug);
      copyFeedback.show(`Link directo copiado: /reservar/${slug}`);
    } catch {
      setSavedMsg({
        status: 'error',
        text: `No se pudo copiar automáticamente. Usa /reservar/${slug}`,
      });
    }
  };

  const categoryOptions = [
    { value: '', label: 'Sin categoría' },
    ...data.categories.map((cat) => ({ value: cat.id, label: cat.name })),
  ];

  const previewCategoryName = activeDraft.categoryId
    ? (categoryNameById.get(activeDraft.categoryId) ?? null)
    : null;

  return (
    <VStack className="ad-page">
      <AdminConfigPageHeader
        eyebrow="Catálogo del estudio"
        title="Servicios y extras"
        subtitle="Cada servicio genera su enlace directo en /reservar/[slug], con soporte para precios aproximados, anticipo SPEI y enlaces privados VIP."
        actions={
          <Button
            label="Nuevo servicio"
            variant="primary"
            size="md"
            icon={<Plus size={16} aria-hidden="true" />}
            onClick={startNewService}
          />
        }
      />

      <AdminConfigKpiStrip ariaLabel="Resumen de catálogo" items={kpiItems} cols={4} />

      {savedMsg ? (
        <Banner
          status={savedMsg.status}
          role={savedMsg.status === 'error' ? 'alert' : 'status'}
          title={savedMsg.text}
          isDismissable
          onDismiss={() => setSavedMsg(null)}
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

      <TabList value={section} onChange={setSection} hasDivider>
        <Tab value="services" label={`Servicios (${data.services.length})`} />
        <Tab value="addons" label={`Extras / Add-ons (${data.addons.length})`} />
      </TabList>

      {section === 'services' ? (
        <VStack key="tab-services" className="ad-split fx-step-in" gap={5}>
          <AdminConfigSection
            id="services-catalog-heading"
            title="Menú de servicios"
            subtitle="Selecciona un servicio para editarlo o comparte su link directo."
            badge={
              <AdminConfigChip
                label={String(filteredServices.length)}
                tone="neutral"
                hasTabularNumbers
              />
            }
          >
            <HStack className="ad-toolbar" justify="between" align="center" gap={2} wrap="wrap">
              <HStack gap={1.5} wrap="wrap" role="group" aria-label="Filtrar por categoría">
                <button
                  type="button"
                  className="ad-pill fx-press"
                  data-on={categoryFilter === 'all' ? 'true' : 'false'}
                  aria-pressed={categoryFilter === 'all'}
                  onClick={() => setCategoryFilter('all')}
                >
                  Todos ({data.services.length})
                </button>
                {data.categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className="ad-pill fx-press"
                    data-on={categoryFilter === cat.id ? 'true' : 'false'}
                    aria-pressed={categoryFilter === cat.id}
                    onClick={() => setCategoryFilter(cat.id)}
                  >
                    {cat.name}
                  </button>
                ))}
                {privateServicesCount > 0 ? (
                  <button
                    type="button"
                    className="ad-pill fx-press"
                    data-on={categoryFilter === 'vip' ? 'true' : 'false'}
                    aria-pressed={categoryFilter === 'vip'}
                    onClick={() => setCategoryFilter('vip')}
                  >
                    <Lock size={12} aria-hidden="true" />
                    VIP ({privateServicesCount})
                  </button>
                ) : null}
              </HStack>

              <VStack maxWidth={220} width="100%">
                <TextInput
                  label="Buscar servicio"
                  isLabelHidden
                  size="sm"
                  placeholder="Buscar servicio..."
                  value={searchQuery}
                  onChange={setSearchQuery}
                  startIcon={<Search size={14} aria-hidden="true" />}
                />
              </VStack>
            </HStack>

            {filteredServices.length === 0 ? (
              <AdminConfigEmpty
                icon={<Scissors size={22} aria-hidden="true" />}
                title="No encontramos servicios con ese filtro"
                description="Prueba otra categoría, limpia la búsqueda o crea un nuevo servicio para tu catálogo."
                action={
                  <Button
                    type="button"
                    label="Limpiar filtros"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setCategoryFilter('all');
                      setSearchQuery('');
                    }}
                  />
                }
              />
            ) : (
              <VStack as="ul" className="ad-row-list" gap={0}>
                {filteredServices.map((srv) => {
                  const categoryName = srv.categoryId
                    ? categoryNameById.get(srv.categoryId)
                    : null;
                  const isSelectedRow = activeDraft.id === srv.id;
                  const isCopiedRow = copiedSlug === srv.slug && Boolean(copyFeedback.message);

                  return (
                    <li
                      key={srv.id}
                      className="ad-list-row"
                      data-selected={isSelectedRow ? 'true' : undefined}
                      data-muted={!srv.isActive ? 'true' : undefined}
                    >
                      <VStack gap={2} width="100%">
                        <HStack justify="between" align="start" gap={3} wrap="wrap">
                          <VStack gap={0.5} className="rb-grow">
                            <HStack gap={1.5} align="center" wrap="wrap">
                              <Text weight="semibold" size="base">
                                {srv.name}
                              </Text>
                              {srv.isPrivate ? (
                                <AdminConfigChip
                                  label="Oculto (VIP)"
                                  tone="accent"
                                  icon={<Lock size={11} aria-hidden="true" />}
                                />
                              ) : null}
                              {!srv.isActive ? (
                                <AdminConfigChip label="Inactivo" tone="neutral" />
                              ) : null}
                            </HStack>
                            <HStack gap={1.5} wrap="wrap" align="center">
                              <Text type="code" color="secondary">
                                /reservar/{srv.slug}
                              </Text>
                              {categoryName ? (
                                <Text type="supporting" color="secondary">
                                  · {categoryName}
                                </Text>
                              ) : null}
                            </HStack>
                          </VStack>

                          <Text weight="bold" className="fx-tabular" hasTabularNumbers>
                            {formatServicePriceLabel(
                              srv.priceCents,
                              srv.isStartingPrice,
                              currency,
                            )}
                          </Text>
                        </HStack>

                        <HStack gap={1.5} wrap="wrap">
                          <AdminConfigChip
                            tone="neutral"
                            icon={<Clock size={11} aria-hidden="true" />}
                            label={
                              srv.bufferAfterMinutes > 0 || srv.bufferBeforeMinutes > 0
                                ? `${formatDuration(srv.durationMinutes)} (+${srv.bufferBeforeMinutes + srv.bufferAfterMinutes}m buffer)`
                                : formatDuration(srv.durationMinutes)
                            }
                            hasTabularNumbers
                          />
                          {srv.depositRequired ? (
                            <AdminConfigChip
                              tone="warning"
                              label={`Anticipo ${formatCurrency(srv.depositAmountCents, currency)}`}
                              hasTabularNumbers
                            />
                          ) : null}
                          {srv.allowInspoPhoto ? (
                            <AdminConfigChip tone="neutral" label="Admite inspo" />
                          ) : null}
                        </HStack>

                        <HStack justify="between" align="center" wrap="wrap" gap={2}>
                          <ButtonGroup label={`Acciones para ${srv.name}`} size="sm">
                            <Button
                              label="Abrir"
                              variant="secondary"
                              size="sm"
                              icon={<ExternalLink size={13} aria-hidden="true" />}
                              href={`/reservar/${srv.slug}`}
                            />
                            <Button
                              type="button"
                              label={isCopiedRow ? 'Copiado' : 'Copiar link'}
                              variant={isCopiedRow ? 'primary' : 'secondary'}
                              size="sm"
                              icon={
                                isCopiedRow ? (
                                  <Check size={13} aria-hidden="true" className="fx-pop" />
                                ) : (
                                  <Copy size={13} aria-hidden="true" />
                                )
                              }
                              onClick={() => void copyServiceLink(srv.slug)}
                            />
                            <Button
                              type="button"
                              label={isSelectedRow ? 'Editando' : 'Editar'}
                              variant={isSelectedRow ? 'primary' : 'secondary'}
                              size="sm"
                              icon={<Pencil size={13} aria-hidden="true" />}
                              onClick={() => startEditingService(srv)}
                            />
                          </ButtonGroup>

                          <Switch
                            label="Activo"
                            size="sm"
                            value={srv.isActive}
                            isLoading={togglingId === srv.id}
                            onChange={(checked) => void handleToggleServiceActive(srv, checked)}
                          />
                        </HStack>
                      </VStack>
                    </li>
                  );
                })}
              </VStack>
            )}
          </AdminConfigSection>

          <VStack gap={4}>
            <AdminConfigSection
              id="service-editor-heading"
              title={activeDraft.id ? 'Editar servicio' : 'Crear servicio'}
              subtitle={
                activeDraft.id
                  ? 'Los cambios se reflejan de inmediato en la vista previa.'
                  : 'Define nombre, precio, duración y visibilidad pública o VIP.'
              }
              actions={
                <HStack gap={2} align="center">
                  {isServiceDirty ? (
                    <AdminConfigChip label="Sin guardar" tone="warning" className="fx-pop" />
                  ) : null}
                  {activeDraft.id ? (
                    <Button
                      type="button"
                      label="Cancelar"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(null);
                        setBufferEnabledOverride(null);
                      }}
                    />
                  ) : null}
                </HStack>
              }
            >
              <form onSubmit={handleSaveService}>
                <VStack gap={3} padding={5}>
                  <TextInput
                    label="Nombre del servicio"
                    placeholder="Ej. Rubber / Set Novia VIP"
                    value={activeDraft.name || ''}
                    onChange={(v) => setEditing({ ...activeDraft, name: v })}
                    isRequired
                  />

                  <Selector
                    label="Categoría"
                    value={activeDraft.categoryId ?? ''}
                    onChange={(v) => setEditing({ ...activeDraft, categoryId: v || null })}
                    options={categoryOptions}
                  />

                  <TextArea
                    label="Descripción"
                    placeholder="Describe técnica, duración o qué incluye para evitar dudas por DM."
                    value={activeDraft.description || ''}
                    onChange={(v) => setEditing({ ...activeDraft, description: v })}
                    rows={2}
                  />

                  <Grid columns={{ minWidth: 140, max: 2 }} gap={3}>
                    <NumberInput
                      label="Duración (min)"
                      value={activeDraft.durationMinutes ?? 60}
                      min={15}
                      max={480}
                      isIntegerOnly
                      onChange={(v) => setEditing({ ...activeDraft, durationMinutes: v })}
                    />
                    <NumberInput
                      label="Precio (MXN)"
                      value={(activeDraft.priceCents ?? 0) / 100}
                      min={0}
                      onChange={(v) =>
                        setEditing({ ...activeDraft, priceCents: Math.round(v * 100) })
                      }
                    />
                  </Grid>

                  <Switch
                    label="Mostrar como precio aproximado ('Desde $...')"
                    value={Boolean(activeDraft.isStartingPrice)}
                    onChange={(v) => setEditing({ ...activeDraft, isStartingPrice: v })}
                  />

                  <Divider />

                  <VStack gap={2}>
                    <Text type="label" color="secondary" weight="semibold">
                      Anticipo y visibilidad
                    </Text>

                    <VStack gap={2}>
                      <Switch
                        label="Requiere anticipo SPEI"
                        description="Pide comprobante web o envío por Instagram DM al reservar."
                        value={Boolean(activeDraft.depositRequired)}
                        onChange={(v) => setEditing({ ...activeDraft, depositRequired: v })}
                      />
                      {activeDraft.depositRequired ? (
                        <NumberInput
                          label="Monto de anticipo (MXN)"
                          value={(activeDraft.depositAmountCents ?? defaultDepositCents) / 100}
                          min={0}
                          onChange={(v) =>
                            setEditing({
                              ...activeDraft,
                              depositAmountCents: Math.round(v * 100),
                            })
                          }
                        />
                      ) : null}
                    </VStack>

                    <Switch
                      label="Servicio privado / VIP (solo link directo)"
                      description="Se oculta de la portada, /reservar y /links; solo se agenda compartiendo /reservar/[slug]."
                      value={Boolean(activeDraft.isPrivate)}
                      onChange={(v) => setEditing({ ...activeDraft, isPrivate: v })}
                    />
                  </VStack>

                  <Divider />

                  <Collapsible
                    defaultIsOpen={hasBuffer}
                    trigger={
                      <HStack gap={2} align="center">
                        <SlidersHorizontal size={14} aria-hidden="true" />
                        <Text weight="semibold" size="sm">
                          Opciones avanzadas (buffers, inspo y confirmación)
                        </Text>
                      </HStack>
                    }
                  >
                    <VStack gap={3} paddingBlockStart={3}>
                      <Switch
                        label="Tiempo de preparación / limpieza (buffers)"
                        description="Bloquea minutos extra antes o después de la cita automáticamente."
                        value={hasBuffer}
                        onChange={(checked) => {
                          setBufferEnabledOverride(checked);
                          if (!checked) {
                            setEditing({
                              ...activeDraft,
                              bufferBeforeMinutes: 0,
                              bufferAfterMinutes: 0,
                            });
                          } else if (
                            (activeDraft.bufferBeforeMinutes ?? 0) === 0 &&
                            (activeDraft.bufferAfterMinutes ?? 0) === 0
                          ) {
                            setEditing({
                              ...activeDraft,
                              bufferAfterMinutes: 15,
                            });
                          }
                        }}
                      />
                      {hasBuffer ? (
                        <Grid columns={{ minWidth: 140, max: 2 }} gap={2}>
                          <NumberInput
                            label="Buffer antes (min)"
                            value={activeDraft.bufferBeforeMinutes ?? 0}
                            min={0}
                            max={120}
                            isIntegerOnly
                            onChange={(v) =>
                              setEditing({ ...activeDraft, bufferBeforeMinutes: v })
                            }
                          />
                          <NumberInput
                            label="Buffer después (min)"
                            value={activeDraft.bufferAfterMinutes ?? 0}
                            min={0}
                            max={120}
                            isIntegerOnly
                            onChange={(v) =>
                              setEditing({ ...activeDraft, bufferAfterMinutes: v })
                            }
                          />
                        </Grid>
                      ) : null}

                      <Switch
                        label="Permitir foto de inspiración (inspo)"
                        value={Boolean(activeDraft.allowInspoPhoto)}
                        onChange={(v) => setEditing({ ...activeDraft, allowInspoPhoto: v })}
                      />

                      <Switch
                        label="Requiere confirmación manual del salón"
                        value={Boolean(activeDraft.requiresConfirmation)}
                        onChange={(v) =>
                          setEditing({ ...activeDraft, requiresConfirmation: v })
                        }
                      />
                    </VStack>
                  </Collapsible>

                  <Button
                    type="submit"
                    label="Guardar servicio"
                    variant="primary"
                    icon={<Save size={15} aria-hidden="true" />}
                    width="100%"
                    isLoading={savingService}
                    isDisabled={!isServiceDirty}
                  />
                </VStack>
              </form>
            </AdminConfigSection>

            <AdminConfigSection
              tone="subtle"
              padded
              title="Vista previa en vivo"
              subtitle="Así aparece esta tarjeta para tu clienta en /reservar."
              badge={<StatusDot variant="success" label="Vista previa activa" isPulsing />}
            >
              <VStack className="ad-surface fx-card-lift" data-padded="true" gap={2}>
                <HStack justify="between" align="start" gap={2}>
                  <VStack gap={0.5} className="rb-grow">
                    {previewCategoryName ? (
                      <Text type="supporting" color="accent" weight="semibold" size="sm">
                        {previewCategoryName}
                      </Text>
                    ) : null}
                    <Heading level={3} className="lk-serif ad-h3">
                      {activeDraft.name || 'Nombre del servicio'}
                    </Heading>
                  </VStack>
                  <Text weight="bold" size="lg" className="fx-tabular" hasTabularNumbers>
                    {formatServicePriceLabel(
                      activeDraft.priceCents ?? 0,
                      activeDraft.isStartingPrice,
                      currency,
                    )}
                  </Text>
                </HStack>

                <HStack gap={1.5} wrap="wrap">
                  <Token
                    size="sm"
                    icon={<Clock size={12} aria-hidden="true" />}
                    label={formatDuration(activeDraft.durationMinutes ?? 60)}
                  />
                  {activeDraft.depositRequired ? (
                    <Token
                      size="sm"
                      color="orange"
                      label={`Anticipo ${formatCurrency(
                        activeDraft.depositAmountCents ?? 0,
                        currency,
                      )}`}
                    />
                  ) : null}
                  {activeDraft.allowInspoPhoto ? (
                    <Token size="sm" color="pink" label="Admite foto inspo" />
                  ) : null}
                  {activeDraft.isPrivate ? (
                    <Token
                      size="sm"
                      color="purple"
                      icon={<Lock size={12} aria-hidden="true" />}
                      label="Oculto (VIP)"
                    />
                  ) : null}
                </HStack>

                <Text type="supporting" color="secondary">
                  {activeDraft.description ||
                    'Aquí aparecerá la descripción de tu técnica para evitar dudas por mensaje.'}
                </Text>
              </VStack>
            </AdminConfigSection>
          </VStack>
        </VStack>
      ) : (
        <VStack key="tab-addons" className="ad-split fx-step-in" gap={5}>
          <AdminConfigSection
            id="addons-catalog-heading"
            title="Extras y arte en uña"
            subtitle="Se suman en duración y precio al elegir un servicio."
            badge={
              <AdminConfigChip
                label={String(data.addons.length)}
                tone="neutral"
                hasTabularNumbers
              />
            }
          >
            {data.addons.length === 0 ? (
              <AdminConfigEmpty
                icon={<Sparkles size={22} aria-hidden="true" />}
                title="Aún no tienes extras registrados"
                description="Agrega opciones como retiro, nail art, franceses o efecto aura para aumentar el ticket promedio."
              />
            ) : (
              <VStack as="ul" className="ad-row-list" gap={0}>
                {data.addons.map((addon) => {
                  const isEditingThis = editingAddonId === addon.id;
                  return (
                    <li
                      key={addon.id}
                      className="ad-list-row"
                      data-selected={isEditingThis ? 'true' : undefined}
                      data-muted={!addon.isActive ? 'true' : undefined}
                    >
                      <VStack gap={0.5} className="rb-grow">
                        <HStack gap={2} align="center" wrap="wrap">
                          <Text weight="semibold">{addon.name}</Text>
                          <AdminConfigChip
                            tone="neutral"
                            label={`+${addon.extraMinutes} min · +${formatCurrency(addon.extraPriceCents, currency)}`}
                            hasTabularNumbers
                          />
                        </HStack>
                        {addon.description ? (
                          <Text type="supporting" color="secondary">
                            {addon.description}
                          </Text>
                        ) : null}
                      </VStack>

                      <HStack gap={2} align="center">
                        <Button
                          type="button"
                          label={isEditingThis ? 'Editando' : 'Editar'}
                          variant={isEditingThis ? 'primary' : 'ghost'}
                          size="sm"
                          icon={<Pencil size={13} aria-hidden="true" />}
                          onClick={() => startEditingAddon(addon)}
                        />
                        <Switch
                          label={`Activar ${addon.name}`}
                          isLabelHidden
                          size="sm"
                          value={addon.isActive}
                          isLoading={togglingId === addon.id}
                          onChange={(checked) => void handleToggleAddonActive(addon, checked)}
                        />
                      </HStack>
                    </li>
                  );
                })}
              </VStack>
            )}
          </AdminConfigSection>

          <AdminConfigSection
            id="addon-editor-heading"
            title={editingAddonId ? 'Editar extra' : 'Agregar extra / add-on'}
            subtitle="Disponible como complemento en el flujo de reservas."
            actions={
              editingAddonId ? (
                <Button
                  type="button"
                  label="Cancelar"
                  variant="ghost"
                  size="sm"
                  onClick={resetAddonForm}
                />
              ) : null
            }
          >
            <form onSubmit={handleSaveAddon}>
              <VStack gap={3} padding={5}>
                <TextInput
                  label="Nombre del extra"
                  placeholder="Ej. Efecto Aura / Piedrería"
                  value={addonName}
                  onChange={setAddonName}
                  isRequired
                />
                <TextInput
                  label="Descripción breve"
                  placeholder="Qué incluye o en qué uñas aplica"
                  value={addonDesc}
                  onChange={setAddonDesc}
                />
                <Grid columns={{ minWidth: 140, max: 2 }} gap={3}>
                  <NumberInput
                    label="Minutos adicionales"
                    value={addonMin}
                    min={0}
                    max={240}
                    isIntegerOnly
                    onChange={setAddonMin}
                  />
                  <NumberInput
                    label="Precio extra (MXN)"
                    value={addonPrice}
                    min={0}
                    onChange={setAddonPrice}
                  />
                </Grid>
                <Divider />
                <Button
                  type="submit"
                  label={editingAddonId ? 'Guardar cambios' : 'Guardar extra'}
                  variant="primary"
                  icon={<Save size={15} aria-hidden="true" />}
                  width="100%"
                  isLoading={savingAddon}
                  isDisabled={addonName.trim().length < 2 || savingAddon}
                />
              </VStack>
            </form>
          </AdminConfigSection>
        </VStack>
      )}
    </VStack>
  );
}
