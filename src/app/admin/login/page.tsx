'use client';

import { useCallback, useState } from 'react';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  Eye,
  EyeOff,
  Lock,
  Mail,
  MapPin,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
} from 'lucide-react';
import type { AdminRole, AdminUser } from '@/lib/types';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import { LANDING_ASSETS } from '@/components/landing/landingContent';
import { useSalonAppearance } from '@/components/SalonThemeProvider';
import { StatusTag } from '@/components/ui/StatusTag';
import { SkeletonBlock } from '@/components/ui/SkeletonBlock';

type AuthMode = 'supabase' | 'demo' | 'disabled';

interface ActiveSessionInfo {
  user: AdminUser;
  isDemo: boolean;
}

const ROLE_META: Record<
  AdminRole,
  { label: string; hint: string; tone: 'accent' | 'info' | 'neutral' }
> = {
  owner: {
    label: 'Dueña',
    hint: 'Todo el salón, mi página y conexiones',
    tone: 'accent',
  },
  admin: {
    label: 'Recepción',
    hint: 'Agenda, cobros, clientas y productos',
    tone: 'info',
  },
  specialist: {
    label: 'Manicurista',
    hint: 'Sus citas, horarios y comisiones',
    tone: 'neutral',
  },
};

const BRAND_HIGHLIGHTS = [
  {
    id: 'agenda',
    icon: CalendarCheck,
    title: 'Agenda en vivo sin empates',
    desc: 'Turnos fijos, bloqueos y apartados de 5 minutos siempre sincronizados.',
  },
  {
    id: 'reminders',
    icon: Sparkles,
    title: 'Recordatorios y fidelidad',
    desc: 'Avisos automáticos por WhatsApp, tarjeta de sellos y paquetes.',
  },
  {
    id: 'security',
    icon: ShieldCheck,
    title: 'Control por rol y anticipos',
    desc: 'Permisos separados para dueña, recepción y manicuristas.',
  },
] as const;

function cleanDemoDisplayName(fullName: string): string {
  const stripped = fullName.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return stripped || fullName.trim();
}

function getInitials(fullName: string): string {
  const parts = cleanDemoDisplayName(fullName).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'LN';
  if (parts.length === 1) return (parts[0] ?? 'LN').slice(0, 2).toUpperCase();
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase();
}

