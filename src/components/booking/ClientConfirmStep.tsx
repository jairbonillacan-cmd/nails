'use client';

import type React from 'react';
import { useRef, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Link } from '@astryxdesign/core/Link';
import { List, ListItem } from '@astryxdesign/core/List';
import { TextInput } from '@astryxdesign/core/TextInput';
import { LogOut, RefreshCw, ShieldAlert, Sparkles, UserCheck } from 'lucide-react';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import type { AvailableSlot } from '@/lib/availability/engine';
import type { ClientPortalProfile } from '@/lib/contracts';
import { formatDateShortInTimezone, formatTimeInTimezone } from '@/lib/format';
import type { PublicServiceDTO, PublicSettingsDTO } from '@/lib/public-dto';
import type { ServiceAddon } from '@/lib/types';
import type { ActiveBookingSummary, AppliedCouponState } from './bookingApi';
import { ClientExtraDetailsBox } from './ClientExtraDetailsBox';
import type { ClientSignInIntent } from './ClientSignInDialog';
import { CouponRedeemBox } from './CouponRedeemBox';
import { DepositCard } from './DepositCard';
import {
  formatMxPhoneDisplay,
  hasClientFieldErrors,
  hasConfiguredDeposit,
  isValidMxPhone,
  prefersReducedMotion,
  validateClientBookingFields,
  type ClientFieldErrors,
  type ProofDeliveryMethod,
} from './bookingHelpers';
import { isPhoneMatchingSession } from './clientAccountHelpers';

export interface ClientAccountBinding {
  isEnabled: boolean;
  profile: ClientPortalProfile | null;
  isSigningOut: boolean;
  onOpenSignIn: (intent: ClientSignInIntent, phone: string) => void;
  onSignOut: () => void;
}

