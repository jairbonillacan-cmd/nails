'use client';

import { useState, type ReactNode } from 'react';
import type { z } from 'zod';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Switch } from '@astryxdesign/core/Switch';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Token } from '@astryxdesign/core/Token';
import {
  Bell,
  CalendarCheck2,
  CalendarClock,
  CalendarX2,
  Clock,
  MessageCircle,
  Pencil,
  Save,
  Send,
  Sparkles,
  Star,
} from 'lucide-react';
import {
  EmptyStateCard,
  StatusTag,
  SurfaceCard,
  type StatusTagTone,
} from '@/components/ui';
import { FormDialog } from '@/components/ui/FormDialog';
import type { WhatsAppRemindersActionSchema } from '@/lib/contracts';
import { FORM_SUBMIT_OK, formSubmitError } from '@/lib/forms/form-submit';
import {
  buildTemplatePreview,
  describeWorkflowMoment,
  type TemplatePreviewSegment,
} from '@/lib/notifications/template-preview';
import {
  canonicalizeWhatsAppPhoneE164,
  getWhatsAppTemplateCatalogItem,
  inferReminderTriggerKey,
} from '@/lib/notifications/whatsapp-inbox';
import type { AdminRole, NotificationChannel, NotificationWorkflow } from '@/lib/types';

type WhatsAppRemindersActionInput = z.infer<typeof WhatsAppRemindersActionSchema>;

interface WhatsAppAutomationCardsProps {
  workflows: NotificationWorkflow[];
  role: AdminRole;
  studioName: string;
  isSubmitting: boolean;
  onRunAction: (action: WhatsAppRemindersActionInput) => Promise<boolean>;
}

interface WorkflowPresentation {
  order: number;
  title: string;
  description: string;
  ruleLabel: string;
  ruleTone: StatusTagTone;
  icon: ReactNode;
}

const DEFAULT_SAMPLE_ADDRESS = 'Calle 25 Sur 1904, Col. Volcanes, Puebla, Pue.';

function formatOffsetBadge(minutes: number, direction: 'before' | 'after'): string {
  const abs = Math.max(1, Math.abs(minutes));
  const suffix = direction === 'before' ? 'antes' : 'después';
  if (abs >= 1440 && abs % 1440 === 0) {
    const days = abs / 1440;
    return `${days} ${days === 1 ? 'día' : 'días'} ${suffix}`;
  }
  if (abs >= 60 && abs % 60 === 0) {
    const hours = abs / 60;
    return `${hours} h ${suffix}`;
  }
  return `${abs} min ${suffix}`;
}

function getWorkflowPresentation(wf: NotificationWorkflow): WorkflowPresentation {
  switch (wf.triggerEvent) {
    case 'booking_created':
      return {
        order: 1,
        title: 'Confirmación al apartar',
        description: 'Se envía en cuanto la clienta reserva su espacio con resumen y enlace.',
        ruleLabel: 'Inmediato',
        ruleTone: 'info',
        icon: <CalendarCheck2 size={16} aria-hidden="true" />,
      };
    case 'booking_confirmed':
      return {
        order: 2,
        title: 'Anticipo y cita confirmada',
        description: 'Confirma la aprobación del anticipo o la confirmación manual de su bloque.',
        ruleLabel: 'Al confirmar',
        ruleTone: 'success',
        icon: <CalendarCheck2 size={16} aria-hidden="true" />,
      };
    case 'before_booking':
      if (wf.offsetMinutes >= 720) {
        return {
          order: 3,
          title: 'Recordatorio 24 h (asistencia)',
          description: 'Recuerda la cita un día antes con botones rápidos de Confirmo o Reagendar.',
          ruleLabel: `${formatOffsetBadge(wf.offsetMinutes, 'before')} · Cascada`,
          ruleTone: 'accent',
          icon: <Bell size={16} aria-hidden="true" />,
        };
      }
      return {
        order: 4,
        title: 'Recordatorio 2 h antes',
        description: 'Envía ubicación y tolerancia de 15 min (se omite si ya confirmó antes).',
        ruleLabel: `${formatOffsetBadge(wf.offsetMinutes, 'before')} · Ahorro`,
        ruleTone: 'accent',
        icon: <Clock size={16} aria-hidden="true" />,
      };
    case 'after_booking':
      if (wf.offsetMinutes >= 1440) {
        return {
          order: 6,
          title: 'Invitación de retoque',
          description: 'Invita a agendar retoque con fecha sugerida al acercarse las 3 semanas.',
          ruleLabel: formatOffsetBadge(wf.offsetMinutes, 'after'),
          ruleTone: 'info',
          icon: <Sparkles size={16} aria-hidden="true" />,
        };
      }
      return {
        order: 5,
        title: 'Encuesta post-cita y reseña',
        description: 'Agradece la visita e invita a calificar el servicio y dejar reseña en Google.',
        ruleLabel: formatOffsetBadge(wf.offsetMinutes, 'after'),
        ruleTone: 'info',
        icon: <Star size={16} aria-hidden="true" />,
      };
    case 'booking_rescheduled':
      return {
        order: 7,
        title: 'Aviso de cita reagendada',
        description: 'Confirma el nuevo día, hora y enlace actualizado sin fricción.',
        ruleLabel: 'Al cambiar hora',
        ruleTone: 'warning',
        icon: <CalendarClock size={16} aria-hidden="true" />,
      };
    case 'booking_canceled':
      return {
        order: 8,
        title: 'Aviso de cita cancelada',
        description: 'Confirma que el espacio quedó liberado e invita a volver a agendar.',
        ruleLabel: 'Al cancelar',
        ruleTone: 'neutral',
        icon: <CalendarX2 size={16} aria-hidden="true" />,
      };
  }
}