export default function AdminLoginPage() {
  const router = useRouter();
  const { mode, setMode, settings } = useSalonAppearance();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingEmail, setLoadingEmail] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<ActiveSessionInfo | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [demoUsers, setDemoUsers] = useState<AdminUser[]>([]);
  const [loadingSession, setLoadingSession] = useState(true);

  const isDark = mode === 'dark';
  const brandLogo = isDark ? LANDING_ASSETS.logoWhite : LANDING_ASSETS.logoBlack;

  useExternalSync(
    'admin-login-session-probe',
    useCallback(async (signal) => {
      try {
        const res = await fetch('/api/admin/session', { signal });
        if (signal.aborted || !res.ok) return;
        const json = (await res.json()) as {
          session?: ActiveSessionInfo | null;
          availableDemoUsers?: AdminUser[];
          authMode?: AuthMode;
        };
        const users = json.availableDemoUsers ?? [];
        const resolvedMode: AuthMode =
          json.authMode ?? (users.length > 0 ? 'demo' : 'disabled');
        setActiveSession(json.session ?? null);
        setDemoUsers(users);
        setAuthMode(resolvedMode);
        if (resolvedMode === 'demo' && users[0]) {
          setEmail((prev) => prev || users[0]?.email || 'duena@nails.studio');
        }
      } catch {
        return;
      } finally {
        if (!signal.aborted) {
          setLoadingSession(false);
        }
      }
    }, []),
  );

  const signIn = async (targetEmail: string, targetPassword?: string) => {
    const cleanEmail = targetEmail.trim();
    if (!cleanEmail) {
      setError('Escribe tu correo electrónico para entrar.');
      return;
    }
    if (authMode === 'supabase' && !(targetPassword ?? '').trim()) {
      setError('Escribe tu contraseña para iniciar sesión.');
      return;
    }

    setLoadingEmail(cleanEmail);
    setError(null);
    try {
      const payload =
        authMode === 'supabase'
          ? { email: cleanEmail, password: targetPassword ?? '' }
          : { email: cleanEmail };
      const res = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error || 'No pudimos iniciar sesión. Revisa tus datos.');
        return;
      }
      router.push('/admin');
      router.refresh();
    } catch {
      setError('Error de conexión al iniciar sesión. Revisa tu internet.');
    } finally {
      setLoadingEmail(null);
    }
  };

  const isFormDisabled = Boolean(loadingEmail) || authMode === 'disabled';

  return (
    <VStack as="main" className="ad-login-wrap" gap={0}>
      <VStack className="ad-login-frame fx-fade-up" gap={0}>
        <VStack className="ad-login-mobile-bar" gap={0} aria-hidden="true" />
        <VStack as="aside" className="ad-login-brand" justify="between" gap={6} aria-label={`Identidad de ${settings.name}`}>
          <VStack gap={5}>
            <HStack justify="between" align="center" gap={2} wrap="wrap">
              <NextLink href="/" aria-label={`${settings.name}, inicio`} className="ad-logo-link">
                <img
                  src={LANDING_ASSETS.logoWhite}
                  alt={settings.name}
                  width={132}
                  height={38}
                  className="ad-logo"
                />
              </NextLink>
              <Text color="inherit" className="ad-login-pill">
                Panel del equipo
              </Text>
            </HStack>

            <VStack gap={2}>
              <Heading level={2} color="inherit" className="lk-serif ad-login-brand-title">
                Tu estudio, en calma y al día
              </Heading>
              <img
                src={LANDING_ASSETS.strokePorcelain}
                alt=""
                aria-hidden="true"
                width={150}
                height={18}
                className="ad-login-stroke"
              />
              <Text color="inherit" className="ad-login-brand-sub" textWrap="pretty">
                Revisa citas del día, confirma anticipos y atiende a tus clientas desde el celular o la computadora.
              </Text>
            </VStack>

            <VStack as="ul" gap={3} className="ad-login-points">
              {BRAND_HIGHLIGHTS.map((item) => {
                const Icon = item.icon;
                return (
                  <HStack as="li" key={item.id} gap={3} align="start">
                    <VStack className="ad-login-point-icon" align="center" justify="center" aria-hidden="true">
                      <Icon size={16} />
                    </VStack>
                    <VStack gap={0.5} className="rb-grow">
                      <Text color="inherit" weight="semibold" size="sm">
                        {item.title}
                      </Text>
                      <Text color="inherit" type="supporting" className="ad-login-brand-sub">
                        {item.desc}
                      </Text>
                    </VStack>
                  </HStack>
                );
              })}
            </VStack>
          </VStack>

          <HStack justify="between" align="center" wrap="wrap" gap={2} className="ad-login-brand-sub">
            <HStack gap={1.5} align="center">
              <MapPin size={14} aria-hidden="true" />
              <Text color="inherit" type="supporting">
                {settings.address}
              </Text>
            </HStack>
            <HStack gap={1} align="center">
              <Lock size={12} aria-hidden="true" />
              <Text color="inherit" type="supporting">
                Sesión cifrada
              </Text>
            </HStack>
          </HStack>
        </VStack>

        <VStack className="ad-login-panel" justify="between" gap={5}>
          <VStack gap={5}>
            <HStack justify="between" align="center" gap={2}>
              <NextLink href="/" aria-label={`${settings.name}, inicio`} className="ad-logo-link ad-login-mobile-logo">
                <img
                  src={brandLogo}
                  alt={settings.name}
                  width={118}
                  height={34}
                  className="ad-logo"
                />
              </NextLink>
              <HStack gap={2} align="center" className="ad-login-topbar-end">
                <button
                  type="button"
                  className="ad-pill fx-press"
                  aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                  aria-pressed={isDark}
                  onClick={() => setMode(isDark ? 'light' : 'dark')}
                >
                  {isDark ? <Sun size={14} aria-hidden="true" /> : <Moon size={14} aria-hidden="true" />}
                  <Text color="inherit" size="sm" weight="semibold">
                    {isDark ? 'Claro' : 'Oscuro'}
                  </Text>
                </button>
              </HStack>
            </HStack>

            <VStack gap={1}>
              <Text type="supporting" weight="semibold" color="accent">
                Acceso privado · {settings.name}
              </Text>
              <Heading level={1} className="ad-page-title">
                Bienvenida al salón
              </Heading>
              <Text color="secondary" className="ad-page-sub">
                {authMode === 'supabase'
                  ? 'Ingresa tu correo y contraseña de equipo para abrir tu agenda del día.'
                  : 'Entra con tu cuenta de dueña, recepción o manicurista para gestionar tu día.'}
              </Text>
            </VStack>

            {activeSession ? (
              <Banner
                status="success"
                role="status"
                title={`Ya tienes sesión activa como ${cleanDemoDisplayName(activeSession.user.fullName)}`}
                description="Puedes continuar directo a tu panel o cambiar de cuenta abajo."
                endContent={
                  <Button
                    label="Ir a mi panel"
                    variant="primary"
                    size="md"
                    href="/admin"
                    className="fx-press"
                  />
                }
              />
            ) : null}

            {!loadingSession && authMode === 'disabled' ? (
              <Banner
                status="info"
                role="status"
                title="Acceso pendiente de activar"
                description="Este entorno tiene desactivado el acceso de prueba sin contraseña. Activa las credenciales del estudio para iniciar sesión con tu equipo."
              />
            ) : null}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void signIn(email, password);
              }}
              noValidate
            >
              <VStack gap={4}>
                {error ? (
                  <Banner
                    status="error"
                    role="alert"
                    title={error}
                    isDismissable
                    onDismiss={() => setError(null)}
                  />
                ) : null}

                <TextInput
                  label="Tu correo"
                  type="email"
                  size="lg"
                  placeholder="karla@laikonanails.com"
                  startIcon={<Mail size={16} aria-hidden="true" />}
                  value={email}
                  onChange={(nextValue) => {
                    setEmail(nextValue);
                    if (error) setError(null);
                  }}
                  autoComplete="email"
                  isDisabled={isFormDisabled}
                  isRequired
                />

                {authMode === 'supabase' ? (
                  <VStack gap={1.5}>
                    <TextInput
                      label="Tu contraseña"
                      type={showPassword ? 'text' : 'password'}
                      size="lg"
                      placeholder="••••••••"
                      startIcon={<Lock size={16} aria-hidden="true" />}
                      value={password}
                      onChange={(nextValue) => {
                        setPassword(nextValue);
                        if (error) setError(null);
                      }}
                      autoComplete="current-password"
                      isDisabled={isFormDisabled}
                      isRequired
                    />
                    <HStack justify="end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="fx-press"
                        icon={showPassword ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
                        label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        onClick={() => setShowPassword((prev) => !prev)}
                      />
                    </HStack>
                  </VStack>
                ) : null}

                <Button
                  type="submit"
                  label="Entrar al salón"
                  variant="primary"
                  size="lg"
                  width="100%"
                  className="fx-press"
                  isLoading={loadingEmail !== null && loadingEmail === email.trim()}
                  isDisabled={isFormDisabled}
                />
              </VStack>
            </form>

            {loadingSession ? (
              <VStack gap={3} aria-hidden="true">
                <Divider label="Verificando acceso del estudio" />
                <VStack className="ad-surface" gap={2} padding={3}>
                  <SkeletonBlock width="100%" height="3.5rem" radius={2} index={0} />
                  <SkeletonBlock width="100%" height="3.5rem" radius={2} index={1} />
                </VStack>
              </VStack>
            ) : demoUsers.length > 0 ? (
              <VStack gap={3}>
                <Divider label="Entrar rápido (modo de prueba)" />
                <VStack className="ad-surface" gap={0}>
                  <VStack className="ad-row-list fx-stagger" gap={0}>
                    {demoUsers.map((u) => {
                      const meta = ROLE_META[u.role];
                      const displayName = cleanDemoDisplayName(u.fullName);
                      const isSigning = loadingEmail === u.email;
                      return (
                        <button
                          key={u.id}
                          type="button"
                          className="ad-row-item ad-login-demo-btn fx-press"
                          disabled={Boolean(loadingEmail)}
                          aria-label={`Entrar como ${displayName} (${meta.label})`}
                          onClick={() => void signIn(u.email)}
                        >
                          <HStack gap={3} align="center" className="rb-grow" style={{ flexWrap: 'nowrap' }}>
                            <Text
                              color="inherit"
                              weight="bold"
                              className="ad-avatar"
                              aria-hidden="true"
                              style={{ flexShrink: 0 }}
                            >
                              {getInitials(displayName)}
                            </Text>
                            <VStack gap={0.5} className="rb-grow">
                              <HStack gap={1.5} align="center" wrap="wrap">
                                <Text weight="semibold" size="sm">
                                  {displayName}
                                </Text>
                                <StatusTag label={meta.label} tone={meta.tone} size="sm" />
                              </HStack>
                              <Text type="supporting" color="secondary" maxLines={1}>
                                {isSigning ? 'Entrando al panel…' : meta.hint}
                              </Text>
                            </VStack>
                          </HStack>
                          <ArrowRight size={15} aria-hidden="true" className="ad-login-demo-arrow" />
                        </button>
                      );
                    })}
                  </VStack>
                </VStack>
              </VStack>
            ) : null}
          </VStack>

          <HStack justify="between" align="center" wrap="wrap" gap={2} className="ad-login-foot">
            <NextLink href="/" className="ad-foot-link">
              <ArrowLeft size={14} aria-hidden="true" />
              <Text color="inherit" size="sm">
                Página del salón
              </Text>
            </NextLink>
            <NextLink href="/reservar" className="ad-foot-link">
              <CalendarCheck size={14} aria-hidden="true" />
              <Text color="inherit" size="sm">
                Ver agenda pública
              </Text>
            </NextLink>
          </HStack>
        </VStack>
      </VStack>
    </VStack>
  );
}
