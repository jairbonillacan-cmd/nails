'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';
import { Banner } from '@astryxdesign/core/Banner';
import { Check } from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import { AdminAccessGuard } from '@/components/admin/AdminAccessGuard';
import { PageHeader, PageSkeleton } from '@/components/ui';
import { GoogleCalendarSection } from '@/components/admin/integraciones/GoogleCalendarSection';
import { WhatsAppSection } from '@/components/admin/integraciones/WhatsAppSection';
import { PaymentsAnalyticsSection } from '@/components/admin/integraciones/PaymentsAnalyticsSection';
import { parseIntegracionesParams } from '@/lib/admin-links';
import { formatCurrency } from '@/lib/format';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import type {
  CalendarConnection,
  NotificationChannel,
  NotificationWorkflow,
  PaymentMode,
  SalonSettings,
} from '@/lib/types';

function isPaymentMode(value: unknown): value is PaymentMode {
  return (
    value === 'manual_transfer' ||
    value === 'mercadopago' ||
    value === 'stripe' ||
    value === 'none'
  );
}

function extractOptimisticSettingsPatch(
  patch: Record<string, unknown>,
): Partial<SalonSettings> {
  const next: Partial<SalonSettings> = {};
  if (typeof patch.whatsappBookingEnabled === 'boolean') {
    next.whatsappBookingEnabled = patch.whatsappBookingEnabled;
  }
  if (typeof patch.smsRemindersEnabled === 'boolean') {
    next.smsRemindersEnabled = patch.smsRemindersEnabled;
  }
  if (isPaymentMode(patch.paymentMode)) {
    next.paymentMode = patch.paymentMode;
  }
  if (typeof patch.metaPixelId === 'string' || patch.metaPixelId === null) {
    next.metaPixelId = patch.metaPixelId;
  }
  if (typeof patch.ga4MeasurementId === 'string' || patch.ga4MeasurementId === null) {
    next.ga4MeasurementId = patch.ga4MeasurementId;
  }
  if (typeof patch.googleReviewUrl === 'string' || patch.googleReviewUrl === null) {
    next.googleReviewUrl = patch.googleReviewUrl;
  }
  return next;
}

