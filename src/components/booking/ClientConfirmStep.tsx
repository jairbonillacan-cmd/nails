'use client';

import type React from 'react';
import { useRef, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Link } from '@astryxdesign/core/Link';
import { List, ListItem } from '@astryxdesign/core/List';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { FileInput } from '@astryxdesign/core/FileInput';
import { Check, Clock, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';
import type { AvailableSlot } from '@/lib/availability/engine';
import { formatCurrency, formatDateShortInTimezone, formatTimeInTimezone } from '@/lib/format';
import type { PublicServiceDTO, PublicSettingsDTO } from '@/lib/public-dto';
import type { ServiceAddon } from '@/lib/types';
import type { ActiveBookingSummary, AppliedCouponState } from './bookingApi';
import { DepositCard } from './DepositCard';
import {
  formatFileSize,
  hasConfiguredDeposit,
  prefersReducedMotion,
  readFileAsDataUrl,
  validateClientBookingFields,
  validateClientImageFile,
  type ClientFieldErrors,
  type ProofDeliveryMethod,
} from './bookingHelpers';

interface ClientConfirmStepProps {
  formId: string;
  settings: PublicSettingsDTO;
  selectedService: PublicServiceDTO | undefined;
  selectedExtraServices: PublicServiceDTO[];
  activeSelectedAddons: ServiceAddon[];
  selectedSlot: AvailableSlot | null;
  timeFormat: '12h' | '24h';
  totalDurationMinutes: number;
  subtotalCents: number;
  totalPriceCents: number;
  depositAmountCents: number;
  couponInput: string;
  appliedCoupon: AppliedCouponState | null;
  couponError: string | null;
  couponLoading: boolean;
  clientName: string;
  clientPhone: string;
  clientInstagram: string;
  clientEmail: string;
  clientBirthday: string;
  clientNotes: string;
  inspoFile: File | null;
  inspoDataUrl: string | null;
  proofDeliveryMethod: ProofDeliveryMethod;
  proofFile: File | null;
  proofDataUrl: string | null;
  privacyConsentAccepted: boolean;
  marketingOptIn: boolean;
  privacyConsentError: string | null;
  fieldErrors: ClientFieldErrors;
  formError: string | null;
  formErrorCode: string | null;
  activeBookings: ActiveBookingSummary[];
  isSubmitting: boolean;
  holdExpired: boolean;
  holdExpiredMessage: string | null;
  isReholding: boolean;
  onReholdSlot: () => void;
  onPickAnotherTime: () => void;
  onChangeCouponInput: (value: string) => void;
  onApplyCoupon: () => void;
  onRemoveCoupon: () => void;
  onChangeClientName: (value: string) => void;
  onChangeClientPhone: (value: string) => void;
  onChangeClientInstagram: (value: string) => void;
  onChangeClientEmail: (value: string) => void;
  onChangeClientBirthday: (value: string) => void;
  onChangeClientNotes: (value: string) => void;
  onChangeInspoFile: (file: File | null, dataUrl: string | null) => void;
  onChangeProofMethod: (method: ProofDeliveryMethod) => void;
  onChangeProofFile: (file: File | null, dataUrl: string | null) => void;
  onChangePrivacyConsent: (accepted: boolean) => void;
  onChangeMarketingOptIn: (optedIn: boolean) => void;
  onSubmit: (e: React.FormEvent) => void;
}

function resolveErrorTitle(code: string | null): string {
  if (code === 'MAX_ACTIVE_BOOKINGS') return 'Límite de citas activas alcanzado';
  if (code === 'PRIVACY_CONSENT_REQUIRED') return 'Confirma el Aviso de Privacidad';
  return 'No pudimos registrar la cita';
}

function focusFieldSmoothly(
  primary: HTMLInputElement | null,
  form: HTMLFormElement,
  fallbackSelector: string,
): void {
  const target = primary ?? form.querySelector<HTMLElement>(fallbackSelector);
  if (!target) return;
  target.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'center',
  });
  target.focus({ preventScroll: true });
}

