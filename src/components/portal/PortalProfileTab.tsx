'use client';

import type React from 'react';
import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { TextInput } from '@astryxdesign/core/TextInput';
import { User } from 'lucide-react';
import { SkeletonBlock } from '@/components/ui/SkeletonBlock';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import type { ClientPortalProfile } from '@/lib/contracts';
import { formatPhoneDisplay, getDateKeyInTimezone } from '@/lib/format';
import type { ClientPortalProfileUpdateInput } from '@/lib/hooks/useClientPortalProfile';
import {
  birthdayInputToIso,
  formatBirthdayInput,
  isAcceptableClientEmail,
  normalizeInstagramHandle,
} from '../booking/bookingHelpers';

interface PortalProfileTabProps {
  phoneE164: string;
  fallbackClientName: string;
  timezone: string;
  profile: ClientPortalProfile | null;
  isLoading: boolean;
  loadError: string | null;
  isSaving: boolean;
  saveError: string | null;
  saveSuccess: string | null;
  onRetryLoad: () => void;
  onSave: (input: ClientPortalProfileUpdateInput) => Promise<ClientPortalProfile | null>;
  onDismissFeedback: () => void;
}

interface PortalProfileFormProps {
  initialProfile: ClientPortalProfile;
  fallbackClientName: string;
  timezone: string;
  isSaving: boolean;
  saveError: string | null;
  saveSuccess: string | null;
  onSave: (input: ClientPortalProfileUpdateInput) => Promise<ClientPortalProfile | null>;
  onDismissFeedback: () => void;
}

interface ProfileFieldErrors {
  fullName: string | null;
  email: string | null;
  birthday: string | null;
}

function PortalProfileForm({
  initialProfile,
  fallbackClientName,
  timezone,
  isSaving,
  saveError,
  saveSuccess,
  onSave,
  onDismissFeedback,
}: PortalProfileFormProps) {
  const [fullName, setFullName] = useState(
    initialProfile.fullName.trim() || fallbackClientName.trim(),
  );
  const [email, setEmail] = useState(initialProfile.email ?? '');
  const [instagramHandle, setInstagramHandle] = useState(initialProfile.instagramHandle ?? '');
  const [birthday, setBirthday] = useState(
    initialProfile.birthday ? formatBirthdayInput(initialProfile.birthday) : '',
  );
  const [fieldErrors, setFieldErrors] = useState<ProfileFieldErrors>({
    fullName: null,
    email: null,
    birthday: null,
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSaving) return;
    onDismissFeedback();

    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();
    const trimmedInstagram = instagramHandle.trim();
    const trimmedBirthday = birthday.trim();
    const todayKey = getDateKeyInTimezone(new Date(), timezone);
    const birthdayIso = trimmedBirthday ? birthdayInputToIso(trimmedBirthday, todayKey) : null;

    const nextErrors: ProfileFieldErrors = {
      fullName:
        trimmedName.length < 2
          ? 'Escribe tu nombre completo (mínimo 2 caracteres).'
          : trimmedName.length > 120
            ? 'Tu nombre debe tener máximo 120 caracteres.'
            : null,
      email: isAcceptableClientEmail(trimmedEmail)
        ? null
        : 'Revisa tu correo, parece incompleto.',
      birthday:
        !trimmedBirthday || birthdayIso
          ? null
          : 'Escribe tu cumpleaños como día/mes/año, por ejemplo 15/08/1997.',
    };

    setFieldErrors(nextErrors);
    if (nextErrors.fullName || nextErrors.email || nextErrors.birthday) {
      return;
    }

    const normalizedInstagram = trimmedInstagram
      ? normalizeInstagramHandle(trimmedInstagram, '').slice(0, 120)
      : null;

    const updated = await onSave({
      fullName: trimmedName,
      email: trimmedEmail || null,
      instagramHandle: normalizedInstagram,
      birthday: birthdayIso,
    });

    if (updated) {
      setFullName(updated.fullName);
      setEmail(updated.email ?? '');
      setInstagramHandle(updated.instagramHandle ?? '');
      setBirthday(updated.birthday ? formatBirthdayInput(updated.birthday) : '');
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} noValidate>
      <VStack
        gap={4}
        className="fx-busy"
        data-busy={isSaving ? 'true' : 'false'}
        aria-busy={isSaving}
      >
        {saveSuccess ? (
          <Banner
            status="success"
            role="status"
            title={saveSuccess}
            isDismissable
            dismissLabel="Cerrar aviso"
            onDismiss={onDismissFeedback}
          />
        ) : null}

        {saveError ? (
          <Banner
            status="error"
            role="alert"
            title="No pudimos guardar tus datos"
            description={saveError}
            isDismissable
            dismissLabel="Cerrar aviso"
            onDismiss={onDismissFeedback}
          />
        ) : null}

        <TextInput
          htmlName="portalPhone"
          label="Tu WhatsApp verificado"
          type="tel"
          size="lg"
          value={formatPhoneDisplay(initialProfile.phoneE164)}
          onChange={() => undefined}
          startIcon={<Text weight="semibold">+52</Text>}
          isDisabled
          description="Es el número vinculado a tus citas, sellos y paquetes."
        />

        <TextInput
          htmlName="portalFullName"
          label="Nombre completo"
          placeholder="Ej. Sofía Ramírez"
          autoComplete="name"
          autoCapitalize="words"
          size="lg"
          value={fullName}
          onChange={(val) => {
            setFullName(val);
            if (fieldErrors.fullName) setFieldErrors((prev) => ({ ...prev, fullName: null }));
            if (saveSuccess || saveError) onDismissFeedback();
          }}
          status={fieldErrors.fullName ? { type: 'error', message: fieldErrors.fullName } : undefined}
          isDisabled={isSaving}
          isRequired
        />

        <TextInput
          htmlName="portalEmail"
          label="Correo electrónico"
          type="email"
          autoComplete="email"
          placeholder="sofia@ejemplo.com"
          size="lg"
          value={email}
          onChange={(val) => {
            setEmail(val);
            if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: null }));
            if (saveSuccess || saveError) onDismissFeedback();
          }}
          status={fieldErrors.email ? { type: 'error', message: fieldErrors.email } : undefined}
          isDisabled={isSaving}
          isOptional
          description="Te sirve para recibir confirmaciones y recordatorios de respaldo."
        />

        <TextInput
          htmlName="portalInstagram"
          label="Instagram"
          placeholder="@tuusuario"
          autoComplete="username"
          size="lg"
          value={instagramHandle}
          onChange={(val) => {
            setInstagramHandle(val);
            if (saveSuccess || saveError) onDismissFeedback();
          }}
          isDisabled={isSaving}
          isOptional
          description="Así te ubicamos más rápido cuando nos compartes tu diseño de inspiración."
        />

        <TextInput
          htmlName="portalBirthday"
          label="Cumpleaños"
          inputMode="numeric"
          placeholder="DD/MM/AAAA"
          size="lg"
          value={birthday}
          onChange={(val) => {
            setBirthday(formatBirthdayInput(val));
            if (fieldErrors.birthday) setFieldErrors((prev) => ({ ...prev, birthday: null }));
            if (saveSuccess || saveError) onDismissFeedback();
          }}
          status={fieldErrors.birthday ? { type: 'error', message: fieldErrors.birthday } : undefined}
          isDisabled={isSaving}
          isOptional
          description="Formato día/mes/año, por ejemplo 15/08/1997."
        />

        <HStack justify="end">
          <Button
            type="submit"
            label={isSaving ? 'Guardando…' : 'Guardar cambios'}
            variant="primary"
            size="lg"
            width="100%"
            className="fx-press"
            isLoading={isSaving}
            isDisabled={isSaving}
          />
        </HStack>
      </VStack>
    </form>
  );
}

