'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { FileInput } from '@astryxdesign/core/FileInput';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { Check, Copy, ExternalLink, Upload } from 'lucide-react';
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
    <VStack gap={3} padding={4} className="rb-deposit">
      <HStack justify="between" align="end" wrap="wrap" gap={1}>
        <Heading level={3} className="lk-serif rb-deposit-title">
          Anticipo de {displayAmount}
        </Heading>
        <Text type="supporting" color="secondary">
          Se descuenta de tu total
        </Text>
      </HStack>
      <Text type="supporting">
        SPEI a {settings.depositBankName} · {beneficiary}
      </Text>

      <button
        type="button"
        className="rb-clabe"
        aria-label={`Copiar CLABE ${settings.depositClabe}`}
        onClick={() => void handleCopyClabe()}
      >
        <VStack gap={0} align="start">
          <Text type="supporting" color="secondary">
            CLABE
          </Text>
          <Text type="code" weight="bold" hasTabularNumbers>
            {settings.depositClabe}
          </Text>
        </VStack>
        <Text color="inherit" weight="semibold" className="rb-clabe-action">
          {clabeFeedback.message && clabeCopyOk ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {clabeFeedback.message && clabeCopyOk ? 'Copiada' : 'Copiar'}
        </Text>
      </button>
      {clabeFeedback.message && !clabeCopyOk ? (
        <Text type="supporting" color="secondary" role="status">
          {clabeFeedback.message}
        </Text>
      ) : null}

        <RadioList
          label="¿Cómo nos mandas tu comprobante?"
          value={activeMethod}
          onChange={(val) =>
            onChangeProofMethod(val === 'instagram_dm' ? 'instagram_dm' : 'web_upload')
          }
        >
          <RadioListItem
            value="web_upload"
            label="Lo subo ahora"
            description="Captura PNG, JPG o WEBP."
          />
          <RadioListItem
            value="instagram_dm"
            label={`Lo mando por DM a ${instagramHandle}`}
            description="Apartas ya y lo envías después."
          />
        </RadioList>

        {activeMethod === 'web_upload' ? (
          <FileInput
            label="Comprobante de transferencia"
            description="Hasta 2.5 MB."
            mode="dropzone"
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
          <VStack gap={2} padding={3} className="rb-card">
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
          </VStack>
        )}
    </VStack>
  );
}
