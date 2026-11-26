'use client';

import { useMemo, useState } from 'react';
import NextLink from 'next/link';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { CalendarCheck, LogOut, RefreshCw, WifiOff } from 'lucide-react';
import {
  FilterPillBar,
  PageHeader,
  SurfaceCard,
  type FilterPillOption,
} from '@/components/ui';
import { buildWhatsAppLink } from '@/lib/format';
import { useServiceWorker } from '@/lib/hooks/useServiceWorker';
import type {
  ClientPortalBookingDTO,
  ClientPortalSnapshotDTO,
  PublicSettingsDTO,
} from '@/lib/public-dto';
import { BookingHeader } from '../booking/BookingChrome';
import { LANDING_ASSETS } from '../landing/landingContent';
import { PortalBookingsTab } from './PortalBookingsTab';
import { PortalOtpGate } from './PortalOtpGate';
import { PortalRewardsTab } from './PortalRewardsTab';

type PortalTab = 'upcoming' | 'history' | 'rewards';

interface ClientPortalViewProps {
  settings: PublicSettingsDTO;
  initialSnapshot: ClientPortalSnapshotDTO | null;
  showDemoHint?: boolean;
}

const UPCOMING_STATUSES = new Set<ClientPortalBookingDTO['status']>([
  'pending_payment',
  'pending_confirmation',
  'confirmed',
]);

