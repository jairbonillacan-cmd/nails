'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Check, FolderTree, Plus } from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import { AdminAccessGuard } from '@/components/admin/AdminAccessGuard';
import {
  ConfirmActionDialog,
  PageHeader,
  PageSkeleton,
  SkeletonBlock,
} from '@/components/ui';
import { FormDialog } from '@/components/ui/FormDialog';
import { ServiceCatalogSection } from '@/components/admin/servicios/ServiceCatalogSection';
import { CategoryManagerDialog } from '@/components/admin/servicios/CategoryManagerDialog';
import {
  buildNewServiceDraft,
  isServiceDraftDirty,
} from '@/components/admin/servicios/ServiceThumbnail';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import {
  FORM_SUBMIT_OK,
  formSubmitError,
  formSubmitResultFromResponse,
  type FormSubmitResult,
} from '@/lib/forms/form-submit';
import type { Service } from '@/lib/types';

const ServiceLivePreview = dynamic(
  () =>
    import('@/components/admin/servicios/ServiceLivePreview').then(
      (mod) => mod.ServiceLivePreview,
    ),
  {
    ssr: false,
    loading: () => <SkeletonBlock width="100%" height="10rem" radius={3} />,
  },
);

const ServiceEditorPanel = dynamic(
  () =>
    import('@/components/admin/servicios/ServiceEditorPanel').then(
      (mod) => mod.ServiceEditorPanel,
    ),
  {
    ssr: false,
    loading: () => <SkeletonBlock width="100%" height="20rem" radius={3} />,
  },
);

const AddonsManagerSection = dynamic(
  () =>
    import('@/components/admin/servicios/AddonsManagerSection').then(
      (mod) => mod.AddonsManagerSection,
    ),
  {
    ssr: false,
    loading: () => <SkeletonBlock width="100%" height="20rem" radius={3} />,
  },
);

