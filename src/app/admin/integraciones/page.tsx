'use client';

import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Banner } from '@astryxdesign/core/Banner';
import { useAdminData } from '@/components/admin/AdminProvider';
import { MetricGrid, PageHeader, PageSkeleton } from '@/components/ui';
import { GoogleCalendarSection } from '@/components/admin/integraciones/GoogleCalendarSection';
import { WhatsAppSection } from '@/components/admin/integraciones/WhatsAppSection';
import { PaymentsAnalyticsSection } from '@/components/admin/integraciones/PaymentsAnalyticsSection';
import {
  buildIntegrationKpis,
  buildWhatsAppCopyTemplates,
} from '@/components/admin/integraciones/integrationsHelpers';
import { formatCurrency } from '@/lib/format';
import { summarizeCascadeMetrics } from '@/lib/notifications/cascade';
import type { NotificationChannel } from '@/lib/types';

export default function AdminIntegrationsPage() {
  const { data, loading, refresh } = useAdminData();
  const [msg, setMsg] = useState<{ status: 'success' | 'error'; text: string } | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [busyCalendarStaffId, setBusyCalendarStaffId] = useState<string | null>(null);

  const reminderSummary = useMemo(() => {
    if (!data) return null;
    const referenceDate = new Date(data.serverNowIso);
    return summarizeCascadeMetrics(
      data.bookings,
      data.notifications,
      Number.isNaN(referenceDate.getTime()) ? new Date(0) : referenceDate,
    );
  }, [data]);

  const whatsappTemplates = useMemo(
    () => (data ? buildWhatsAppCopyTemplates(data.settings) : []),
    [data],
  );

  const bookingMetaById = useMemo(() => {
    const map = new Map<string, { clientName: string; serviceName: string }>();
    if (!data) return map;
    for (const bk of data.bookings) {
      map.set(bk.id, { clientName: bk.client.fullName, serviceName: bk.service.name });
    }
    return map;
  }, [data]);

  if (loading || !data) {
    return (
      <PageSkeleton
        kpiCount={3}
        withSplit={false}
        ariaLabel="Cargando conexiones e integraciones"
      />
    );
  }

  const { integration, settings } = data;
  const depositLabel = formatCurrency(settings.depositAmountCents ?? 20000, settings.currency);
  const timezone = settings.timezone || 'America/Mexico_City';
  const normalizedAppUrl = integration.appUrl.replace(/\/+$/, '');
  const mercadoPagoTechUrl = `${normalizedAppUrl}/api/webhooks/mercadopago`;
  const googleCalendarTechUrl = `${normalizedAppUrl}/api/webhooks/google-calendar`;
  const connectedCalendarsCount = data.calendarConnections.filter((c) => c.isConnected).length;
  const whatsappUsage = data.whatsappUsage ?? {
    monthKey: data.serverTodayKey.slice(0, 7),
    sentCount: 0,
    quotaLimit: settings.whatsappMonthlyQuota ?? 500,
    percentUsed: 0,
    alertLevel: 'ok' as const,
    warned80At: null,
    warned100At: null,
  };

  const kpiItems = buildIntegrationKpis({
    connectedCalendarsCount,
    totalStaffCount: data.staff.length,
    whatsappUsage,
    settings,
    depositLabel,
  });

  const toggleReminderChannel = async (
    workflowId: string,
    currentChannels: NotificationChannel[],
    channel: NotificationChannel,
    enabled: boolean,
  ) => {
    const next = enabled
      ? Array.from(new Set([...currentChannels, channel]))
      : currentChannels.filter((c) => c !== channel);
    const res = await fetch('/api/admin/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'workflow', id: workflowId, patch: { channels: next } }),
    });
    if (res.ok) {
      await refresh();
    } else {
      setMsg({ status: 'error', text: 'No se pudo actualizar este recordatorio.' });
    }
  };

  const toggleWorkflowEnabled = async (workflowId: string, enabled: boolean) => {
    const res = await fetch('/api/admin/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'workflow', id: workflowId, patch: { isEnabled: enabled } }),
    });
    if (res.ok) {
      await refresh();
    } else {
      setMsg({ status: 'error', text: 'No se pudo actualizar este aviso.' });
    }
  };

  const saveIntegrationSettings = async (patch: Record<string, unknown>) => {
    setSavingSettings(true);
    try {
      const res = await fetch('/api/admin/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        setMsg({ status: 'success', text: 'Cambios guardados.' });
        await refresh();
      } else {
        setMsg({ status: 'error', text: 'No se pudieron guardar los cambios.' });
      }
    } finally {
      setSavingSettings(false);
    }
  };

  const patchCalendar = async (staffId: string, patch: Record<string, unknown>) => {
    await fetch('/api/admin/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'calendar', staffId, patch }),
    });
    await refresh();
  };

  const handleToggleCalendarConnection = async (staffId: string, isConnected: boolean) => {
    setBusyCalendarStaffId(staffId);
    try {
      const res = await fetch(`/api/integrations/google?staffId=${staffId}`);
      const json = (await res.json().catch(() => null)) as {
        configured?: boolean;
        oauthUrl?: string;
      } | null;
      if (json?.configured && json.oauthUrl && !isConnected) {
        window.location.href = json.oauthUrl;
        return;
      }
      await patchCalendar(staffId, { isConnected: !isConnected });
    } finally {
      setBusyCalendarStaffId(null);
    }
  };

  return (
    <VStack className="ad-page">
      <PageHeader
        eyebrow="Herramientas del salón"
        title="Conexiones"
        subtitle="Conecta tu calendario, automatiza recordatorios por WhatsApp y elige cómo cobrar anticipos."
      />

      <MetricGrid ariaLabel="Resumen de conexiones" items={kpiItems} cols={3} />

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
        calendarConnections={data.calendarConnections}
        busyCalendarStaffId={busyCalendarStaffId}
        onUpdateDestination={(staffId, destinationCalendarId) =>
          patchCalendar(staffId, { destinationCalendarId })
        }
        onUpdateConflictCalendars={(staffId, conflictCalendarIds) =>
          patchCalendar(staffId, { conflictCalendarIds })
        }
        onToggleConnection={handleToggleCalendarConnection}
      />

      <WhatsAppSection
        whatsappBookingEnabled={settings.whatsappBookingEnabled}
        whatsappUsage={whatsappUsage}
        reminderSummary={reminderSummary}
        bookingMetaById={bookingMetaById}
        timezone={timezone}
        workflows={data.workflows}
        copyableTemplates={whatsappTemplates}
        officialTemplates={data.whatsappTemplates ?? []}
        onToggleWhatsappBooking={(v) => void saveIntegrationSettings({ whatsappBookingEnabled: v })}
        onToggleWorkflowEnabled={(id, checked) => void toggleWorkflowEnabled(id, checked)}
        onToggleReminderChannel={(id, channels, channel, enabled) =>
          void toggleReminderChannel(id, channels, channel, enabled)
        }
      />

      <PaymentsAnalyticsSection
        settings={settings}
        depositLabel={depositLabel}
        mercadoPagoConfigured={integration.mercadoPagoConfigured}
        googleCalendarTechUrl={googleCalendarTechUrl}
        mercadoPagoTechUrl={mercadoPagoTechUrl}
        services={data.services}
        workflows={data.workflows}
        notifications={data.notifications}
        savingSettings={savingSettings}
        onSaveSettingsPatch={(patch) => void saveIntegrationSettings(patch)}
        onToggleSmsChannel={(id, channels, enabled) =>
          void toggleReminderChannel(id, channels, 'sms', enabled)
        }
        onRefresh={refresh}
        onBanner={setMsg}
      />
    </VStack>
  );
}
