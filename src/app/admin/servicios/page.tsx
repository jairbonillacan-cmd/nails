'use client';

import React, { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Switch } from '@astryxdesign/core/Switch';
import { Token } from '@astryxdesign/core/Token';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Clock, Copy, ExternalLink, Plus, Save } from 'lucide-react';
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

export default function AdminServicesPage() {
  const { data, refresh } = useAdminData();
  const [section, setSection] = useState('services');
  const [editing, setEditing] = useState<Partial<Service> | null>(null);
  const [savedMsg, setSavedMsg] = useState<{ status: 'success' | 'error'; text: string } | null>(
    null,
  );

  const [addonName, setAddonName] = useState('');
  const [addonDesc, setAddonDesc] = useState('');
  const [addonMin, setAddonMin] = useState(15);
  const [addonPrice, setAddonPrice] = useState(100);

  if (!data) return null;

  const activeDraft: Partial<Service> = editing ?? {
    name: '',
    description: '',
    durationMinutes: 120,
    priceCents: 35000,
    isStartingPrice: true,
    bufferAfterMinutes: 0,
    requiresConfirmation: true,
    depositRequired: true,
    depositAmountCents: data.settings.depositAmountCents ?? 20000,
    allowInspoPhoto: true,
    isActive: true,
    isFeatured: true,
  };

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDraft.name?.trim()) return;
    const res = await fetch('/api/admin/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'service', data: activeDraft }),
    });
    if (res.ok) {
      setSavedMsg({
        status: 'success',
        text: 'Servicio guardado y publicado en tu agenda.',
      });
      setEditing(null);
      await refresh();
    } else {
      const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
      setSavedMsg({
        status: 'error',
        text: errJson?.error || 'No se pudo guardar el servicio.',
      });
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

  return (
    <VStack gap={5}>
      <HStack justify="between" align="center" wrap="wrap" gap={3}>
        <VStack gap={0.5}>
          <Heading level={1}>Servicios y Extras</Heading>
          <Text color="secondary">
            Cada servicio genera su propio link directo (ideal para Instagram) con vista previa en vivo.
          </Text>
        </VStack>
        <Button
          label="Nuevo servicio"
          variant="primary"
          size="sm"
          icon={<Plus size={15} />}
          onClick={() =>
            setEditing({
              name: '',
              description: '',
              durationMinutes: 120,
              priceCents: 35000,
              isStartingPrice: true,
              bufferAfterMinutes: 0,
              requiresConfirmation: true,
              depositRequired: true,
              depositAmountCents: data.settings.depositAmountCents ?? 20000,
              allowInspoPhoto: true,
              isActive: true,
              isFeatured: true,
            })
          }
        />
      </HStack>

      {savedMsg ? (
        <Banner
          status={savedMsg.status}
          role={savedMsg.status === 'error' ? 'alert' : undefined}
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
          <VStack gap={3}>
            {data.services.map((srv) => (
              <Card key={srv.id} padding={4}>
                <VStack gap={3}>
                  <HStack justify="between" align="start" gap={2}>
                    <VStack gap={0.5}>
                      <Text weight="semibold" size="lg">
                        {srv.name}
                      </Text>
                      <Text type="code" color="secondary">
                        /reservar/{srv.slug}
                      </Text>
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
                        srv.bufferAfterMinutes > 0
                          ? `${formatDuration(srv.durationMinutes)} (+${srv.bufferAfterMinutes}m limpieza)`
                          : formatDuration(srv.durationMinutes)
                      }
                    />
                    {srv.isStartingPrice ? (
                      <Token size="sm" color="default" label="Precio aproximado (Desde)" />
                    ) : null}
                    {srv.depositRequired ? (
                      <Token
                        size="sm"
                        color="orange"
                        label={`Anticipo ${formatCurrency(srv.depositAmountCents, data.settings.currency)}`}
                      />
                    ) : null}
                    {!srv.isActive ? <Token size="sm" color="gray" label="Oculto" /> : null}
                  </HStack>

                  <HStack justify="between" align="center" wrap="wrap" gap={2}>
                    <HStack gap={1.5}>
                      <Button
                        label="Editar"
                        variant="secondary"
                        size="sm"
                        onClick={() => setEditing(srv)}
                      />
                      <Button
                        label="Copiar link"
                        variant="ghost"
                        size="sm"
                        icon={<Copy size={13} />}
                        onClick={() => void copyServiceLink(srv.slug)}
                      />
                      <Button
                        label="Abrir"
                        variant="ghost"
                        size="sm"
                        icon={<ExternalLink size={13} />}
                        href={`/reservar/${srv.slug}`}
                      />
                    </HStack>
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
              </Card>
            ))}
          </VStack>

          <VStack gap={4}>
            <Card padding={5}>
              <form onSubmit={handleSaveService}>
                <VStack gap={3}>
                  <Heading level={3}>
                    {activeDraft.id ? 'Editar servicio' : 'Crear servicio'}
                  </Heading>
                  <TextInput
                    label="Nombre del servicio"
                    placeholder="Ej. Rubber / Uñas acrílicas"
                    value={activeDraft.name || ''}
                    onChange={(v) => setEditing({ ...activeDraft, name: v })}
                    isRequired
                  />
                  <TextArea
                    label="Descripción"
                    value={activeDraft.description || ''}
                    onChange={(v) => setEditing({ ...activeDraft, description: v })}
                    rows={2}
                  />
                  <Grid columns={3} gap={2}>
                    <NumberInput
                      label="Duración (min)"
                      value={activeDraft.durationMinutes ?? 60}
                      min={15}
                      max={480}
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
                    <NumberInput
                      label="Buffer limpieza (m)"
                      value={activeDraft.bufferAfterMinutes ?? 0}
                      min={0}
                      max={120}
                      onChange={(v) =>
                        setEditing({ ...activeDraft, bufferAfterMinutes: v })
                      }
                    />
                  </Grid>

                  <Switch
                    label="Mostrar como precio aproximado ('Desde $...')"
                    value={Boolean(activeDraft.isStartingPrice)}
                    onChange={(v) => setEditing({ ...activeDraft, isStartingPrice: v })}
                  />
                  <Switch
                    label="Permitir que la clienta suba foto de inspiración (inspo)"
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
                    label="Requiere anticipo SPEI"
                    value={Boolean(activeDraft.depositRequired)}
                    onChange={(v) => setEditing({ ...activeDraft, depositRequired: v })}
                  />

                  {activeDraft.depositRequired ? (
                    <NumberInput
                      label="Monto de anticipo (MXN)"
                      value={(activeDraft.depositAmountCents ?? 20000) / 100}
                      min={0}
                      onChange={(v) =>
                        setEditing({
                          ...activeDraft,
                          depositAmountCents: Math.round(v * 100),
                        })
                      }
                    />
                  ) : null}

                  <Button
                    type="submit"
                    label="Guardar servicio"
                    variant="primary"
                    icon={<Save size={15} />}
                    width="100%"
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
          <VStack gap={3}>
            {data.addons.map((a) => (
              <Card key={a.id} padding={4}>
                <HStack justify="between" align="center" gap={2}>
                  <VStack gap={0.5}>
                    <Text weight="semibold">{a.name}</Text>
                    <Text type="supporting" color="secondary">
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
              </Card>
            ))}
          </VStack>

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
                <Button type="submit" label="Guardar extra" variant="primary" width="100%" />
              </VStack>
            </form>
          </Card>
        </Grid>
      )}
    </VStack>
  );
}
