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
import { ArrowLeft, ArrowRight, Moon, Sun } from 'lucide-react';
import type { AdminRole, AdminUser } from '@/lib/types';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import { LANDING_ASSETS } from '@/components/landing/landingContent';
import { useSalonAppearance } from '@/components/SalonThemeProvider';

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
  const [email, setEmail] = useState('duena@nails.studio');
  const [error, setError] = useState<string | null>(null);
  const [loadingEmail, setLoadingEmail] = useState<string | null>(null);
  const [demoUsers, setDemoUsers] = useState<AdminUser[]>([]);
  const [loadingDemoUsers, setLoadingDemoUsers] = useState(true);

  const isDark = mode === 'dark';
  const brandLogo = isDark ? LANDING_ASSETS.logoWhite : LANDING_ASSETS.logoBlack;

  useExternalSync(
    'admin-login-demo-users',
    useCallback(async (signal) => {
      try {
        const res = await fetch('/api/admin/session', { signal });
        if (signal.aborted || !res.ok) return;
        const json = (await res.json()) as { availableDemoUsers?: AdminUser[] };
        setDemoUsers(json.availableDemoUsers ?? []);
      } catch {
        return;
      } finally {
        if (!signal.aborted) {
          setLoadingDemoUsers(false);
        }
      }
    }, []),
  );

  const signIn = async (targetEmail: string) => {
    setLoadingEmail(targetEmail);
    setError(null);
    try {
      const res = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error || 'No se pudo iniciar sesión');
        return;
      }
      router.push('/admin');
      router.refresh();
    } catch {
      setError('Error de conexión al iniciar sesión.');
    } finally {
      setLoadingEmail(null);
    }
  };

  return (
    <VStack as="main" className="ad-login-wrap" gap={5}>
      <VStack className="ad-login-card fx-fade-up" gap={5}>
        <HStack justify="between" align="center" gap={2}>
          <NextLink href="/" aria-label={`${settings.name}, inicio`} className="ad-logo-link">
            <img
              src={brandLogo}
              alt={settings.name}
              width={118}
              height={34}
              className="ad-logo"
            />
          </NextLink>

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

        <VStack gap={1}>
          <Heading level={1} className="ad-page-title">
            Bienvenida al salón
          </Heading>
          <Text color="secondary" className="ad-page-sub">
            Entra con tu correo de dueña, recepción o manicurista para ver tu agenda del día.
          </Text>
        </VStack>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void signIn(email);
          }}
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
              value={email}
              onChange={setEmail}
              autoComplete="email"
              isRequired
            />

            <Button
              type="submit"
              label="Entrar al salón"
              variant="primary"
              size="lg"
              width="100%"
              isLoading={loadingEmail === email}
              isDisabled={Boolean(loadingEmail)}
            />
          </VStack>
        </form>

        {loadingDemoUsers ? (
          <VStack gap={3} aria-hidden="true">
            <Divider label="Entrar rápido (modo de prueba)" />
            <VStack className="ad-surface" gap={0}>
              <VStack className="ad-row-list" gap={0}>
                {[0, 1, 2].map((idx) => (
                  <HStack
                    key={idx}
                    className="ad-row-item"
                    gap={3}
                    align="center"
                    style={{ flexWrap: 'nowrap', minHeight: '4.25rem' }}
                  >
                    <VStack className="ad-skeleton" data-size="avatar" />
                    <VStack gap={1.5} className="rb-grow">
                      <VStack className="ad-skeleton" data-size="line" data-width="mid" />
                      <VStack className="ad-skeleton" data-size="line" data-width="long" />
                    </VStack>
                  </HStack>
                ))}
              </VStack>
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
                      className="ad-row-item fx-press"
                      disabled={Boolean(loadingEmail)}
                      aria-label={`Entrar como ${displayName} (${meta.label})`}
                      onClick={() => void signIn(u.email)}
                      style={{
                        border: 0,
                        background: 'transparent',
                        width: '100%',
                        minHeight: '4.25rem',
                        flexWrap: 'nowrap',
                        textAlign: 'start',
                        cursor: loadingEmail ? 'wait' : 'pointer',
                        font: 'inherit',
                        color: 'inherit',
                      }}
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
                        <VStack gap={0} className="rb-grow">
                          <HStack gap={1.5} align="center" wrap="wrap">
                            <Text weight="semibold" size="sm">
                              {displayName}
                            </Text>
                            <Text
                              color="inherit"
                              className="ad-chip"
                              data-tone={meta.tone === 'info' ? 'neutral' : meta.tone}
                            >
                              {meta.label}
                            </Text>
                          </HStack>
                          <Text type="supporting" color="secondary" maxLines={1}>
                            {isSigning ? 'Entrando...' : meta.hint}
                          </Text>
                        </VStack>
                      </HStack>
                      <ArrowRight size={15} aria-hidden="true" style={{ flexShrink: 0 }} />
                    </button>
                  );
                })}
              </VStack>
            </VStack>
          </VStack>
        ) : null}

        <HStack justify="center" paddingBlockStart={1}>
          <NextLink href="/" className="ad-foot-link">
            <ArrowLeft size={14} aria-hidden="true" />
            <Text color="inherit" size="sm">
              Volver a la página del salón
            </Text>
          </NextLink>
        </HStack>
      </VStack>
    </VStack>
  );
}
