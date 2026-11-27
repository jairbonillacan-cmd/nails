'use client';

import { BrandIcon } from '@/components/brand/BrandIcon';
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
import {
  BadgeCheck, LogOut, PencilLine, RefreshCw, ShieldAlert, UserCheck } from 'lucide-react';
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

  const recapDate = props.selectedSlot ? new Date(props.selectedSlot.startAt) : null;
  const recapMonth = recapDate
    ? new Intl.DateTimeFormat('es-MX', { month: 'short', timeZone: timezone }).format(recapDate).replace('.', '')
    : '';
  const recapDay = recapDate
    ? new Intl.DateTimeFormat('es-MX', { day: 'numeric', timeZone: timezone }).format(recapDate)
    : '';
  const recapWeekday = recapDate
    ? new Intl.DateTimeFormat('es-MX', { weekday: 'long', timeZone: timezone }).format(recapDate)
    : '';

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
            {isDetails ? 'Tus datos' : showDepositCard ? 'Anticipo' : 'Confirmación'}
          </Heading>
          <Text color="secondary">
            {isDetails
              ? 'Ingresa los datos de la persona que asistirá a la cita.'
              : showDepositCard
                ? 'El anticipo se descuenta del total el día de tu cita.'
                : 'Si tienes un cupón, ingrésalo aquí. Después acepta el aviso de privacidad para confirmar.'}
          </Text>
        </VStack>

        {isDetails && props.selectedSlot ? (
          <HStack gap={3} align="center" className="rb-details-recap rb-m fx-fade-up">
            <VStack className="rb-details-recap-date" align="center" justify="center" gap={0}>
              <Text type="supporting" color="inherit" className="rb-details-recap-month">
                {recapMonth}
              </Text>
              <Text weight="semibold" color="inherit" className="rb-details-recap-day" hasTabularNumbers>
                {recapDay}
              </Text>
            </VStack>
            <VStack gap={0.5} className="rb-grow">
              <Text weight="semibold" maxLines={1}>
                {props.selectedService?.name ?? 'Tu cita'}
                {props.selectedExtraServices.length > 0
                  ? ` + ${props.selectedExtraServices.length}`
                  : ''}
              </Text>
              <Text type="supporting" color="secondary" hasTabularNumbers>
                {recapWeekday} · {formatTimeInTimezone(props.selectedSlot.startAt, timezone, props.timeFormat === '24h')}
                {props.selectedSlot.staffName ? ` · con ${props.selectedSlot.staffName.split(/\s+/)[0]}` : ''}
              </Text>
            </VStack>
            <BrandIcon name="calendario" size={1.625} className="rb-details-recap-icon" />
          </HStack>
        ) : null}

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
          <VStack gap={3} className="rb-account-card fx-fade-up">
            <HStack gap={3} align="center">
              <VStack className="rb-account-avatar" align="center" justify="center" aria-hidden="true">
                {displayName ? (
                  <Text weight="semibold" color="inherit">
                    {displayName.charAt(0).toUpperCase()}
                  </Text>
                ) : (
                  <UserCheck size={20} aria-hidden="true" />
                )}
              </VStack>
              <VStack gap={0.5} className="rb-grow">
                <Heading level={3} className="rb-account-name">
                  {displayName ? `Hola, ${displayName.split(/\s+/)[0]}` : 'WhatsApp verificado'}
                </Heading>
                <HStack gap={1.5} align="center" wrap="wrap">
                  <BadgeCheck size={14} aria-hidden="true" className="rb-account-check" />
                  <Text type="supporting" color="secondary" hasTabularNumbers>
                    {displaySessionPhone}
                  </Text>
                </HStack>
              </VStack>
            </HStack>
            {!profile.isRegistered || (showCompactSummary && savedDetailsLine) ? (
              <Text type="supporting" color="secondary" textWrap="pretty">
                {!profile.isRegistered
                  ? 'Al terminar esta cita guardamos tus datos para la próxima.'
                  : savedDetailsLine}
              </Text>
            ) : null}
            <HStack gap={2} wrap="wrap" className="rb-account-actions">
              {showCompactSummary ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  label="Editar mis datos"
                  icon={<PencilLine size={14} aria-hidden="true" />}
                  isDisabled={props.isSubmitting}
                  onClick={() => setDetailsView((prev) => ({ ...prev, isEditing: true }))}
                />
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                label="No soy yo"
                icon={<LogOut size={14} aria-hidden="true" />}
                isLoading={props.account.isSigningOut}
                isDisabled={props.isSubmitting}
                onClick={props.account.onSignOut}
              />
            </HStack>
          </VStack>
        ) : null}

        {showGuestChoice ? (
          <VStack gap={4} className="rb-account-card rb-account-guest fx-fade-up">
            <HStack gap={3} align="center">
              <VStack className="rb-signin-card-icon" align="center" justify="center" aria-hidden="true">
                <BrandIcon name="iniciar-sesion" size={1.625} />
              </VStack>
              <VStack gap={0.5} className="rb-grow">
                <Heading level={3} className="rb-account-name">
                  ¿Ya eres clienta?
                </Heading>
                <Text type="supporting" color="secondary" textWrap="pretty">
                  Entra con tu WhatsApp y llenamos todo por ti. Sin contraseñas.
                </Text>
              </VStack>
            </HStack>
            <Button
              type="button"
              variant="primary"
              size="lg"
              width="100%"
              label="Entrar con mi WhatsApp"
              icon={<BrandIcon name="whatsapp" size={1.375} />}
              className="fx-press"
              onClick={() => props.account.onOpenSignIn('signin', props.clientPhone)}
            />
            <HStack gap={1} justify="center" align="center" wrap="wrap">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                label="Es mi primera vez"
                onClick={() => {
                  setDetailsView((prev) => ({ ...prev, isGuestChoiceOpen: false }));
                  nameInputRef.current?.focus();
                }}
              />
              <Text type="supporting" color="secondary" aria-hidden="true">
                ·
              </Text>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                label="Crear cuenta"
                onClick={() => props.account.onOpenSignIn('register', props.clientPhone)}
              />
            </HStack>
          </VStack>
        ) : null}

        {!profile && props.account.isEnabled && !detailsView.isGuestChoiceOpen ? (
          <HStack justify="between" align="center" gap={2} wrap="wrap" className="rb-account-inline">
            <Text type="supporting" color="secondary">
              ¿Ya eres clienta?
            </Text>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              label="Entrar con WhatsApp"
              icon={<BrandIcon name="whatsapp" size={1.125} />}
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
        <VStack as="fieldset" gap={4} className="rb-fieldset rb-details-card fx-fade-up">
          <legend className="rb-sr-only">Tus datos</legend>
          <TextInput
            ref={nameInputRef}
            htmlName="clientName"
            label="Nombre completo"
            placeholder="Nombre y apellido"
            autoComplete="name"
            autoCapitalize="words"
            enterKeyHint="next"
            size="lg"
            startIcon={<BrandIcon name="iniciar-sesion" size={1.375} />}
            value={props.clientName}
            onChange={props.onChangeClientName}
            isDisabled={props.isSubmitting}
            status={props.fieldErrors.name ? { type: 'error', message: props.fieldErrors.name } : undefined}
            statusVariant="detached"
          />
          <TextInput
            ref={phoneInputRef}
            htmlName="clientPhone"
            label="Tu WhatsApp"
            description="Ahí te llegan la confirmación y tus recordatorios."
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            enterKeyHint="done"
            size="lg"
            placeholder="10 dígitos"
            startIcon={<Text weight="semibold">+52</Text>}
            value={props.clientPhone}
            onChange={props.onChangeClientPhone}
            isDisabled={props.isSubmitting}
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
            Leer el Aviso de Privacidad
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
