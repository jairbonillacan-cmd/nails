'use client';

import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Check, Copy, Download, ExternalLink, QrCode } from 'lucide-react';
import {
  AdminConfigChip,
  AdminConfigSection,
} from '@/components/admin/config/AdminConfigPrimitives';
import { generateQrSvg } from '@/lib/qr';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';

interface QrShareCardProps {
  appUrl: string;
  salonName: string;
}

type QrTargetMode = 'reservar' | 'links';

function sanitizeFilenameSegment(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'salon';
}

export function QrShareCard({ appUrl, salonName }: QrShareCardProps) {
  const [target, setTarget] = useState<QrTargetMode>('reservar');
  const [lastAction, setLastAction] = useState<'copy' | 'svg' | 'png' | null>(null);
  const feedback = useEphemeralMessage(2600);

  const baseOrigin = (
    appUrl.trim() ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://laikona.nails')
  ).replace(/\/+$/, '');

  const relativePath = target === 'links' ? '/links' : '/reservar';
  const targetUrl = `${baseOrigin}${relativePath}`;
  const qrLabel =
    target === 'links'
      ? `Código QR Bio-Link Instagram de ${salonName}`
      : `Código QR Agenda directa de ${salonName}`;

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
    feedback.show('SVG descargado listo para impresión.');
  };

  const handleDownloadPng = () => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 1024;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        feedback.show('No se pudo inicializar el lienzo PNG.');
        return;
      }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, 1024, 1024);
      canvas.toBlob((blob) => {
        if (!blob) {
          feedback.show('No se pudo exportar la imagen PNG.');
          return;
        }
        triggerBlobDownload(blob, `${filePrefix}.png`);
        setLastAction('png');
        feedback.show('PNG 1024x1024 descargado.');
      }, 'image/png');
    };
    img.onerror = () => {
      feedback.show('No se pudo renderizar el QR para PNG.');
    };
    img.src = svgDataUri;
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(targetUrl);
      setLastAction('copy');
      feedback.show('Enlace copiado al portapapeles.');
    } catch {
      feedback.show(`Copia manualmente: ${targetUrl}`);
    }
  };

  const isCopyActive = lastAction === 'copy' && Boolean(feedback.message);
  const isSvgActive = lastAction === 'svg' && Boolean(feedback.message);
  const isPngActive = lastAction === 'png' && Boolean(feedback.message);

  return (
    <AdminConfigSection
      id="qr-share-heading"
      icon={<QrCode size={16} aria-hidden="true" />}
      title="Código QR para mostrador"
      subtitle="Descarga en SVG vectorial o PNG 1024×1024 para espejo, tarjetas o recepción."
      badge={<AdminConfigChip label={relativePath} tone="accent" />}
      footer={
        <Text type="supporting" color="secondary" role="status" aria-live="polite">
          {feedback.message ?? 'Escaneable desde cámara iOS y Android sin apps externas.'}
        </Text>
      }
    >
      <VStack gap={4} className="ad-card-body" paddingBlockStart={4}>
        <SegmentedControl
          label="Destino del código QR"
          layout="fill"
          size="sm"
          value={target}
          onChange={(val) => setTarget(val === 'links' ? 'links' : 'reservar')}
        >
          <SegmentedControlItem value="reservar" label="Agenda (/reservar)" />
          <SegmentedControlItem value="links" label="Bio-Link (/links)" />
        </SegmentedControl>

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
          <Text className="ad-code-pill" color="secondary">
            {targetUrl}
          </Text>
        </VStack>

        <HStack gap={2} wrap="wrap">
          <Button
            type="button"
            label={isSvgActive ? 'SVG listo' : 'Descargar SVG'}
            variant="primary"
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
            type="button"
            label={isPngActive ? 'PNG listo' : 'Descargar PNG'}
            variant="secondary"
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
            label={isCopyActive ? 'Copiado' : 'Copiar enlace'}
            variant={isCopyActive ? 'primary' : 'secondary'}
            size="sm"
            icon={
              isCopyActive ? (
                <Check size={14} aria-hidden="true" className="fx-pop" />
              ) : (
                <Copy size={14} aria-hidden="true" />
              )
            }
            onClick={() => void handleCopyUrl()}
          />
          <Button
            label="Abrir"
            variant="ghost"
            size="sm"
            icon={<ExternalLink size={14} aria-hidden="true" />}
            href={relativePath}
            target="_blank"
            rel="noopener noreferrer"
          />
        </HStack>
      </VStack>
    </AdminConfigSection>
  );
}
