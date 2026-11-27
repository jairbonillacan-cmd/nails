'use client';

import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';
import { Banner } from '@astryxdesign/core/Banner';
import { Selector } from '@astryxdesign/core/Selector';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import { Check } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import {
  useAdminData,
  type AdminOverviewPayload,
} from '@/components/admin/AdminProvider';
import {
  buildDashboardMetrics,
  type DashboardPeriod,
} from '@/components/admin/dashboard/dashboardMetrics';
import { DashboardAttentionCard } from '@/components/admin/dashboard/DashboardAttentionCard';
import { DashboardKpiRow } from '@/components/admin/dashboard/DashboardKpiRow';
import { DashboardAgendaCard } from '@/components/admin/dashboard/DashboardAgendaCard';
import { DashboardRightColumn } from '@/components/admin/dashboard/DashboardRightColumn';
import {
  ADMIN_CACHE_KEYS,
  applyOptimisticBookingStatus,
  applyOptimisticBookingStatusToList,
  fetchAdminJson,
  getAdminCacheSnapshot,
  invalidateAdminCache,
  mutateAdminCache,
  useAdminCachedQuery,
} from '@/lib/hooks/useAdminCache';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import type { BookingWithRelations } from '@/lib/types';

const PERIOD_OPTIONS: Array<{ value: DashboardPeriod; label: string }> = [
  { value: 'today', label: 'Hoy' },
  { value: '7d', label: 'Esta semana' },
  { value: '30d', label: 'Últimos 30 días' },
];