function renderPreviewSegments(segments: readonly TemplatePreviewSegment[]): ReactNode {
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

function flattenPreviewSegments(segments: readonly TemplatePreviewSegment[]): string {
  return segments.map((segment) => segment.text).join('');
}

function channelLabel(channel: NotificationChannel): string {
  if (channel === 'whatsapp') return 'WhatsApp';
  if (channel === 'sms') return 'SMS';
  return 'Correo';
}

export function WhatsAppAutomationCards({
  workflows,
  role,
  studioName,
  isSubmitting,
  onRunAction,
}: WhatsAppAutomationCardsProps) {
  const [busyWorkflowId, setBusyWorkflowId] = useState<string | null>(null);
  const [editingWorkflow, setEditingWorkflow] = useState<NotificationWorkflow | null>(null);
  const [subjectDraft, setSubjectDraft] = useState('');
  const [messageDraft, setMessageDraft] = useState('');
  const [offsetHoursDraft, setOffsetHoursDraft] = useState(24);
  const [channelsDraft, setChannelsDraft] = useState<NotificationChannel[]>(['whatsapp']);

  const [testingWorkflow, setTestingWorkflow] = useState<NotificationWorkflow | null>(null);
  const [testPhoneDraft, setTestPhoneDraft] = useState('');

  const isOwner = role === 'owner';
  const canToggle = role === 'owner' || role === 'admin';
  const activeCount = workflows.filter((wf) => wf.isEnabled).length;

  const sortedWorkflows = workflows.toSorted((a, b) => {
    const orderA = getWorkflowPresentation(a).order;
    const orderB = getWorkflowPresentation(b).order;
    if (orderA !== orderB) return orderA - orderB;
    return a.offsetMinutes - b.offsetMinutes;
  });

  const handleToggleEnabled = async (wf: NotificationWorkflow, enabled: boolean) => {
    if (!canToggle || isSubmitting || busyWorkflowId) return;
    setBusyWorkflowId(wf.id);
    try {
      await onRunAction({
        action: 'toggle_workflow',
        workflowId: wf.id,
        isEnabled: enabled,
      });
    } finally {
      setBusyWorkflowId(null);
    }
  };

  const handleToggleChannel = async (
    wf: NotificationWorkflow,
    channel: NotificationChannel,
    enabled: boolean,
  ) => {
    if (!isOwner || isSubmitting || busyWorkflowId) return;
    const nextChannels = enabled
      ? Array.from(new Set<NotificationChannel>([...wf.channels, channel]))
      : wf.channels.filter((item) => item !== channel);
    if (nextChannels.length === 0) return;

    setBusyWorkflowId(wf.id);
    try {
      await onRunAction({
        action: 'update_workflow',
        workflowId: wf.id,
        patch: { channels: nextChannels },
      });
    } finally {
      setBusyWorkflowId(null);
    }
  };

  const openEditor = (wf: NotificationWorkflow) => {
    setEditingWorkflow(wf);
    setSubjectDraft(wf.subjectTemplate);
    setMessageDraft(wf.messageTemplate);
    setOffsetHoursDraft(Math.max(1, Math.round((wf.offsetMinutes || 60) / 60)));
    setChannelsDraft(wf.channels.length > 0 ? [...wf.channels] : ['whatsapp']);
  };

  const openTestDialog = (wf: NotificationWorkflow) => {
    setTestingWorkflow(wf);
    setTestPhoneDraft('+522224123987');
  };

  const toggleDraftChannel = (channel: NotificationChannel, checked: boolean) => {
    setChannelsDraft((prev) => {
      const next = checked
        ? Array.from(new Set<NotificationChannel>([...prev, channel]))
        : prev.filter((item) => item !== channel);
      return next.length > 0 ? next : prev;
    });
  };

  const testingPreviewSegments = testingWorkflow
    ? buildTemplatePreview(testingWorkflow.messageTemplate, {
        salonName: studioName,
        address: DEFAULT_SAMPLE_ADDRESS,
      })
    : [];

  return (
    <>
      <SurfaceCard
        id="wa-automations-heading"
        icon={<MessageCircle size={17} aria-hidden="true" />}
        title="Automatizaciones y recordatorios"
        subtitle="Controla cada aviso automático que sale por WhatsApp y correo antes o después de cada cita."
        badge={
          <StatusTag
            tone={activeCount > 0 ? 'success' : 'neutral'}
            showDot={activeCount > 0}
            label={`${activeCount} de ${workflows.length} activas`}
            hasTabularNumbers
          />
        }
      >
        {sortedWorkflows.length === 0 ? (
          <VStack padding={5}>
            <EmptyStateCard
              framed={false}
              isCompact
              icon={<Bell size={20} aria-hidden="true" />}
              title="Sin automatizaciones configuradas"
              description="Cuando existan flujos de recordatorios en el estudio, podrás controlarlos desde aquí."
            />
          </VStack>
        ) : (
          <VStack className="ad-card-body" gap={0} paddingBlockStart={4}>
            <section aria-label="Automatizaciones de WhatsApp" className="ad-wa-auto-grid">
            {sortedWorkflows.map((wf) => {
              const meta = getWorkflowPresentation(wf);
              const isBusy = busyWorkflowId === wf.id;
              const triggerKey = inferReminderTriggerKey(wf, {
                triggerKey: null,
                subject: wf.subjectTemplate,
                scheduledFor: '',
              });
              const templateSpec = triggerKey ? getWhatsAppTemplateCatalogItem(triggerKey) : null;
              const previewSegments = buildTemplatePreview(wf.messageTemplate, {
                salonName: studioName,
                address: DEFAULT_SAMPLE_ADDRESS,
              });

              return (
                <SurfaceCard
                  key={wf.id}
                  tone={wf.isEnabled ? 'default' : 'subtle'}
                  padded
                  headingLevel={3}
                  className={isBusy ? 'fx-busy' : undefined}
                >
                  <VStack gap={3} style={{ height: '100%', minWidth: 0 }}>
                    <HStack justify="between" align="start" gap={2}>
                      <HStack gap={2} align="start" style={{ minWidth: 0, flex: '1 1 0%' }}>
                        <VStack
                          className="ad-task-icon"
                          data-tone={wf.isEnabled ? 'accent' : undefined}
                          align="center"
                          justify="center"
                          aria-hidden="true"
                        >
                          {meta.icon}
                        </VStack>
                        <VStack gap={0.5} style={{ minWidth: 0, flex: '1 1 0%' }}>
                          <Text weight="semibold" size="base">
                            {meta.title}
                          </Text>
                          <Text type="supporting" color="secondary" textWrap="pretty">
                            {meta.description}
                          </Text>
                        </VStack>
                      </HStack>
                      <Switch
                        label={`Activar ${meta.title}`}
                        isLabelHidden
                        size="sm"
                        value={wf.isEnabled}
                        isLoading={isBusy}
                        isDisabled={!canToggle || isSubmitting || (Boolean(busyWorkflowId) && !isBusy)}
                        onChange={(checked) => void handleToggleEnabled(wf, checked)}
                      />
                    </HStack>

                    <HStack gap={1.5} align="center" wrap="wrap">
                      <StatusTag tone={meta.ruleTone} label={meta.ruleLabel} />
                      <StatusTag
                        tone={wf.isEnabled ? 'success' : 'neutral'}
                        label={wf.isEnabled ? 'Activa' : 'Pausada'}
                      />
                      {templateSpec ? (
                        <Token size="sm" label={templateSpec.defaultTemplateName} />
                      ) : null}
                    </HStack>

                    {renderPreviewSegments(previewSegments)}

                    <HStack
                      justify="between"
                      align="center"
                      gap={2}
                      wrap="wrap"
                      style={{ marginTop: 'auto' }}
                    >
                      {isOwner ? (
                        <HStack gap={3} align="center" wrap="wrap">
                          <CheckboxInput
                            size="sm"
                            label="WhatsApp"
                            value={wf.channels.includes('whatsapp')}
                            isDisabled={
                              isBusy ||
                              isSubmitting ||
                              (wf.channels.length === 1 && wf.channels.includes('whatsapp'))
                            }
                            onChange={(checked) =>
                              void handleToggleChannel(wf, 'whatsapp', checked)
                            }
                          />
                          <CheckboxInput
                            size="sm"
                            label="Correo"
                            value={wf.channels.includes('email')}
                            isDisabled={
                              isBusy ||
                              isSubmitting ||
                              (wf.channels.length === 1 && wf.channels.includes('email'))
                            }
                            onChange={(checked) => void handleToggleChannel(wf, 'email', checked)}
                          />
                        </HStack>
                      ) : (
                        <HStack gap={1.5} align="center" wrap="wrap">
                          {wf.channels.map((ch) => (
                            <StatusTag key={ch} tone="neutral" label={channelLabel(ch)} />
                          ))}
                        </HStack>
                      )}

                      <HStack gap={1.5} align="center" wrap="wrap">
                        <Button
                          type="button"
                          label="Probar envío"
                          variant="secondary"
                          size="sm"
                          icon={<Send size={13} aria-hidden="true" />}
                          isDisabled={isBusy || isSubmitting}
                          onClick={() => openTestDialog(wf)}
                        />
                        {isOwner ? (
                          <Button
                            type="button"
                            label="Editar"
                            variant="ghost"
                            size="sm"
                            icon={<Pencil size={13} aria-hidden="true" />}
                            isDisabled={isBusy || isSubmitting}
                            onClick={() => openEditor(wf)}
                          />
                        ) : null}
                      </HStack>
                    </HStack>
                  </VStack>
                </SurfaceCard>
              );
            })}
            </section>
          </VStack>
        )}
      </SurfaceCard>

      <FormDialog
        isOpen={Boolean(editingWorkflow)}
        onOpenChange={(open) => {
          if (!open) setEditingWorkflow(null);
        }}
        title={
          editingWorkflow
            ? `Editar automatización · ${describeWorkflowMoment(editingWorkflow)}`
            : 'Editar automatización'
        }
        subtitle="Personaliza cuándo se envía, los canales activos y el texto que verán tus clientas."
        width="min(34rem, 96vw)"
      >
        {(controls) => (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!editingWorkflow) return;
              controls.submit(async () => {
                if (!messageDraft.trim()) {
                  return formSubmitError('Escribe el texto del mensaje antes de guardar.');
                }
                if (channelsDraft.length === 0) {
                  return formSubmitError('Selecciona al menos un canal de envío.');
                }
                const hasOffset =
                  editingWorkflow.triggerEvent === 'before_booking' ||
                  editingWorkflow.triggerEvent === 'after_booking';
                const ok = await onRunAction({
                  action: 'update_workflow',
                  workflowId: editingWorkflow.id,
                  patch: {
                    subjectTemplate: subjectDraft.trim(),
                    messageTemplate: messageDraft.trim(),
                    channels: channelsDraft,
                    ...(hasOffset
                      ? { offsetMinutes: Math.max(15, Math.round(offsetHoursDraft * 60)) }
                      : {}),
                  },
                });
                if (!ok) {
                  return formSubmitError('No se pudo guardar la automatización. Intenta de nuevo.');
                }
                setEditingWorkflow(null);
                return FORM_SUBMIT_OK;
              });
            }}
          >
            <VStack gap={3}>
              <TextInput
                label="Asunto (correo y resumen)"
                value={subjectDraft}
                onChange={setSubjectDraft}
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
                  description="Ejemplo: 24 h = 1 día antes · 432 h = 18 días después"
                  value={offsetHoursDraft}
                  min={1}
                  max={720}
                  isIntegerOnly
                  onChange={(value) => setOffsetHoursDraft(value || 1)}
                />
              ) : null}

              <VStack gap={1.5}>
                <Text size="sm" weight="semibold">
                  Canales habilitados
                </Text>
                <HStack gap={4} wrap="wrap">
                  <CheckboxInput
                    size="sm"
                    label="WhatsApp"
                    value={channelsDraft.includes('whatsapp')}
                    isDisabled={
                      channelsDraft.length === 1 && channelsDraft.includes('whatsapp')
                    }
                    onChange={(checked) => toggleDraftChannel('whatsapp', checked)}
                  />
                  <CheckboxInput
                    size="sm"
                    label="Correo electrónico"
                    value={channelsDraft.includes('email')}
                    isDisabled={channelsDraft.length === 1 && channelsDraft.includes('email')}
                    onChange={(checked) => toggleDraftChannel('email', checked)}
                  />
                </HStack>
              </VStack>

              <TextArea
                label="Texto del mensaje"
                description="Variables: {{client_name}}, {{service_name}}, {{staff_name}}, {{date_label}}, {{time_label}}, {{address}}, {{manage_url}}"
                value={messageDraft}
                onChange={setMessageDraft}
                rows={4}
                isRequired
              />

              <VStack gap={1}>
                <Text type="supporting" color="secondary" weight="semibold">
                  Vista previa con datos de ejemplo
                </Text>
                {renderPreviewSegments(
                  buildTemplatePreview(messageDraft, {
                    salonName: studioName,
                    address: DEFAULT_SAMPLE_ADDRESS,
                  }),
                )}
              </VStack>

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
                  label={controls.isSubmitting ? 'Guardando…' : 'Guardar cambios'}
                  variant="primary"
                  icon={<Save size={14} aria-hidden="true" />}
                  isLoading={controls.isSubmitting}
                  isDisabled={controls.isSubmitting || !messageDraft.trim()}
                />
              </HStack>
            </VStack>
          </form>
        )}
      </FormDialog>

      <FormDialog
        isOpen={Boolean(testingWorkflow)}
        onOpenChange={(open) => {
          if (!open) setTestingWorkflow(null);
        }}
        title={
          testingWorkflow
            ? `Probar envío · ${getWorkflowPresentation(testingWorkflow).title}`
            : 'Probar envío'
        }
        subtitle="Envía un recordatorio de prueba a tu número o a un teléfono de prueba."
        width="min(31rem, 96vw)"
      >
        {(controls) => (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!testingWorkflow) return;
              controls.submit(async () => {
                const canonical = canonicalizeWhatsAppPhoneE164(testPhoneDraft);
                if (!canonical) {
                  return formSubmitError('Escribe un número de WhatsApp válido de 10 dígitos.');
                }
                const triggerKey = inferReminderTriggerKey(testingWorkflow, {
                  triggerKey: null,
                  subject: testingWorkflow.subjectTemplate,
                  scheduledFor: '',
                });
                const ok = await onRunAction({
                  action: 'send_test_reminder',
                  workflowId: testingWorkflow.id,
                  ...(triggerKey ? { triggerKey } : {}),
                  toPhone: canonical,
                  messagePreview: flattenPreviewSegments(testingPreviewSegments),
                });
                if (!ok) {
                  return formSubmitError('No se pudo enviar el recordatorio de prueba.');
                }
                setTestingWorkflow(null);
                return FORM_SUBMIT_OK;
              });
            }}
          >
            <VStack gap={3}>
              <TextInput
                label="WhatsApp de destino"
                placeholder="+52 222 412 3987"
                description="En modo demo se registrará de inmediato en Mensajes y en el historial."
                value={testPhoneDraft}
                onChange={setTestPhoneDraft}
                isRequired
              />
              <VStack gap={1}>
                <Text type="supporting" color="secondary" weight="semibold">
                  Mensaje que se enviará
                </Text>
                {renderPreviewSegments(testingPreviewSegments)}
              </VStack>
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
                  label={controls.isSubmitting ? 'Enviando prueba…' : 'Enviar prueba'}
                  variant="primary"
                  icon={<Send size={14} aria-hidden="true" />}
                  isLoading={controls.isSubmitting}
                  isDisabled={controls.isSubmitting || testPhoneDraft.replace(/\D/g, '').length < 8}
                />
              </HStack>
            </VStack>
          </form>
        )}
      </FormDialog>
    </>
  );
}
