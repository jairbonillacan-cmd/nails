'use client';

import type React from 'react';
import { useRef } from 'react';
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
import { RefreshCw, ShieldAlert } from 'lucide-react';
import type { AvailableSlot } from '@/lib/availability/engine';
import { formatCurrency, formatDateShortInTimezone, formatTimeInTimezone } from '@/lib/format';
import type { PublicServiceDTO, PublicSettingsDTO } from '@/lib/public-dto';
import type { ServiceAddon } from '@/lib/types';
import type { ActiveBookingSummary, AppliedCouponState } from './bookingApi';
import { DepositCard } from './DepositCard';
import { hasConfiguredDeposit, readFileAsDataUrl, type ProofDeliveryMethod } from './bookingHelpers';

export interface ClientFieldErrors {
  name: string | null;
  phone: string | null;
}

interface ClientConfirmStepProps {
  formId: string;
  settings: PublicSettingsDTO;
  selectedService: PublicServiceDTO | undefined;
  selectedExtraServices: PublicServiceDTO[];
  activeSelectedAddons: ServiceAddon[];
  selectedSlot: AvailableSlot | null;
  timeFormat: '12h' | '24h';
  totalDurationMinutes: number;
  depositAmountCents: number;
  couponInput: string;
  appliedCoupon: AppliedCouponState | null;
  couponError: string | null;
  clientName: string;
  clientPhone: string;
  clientInstagram: string;
  clientEmail: string;
  clientBirthday: string;
  clientNotes: string;
  inspoFile: File | null;
  proofDeliveryMethod: ProofDeliveryMethod;
  proofFile: File | null;
  privacyConsentAccepted: boolean;
  marketingOptIn: boolean;
  privacyConsentError: string | null;
  fieldErrors: ClientFieldErrors;
  formError: string | null;
  formErrorCode: string | null;
  activeBookings: ActiveBookingSummary[];
  onChangeCouponInput: (value: string) => void;
  onApplyCoupon: () => void;
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

export function ClientConfirmStep({
  formId,
  settings,
  selectedService,
  selectedExtraServices,
  activeSelectedAddons,
  selectedSlot,
  timeFormat,
  totalDurationMinutes,
  depositAmountCents,
  couponInput,
  appliedCoupon,
  couponError,
  clientName,
  clientPhone,
  clientInstagram,
  clientEmail,
  clientBirthday,
  clientNotes,
  inspoFile,
  proofDeliveryMethod,
  proofFile,
  privacyConsentAccepted,
  marketingOptIn,
  privacyConsentError,
  fieldErrors,
  formError,
  formErrorCode,
  activeBookings,
  onChangeCouponInput,
  onApplyCoupon,
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
  const privacyCheckboxRef = useRef<HTMLInputElement>(null);
  const showDepositCard = hasConfiguredDeposit(settings, depositAmountCents);
  const allowInspo =
    Boolean(selectedService?.allowInspoPhoto) || selectedExtraServices.some((srv) => srv.allowInspoPhoto);
  const policyVersion = settings.privacyPolicyVersion || '2026-11';
  const timezone = settings.timezone || 'America/Mexico_City';
  const showFormBanner = Boolean(formError) && formErrorCode !== 'PRIVACY_CONSENT_REQUIRED' && !fieldErrors.name && !fieldErrors.phone;

  const handleFormSubmit = (e: React.FormEvent) => {
    if (!fieldErrors.name && !fieldErrors.phone && clientName.trim() && !privacyConsentAccepted) {
      privacyCheckboxRef.current?.focus();
    }
    onSubmit(e);
  };

  return (
    <form id={formId} onSubmit={handleFormSubmit} noValidate>
      <VStack gap={5} className="rb-enter">
        <VStack gap={0.5}>
          <Heading level={2} className="lk-serif rb-h2">
            Casi lista
          </Heading>
          <Text color="secondary">Sin cuenta ni contraseña. Te confirmamos por WhatsApp.</Text>
        </VStack>

        {showFormBanner ? (
          <Banner
            status="error"
            title={resolveErrorTitle(formErrorCode)}
            description={formError ?? ''}
            icon={<ShieldAlert size={18} aria-hidden="true" />}
          />
        ) : null}

        {activeBookings.length > 0 ? (
          <VStack gap={3} padding={4} className="rb-note">
            <VStack gap={0.5}>
              <Heading level={3}>Tus citas activas</Heading>
              <Text type="supporting" color="secondary">
                Reprograma cualquiera sin perder tu anticipo:
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
                      size="sm"
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
            label="Nombre y apellido"
            placeholder="Ej. Sofía Ramírez"
            autoComplete="name"
            autoCapitalize="words"
            enterKeyHint="next"
            size="lg"
            value={clientName}
            onChange={onChangeClientName}
            isRequired
            status={fieldErrors.name ? { type: 'error', message: fieldErrors.name } : undefined}
            statusVariant="detached"
          />
          <TextInput
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
            onChangeProofMethod={onChangeProofMethod}
            onChangeProofFile={onChangeProofFile}
          />
        ) : null}

        <Collapsible
          className="rb-fold"
          defaultIsOpen={false}
          trigger={
            <HStack justify="between" gap={2} width="100%">
              <Text weight="semibold">Detalles para tu artista</Text>
              <Text type="supporting" color="secondary">
                Opcional
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
                isOptional
              />
              <TextInput
                label="Cumpleaños (AAAA-MM-DD)"
                placeholder="1997-08-15"
                autoComplete="bday"
                description="Te mandamos una cortesía en tu mes"
                value={clientBirthday}
                onChange={onChangeClientBirthday}
                isOptional
              />
            </Grid>
            <TextArea
              label="Notas o alergias"
              placeholder="Ej. Almendra corta, tono cherry, traigo gel previo..."
              value={clientNotes}
              onChange={onChangeClientNotes}
              isOptional
              rows={3}
            />
            {allowInspo ? (
              <FileInput
                label="Foto de inspiración"
                description="PNG, JPG o WEBP hasta 2.5 MB."
                mode="dropzone"
                accept="image/png,image/jpeg,image/webp"
                maxSize={2_500_000}
                isOptional
                value={inspoFile}
                onChange={async (f) => {
                  const file = Array.isArray(f) ? (f[0] ?? null) : f;
                  if (file) {
                    onChangeInspoFile(file, await readFileAsDataUrl(file));
                  } else {
                    onChangeInspoFile(null, null);
                  }
                }}
              />
            ) : null}
          </VStack>
        </Collapsible>

        <Collapsible
          className="rb-fold"
          defaultIsOpen={Boolean(appliedCoupon)}
          trigger={<Text weight="semibold">¿Tienes cupón o Gift Card?</Text>}
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
                />
              </VStack>
              <Button label="Aplicar" variant="secondary" onClick={onApplyCoupon} />
            </HStack>
            {couponError ? (
              <Text type="supporting" color="secondary" role="status">
                {couponError}
              </Text>
            ) : null}
            {appliedCoupon ? (
              <Text type="supporting" color="accent" weight="semibold" role="status">
                {appliedCoupon.code} aplicado: −{formatCurrency(appliedCoupon.discountCents, settings.currency)}
              </Text>
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
