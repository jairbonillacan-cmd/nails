'use client';

import { useMemo, useState } from 'react';
import { Card } from '@astryxdesign/core/Card';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Token } from '@astryxdesign/core/Token';
import { Copy, Download, ExternalLink, QrCode } from 'lucide-react';
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
      feedback.show('Enlace copiado al portapapeles.');
    } catch {
      feedback.show(`Copia manualmente: ${targetUrl}`);
    }
  };

  return (
    <Card padding={5}>
      <VStack gap={4}>
        <HStack justify="between" align="center" wrap="wrap" gap={2}>
          <HStack gap={2} align="center">
            <QrCode size={18} aria-hidden="true" />
            <Heading level={3}>Código QR para mostrador e Instagram</Heading>
          </HStack>
          <Token size="sm" label={relativePath} />
        </HStack>

        <Text type="supporting" color="secondary">
          Descarga el QR en vector SVG o PNG de alta resolución para tu espejo, tarjetas o recepción.
        </Text>

        <SegmentedControl
          label="Destino del código QR"
          layout="fill"
          value={target}
          onChange={(val) => setTarget(val === 'links' ? 'links' : 'reservar')}
        >
          <SegmentedControlItem value="reservar" label="Agenda directa (/reservar)" />
          <SegmentedControlItem value="links" label="Bio-Link Instagram (/links)" />
        </SegmentedControl>

        <Card variant="muted" padding={4}>
          <VStack gap={2} align="center">
            <img
              src={svgDataUri}
              alt={qrLabel}
              width={220}
              height={220}
              style={{
                display: 'block',
                maxWidth: '100%',
                height: 'auto',
                borderRadius: 'var(--radius-md)',
              }}
            />
            <Text type="code" color="secondary">
              {targetUrl}
            </Text>
          </VStack>
        </Card>

        <HStack gap={2} wrap="wrap">
          <Button
            type="button"
            label="Descargar SVG"
            variant="primary"
            size="sm"
            icon={<Download size={14} />}
            onClick={handleDownloadSvg}
          />
          <Button
            type="button"
            label="Descargar PNG"
            variant="secondary"
            size="sm"
            icon={<Download size={14} />}
            onClick={handleDownloadPng}
          />
          <Button
            type="button"
            label="Copiar enlace"
            variant="secondary"
            size="sm"
            icon={<Copy size={14} />}
            onClick={() => void handleCopyUrl()}
          />
          <Button
            label="Abrir"
            variant="ghost"
            size="sm"
            icon={<ExternalLink size={14} />}
            href={relativePath}
            target="_blank"
            rel="noopener noreferrer"
          />
        </HStack>

        <Text type="supporting" color="secondary" role="status" aria-live="polite">
          {feedback.message ?? 'Escaneable desde cámara iOS y Android sin apps externas.'}
        </Text>
      </VStack>
    </Card>
  );
}
