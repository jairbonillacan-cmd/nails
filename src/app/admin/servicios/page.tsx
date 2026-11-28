'use client';

import { useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { BarChart3, Boxes, Check, FolderTree, Package, Plus, Save } from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import { AdminAccessGuard } from '@/components/admin/AdminAccessGuard';
import {
  ConfirmActionDialog,
  PageHeader,
  PageSkeleton,
  SkeletonBlock,
  StatusTag,
} from '@/components/ui';
import { FormDialog } from '@/components/ui/FormDialog';
import { ServiceCatalogSection } from '@/components/admin/servicios/ServiceCatalogSection';
import { CategoryManagerDialog } from '@/components/admin/servicios/CategoryManagerDialog';
import {
  buildNewServiceDraft,
  isServiceDraftDirty,
} from '@/components/admin/servicios/ServiceThumbnail';
import {
  fidelizacionHref,
  inventarioHref,
  parseServiciosParams,
  reportesHref,
  serviciosHref,
} from '@/lib/admin-links';
import { invalidateAdminDomain } from '@/lib/hooks/useAdminCache';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import {
  FORM_SUBMIT_OK,
  formSubmitError,
  formSubmitResultFromFetch,
  type FormSubmitResult,
} from '@/lib/forms/form-submit';
import { fetchJsonWithTimeout } from '@/lib/http/client-fetch';
import { roleCanAccess } from '@/lib/rbac';
import type { Service } from '@/lib/types';

const SERVICE_EDITOR_FORM_ID = 'service-editor-form';

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const parsedParams = parseServiciosParams(searchParams);
  const [section, setSection] = useState(() =>
    parsedParams.tab === 'extras' ? 'addons' : 'services',
  );
  const [editing, setEditing] = useState<Partial<Service> | null>(null);
  const [highlightedServiceId, setHighlightedServiceId] = useState<string | null>(
    parsedParams.id ?? null,
  );
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
  const lastUrlSyncKeyRef = useRef('');

  const urlSyncKey = data
    ? `servicios-ready|${parsedParams.id ?? ''}|${parsedParams.tab ?? ''}|${parsedParams.q ?? ''}`
    : 'servicios-loading';

  useExternalSync(urlSyncKey, async (signal, key) => {
    if (signal.aborted || !key.startsWith('servicios-ready|') || !data) return;
    if (lastUrlSyncKeyRef.current === key) return;
    lastUrlSyncKeyRef.current = key;

    if (parsedParams.tab === 'extras') {
      setSection('addons');
    } else if (parsedParams.tab === 'categorias') {
      setSection('services');
      setCategoriesOpen(true);
    } else if (parsedParams.tab === 'servicios') {
      setSection('services');
    }

    if (parsedParams.id) {
      const match = data.services.find((s) => s.id === parsedParams.id);
      if (match) {
        const sorted = data.services.toSorted((a, b) => a.displayOrder - b.displayOrder);
        setSection('services');
        setHighlightedServiceId(match.id);
        setEditing({ ...match });
        setCleanupEnabledOverride(
          match.bufferBeforeMinutes > 0 || match.bufferAfterMinutes > 0,
        );
        setMenuPosition(sorted.findIndex((s) => s.id === match.id) + 1);
      }
    }
  });

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
  const defaultDepositCents = data.settings.depositAmountCents ?? 0;
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
    setHighlightedServiceId(srv.id);
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

  const handleChangeSection = (nextSection: string) => {
    setSection(nextSection);
    router.replace(
      serviciosHref({
        tab: nextSection === 'addons' ? 'extras' : 'servicios',
        ...(parsedParams.q ? { q: parsedParams.q } : {}),
      }),
      { scroll: false },
    );
  };

  const closeEditor = () => {
    setEditing(null);
    setCleanupEnabledOverride(null);
    setMenuPosition(null);
    lastUrlSyncKeyRef.current = '';
    if (parsedParams.id) {
      const preservedTab =
        section === 'addons'
          ? 'extras'
          : parsedParams.tab && parsedParams.tab !== 'categorias'
            ? parsedParams.tab
            : undefined;
      router.replace(
        serviciosHref({
          ...(preservedTab ? { tab: preservedTab } : {}),
          ...(parsedParams.q ? { q: parsedParams.q } : {}),
        }),
        { scroll: false },
      );
    }
  };

  const applyMenuOrder = async (saved: Service, position: number): Promise<boolean> => {
    const rest = orderedServices.filter((s) => s.id !== saved.id);
    const next = [...rest.slice(0, position - 1), saved, ...rest.slice(position - 1)];
    for (const [index, srv] of next.entries()) {
      if (srv.displayOrder === index) continue;
      const result = await fetchJsonWithTimeout('/api/admin/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'service', data: { ...srv, displayOrder: index } }),
      });
      if (!result.ok) return false;
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
    const result = await fetchJsonWithTimeout<{ service: Service }>('/api/admin/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'service', data: normalizedPayload }),
    });
    if (!result.ok) {
      return formSubmitResultFromFetch(result, 'No se pudo guardar el servicio.');
    }
    if (positionChanged && menuPosition !== null) {
      const reordered = await applyMenuOrder(result.data.service, menuPosition);
      if (!reordered) {
        invalidateAdminDomain('services');
        await refresh();
        return formSubmitError(
          'Se guardó el servicio, pero no se pudo cambiar su lugar en el menú.',
        );
      }
    }
    invalidateAdminDomain('services');
    await refresh();
    saveNotice.show(
      wasEditing
        ? 'Cambios guardados'
        : activeDraft.isPrivate
          ? 'Servicio privado creado'
          : 'Servicio creado',
    );
    return FORM_SUBMIT_OK;
  };

  const applyToggleServiceActive = async (srv: Service, checked: boolean) => {
    if (togglingId) return;
    setTogglingId(srv.id);
    setOptimisticActiveById((prev) => ({ ...prev, [srv.id]: checked }));
    setSavedMsg(null);
    try {
      const result = await fetchJsonWithTimeout('/api/admin/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'service', data: { ...srv, isActive: checked } }),
      });
      if (result.ok) {
        invalidateAdminDomain('services');
        await refresh();
        saveNotice.show(checked ? `${srv.name} activado` : `${srv.name} pausado`);
      } else {
        setSavedMsg({
          status: 'error',
          text: result.error || 'No se pudo actualizar el estado del servicio.',
        });
      }
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

  const canViewReports = roleCanAccess(data.session.user.role, 'reports');
  const canViewLoyalty = roleCanAccess(data.session.user.role, 'loyalty');
  const canViewInventory = roleCanAccess(data.session.user.role, 'inventory');

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

        {canViewReports || canViewLoyalty || canViewInventory ? (
          <HStack className="ad-toolbar" justify="between" align="center" gap={2} wrap="wrap">
            <Text type="supporting" color="secondary">
              Relacionado con tu menú
            </Text>
            <HStack gap={1.5} align="center" wrap="wrap">
              {canViewReports ? (
                <Button
                  label="Rentabilidad"
                  variant="ghost"
                  size="sm"
                  icon={<BarChart3 size={14} aria-hidden="true" />}
                  href={reportesHref({ period: '30d' })}
                />
              ) : null}
              {canViewLoyalty ? (
                <Button
                  label="Paquetes"
                  variant="ghost"
                  size="sm"
                  icon={<Package size={14} aria-hidden="true" />}
                  href={fidelizacionHref({ tab: 'paquetes' })}
                />
              ) : null}
              {canViewInventory ? (
                <Button
                  label="Insumos"
                  variant="ghost"
                  size="sm"
                  icon={<Boxes size={14} aria-hidden="true" />}
                  href={inventarioHref({ filter: 'cabin' })}
                />
              ) : null}
            </HStack>
          </HStack>
        ) : null}

        <CategoryManagerDialog
          isOpen={categoriesOpen}
          categories={data.categories}
          onOpenChange={setCategoriesOpen}
          onSaved={async () => {
            invalidateAdminDomain('services');
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

        <TabList value={section} onChange={handleChangeSection} hasDivider>
          <Tab value="services" label={`Servicios (${data.services.length})`} />
          <Tab value="addons" label={`Extras / Diseños (${data.addons.length})`} />
        </TabList>

        {section === 'services' ? (
          <VStack key="tab-services" gap={5}>
            <ServiceCatalogSection
              key={parsedParams.q ?? 'all'}
              services={displayServices}
              categories={data.categories}
              categoryNameById={categoryNameById}
              currency={currency}
              selectedServiceId={activeDraft.id ?? highlightedServiceId ?? undefined}
              initialSearch={parsedParams.q ?? ''}
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
            onRefresh={async () => {
              invalidateAdminDomain('services');
              await refresh();
            }}
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
          submitFooter={{
            formId: SERVICE_EDITOR_FORM_ID,
            submitLabel: activeDraft.id ? 'Guardar cambios' : 'Crear servicio',
            submitIcon: <Save size={15} aria-hidden="true" />,
            isSubmitDisabled: !isServiceDirty,
            secondaryAction: isServiceDirty ? (
              <StatusTag label="Sin guardar" tone="warning" className="fx-pop" />
            ) : undefined,
          }}
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
                formId={SERVICE_EDITOR_FORM_ID}
                draft={activeDraft}
                categoryOptions={categoryOptions}
                currency={currency}
                defaultDepositCents={defaultDepositCents}
                hasCleanupTime={hasCleanupTime}
                hasCustomAdvancedValues={hasCustomAdvancedValues}
                saving={controls.isSubmitting}
                menuPosition={menuPosition}
                menuPositionCount={orderedServices.length}
                canViewReports={canViewReports}
                canViewLoyalty={canViewLoyalty}
                canViewInventory={canViewInventory}
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
