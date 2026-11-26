'use client';

import type React from 'react';
import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Check, Plus } from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import {
  ConfirmActionDialog,
  MetricGrid,
  PageHeader,
  PageSkeleton,
  type MetricTileItem,
} from '@/components/ui';
import { ServiceCatalogSection } from '@/components/admin/servicios/ServiceCatalogSection';
import { ServiceLivePreview } from '@/components/admin/servicios/ServiceLivePreview';
import { ServiceEditorPanel } from '@/components/admin/servicios/ServiceEditorPanel';
import { AddonsManagerSection } from '@/components/admin/servicios/AddonsManagerSection';
import {
  buildNewServiceDraft,
  isServiceDraftDirty,
} from '@/components/admin/servicios/ServiceThumbnail';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import { formatCurrency } from '@/lib/format';
import type { Service } from '@/lib/types';

export default function AdminServicesPage() {
  const { data, loading, refresh } = useAdminData();
  const [section, setSection] = useState('services');
  const [editing, setEditing] = useState<Partial<Service> | null>(null);
  const [cleanupEnabledOverride, setCleanupEnabledOverride] = useState<boolean | null>(null);
  const [savingService, setSavingService] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [pendingPauseService, setPendingPauseService] = useState<Service | null>(null);
  const saveNotice = useEphemeralMessage(3200);
  const [savedMsg, setSavedMsg] = useState<{ status: 'success' | 'error'; text: string } | null>(
    null,
  );

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    if (!data) return map;
    for (const cat of data.categories) {
      map.set(cat.id, cat.name);
    }
    return map;
  }, [data]);

  if (loading || !data) {
    return <PageSkeleton kpiCount={3} withSplit ariaLabel="Cargando servicios y extras" />;
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
  const isServiceDirty = isServiceDraftDirty(activeDraft, originalService);

  const activeServicesCount = data.services.filter((s) => s.isActive).length;
  const privateServicesCount = data.services.filter((s) => s.isPrivate).length;
  const activeAddonsCount = data.addons.filter((a) => a.isActive).length;

  const kpiItems: MetricTileItem[] = [
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

  const startEditingService = (srv: Service) => {
    setSection('services');
    setEditing({ ...srv });
    setCleanupEnabledOverride(srv.bufferBeforeMinutes > 0 || srv.bufferAfterMinutes > 0);
  };

  const startNewService = () => {
    setSection('services');
    setEditing(buildNewServiceDraft(defaultDepositCents, data.categories[0]?.id ?? null));
    setCleanupEnabledOverride(false);
  };

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isServiceDirty || savingService) return;
    setSavingService(true);
    setSavedMsg(null);
    const wasEditing = Boolean(activeDraft.id);
    const normalizedPayload = {
      ...activeDraft,
      name: (activeDraft.name ?? '').trim(),
      description: (activeDraft.description ?? '').trim(),
      bufferBeforeMinutes: hasCleanupTime ? (activeDraft.bufferBeforeMinutes ?? 0) : 0,
      bufferAfterMinutes: hasCleanupTime ? (activeDraft.bufferAfterMinutes ?? 0) : 0,
      isPrivate: Boolean(activeDraft.isPrivate),
    };
    try {
      const res = await fetch('/api/admin/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'service', data: normalizedPayload }),
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
      setSavedMsg({ status: 'error', text: 'Error de conexión al guardar el servicio.' });
    } finally {
      setSavingService(false);
    }
  };

  const applyToggleServiceActive = async (srv: Service, checked: boolean) => {
    if (togglingId) return;
    setTogglingId(srv.id);
    setSavedMsg(null);
    try {
      const res = await fetch('/api/admin/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'service', data: { ...srv, isActive: checked } }),
      });
      if (res.ok) {
        await refresh();
        saveNotice.show(checked ? `${srv.name} activado` : `${srv.name} pausado`);
      } else {
        setSavedMsg({ status: 'error', text: 'No se pudo actualizar el estado del servicio.' });
      }
    } finally {
      setTogglingId(null);
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
      <PageHeader
        eyebrow="Tu catálogo"
        title="Servicios"
        subtitle="Edita tus precios, duraciones y extras tal como los ven tus clientas al agendar."
        meta={
          savingService || togglingId ? (
            <Text className="fx-save-pill" data-state="saving" role="status" aria-live="polite">
              Guardando...
            </Text>
          ) : saveNotice.message ? (
            <Text className="fx-save-pill" data-state="saved" role="status" aria-live="polite">
              <Check size={12} aria-hidden="true" />
              {saveNotice.message}
            </Text>
          ) : undefined
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

      <MetricGrid ariaLabel="Resumen de servicios" items={kpiItems} cols={3} />

      {savedMsg ? (
        <Banner
          status={savedMsg.status}
          role={savedMsg.status === 'error' ? 'alert' : 'status'}
          title={savedMsg.text}
          isDismissable
          onDismiss={() => setSavedMsg(null)}
        />
      ) : null}

      <TabList value={section} onChange={setSection} hasDivider>
        <Tab value="services" label={`Servicios (${data.services.length})`} />
        <Tab value="addons" label={`Extras / Diseños (${data.addons.length})`} />
      </TabList>

      {section === 'services' ? (
        <VStack key="tab-services" className="ad-split fx-step-in" gap={5}>
          <ServiceCatalogSection
            services={data.services}
            categories={data.categories}
            categoryNameById={categoryNameById}
            currency={currency}
            selectedServiceId={activeDraft.id}
            togglingId={togglingId}
            onSelectService={startEditingService}
            onRequestToggleActive={(srv, checked) => {
              if (!checked) {
                setPendingPauseService(srv);
              } else {
                void applyToggleServiceActive(srv, true);
              }
            }}
            onCopyError={(text) => setSavedMsg({ status: 'error', text })}
          />

          <VStack gap={4}>
            <ServiceLivePreview
              draft={activeDraft}
              categoryName={previewCategoryName}
              currency={currency}
              appUrl={data.integration.appUrl}
            />
            <ServiceEditorPanel
              draft={activeDraft}
              categoryOptions={categoryOptions}
              defaultDepositCents={defaultDepositCents}
              hasCleanupTime={hasCleanupTime}
              hasCustomAdvancedValues={hasCustomAdvancedValues}
              isDirty={isServiceDirty}
              saving={savingService}
              saveNoticeMessage={saveNotice.message}
              onChangeDraft={setEditing}
              onToggleCleanupTime={(checked) => {
                setCleanupEnabledOverride(checked);
                if (!checked) {
                  setEditing({ ...activeDraft, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 });
                } else if (
                  (activeDraft.bufferBeforeMinutes ?? 0) === 0 &&
                  (activeDraft.bufferAfterMinutes ?? 0) === 0
                ) {
                  setEditing({ ...activeDraft, bufferAfterMinutes: 15 });
                }
              }}
              onResetToNew={() => {
                setEditing(null);
                setCleanupEnabledOverride(null);
              }}
              onSubmit={handleSaveService}
            />
          </VStack>
        </VStack>
      ) : (
        <AddonsManagerSection
          addons={data.addons}
          currency={currency}
          onRefresh={refresh}
          onError={(text) => setSavedMsg({ status: 'error', text })}
          onNotice={saveNotice.show}
        />
      )}

      <ConfirmActionDialog
        isOpen={Boolean(pendingPauseService)}
        onOpenChange={(open) => {
          if (!open) setPendingPauseService(null);
        }}
        title={
          pendingPauseService ? `¿Pausar "${pendingPauseService.name}"?` : '¿Pausar servicio?'
        }
        description="Dejará de aparecer en tu página de reservas hasta que vuelvas a activarlo. Tus citas ya agendadas no se modifican."
        confirmLabel="Pausar servicio"
        variant="destructive"
        isLoading={Boolean(pendingPauseService && togglingId === pendingPauseService.id)}
        onConfirm={async () => {
          if (!pendingPauseService) return;
          const target = pendingPauseService;
          setPendingPauseService(null);
          await applyToggleServiceActive(target, false);
        }}
      />
    </VStack>
  );
}
