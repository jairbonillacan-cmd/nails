'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import {
  ArrowRight,
  Check,
  Palette,
  Plug,
  RotateCcw,
  Save,
} from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import { AdminAccessGuard } from '@/components/admin/AdminAccessGuard';
import { PageHeader, PageSkeleton, StatusTag, SurfaceCard } from '@/components/ui';
import { DepositSettingsSection } from '@/components/admin/marca/DepositSettingsSection';
import { BookingPoliciesCard } from '@/components/admin/marca/AdvancedPoliciesSection';
import { BookingPageSettingsSection } from '@/components/admin/marca/BookingPageSettingsSection';
import {
  NoShowPolicyCard,
  OwnerAuditHistoryCard,
  OwnerPinCard,
} from '@/components/admin/marca/OwnerSecuritySection';
import {
  areSettingsEqual,
  buildBrandPatchPayload,
  DEFAULT_LOYALTY_PROGRAM,
} from '@/components/admin/marca/brandFormUtils';
import {
  cajaHref,
  integracionesHref,
  marcaHref,
  parseAjustesParams,
  type AjustesLinkParams,
  type AjustesTabParam,
} from '@/lib/admin-links';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import type { SalonSettings } from '@/lib/types';

function resolveInitialAjustesTab(params: AjustesLinkParams): AjustesTabParam {
  if (params.tab) return params.tab;
  const focus = params.focus?.toLowerCase();
  if (focus === 'pin' || focus === 'auditoria' || focus === 'seguridad') {
    return 'seguridad';
  }
  if (focus === 'noshow' || focus === 'politicas' || focus === 'reservas') {
    return 'politicas';
  }
  return 'cobro';
}

