'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Switch } from '@astryxdesign/core/Switch';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  MessageCircle,
  Sparkles,
} from 'lucide-react';
import {
  ActionRow,
  CopyableField,
  StatusTag,
  SurfaceCard,
} from '@/components/ui';
import { formatDateShortInTimezone, formatTimeInTimezone } from '@/lib/format';
import type { summarizeCascadeMetrics } from '@/lib/notifications/cascade';
import type {
  NotificationChannel,
  NotificationWorkflow,
  WhatsAppMonthlyUsageSummary,
  WhatsAppTemplateConfig,
  WhatsAppTemplateTriggerKey,
} from '@/lib/types';

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
}

const FRIENDLY_WHATSAPP_TEMPLATE_LABELS: Record<
  WhatsAppTemplateTriggerKey,
  { title: string; subtitle: string }
> = {
  booking_confirmed: {
    title: 'Confirmación de cita',
    subtitle: 'Se envía cuando apartan o confirmas su horario.',
  },
  reminder_24h: {
    title: 'Recordatorio 24 horas antes',
    subtitle: 'Recuerda la cita un día antes para reducir faltas.',
  },
  reminder_2h: {
    title: 'Recordatorio 2 horas antes',
    subtitle: 'Comparte la dirección del estudio antes de salir.',
  },
  booking_rescheduled: {
    title: 'Cita reagendada',
    subtitle: 'Confirma el nuevo día y hora elegidos.',
  },
  booking_canceled: {
    title: 'Cita cancelada',
    subtitle: 'Confirma la cancelación y liberación del espacio.',
  },
  waitlist_offer: {
    title: 'Espacio libre en lista de espera',
    subtitle: 'Avisa a la siguiente clienta cuando se libera un turno.',
  },
};

export function WhatsAppSection({
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
}: WhatsAppSectionProps) {
  const activeRemindersCount = workflows.filter((w) => w.isEnabled).length;
  const whatsappRemaining = Math.max(0, whatsappUsage.quotaLimit - whatsappUsage.sentCount);
  const activeOfficialCount = officialTemplates.filter((tpl) => tpl.isActive).length;

  return (
    <SurfaceCard
      id="whatsapp-reminders-heading"
      icon={<MessageCircle size={18} aria-hidden="true" />}
      title="Recordatorios por WhatsApp"
      subtitle="Envía avisos automáticos 24 h y 2 h antes de cada cita para reducir faltas sin escribir uno por uno."
      badge={
        <StatusTag
          tone={activeRemindersCount > 0 ? 'success' : 'neutral'}
          label={`${activeRemindersCount} avisos activos`}
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
              description={`Te quedan ${whatsappRemaining} avisos automáticos. Si llegas a ${whatsappUsage.quotaLimit}, las confirmaciones seguirán llegando por correo y podrás abrir WhatsApp en un toque.`}
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
                  label="Ver en Citas"
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
                            <Button label="Abrir" variant="ghost" size="sm" href="/admin/citas" />
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
                  title={wf.name}
                  subtitle={wf.messageTemplate}
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
                    <Switch
                      label={`Activar ${wf.name}`}
                      isLabelHidden
                      size="sm"
                      value={wf.isEnabled}
                      onChange={(checked) => onToggleWorkflowEnabled(wf.id, checked)}
                    />
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
              <Sparkles size={14} aria-hidden="true" />
              <Text weight="semibold" size="sm">
                Mensajes de WhatsApp listos para copiar ({copyableTemplates.length})
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
                    Plantillas oficiales aprobadas de WhatsApp ({activeOfficialCount})
                  </Text>
                </HStack>
                <StatusTag
                  tone={activeOfficialCount > 0 ? 'success' : 'neutral'}
                  label="Español (México)"
                />
              </HStack>
            }
          >
            <SurfaceCard>
              <VStack as="ul" className="ad-row-list" gap={0}>
                {officialTemplates.map((tpl) => {
                  const meta = FRIENDLY_WHATSAPP_TEMPLATE_LABELS[tpl.triggerKey];
                  return (
                    <li key={tpl.id}>
                      <ActionRow
                        title={meta?.title ?? 'Aviso automático de WhatsApp'}
                        subtitle={meta?.subtitle ?? 'Mensaje oficial aprobado para avisos de citas.'}
                        isMuted={!tpl.isActive}
                        status={
                          <StatusTag
                            tone={tpl.isActive ? 'success' : 'neutral'}
                            showDot={tpl.isActive}
                            label={tpl.isActive ? 'Activa' : 'Pausada'}
                          />
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
  );
}
