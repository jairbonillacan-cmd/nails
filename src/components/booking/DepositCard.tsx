'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Divider } from '@astryxdesign/core/Divider';
import { FileInput } from '@astryxdesign/core/FileInput';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { Check, Copy, ExternalLink, Landmark, Upload } from 'lucide-react';
import type { AvailableSlot } from '@/lib/availability/engine';
import { formatCurrency } from '@/lib/format';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import type { PublicServiceDTO, PublicSettingsDTO } from '@/lib/public-dto';
import type { ServiceAddon } from '@/lib/types';
import {
  buildInstagramDmSummary,
  normalizeInstagramHandle,
  readFileAsDataUrl,
  resolveInstagramUrl,
  type ProofDeliveryMethod,
} from './bookingHelpers';

interface DepositCardProps {
  settings: PublicSettingsDTO;
  depositAmountCents: number;
  primaryService: PublicServiceDTO | undefined;
  extraServices: PublicServiceDTO[];
  addons: ServiceAddon[];
  selectedSlot: AvailableSlot | null;
  timeFormat: '12h' | '24h';
  totalDurationMinutes: number;
  clientName: string;
  clientInstagram: string;
  proofDeliveryMethod: ProofDeliveryMethod;
  proofFile: File | null;
  onChangeProofMethod: (method: ProofDeliveryMethod) => void;
  onChangeProofFile: (file: File | null, dataUrl: string | null) => void;
}

