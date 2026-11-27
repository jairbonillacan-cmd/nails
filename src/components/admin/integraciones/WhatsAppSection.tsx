'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Switch } from '@astryxdesign/core/Switch';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  MessageCircle,
  Pencil,
  Save,
} from 'lucide-react';
import {
  ActionRow,
  CopyableField,
  StatusTag,
  SurfaceCard,
  type StatusTagTone,
} from '@/components/ui';
import { FormDialog } from '@/components/ui/FormDialog';
import { formatDateShortInTimezone, formatTimeInTimezone } from '@/lib/format';
import {
  FORM_SUBMIT_OK,
  formSubmitError,
  type FormSubmitResult,
} from '@/lib/forms/form-submit';
import {
  buildTemplatePreview,
  describeWorkflowMoment,
  type TemplatePreviewSegment,
} from '@/lib/notifications/template-preview';
import type { summarizeCascadeMetrics } from '@/lib/notifications/cascade';
import type { RuntimeIntegrationStatus } from '@/lib/env';
import type {
  NotificationChannel,
  NotificationWorkflow,
  WhatsAppMonthlyUsageSummary,
  WhatsAppTemplateConfig,
  WhatsAppTemplateTriggerKey,
} from '@/lib/types';
import {
  WhatsAppBusinessStatusPanel,
  type LiveMetaConnectionSnapshot,
  type LiveMetaTemplateStatusRow,
} from './WhatsAppBusinessStatusPanel';

type CascadeSummary = ReturnType<typeof summarizeCascadeMetrics>;

export interface CopyableWhatsAppTemplate {
  id: string;
  title: string;
  tag: string;
  body: string;
}

interface BookingMetaItem {
  clientName: string;
  serviceName: string;
}

interface WhatsAppSectionProps {
  integration: RuntimeIntegrationStatus;
  salonName: string;
  salonAddress: string;
  salonPhone: string;
  webhookUrl: string;
  whatsappBookingEnabled: boolean;
  whatsappUsage: WhatsAppMonthlyUsageSummary;
  reminderSummary: CascadeSummary | null;
  bookingMetaById: ReadonlyMap<string, BookingMetaItem>;
  timezone: string;
  workflows: NotificationWorkflow[];
  copyableTemplates: readonly CopyableWhatsAppTemplate[];
  officialTemplates: WhatsAppTemplateConfig[];
  onToggleWhatsappBooking: (enabled: boolean) => void;
  onToggleWorkflowEnabled: (workflowId: string, enabled: boolean) => void;
  onToggleReminderChannel: (
    workflowId: string,
    currentChannels: NotificationChannel[],
    channel: NotificationChannel,
    enabled: boolean,
  ) => void;
  onUpdateWorkflowContent: (
    workflowId: string,
    patch: { subjectTemplate: string; messageTemplate: string; offsetMinutes?: number },
  ) => Promise<FormSubmitResult>;
  onUpdateOfficialTemplate: (
    triggerKey: WhatsAppTemplateTriggerKey,
    patch: { templateName?: string; isActive?: boolean },
  ) => Promise<FormSubmitResult>;
  onBanner: (msg: { status: 'success' | 'error'; text: string }) => void;
  onRefresh: () => Promise<void>;
}

const FRIENDLY_WHATSAPP_TEMPLATE_LABELS: Record<
  WhatsAppTemplateTriggerKey,
  { title: string; subtitle: string; categoryLabel: string; variablesHint: string }
