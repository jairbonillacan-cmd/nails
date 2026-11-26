'use client';

import { useMemo } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Download } from 'lucide-react';
import { generateQrSvg } from '@/lib/qr';
import { CopyableField } from '@/components/ui';

interface DashboardQrDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  salonName: string;
  targetUrl: string;
  canCustomizeBrand: boolean;
  onDownloaded?: () => void;
}

export function DashboardQrDialog({
  isOpen,
  onOpenChange,
  salonName,
  targetUrl,
  canCustomizeBrand,
  onDownloaded,
}: DashboardQrDialogProps) {
  const qrSvgMarkup = useMemo(
    () => (isOpen ? generateQrSvg(targetUrl, `Código QR para agendar en ${salonName}`) : ''),
    [isOpen, targetUrl, salonName],
  );
  const qrDataUri = useMemo(
    () =>
      qrSvgMarkup ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvgMarkup)}` : '',
    [qrSvgMarkup],
  );

  const handleDownloadQrSvg = () => {
    if (!qrSvgMarkup) return;
    const blob = new Blob([qrSvgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = 'qr-reservas.svg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
    onDownloaded?.();
  };

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} width={440} padding={5}>
      <VStack gap={4}>
        <DialogHeader
          title="Código QR de tu salón"
          subtitle="Muéstralo en mostrador o descárgalo para que tus clientas agenden con su cámara."
          onOpenChange={onOpenChange}
        />
        <VStack className="ad-subpanel" gap={3} align="center">
          {qrDataUri ? (
            <VStack className="ad-qr-stage" align="center" justify="center">
              <img
                src={qrDataUri}
                alt={`Código QR para agendar en ${salonName}`}
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
          ) : null}
          <CopyableField
            value={targetUrl}
            monospace
            copyLabel="Copiar enlace"
            copiedLabel="¡Copiado!"
            feedbackMessage="¡Link de reservas copiado!"
          />
        </VStack>
        <HStack gap={2} justify="end" wrap="wrap">
          {canCustomizeBrand ? (
            <Button label="Personalizar en Mi página" variant="ghost" size="sm" href="/admin/marca" />
          ) : null}
          <Button
            type="button"
            label="Descargar QR"
            variant="primary"
            size="sm"
            icon={<Download size={14} aria-hidden="true" />}
            onClick={handleDownloadQrSvg}
          />
        </HStack>
      </VStack>
    </Dialog>
  );
}
