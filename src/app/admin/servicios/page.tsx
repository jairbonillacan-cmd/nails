'use client';

import React, { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
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
import { Clock, Copy, ExternalLink, Lock, Pencil, Plus, Save } from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import { formatCurrency, formatDuration } from '@/lib/format';
import type { Service } from '@/lib/types';

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
  const { data, refresh } = useAdminData();
  const [section, setSection] = useState('services');
  const [editing, setEditing] = useState<Partial<Service> | null>(null);
  const [bufferEnabledOverride, setBufferEnabledOverride] = useState<boolean | null>(null);
  const [savingService, setSavingService] = useState(false);
  const [savedMsg, setSavedMsg] = useState<{ status: 'success' | 'error'; text: string } | null>(
    null,
  );

  const [addonName, setAddonName] = useState('');
  const [addonDesc, setAddonDesc] = useState('');
  const [addonMin, setAddonMin] = useState(15);
  const [addonPrice, setAddonPrice] = useState(100);

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    if (!data) return map;
    for (const cat of data.categories) {
      map.set(cat.id, cat.name);
    }
    return map;
  }, [data]);

  if (!data) return null;

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

  const startEditingService = (srv: Service) => {
    setEditing({ ...srv });
    setBufferEnabledOverride(
      srv.bufferBeforeMinutes > 0 || srv.bufferAfterMinutes > 0,
    );
  };

  const startNewService = () => {
    setEditing(buildNewServiceDraft(defaultDepositCents, data.categories[0]?.id ?? null));
    setBufferEnabledOverride(false);
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
    } finally {
      setSavingService(false);
    }
  };

  const handleCreateAddon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addonName.trim()) return;
    const res = await fetch('/api/admin/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'addon',
        data: {
          name: addonName,
          description: addonDesc,
          extraMinutes: addonMin,
          extraPriceCents: Math.round(addonPrice * 100),
          appliesToAll: true,
        },
      }),
    });
    if (res.ok) {
      setAddonName('');
      setAddonDesc('');
      setSavedMsg({
        status: 'success',
        text: 'Extra agregado al flujo de reservas.',
      });
      await refresh();
    } else {
      const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
      setSavedMsg({
        status: 'error',
        text: errJson?.error || 'No se pudo guardar el extra.',
      });
    }
  };

  const copyServiceLink = async (slug: string) => {
    const url = `${window.location.origin}/reservar/${slug}`;
    await navigator.clipboard.writeText(url);
    setSavedMsg({
      status: 'success',
      text: `Link directo copiado: /reservar/${slug}`,
    });
  };

  const categoryOptions = [
    { value: '', label: 'Sin categoría' },
    ...data.categories.map((cat) => ({ value: cat.id, label: cat.name })),
  ];

  return (
    <VStack gap={5}>
      <HStack justify="between" align="center" wrap="wrap" gap={3}>
        <VStack gap={0.5}>
          <Heading level={1}>Servicios y Extras</Heading>
          <Text color="secondary">
            Cada servicio genera su enlace directo (`/reservar/[slug]`) con soporte para servicios públicos y enlaces privados VIP.
          </Text>
        </VStack>
        <Button
          label="Nuevo servicio"
          variant="primary"
          size="sm"
          icon={<Plus size={15} />}
          onClick={startNewService}
        />
      </HStack>

      {savedMsg ? (
        <Banner
          status={savedMsg.status}
          title={savedMsg.text}
          isDismissable
          onDismiss={() => setSavedMsg(null)}
        />
      ) : null}

      <TabList value={section} onChange={setSection} hasDivider>
        <Tab value="services" label={`Servicios (${data.services.length})`} />
        <Tab value="addons" label={`Extras / Add-ons (${data.addons.length})`} />
      </TabList>

      {section === 'services' ? (
        <Grid columns={{ minWidth: 320, max: 2 }} gap={5} align="start">
          <Card padding={0}>
            <VStack gap={0}>
              {data.services.map((srv, idx) => {
                const categoryName = srv.categoryId
                  ? categoryNameById.get(srv.categoryId)
                  : null;
                const isSelectedRow = activeDraft.id === srv.id;
                return (
                  <React.Fragment key={srv.id}>
                    {idx > 0 ? <Divider /> : null}
                    <VStack gap={2} padding={4}>
                      <HStack justify="between" align="start" gap={3}>
                        <VStack gap={0.5}>
                          <HStack gap={2} align="center" wrap="wrap">
                            <Text weight="semibold" size="lg">
                              {srv.name}
                            </Text>
                            {srv.isPrivate ? (
                              <Token
                                size="sm"
                                color="purple"
                                icon={<Lock size={12} />}
                                label="Oculto (VIP)"
                              />
                            ) : null}
                            {!srv.isActive ? (
                              <Token size="sm" color="gray" label="Inactivo" />
                            ) : null}
                          </HStack>
                          <HStack gap={2} wrap="wrap" align="center">
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
                        <Text weight="bold" hasTabularNumbers>
                          {formatServicePriceLabel(
                            srv.priceCents,
                            srv.isStartingPrice,
                            data.settings.currency,
                          )}
                        </Text>
                      </HStack>

                      <HStack gap={1.5} wrap="wrap">
                        <Token
                          size="sm"
                          icon={<Clock size={12} />}
                          label={
                            srv.bufferAfterMinutes > 0 || srv.bufferBeforeMinutes > 0
                              ? `${formatDuration(srv.durationMinutes)} (+${srv.bufferBeforeMinutes + srv.bufferAfterMinutes}m buffer)`
                              : formatDuration(srv.durationMinutes)
                          }
                        />
                        {srv.isStartingPrice ? (
                          <Token size="sm" color="default" label="Desde $" />
                        ) : null}
                        {srv.depositRequired ? (
                          <Token
                            size="sm"
                            color="orange"
                            label={`Anticipo ${formatCurrency(srv.depositAmountCents, data.settings.currency)}`}
                          />
                        ) : null}
                      </HStack>

                      <HStack justify="between" align="center" wrap="wrap" gap={2}>
                        <ButtonGroup label={`Acciones para ${srv.name}`} size="sm">
                          <Button
                            label="Abrir"
                            variant="secondary"
                            size="sm"
                            icon={<ExternalLink size={13} />}
                            href={`/reservar/${srv.slug}`}
                          />
                          <Button
                            label="Copiar"
                            variant="secondary"
                            size="sm"
                            icon={<Copy size={13} />}
                            onClick={() => void copyServiceLink(srv.slug)}
                          />
                          <Button
                            label="Editar"
                            variant={isSelectedRow ? 'primary' : 'secondary'}
                            size="sm"
                            icon={<Pencil size={13} />}
                            onClick={() => startEditingService(srv)}
                          />
                        </ButtonGroup>

                        <Switch
                          label="Activo"
                          size="sm"
                          value={srv.isActive}
                          onChange={async (checked) => {
                            await fetch('/api/admin/services', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                kind: 'service',
                                data: { ...srv, isActive: checked },
                              }),
                            });
                            await refresh();
                          }}
                        />
                      </HStack>
                    </VStack>
                  </React.Fragment>
                );
              })}
            </VStack>
          </Card>

          <VStack gap={4}>
            <Card padding={5}>
              <form onSubmit={handleSaveService}>
                <VStack gap={3}>
                  <HStack justify="between" align="center" wrap="wrap" gap={2}>
                    <Heading level={3}>
                      {activeDraft.id ? 'Editar servicio' : 'Crear servicio'}
                    </Heading>
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
                    onChange={(v) =>
                      setEditing({ ...activeDraft, categoryId: v || null })
                    }
                    options={categoryOptions}
                  />

                  <TextArea
                    label="Descripción"
                    value={activeDraft.description || ''}
                    onChange={(v) => setEditing({ ...activeDraft, description: v })}
                    rows={2}
                  />

                  <Grid columns={2} gap={3}>
                    <NumberInput
                      label="Duración (min)"
                      value={activeDraft.durationMinutes ?? 60}
                      min={15}
                      max={480}
                      isIntegerOnly
                      onChange={(v) =>
                        setEditing({ ...activeDraft, durationMinutes: v })
                      }
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
                      POLÍTICAS DE RESERVA Y VISIBILIDAD
                    </Text>

                    <VStack gap={2}>
                      <Switch
                        label="Requiere anticipo SPEI"
                        description="Pide comprobante o envío por Instagram DM al reservar."
                        value={Boolean(activeDraft.depositRequired)}
                        onChange={(v) =>
                          setEditing({ ...activeDraft, depositRequired: v })
                        }
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

                    <VStack gap={2}>
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
                        <Grid columns={2} gap={2}>
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
                    </VStack>

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

                    <Switch
                      label="Servicio oculto / Enlace privado VIP"
                      description="Se oculta de la portada y /reservar; solo se agenda compartiendo su link directo."
                      value={Boolean(activeDraft.isPrivate)}
                      onChange={(v) => setEditing({ ...activeDraft, isPrivate: v })}
                    />
                  </VStack>

                  <Button
                    type="submit"
                    label="Guardar servicio"
                    variant="primary"
                    icon={<Save size={15} />}
                    width="100%"
                    isLoading={savingService}
                    isDisabled={!isServiceDirty}
                  />
                </VStack>
              </form>
            </Card>

            <Card variant="muted" padding={4}>
              <VStack gap={3}>
                <HStack justify="between" align="center">
                  <Text type="label" color="accent" weight="semibold">
                    VISTA PREVIA EN VIVO (COMO LO VE TU CLIENTA)
                  </Text>
                  <StatusDot variant="success" label="Vista previa activa" />
                </HStack>
                <Card padding={4}>
                  <VStack gap={2}>
                    <HStack justify="between" align="start" gap={2}>
                      <Heading level={4}>
                        {activeDraft.name || 'Nombre del servicio'}
                      </Heading>
                      <Text weight="bold" hasTabularNumbers>
                        {formatServicePriceLabel(
                          activeDraft.priceCents ?? 0,
                          activeDraft.isStartingPrice,
                          data.settings.currency,
                        )}
                      </Text>
                    </HStack>
                    <HStack gap={1.5} wrap="wrap">
                      <Token
                        size="sm"
                        icon={<Clock size={12} />}
                        label={formatDuration(activeDraft.durationMinutes ?? 60)}
                      />
                      {activeDraft.depositRequired ? (
                        <Token
                          size="sm"
                          color="orange"
                          label={`Anticipo ${formatCurrency(
                            activeDraft.depositAmountCents ?? 0,
                            data.settings.currency,
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
                          icon={<Lock size={12} />}
                          label="Oculto (VIP)"
                        />
                      ) : null}
                    </HStack>
                    <Text type="supporting" color="secondary">
                      {activeDraft.description ||
                        'Aquí aparecerá la descripción de tu técnica para evitar dudas por mensaje.'}
                    </Text>
                  </VStack>
                </Card>
              </VStack>
            </Card>
          </VStack>
        </Grid>
      ) : (
        <Grid columns={{ minWidth: 300, max: 2 }} gap={5} align="start">
          <Card padding={0}>
            <VStack gap={0}>
              {data.addons.map((a, idx) => (
                <React.Fragment key={a.id}>
                  {idx > 0 ? <Divider /> : null}
                  <HStack justify="between" align="center" gap={3} padding={4}>
                    <VStack gap={0.5}>
                      <Text weight="semibold">{a.name}</Text>
                      <Text type="supporting" color="secondary" hasTabularNumbers>
                        +{a.extraMinutes} min · +
                        {formatCurrency(a.extraPriceCents, data.settings.currency)} ·{' '}
                        {a.description}
                      </Text>
                    </VStack>
                    <Switch
                      label="Activo"
                      isLabelHidden
                      value={a.isActive}
                      onChange={async (checked) => {
                        await fetch('/api/admin/services', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            kind: 'addon',
                            data: { ...a, isActive: checked },
                          }),
                        });
                        await refresh();
                      }}
                    />
                  </HStack>
                </React.Fragment>
              ))}
            </VStack>
          </Card>

          <Card padding={5}>
            <form onSubmit={handleCreateAddon}>
              <VStack gap={3}>
                <Heading level={3}>Agregar extra / add-on</Heading>
                <TextInput
                  label="Nombre del extra"
                  placeholder="Ej. Efecto Aura / Piedrería"
                  value={addonName}
                  onChange={setAddonName}
                  isRequired
                />
                <TextInput
                  label="Descripción breve"
                  value={addonDesc}
                  onChange={setAddonDesc}
                />
                <Grid columns={2} gap={3}>
                  <NumberInput
                    label="Minutos adicionales"
                    value={addonMin}
                    min={0}
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
                  label="Guardar extra"
                  variant="primary"
                  width="100%"
                  isDisabled={addonName.trim().length < 2}
                />
              </VStack>
            </form>
          </Card>
        </Grid>
      )}
    </VStack>
  );
}