export default function AdminServicesPage() {
  const { data, loading, refresh } = useAdminData();
  const [section, setSection] = useState('services');
  const [editing, setEditing] = useState<Partial<Service> | null>(null);
  const [cleanupEnabledOverride, setCleanupEnabledOverride] = useState<boolean | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [optimisticActiveById, setOptimisticActiveById] = useState<Record<string, boolean>>({});
  const [pendingPauseService, setPendingPauseService] = useState<Service | null>(null);
  const [menuPosition, setMenuPosition] = useState<number | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
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

  const displayServices = useMemo(
    () =>
      data
        ? data.services.toSorted((a, b) => a.displayOrder - b.displayOrder).map((srv) => {
            const override = optimisticActiveById[srv.id];
            return override !== undefined ? { ...srv, isActive: override } : srv;
          })
        : [],
    [data, optimisticActiveById],
  );

  if (loading || !data) {
    return <PageSkeleton kpiCount={0} withSplit ariaLabel="Cargando servicios y extras" />;
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
  const orderedServices = data.services.toSorted((a, b) => a.displayOrder - b.displayOrder);
  const originalPosition = originalService
    ? orderedServices.findIndex((s) => s.id === originalService.id) + 1
    : null;
  const positionChanged =
    menuPosition !== null && originalPosition !== null && menuPosition !== originalPosition;
  const isServiceDirty = isServiceDraftDirty(activeDraft, originalService) || positionChanged;

  const startEditingService = (srv: Service) => {
    setSection('services');
    setEditing({ ...srv });
    setCleanupEnabledOverride(srv.bufferBeforeMinutes > 0 || srv.bufferAfterMinutes > 0);
    setMenuPosition(orderedServices.findIndex((s) => s.id === srv.id) + 1);
  };

  const startNewService = () => {
    setSection('services');
    setEditing(buildNewServiceDraft(defaultDepositCents, data.categories[0]?.id ?? null));
    setCleanupEnabledOverride(false);
    setMenuPosition(null);
  };

  const closeEditor = () => {
    setEditing(null);
    setCleanupEnabledOverride(null);
    setMenuPosition(null);
  };

  const applyMenuOrder = async (saved: Service, position: number): Promise<boolean> => {
    const rest = orderedServices.filter((s) => s.id !== saved.id);
    const next = [...rest.slice(0, position - 1), saved, ...rest.slice(position - 1)];
    for (const [index, srv] of next.entries()) {
      if (srv.displayOrder === index) continue;
      const res = await fetch('/api/admin/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'service', data: { ...srv, displayOrder: index } }),
      });
      if (!res.ok) return false;
    }
    return true;
  };

  const saveService = async (): Promise<FormSubmitResult> => {
    const wasEditing = Boolean(activeDraft.id);
    const normalizedPayload = {
      ...activeDraft,
      name: (activeDraft.name ?? '').trim(),
      description: (activeDraft.description ?? '').trim(),
      bufferBeforeMinutes: hasCleanupTime ? (activeDraft.bufferBeforeMinutes ?? 0) : 0,
      bufferAfterMinutes: hasCleanupTime ? (activeDraft.bufferAfterMinutes ?? 0) : 0,
      isPrivate: Boolean(activeDraft.isPrivate),
      ...(activeDraft.id ? {} : { displayOrder: orderedServices.length }),
    };
    try {
      const res = await fetch('/api/admin/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'service', data: normalizedPayload }),
      });
      if (!res.ok) return formSubmitResultFromResponse(res, 'No se pudo guardar el servicio.');
      if (positionChanged && menuPosition !== null) {
        const json = (await res.json()) as { service: Service };
        const reordered = await applyMenuOrder(json.service, menuPosition);
        if (!reordered) {
          await refresh();
          return formSubmitError('Se guardó el servicio, pero no se pudo cambiar su lugar en el menú.');
        }
      }
      await refresh();
      saveNotice.show(
        wasEditing ? 'Cambios guardados' : activeDraft.isPrivate ? 'Servicio privado creado' : 'Servicio creado',
      );
      return FORM_SUBMIT_OK;
    } catch {
      return formSubmitError('Sin conexión. No se pudo guardar el servicio.');
    }
  };

  const applyToggleServiceActive = async (srv: Service, checked: boolean) => {
    if (togglingId) return;
    setTogglingId(srv.id);
    setOptimisticActiveById((prev) => ({ ...prev, [srv.id]: checked }));
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
        const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
        setSavedMsg({
          status: 'error',
          text: errJson?.error || 'No se pudo actualizar el estado del servicio.',
        });
      }
    } catch {
      setSavedMsg({ status: 'error', text: 'Sin conexión. No se pudo actualizar el servicio.' });
    } finally {
      setTogglingId(null);
      setOptimisticActiveById((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([key]) => key !== srv.id)),
      );
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
    <AdminAccessGuard role={data.session.user.role} section="services" sectionLabel="Servicios">
    <VStack className="ad-page">
      <PageHeader
        title="Servicios"
        subtitle="Precios y duraciones tal como los ven tus clientas."
        meta={
          togglingId ? (
            <Text className="fx-save-pill" data-state="saving" role="status" aria-live="polite">
              Guardando…
            </Text>
          ) : saveNotice.message ? (
            <Text className="fx-save-pill" data-state="saved" role="status" aria-live="polite">
              <Check size={12} aria-hidden="true" />
              {saveNotice.message}
            </Text>
          ) : undefined
        }
        actions={
          <>
            <Button
              type="button"
              label="Categorías"
              variant="secondary"
              size="md"
              icon={<FolderTree size={16} aria-hidden="true" />}
              onClick={() => setCategoriesOpen(true)}
            />
            <Button
              type="button"
              label="Nuevo servicio"
              variant="primary"
              size="md"
              icon={<Plus size={16} aria-hidden="true" />}
              onClick={startNewService}
            />
          </>
        }
      />

      <CategoryManagerDialog
        isOpen={categoriesOpen}
        categories={data.categories}
        onOpenChange={setCategoriesOpen}
        onSaved={async () => {
          await refresh();
          saveNotice.show('Categorías guardadas');
        }}
      />

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
        <VStack key="tab-services" gap={5}>
          <ServiceCatalogSection
            services={displayServices}
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

      <FormDialog
        isOpen={editing !== null}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
        title={activeDraft.id ? 'Editar servicio' : 'Nuevo servicio'}
        subtitle="Solo necesitas nombre, precio y duración."
        width="min(40rem, 96vw)"
      >
        {(controls) => (
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
              currency={currency}
              defaultDepositCents={defaultDepositCents}
              hasCleanupTime={hasCleanupTime}
              hasCustomAdvancedValues={hasCustomAdvancedValues}
              isDirty={isServiceDirty}
              saving={controls.isSubmitting}
              menuPosition={menuPosition}
              menuPositionCount={orderedServices.length}
              onChangeMenuPosition={setMenuPosition}
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
              onCancel={controls.close}
              onSubmit={(e) => {
                e.preventDefault();
                if (!isServiceDirty) return;
                controls.submit(saveService);
              }}
            />
          </VStack>
        )}
      </FormDialog>

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
    </AdminAccessGuard>
  );
}
