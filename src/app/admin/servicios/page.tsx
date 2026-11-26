'use client';

import React, { useMemo, useState } from 'react';
import Image from 'next/image';
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
import {
  isOptimizableLocalRasterImage,
  servicePhoto,
} from '@/components/landing/landingContent';
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

function ServiceThumbnail({
  slug,
  imageUrl,
  size = 'row',
}: {
  slug: string;
  imageUrl: string | null;
  size?: 'row' | 'preview';
}) {
  const src = servicePhoto(slug, imageUrl);
  const usesOptimized = isOptimizableLocalRasterImage(src);
  const dim = size === 'preview' ? '4.5rem' : '3.75rem';
  const style: React.CSSProperties = {
    width: dim,
    height: dim,
    aspectRatio: '1 / 1',
    borderRadius: 'var(--radius-md)',
    objectFit: 'cover',
    flexShrink: 0,
    display: 'block',
  };

  if (usesOptimized) {
    return (
      <Image
        src={src}
        alt=""
        width={160}
        height={160}
        sizes={dim}
        loading="lazy"
        decoding="async"
        style={style}
      />
    );
  }

  return (
    <img
      src={src}
      alt=""
      width={160}
      height={160}
      loading="lazy"
      decoding="async"
      style={style}
    />
  );
}