> = {
  booking_confirmed: {
    title: 'Confirmación de cita',
    subtitle: 'Se envía cuando apartan o confirmas su horario.',
    categoryLabel: 'Utilidad',
    variablesHint: 'Clienta, servicio, fecha, hora, profesional y enlace',
  },
  reminder_24h: {
    title: 'Recordatorio 24 horas antes',
    subtitle: 'Recuerda la cita un día antes con botones de Confirmo y Reagendar.',
    categoryLabel: 'Utilidad',
    variablesHint: 'Clienta, servicio, hora, profesional y enlace',
  },
  reminder_2h: {
    title: 'Recordatorio 2 horas antes',
    subtitle: 'Comparte la dirección del estudio y la tolerancia antes de salir.',
    categoryLabel: 'Utilidad',
    variablesHint: 'Clienta, hora y dirección',
  },
  booking_rescheduled: {
    title: 'Cita reagendada',
    subtitle: 'Confirma el nuevo día y hora elegidos.',
    categoryLabel: 'Utilidad',
    variablesHint: 'Clienta, servicio, fecha, hora y enlace',
  },
  booking_canceled: {
    title: 'Cita cancelada',
    subtitle: 'Confirma la cancelación y liberación del espacio.',
    categoryLabel: 'Utilidad',
    variablesHint: 'Clienta, servicio y fecha',
  },
  waitlist_offer: {
    title: 'Espacio libre en lista de espera',
    subtitle: 'Avisa con prioridad a la siguiente clienta cuando se libera un turno.',
    categoryLabel: 'Utilidad',
    variablesHint: 'Clienta, servicio, fecha, hora y enlace',
  },
  deposit_rejected: {
    title: 'Comprobante de anticipo por corregir',
    subtitle: 'Avisa si el comprobante de transferencia no se pudo validar para que suba otro.',
    categoryLabel: 'Utilidad',
    variablesHint: 'Clienta, código, servicio y enlace',
  },
  client_otp: {
    title: 'Código de acceso (Mis citas)',
    subtitle: 'Envía el código de 6 dígitos con botón para copiar.',
    categoryLabel: 'Autenticación',
    variablesHint: 'Código de 6 dígitos',
  },
  touchup_invite: {
    title: 'Invitación de retoque (3 semanas)',
    subtitle: 'Invita a agendar el retoque con fecha sugerida.',
    categoryLabel: 'Seguimiento',
    variablesHint: 'Clienta, servicio, profesional y enlace',
  },
};

function metaApprovalBadge(
  remote: LiveMetaTemplateStatusRow | undefined,
  cloudConfigured: boolean,
): { label: string; tone: StatusTagTone } {
  if (!cloudConfigured) {
    return { label: 'Lista para Meta', tone: 'neutral' };
  }
  if (!remote) {
    return { label: 'Sin comprobar', tone: 'neutral' };
  }
  if (remote.status === 'APPROVED') return { label: 'Aprobada en Meta', tone: 'success' };
  if (remote.status === 'PENDING') return { label: 'En revisión', tone: 'warning' };
  if (remote.status === 'REJECTED') return { label: 'Rechazada', tone: 'danger' };
  if (remote.status === 'PAUSED') return { label: 'Pausada en Meta', tone: 'warning' };
  if (remote.status === 'MISSING') return { label: 'Falta crear', tone: 'warning' };
  return { label: 'Sin comprobar', tone: 'neutral' };
}

function TemplatePreview({ segments }: { segments: readonly TemplatePreviewSegment[] }) {
  return (
    <Text type="supporting" color="secondary" textWrap="pretty" className="ad-msg-preview">
      {segments.map((segment, idx) =>
        segment.kind === 'text' ? (
          segment.text
        ) : (
          <Text
            key={`${segment.kind}-${idx}`}
            as="span"
            type="supporting"
            weight="semibold"
            className={segment.kind === 'link' ? 'ad-msg-link' : 'ad-msg-value'}
          >
            {segment.text}
          </Text>
        ),
      )}
    </Text>
  );
}