export function DepositCard({
  settings,
  depositAmountCents,
  primaryService,
  extraServices,
  addons,
  selectedSlot,
  timeFormat,
  totalDurationMinutes,
  clientName,
  clientInstagram,
  proofDeliveryMethod,
  proofFile,
  onChangeProofMethod,
  onChangeProofFile,
}: DepositCardProps) {
  const clabeFeedback = useEphemeralMessage(2500);
  const dmFeedback = useEphemeralMessage(2500);
  const [clabeCopyOk, setClabeCopyOk] = useState(false);
  const [dmCopyOk, setDmCopyOk] = useState(false);

  const displayAmount = formatCurrency(
    depositAmountCents > 0 ? depositAmountCents : 20000,
    settings.currency,
  );
  const beneficiary = settings.depositBeneficiary || settings.depositAccountHolder;
  const instagramHandle = normalizeInstagramHandle(settings.instagramHandle);
  const instagramUrl = resolveInstagramUrl(settings);
  const activeMethod: 'web_upload' | 'instagram_dm' =
    proofDeliveryMethod === 'instagram_dm' ? 'instagram_dm' : 'web_upload';

  const handleCopyClabe = async () => {
    const cleanClabe = settings.depositClabe.replace(/\s+/g, '');
    if (!cleanClabe) return;
    try {
      await navigator.clipboard.writeText(cleanClabe);
      setClabeCopyOk(true);
      clabeFeedback.show('CLABE copiada al portapapeles');
    } catch {
      setClabeCopyOk(false);
      clabeFeedback.show('No se pudo copiar automáticamente; selecciona la CLABE.');
    }
  };

  const handleCopyDmSummary = async () => {
    const summary = buildInstagramDmSummary({
      settings,
      primaryService,
      extraServices,
      addons,
      slot: selectedSlot,
      timeFormat,
      totalDurationMinutes,
      depositAmountCents,
      clientName,
      clientInstagram,
    });
    try {
      await navigator.clipboard.writeText(summary);
      setDmCopyOk(true);
      dmFeedback.show('Resumen copiado para pegar en Instagram DM');
    } catch {
      setDmCopyOk(false);
      dmFeedback.show('No se pudo copiar automáticamente; envía tu captura por DM.');
    }
  };

  return (
    <Card variant="muted" padding={4}>
      <VStack gap={3}>
        <HStack gap={2} align="center">
          <Landmark size={18} aria-hidden="true" />
          <Heading level={4}>
            Anticipo por transferencia SPEI ({displayAmount})
          </Heading>
        </HStack>

        <Text type="supporting">
          Para apartar tu cita envía un anticipo de{' '}
          <Text weight="bold">{displayAmount}</Text> a:
        </Text>

        <Card padding={3}>
          <VStack gap={2}>
            <HStack justify="between" align="center" wrap="wrap" gap={2}>
              <VStack gap={0.5}>
                <Text type="supporting" color="secondary">
                  Cuenta CLABE
                </Text>
                <Text type="code" weight="semibold" hasTabularNumbers>
                  {settings.depositClabe}
                </Text>
              </VStack>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={
                  clabeFeedback.message && clabeCopyOk ? (
                    <Check size={14} />
                  ) : (
                    <Copy size={14} />
                  )
                }
                label={
                  clabeFeedback.message && clabeCopyOk ? 'CLABE copiada' : 'Copiar CLABE'
                }
                onClick={() => void handleCopyClabe()}
              />
            </HStack>

            <Text
              type="supporting"
              color={clabeCopyOk ? 'accent' : 'secondary'}
              role="status"
            >
              {clabeFeedback.message ?? ''}
            </Text>

            <Divider />

            <VStack gap={0.5}>
              <Text type="supporting">
                Titular: <Text weight="semibold">{beneficiary}</Text>
              </Text>
              <Text type="supporting" color="secondary">
                Banco: {settings.depositBankName}
              </Text>
            </VStack>
          </VStack>
        </Card>

        <RadioList
          label="¿Cómo prefieres enviar tu comprobante?"
          value={activeMethod}
          onChange={(val) =>
            onChangeProofMethod(val === 'instagram_dm' ? 'instagram_dm' : 'web_upload')
          }
        >
          <RadioListItem
            value="web_upload"
            label="Subir comprobante aquí mismo"
            description="Adjunta la captura de tu transferencia (PNG, JPG o WEBP) para validar tu lugar más rápido."
          />
          <RadioListItem
            value="instagram_dm"
            label={`Mandarlo por Instagram DM (${instagramHandle})`}
            description="Aparta tu cita ahora y envía tu captura directo por mensaje privado."
          />
        </RadioList>

        {activeMethod === 'web_upload' ? (
          <FileInput
            label="Adjuntar comprobante de transferencia"
            description="Imagen (PNG, JPG o WEBP) hasta 2.5 MB."
            accept="image/png,image/jpeg,image/webp"
            maxSize={2_500_000}
            isOptional
            value={proofFile}
            onChange={async (f) => {
              const file = Array.isArray(f) ? f[0] ?? null : f;
              if (file) {
                const url = await readFileAsDataUrl(file);
                onChangeProofFile(file, url);
              } else {
                onChangeProofFile(null, null);
              }
            }}
          />
        ) : (
          <Card padding={3}>
            <VStack gap={2}>
              <HStack gap={1.5} align="center">
                <Upload size={15} aria-hidden="true" />
                <Text weight="medium">Envío por Instagram DM</Text>
              </HStack>
              <Text type="supporting" color="secondary">
                Al confirmar tu cita apartaremos tu horario y podrás mandar tu comprobante a {instagramHandle}.
              </Text>
              <HStack gap={2} wrap="wrap">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<ExternalLink size={14} />}
                  label={`Abrir ${instagramHandle}`}
                  href={instagramUrl}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  icon={
                    dmFeedback.message && dmCopyOk ? (
                      <Check size={14} />
                    ) : (
                      <Copy size={14} />
                    )
                  }
                  label={
                    dmFeedback.message && dmCopyOk
                      ? 'Resumen copiado'
                      : 'Copiar resumen para Instagram DM'
                  }
                  onClick={() => void handleCopyDmSummary()}
                />
              </HStack>
              <Text
                type="supporting"
                color={dmCopyOk ? 'accent' : 'secondary'}
                role="status"
              >
                {dmFeedback.message ?? ''}
              </Text>
            </VStack>
          </Card>
        )}
      </VStack>
    </Card>
  );
}