export interface ClientConfirmStepProps {
  section: 'details' | 'payment';
  todayKey: string;
  account: ClientAccountBinding;
  onContinueDetails: (e: React.FormEvent) => void;
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
  onChangeCouponInput: (value: string) => void;
  onApplyCoupon: () => void;
  onRemoveCoupon: () => void;
  onChangeClientName: (value: string) => void;
  onChangeClientPhone: (value: string) => void;
  onChangeClientInstagram: (value: string) => void;
  onChangeClientEmail: (value: string) => void;
  onChangeClientBirthday: (value: string) => void;
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

export function ClientConfirmStep(props: ClientConfirmStepProps) {
  const nameInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const privacyCheckboxRef = useRef<HTMLInputElement>(null);

  const showDepositCard = hasConfiguredDeposit(props.settings, props.depositAmountCents);
  const policyVersion = props.settings.privacyPolicyVersion || '2026-11';
  const timezone = props.settings.timezone || 'America/Mexico_City';
  const showFormBanner =
    Boolean(props.formError) &&
    props.formErrorCode !== 'PRIVACY_CONSENT_REQUIRED' &&
    !props.fieldErrors.name &&
    !props.fieldErrors.phone;

  const isDetails = props.section === 'details';
  const todayKey = props.todayKey;
  const contactInput = {
    name: props.clientName,
    phone: props.clientPhone,
    email: props.clientEmail,
    birthday: props.clientBirthday,
  };
  const profile = props.account.profile;
  const phoneMatchesSession = profile ? isPhoneMatchingSession(props.clientPhone, profile.phoneE164) : true;
  const hasPhoneMismatch = Boolean(profile) && isValidMxPhone(props.clientPhone) && !phoneMatchesSession;
  const hasContactErrors = hasClientFieldErrors(validateClientBookingFields(contactInput, todayKey));
  const profileSessionKey = profile ? `${profile.phoneE164}:${profile.isRegistered ? '1' : '0'}` : null;
  const defaultEditing = !profile || !profile.isRegistered || !phoneMatchesSession || hasContactErrors;
  const [detailsView, setDetailsView] = useState<{
    sessionKey: string | null;
    isEditing: boolean;
    isGuestChoiceOpen: boolean;
  }>(() => ({
    sessionKey: profileSessionKey,
    isEditing: defaultEditing,
    isGuestChoiceOpen: true,
  }));
  if (detailsView.sessionKey !== profileSessionKey) {
    setDetailsView({
      sessionKey: profileSessionKey,
      isEditing: defaultEditing,
      isGuestChoiceOpen: true,
    });
  }
  const showCompactSummary = Boolean(profile) && phoneMatchesSession && !detailsView.isEditing;
  const showGuestChoice = !profile && props.account.isEnabled && detailsView.isGuestChoiceOpen;
  const displayName = props.clientName.trim() || profile?.fullName.trim() || '';
  const displaySessionPhone = profile ? formatMxPhoneDisplay(profile.phoneE164) : '';
  const savedDetailsLine = [
    props.clientEmail.trim(),
    props.clientInstagram.trim(),
    props.clientBirthday.trim() ? `Cumple ${props.clientBirthday.trim()}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (isDetails) {
      if (hasPhoneMismatch) {
        e.preventDefault();
        focusFieldSmoothly(phoneInputRef.current, e.currentTarget, 'input[name="clientPhone"]');
        return;
      }
      const errors = validateClientBookingFields(contactInput, todayKey);
      if (errors.name) {
        focusFieldSmoothly(nameInputRef.current, e.currentTarget, 'input[name="clientName"]');
      } else if (errors.phone) {
        focusFieldSmoothly(phoneInputRef.current, e.currentTarget, 'input[name="clientPhone"]');
      } else if (errors.email) {
        focusFieldSmoothly(null, e.currentTarget, 'input[name="clientEmail"]');
      } else if (errors.birthday) {
        focusFieldSmoothly(null, e.currentTarget, 'input[name="clientBirthday"]');
      }
      props.onContinueDetails(e);
      return;
    }
    if (!props.privacyConsentAccepted) {
      focusFieldSmoothly(
        privacyCheckboxRef.current,
        e.currentTarget,
        'input[name="privacyConsentAccepted"]',
      );
    }
    props.onSubmit(e);
  };

  return (
    <form id={props.formId} onSubmit={handleFormSubmit} noValidate>
      <VStack
        gap={5}
        className="fx-step-in fx-busy"
        data-busy={props.isSubmitting ? 'true' : 'false'}
        aria-busy={props.isSubmitting ? 'true' : 'false'}
      >
        <VStack gap={0.5}>
          <Heading level={2} className="lk-serif rb-h2">
            {isDetails ? '¿A nombre de quién?' : showDepositCard ? 'Aparta con tu anticipo' : 'Revisa y confirma'}
          </Heading>
          <Text color="secondary">
            {isDetails
              ? 'Tu nombre y tu WhatsApp. Ahí te mandamos la confirmación y tus recordatorios.'
              : showDepositCard
                ? 'Se descuenta de tu total el día de tu cita.'
                : 'Si tienes un cupón, ponlo aquí. Luego acepta el aviso de privacidad y listo.'}
          </Text>
        </VStack>

        {!isDetails && showFormBanner ? (
          <VStack className="fx-fade-up">
            <Banner
              status="error"
              role="alert"
              title={resolveErrorTitle(props.formErrorCode)}
              description={props.formError ?? ''}
              icon={<ShieldAlert size={18} aria-hidden="true" />}
            />
          </VStack>
        ) : null}

        {!isDetails && props.activeBookings.length > 0 ? (
          <SurfaceCard
            tone="subtle"
            padded
            headingLevel={3}
            title="Tus citas activas"
            subtitle="Ya tienes el máximo de citas activas. Si quieres, mueve alguna de estas a otro día:"
            className="rb-note fx-fade-up"
          >
            <List hasDividers density="balanced">
              {props.activeBookings.map((item) => (
                <ListItem
                  key={item.bookingCode}
                  label={`${item.serviceName} · ${item.bookingCode}`}
                  description={
                    <Text type="supporting" color="secondary" hasTabularNumbers>
                      {formatDateShortInTimezone(item.startAt, timezone)} ·{' '}
                      {formatTimeInTimezone(item.startAt, timezone, props.timeFormat === '24h')} · {item.staffName}
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
          </SurfaceCard>
        ) : null}

        {isDetails ? (
        <>
        {profile ? (
          <SurfaceCard
            tone="accent"
            padded
            headingLevel={3}
            title={
              displayName
                ? `Reservas como ${displayName} · ${displaySessionPhone}`
                : `WhatsApp verificado · ${displaySessionPhone}`
            }
            subtitle={
              !profile.isRegistered
                ? 'Al terminar esta cita guardamos tus datos para la próxima.'
                : showCompactSummary && savedDetailsLine
                  ? savedDetailsLine
                  : undefined
            }
            icon={<UserCheck size={18} aria-hidden="true" />}
            className="fx-fade-up"
          >
            <HStack gap={2} wrap="wrap">
              {showCompactSummary ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  label="Editar mis datos"
                  isDisabled={props.isSubmitting}
                  onClick={() => setDetailsView((prev) => ({ ...prev, isEditing: true }))}
                />
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="md"
                label="No soy yo"
                icon={<LogOut size={15} aria-hidden="true" />}
                isLoading={props.account.isSigningOut}
                isDisabled={props.isSubmitting}
                onClick={props.account.onSignOut}
              />
            </HStack>
          </SurfaceCard>
        ) : null}

        {showGuestChoice ? (
          <SurfaceCard
            tone="subtle"
            padded
            headingLevel={3}
            title="¿Ya reservaste antes?"
            subtitle="Entra con tu WhatsApp y llenamos tus datos. Sin contraseñas."
            icon={<Sparkles size={18} aria-hidden="true" />}
            className="fx-fade-up"
          >
            <HStack gap={2} wrap="wrap">
              <Button
                type="button"
                variant="primary"
                size="md"
                label="Iniciar sesión"
                className="fx-press"
                onClick={() => props.account.onOpenSignIn('signin', props.clientPhone)}
              />
              <Button
                type="button"
                variant="secondary"
                size="md"
                label="Registrarme"
                onClick={() => props.account.onOpenSignIn('register', props.clientPhone)}
              />
              <Button
                type="button"
                variant="ghost"
                size="md"
                label="Continuar sin registro"
                onClick={() => {
                  setDetailsView((prev) => ({ ...prev, isGuestChoiceOpen: false }));
                  nameInputRef.current?.focus();
                }}
              />
            </HStack>
          </SurfaceCard>
        ) : null}

        {!profile && props.account.isEnabled && !detailsView.isGuestChoiceOpen ? (
          <HStack justify="between" align="center" gap={2} wrap="wrap">
            <Text type="supporting" color="secondary">
              ¿Prefieres entrar con tu cuenta?
            </Text>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              label="Iniciar sesión"
              onClick={() => props.account.onOpenSignIn('signin', props.clientPhone)}
            />
          </HStack>
        ) : null}

        {hasPhoneMismatch ? (
          <Banner
            status="warning"
            role="alert"
            title="Ese WhatsApp no es el de tu sesión"
            description="Verifica el número nuevo o toca «No soy yo» para seguir sin cuenta."
            endContent={
              <Button
                type="button"
                variant="secondary"
                size="sm"
                label="Verificar número"
                onClick={() => props.account.onOpenSignIn('signin', props.clientPhone)}
              />
            }
          />
        ) : null}

        {!showCompactSummary ? (
        <>
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
            value={props.clientName}
            onChange={props.onChangeClientName}
            isDisabled={props.isSubmitting}
            isRequired
            status={props.fieldErrors.name ? { type: 'error', message: props.fieldErrors.name } : undefined}
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
            value={props.clientPhone}
            onChange={props.onChangeClientPhone}
            isDisabled={props.isSubmitting}
            isRequired
            status={props.fieldErrors.phone ? { type: 'error', message: props.fieldErrors.phone } : undefined}
            statusVariant="detached"
          />
        </VStack>

        <ClientExtraDetailsBox
            clientInstagram={props.clientInstagram}
            clientEmail={props.clientEmail}
            clientBirthday={props.clientBirthday}
            emailError={props.fieldErrors.email}
            birthdayError={props.fieldErrors.birthday}
            isDisabled={props.isSubmitting}
            onChangeClientInstagram={props.onChangeClientInstagram}
            onChangeClientEmail={props.onChangeClientEmail}
            onChangeClientBirthday={props.onChangeClientBirthday}
          />
        </>
        ) : null}
        </>
        ) : (
        <>
        {showDepositCard ? (
          <DepositCard
            settings={props.settings}
            depositAmountCents={props.depositAmountCents}
            primaryService={props.selectedService}
            extraServices={props.selectedExtraServices}
            addons={props.activeSelectedAddons}
            selectedSlot={props.selectedSlot}
            timeFormat={props.timeFormat}
            totalDurationMinutes={props.totalDurationMinutes}
            clientName={props.clientName}
            clientInstagram={props.clientInstagram}
            proofDeliveryMethod={props.proofDeliveryMethod}
            proofFile={props.proofFile}
            proofDataUrl={props.proofDataUrl}
            isDisabled={props.isSubmitting}
            onChangeProofMethod={props.onChangeProofMethod}
            onChangeProofFile={props.onChangeProofFile}
          />
        ) : null}

        <CouponRedeemBox
          currency={props.settings.currency}
          subtotalCents={props.subtotalCents}
          totalPriceCents={props.totalPriceCents}
          couponInput={props.couponInput}
          appliedCoupon={props.appliedCoupon}
          couponError={props.couponError}
          couponLoading={props.couponLoading}
          isDisabled={props.isSubmitting}
          onChangeCouponInput={props.onChangeCouponInput}
          onApplyCoupon={props.onApplyCoupon}
          onRemoveCoupon={props.onRemoveCoupon}
        />

        <VStack gap={2}>
          <CheckboxInput
            ref={privacyCheckboxRef}
            htmlName="privacyConsentAccepted"
            label="Acepto el Aviso de Privacidad"
            description="Usamos tus datos solo para tu cita, tus recordatorios y tu anticipo."
            value={props.privacyConsentAccepted}
            onChange={props.onChangePrivacyConsent}
            isDisabled={props.isSubmitting}
            isRequired
            status={props.privacyConsentError ? { type: 'error', message: props.privacyConsentError } : undefined}
          />
          <Link href="/aviso-de-privacidad" target="_blank" rel="noopener noreferrer" isExternalLink type="supporting">
            Leer Aviso de Privacidad (v{policyVersion})
          </Link>
          <CheckboxInput
            htmlName="marketingOptIn"
            label="Avísame de mi retoque y en mi cumpleaños"
            value={props.marketingOptIn}
            onChange={props.onChangeMarketingOptIn}
            isDisabled={props.isSubmitting}
            isOptional
          />
        </VStack>

        <Text type="supporting" color="secondary">
          {props.settings.cancellationPolicyText}
        </Text>
        </>
        )}
      </VStack>
    </form>
  );
}
