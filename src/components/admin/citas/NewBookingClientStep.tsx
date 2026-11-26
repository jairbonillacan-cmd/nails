'use client';

import { useMemo } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { SurfaceCard } from '@/components/ui';
import type { ClientProfile } from '@/lib/types';

interface NewBookingClientStepProps {
  clients: ClientProfile[];
  clientName: string;
  clientPhone: string;
  clientInstagram: string;
  onChangeName: (value: string) => void;
  onChangePhone: (value: string) => void;
  onChangeInstagram: (value: string) => void;
  onPickExistingClient: (client: ClientProfile) => void;
}

export function NewBookingClientStep({
  clients,
  clientName,
  clientPhone,
  clientInstagram,
  onChangeName,
  onChangePhone,
  onChangeInstagram,
  onPickExistingClient,
}: NewBookingClientStepProps) {
  const clientSuggestions = useMemo(() => {
    if (clients.length === 0) return [];
    const query = clientName.trim().toLowerCase();
    const phoneDigits = clientPhone.replace(/\D/g, '');
    const exactMatched = clients.some(
      (c) =>
        c.fullName.toLowerCase() === query &&
        phoneDigits.length >= 10 &&
        c.phoneE164.replace(/\D/g, '').endsWith(phoneDigits.slice(-10)),
    );
    if (exactMatched) return [];

    if (query.length >= 2 || phoneDigits.length >= 3) {
      return clients
        .filter((c) => {
          const nameHit = query.length >= 2 && c.fullName.toLowerCase().includes(query);
          const igHit =
            query.length >= 2 && (c.instagramHandle ?? '').toLowerCase().includes(query);
          const phoneHit =
            phoneDigits.length >= 3 && c.phoneE164.replace(/\D/g, '').includes(phoneDigits);
          return nameHit || igHit || phoneHit;
        })
        .slice(0, 4);
    }

    if (!query && !phoneDigits) {
      return clients.slice(0, 3);
    }

    return [];
  }, [clients, clientName, clientPhone]);

  return (
    <SurfaceCard tone="subtle" padded>
      <VStack gap={3}>
        <HStack justify="between" align="center" gap={2} wrap="wrap">
          <Text weight="semibold" size="base">
            1. Clienta
          </Text>
          <Text type="supporting" color="secondary">
            Nombre y WhatsApp obligatorios
          </Text>
        </HStack>

        <Grid columns={{ minWidth: 180, max: 3 }} gap={3}>
          <TextInput
            label="Nombre"
            value={clientName}
            onChange={onChangeName}
            placeholder="Ej. Sofía Ramírez"
            autoComplete="name"
            isRequired
          />
          <TextInput
            type="tel"
            label="WhatsApp"
            value={clientPhone}
            onChange={onChangePhone}
            placeholder="222 123 4567"
            autoComplete="tel"
            inputMode="tel"
            isRequired
          />
          <TextInput
            label="Instagram (opcional)"
            value={clientInstagram}
            onChange={onChangeInstagram}
            placeholder="@usuario"
            autoCapitalize="none"
            hasAutoCorrect={false}
            hasSpellCheck={false}
          />
        </Grid>

        {clientSuggestions.length > 0 ? (
          <VStack gap={1.5}>
            <Text type="supporting" color="secondary">
              {clientName.trim() || clientPhone.trim()
                ? 'Clientas encontradas (toca para rellenar):'
                : 'Clientas frecuentes (toca para rellenar):'}
            </Text>
            <HStack gap={1.5} wrap="wrap">
              {clientSuggestions.map((client) => (
                <Button
                  key={client.id}
                  type="button"
                  size="sm"
                  variant="secondary"
                  label={client.fullName}
                  onClick={() => onPickExistingClient(client)}
                />
              ))}
            </HStack>
          </VStack>
        ) : null}
      </VStack>
    </SurfaceCard>
  );
}