export function ClientConfirmStep({
  formId,
  settings,
  selectedService,
  selectedExtraServices,
  activeSelectedAddons,
  selectedSlot,
  timeFormat,
  totalDurationMinutes,
  subtotalCents,
  totalPriceCents,
  depositAmountCents,
  couponInput,
  appliedCoupon,
  couponError,
  couponLoading,
  clientName,
  clientPhone,
  clientInstagram,
  clientEmail,
  clientBirthday,
  clientNotes,
  inspoFile,
  inspoDataUrl,
  proofDeliveryMethod,
  proofFile,
  proofDataUrl,
  privacyConsentAccepted,
  marketingOptIn,
  privacyConsentError,
  fieldErrors,
  formError,
  formErrorCode,
  activeBookings,
  isSubmitting,
  holdExpired,
  holdExpiredMessage,
  isReholding,
  onReholdSlot,
  onPickAnotherTime,
  onChangeCouponInput,
  onApplyCoupon,
  onRemoveCoupon,
  onChangeClientName,
  onChangeClientPhone,
  onChangeClientInstagram,
  onChangeClientEmail,
  onChangeClientBirthday,
  onChangeClientNotes,
  onChangeInspoFile,
  onChangeProofMethod,
  onChangeProofFile,
  onChangePrivacyConsent,
  onChangeMarketingOptIn,
  onSubmit,
}: ClientConfirmStepProps) {
  const nameInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const privacyCheckboxRef = useRef<HTMLInputElement>(null);
  const inspoReplaceRef = useRef<HTMLInputElement>(null);

  const [inspoProgress, setInspoProgress] = useState<number | null>(null);
  const [inspoError, setInspoError] = useState<string | null>(null);

  const showDepositCard = hasConfiguredDeposit(settings, depositAmountCents);
  const allowInspo =
    Boolean(selectedService?.allowInspoPhoto) || selectedExtraServices.some((srv) => srv.allowInspoPhoto);
  const policyVersion = settings.privacyPolicyVersion || '2026-11';
  const timezone = settings.timezone || 'America/Mexico_City';
  const showFormBanner =
    Boolean(formError) &&
    formErrorCode !== 'PRIVACY_CONSENT_REQUIRED' &&
    !fieldErrors.name &&
    !fieldErrors.phone;

  const processInspoFile = async (file: File | null) => {
    if (!file) {
      setInspoError(null);
      setInspoProgress(null);
      onChangeInspoFile(null, null);
      return;
    }
    setInspoError(null);
    const validationError = await validateClientImageFile(file);
    if (validationError) {
      setInspoProgress(null);
      setInspoError(validationError);
      return;
    }
    setInspoProgress(15);
    try {
      const url = await readFileAsDataUrl(file, setInspoProgress);
      onChangeInspoFile(file, url);
    } catch {
      setInspoError('No pudimos leer esta imagen. Intenta con otra foto PNG, JPG o WEBP.');
    } finally {
      setInspoProgress(null);
    }
  };

  const handleInspoReplace = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (nextFile) {
      void processInspoFile(nextFile);
    }
  };

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const errors = validateClientBookingFields(clientName, clientPhone);
    if (errors.name) {
      focusFieldSmoothly(
        nameInputRef.current,
        e.currentTarget,
        'input[name="clientName"]',
      );
    } else if (errors.phone) {
      focusFieldSmoothly(
        phoneInputRef.current,
        e.currentTarget,
        'input[name="clientPhone"]',
      );
    } else if (!privacyConsentAccepted) {
      focusFieldSmoothly(
        privacyCheckboxRef.current,
        e.currentTarget,
        'input[name="privacyConsentAccepted"]',
      );
    }
    onSubmit(e);
  };

  return (
    <form id={formId} onSubmit={handleFormSubmit} noValidate>
      <VStack
        gap={5}
        className="fx-step-in fx-busy"
        data-busy={isSubmitting ? 'true' : 'false'}
        aria-busy={isSubmitting ? 'true' : 'false'}
      >
        <VStack gap={0.5}>
          <Heading level={2} className="lk-serif rb-h2">
            Casi lista
          </Heading>
          <Text color="secondary">Sin cuenta ni contraseña. Te confirmamos por WhatsApp.</Text>
        </VStack>

        {holdExpired ? (
          <VStack className="fx-fade-up">
            <Banner
              status="warning"
              title="Tu apartado temporal terminó"
              description={
                holdExpiredMessage ||
                'Tus datos y archivos siguen guardados. Reverifica si ese horario sigue libre o elige otro sin empezar de cero.'
              }
              icon={<Clock size={18} aria-hidden="true" />}
            >
              <HStack gap={2} wrap="wrap" paddingBlockStart={2}>
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  className="fx-press"
                  label={isReholding ? 'Verificando horario…' : 'Volver a apartar este horario'}
                  isLoading={isReholding}
                  isDisabled={isReholding}
                  onClick={onReholdSlot}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  className="fx-press"
                  label="Elegir otro horario"
                  isDisabled={isReholding}
                  onClick={onPickAnotherTime}
                />
              </HStack>
            </Banner>
          </VStack>
        ) : null}

        {showFormBanner ? (
          <VStack className="fx-fade-up">
            <Banner
              status="error"
              title={resolveErrorTitle(formErrorCode)}
              description={formError ?? ''}
              icon={<ShieldAlert size={18} aria-hidden="true" />}
            />
          </VStack>
        ) : null}

        {activeBookings.length > 0 ? (
          <VStack gap={3} padding={4} className="rb-note fx-fade-up">
            <VStack gap={0.5}>
              <Heading level={3}>Tus citas activas</Heading>
              <Text type="supporting" color="secondary">
                Reprograma cualquiera sin perder tu anticipo ni volver a capturar tus datos:
              </Text>
            </VStack>
            <List hasDividers density="balanced">
              {activeBookings.map((item) => (
                <ListItem
                  key={item.bookingCode}
                  label={`${item.serviceName} · ${item.bookingCode}`}
                  description={
                    <Text type="supporting" color="secondary" hasTabularNumbers>
                      {formatDateShortInTimezone(item.startAt, timezone)} ·{' '}
                      {formatTimeInTimezone(item.startAt, timezone, timeFormat === '24h')} · {item.staffName}
                    </Text>
                  }
                  endContent={
                    <Button
                      label="Reprogramar"
                      variant="primary"
                      size="md"
                      icon={<RefreshCw size={14} aria-hidden="true" />}
                      href={`${item.manageUrl}?action=reschedule`}
                    />
                  }
                />
              ))}
            </List>
          </VStack>
        ) : null}

        <VStack as="fieldset" gap={3} className="rb-fieldset">
          <legend className="rb-legend">Tus datos</legend>
          <TextInput
            ref={nameInputRef}
            htmlName="clientName"
            label="Nombre y apellido"
            placeholder="Ej. Sofía Ramírez"
            autoComplete="name"
            autoCapitalize="words"
            enterKeyHint="next"
            size="lg"
            value={clientName}
            onChange={onChangeClientName}
            isDisabled={isSubmitting}
            isRequired
            status={fieldErrors.name ? { type: 'error', message: fieldErrors.name } : undefined}
            statusVariant="detached"
          />
          <TextInput
            ref={phoneInputRef}
            htmlName="clientPhone"
            label="WhatsApp"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            enterKeyHint="done"
            size="lg"
            placeholder="222 123 4567"
            startIcon={<Text weight="semibold">+52</Text>}
            value={clientPhone}
            onChange={onChangeClientPhone}
            isDisabled={isSubmitting}
            isRequired
            status={fieldErrors.phone ? { type: 'error', message: fieldErrors.phone } : undefined}
            statusVariant="detached"
          />
        </VStack>

        {showDepositCard ? (
          <DepositCard
            settings={settings}
            depositAmountCents={depositAmountCents}
            primaryService={selectedService}
            extraServices={selectedExtraServices}
            addons={activeSelectedAddons}
            selectedSlot={selectedSlot}
            timeFormat={timeFormat}
            totalDurationMinutes={totalDurationMinutes}
            clientName={clientName}
            clientInstagram={clientInstagram}
            proofDeliveryMethod={proofDeliveryMethod}
            proofFile={proofFile}
            proofDataUrl={proofDataUrl}
            isDisabled={isSubmitting}
            onChangeProofMethod={onChangeProofMethod}
            onChangeProofFile={onChangeProofFile}
          />
        ) : null}

        <Collapsible
          className="rb-fold"
          defaultIsOpen={Boolean(clientNotes.trim() || inspoFile)}
          trigger={
            <HStack justify="between" align="center" gap={2} width="100%" style={{ minHeight: '2.75rem' }}>
              <Text weight="semibold">Detalles para tu artista</Text>
              <Text type="supporting" color="secondary">
                {inspoFile ? 'Con foto de inspo' : 'Opcional'}
              </Text>
            </HStack>
          }
        >
          <VStack gap={3} className="rb-fold-body">
            <Grid columns={{ minWidth: 220, max: 2 }} gap={3}>
              <TextInput
                label="Instagram"
                placeholder="@tu.usuario"
                autoCapitalize="off"
                value={clientInstagram}
                onChange={onChangeClientInstagram}
                isDisabled={isSubmitting}
                isOptional
              />
              <TextInput
                label="Correo"
                type="email"
                autoComplete="email"
                placeholder="tu@correo.com"
                description="Para mandarte la invitación de calendario"
                value={clientEmail}
                onChange={onChangeClientEmail}
                isDisabled={isSubmitting}
                isOptional
              />
              <TextInput
                label="Cumpleaños (AAAA-MM-DD)"
                placeholder="1997-08-15"
                autoComplete="bday"
                description="Te mandamos una cortesía en tu mes"
                value={clientBirthday}
                onChange={onChangeClientBirthday}
                isDisabled={isSubmitting}
                isOptional
              />
            </Grid>
            <TextArea
              label="Notas o alergias"
              placeholder="Ej. Almendra corta, tono cherry, traigo gel previo..."
              value={clientNotes}
              onChange={onChangeClientNotes}
              isDisabled={isSubmitting}
              isOptional
              rows={3}
            />
            {allowInspo ? (
              <VStack gap={2}>
                {inspoFile && inspoDataUrl ? (
                  <VStack gap={2} padding={3} className="rb-card fx-fade-up">
                    <HStack gap={3} align="center">
                      <img
                        src={inspoDataUrl}
                        alt={`Vista previa de inspiración ${inspoFile.name}`}
                        className="fx-upload-thumb"
                      />
                      <VStack gap={1} className="rb-grow">
                        <HStack gap={1.5} align="center" wrap="wrap">
                          <Text type="supporting" className="fx-save-pill" data-tone="success">
                            <Check size={13} aria-hidden="true" />
                            Foto lista
                          </Text>
                        </HStack>
                        <Text
                          type="supporting"
                          weight="semibold"
                          style={{ overflowWrap: 'anywhere' }}
                        >
                          {inspoFile.name}
                        </Text>
                        <Text type="supporting" color="secondary" hasTabularNumbers>
                          {formatFileSize(inspoFile.size)}
                        </Text>
                      </VStack>
                    </HStack>

                    <VStack
                      className="fx-upload-track"
                      role="progressbar"
                      aria-label="Foto de inspiración cargada"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={100}
                    >
                      <VStack
                        className="fx-upload-bar"
                        data-tone="success"
                        style={{ transform: 'scaleX(1)' }}
                      />
                    </VStack>

                    <HStack gap={2} wrap="wrap">
                      <Button
                        type="button"
                        variant="secondary"
                        size="md"
                        label="Cambiar"
                        icon={<RefreshCw size={14} aria-hidden="true" />}
                        className="fx-press"
                        isDisabled={isSubmitting || inspoProgress !== null}
                        onClick={() => inspoReplaceRef.current?.click()}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="md"
                        label="Quitar"
                        icon={<Trash2 size={14} aria-hidden="true" />}
                        className="fx-press"
                        isDisabled={isSubmitting || inspoProgress !== null}
                        onClick={() => void processInspoFile(null)}
                      />
                    </HStack>
                    <input
                      ref={inspoReplaceRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="rb-sr-only"
                      aria-label="Cambiar foto de inspiración"
                      onChange={handleInspoReplace}
                    />
                  </VStack>
                ) : (
                  <FileInput
                    label="Foto de inspiración"
                    placeholder="Elige o arrastra tu diseño de referencia"
                    description="PNG, JPG o WEBP · máximo 2.5 MB."
                    mode="dropzone"
                    accept="image/png,image/jpeg,image/webp"
                    isOptional
                    isDisabled={isSubmitting}
                    isLoading={inspoProgress !== null}
                    value={inspoFile}
                    status={inspoError ? { type: 'error', message: inspoError } : undefined}
                    onChange={(files) => {
                      const file = Array.isArray(files) ? (files[0] ?? null) : files;
                      void processInspoFile(file);
                    }}
                  />
                )}

                {inspoProgress !== null ? (
                  <VStack gap={1} className="fx-fade-up">
                    <HStack justify="between" align="center">
                      <Text type="supporting" color="secondary" role="status" aria-live="polite">
                        Procesando foto de inspiración…
                      </Text>
                      <Text type="supporting" color="accent" weight="semibold" hasTabularNumbers>
                        {inspoProgress}%
                      </Text>
                    </HStack>
                    <VStack
                      className="fx-upload-track"
                      role="progressbar"
                      aria-label="Progreso de carga de la foto de inspiración"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={inspoProgress}
                    >
                      <VStack
                        className="fx-upload-bar"
                        style={{
                          transform: `scaleX(${Math.max(0.08, Math.min(1, inspoProgress / 100))})`,
                        }}
                      />
                    </VStack>
                  </VStack>
                ) : null}

                {inspoError && inspoFile ? (
                  <Text type="supporting" color="accent" role="alert">
                    {inspoError}
                  </Text>
                ) : null}
              </VStack>
            ) : null}
          </VStack>
        </Collapsible>

        <Collapsible
          className="rb-fold"
          defaultIsOpen={Boolean(appliedCoupon)}
          trigger={
            <HStack justify="between" align="center" gap={2} width="100%" style={{ minHeight: '2.75rem' }}>
              <Text weight="semibold">¿Tienes cupón o Gift Card?</Text>
              {appliedCoupon ? (
                <Text type="supporting" className="fx-save-pill" data-tone="success" hasTabularNumbers>
                  −{formatCurrency(appliedCoupon.discountCents, settings.currency)}
                </Text>
              ) : null}
            </HStack>
          }
        >
          <VStack gap={2} className="rb-fold-body">
            <HStack gap={2} align="end">
              <VStack className="rb-grow">
                <TextInput
                  label="Código"
                  placeholder="BIENVENIDA10 o GIFT500"
                  autoCapitalize="characters"
                  value={couponInput}
                  onChange={onChangeCouponInput}
                  onEnter={onApplyCoupon}
                  isDisabled={isSubmitting || couponLoading}
                  isLoading={couponLoading}
                  status={couponError ? { type: 'error', message: couponError } : undefined}
                  statusVariant="detached"
                />
              </VStack>
              <Button
                type="button"
                label={couponLoading ? 'Validando…' : 'Aplicar'}
                variant="secondary"
                className="fx-press"
                isLoading={couponLoading}
                isDisabled={isSubmitting || couponLoading || !couponInput.trim()}
                onClick={onApplyCoupon}
              />
            </HStack>
            {appliedCoupon ? (
              <VStack gap={2} padding={3} className="rb-note fx-pop" role="status" aria-live="polite">
                <HStack justify="between" align="center" gap={2} wrap="wrap">
                  <Text type="supporting" className="fx-save-pill" data-tone="success" hasTabularNumbers>
                    <Check size={13} aria-hidden="true" />
                    {appliedCoupon.code} aplicado · −{formatCurrency(appliedCoupon.discountCents, settings.currency)}
                  </Text>
                  <Button
                    type="button"
                    label="Quitar"
                    variant="ghost"
                    size="md"
                    icon={<Trash2 size={14} aria-hidden="true" />}
                    className="fx-press"
                    isDisabled={isSubmitting}
                    onClick={onRemoveCoupon}
                  />
                </HStack>
                <HStack justify="between" align="center" gap={2} wrap="wrap">
                  <Text type="supporting" color="secondary" hasTabularNumbers>
                    Subtotal {formatCurrency(subtotalCents, settings.currency)} − Descuento{' '}
                    {formatCurrency(appliedCoupon.discountCents, settings.currency)}
                  </Text>
                  <Text type="supporting" weight="bold" hasTabularNumbers>
                    Nuevo total: {formatCurrency(totalPriceCents, settings.currency)}
                  </Text>
                </HStack>
              </VStack>
            ) : null}
          </VStack>
        </Collapsible>

        <VStack gap={2}>
          <CheckboxInput
            ref={privacyCheckboxRef}
            htmlName="privacyConsentAccepted"
            label="Acepto el Aviso de Privacidad"
            description="Lo usamos para tu cita, recordatorios y anticipo."
            value={privacyConsentAccepted}
            onChange={onChangePrivacyConsent}
            isDisabled={isSubmitting}
            isRequired
            status={privacyConsentError ? { type: 'error', message: privacyConsentError } : undefined}
          />
          <Link href="/aviso-de-privacidad" target="_blank" rel="noopener noreferrer" isExternalLink type="supporting">
            Leer Aviso de Privacidad (v{policyVersion})
          </Link>
          <CheckboxInput
            htmlName="marketingOptIn"
            label="Quiero avisos de retoque y cortesías de cumpleaños"
            value={marketingOptIn}
            onChange={onChangeMarketingOptIn}
            isDisabled={isSubmitting}
            isOptional
          />
        </VStack>

        <Text type="supporting" color="secondary">
          {settings.cancellationPolicyText}
        </Text>
      </VStack>
    </form>
  );
}