export default function AdminIntegrationsPage() {
  const searchParams = useSearchParams();
  const initialOpenMore = parseIntegracionesParams(searchParams).section === 'resenas';
  const { data, loading, refresh } = useAdminData();
  const [msg, setMsg] = useState<{ status: 'success' | 'error'; text: string } | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [busyCalendarStaffId, setBusyCalendarStaffId] = useState<string | null>(null);
  const [busyWorkflowId, setBusyWorkflowId] = useState<string | null>(null);
  const [optimisticSettings, setOptimisticSettings] = useState<Partial<SalonSettings>>({});
  const [optimisticWorkflows, setOptimisticWorkflows] = useState<
    Record<string, Partial<Pick<NotificationWorkflow, 'isEnabled' | 'channels'>>>
  >({});
  const [optimisticCalendars, setOptimisticCalendars] = useState<
    Record<
      string,
      Partial<Pick<CalendarConnection, 'isConnected' | 'destinationCalendarId' | 'conflictCalendarIds'>>
    >
  >({});
  const saveNotice = useEphemeralMessage(3200);

  const displayWorkflows = useMemo(
    () =>
      data
        ? data.workflows.map((wf) =>
            wf.id in optimisticWorkflows ? { ...wf, ...optimisticWorkflows[wf.id] } : wf,
          )
        : [],
    [data, optimisticWorkflows],
  );

  const displayCalendarConnections = useMemo(
    () =>
      data
        ? data.calendarConnections.map((conn) =>
            conn.staffId in optimisticCalendars
              ? { ...conn, ...optimisticCalendars[conn.staffId] }
              : conn,
          )
        : [],
    [data, optimisticCalendars],
  );

  if (loading || !data) {
    return (
      <PageSkeleton
        kpiCount={0}
        withSplit={false}
        ariaLabel="Cargando conexiones e integraciones"
      />
    );
  }

  const { integration } = data;
  const settings: SalonSettings = { ...data.settings, ...optimisticSettings };
  const depositLabel = formatCurrency(settings.depositAmountCents ?? 20000, settings.currency);
  const timezone = settings.timezone || 'America/Mexico_City';
  const normalizedAppUrl = integration.appUrl.replace(/\/+$/, '');
  const whatsappWebhookUrl = `${normalizedAppUrl}/api/webhooks/whatsapp`;
  const mercadoPagoTechUrl = `${normalizedAppUrl}/api/webhooks/mercadopago`;
  const googleCalendarTechUrl = `${normalizedAppUrl}/api/webhooks/google-calendar`;
  const activeRemindersCount = displayWorkflows.filter((w) => w.isEnabled).length;
  const whatsappUsage = data.whatsappUsage ?? {
    monthKey: data.serverTodayKey.slice(0, 7),
    sentCount: 0,
    quotaLimit: settings.whatsappMonthlyQuota ?? 500,
    percentUsed: 0,
    alertLevel: 'ok' as const,
    warned80At: null,
    warned100At: null,
  };

  const isAnyMutationBusy =
    savingSettings || Boolean(busyWorkflowId) || Boolean(busyCalendarStaffId);

  const toggleReminderChannel = async (
    workflowId: string,
    currentChannels: NotificationChannel[],
    channel: NotificationChannel,
    enabled: boolean,
  ) => {
    if (busyWorkflowId) return;
    const next = enabled
      ? Array.from(new Set([...currentChannels, channel]))
      : currentChannels.filter((c) => c !== channel);
    setBusyWorkflowId(workflowId);
    setOptimisticWorkflows((prev) => ({
      ...prev,
      [workflowId]: { ...prev[workflowId], channels: next },
    }));
    setMsg(null);
    try {
      const res = await fetch('/api/admin/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'workflow', id: workflowId, patch: { channels: next } }),
      });
      if (res.ok) {
        await refresh();
        saveNotice.show('Canal actualizado');
      } else {
        const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
        setMsg({
          status: 'error',
          text: errJson?.error || 'No se pudo actualizar este recordatorio.',
        });
      }
    } catch {
      setMsg({ status: 'error', text: 'Sin conexión. No se pudo actualizar este recordatorio.' });
    } finally {
      setBusyWorkflowId(null);
      setOptimisticWorkflows((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([key]) => key !== workflowId)),
      );
    }
  };

  const saveIntegrationSettings = async (patch: Record<string, unknown>) => {
    if (savingSettings) return;
    const optimisticPatch = extractOptimisticSettingsPatch(patch);
    setSavingSettings(true);
    setOptimisticSettings((prev) => ({ ...prev, ...optimisticPatch }));
    setMsg(null);
    try {
      const res = await fetch('/api/admin/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        await refresh();
        saveNotice.show('Cambios guardados');
      } else {
        const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
        setMsg({
          status: 'error',
          text: errJson?.error || 'No se pudieron guardar los cambios.',
        });
      }
    } catch {
      setMsg({ status: 'error', text: 'Sin conexión. No se pudieron guardar los cambios.' });
    } finally {
      setSavingSettings(false);
      setOptimisticSettings({});
    }
  };

  const patchCalendar = async (
    staffId: string,
    patch: Partial<
      Pick<CalendarConnection, 'isConnected' | 'destinationCalendarId' | 'conflictCalendarIds'>
    >,
  ) => {
    setBusyCalendarStaffId(staffId);
    setOptimisticCalendars((prev) => ({
      ...prev,
      [staffId]: { ...prev[staffId], ...patch },
    }));
    setMsg(null);
    try {
      const res = await fetch('/api/admin/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'calendar', staffId, patch }),
      });
      if (res.ok) {
        await refresh();
        saveNotice.show('Calendario actualizado');
      } else {
        const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
        setMsg({
          status: 'error',
          text: errJson?.error || 'No se pudo actualizar la configuración de Google Calendar.',
        });
      }
    } catch {
      setMsg({ status: 'error', text: 'Sin conexión. No se pudo actualizar Google Calendar.' });
    } finally {
      setBusyCalendarStaffId(null);
      setOptimisticCalendars((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([key]) => key !== staffId)),
      );
    }
  };

  const handleToggleCalendarConnection = async (staffId: string, isConnected: boolean) => {
    if (busyCalendarStaffId) return;
    setBusyCalendarStaffId(staffId);
    setMsg(null);
    try {
      const res = await fetch(`/api/integrations/google?staffId=${encodeURIComponent(staffId)}`);
      if (!res.ok) {
        const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
        setMsg({
          status: 'error',
          text: errJson?.error || 'No se pudo consultar la conexión con Google Calendar.',
        });
        setBusyCalendarStaffId(null);
        return;
      }
      const json = (await res.json().catch(() => null)) as {
        configured?: boolean;
        oauthUrl?: string;
      } | null;
      if (json?.configured && json.oauthUrl && !isConnected) {
        window.location.href = json.oauthUrl;
        return;
      }
    } catch {
      setMsg({ status: 'error', text: 'Sin conexión. No se pudo consultar Google Calendar.' });
      setBusyCalendarStaffId(null);
      return;
    }
    await patchCalendar(staffId, { isConnected: !isConnected });
  };

  return (
    <AdminAccessGuard role={data.session.user.role} section="integrations" sectionLabel="Conexiones">
      <VStack className="ad-page">
        <PageHeader
          title="Conexiones"
          subtitle="Calendario, resumen de WhatsApp y cobro de anticipos."
          meta={
            isAnyMutationBusy ? (
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
        />

        {msg ? (
          <Banner
            status={msg.status}
            role={msg.status === 'error' ? 'alert' : 'status'}
            title={msg.text}
            isDismissable
            onDismiss={() => setMsg(null)}
          />
        ) : null}

        <GoogleCalendarSection
          staff={data.staff}
          calendarConnections={displayCalendarConnections}
          googleCalendarConfigured={integration.googleCalendarConfigured}
          isDemoMode={integration.mode === 'demo'}
          busyCalendarStaffId={busyCalendarStaffId}
          onUpdateDestination={(staffId, destinationCalendarId) =>
            busyCalendarStaffId
              ? Promise.resolve()
              : patchCalendar(staffId, { destinationCalendarId })
          }
          onUpdateConflictCalendars={(staffId, conflictCalendarIds) =>
            busyCalendarStaffId
              ? Promise.resolve()
              : patchCalendar(staffId, { conflictCalendarIds })
          }
          onToggleConnection={handleToggleCalendarConnection}
        />

        <WhatsAppSection
          integration={integration}
          whatsappUsage={whatsappUsage}
          activeRemindersCount={activeRemindersCount}
          inboxSummary={data.whatsappInboxSummary}
        />

        <PaymentsAnalyticsSection
          settings={settings}
          depositLabel={depositLabel}
          isDemoMode={integration.mode === 'demo'}
          initialOpenMore={initialOpenMore}
          mercadoPagoConfigured={integration.mercadoPagoConfigured}
          twilioSmsConfigured={integration.twilioSmsConfigured}
          timezone={timezone}
          whatsappWebhookUrl={whatsappWebhookUrl}
          googleCalendarTechUrl={googleCalendarTechUrl}
          mercadoPagoTechUrl={mercadoPagoTechUrl}
          services={data.services}
          workflows={displayWorkflows}
          notifications={data.notifications}
          savingSettings={savingSettings || Boolean(busyWorkflowId)}
          onSaveSettingsPatch={(patch) => void saveIntegrationSettings(patch)}
          onToggleSmsChannel={(id, channels, enabled) =>
            void toggleReminderChannel(id, channels, 'sms', enabled)
          }
          onRefresh={refresh}
          onBanner={setMsg}
        />
      </VStack>
    </AdminAccessGuard>
  );
}
