'use client';

import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import { Plus, Search } from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import { useAdminShellControls } from '@/components/admin/AdminShell';
import { buildDashboardMetrics } from '@/components/admin/dashboard/dashboardMetrics';
import { DashboardAttentionCard } from '@/components/admin/dashboard/DashboardAttentionCard';
import { DashboardKpiRow } from '@/components/admin/dashboard/DashboardKpiRow';
import { DashboardAgendaCard } from '@/components/admin/dashboard/DashboardAgendaCard';
import { DashboardRightColumn } from '@/components/admin/dashboard/DashboardRightColumn';

export default function AdminOverviewPage() {
  const { data, refresh } = useAdminData();
  const { openQuickSearch } = useAdminShellControls();
  const [confirmingBookingId, setConfirmingBookingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    status: 'success' | 'error';
    message: string;
  } | null>(null);

  const metrics = useMemo(
    () => (data ? buildDashboardMetrics(data) : null),
    [data],
  );

  if (!data || !metrics) return null;

  const firstName = data.session.user.fullName.trim().split(/\s+/)[0] ?? 'Equipo';
  const todayCount = data.kpis.todayBookingsCount;
  const pendingCount = metrics.totalAttentionCount;

  const headline =
    todayCount > 0 && pendingCount > 0
      ? `Hoy tienes ${todayCount} cita${todayCount === 1 ? '' : 's'} y ${pendingCount} ${pendingCount === 1 ? 'cosa pendiente' : 'cosas pendientes'}.`
      : todayCount > 0
        ? `Hoy tienes ${todayCount} cita${todayCount === 1 ? '' : 's'}. Todo está al día.`
        : pendingCount > 0
          ? `Sin citas programadas hoy y ${pendingCount} ${pendingCount === 1 ? 'pendiente' : 'pendientes'} por atender.`
          : 'No tienes citas hoy. Todo está al día.';

  const handleConfirmDeposit = async (bookingId: string, clientName: string) => {
    setConfirmingBookingId(bookingId);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, status: 'confirmed' }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setFeedback({
          status: 'error',
          message: body?.error ?? 'No se pudo confirmar la cita. Intenta de nuevo.',
        });
        return;
      }
      await refresh();
      setFeedback({
        status: 'success',
        message: `Cita de ${clientName} confirmada y sincronizada.`,
      });
    } catch {
      setFeedback({
        status: 'error',
        message: 'Error de conexión al confirmar la cita.',
      });
    } finally {
      setConfirmingBookingId(null);
    }
  };

  return (
    <VStack gap={6} className="ad-dashboard">
      <HStack
        as="header"
        justify="between"
        align="end"
        gap={4}
        wrap="wrap"
        className="ad-head"
      >
        <VStack gap={1.5} className="ad-head-copy">
          <HStack gap={2} align="center" wrap="wrap">
            <Text type="supporting" color="secondary" weight="medium" className="ad-date">
              {metrics.headerDateLabel}
            </Text>
            {data.integration.mode === 'demo' ? (
              <Tooltip
                content="Todo se guarda localmente. Con tus llaves en .env se activan Supabase, Google Calendar, Resend, WhatsApp y Twilio."
                placement="below"
                touchTrigger="tap"
                hasHoverIndication={false}
              >
                <button type="button" className="ad-demo-chip">
                  Modo demo
                </button>
              </Tooltip>
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
            className="ad-search-btn ad-hide-s"
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

      {feedback ? (
        <Banner
          status={feedback.status}
          title={feedback.message}
          isDismissable
          onDismiss={() => setFeedback(null)}
        />
      ) : null}

      <DashboardAttentionCard
        data={data}
        metrics={metrics}
        confirmingBookingId={confirmingBookingId}
        onConfirmDeposit={handleConfirmDeposit}
      />

      <DashboardKpiRow data={data} metrics={metrics} />

      <VStack className="ad-main" gap={5}>
        <DashboardAgendaCard
          data={data}
          metrics={metrics}
          confirmingBookingId={confirmingBookingId}
          onConfirmDeposit={handleConfirmDeposit}
        />
        <DashboardRightColumn data={data} metrics={metrics} />
      </VStack>
    </VStack>
  );
}
