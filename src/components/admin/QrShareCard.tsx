'use client';

import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Check, Download, ExternalLink, QrCode } from 'lucide-react';
import {
  CopyableField,
  FilterPillBar,
  StatusTag,
  SurfaceCard,
} from '@/components/ui';
import { generateQrSvg } from '@/lib/qr';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';

interface QrShareCardProps {
  appUrl: string;
  salonName: string;
}

type QrTargetMode = 'reservar' | 'links';

const QR_TARGET_OPTIONS = [
  { value: 'reservar' as const, label: 'Agenda de citas' },
  { value: 'links' as const, label: 'Links de Instagram' },
];

function sanitizeFilenameSegment(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'salon';
}

export function QrShareCard({ appUrl, salonName }: QrShareCardProps) {
  const [target, setTarget] = useState<QrTargetMode>('reservar');
  const [lastAction, setLastAction] = useState<'svg' | 'png' | null>(null);
  const feedback = useEphemeralMessage(2600);

  const baseOrigin = (
    appUrl.trim() ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://laikona.nails')
  ).replace(/\/+$/, '');

  const relativePath = target === 'links' ? '/links' : '/reservar';
  const targetUrl = `${baseOrigin}${relativePath}`;
  const qrLabel =
    target === 'links'
      ? `Código QR de enlaces para Instagram de ${salonName}`
      : `Código QR para agendar en ${salonName}`;

  const svgMarkup = useMemo(
    () => generateQrSvg(targetUrl, qrLabel),
    [targetUrl, qrLabel],
  );
  const svgDataUri = useMemo(
    () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`,
    [svgMarkup],
  );

  const filePrefix = `qr-${sanitizeFilenameSegment(salonName)}-${target}`;

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  };

  const handleDownloadSvg = () => {
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    triggerBlobDownload(blob, `${filePrefix}.svg`);
    setLastAction('svg');
    feedback.show('Archivo listo para imprimir descargado.');
  };

  const handleDownloadPng = () => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 1024;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        feedback.show('No se pudo preparar la imagen.');
        return;
      }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, 1024, 1024);
      canvas.toBlob((blob) => {
        if (!blob) {
          feedback.show('No se pudo descargar la imagen.');
          return;
        }
        triggerBlobDownload(blob, `${filePrefix}.png`);
        setLastAction('png');
        feedback.show('Imagen de alta calidad descargada.');
      }, 'image/png');
    };
    img.onerror = () => {
      feedback.show('No se pudo generar la imagen del código QR.');
    };
    img.src = svgDataUri;
  };

  const isSvgActive = lastAction === 'svg' && Boolean(feedback.message);
  const isPngActive = lastAction === 'png' && Boolean(feedback.message);

  return (
    <SurfaceCard
      id="qr-share-heading"
      icon={<QrCode size={16} aria-hidden="true" />}
      title="Link de reservas y QR para el mostrador"
      subtitle="Compártelo por Instagram o imprímelo para tu espejo, mesa o tarjetas."
      badge={
        <StatusTag
          label={target === 'links' ? 'Página de enlaces' : 'Agenda directa'}
          tone="accent"
        />
      }
      footer={
        <Text type="supporting" color="secondary" role="status" aria-live="polite">
          {feedback.message ??
            'Se escanea con la cámara de cualquier celular, sin descargar apps.'}
        </Text>
      }
    >
      <VStack gap={4} className="ad-card-body" paddingBlockStart={4}>
        <FilterPillBar
          ariaLabel="A dónde lleva el código QR"
          mode="segmented"
          layout="fill"
          value={target}
          options={QR_TARGET_OPTIONS}
          onChange={setTarget}
        />

        <VStack className="ad-subpanel" gap={3} align="center">
          <VStack className="ad-qr-stage" align="center" justify="center">
            <img
              src={svgDataUri}
              alt={qrLabel}
              width={200}
              height={200}
              style={{
                display: 'block',
                maxWidth: '100%',
                height: 'auto',
                borderRadius: 'var(--radius-sm)',
              }}
            />
          </VStack>

          <CopyableField
            label="Link para compartir"
            value={targetUrl}
            copyLabel="Copiar link"
            copiedLabel="Link copiado"
            feedbackMessage="Link de reservas copiado."
            monospace
          />
        </VStack>

        <HStack gap={2} wrap="wrap">
          <Button
            type="button"
            label={isPngActive ? 'Imagen lista' : 'Descargar QR'}
            variant="primary"
            size="sm"
            icon={
              isPngActive ? (
                <Check size={14} aria-hidden="true" className="fx-pop" />
              ) : (
                <Download size={14} aria-hidden="true" />
              )
            }
            onClick={handleDownloadPng}
          />
          <Button
            type="button"
            label={isSvgActive ? 'Archivo listo' : 'Para imprenta (SVG)'}
            variant="secondary"
            size="sm"
            icon={
              isSvgActive ? (
                <Check size={14} aria-hidden="true" className="fx-pop" />
              ) : (
                <Download size={14} aria-hidden="true" />
              )
            }
            onClick={handleDownloadSvg}
          />
          <Button
            label="Abrir página"
            variant="ghost"
            size="sm"
            icon={<ExternalLink size={14} aria-hidden="true" />}
            href={relativePath}
            target="_blank"
            rel="noopener noreferrer"
          />
        </HStack>
      </VStack>
    </SurfaceCard>
  );
}
