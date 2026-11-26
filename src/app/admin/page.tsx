'use client';

import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import { Check, Plus, Search } from 'lucide-react';
import {
  useAdminData,
  type AdminOverviewPayload,
} from '@/components/admin/AdminProvider';
import { useAdminShellControls } from '@/components/admin/AdminShell';
import { buildDashboardMetrics } from '@/components/admin/dashboard/dashboardMetrics';
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

export default function AdminOverviewPage() {
  const { data: providerData, bookingEventSeq, refresh } = useAdminData();
  const { openQuickSearch } = useAdminShellControls();
  const [confirmingBookingId, setConfirmingBookingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const savedNotice = useEphemeralMessage(3200);

  const overviewQuery = useAdminCachedQuery<AdminOverviewPayload>(
    providerData ? ADMIN_CACHE_KEYS.overview : null,
    (signal) => fetchAdminJson<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, signal),
    {
      enabled: Boolean(providerData),
      initialData: providerData ?? undefined,
      staleTimeMs: 10_000,
      revalidateKey: bookingEventSeq,
    },
  );

  const data = overviewQuery.data ?? providerData;

  const metrics = useMemo(
    () => (data ? buildDashboardMetrics(data) : null),
    [data],
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
      ? `Hoy tienes ${todayCount} cita${todayCount === 1 ? '' : 's'} y ${pendingCount} ${pendingCount === 1 ? 'pendiente' : 'pendientes'}.`
      : todayCount > 0
        ? `Hoy tienes ${todayCount} cita${todayCount === 1 ? '' : 's'}. Todo está al día.`
        : pendingCount > 0
          ? `Sin citas hoy · ${pendingCount} ${pendingCount === 1 ? 'pendiente' : 'pendientes'} por atender.`
          : 'Sin citas hoy. Todo está al día.';

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

  return (
    <VStack gap={5} className="ad-dashboard fx-fade-up">
      <HStack
        as="header"
        justify="between"
        align="end"
        gap={3}
        wrap="wrap"
        className="ad-head"
      >
        <VStack gap={1} className="ad-head-copy">
          <HStack gap={2} align="center" wrap="wrap">
            <Text type="supporting" color="secondary" weight="medium" className="ad-date">
              {metrics.headerDateLabel}
            </Text>
            {data.integration.mode === 'demo' ? (
              <Tooltip
                content="Modo de prueba: todo se guarda solo aquí para que explores sin miedo."
                placement="below"
                touchTrigger="tap"
                hasHoverIndication={false}
              >
                <button type="button" className="ad-demo-chip fx-press">
                  Modo demo
                </button>
              </Tooltip>
            ) : null}
            {confirmingBookingId ? (
              <Text
                role="status"
                aria-live="polite"
                className="fx-save-pill"
                data-state="saving"
              >
                Confirmando cita...
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
          </HStack>

          <Heading level={1} className="lk-serif ad-title">
            Hola, {firstName}
          </Heading>
          <Text color="secondary" className="ad-subtitle">
            {headline}
          </Text>
        </VStack>

        <HStack gap={2} align="center" wrap="wrap">
          <button
            type="button"
            className="ad-search-btn ad-hide-s fx-press"
            onClick={openQuickSearch}
          >
            <HStack gap={2} align="center">
              <Search size={15} aria-hidden="true" />
              <Text color="inherit" size="sm" weight="medium">
                Buscar clienta o cita
              </Text>
            </HStack>
            <kbd className="ad-kbd">Ctrl K</kbd>
          </button>

          <Button
            label="Nueva cita"
            variant="primary"
            size="md"
            icon={<Plus size={16} aria-hidden="true" />}
            href="/admin/citas?new=1"
          />
        </HStack>
      </HStack>

      {errorMessage ? (
        <Banner
          status="error"
          role="alert"
          title={errorMessage}
          isDismissable
          onDismiss={() => setErrorMessage(null)}
        />
      ) : null}

      <DashboardAttentionCard
        data={data}
        metrics={metrics}
        confirmingBookingId={confirmingBookingId}
        savedMessage={savedNotice.message}
        onConfirmDeposit={handleConfirmDeposit}
      />

      <DashboardKpiRow data={data} metrics={metrics} />

      <VStack className="ad-main" gap={5}>
        <DashboardAgendaCard
          data={data}
          metrics={metrics}
          confirmingBookingId={confirmingBookingId}
          savedMessage={savedNotice.message}
          onConfirmDeposit={handleConfirmDeposit}
        />
        <DashboardRightColumn data={data} metrics={metrics} />
      </VStack>
    </VStack>
  );
}
