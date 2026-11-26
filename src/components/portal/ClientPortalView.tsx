'use client';

import type React from 'react';
import { useMemo, useRef, useState } from 'react';
import NextLink from 'next/link';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Token } from '@astryxdesign/core/Token';
import { Divider } from '@astryxdesign/core/Divider';
import {
  ArrowRight,
  CalendarCheck,
  Clock,
  Gift,
  LogOut,
  Package,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  WifiOff,
} from 'lucide-react';
import {
  buildWhatsAppLink,
  formatCurrency,
  formatDateLongInTimezone,
  formatDateShortInTimezone,
  formatDuration,
  formatTimeInTimezone,
} from '@/lib/format';
import { useServiceWorker } from '@/lib/hooks/useServiceWorker';
import type {
  ClientPortalBookingDTO,
  ClientPortalSnapshotDTO,
  PublicClientPackageDTO,
  PublicSettingsDTO,
} from '@/lib/public-dto';
import { BookingHeader } from '../booking/BookingChrome';
import { LANDING_ASSETS } from '../landing/landingContent';
import { LoyaltyStampCard } from '../LoyaltyStampCard';

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

function resolveStatusMeta(status: ClientPortalBookingDTO['status']): {
  label: string;
  color: 'default' | 'green' | 'yellow' | 'red' | 'blue' | 'pink';
} {
  switch (status) {
    case 'confirmed':
      return { label: 'Confirmada', color: 'green' };
    case 'pending_confirmation':
      return { label: 'Por confirmar', color: 'yellow' };
    case 'pending_payment':
      return { label: 'Anticipo pendiente', color: 'yellow' };
    case 'completed':
      return { label: 'Completada', color: 'blue' };
    case 'canceled':
      return { label: 'Cancelada', color: 'default' };
    case 'no_show':
      return { label: 'Inasistencia', color: 'red' };
  }
}

function resolvePackageStatusLabel(status: PublicClientPackageDTO['status']): {
  label: string;
  color: 'default' | 'green' | 'yellow' | 'red' | 'blue' | 'pink';
} {
  switch (status) {
    case 'active':
      return { label: 'Activo', color: 'green' };
    case 'exhausted':
      return { label: 'Completado', color: 'blue' };
    case 'expired':
      return { label: 'Vencido', color: 'yellow' };
    case 'canceled':
      return { label: 'Cancelado', color: 'default' };
  }
}