export default function AdminServicesPage() {
  const { data, loading, refresh } = useAdminData();
  const [section, setSection] = useState('services');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editing, setEditing] = useState<Partial<Service> | null>(null);
  const [cleanupEnabledOverride, setCleanupEnabledOverride] = useState<boolean | null>(null);
  const [savingService, setSavingService] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const copyFeedback = useEphemeralMessage(2400);
  const saveNotice = useEphemeralMessage(3200);
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
    return <AdminConfigSkeleton kpiCount={3} withSplit />;
  }

  const currency = data.settings.currency;
  const defaultDepositCents = data.settings.depositAmountCents ?? 20000;
  const activeDraft: Partial<Service> =
    editing ?? buildNewServiceDraft(defaultDepositCents, data.categories[0]?.id ?? null);

  const originalService = activeDraft.id
    ? (data.services.find((s) => s.id === activeDraft.id) ?? null)
    : null;

  const hasCleanupTime =
    cleanupEnabledOverride !== null
      ? cleanupEnabledOverride
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
      sub:
        privateServicesCount > 0
          ? `de ${data.services.length} · ${privateServicesCount} con link privado`
          : `de ${data.services.length} en tu menú`,
    },
    {
      id: 'active-addons',
      label: 'Extras y diseños',
      value: String(activeAddonsCount),
      sub: `de ${data.addons.length} disponibles`,
    },
    {
      id: 'base-deposit',
      label: 'Anticipo del salón',
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
    setCleanupEnabledOverride(
      srv.bufferBeforeMinutes > 0 || srv.bufferAfterMinutes > 0,
    );
  };

  const startNewService = () => {
    setSection('services');
    setEditing(buildNewServiceDraft(defaultDepositCents, data.categories[0]?.id ?? null));
    setCleanupEnabledOverride(false);
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
    if (!isServiceDirty || savingService) return;
    setSavingService(true);
    setSavedMsg(null);
    const wasEditing = Boolean(activeDraft.id);
    const normalizedPayload = {
      ...activeDraft,
      name: trimmedName,
      description: (activeDraft.description ?? '').trim(),
      bufferBeforeMinutes: hasCleanupTime ? (activeDraft.bufferBeforeMinutes ?? 0) : 0,
      bufferAfterMinutes: hasCleanupTime ? (activeDraft.bufferAfterMinutes ?? 0) : 0,
      isPrivate: Boolean(activeDraft.isPrivate),
    };
    try {
      const res = await fetch('/api/admin/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'service',
          data: normalizedPayload,
        }),
      });
      if (res.ok) {
        await refresh();
        if (wasEditing) {
          setEditing(normalizedPayload);
        } else {
          setEditing(null);
          setCleanupEnabledOverride(null);
        }
        saveNotice.show(
          activeDraft.isPrivate ? 'Servicio privado guardado' : 'Servicio guardado',
        );
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
    if (togglingId) return;
    setTogglingId(srv.id);
    setSavedMsg(null);
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
        await refresh();
        saveNotice.show(checked ? `${srv.name} activado` : `${srv.name} pausado`);
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
    if (addonName.trim().length < 2 || savingAddon) return;
    setSavingAddon(true);
    setSavedMsg(null);
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
        await refresh();
        resetAddonForm();
        saveNotice.show(wasEditing ? 'Extra guardado' : 'Extra agregado');
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
    if (togglingId) return;
    setTogglingId(addon.id);
    setSavedMsg(null);
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
        saveNotice.show(checked ? `${addon.name} activado` : `${addon.name} pausado`);
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

  const hasCustomAdvancedValues =
    hasCleanupTime ||
    Boolean(activeDraft.isPrivate) ||
    Boolean((activeDraft.description ?? '').trim()) ||
    !activeDraft.depositRequired ||
    (activeDraft.depositAmountCents ?? defaultDepositCents) !== defaultDepositCents;

  return (
    <VStack className="ad-page">
      <AdminConfigPageHeader
        eyebrow="Tu catálogo"
        title="Servicios"
        subtitle="Edita tus precios, duraciones y extras tal como los ven tus clientas al agendar."
        meta={
          savingService || savingAddon || togglingId ? (
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
        actions={
          <Button
            type="button"
            label="Nuevo servicio"
            variant="primary"
            size="md"
            icon={<Plus size={16} aria-hidden="true" />}
            onClick={startNewService}
          />
        }
      />

      <AdminConfigKpiStrip ariaLabel="Resumen de servicios" items={kpiItems} cols={3} />

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
        <Tab value="addons" label={`Extras / Diseños (${data.addons.length})`} />
      </TabList>

      {section === 'services' ? (
        <VStack key="tab-services" className="ad-split fx-step-in" gap={5}>
          <AdminConfigSection
            id="services-catalog-heading"
            title="Menú de servicios"
            subtitle="Toca un servicio para editarlo o copia su link directo para enviarlo por mensaje."
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
                    Solo link ({privateServicesCount})
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
                description="Prueba otra categoría, borra la búsqueda o crea un servicio nuevo."
                action={
                  <Button
                    type="button"
                    label="Ver todos"
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
                  const cleanupMinutes = srv.bufferBeforeMinutes + srv.bufferAfterMinutes;

                  return (
                    <li
                      key={srv.id}
                      className={togglingId === srv.id ? 'ad-list-row fx-busy' : 'ad-list-row'}
                      data-selected={isSelectedRow ? 'true' : undefined}
                      data-muted={!srv.isActive ? 'true' : undefined}
                      aria-busy={togglingId === srv.id || undefined}
                    >
                      <VStack gap={2} width="100%">
                        <HStack justify="between" align="center" gap={3} wrap="wrap">
                          <HStack gap={3} align="center" className="rb-grow">
                            <ServiceThumbnail slug={srv.slug} imageUrl={srv.imageUrl} />
                            <VStack gap={0.5} className="rb-grow">
                              <HStack gap={1.5} align="center" wrap="wrap">
                                <Text weight="semibold" size="base">
                                  {srv.name}
                                </Text>
                                {srv.isPrivate ? (
                                  <AdminConfigChip
                                    label="Solo link privado"
                                    tone="accent"
                                    icon={<Lock size={11} aria-hidden="true" />}
                                  />
                                ) : null}
                                {!srv.isActive ? (
                                  <AdminConfigChip label="Pausado" tone="neutral" />
                                ) : null}
                              </HStack>
                              <HStack gap={1.5} wrap="wrap" align="center">
                                <Text type="supporting" color="secondary" hasTabularNumbers>
                                  {formatDuration(srv.durationMinutes)}
                                </Text>
                                {categoryName ? (
                                  <Text type="supporting" color="secondary">
                                    · {categoryName}
                                  </Text>
                                ) : null}
                                {cleanupMinutes > 0 ? (
                                  <Text type="supporting" color="secondary" hasTabularNumbers>
                                    · +{cleanupMinutes} min limpieza
                                  </Text>
                                ) : null}
                              </HStack>
                            </VStack>
                          </HStack>

                          <Text weight="bold" size="base" className="fx-tabular" hasTabularNumbers>
                            {formatServicePriceLabel(
                              srv.priceCents,
                              srv.isStartingPrice,
                              currency,
                            )}
                          </Text>
                        </HStack>

                        <HStack justify="between" align="center" wrap="wrap" gap={2}>
                          <ButtonGroup label={`Acciones para ${srv.name}`} size="sm">
                            <Button
                              type="button"
                              label={isSelectedRow ? 'Editando' : 'Editar'}
                              variant={isSelectedRow ? 'primary' : 'secondary'}
                              size="sm"
                              icon={<Pencil size={13} aria-hidden="true" />}
                              onClick={() => startEditingService(srv)}
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
                              label="Ver"
                              variant="ghost"
                              size="sm"
                              icon={<ExternalLink size={13} aria-hidden="true" />}
                              href={`/reservar/${srv.slug}`}
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
              id="service-preview-heading"
              tone="subtle"
              padded
              title="Vista previa en vivo"
              subtitle="Así lo verá tu clienta al elegir su servicio."
              badge={<StatusDot variant="success" label="Vista previa activa" isPulsing />}
            >
              <VStack gap={2} paddingBlockStart={2}>
                <HStack justify="between" align="start" gap={3}>
                  <HStack gap={3} align="center" className="rb-grow">
                    <ServiceThumbnail
                      slug={activeDraft.slug || 'rubber'}
                      imageUrl={activeDraft.imageUrl ?? null}
                      size="preview"
                    />
                    <VStack gap={0.5} className="rb-grow">
                      {previewCategoryName ? (
                        <Text type="supporting" color="accent" weight="semibold" size="sm">
                          {previewCategoryName}
                        </Text>
                      ) : null}
                      <Heading level={3} className="lk-serif ad-h3">
                        {activeDraft.name || 'Nombre del servicio'}
                      </Heading>
                      <Text weight="bold" size="base" className="fx-tabular" hasTabularNumbers>
                        {formatServicePriceLabel(
                          activeDraft.priceCents ?? 0,
                          activeDraft.isStartingPrice,
                          currency,
                        )}
                      </Text>
                    </VStack>
                  </HStack>
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
                  {activeDraft.isPrivate ? (
                    <Token
                      size="sm"
                      color="purple"
                      icon={<Lock size={12} aria-hidden="true" />}
                      label="Solo link privado"
                    />
                  ) : null}
                </HStack>

                {activeDraft.description ? (
                  <Text type="supporting" color="secondary">
                    {activeDraft.description}
                  </Text>
                ) : null}
              </VStack>
            </AdminConfigSection>

            <AdminConfigSection
              id="service-editor-heading"
              title={activeDraft.id ? 'Editar servicio' : 'Crear servicio'}
              subtitle="Lo esencial primero: nombre, precio, duración y categoría."
              actions={
                <HStack gap={2} align="center" wrap="wrap">
                  {savingService ? (
                    <Text className="fx-save-pill" data-state="saving" role="status" aria-live="polite">
                      Guardando...
                    </Text>
                  ) : isServiceDirty ? (
                    <AdminConfigChip label="Sin guardar" tone="warning" className="fx-pop" />
                  ) : saveNotice.message ? (
                    <Text className="fx-save-pill" data-state="saved" role="status" aria-live="polite">
                      <Check size={12} aria-hidden="true" />
                      {saveNotice.message}
                    </Text>
                  ) : null}
                  {activeDraft.id ? (
                    <Button
                      type="button"
                      label="Nuevo"
                      variant="ghost"
                      size="sm"
                      isDisabled={savingService}
                      onClick={() => {
                        setEditing(null);
                        setCleanupEnabledOverride(null);
                      }}
                    />
                  ) : null}
                </HStack>
              }
            >
              <form onSubmit={handleSaveService}>
                <VStack
                  gap={3}
                  padding={5}
                  className={savingService ? 'fx-busy' : undefined}
                  aria-busy={savingService || undefined}
                >
                  <TextInput
                    label="Nombre"
                    placeholder="Ej. Rubber / Uñas acrílicas"
                    value={activeDraft.name || ''}
                    onChange={(v) => setEditing({ ...activeDraft, name: v })}
                    isRequired
                  />

                  <VStack gap={2}>
                    <Grid columns={{ minWidth: 140, max: 2 }} gap={3}>
                      <NumberInput
                        label="Precio (MXN)"
                        value={(activeDraft.priceCents ?? 0) / 100}
                        min={0}
                        onChange={(v) =>
                          setEditing({ ...activeDraft, priceCents: Math.round(v * 100) })
                        }
                      />
                      <NumberInput
                        label="Duración (min)"
                        value={activeDraft.durationMinutes ?? 60}
                        min={15}
                        max={480}
                        isIntegerOnly
                        onChange={(v) => setEditing({ ...activeDraft, durationMinutes: v })}
                      />
                    </Grid>
                    <Switch
                      label='Precio "Desde"'
                      description='Muestra "Desde $..." si el precio varía por largo o diseño.'
                      size="sm"
                      value={Boolean(activeDraft.isStartingPrice)}
                      onChange={(v) => setEditing({ ...activeDraft, isStartingPrice: v })}
                    />
                  </VStack>

                  <Selector
                    label="Categoría"
                    value={activeDraft.categoryId ?? ''}
                    onChange={(v) => setEditing({ ...activeDraft, categoryId: v || null })}
                    options={categoryOptions}
                  />

                  <Divider />

                  <Collapsible
                    className="ad-disclosure"
                    defaultIsOpen={false}
                    trigger={
                      <HStack justify="between" align="center" gap={2} width="100%">
                        <HStack gap={2} align="center">
                          <SlidersHorizontal size={14} aria-hidden="true" />
                          <Text weight="semibold" size="sm">
                            Más opciones
                          </Text>
                        </HStack>
                        <Text type="supporting" color="secondary">
                          {hasCustomAdvancedValues ? 'Personalizado' : 'Limpieza, anticipo, VIP'}
                        </Text>
                      </HStack>
                    }
                  >
                    <VStack gap={3} paddingBlockStart={3}>
                      <TextArea
                        label="Descripción"
                        placeholder="Cuenta qué incluye la técnica para ahorrar preguntas por mensaje."
                        value={activeDraft.description || ''}
                        onChange={(v) => setEditing({ ...activeDraft, description: v })}
                        rows={2}
                      />

                      <Divider />

                      <VStack gap={2}>
                        <Switch
                          label="Tiempo de limpieza entre citas"
                          description="Bloquea minutos extra antes o después de este servicio para limpiar tu mesa."
                          value={hasCleanupTime}
                          onChange={(checked) => {
                            setCleanupEnabledOverride(checked);
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
                        {hasCleanupTime ? (
                          <Grid columns={{ minWidth: 140, max: 2 }} gap={2}>
                            <NumberInput
                              label="Antes de la cita (min)"
                              value={activeDraft.bufferBeforeMinutes ?? 0}
                              min={0}
                              max={120}
                              isIntegerOnly
                              onChange={(v) =>
                                setEditing({ ...activeDraft, bufferBeforeMinutes: v })
                              }
                            />
                            <NumberInput
                              label="Después de la cita (min)"
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
                      </VStack>

                      <Divider />

                      <VStack gap={2}>
                        <Switch
                          label="Anticipo distinto"
                          description="Pide un monto específico de anticipo para este servicio."
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

                      <Divider />

                      <Switch
                        label="Solo con link privado"
                        description="No se ve en tu página pública; solo pueden reservar quienes tengan su link."
                        value={Boolean(activeDraft.isPrivate)}
                        onChange={(v) => setEditing({ ...activeDraft, isPrivate: v })}
                      />

                      <Switch
                        label="Permitir foto de inspiración"
                        value={Boolean(activeDraft.allowInspoPhoto)}
                        onChange={(v) => setEditing({ ...activeDraft, allowInspoPhoto: v })}
                      />

                      <Switch
                        label="Confirmar manualmente antes de aprobar"
                        value={Boolean(activeDraft.requiresConfirmation)}
                        onChange={(v) =>
                          setEditing({ ...activeDraft, requiresConfirmation: v })
                        }
                      />
                    </VStack>
                  </Collapsible>

                  <Button
                    type="submit"
                    label={
                      savingService
                        ? 'Guardando...'
                        : activeDraft.id
                          ? 'Guardar servicio'
                          : 'Crear servicio'
                    }
                    variant="primary"
                    icon={<Save size={15} aria-hidden="true" />}
                    width="100%"
                    isLoading={savingService}
                    isDisabled={!isServiceDirty || savingService}
                  />
                </VStack>
              </form>
            </AdminConfigSection>
          </VStack>
        </VStack>
      ) : (
        <VStack key="tab-addons" className="ad-split fx-step-in" gap={5}>
          <AdminConfigSection
            id="addons-catalog-heading"
            title="Extras y diseños"
            subtitle="Se suman en tiempo y precio cuando tu clienta los agrega a su cita."
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
                title="Aún no tienes extras"
                description="Agrega opciones como retiro, french, efecto chrome o piedrería."
              />
            ) : (
              <VStack as="ul" className="ad-row-list" gap={0}>
                {data.addons.map((addon) => {
                  const isEditingThis = editingAddonId === addon.id;
                  return (
                    <li
                      key={addon.id}
                      className={togglingId === addon.id ? 'ad-list-row fx-busy' : 'ad-list-row'}
                      data-selected={isEditingThis ? 'true' : undefined}
                      data-muted={!addon.isActive ? 'true' : undefined}
                      aria-busy={togglingId === addon.id || undefined}
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
            title={editingAddonId ? 'Editar extra' : 'Agregar extra o diseño'}
            subtitle="Aparecerá como opción adicional al reservar."
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
              <VStack
                gap={3}
                padding={5}
                className={savingAddon ? 'fx-busy' : undefined}
                aria-busy={savingAddon || undefined}
              >
                <TextInput
                  label="Nombre"
                  placeholder="Ej. Efecto Aura / Piedrería"
                  value={addonName}
                  onChange={setAddonName}
                  isRequired
                />
                <TextInput
                  label="Detalle breve"
                  placeholder="Qué incluye o en cuántas uñas aplica"
                  value={addonDesc}
                  onChange={setAddonDesc}
                />
                <Grid columns={{ minWidth: 140, max: 2 }} gap={3}>
                  <NumberInput
                    label="Tiempo extra (min)"
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
                  label={
                    savingAddon
                      ? 'Guardando...'
                      : editingAddonId
                        ? 'Guardar cambios'
                        : 'Agregar extra'
                  }
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
