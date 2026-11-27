'use client';

import { useMemo, useState } from 'react';
import type { z } from 'zod';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Switch } from '@astryxdesign/core/Switch';
import { Table } from '@astryxdesign/core/Table';
import { Token } from '@astryxdesign/core/Token';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { CheckCircle2, CloudCog, Eye, Pencil, Save } from 'lucide-react';
import { StatusTag, SurfaceCard, type StatusTagTone } from '@/components/ui';
import { FormDialog } from '@/components/ui/FormDialog';
import type {
  WhatsAppSettingsActionSchema,
  WhatsAppSettingsResponseDTO,
  WhatsAppTemplateCatalogItemDTO,
} from '@/lib/contracts';
import { FORM_SUBMIT_OK, formSubmitError } from '@/lib/forms/form-submit';
import {
  renderWhatsAppTemplatePreview,
  WHATSAPP_TEMPLATE_CATALOG,
} from '@/lib/notifications/whatsapp-inbox';
import type {
  AdminRole,
  WhatsAppTemplateConfig,
  WhatsAppTemplateTriggerKey,
} from '@/lib/types';

type WhatsAppSettingsActionInput = z.infer<typeof WhatsAppSettingsActionSchema>;
type LiveMetaTemplateRow = NonNullable<WhatsAppSettingsResponseDTO['liveMeta']>['templates'][number];

interface WhatsAppTemplatesTableProps {
  templates: WhatsAppTemplateConfig[];
  catalog: readonly WhatsAppTemplateCatalogItemDTO[];
  liveTemplates: readonly LiveMetaTemplateRow[];
  cloudReady: boolean;
  managementReady: boolean;
  role: AdminRole;
  isSubmitting: boolean;
  onRunSettingsAction: (action: WhatsAppSettingsActionInput) => Promise<boolean>;
}

type MergedTemplateRow = {
  triggerKey: WhatsAppTemplateTriggerKey;
  friendlyTitle: string;
  description: string;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
  templateName: string;
  languageCode: string;
  isActive: boolean;
  parameterLabels: readonly string[];
  exampleParameters: readonly string[];
  quickReplyButtons?: readonly string[];
  remoteStatus: LiveMetaTemplateRow['status'] | null;
  rejectedReason: string | null;
};

function categoryMeta(category: MergedTemplateRow['category']): {
  label: string;
  tone: StatusTagTone;
} {
  if (category === 'AUTHENTICATION') return { label: 'Autenticación', tone: 'info' };
  if (category === 'MARKETING') return { label: 'Seguimiento', tone: 'accent' };
  return { label: 'Utilidad', tone: 'neutral' };
}

function metaStatusBadge(
  status: LiveMetaTemplateRow['status'] | null,
  cloudReady: boolean,
): { label: string; tone: StatusTagTone } {
  if (!cloudReady) return { label: 'Lista para Meta', tone: 'neutral' };
  if (!status) return { label: 'Sin comprobar', tone: 'neutral' };
  if (status === 'APPROVED') return { label: 'Aprobada', tone: 'success' };
  if (status === 'PENDING') return { label: 'En revisión', tone: 'warning' };
  if (status === 'REJECTED') return { label: 'Rechazada', tone: 'danger' };
  if (status === 'PAUSED') return { label: 'Pausada', tone: 'warning' };
  if (status === 'MISSING') return { label: 'Falta crear', tone: 'warning' };
  return { label: 'Sin comprobar', tone: 'neutral' };
}