export function ClientPortalView({
  settings,
  initialSnapshot,
  showDemoHint = false,
}: ClientPortalViewProps) {
  const { isOffline } = useServiceWorker({ register: false });
  const [snapshot, setSnapshot] = useState<ClientPortalSnapshotDTO | null>(
    initialSnapshot,
  );
  const [activeTab, setActiveTab] = useState<PortalTab>('upcoming');

  const [authStep, setAuthStep] = useState<'phone' | 'code'>('phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [verifiedPhoneE164, setVerifiedPhoneE164] = useState('');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const digitRefs = useRef<Array<HTMLInputElement | null>>([]);
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

  const otpCode = otpDigits.join('');

  const focusDigit = (index: number) => {
    const target = digitRefs.current[index];
    if (target) {
      target.focus();
      target.select();
    }
  };

  const handleDigitChange = (index: number, raw: string) => {
    const onlyDigits = raw.replace(/\D/g, '');
    if (onlyDigits.length > 1) {
      const next = [...otpDigits];
      for (let i = 0; i < 6; i += 1) {
        const ch = onlyDigits[i];
        if (ch !== undefined) next[i] = ch;
      }
      setOtpDigits(next);
      focusDigit(Math.min(onlyDigits.length, 5));
      return;
    }
    const next = [...otpDigits];
    next[index] = onlyDigits;
    setOtpDigits(next);
    if (onlyDigits && index < 5) {
      focusDigit(index + 1);
    }
  };

  const handleDigitKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      focusDigit(index - 1);
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      focusDigit(index - 1);
    } else if (e.key === 'ArrowRight' && index < 5) {
      e.preventDefault();
      focusDigit(index + 1);
    }
  };

  const handleDigitPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const next = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i += 1) {
      next[i] = pasted[i] ?? '';
    }
    setOtpDigits(next);
    focusDigit(Math.min(pasted.length, 5));
  };

  const fetchBookingsSnapshot = async (): Promise<boolean> => {
    const res = await fetch('/api/client-portal/bookings', { cache: 'no-store' });
    if (!res.ok) {
      return false;
    }
    const data = (await res.json()) as ClientPortalSnapshotDTO & {
      authenticated?: boolean;
    };
    setSnapshot({
      phoneE164: data.phoneE164,
      clientId: data.clientId,
      clientName: data.clientName,
      bookings: data.bookings,
      loyaltySummary: data.loyaltySummary,
      packages: data.packages,
    });
    return true;
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErrorMessage(null);
    setInfoMessage(null);
    const digits = phoneInput.replace(/\D/g, '');
    if (digits.length < 10) {
      setErrorMessage('Escribe tu número de WhatsApp a 10 dígitos.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/client-portal/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request', phone: phoneInput }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        phoneE164?: string;
        demoCode?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setErrorMessage(data.error || 'No pudimos enviar tu código. Intenta de nuevo.');
        return;
      }
      setVerifiedPhoneE164(data.phoneE164 || phoneInput);
      setDemoCode(data.demoCode ?? null);
      setOtpDigits(['', '', '', '', '', '']);
      setAuthStep('code');
      setInfoMessage('Te enviamos un código de 6 dígitos por WhatsApp (válido 5 minutos).');
    } catch {
      setErrorMessage('Error de conexión al enviar el código. Revisa tu internet.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErrorMessage(null);
    setInfoMessage(null);
    if (otpCode.length !== 6) {
      setErrorMessage('Ingresa los 6 dígitos de tu código de verificación.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/client-portal/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify',
          phone: verifiedPhoneE164 || phoneInput,
          code: otpCode,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        attemptsRemaining?: number;
      };
      if (!res.ok || !data.ok) {
        const extra =
          typeof data.attemptsRemaining === 'number' && data.attemptsRemaining > 0
            ? ` Te quedan ${data.attemptsRemaining} intento(s).`
            : '';
        setErrorMessage(`${data.error || 'Código incorrecto.'}${extra}`);
        return;
      }

      const loaded = await fetchBookingsSnapshot();
      if (!loaded) {
        setErrorMessage('Sesión iniciada, pero no pudimos cargar tus citas. Recarga la página.');
        return;
      }
      setDemoCode(null);
      setOtpDigits(['', '', '', '', '', '']);
      setActiveTab('upcoming');
    } catch {
      setErrorMessage('Error de conexión al verificar el código.');
    } finally {
      setBusy(false);
    }
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setErrorMessage(null);
    try {
      const ok = await fetchBookingsSnapshot();
      if (!ok) {
        setSnapshot(null);
        setAuthStep('phone');
      }
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
      setAuthStep('phone');
      setOtpDigits(['', '', '', '', '', '']);
      setDemoCode(null);
      setInfoMessage('Cerraste tu sesión correctamente.');
      setBusy(false);
    }
  };

  const handleFillDemoCode = () => {
    if (!demoCode || demoCode.length !== 6) return;
    setOtpDigits(demoCode.split(''));
    setErrorMessage(null);
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
            <Heading
              level={1}
              id="pt-hero-title"
              color="inherit"
              className="lk-serif rb-hero-title"
            >
              Mis citas
            </Heading>
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
        <svg
          className="rb-hero-wave"
          viewBox="0 0 1440 40"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M0 40h1440V22c-120-14-240-20-360-12S840 34 720 34 480 14 360 10 120 20 0 26Z" />
        </svg>
      </VStack>

      <VStack as="main" gap={4} className="rb-wrap rb-main">
        {isOffline ? (
          <HStack
            role="status"
            aria-live="polite"
            align="center"
            gap={2}
            className="pt-offline-pill"
            data-inline="true"
          >
            <WifiOff size={15} aria-hidden="true" />
            <Text type="supporting" color="inherit" weight="semibold">
              Sin conexión · Mostrando tus últimos datos guardados
            </Text>
          </HStack>
        ) : null}

        {!snapshot ? (
          <VStack
            gap={4}
            maxWidth={520}
            width="100%"
            style={{ marginInline: 'auto' }}
          >
            <VStack as="section" gap={4} className="pt-card fx-fade-up" aria-labelledby="pt-login-title">
              <HStack gap={2} align="center">
                <ShieldCheck size={20} aria-hidden="true" className="lk-cereza-text" />
                <Heading level={2} id="pt-login-title" className="lk-serif rb-h2">
                  {authStep === 'phone' ? 'Accede con tu WhatsApp' : 'Ingresa tu código'}
                </Heading>
              </HStack>
              <Text color="secondary" textWrap="pretty">
                {authStep === 'phone'
                  ? 'Sin contraseñas. Te mandamos un código temporal de 6 dígitos para proteger tu historial.'
                  : `Enviamos un código de 6 dígitos al ${verifiedPhoneE164}.`}
              </Text>

              {errorMessage ? (
                <Banner
                  status="error"
                  title="No pudimos verificar"
                  description={errorMessage}
                  isDismissable
                  onDismiss={() => setErrorMessage(null)}
                />
              ) : null}

              {infoMessage ? (
                <Banner
                  status="info"
                  title={infoMessage}
                  isDismissable
                  onDismiss={() => setInfoMessage(null)}
                />
              ) : null}

              {authStep === 'phone' ? (
                <form onSubmit={(e) => void handleRequestOtp(e)} noValidate>
                  <VStack gap={4}>
                    <TextInput
                      label="Tu WhatsApp"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      size="lg"
                      placeholder="222 412 3987"
                      startIcon={<Text weight="semibold">+52</Text>}
                      value={phoneInput}
                      onChange={setPhoneInput}
                      isRequired
                      description={
                        showDemoHint
                          ? 'Modo demo local: prueba con 222 412 3987 (Sofía Ramírez).'
                          : 'Usa el mismo número con el que agendaste tus citas.'
                      }
                    />
                    <HStack gap={2} wrap="wrap">
                      <Button
                        type="submit"
                        label="Enviar código de verificación"
                        variant="primary"
                        size="lg"
                        width="100%"
                        isLoading={busy}
                        className="fx-press"
                      />
                      {showDemoHint ? (
                        <Button
                          type="button"
                          label="Usar teléfono demo (Sofía)"
                          variant="ghost"
                          size="md"
                          width="100%"
                          className="fx-press"
                          onClick={() => {
                            setPhoneInput('222 412 3987');
                            setErrorMessage(null);
                          }}
                        />
                      ) : null}
                    </HStack>
                  </VStack>
                </form>
              ) : (
                <form onSubmit={(e) => void handleVerifyOtp(e)} noValidate>
                  <VStack gap={4}>
                    {demoCode ? (
                      <VStack gap={2}>
                        <Banner
                          status="info"
                          title={`Código de prueba local: ${demoCode}`}
                          description="Visible solo en entorno de demostración sin WhatsApp Cloud."
                        />
                        <HStack>
                          <Button
                            type="button"
                            label="Rellenar código demo"
                            variant="secondary"
                            size="sm"
                            className="fx-press"
                            onClick={handleFillDemoCode}
                          />
                        </HStack>
                      </VStack>
                    ) : null}

                    <VStack gap={1.5}>
                      <Text type="label" weight="semibold">
                        Código de 6 dígitos
                      </Text>
                      <HStack
                        className="pt-otp-grid"
                        role="group"
                        aria-label="Código de verificación de 6 dígitos"
                      >
                        {otpDigits.map((digit, index) => (
                          <input
                            key={index}
                            ref={(el) => {
                              digitRefs.current[index] = el;
                            }}
                            type="text"
                            inputMode="numeric"
                            autoComplete={index === 0 ? 'one-time-code' : 'off'}
                            maxLength={6}
                            aria-label={`Dígito ${index + 1} de 6`}
                            value={digit}
                            onChange={(e) => handleDigitChange(index, e.target.value)}
                            onKeyDown={(e) => handleDigitKeyDown(index, e)}
                            onPaste={handleDigitPaste}
                          />
                        ))}
                      </HStack>
                    </VStack>

                    <Button
                      type="submit"
                      label="Verificar y entrar"
                      variant="primary"
                      size="lg"
                      width="100%"
                      isLoading={busy}
                      isDisabled={otpCode.length !== 6}
                      className="fx-press"
                    />

                    <HStack justify="between" gap={2} wrap="wrap">
                      <Button
                        type="button"
                        label="Cambiar número"
                        variant="ghost"
                        size="sm"
                        className="fx-press"
                        onClick={() => {
                          setAuthStep('phone');
                          setErrorMessage(null);
                          setDemoCode(null);
                        }}
                      />
                      <Button
                        type="button"
                        label="Reenviar código"
                        variant="ghost"
                        size="sm"
                        className="fx-press"
                        isDisabled={busy}
                        onClick={(e) => void handleRequestOtp(e)}
                      />
                    </HStack>
                  </VStack>
                </form>
              )}
            </VStack>
          </VStack>
        ) : (
          <VStack gap={4} width="100%">
            <VStack as="section" gap={3} className="pt-card fx-fade-up">
              <HStack justify="between" align="center" wrap="wrap" gap={3}>
                <VStack gap={0.5}>
                  <Text type="supporting" color="secondary">
                    Portal de clienta · {snapshot.phoneE164}
                  </Text>
                  <Heading level={2} className="lk-serif rb-h2">
                    Hola, {snapshot.clientName || 'bienvenida'}
                  </Heading>
                </VStack>
                <HStack gap={2} wrap="wrap">
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
                </HStack>
              </HStack>

              <Divider />

              <HStack
                role="tablist"
                aria-label="Secciones de mis citas"
                gap={2}
                wrap="wrap"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'upcoming'}
                  className="rb-pill fx-press"
                  onClick={() => setActiveTab('upcoming')}
                >
                  <HStack gap={1.5} align="center">
                    <Text color="inherit" weight="semibold">
                      Próximas
                    </Text>
                    <Badge label={String(upcomingBookings.length)} variant="info" />
                  </HStack>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'history'}
                  className="rb-pill fx-press"
                  onClick={() => setActiveTab('history')}
                >
                  <HStack gap={1.5} align="center">
                    <Text color="inherit" weight="semibold">
                      Historial
                    </Text>
                    <Badge label={String(historyBookings.length)} variant="neutral" />
                  </HStack>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'rewards'}
                  className="rb-pill fx-press"
                  onClick={() => setActiveTab('rewards')}
                >
                  <HStack gap={1.5} align="center">
                    <Text color="inherit" weight="semibold">
                      Sellos y paquetes
                    </Text>
                    {activePackagesCount > 0 ? (
                      <Badge label={String(activePackagesCount)} variant="success" />
                    ) : null}
                  </HStack>
                </button>
              </HStack>
            </VStack>

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
              <VStack
                as="section"
                role="tabpanel"
                gap={3}
                className="pt-card fx-fade-up"
                aria-label="Próximas citas"
              >
                <Heading level={3} className="lk-serif ck-h3">
                  Tus próximas citas
                </Heading>
                {upcomingBookings.length === 0 ? (
                  <VStack gap={3} align="start">
                    <Text color="secondary">
                      Aún no tienes citas próximas agendadas con este número.
                    </Text>
                    <Button
                      label="Agendar mi próxima cita"
                      variant="primary"
                      size="md"
                      className="fx-press"
                      icon={<Sparkles size={16} aria-hidden="true" />}
                      href="/reservar"
                    />
                  </VStack>
                ) : (
                  <VStack gap={3} className="fx-stagger">
                    {upcomingBookings.map((item) => {
                      const statusMeta = resolveStatusMeta(item.status);
                      return (
                        <HStack key={item.id} className="pt-booking-row">
                          <VStack gap={1} className="rb-grow">
                            <HStack gap={2} align="center" wrap="wrap">
                              <Text weight="bold">{item.serviceName}</Text>
                              <Token label={statusMeta.label} size="sm" color={statusMeta.color} />
                              <Text type="code" color="secondary" hasTabularNumbers>
                                {item.bookingCode}
                              </Text>
                            </HStack>
                            <Text type="supporting" color="secondary" hasTabularNumbers>
                              {formatDateLongInTimezone(item.startAt, timezone)} ·{' '}
                              {formatTimeInTimezone(item.startAt, timezone)} · con {item.staffName}
                            </Text>
                            <Text type="supporting" color="secondary" hasTabularNumbers>
                              {formatDuration(item.totalDurationMinutes)} ·{' '}
                              {formatCurrency(item.totalPriceCents, settings.currency)}
                            </Text>
                          </VStack>
                          <HStack gap={2} wrap="wrap">
                            <Button
                              label="Ver mi cita"
                              variant="primary"
                              size="sm"
                              className="fx-press"
                              icon={<ArrowRight size={14} aria-hidden="true" />}
                              href={item.manageUrl}
                            />
                            <Button
                              label="Reagendar"
                              variant="secondary"
                              size="sm"
                              className="fx-press"
                              icon={<RefreshCw size={14} aria-hidden="true" />}
                              href={`${item.manageUrl}?action=reschedule`}
                            />
                          </HStack>
                        </HStack>
                      );
                    })}
                  </VStack>
                )}
              </VStack>
            ) : null}

            {activeTab === 'history' ? (
              <VStack
                as="section"
                role="tabpanel"
                gap={3}
                className="pt-card fx-fade-up"
                aria-label="Historial de citas"
              >
                <Heading level={3} className="lk-serif ck-h3">
                  Historial de visitas
                </Heading>
                {historyBookings.length === 0 ? (
                  <Text color="secondary">
                    Todavía no hay visitas anteriores registradas con este número.
                  </Text>
                ) : (
                  <VStack gap={3} className="fx-stagger">
                    {historyBookings.map((item) => {
                      const statusMeta = resolveStatusMeta(item.status);
                      return (
                        <HStack key={item.id} className="pt-booking-row">
                          <VStack gap={1} className="rb-grow">
                            <HStack gap={2} align="center" wrap="wrap">
                              <Text weight="bold">{item.serviceName}</Text>
                              <Token label={statusMeta.label} size="sm" color={statusMeta.color} />
                              <Text type="code" color="secondary" hasTabularNumbers>
                                {item.bookingCode}
                              </Text>
                            </HStack>
                            <Text type="supporting" color="secondary" hasTabularNumbers>
                              {formatDateShortInTimezone(item.startAt, timezone)} ·{' '}
                              {formatTimeInTimezone(item.startAt, timezone)} · con {item.staffName} ·{' '}
                              {formatCurrency(item.totalPriceCents, settings.currency)}
                            </Text>
                          </VStack>
                          <HStack gap={2} wrap="wrap">
                            <Button
                              label="Volver a agendar"
                              variant="primary"
                              size="sm"
                              className="fx-press"
                              icon={<Sparkles size={14} aria-hidden="true" />}
                              href={item.touchUpUrl}
                            />
                            <Button
                              label="Detalle"
                              variant="secondary"
                              size="sm"
                              className="fx-press"
                              href={item.manageUrl}
                            />
                          </HStack>
                        </HStack>
                      );
                    })}
                  </VStack>
                )}
              </VStack>
            ) : null}

            {activeTab === 'rewards' ? (
              <VStack role="tabpanel" gap={4} aria-label="Sellos y paquetes">
                {snapshot.loyaltySummary ? (
                  <LoyaltyStampCard
                    loyaltySummary={snapshot.loyaltySummary}
                    studioName={settings.name}
                  />
                ) : (
                  <VStack gap={2} className="pt-card">
                    <HStack gap={1.5} align="center">
                      <Gift size={16} aria-hidden="true" className="lk-cereza-text" />
                      <Heading level={3} className="lk-serif ck-h3">
                        Tarjeta de sellos
                      </Heading>
                    </HStack>
                    <Text color="secondary">
                      Aún no tienes sellos acumulados. Al completar tu primera cita aparecerá tu progreso aquí.
                    </Text>
                  </VStack>
                )}

                <VStack as="section" gap={3} className="pt-card fx-fade-up" aria-labelledby="pt-pkg-title">
                  <HStack justify="between" align="center" wrap="wrap" gap={2}>
                    <HStack gap={1.5} align="center">
                      <Package size={18} aria-hidden="true" className="lk-cereza-text" />
                      <Heading level={3} id="pt-pkg-title" className="lk-serif ck-h3">
                        Paquetes de sesiones
                      </Heading>
                    </HStack>
                    <Text type="supporting" color="secondary">
                      Tus sesiones prepagadas vigentes
                    </Text>
                  </HStack>

                  {snapshot.packages.length === 0 ? (
                    <Text color="secondary">
                      No tienes paquetes de sesiones activos en este momento. Pregunta en estudio por nuestros paquetes de retoque.
                    </Text>
                  ) : (
                    <VStack gap={3} className="fx-stagger">
                      {snapshot.packages.map((pkg) => {
                        const pkgMeta = resolvePackageStatusLabel(pkg.status);
                        const pipIndices = Array.from(
                          { length: pkg.totalSessions },
                          (_, i) => i,
                        );
                        return (
                          <VStack key={pkg.id} className="ad-pkg-card">
                            <HStack justify="between" align="center" wrap="wrap" gap={2}>
                              <VStack gap={0}>
                                <Text weight="bold">{pkg.packageName}</Text>
                                <Text type="supporting" color="secondary">
                                  {pkg.serviceName}
                                </Text>
                              </VStack>
                              <Token label={pkgMeta.label} size="sm" color={pkgMeta.color} />
                            </HStack>

                            <ul
                              className="ad-pkg-pips"
                              aria-label={`${pkg.usedSessions} de ${pkg.totalSessions} sesiones usadas`}
                            >
                              {pipIndices.map((idx) => (
                                <li
                                  key={idx}
                                  className="ad-pkg-pip"
                                  data-used={idx < pkg.usedSessions ? 'true' : 'false'}
                                />
                              ))}
                            </ul>

                            <HStack justify="between" align="center" wrap="wrap" gap={2}>
                              <Text type="supporting" weight="semibold" hasTabularNumbers>
                                {pkg.remainingSessions} de {pkg.totalSessions} sesiones disponibles
                              </Text>
                              {pkg.expiresAt ? (
                                <HStack gap={1} align="center">
                                  <Clock size={13} aria-hidden="true" />
                                  <Text type="supporting" color="secondary" hasTabularNumbers>
                                    Vence {formatDateShortInTimezone(pkg.expiresAt, timezone)}
                                  </Text>
                                </HStack>
                              ) : null}
                            </HStack>
                          </VStack>
                        );
                      })}
                    </VStack>
                  )}
                </VStack>
              </VStack>
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