export function PortalProfileTab({
  phoneE164,
  fallbackClientName,
  timezone,
  profile,
  isLoading,
  loadError,
  isSaving,
  saveError,
  saveSuccess,
  onRetryLoad,
  onSave,
  onDismissFeedback,
}: PortalProfileTabProps) {
  return (
    <SurfaceCard
      id="pt-profile-title"
      headingLevel={2}
      title="Mis datos"
      subtitle="Mantén actualizada tu información para agilizar tus próximas reservas."
      icon={<User size={18} aria-hidden="true" className="lk-cereza-text" />}
      padded
      className="pt-card fx-fade-up"
    >
      {isLoading && !profile ? (
        <VStack gap={3} aria-busy="true">
          <Text type="supporting" color="secondary" role="status" aria-live="polite">
            Cargando tus datos...
          </Text>
          <SkeletonBlock width="100%" height="3.25rem" radius={2} index={0} />
          <SkeletonBlock width="100%" height="3.25rem" radius={2} index={1} />
          <SkeletonBlock width="100%" height="3.25rem" radius={2} index={2} />
        </VStack>
      ) : loadError && !profile ? (
        <Banner
          collapsible={false}
          status="error"
          role="alert"
          title="No pudimos cargar tus datos"
          description={loadError}
        >
          <HStack justify="start" paddingBlockStart={2}>
            <Button
              type="button"
              label="Reintentar"
              variant="primary"
              size="md"
              className="fx-press"
              onClick={onRetryLoad}
            />
          </HStack>
        </Banner>
      ) : profile ? (
        <PortalProfileForm
          key={`profile-${profile.phoneE164}`}
          initialProfile={profile}
          fallbackClientName={fallbackClientName}
          timezone={timezone}
          isSaving={isSaving}
          saveError={saveError}
          saveSuccess={saveSuccess}
          onSave={onSave}
          onDismissFeedback={onDismissFeedback}
        />
      ) : (
        <VStack gap={2}>
          <Text type="supporting" color="secondary">
            Cargando perfil para +52 {formatPhoneDisplay(phoneE164)}...
          </Text>
        </VStack>
      )}
    </SurfaceCard>
  );
}