export default function AdminSettingsPage() {
  const { data, loading, refresh } = useAdminData();
  const searchParams = useSearchParams();
  const parsedParams = parseAjustesParams(searchParams);
  const urlSyncKey = `${parsedParams.tab ?? ''}|${parsedParams.focus ?? ''}`;
  const [prevUrlKey, setPrevUrlKey] = useState(urlSyncKey);
  const [activeTab, setActiveTab] = useState<AjustesTabParam>(() =>
    resolveInitialAjustesTab(parsedParams),
  );
  const [draftOverride, setDraftOverride] = useState<SalonSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const saveNotice = useEphemeralMessage(3500);

  if (prevUrlKey !== urlSyncKey) {
    setPrevUrlKey(urlSyncKey);
    if (parsedParams.tab || parsedParams.focus) {
      setActiveTab(resolveInitialAjustesTab(parsedParams));
    }
  }

  if (loading || !data) {
    return (
      <PageSkeleton
        kpiCount={0}
        withSplit={false}
        ariaLabel="Cargando ajustes del salón"
      />
    );
  }

  const baseSettings = data.settings;
  const baseLoyalty = data.loyaltyProgram ?? DEFAULT_LOYALTY_PROGRAM;
  const draft = draftOverride ?? baseSettings;
  const tz = draft.timezone || 'America/Mexico_City';
  const depositAmountCents = draft.depositAmountCents ?? 20000;
  const depositBeneficiary = draft.depositBeneficiary ?? draft.depositAccountHolder;
  const isDepositEnabled = draft.paymentMode !== 'none';
  const noShowDepositThreshold = draft.noShowDepositThreshold ?? 2;
  const hasOwnerPin = Boolean(baseSettings.hasOwnerPin);
  const flaggedNoShowClientsCount = data.clients.filter(
    (c) => c.noShowCount >= noShowDepositThreshold,
  ).length;
  const activeServices = data.services.filter((s) => s.isActive);
  const focusTarget = parsedParams.focus?.toLowerCase() ?? null;
  const isDirty = !areSettingsEqual(draft, baseSettings);

  const updateDraft = (patch: Partial<SalonSettings>) => {
    setDraftOverride({ ...draft, ...patch });
  };

  const discardChanges = () => {
    setDraftOverride(null);
    setErrorMsg(null);
  };

  const submitSave = async () => {
    if (!isDirty || saving) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/admin/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify(
          buildBrandPatchPayload({
            draft,
            loyaltyDraft: baseLoyalty,
            activeServices,
            hasOwnerPin,
          }),
        ),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setErrorMsg(json?.error || 'No se pudieron guardar los ajustes.');
        return;
      }
      await refresh();
      setDraftOverride(null);
      saveNotice.show('Ajustes guardados');
    } catch {
      setErrorMsg('Error de conexión al guardar los ajustes del salón.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminAccessGuard
      role={data.session.user.role}
      section="settings"
      sectionLabel="Ajustes del salón"
    >
      <VStack className="ad-page" gap={5}>
        <PageHeader
          title="Ajustes del salón"
          subtitle="Cobro y anticipos, políticas de reserva y seguridad."
          meta={
            saving ? (
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
            isDirty ? (
              <HStack gap={2} align="center" wrap="wrap">
                <StatusTag label="Cambios sin guardar" tone="warning" className="fx-pop" />
                <Button
                  type="button"
                  label="Descartar"
                  variant="ghost"
                  size="sm"
                  icon={<RotateCcw size={14} aria-hidden="true" />}
                  isDisabled={saving}
                  onClick={discardChanges}
                />
                <Button
                  type="button"
                  label={saving ? 'Guardando…' : 'Guardar cambios'}
                  variant="primary"
                  size="sm"
                  icon={<Save size={15} aria-hidden="true" />}
                  isLoading={saving}
                  isDisabled={saving}
                  onClick={() => void submitSave()}
                />
              </HStack>
            ) : (
              <HStack gap={2} align="center" wrap="wrap">
                <StatusTag label="Todo guardado" tone="success" />
                <Button
                  label="Mi página"
                  variant="secondary"
                  size="sm"
                  icon={<Palette size={14} aria-hidden="true" />}
                  href={marcaHref()}
                />
                <Button
                  label="Conexiones"
                  variant="ghost"
                  size="sm"
                  icon={<Plug size={14} aria-hidden="true" />}
                  href={integracionesHref()}
                />
              </HStack>
            )
          }
        />

        {errorMsg ? (
          <Banner
            status="error"
            role="alert"
            title={errorMsg}
            isDismissable
            onDismiss={() => setErrorMsg(null)}
          />
        ) : null}

        <TabList
          value={activeTab}
          onChange={(value) => setActiveTab(value as AjustesTabParam)}
          hasDivider
        >
          <Tab value="cobro" label="Cobro y anticipo" />
          <Tab value="politicas" label="Políticas" />
          <Tab value="seguridad" label="Seguridad y auditoría" />
        </TabList>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitSave();
          }}
        >
          <VStack
            gap={4}
            className={saving ? 'fx-busy' : undefined}
            aria-busy={saving || undefined}
          >
            {activeTab === 'cobro' ? (
              <VStack gap={4}>
                <DepositSettingsSection
                  draft={draft}
                  isDepositEnabled={isDepositEnabled}
                  depositAmountCents={depositAmountCents}
                  depositBeneficiary={depositBeneficiary}
                  mercadoPagoConfigured={data.integration.mercadoPagoConfigured}
                  highlighted={focusTarget === 'clabe' || focusTarget === 'cobro'}
                  onUpdateDraft={updateDraft}
                />
                <SurfaceCard padded>
                  <HStack justify="between" align="center" wrap="wrap" gap={3}>
                    <VStack gap={0.5} className="rb-grow">
                      <Text weight="semibold" size="sm">
                        Accesos relacionados con cobros
                      </Text>
                      <Text type="supporting" color="secondary">
                        Revisa comprobantes pendientes en Caja o verifica el estado técnico de Mercado Pago en Conexiones.
                      </Text>
                    </VStack>
                    <HStack gap={2} wrap="wrap">
                      <Button
                        label="Anticipos en Caja"
                        variant="secondary"
                        size="sm"
                        icon={<ArrowRight size={14} aria-hidden="true" />}
                        href={cajaHref({ tab: 'anticipos' })}
                      />
                      <Button
                        label="Ver Conexiones"
                        variant="ghost"
                        size="sm"
                        href={integracionesHref()}
                      />
                    </HStack>
                  </HStack>
                </SurfaceCard>
              </VStack>
            ) : null}

            {activeTab === 'politicas' ? (
              <VStack gap={4}>
                <BookingPoliciesCard
                  draft={draft}
                  highlighted={focusTarget === 'politicas' || focusTarget === 'reservas'}
                  onUpdateDraft={updateDraft}
                />
                <VStack className="ad-config-grid-equal" gap={4}>
                  <BookingPageSettingsSection
                    draft={draft}
                    onUpdateDraft={updateDraft}
                  />
                  <NoShowPolicyCard
                    noShowDepositThreshold={noShowDepositThreshold}
                    flaggedNoShowClientsCount={flaggedNoShowClientsCount}
                    highlighted={focusTarget === 'noshow'}
                    onChangeNoShowThreshold={(v) =>
                      updateDraft({ noShowDepositThreshold: v })
                    }
                  />
                </VStack>
              </VStack>
            ) : null}

            {activeTab === 'seguridad' ? (
              <VStack gap={4}>
                <OwnerPinCard
                  hasOwnerPin={hasOwnerPin}
                  ownerPinEnabled={Boolean(draft.ownerPinEnabled)}
                  highlighted={focusTarget === 'pin'}
                  onSyncOwnerPinEnabled={(enabled) =>
                    updateDraft({ ownerPinEnabled: enabled })
                  }
                  onRefresh={refresh}
                  onNotify={saveNotice.show}
                />
                <OwnerAuditHistoryCard
                  recentAuditLogs={data.recentAuditLogs}
                  timezone={tz}
                />
              </VStack>
            ) : null}
          </VStack>
        </form>

        {isDirty ? (
          <HStack
            className="ad-sticky-bar fx-sheet-in"
            justify="between"
            align="center"
            gap={3}
            wrap="wrap"
            role="region"
            aria-label="Cambios sin guardar"
          >
            <HStack gap={2} align="center" wrap="wrap">
              <StatusTag label="Sin guardar" tone="warning" />
              <Text size="sm" weight="medium">
                Tienes cambios pendientes en Ajustes del salón.
              </Text>
            </HStack>
            <HStack gap={2} align="center" wrap="wrap">
              <Button
                type="button"
                label="Descartar"
                variant="ghost"
                size="sm"
                icon={<RotateCcw size={14} aria-hidden="true" />}
                isDisabled={saving}
                onClick={discardChanges}
              />
              <Button
                type="button"
                label={saving ? 'Guardando…' : 'Guardar cambios'}
                variant="primary"
                size="sm"
                icon={<Save size={14} aria-hidden="true" />}
                isLoading={saving}
                isDisabled={saving}
                onClick={() => void submitSave()}
              />
            </HStack>
          </HStack>
        ) : null}
      </VStack>
    </AdminAccessGuard>
  );
}
