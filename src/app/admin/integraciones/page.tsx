'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import {
  integracionesHref,
  parseIntegracionesParams,
  type IntegracionesLinkParams,
} from '@/lib/admin-links';
import { formatCurrency } from '@/lib/format';
import { invalidateAdminDomain } from '@/lib/hooks/useAdminCache';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import { useFocusScroll } from '@/lib/hooks/useFocusScroll';
import { fetchJsonWithTimeout } from '@/lib/http/client-fetch';
import { roleCanAccess } from '@/lib/rbac';
import type {
  CalendarConnection,
  NotificationChannel,
  NotificationWorkflow,
  SalonSettings,
} from '@/lib/types';

function resolveIntegracionesFocusId(parsed: IntegracionesLinkParams): string | null {
  const token = (parsed.focus ?? parsed.tab ?? parsed.section ?? '').trim().toLowerCase();
  if (!token) return null;
  if (
    token === 'google' ||
    token === 'gcal' ||
    token === 'calendar' ||
    token === 'calendario'
  ) {
    return 'gcal-heading';
  }
  if (token === 'whatsapp' || token === 'recordatorios') {
    return 'whatsapp-reminders-heading';
  }
  if (
    token === 'cobro' ||
    token === 'pagos' ||
    token === 'mercadopago' ||
    token === 'resenas' ||
    token === 'analytics' ||
    token === 'sms' ||
    token === 'webhooks' ||
    token === 'more'
  ) {
    return 'payments-heading';
  }
  return null;
}

function shouldOpenAdvancedIntegraciones(parsed: IntegracionesLinkParams): boolean {
  const token = (parsed.focus ?? parsed.tab ?? parsed.section ?? '').trim().toLowerCase();
  return (
    token === 'resenas' ||
    token === 'analytics' ||
    token === 'sms' ||
    token === 'webhooks' ||
    token === 'more'
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const parsed = parseIntegracionesParams(searchParams);
  const initialOpenMore = shouldOpenAdvancedIntegraciones(parsed);
  const focusTargetId = resolveIntegracionesFocusId(parsed);
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
  const handledGoogleParamRef = useRef<string | null>(null);

  useExternalSync(`integraciones-google|${parsed.google ?? ''}`, async (signal) => {
    if (signal.aborted || !parsed.google) return;
    if (handledGoogleParamRef.current === parsed.google) return;
    handledGoogleParamRef.current = parsed.google;
    setMsg(
      parsed.google === 'connected'
        ? {
            status: 'success',
            text: 'Google Calendar conectado correctamente.',
          }
        : {
            status: 'error',
            text: 'No se pudo completar la conexión con Google Calendar. Intenta de nuevo.',
          },
    );
    router.replace(
      integracionesHref({
        ...(parsed.tab ? { tab: parsed.tab } : {}),
        ...(parsed.focus ? { focus: parsed.focus } : {}),
        ...(parsed.section ? { section: parsed.section } : {}),
      }),
      { scroll: false },
    );
  });

  useFocusScroll(focusTargetId, Boolean(data));

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
  const depositLabel = formatCurrency(settings.depositAmountCents ?? 0, settings.currency);
  const timezone = settings.timezone || 'America/Mexico_City';
  const normalizedAppUrl = integration.appUrl.replace(/\/+$/, '');
  const mercadoPagoTechUrl = `${normalizedAppUrl}/api/webhooks/mercadopago`;
  const googleCalendarTechUrl = `${normalizedAppUrl}/api/webhooks/google-calendar`;
  const activeRemindersCount = displayWorkflows.filter((w) => w.isEnabled).length;
  const canAccessSettings = roleCanAccess(data.session.user.role, 'settings');
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
      const result = await fetchJsonWithTimeout('/api/admin/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'workflow', id: workflowId, patch: { channels: next } }),
      });
      if (result.ok) {
        invalidateAdminDomain('whatsapp', 'settings');
        await refresh();
        saveNotice.show('Canal actualizado');
      } else {
        setMsg({
          status: 'error',
          text: result.error || 'No se pudo actualizar este recordatorio.',
        });
      }
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
      const result = await fetchJsonWithTimeout('/api/admin/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (result.ok) {
        invalidateAdminDomain('settings');
        await refresh();
        saveNotice.show('Cambios guardados');
      } else {
        setMsg({
          status: 'error',
          text: result.error || 'No se pudieron guardar los cambios.',
        });
      }
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
      const result = await fetchJsonWithTimeout('/api/admin/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'calendar', staffId, patch }),
      });
      if (result.ok) {
        invalidateAdminDomain('availability', 'settings');
        await refresh();
        saveNotice.show('Calendario actualizado');
      } else {
        setMsg({
          status: 'error',
          text: result.error || 'No se pudo actualizar la configuración de Google Calendar.',
        });
      }
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
    const result = await fetchJsonWithTimeout<{ configured?: boolean; oauthUrl?: string }>(
      `/api/integrations/google?staffId=${encodeURIComponent(staffId)}`,
    );
    if (!result.ok) {
      setMsg({
        status: 'error',
        text: result.error || 'No se pudo consultar la conexión con Google Calendar.',
      });
      setBusyCalendarStaffId(null);
      return;
    }
    if (result.data.configured && result.data.oauthUrl && !isConnected) {
      window.location.href = result.data.oauthUrl;
      return;
    }
    await patchCalendar(staffId, { isConnected: !isConnected });
  };

  return (
    <AdminAccessGuard role={data.session.user.role} section="integrations" sectionLabel="Conexiones">
      <VStack className="ad-page">
        <PageHeader
          title="Conexiones"
          subtitle="Calendario, resumen de WhatsApp y estado de integraciones."
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
            collapsible={false}
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
          key={initialOpenMore ? 'more-open' : 'more-default'}
          settings={settings}
          depositLabel={depositLabel}
          canAccessSettings={canAccessSettings}
          initialOpenMore={initialOpenMore}
          mercadoPagoConfigured={integration.mercadoPagoConfigured}
          twilioSmsConfigured={integration.twilioSmsConfigured}
          timezone={timezone}
          googleCalendarTechUrl={googleCalendarTechUrl}
          mercadoPagoTechUrl={mercadoPagoTechUrl}
          workflows={displayWorkflows}
          notifications={data.notifications}
          savingSettings={savingSettings || Boolean(busyWorkflowId)}
          onSaveSettingsPatch={(patch) => void saveIntegrationSettings(patch)}
          onToggleSmsChannel={(id, channels, enabled) =>
            void toggleReminderChannel(id, channels, 'sms', enabled)
          }
        />
      </VStack>
    </AdminAccessGuard>
  );
}