export function WhatsAppTemplatesTable({
  templates,
  catalog,
  liveTemplates,
  cloudReady,
  managementReady,
  role,
  isSubmitting,
  onRunSettingsAction,
}: WhatsAppTemplatesTableProps) {
  const [busyTriggerKey, setBusyTriggerKey] = useState<WhatsAppTemplateTriggerKey | null>(null);
  const [syncingMeta, setSyncingMeta] = useState(false);
  const [previewRow, setPreviewRow] = useState<MergedTemplateRow | null>(null);
  const [editingRow, setEditingRow] = useState<MergedTemplateRow | null>(null);
  const [nameDraft, setNameDraft] = useState('');

  const isOwner = role === 'owner';

  const rows = useMemo<MergedTemplateRow[]>(() => {
    const sourceCatalog = catalog.length > 0 ? catalog : WHATSAPP_TEMPLATE_CATALOG;
    const configByTrigger = new Map<WhatsAppTemplateTriggerKey, WhatsAppTemplateConfig>();
    for (const cfg of templates) {
      configByTrigger.set(cfg.triggerKey, cfg);
    }
    const remoteByTrigger = new Map<WhatsAppTemplateTriggerKey, LiveMetaTemplateRow>();
    for (const remote of liveTemplates) {
      remoteByTrigger.set(remote.triggerKey, remote);
    }

    return sourceCatalog.map((spec) => {
      const cfg = configByTrigger.get(spec.triggerKey);
      const remote = remoteByTrigger.get(spec.triggerKey);
      return {
        triggerKey: spec.triggerKey,
        friendlyTitle: spec.friendlyTitle,
        description: spec.description,
        category: cfg?.category ?? spec.category,
        templateName: cfg?.templateName ?? spec.defaultTemplateName,
        languageCode: cfg?.languageCode ?? spec.languageCode,
        isActive: cfg?.isActive ?? true,
        parameterLabels: spec.parameterLabels,
        exampleParameters: spec.exampleParameters,
        quickReplyButtons: spec.quickReplyButtons,
        remoteStatus: remote?.status ?? null,
        rejectedReason: remote?.rejectedReason ?? null,
      };
    });
  }, [catalog, templates, liveTemplates]);

  const activeCount = rows.filter((row) => row.isActive).length;

  const handleToggleActive = async (row: MergedTemplateRow, nextActive: boolean) => {
    if (!isOwner || busyTriggerKey || isSubmitting) return;
    setBusyTriggerKey(row.triggerKey);
    try {
      await onRunSettingsAction({
        action: 'update_template',
        triggerKey: row.triggerKey,
        isActive: nextActive,
      });
    } finally {
      setBusyTriggerKey(null);
    }
  };

  const handleSyncMeta = async () => {
    if (!isOwner || syncingMeta || isSubmitting) return;
    setSyncingMeta(true);
    try {
      await onRunSettingsAction({ action: 'sync_meta_templates' });
    } finally {
      setSyncingMeta(false);
    }
  };

  const openNameEditor = (row: MergedTemplateRow) => {
    setEditingRow(row);
    setNameDraft(row.templateName);
  };

  return (
    <>
      <SurfaceCard
        id="wa-templates-heading"
        icon={<CheckCircle2 size={17} aria-hidden="true" />}
        title="Plantillas oficiales de Meta"
        subtitle="Las 9 plantillas en español (es_MX) usadas fuera de la ventana de 24 h."
        count={rows.length}
        badge={
          <StatusTag
            tone="success"
            label={`${activeCount} de ${rows.length} activas`}
            hasTabularNumbers
          />
        }
        actions={
          isOwner ? (
            <Button
              type="button"
              label={syncingMeta ? 'Sincronizando…' : 'Sincronizar con Meta'}
              variant="secondary"
              size="sm"
              icon={<CloudCog size={14} aria-hidden="true" />}
              isLoading={syncingMeta}
              isDisabled={syncingMeta || isSubmitting || !managementReady}
              onClick={() => void handleSyncMeta()}
            />
          ) : undefined
        }
      >
        <VStack className="ad-table-scroll" gap={0}>
          <Table
            idKey="triggerKey"
            hasHover
            data={rows}
            columns={[
              {
                key: 'template',
                header: 'Plantilla',
                renderCell: (row) => (
                  <VStack gap={0.5} style={{ maxWidth: '24rem' }}>
                    <Text weight="semibold" size="sm">
                      {row.friendlyTitle}
                    </Text>
                    <Text type="supporting" color="secondary" size="sm" maxLines={2}>
                      {row.description}
                    </Text>
                    <HStack gap={1.5} align="center" wrap="wrap">
                      <Text type="code" color="secondary" size="sm">
                        {row.templateName}
                      </Text>
                      <Text type="supporting" color="secondary" size="sm">
                        · {row.languageCode}
                      </Text>
                    </HStack>
                  </VStack>
                ),
              },
              {
                key: 'category',
                header: 'Categoría',
                renderCell: (row) => {
                  const cat = categoryMeta(row.category);
                  return <StatusTag tone={cat.tone} label={cat.label} />;
                },
              },
              {
                key: 'metaStatus',
                header: 'Estado Meta',
                renderCell: (row) => {
                  const badge = metaStatusBadge(row.remoteStatus, cloudReady);
                  return (
                    <VStack gap={0.5} style={{ maxWidth: '14rem' }}>
                      <StatusTag tone={badge.tone} showDot label={badge.label} />
                      {row.rejectedReason ? (
                        <Text
                          type="supporting"
                          size="sm"
                          style={{ color: 'var(--color-text-error)' }}
                        >
                          {row.rejectedReason}
                        </Text>
                      ) : null}
                    </VStack>
                  );
                },
              },
              {
                key: 'isActive',
                header: 'Activa',
                renderCell: (row) => {
                  const isBusy = busyTriggerKey === row.triggerKey;
                  return (
                    <Switch
                      label={`Activar plantilla ${row.friendlyTitle}`}
                      isLabelHidden
                      size="sm"
                      value={row.isActive}
                      isLoading={isBusy}
                      isDisabled={
                        !isOwner ||
                        isSubmitting ||
                        (Boolean(busyTriggerKey) && !isBusy)
                      }
                      onChange={(checked) => void handleToggleActive(row, checked)}
                    />
                  );
                },
              },
              {
                key: 'actions',
                header: 'Acciones',
                align: 'end',
                renderCell: (row) => (
                  <HStack gap={1.5} justify="end" align="center" wrap="wrap">
                    <Button
                      type="button"
                      label="Vista previa"
                      variant="secondary"
                      size="sm"
                      icon={<Eye size={13} aria-hidden="true" />}
                      onClick={() => setPreviewRow(row)}
                    />
                    {isOwner ? (
                      <Button
                        type="button"
                        label="Editar nombre"
                        variant="ghost"
                        size="sm"
                        icon={<Pencil size={13} aria-hidden="true" />}
                        isDisabled={isSubmitting}
                        onClick={() => openNameEditor(row)}
                      />
                    ) : null}
                  </HStack>
                ),
              },
            ]}
          />
        </VStack>
      </SurfaceCard>

      <Dialog
        isOpen={Boolean(previewRow)}
        onOpenChange={(open) => {
          if (!open) setPreviewRow(null);
        }}
        purpose="info"
        width="min(32rem, 96vw)"
        maxHeight="min(88dvh, calc(100dvh - 2rem))"
        padding={5}
      >
        <Layout
          header={
            <DialogHeader
              title={previewRow ? previewRow.friendlyTitle : 'Vista previa de plantilla'}
              subtitle={
                previewRow
                  ? `Slug en Meta: ${previewRow.templateName} · Idioma: ${previewRow.languageCode}`
                  : undefined
              }
              hasDivider
              onOpenChange={(open) => {
                if (!open) setPreviewRow(null);
              }}
            />
          }
          content={
            <LayoutContent>
              {previewRow ? (
                <VStack gap={4}>
                  <HStack gap={2} align="center" wrap="wrap">
                    <StatusTag
                      tone={categoryMeta(previewRow.category).tone}
                      label={categoryMeta(previewRow.category).label}
                    />
                    <StatusTag
                      tone={metaStatusBadge(previewRow.remoteStatus, cloudReady).tone}
                      label={metaStatusBadge(previewRow.remoteStatus, cloudReady).label}
                    />
                  </HStack>

                  <VStack gap={1.5} className="ad-wa-template-preview">
                    <Text type="supporting" color="secondary" weight="semibold">
                      Así lo verá la clienta en WhatsApp
                    </Text>
                    <Text size="sm" textWrap="pretty">
                      {renderWhatsAppTemplatePreview(
                        previewRow.triggerKey,
                        previewRow.exampleParameters,
                      )}
                    </Text>
                    {previewRow.quickReplyButtons && previewRow.quickReplyButtons.length > 0 ? (
                      <HStack gap={1.5} wrap="wrap" paddingBlockStart={2}>
                        {previewRow.quickReplyButtons.map((btnLabel) => (
                          <Token key={btnLabel} size="sm" label={btnLabel} />
                        ))}
                      </HStack>
                    ) : null}
                  </VStack>

                  <VStack gap={1.5}>
                    <Text type="supporting" color="secondary" weight="semibold">
                      Variables incluidas ({previewRow.parameterLabels.length})
                    </Text>
                    <HStack gap={1.5} wrap="wrap">
                      {previewRow.parameterLabels.map((label, idx) => (
                        <Token
                          key={`${previewRow.triggerKey}-${label}`}
                          size="sm"
                          label={`{{${idx + 1}}} ${label}`}
                        />
                      ))}
                    </HStack>
                  </VStack>
                </VStack>
              ) : null}
            </LayoutContent>
          }
        />
      </Dialog>

      <FormDialog
        isOpen={Boolean(editingRow)}
        onOpenChange={(open) => {
          if (!open) setEditingRow(null);
        }}
        title="Editar nombre de plantilla en Meta"
        subtitle="Modifícalo solo si Meta aprobó esta plantilla con un slug distinto."
        width="min(30rem, 96vw)"
      >
        {(controls) => (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!editingRow) return;
              controls.submit(async () => {
                const cleaned = nameDraft.trim().toLowerCase();
                if (!/^[a-z0-9_]{2,120}$/.test(cleaned)) {
                  return formSubmitError(
                    'Usa solo letras minúsculas, números y guion bajo (_).',
                  );
                }
                const ok = await onRunSettingsAction({
                  action: 'update_template',
                  triggerKey: editingRow.triggerKey,
                  templateName: cleaned,
                });
                if (!ok) {
                  return formSubmitError('No se pudo actualizar el nombre de la plantilla.');
                }
                setEditingRow(null);
                return FORM_SUBMIT_OK;
              });
            }}
          >
            <VStack gap={3}>
              <TextInput
                label="Nombre en Meta (slug)"
                placeholder="laikona_recordatorio_24h"
                description="Solo minúsculas, números y guion bajo (_)."
                value={nameDraft}
                onChange={setNameDraft}
                isRequired
              />
              <HStack gap={2} justify="end" wrap="wrap">
                <Button
                  type="button"
                  label="Cancelar"
                  variant="secondary"
                  isDisabled={controls.isSubmitting}
                  onClick={controls.close}
                />
                <Button
                  type="submit"
                  label={controls.isSubmitting ? 'Guardando…' : 'Guardar nombre'}
                  variant="primary"
                  icon={<Save size={14} aria-hidden="true" />}
                  isLoading={controls.isSubmitting}
                  isDisabled={controls.isSubmitting || nameDraft.trim().length < 2}
                />
              </HStack>
            </VStack>
          </form>
        )}
      </FormDialog>
    </>
  );
}