export function WhatsAppSection({
  integration,
  salonName,
  salonAddress,
  salonPhone,
  webhookUrl,
  whatsappBookingEnabled,
  whatsappUsage,
  reminderSummary,
  bookingMetaById,
  timezone,
  workflows,
  copyableTemplates,
  officialTemplates,
  onToggleWhatsappBooking,
  onToggleWorkflowEnabled,
  onToggleReminderChannel,
  onUpdateWorkflowContent,
  onUpdateOfficialTemplate,
  onBanner,
  onRefresh,
}: WhatsAppSectionProps) {
  const [liveMeta, setLiveMeta] = useState<LiveMetaConnectionSnapshot | null>(null);
  const [checkingLive, setCheckingLive] = useState(false);
  const [syncingTemplates, setSyncingTemplates] = useState(false);
  const [togglingTemplateKey, setTogglingTemplateKey] =
    useState<WhatsAppTemplateTriggerKey | null>(null);

  const [editingWorkflow, setEditingWorkflow] = useState<NotificationWorkflow | null>(null);
  const [wfSubject, setWfSubject] = useState('');
  const [wfMessage, setWfMessage] = useState('');
  const [wfOffsetHours, setWfOffsetHours] = useState(24);

  const [editingTemplate, setEditingTemplate] = useState<WhatsAppTemplateConfig | null>(null);
  const [tplNameDraft, setTplNameDraft] = useState('');

  const activeRemindersCount = workflows.filter((w) => w.isEnabled).length;
  const whatsappRemaining = Math.max(0, whatsappUsage.quotaLimit - whatsappUsage.sentCount);
  const activeOfficialCount = officialTemplates.filter((tpl) => tpl.isActive).length;

  const remoteTemplateByTrigger = new Map<WhatsAppTemplateTriggerKey, LiveMetaTemplateStatusRow>();
  for (const row of liveMeta?.templates ?? []) {
    remoteTemplateByTrigger.set(row.triggerKey, row);
  }

  const handleCheckLiveConnection = async () => {
    if (checkingLive) return;
    setCheckingLive(true);
    try {
      const res = await fetch('/api/admin/integrations/whatsapp?live=1', {
        cache: 'no-store',
      });
      const json = (await res.json().catch(() => null)) as {
        liveMeta?: LiveMetaConnectionSnapshot;
        error?: string;
      } | null;
      if (!res.ok || !json?.liveMeta) {
        onBanner({
          status: 'error',
          text: json?.error || 'No se pudo comprobar la conexión con Meta.',
        });
        return;
      }
      setLiveMeta(json.liveMeta);
      if (json.liveMeta.ok) {
        onBanner({
          status: 'success',
          text: 'Conexión con WhatsApp Business verificada.',
        });
      }
    } catch {
      onBanner({
        status: 'error',
        text: 'Sin conexión. No se pudo consultar Meta.',
      });
    } finally {
      setCheckingLive(false);
    }
  };

  const handleSyncMetaTemplates = async () => {
    if (syncingTemplates) return;
    setSyncingTemplates(true);
    try {
      const res = await fetch('/api/admin/integrations/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_meta_templates' }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        created?: Array<{ templateName: string }>;
        existing?: Array<{ templateName: string }>;
        failed?: Array<{ templateName: string; error: string }>;
        error?: string;
      } | null;
      if (!res.ok || !json) {
        onBanner({
          status: 'error',
          text: json?.error || 'No se pudieron sincronizar las plantillas con Meta.',
        });
        return;
      }
      const createdCount = json.created?.length ?? 0;
      const existingCount = json.existing?.length ?? 0;
      const failedCount = json.failed?.length ?? 0;
      onBanner({
        status: failedCount > 0 ? 'error' : 'success',
        text:
          failedCount > 0
            ? `Creadas ${createdCount}, existentes ${existingCount}, con error ${failedCount}.`
            : createdCount > 0
              ? `Listo: se enviaron ${createdCount} plantillas nuevas a aprobación en Meta (${existingCount} ya existían).`
              : `Todas tus ${existingCount} plantillas oficiales ya están registradas en Meta.`,
      });
      await handleCheckLiveConnection();
    } catch {
      onBanner({
        status: 'error',
        text: 'Sin conexión. No se pudieron sincronizar las plantillas.',
      });
    } finally {
      setSyncingTemplates(false);
    }
  };

  const openWorkflowEditor = (wf: NotificationWorkflow) => {
    setEditingWorkflow(wf);
    setWfSubject(wf.subjectTemplate);
    setWfMessage(wf.messageTemplate);
    setWfOffsetHours(Math.max(1, Math.round((wf.offsetMinutes || 60) / 60)));
  };

  const openTemplateEditor = (tpl: WhatsAppTemplateConfig) => {
    setEditingTemplate(tpl);
    setTplNameDraft(tpl.templateName);
  };

  const handleToggleTemplate = async (
    tpl: WhatsAppTemplateConfig,
    nextActive: boolean,
  ) => {
    if (togglingTemplateKey) return;
    setTogglingTemplateKey(tpl.triggerKey);
    try {
      const result = await onUpdateOfficialTemplate(tpl.triggerKey, {
        isActive: nextActive,
      });
      if (!result.ok) {
        onBanner({ status: 'error', text: result.error });
      }
    } finally {
      setTogglingTemplateKey(null);
    }
  };

  return (
    <>
    <SurfaceCard
      id="whatsapp-reminders-heading"
      icon={<MessageCircle size={18} aria-hidden="true" />}
      title="WhatsApp Business y avisos automáticos"
      subtitle="Mensajes que se mandan solos para que no falten a su cita."
      badge={
        <StatusTag
          tone={activeRemindersCount > 0 ? 'success' : 'neutral'}
          label={`${activeRemindersCount} ${activeRemindersCount === 1 ? 'aviso activo' : 'avisos activos'}`}
          hasTabularNumbers
        />
      }
      actions={
        <Switch
          label="Recibir citas por WhatsApp"
          size="sm"
          value={whatsappBookingEnabled}
          onChange={onToggleWhatsappBooking}
        />
      }
    >
      <VStack gap={4} className="ad-card-body" paddingBlockStart={4}>
        <WhatsAppBusinessStatusPanel
          integration={integration}
          salonPhone={salonPhone}
          webhookUrl={webhookUrl}
          liveMeta={liveMeta}
          checkingLive={checkingLive}
          syncingTemplates={syncingTemplates}
          onCheckLiveConnection={handleCheckLiveConnection}
          onSyncMetaTemplates={handleSyncMetaTemplates}
          onBanner={onBanner}
          onRefresh={onRefresh}
        />

        <VStack gap={3} className="ad-subpanel">
          <HStack justify="between" align="center" wrap="wrap" gap={2}>
            <VStack gap={0.5} className="rb-grow">
              <Text weight="semibold" size="sm">
                Mensajes automáticos de este mes
              </Text>
              <Text type="supporting" color="secondary" hasTabularNumbers>
                {whatsappUsage.sentCount} de {whatsappUsage.quotaLimit} mensajes usados este mes ·{' '}
                {whatsappRemaining > 0
                  ? `te quedan ${whatsappRemaining} disponibles`
                  : 'límite mensual alcanzado'}
              </Text>
            </VStack>
            <StatusTag
              tone={
                whatsappUsage.alertLevel === 'limit_100'
                  ? 'danger'
                  : whatsappUsage.alertLevel === 'warning_80'
                    ? 'warning'
                    : 'success'
              }
              label={
                whatsappUsage.alertLevel === 'limit_100'
                  ? 'Límite alcanzado'
                  : `${whatsappUsage.percentUsed}% usado`
              }
              hasTabularNumbers
            />
          </HStack>

          <ProgressBar
            label="Mensajes de WhatsApp usados este mes"
            isLabelHidden
            value={whatsappUsage.sentCount}
            max={whatsappUsage.quotaLimit}
            variant={
              whatsappUsage.alertLevel === 'limit_100'
                ? 'error'
                : whatsappUsage.alertLevel === 'warning_80'
                  ? 'warning'
                  : 'accent'
            }
          />

          {whatsappUsage.alertLevel === 'warning_80' ? (
            <Banner
              status="warning"
              role="status"
              title={`Ya usaste el ${whatsappUsage.percentUsed}% de tus mensajes de WhatsApp de este mes`}
              description={`Te quedan ${whatsappRemaining} avisos automáticos. Si llegas a ${whatsappUsage.quotaLimit}, las confirmaciones seguirán llegando por correo y también podrás abrir WhatsApp tú misma.`}
            />
          ) : null}

          {whatsappUsage.alertLevel === 'limit_100' ? (
            <Banner
              status="warning"
              role="status"
              title={`Alcanzaste los ${whatsappUsage.quotaLimit} mensajes automáticos de este mes`}
              description="Para evitar cobros inesperados, los avisos siguen llegando por correo electrónico y con enlace directo a WhatsApp hasta el inicio del próximo mes."
            />
          ) : null}
        </VStack>

        {reminderSummary ? (
          reminderSummary.bookingsWithoutReminders.length > 0 ? (
            <VStack gap={2} className="ad-subpanel">
              <HStack justify="between" align="center" wrap="wrap" gap={2}>
                <HStack gap={2} align="center">
                  <Bell size={16} aria-hidden="true" />
                  <Text weight="semibold" size="sm">
                    {reminderSummary.bookingsWithoutReminders.length} cita
                    {reminderSummary.bookingsWithoutReminders.length === 1 ? '' : 's'} sin recordatorio programado
                  </Text>
                </HStack>
                <Button
                  label="Ver en Agenda"
                  variant="secondary"
                  size="sm"
                  href="/admin/citas"
                  icon={<ArrowRight size={14} aria-hidden="true" />}
                />
              </HStack>
              <SurfaceCard>
                <VStack as="ul" className="ad-row-list" gap={0}>
                  {reminderSummary.bookingsWithoutReminders.slice(0, 4).map((bk) => {
                    const meta = bookingMetaById.get(bk.id);
                    return (
                      <li key={bk.id}>
                        <ActionRow
                          title={`${meta?.clientName ?? 'Clienta'} · ${bk.bookingCode}`}
                          meta={`${meta?.serviceName ?? 'Servicio'} · ${formatDateShortInTimezone(bk.startAt, timezone)} · ${formatTimeInTimezone(bk.startAt, timezone)}`}
                          actions={
                            <Button
                              label="Abrir"
                              variant="ghost"
                              size="sm"
                              href={`/admin/citas?q=${encodeURIComponent(bk.bookingCode)}`}
                            />
                          }
                        />
                      </li>
                    );
                  })}
                </VStack>
              </SurfaceCard>
            </VStack>
          ) : (
            <HStack className="ad-subpanel" gap={2} align="center">
              <CheckCircle2 size={18} aria-hidden="true" />
              <VStack gap={0}>
                <Text weight="semibold" size="sm">
                  Todas tus citas próximas tienen recordatorio listo
                </Text>
                <Text type="supporting" color="secondary">
                  Si la clienta confirma primero por correo, no le mandamos WhatsApp repetido.
                </Text>
              </VStack>
            </HStack>
          )
        ) : null}

        <SurfaceCard>
          <VStack as="ul" className="ad-row-list" gap={0}>
            {workflows.map((wf) => (
              <li key={wf.id}>
                <ActionRow
                  title={describeWorkflowMoment(wf)}
                  subtitle={
                    <TemplatePreview
                      segments={buildTemplatePreview(wf.messageTemplate, {
                        salonName,
                        address: salonAddress,
                      })}
                    />
                  }
                  isMuted={!wf.isEnabled}
                  meta={
                    <HStack gap={4} wrap="wrap" paddingBlockStart={1}>
                      <CheckboxInput
                        size="sm"
                        label="WhatsApp"
                        value={wf.channels.includes('whatsapp')}
                        onChange={(c) =>
                          onToggleReminderChannel(wf.id, wf.channels, 'whatsapp', c)
                        }
                      />
                      <CheckboxInput
                        size="sm"
                        label="Correo electrónico"
                        value={wf.channels.includes('email')}
                        onChange={(c) =>
                          onToggleReminderChannel(wf.id, wf.channels, 'email', c)
                        }
                      />
                    </HStack>
                  }
                  actions={
                    <HStack gap={2} align="center">
                      <Button
                        type="button"
                        label="Editar"
                        variant="ghost"
                        size="sm"
                        icon={<Pencil size={13} aria-hidden="true" />}
                        onClick={() => openWorkflowEditor(wf)}
                      />
                      <Switch
                        label={`Enviar mensaje: ${describeWorkflowMoment(wf)}`}
                        isLabelHidden
                        size="sm"
                        value={wf.isEnabled}
                        onChange={(checked) => onToggleWorkflowEnabled(wf.id, checked)}
                      />
                    </HStack>
                  }
                />
              </li>
            ))}
          </VStack>
        </SurfaceCard>

        <Collapsible
          className="ad-disclosure"
          defaultIsOpen={false}
          trigger={
            <HStack gap={2} align="center">
              <MessageCircle size={14} aria-hidden="true" />
              <Text weight="semibold" size="sm">
                Mensajes para mandar tú misma ({copyableTemplates.length})
              </Text>
            </HStack>
          }
        >
          <VStack className="ad-config-grid-equal" gap={3} paddingBlockStart={3}>
            {copyableTemplates.map((tpl) => (
              <VStack key={tpl.id} className="ad-subpanel" justify="between" gap={2}>
                <HStack justify="between" align="center" wrap="wrap" gap={1.5}>
                  <Text weight="semibold" size="sm">
                    {tpl.title}
                  </Text>
                  <StatusTag tone="neutral" label={tpl.tag} />
                </HStack>
                <CopyableField
                  value={tpl.body}
                  copyLabel="Copiar mensaje"
                  copiedLabel="Mensaje copiado"
                  feedbackMessage={`"${tpl.title}" copiado.`}
                  layout="stacked"
                />
              </VStack>
            ))}
          </VStack>
        </Collapsible>

        {officialTemplates.length > 0 ? (
          <Collapsible
            className="ad-disclosure"
            defaultIsOpen={false}
            trigger={
              <HStack justify="between" align="center" gap={2} width="100%" wrap="wrap">
                <HStack gap={2} align="center">
                  <CheckCircle2 size={14} aria-hidden="true" />
                  <Text weight="semibold" size="sm">
                    Plantillas oficiales de WhatsApp ({officialTemplates.length})
                  </Text>
                </HStack>
                <Text type="supporting" color="secondary" hasTabularNumbers>
                  {activeOfficialCount} de {officialTemplates.length} activas
                </Text>
              </HStack>
            }
          >
            <SurfaceCard>
              <VStack as="ul" className="ad-row-list" gap={0}>
                {officialTemplates.map((tpl) => {
                  const meta = FRIENDLY_WHATSAPP_TEMPLATE_LABELS[tpl.triggerKey];
                  const remote = remoteTemplateByTrigger.get(tpl.triggerKey);
                  const approval = metaApprovalBadge(remote, integration.whatsappCloudConfigured);
                  const isBusy = togglingTemplateKey === tpl.triggerKey;
                  return (
                    <li key={tpl.id}>
                      <ActionRow
                        title={
                          <HStack gap={2} align="center" wrap="wrap">
                            <Text weight="semibold" size="sm">
                              {meta?.title ?? tpl.triggerKey}
                            </Text>
                            <StatusTag tone="neutral" label={meta?.categoryLabel ?? tpl.category} />
                            <StatusTag tone={approval.tone} label={approval.label} />
                          </HStack>
                        }
                        subtitle={
                          remote?.rejectedReason
                            ? `Rechazada por Meta: ${remote.rejectedReason}`
                            : meta?.subtitle
                        }
                        meta={`Nombre en Meta: ${tpl.templateName} · Variables: ${meta?.variablesHint ?? '-'}`}
                        isMuted={!tpl.isActive}
                        actions={
                          <HStack gap={2} align="center">
                            <Button
                              type="button"
                              label="Nombre"
                              variant="ghost"
                              size="sm"
                              icon={<Pencil size={13} aria-hidden="true" />}
                              onClick={() => openTemplateEditor(tpl)}
                            />
                            <Switch
                              label={`Usar plantilla ${meta?.title ?? tpl.templateName}`}
                              isLabelHidden
                              size="sm"
                              value={tpl.isActive}
                              isLoading={isBusy}
                              isDisabled={Boolean(togglingTemplateKey) && !isBusy}
                              onChange={(checked) => void handleToggleTemplate(tpl, checked)}
                            />
                          </HStack>
                        }
                      />
                    </li>
                  );
                })}
              </VStack>
            </SurfaceCard>
          </Collapsible>
        ) : null}
      </VStack>
    </SurfaceCard>

    <FormDialog
      isOpen={Boolean(editingWorkflow)}
      onOpenChange={(open) => {
        if (!open) setEditingWorkflow(null);
      }}
      title={editingWorkflow ? `Editar aviso · ${describeWorkflowMoment(editingWorkflow)}` : 'Editar aviso'}
      subtitle="Personaliza el texto que recibirán tus clientas."
      width="min(34rem, 96vw)"
    >
      {(controls) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!editingWorkflow) return;
            controls.submit(async () => {
              if (!wfMessage.trim()) {
                return formSubmitError('Escribe el texto del mensaje.');
              }
              const patch = {
                subjectTemplate: wfSubject.trim(),
                messageTemplate: wfMessage.trim(),
                ...(editingWorkflow.triggerEvent === 'before_booking' ||
                editingWorkflow.triggerEvent === 'after_booking'
                  ? { offsetMinutes: Math.max(15, Math.round(wfOffsetHours * 60)) }
                  : {}),
              };
              const result = await onUpdateWorkflowContent(editingWorkflow.id, patch);
              if (result.ok) setEditingWorkflow(null);
              return result;
            });
          }}
        >
          <VStack gap={3}>
            <TextInput
              label="Asunto del correo"
              value={wfSubject}
              onChange={setWfSubject}
              isRequired
            />
            {editingWorkflow &&
            (editingWorkflow.triggerEvent === 'before_booking' ||
              editingWorkflow.triggerEvent === 'after_booking') ? (
              <NumberInput
                label={
                  editingWorkflow.triggerEvent === 'before_booking'
                    ? 'Horas antes de la cita'
                    : 'Horas después de la cita'
                }
                value={wfOffsetHours}
                min={1}
                max={720}
                isIntegerOnly
                onChange={(val) => setWfOffsetHours(val || 1)}
              />
            ) : null}
            <TextArea
              label="Texto del mensaje"
              description="Variables disponibles: {{client_name}}, {{service_name}}, {{staff_name}}, {{date_label}}, {{time_label}}, {{address}}, {{manage_url}}"
              value={wfMessage}
              onChange={setWfMessage}
              rows={4}
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
                label={controls.isSubmitting ? 'Guardando…' : 'Guardar mensaje'}
                variant="primary"
                icon={<Save size={14} aria-hidden="true" />}
                isLoading={controls.isSubmitting}
                isDisabled={controls.isSubmitting || !wfMessage.trim()}
              />
            </HStack>
          </VStack>
        </form>
      )}
    </FormDialog>

    <FormDialog
      isOpen={Boolean(editingTemplate)}
      onOpenChange={(open) => {
        if (!open) setEditingTemplate(null);
      }}
      title="Nombre de plantilla en Meta"
      subtitle="Solo cámbialo si Meta te pidió registrar esta plantilla con otro nombre."
      width="min(29rem, 96vw)"
    >
      {(controls) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!editingTemplate) return;
            controls.submit(async () => {
              const cleaned = tplNameDraft.trim().toLowerCase();
              if (!/^[a-z0-9_]{2,120}$/.test(cleaned)) {
                return formSubmitError(
                  'Usa solo letras minúsculas, números y guion bajo (_).',
                );
              }
              const result = await onUpdateOfficialTemplate(editingTemplate.triggerKey, {
                templateName: cleaned,
              });
              if (result.ok) {
                setEditingTemplate(null);
                return FORM_SUBMIT_OK;
              }
              return result;
            });
          }}
        >
          <VStack gap={3}>
            <TextInput
              label="Nombre exacto en WhatsApp Manager"
              description="Debe coincidir exactamente con el nombre aprobado en Meta."
              value={tplNameDraft}
              onChange={setTplNameDraft}
              autoCapitalize="none"
              hasAutoCorrect={false}
              hasSpellCheck={false}
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
                isDisabled={controls.isSubmitting || !tplNameDraft.trim()}
              />
            </HStack>
          </VStack>
        </form>
      )}
    </FormDialog>
    </>
  );
}
