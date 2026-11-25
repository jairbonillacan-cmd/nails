'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Section } from '@astryxdesign/core/Section';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { Link } from '@astryxdesign/core/Link';
import { Sparkles } from 'lucide-react';
import type { AdminUser } from '@/lib/types';
import { useExternalSync } from '@/lib/hooks/useExternalSync';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('duena@nails.studio');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [demoUsers, setDemoUsers] = useState<AdminUser[]>([]);

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
      }
    }, []),
  );

  const signIn = async (targetEmail: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'No se pudo iniciar sesión');
        return;
      }
      router.push('/admin');
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Section variant="transparent" paddingBlock={10} paddingInline={4}>
      <VStack gap={5} maxWidth={440} width="100%" style={{ marginInline: 'auto' }}>
        <VStack gap={1.5} align="center">
          <Sparkles size={28} aria-hidden="true" />
          <Heading level={1}>Acceso al panel</Heading>
          <Text color="secondary" justify="center">
            Ingresa con tu correo de administradora, recepción o manicurista.
          </Text>
        </VStack>

        <Card padding={6} elevation="low">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void signIn(email);
            }}
          >
            <VStack gap={4}>
              {error ? <Banner status="error" title={error} /> : null}
              <TextInput
                label="Correo electrónico"
                type="email"
                value={email}
                onChange={setEmail}
                isRequired
              />
              <Button
                type="submit"
                label="Entrar al panel"
                variant="primary"
                width="100%"
                isLoading={loading}
              />

              {demoUsers.length > 0 ? (
                <>
                  <Divider label="Acceso rápido en Modo Demo" />
                  <VStack gap={2}>
                    {demoUsers.map((u) => (
                      <Button
                        key={u.id}
                        label={`${u.fullName} (${u.role})`}
                        variant="secondary"
                        size="sm"
                        width="100%"
                        onClick={() => void signIn(u.email)}
                      />
                    ))}
                  </VStack>
                </>
              ) : null}
            </VStack>
          </form>
        </Card>

        <HStack justify="center">
          <Link href="/" type="supporting">
            Volver a la página pública del salón
          </Link>
        </HStack>
      </VStack>
    </Section>
  );
}
