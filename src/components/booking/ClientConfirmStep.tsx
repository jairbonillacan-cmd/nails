'use client';

import type React from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { FileInput } from '@astryxdesign/core/FileInput';
import { AspectRatio } from '@astryxdesign/core/AspectRatio';
import { Check, ShieldAlert } from 'lucide-react';
import type { AvailableSlot } from '@/lib/availability/engine';
import type { PublicServiceDTO, PublicSettingsDTO } from '@/lib/public-dto';
import type { ServiceAddon } from '@/lib/types';
import type { AppliedCouponState } from './bookingApi';
import { BookingSummaryCard } from './BookingSummaryCard';
import { DepositCard } from './DepositCard';
import {
  hasConfiguredDeposit,
  readFileAsDataUrl,
  type ProofDeliveryMethod,
} from './bookingHelpers';

interface ClientConfirmStepProps {
  settings: PublicSettingsDTO;
  selectedService: PublicServiceDTO | undefined;
  selectedExtraServices: PublicServiceDTO[];
  activeSelectedAddons: ServiceAddon[];
  selectedSlot: AvailableSlot | null;
  timeFormat: '12h' | '24h';
  totalDurationMinutes: number;
  subtotalCents: number;
  totalPriceCents: number;
  hasStartingPrice: boolean;
  depositAmountCents: number;
  holdRemainingSec: number;
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
  inspoDataUrl: string | null;
  proofDeliveryMethod: ProofDeliveryMethod;
  proofFile: File | null;
  submitting: boolean;
  formError: string | null;
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
  onSubmit: (e: React.FormEvent) => void;
}

export function ClientConfirmStep({
  settings,
  selectedService,
  selectedExtraServices,
  activeSelectedAddons,
  selectedSlot,
  timeFormat,
  totalDurationMinutes,
  subtotalCents,
  totalPriceCents,
  hasStartingPrice,
  depositAmountCents,
  holdRemainingSec,
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
  inspoDataUrl,
  proofDeliveryMethod,
  proofFile,
  submitting,
  formError,
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
  onSubmit,
}: ClientConfirmStepProps) {
  const showDepositCard = hasConfiguredDeposit(settings, depositAmountCents);
  const allowInspo =
    Boolean(selectedService?.allowInspoPhoto) ||
    selectedExtraServices.some((srv) => srv.allowInspoPhoto);

  return (
    <Grid columns={{ minWidth: 320, max: 2 }} gap={5} align="start">
      <BookingSummaryCard
        settings={settings}
        selectedService={selectedService}
        selectedExtraServices={selectedExtraServices}
        activeSelectedAddons={activeSelectedAddons}
        selectedSlot={selectedSlot}
        timeFormat={timeFormat}
        totalDurationMinutes={totalDurationMinutes}
        subtotalCents={subtotalCents}
        totalPriceCents={totalPriceCents}
        hasStartingPrice={hasStartingPrice}
        holdRemainingSec={holdRemainingSec}
        couponInput={couponInput}
        appliedCoupon={appliedCoupon}
        couponError={couponError}
        onChangeCouponInput={onChangeCouponInput}
        onApplyCoupon={onApplyCoupon}
      />

      <Card padding={5}>
        <form onSubmit={onSubmit}>
          <VStack gap={4}>
            <VStack gap={0.5}>
              <Text type="label" color="accent" weight="semibold">
                3. CONFIRMA TUS DATOS Y ANTICIPO
              </Text>
              <Heading level={2}>Sin crear cuenta ni contraseña</Heading>
              <Text type="supporting" color="secondary">
                Te enviaremos tu confirmación, invitación de calendario y link personal para reagendar o cancelar.
              </Text>
            </VStack>

            {formError ? (
              <Banner
                status="error"
                title="No pudimos registrar la cita"
                description={formError}
                icon={<ShieldAlert size={18} />}
              />
            ) : null}

            <TextInput
              label="Nombre y apellido"
              placeholder="Ej. Sofía Ramírez"
              value={clientName}
              onChange={onChangeClientName}
              isRequired
            />

            <Grid columns={{ minWidth: 200, max: 2 }} gap={3}>
              <TextInput
                label="WhatsApp (México +52)"
                type="tel"
                placeholder="222 123 4567"
                value={clientPhone}
                onChange={onChangeClientPhone}
                isRequired
              />
              <TextInput
                label="Cuenta de Instagram"
                placeholder="@tu.usuario"
                description="Útil si envías tu comprobante o inspo por DM"
                value={clientInstagram}
                onChange={onChangeClientInstagram}
                isOptional
              />
            </Grid>

            <Grid columns={{ minWidth: 200, max: 2 }} gap={3}>
              <TextInput
                label="Correo electrónico"
                type="email"
                placeholder="tu@correo.com"
                description="Para enviarte invitación .ics al calendario"
                value={clientEmail}
                onChange={onChangeClientEmail}
                isOptional
              />
              <TextInput
                label="Fecha de cumpleaños (YYYY-MM-DD)"
                placeholder="1997-08-15"
                description="Para enviarte cortesías en tu mes"
                value={clientBirthday}
                onChange={onChangeClientBirthday}
                isOptional
              />
            </Grid>

            <TextArea
              label="Notas sobre tu diseño o alergias"
              placeholder="Ej. Forma almendra corta, tono cherry o nude lechoso, traigo gel previo..."
              value={clientNotes}
              onChange={onChangeClientNotes}
              isOptional
              rows={3}
            />

            {allowInspo ? (
              <VStack gap={2}>
                <FileInput
                  label="Foto de inspiración (inspo)"
                  description="Sube una imagen de referencia (PNG, JPG o WEBP hasta 2.5 MB) para que tu nail artist la tenga lista."
                  mode="dropzone"
                  accept="image/png,image/jpeg,image/webp"
                  maxSize={2_500_000}
                  isOptional
                  value={inspoFile}
                  onChange={async (f) => {
                    const file = Array.isArray(f) ? f[0] ?? null : f;
                    if (file) {
                      const url = await readFileAsDataUrl(file);
                      onChangeInspoFile(file, url);
                    } else {
                      onChangeInspoFile(null, null);
                    }
                  }}
                />
                {inspoDataUrl ? (
                  <AspectRatio ratio={16 / 9} fit="cover">
                    <img
                      src={inspoDataUrl}
                      alt="Vista previa de referencia"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: 'var(--radius-inner)',
                      }}
                    />
                  </AspectRatio>
                ) : null}
              </VStack>
            ) : null}

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

            <Button
              type="submit"
              variant="primary"
              size="lg"
              width="100%"
              isLoading={submitting}
              icon={<Check size={18} />}
              label={
                selectedService?.requiresConfirmation || showDepositCard
                  ? 'Solicitar y apartar horario'
                  : 'Confirmar mi cita ahora'
              }
            />
          </VStack>
        </form>
      </Card>
    </Grid>
  );
}