export default function AdminOverviewPage() {
  const { data: providerData, refresh } = useAdminData();
  const [period, setPeriod] = useState<DashboardPeriod>('7d');
  const [confirmingBookingId, setConfirmingBookingId] = useState<string | null>(null);
  const [rejectingBookingId, setRejectingBookingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const savedNotice = useEphemeralMessage(3200);

  const overviewQuery = useAdminCachedQuery<AdminOverviewPayload>(
    providerData ? ADMIN_CACHE_KEYS.overview : null,
    (signal) => fetchAdminJson<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, signal),
    {
      enabled: Boolean(providerData),
      initialData: providerData ?? undefined,
      staleTimeMs: 30_000,
    },
  );

  const data = overviewQuery.data ?? providerData;

  const metrics = useMemo(
    () => (data ? buildDashboardMetrics(data, period) : null),
    [data, period],
  );

  if (!data || !metrics) return null;

  const firstName = data.session.user.fullName.trim().split(/\s+/)[0] ?? 'Equipo';
  const todayCount = data.kpis.todayBookingsCount;
  const hasWhatsAppQuotaAlert =
    data.whatsappUsage?.alertLevel === 'warning_80' ||
    data.whatsappUsage?.alertLevel === 'limit_100';
  const pendingCount = metrics.totalAttentionCount + (hasWhatsAppQuotaAlert ? 1 : 0);

  const headline =
    todayCount > 0 && pendingCount > 0
      ? `${metrics.headerDateLabel} · ${todayCount} cita${todayCount === 1 ? '' : 's'} hoy y ${pendingCount} ${pendingCount === 1 ? 'pendiente' : 'pendientes'}`
      : todayCount > 0
        ? `${metrics.headerDateLabel} · ${todayCount} cita${todayCount === 1 ? '' : 's'} hoy, todo al día`
        : pendingCount > 0
          ? `${metrics.headerDateLabel} · Sin citas hoy · ${pendingCount} ${pendingCount === 1 ? 'pendiente' : 'pendientes'}`
          : `${metrics.headerDateLabel} · Sin citas hoy, todo al día`;

  const handleConfirmDeposit = async (bookingId: string, clientName: string): Promise<boolean> => {
    if (confirmingBookingId === bookingId) return false;
    setConfirmingBookingId(bookingId);
    setErrorMessage(null);

    const prevOverview =
      getAdminCacheSnapshot<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview) ?? data;
    const prevBookings = getAdminCacheSnapshot<{ bookings: BookingWithRelations[] }>(
      ADMIN_CACHE_KEYS.bookings,
    );

    mutateAdminCache<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, (current) =>
      applyOptimisticBookingStatus(current ?? prevOverview, bookingId, 'confirmed'),
    );
    if (prevBookings) {
      mutateAdminCache<{ bookings: BookingWithRelations[] }>(
        ADMIN_CACHE_KEYS.bookings,
        (current) =>
          current
            ? applyOptimisticBookingStatusToList(current, bookingId, 'confirmed')
            : current,
      );
    }

    try {
      const res = await fetch('/api/admin/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, status: 'confirmed' }),
      });
      if (!res.ok) {
        mutateAdminCache<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, prevOverview);
        if (prevBookings) {
          mutateAdminCache<{ bookings: BookingWithRelations[] }>(
            ADMIN_CACHE_KEYS.bookings,
            prevBookings,
          );
        }
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          code?: string;
        } | null;
        setErrorMessage(
          res.status === 403 && body?.code === 'PAST_BOOKING_LOCKED'
            ? body.error ||
                'Las citas pasadas están bloqueadas; solo la Dueña puede modificarlas.'
            : body?.error ?? 'No se pudo confirmar la cita. Intenta de nuevo.',
        );
        return false;
      }
      invalidateAdminCache('/api/admin/reports');
      savedNotice.show(`Cita de ${clientName} confirmada`);
      void refresh();
      return true;
    } catch {
      mutateAdminCache<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, prevOverview);
      if (prevBookings) {
        mutateAdminCache<{ bookings: BookingWithRelations[] }>(
          ADMIN_CACHE_KEYS.bookings,
          prevBookings,
        );
      }
      setErrorMessage('Error de conexión al confirmar la cita.');
      return false;
    } finally {
      setConfirmingBookingId(null);
    }
  };

  const handleRejectDeposit = async (bookingId: string, clientName: string): Promise<boolean> => {
    if (rejectingBookingId === bookingId) return false;
    setRejectingBookingId(bookingId);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/admin/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject_deposit', bookingId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setErrorMessage(body?.error ?? 'No se pudo rechazar el comprobante.');
        return false;
      }
      savedNotice.show(`Comprobante rechazado · Avisamos a ${clientName}`);
      void refresh();
      return true;
    } catch {
      setErrorMessage('Error de conexión al rechazar el comprobante.');
      return false;
    } finally {
      setRejectingBookingId(null);
    }
  };

  const statusMeta = (
    <>
      {data.integration.mode === 'demo' ? (
        <Tooltip
          content="Modo de prueba: lo que hagas aquí no afecta a clientas reales."
          placement="below"
          touchTrigger="tap"
          hasHoverIndication={false}
        >
          <button type="button" className="ad-demo-chip fx-press">
            Modo de prueba
          </button>
        </Tooltip>
      ) : null}
      {confirmingBookingId || rejectingBookingId ? (
        <Text
          role="status"
          aria-live="polite"
          className="fx-save-pill"
          data-state="saving"
        >
          {rejectingBookingId ? 'Rechazando comprobante…' : 'Confirmando cita…'}
        </Text>
      ) : savedNotice.message ? (
        <Text
          role="status"
          aria-live="polite"
          className="fx-save-pill"
          data-state="saved"
        >
          <Check size={12} aria-hidden="true" />
          {savedNotice.message}
        </Text>
      ) : null}
    </>
  );

  return (
    <VStack gap={4} className="ad-dashboard fx-fade-up">
      <PageHeader
        eyebrow={`${metrics.greetingLabel}, ${firstName}`}
        title="Resumen"
        subtitle={headline}
        meta={statusMeta}
        actions={
          <Selector
            label="Periodo del resumen"
            isLabelHidden
            size="sm"
            variant="secondary"
            value={period}
            options={PERIOD_OPTIONS}
            onChange={(next) => {
              if (next === 'today' || next === '7d' || next === '30d') {
                setPeriod(next);
              }
            }}
          />
        }
      />

      {errorMessage ? (
        <Banner
          status="error"
          role="alert"
          title={errorMessage}
          isDismissable
          onDismiss={() => setErrorMessage(null)}
        />
      ) : null}

      <DashboardKpiRow data={data} metrics={metrics} />

      <VStack className="ad-main" gap={4}>
        <DashboardAgendaCard
          data={data}
          metrics={metrics}
          confirmingBookingId={confirmingBookingId}
          onConfirmDeposit={handleConfirmDeposit}
        />
        <DashboardAttentionCard
          data={data}
          metrics={metrics}
          confirmingBookingId={confirmingBookingId}
          rejectingBookingId={rejectingBookingId}
          onConfirmDeposit={handleConfirmDeposit}
          onRejectDeposit={handleRejectDeposit}
        />
      </VStack>

      <DashboardRightColumn data={data} metrics={metrics} />
    </VStack>
  );
}