export function ClientPortalView({
  settings,
  initialSnapshot,
  showDemoHint = false,
}: ClientPortalViewProps) {
  const { isOffline } = useServiceWorker({ register: false });
  const [snapshot, setSnapshot] = useState<ClientPortalSnapshotDTO | null>(initialSnapshot);
  const [activeTab, setActiveTab] = useState<PortalTab>('upcoming');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const timezone = settings.timezone || 'America/Mexico_City';
  const whatsappUrl = buildWhatsAppLink(
    settings.whatsappNumber,
    `Hola ${settings.name}, necesito ayuda para consultar mis citas.`,
  );

  const upcomingBookings = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.bookings
      .filter((item) => UPCOMING_STATUSES.has(item.status))
      .toSorted((a, b) => a.startAt.localeCompare(b.startAt));
  }, [snapshot]);

  const historyBookings = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.bookings
      .filter((item) => !UPCOMING_STATUSES.has(item.status))
      .toSorted((a, b) => b.startAt.localeCompare(a.startAt));
  }, [snapshot]);

  const activePackagesCount = useMemo(
    () => (snapshot?.packages ?? []).filter((pkg) => pkg.status === 'active').length,
    [snapshot],
  );

  const tabOptions = useMemo<readonly FilterPillOption<PortalTab>[]>(
    () => [
      { value: 'upcoming', label: 'Próximas', count: upcomingBookings.length },
      { value: 'history', label: 'Historial', count: historyBookings.length },
      {
        value: 'rewards',
        label: 'Sellos y paquetes',
        count: activePackagesCount > 0 ? activePackagesCount : undefined,
      },
    ],
    [activePackagesCount, historyBookings.length, upcomingBookings.length],
  );

  const fetchBookingsSnapshot = async (): Promise<boolean> => {
    const res = await fetch('/api/client-portal/bookings', { cache: 'no-store' });
    if (!res.ok) return false;
    const data = (await res.json()) as ClientPortalSnapshotDTO & { authenticated?: boolean };
    setSnapshot({
      phoneE164: data.phoneE164,
      clientId: data.clientId,
      clientName: data.clientName,
      bookings: data.bookings,
      loyaltySummary: data.loyaltySummary,
      packages: data.packages,
    });
    setActiveTab('upcoming');
    return true;
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setErrorMessage(null);
    try {
      const ok = await fetchBookingsSnapshot();
      if (!ok) setSnapshot(null);
    } catch {
      setErrorMessage('Sin conexión para actualizar en este momento.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    try {
      await fetch('/api/client-portal/otp', { method: 'DELETE' });
    } finally {
      setSnapshot(null);
      setInfoMessage('Cerraste tu sesión correctamente.');
      setBusy(false);
    }
  };

  const year = settings.updatedAt.slice(0, 4);

  return (
    <VStack className="lk-root pt-shell">
      <BookingHeader salonName={settings.name} whatsappUrl={whatsappUrl} />

      <VStack as="section" className="rb-hero ck-hero" aria-labelledby="pt-hero-title">
        <img
          className="rb-hero-cherries"
          src={LANDING_ASSETS.cherriesWhite}
          alt=""
          width={340}
          height={340}
          decoding="async"
        />
        <VStack gap={3} className="rb-wrap rb-hero-inner fx-fade-up">
          <VStack gap={1}>
            {snapshot ? (
              <Text id="pt-hero-title" color="inherit" className="lk-serif rb-hero-title">
                Mis citas
              </Text>
            ) : (
              <Heading level={1} id="pt-hero-title" color="inherit" className="lk-serif rb-hero-title">
                Mis citas
              </Heading>
            )}
            <img
              className="rb-hero-stroke"
              src={LANDING_ASSETS.strokePorcelain}
              alt=""
              width={180}
              height={20}
              decoding="async"
            />
          </VStack>
          <Text color="inherit" className="ck-hero-sub" textWrap="pretty">
            Consulta tus próximas visitas, historial, tarjeta de sellos y paquetes de sesiones en {settings.name}.
          </Text>
        </VStack>
        <svg className="rb-hero-wave" viewBox="0 0 1440 40" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 40h1440V22c-120-14-240-20-360-12S840 34 720 34 480 14 360 10 120 20 0 26Z" />
        </svg>
      </VStack>

      <VStack as="main" gap={4} className="rb-wrap rb-main">
        {isOffline ? (
          <HStack role="status" aria-live="polite" align="center" gap={2} className="pt-offline-pill" data-inline="true">
            <WifiOff size={15} aria-hidden="true" />
            <Text type="supporting" color="inherit" weight="semibold">
              Sin conexión · Mostrando tus últimos datos guardados
            </Text>
          </HStack>
        ) : null}

        {!snapshot ? (
          <PortalOtpGate
            showDemoHint={showDemoHint}
            infoMessage={infoMessage}
            onDismissInfo={() => setInfoMessage(null)}
            onSetInfo={setInfoMessage}
            onLoadSnapshot={fetchBookingsSnapshot}
          />
        ) : (
          <VStack gap={4} width="100%">
            <SurfaceCard padded className="pt-card fx-fade-up">
              <VStack gap={3}>
                <PageHeader
                  eyebrow={`Portal de clienta · ${snapshot.phoneE164}`}
                  title={`Hola, ${snapshot.clientName || 'bienvenida'}`}
                  actions={
                    <>
                      <Button
                        label="Agendar nueva cita"
                        variant="primary"
                        size="md"
                        className="fx-press"
                        icon={<CalendarCheck size={16} aria-hidden="true" />}
                        href="/reservar"
                      />
                      <Button
                        type="button"
                        label="Actualizar"
                        variant="secondary"
                        size="md"
                        className="fx-press"
                        isLoading={refreshing}
                        icon={<RefreshCw size={15} aria-hidden="true" />}
                        onClick={() => void handleRefresh()}
                      />
                      <Button
                        type="button"
                        label="Cerrar sesión"
                        variant="ghost"
                        size="md"
                        className="fx-press"
                        isDisabled={busy}
                        icon={<LogOut size={15} aria-hidden="true" />}
                        onClick={() => void handleLogout()}
                      />
                    </>
                  }
                />

                <Divider />

                <FilterPillBar
                  ariaLabel="Secciones de mis citas"
                  value={activeTab}
                  options={tabOptions}
                  onChange={setActiveTab}
                  mode="pills"
                />
              </VStack>
            </SurfaceCard>

            {errorMessage ? (
              <Banner
                status="error"
                title="Aviso"
                description={errorMessage}
                isDismissable
                onDismiss={() => setErrorMessage(null)}
              />
            ) : null}

            {activeTab === 'upcoming' ? (
              <PortalBookingsTab
                mode="upcoming"
                bookings={upcomingBookings}
                timezone={timezone}
                currency={settings.currency}
              />
            ) : null}

            {activeTab === 'history' ? (
              <PortalBookingsTab
                mode="history"
                bookings={historyBookings}
                timezone={timezone}
                currency={settings.currency}
              />
            ) : null}

            {activeTab === 'rewards' ? (
              <PortalRewardsTab
                studioName={settings.name}
                timezone={timezone}
                loyaltySummary={snapshot.loyaltySummary}
                packages={snapshot.packages}
              />
            ) : null}
          </VStack>
        )}
      </VStack>

      <VStack as="footer" className="ck-footer">
        <HStack justify="between" align="center" wrap="wrap" gap={3} className="rb-wrap">
          <Text type="supporting" color="secondary">
            © {year} {settings.name} · {settings.address}
          </Text>
          <HStack gap={4} wrap="wrap">
            <NextLink className="ck-footer-link" href="/">
              Inicio
            </NextLink>
            <NextLink className="ck-footer-link" href="/reservar">
              Agendar cita
            </NextLink>
            <NextLink className="ck-footer-link" href="/links">
              Links
            </NextLink>
            <NextLink className="ck-footer-link" href="/aviso-de-privacidad">
              Aviso de privacidad
            </NextLink>
          </HStack>
        </HStack>
      </VStack>
    </VStack>
  );
}
