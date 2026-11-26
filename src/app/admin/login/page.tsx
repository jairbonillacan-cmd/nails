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
import { ArrowLeft, ArrowRight, Eye, EyeOff, MapPin, Moon, Sun } from 'lucide-react';
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
    hint: 'Ve y cambia todo',
    tone: 'accent',
  },
  admin: {
    label: 'Recepción',
    hint: 'Agenda, cobros y clientas',
    tone: 'info',
  },
  specialist: {
    label: 'Profesional',
    hint: 'Sus citas y comisiones',
    tone: 'neutral',
  },
};

const LOGIN_PHOTO = '/landing/sets/07-rubi-y-negro-4x5.webp';

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
      setError('Escribe tu correo.');
      return;
    }
    if (authMode === 'supabase' && !(targetPassword ?? '').trim()) {
      setError('Escribe tu contraseña.');
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
        setError(json?.error || 'El correo o la contraseña no coinciden.');
        return;
      }
      router.push('/admin');
      router.refresh();
    } catch {
      setError('No hay conexión. Revisa tu internet e intenta otra vez.');
    } finally {
      setLoadingEmail(null);
    }
  };

  const isFormDisabled = Boolean(loadingEmail) || authMode === 'disabled';

  return (
    <VStack as="main" className="ad-login-wrap" gap={0}>
      <VStack className="ad-login-frame fx-fade-up" gap={0}>
        <VStack className="ad-login-mobile-bar" gap={0} aria-hidden="true" />
        <VStack as="aside" className="ad-login-brand" justify="between" gap={6} aria-label={settings.name}>
          <img
            src={LOGIN_PHOTO}
            alt=""
            aria-hidden="true"
            width={800}
            height={1000}
            className="ad-login-photo"
            decoding="async"
          />
          <NextLink href="/" aria-label={`${settings.name}, inicio`} className="ad-logo-link">
            <img
              src={LANDING_ASSETS.logoWhite}
              alt={settings.name}
              width={132}
              height={38}
              className="ad-logo"
            />
          </NextLink>
          <VStack gap={1}>
            <Text color="inherit" weight="semibold">
              {settings.name}
            </Text>
            <HStack gap={1.5} align="center" className="ad-login-brand-sub">
              <MapPin size={14} aria-hidden="true" />
              <Text color="inherit" type="supporting">
                {settings.address}
              </Text>
            </HStack>
          </VStack>
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
              <Heading level={1} className="ad-page-title">
                Entrar
              </Heading>
              <Text color="secondary" className="ad-page-sub">
                Con el correo que tienes registrado en {settings.name}.
              </Text>
            </VStack>

            {activeSession ? (
              <Banner
                status="success"
                role="status"
                title={`Ya entraste como ${cleanDemoDisplayName(activeSession.user.fullName)}`}
                description="Puedes seguir a la agenda o entrar con otra cuenta."
                endContent={
                  <Button
                    label="Ir a la agenda"
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
                title="Todavía no se puede entrar aquí"
                description="Falta conectar las cuentas del equipo en este sitio. Pídele a quien lo administra que lo active."
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
                  label="Correo"
                  type="email"
                  size="lg"
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
                      label="Contraseña"
                      type={showPassword ? 'text' : 'password'}
                      size="lg"
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
                        label={showPassword ? 'Ocultar' : 'Mostrar'}
                        aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        onClick={() => setShowPassword((prev) => !prev)}
                      />
                    </HStack>
                  </VStack>
                ) : null}

                <Button
                  type="submit"
                  label="Entrar"
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
                <Divider />
                <VStack className="ad-surface" gap={2} padding={3}>
                  <SkeletonBlock width="100%" height="3.5rem" radius={2} index={0} />
                  <SkeletonBlock width="100%" height="3.5rem" radius={2} index={1} />
                </VStack>
              </VStack>
            ) : demoUsers.length > 0 ? (
              <VStack gap={3}>
                <Divider label="Cuentas de prueba" />
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
                                {isSigning ? 'Entrando…' : meta.hint}
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

          <HStack justify="start" align="center" gap={2} className="ad-login-foot">
            <NextLink href="/" className="ad-foot-link">
              <ArrowLeft size={14} aria-hidden="true" />
              <Text color="inherit" size="sm">
                Volver a la página
              </Text>
            </NextLink>
          </HStack>
        </VStack>
      </VStack>
    </VStack>
  );
}
