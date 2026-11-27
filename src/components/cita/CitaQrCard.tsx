'use client';

import { useMemo } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Check, Download, QrCode } from 'lucide-react';
import { CopyableField } from '@/components/ui/CopyableField';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import { generateQrSvg } from '@/lib/qr';

interface CitaQrCardProps {
  bookingCode: string;
  salonName: string;
  manageUrl: string;
}

export function CitaQrCard({ bookingCode, salonName, manageUrl }: CitaQrCardProps) {
  const downloadFeedback = useEphemeralMessage(2600);
  const qrLabel = `Código QR de tu cita ${bookingCode} en ${salonName}`;
  const qrSvgMarkup = useMemo(
    () => generateQrSvg(manageUrl, qrLabel),
    [manageUrl, qrLabel],
  );
  const qrDataUri = useMemo(
    () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvgMarkup)}`,
    [qrSvgMarkup],
  );

  const handleDownloadQrSvg = () => {
    const blob = new Blob([qrSvgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `cita-${bookingCode.toLowerCase()}-qr.svg`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objectUrl);
    downloadFeedback.show('QR descargado ✓');
  };

  const isDownloadedActive = Boolean(downloadFeedback.message);

  return (
    <SurfaceCard
      id="ck-qr-title"
      headingLevel={3}
      title="Código QR de tu cita"
      subtitle={`Guarda este pase para abrir tu cita al instante y muéstralo en recepción al llegar para check-in rápido (${bookingCode}).`}
      icon={<QrCode size={16} aria-hidden="true" className="lk-cereza-text" />}
      padded
      className="ck-panel fx-fade-up"
    >
      <HStack gap={4} align="center" className="ck-qr-wrap">
        <VStack className="ck-qr-box" align="center" justify="center">
          <img
            src={qrDataUri}
            alt={qrLabel}
            width={120}
            height={120}
            loading="lazy"
            decoding="async"
            className="ck-qr-img"
          />
        </VStack>
        <VStack gap={2} className="rb-grow" style={{ minWidth: 0 }}>
          <CopyableField
            label="Enlace de tu cita"
            value={manageUrl}
            copyLabel="Copiar enlace"
            copiedLabel="Enlace copiado ✓"
            feedbackMessage="Enlace copiado ✓"
          />
          <HStack gap={2} wrap="wrap" align="center">
            <Button
              type="button"
              label={isDownloadedActive ? 'QR descargado ✓' : 'Descargar QR'}
              variant="ghost"
              size="md"
              className="fx-press"
              icon={
                isDownloadedActive ? (
                  <Check size={15} aria-hidden="true" className="fx-pop" />
                ) : (
                  <Download size={15} aria-hidden="true" />
                )
              }
              onClick={handleDownloadQrSvg}
            />
            <Text
              type="supporting"
              color="accent"
              role="status"
              aria-live="polite"
              className={downloadFeedback.message ? 'fx-fade-up' : 'rb-sr-only'}
            >
              {downloadFeedback.message ?? ''}
            </Text>
          </HStack>
        </VStack>
      </HStack>
    </SurfaceCard>
  );
}
