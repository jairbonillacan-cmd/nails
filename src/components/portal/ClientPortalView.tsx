'use client';

import { BrandIcon } from '@/components/brand/BrandIcon';
import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import NextLink from 'next/link';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { LogOut, WifiOff } from 'lucide-react';
import { FilterPillBar, type FilterPillOption } from '@/components/ui/FilterPillBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import { formatPhoneDisplay } from '@/lib/format';
import { useClientPortalProfile } from '@/lib/hooks/useClientPortalProfile';
import { useServiceWorker } from '@/lib/hooks/useServiceWorker';
import { fetchJsonWithTimeout } from '@/lib/http/client-fetch';
import type {
  ClientPortalBookingDTO,
  ClientPortalSnapshotDTO,
  PublicSettingsDTO,
} from '@/lib/public-dto';
import { BookingHeader } from '../booking/BookingChrome';
import { LANDING_ASSETS } from '../landing/landingContent';
import { PortalOtpGate } from './PortalOtpGate';

const PortalBookingsTab = dynamic(
  () => import('./PortalBookingsTab').then((mod) => mod.PortalBookingsTab),
  { ssr: false },
);

const PortalRewardsTab = dynamic(
  () => import('./PortalRewardsTab').then((mod) => mod.PortalRewardsTab),
  { ssr: false },
);

const PortalProfileTab = dynamic(
  () => import('./PortalProfileTab').then((mod) => mod.PortalProfileTab),
  { ssr: false },
);

type PortalTab = 'upcoming' | 'history' | 'rewards' | 'profile';

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const timezone = settings.timezone || 'America/Mexico_City';
  const profileState = useClientPortalProfile(Boolean(snapshot) && activeTab === 'profile');

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
      { value: 'profile', label: 'Mis datos' },
    ],
    [activePackagesCount, historyBookings.length, upcomingBookings.length],
  );

  const fetchBookingsSnapshot = async (): Promise<boolean> => {
    const res = await fetchJsonWithTimeout<ClientPortalSnapshotDTO & { authenticated?: boolean }>(
      '/api/client-portal/bookings',
      { cache: 'no-store', credentials: 'same-origin' },
    );
    if (!res.ok || !res.data.phoneE164) return false;
    setSnapshot({
      phoneE164: res.data.phoneE164,
      clientId: res.data.clientId,
      clientName: res.data.clientName,
      bookings: res.data.bookings,
      loyaltySummary: res.data.loyaltySummary,
      packages: res.data.packages,
    });
    setErrorMessage(null);
    setActiveTab('upcoming');
    return true;
  };

  const handleLogout = async () => {
    if (busy) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const res = await fetchJsonWithTimeout<{ ok?: boolean }>('/api/client-portal/otp', {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!res.ok) {
        setErrorMessage(res.error || 'No pudimos cerrar tu sesión. Intenta de nuevo.');
        return;
      }
      profileState.reset();
      setSnapshot(null);
      setInfoMessage('Cerraste tu sesión correctamente.');
    } finally {
      setBusy(false);
    }
  };

  const year = settings.updatedAt.slice(0, 4);

  return (
    <VStack className="lk-root pt-shell">
      <a href="#main-content" className="lk-skip-link">
        Saltar al contenido principal
      </a>
      <BookingHeader settings={settings} />

      <VStack as="section" className="rb-hero ck-hero" aria-labelledby="pt-hero-title">
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
            Tus citas, sellos y paquetes de {settings.name} en un solo lugar.
          </Text>
        </VStack>
        <svg className="rb-hero-wave" viewBox="0 0 1440 40" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 40h1440V22c-120-14-240-20-360-12S840 34 720 34 480 14 360 10 120 20 0 26Z" />
        </svg>
      </VStack>

      <VStack as="main" id="main-content" tabIndex={-1} gap={4} className="rb-wrap rb-main">
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
            salonName={settings.name}
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
                  eyebrow={formatPhoneDisplay(snapshot.phoneE164)}
                  title={`Hola, ${snapshot.clientName || 'bienvenida'}`}
                  actions={
                    <>
                      <Button
                        label="Agendar nueva cita"
                        variant="primary"
                        size="md"
                        className="fx-press"
                        icon={<BrandIcon name="calendario" size={1.25} />}
                        href="/reservar"
                      />
                      <Button
                        type="button"
                        label="Cerrar sesión"
                        variant="ghost"
                        size="md"
                        className="fx-press"
                        isLoading={busy}
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
                role="alert"
                title="Aviso"
                description={errorMessage}
                isDismissable
                dismissLabel="Cerrar aviso"
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

            {activeTab === 'profile' ? (
              <PortalProfileTab
                phoneE164={snapshot.phoneE164}
                fallbackClientName={snapshot.clientName ?? ''}
                timezone={timezone}
                profile={profileState.profile}
                isLoading={profileState.isLoading}
                loadError={profileState.loadError}
                isSaving={profileState.isSaving}
                saveError={profileState.saveError}
                saveSuccess={profileState.saveSuccess}
                onRetryLoad={profileState.retryLoad}
                onSave={async (input) => {
                  const updated = await profileState.saveProfile(input);
                  if (updated) {
                    setSnapshot((prev) =>
                      prev
                        ? { ...prev, clientName: updated.fullName.trim() || prev.clientName }
                        : prev,
                    );
                  }
                  return updated;
                }}
                onDismissFeedback={profileState.dismissFeedback}
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
