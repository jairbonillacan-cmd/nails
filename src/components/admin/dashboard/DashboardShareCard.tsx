'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import NextLink from 'next/link';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { ExternalLink, QrCode, Share2 } from 'lucide-react';
import { useClientOrigin } from '@/lib/hooks/useClientOrigin';
import { useCopyToClipboard } from '@/lib/hooks/useCopyToClipboard';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import { getDisplayBookingUrl } from './dashboardMetrics';

const DashboardQrDialog = dynamic(
  () => import('./DashboardQrDialog').then((mod) => mod.DashboardQrDialog),
  { ssr: false },
);

interface DashboardShareCardProps {
  salonName: string;
  instagramHandle: string | null;
  appUrl: string;
  canCustomizeBrand: boolean;
}

export function DashboardShareCard({
  salonName,
  instagramHandle,
  appUrl,
  canCustomizeBrand,
}: DashboardShareCardProps) {
  const { copied, feedback: copyFeedback, copy } = useCopyToClipboard(2400);
  const shareStatus = useEphemeralMessage(2400);
  const [qrOpen, setQrOpen] = useState(false);

  const bookingDisplayUrl = getDisplayBookingUrl(appUrl);
  const resolvedOrigin = useClientOrigin(appUrl);
  const qrTargetUrl = `${resolvedOrigin}/reservar`;

  const handleCopyBookingLink = () => {
    void copy(
      qrTargetUrl,
      '¡Link de reservas copiado!',
      'Copia manualmente /reservar',
    );
  };

  const handleShareBookingLink = async () => {
    const text = `Reserva tu cita en ${salonName} en segundos:`;
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: salonName, text, url: qrTargetUrl });
        shareStatus.show('Página compartida');
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }
    await copy(
      `${text} ${qrTargetUrl}`,
      '¡Enlace listo para WhatsApp o IG!',
      'Abre /reservar para compartir',
    );
  };

  const liveAnnouncement = shareStatus.message ?? copyFeedback ?? '';

  return (
    <>
      <VStack as="section" className="ad-cherry-card" aria-labelledby="ad-pg" gap={3}>
        <VStack gap={1.5} className="ad-cherry-layer">
          <Text color="inherit" weight="semibold" className="ad-live-label">
            RESERVAS ONLINE
          </Text>
          <Heading level={2} id="ad-pg" className="lk-serif ad-cherry-title">
            Tu página de reservas
          </Heading>
          <Text color="inherit" className="ad-cherry-desc" textWrap="pretty">
            Compártela en {instagramHandle || 'Instagram'} y WhatsApp para que tus clientas
            agenden con anticipo.
          </Text>
        </VStack>

        <HStack
          justify="between"
          align="center"
          gap={2}
          className="ad-cherry-link ad-cherry-layer"
        >
          <Text color="inherit" weight="semibold" size="sm" className="ad-link-url">
            {bookingDisplayUrl}
          </Text>
          <button
            type="button"
            className="ad-cherry-copy fx-press"
            onClick={handleCopyBookingLink}
          >
            {copied ? '¡Copiado!' : 'Copiar'}
          </button>
        </HStack>

        <Text
          type="supporting"
          color="inherit"
          role="status"
          aria-live="polite"
          className="rb-sr-only"
        >
          {liveAnnouncement}
        </Text>

        <VStack className="ad-cherry-actions ad-cherry-layer" gap={0}>
          <NextLink
            href="/reservar"
            target="_blank"
            rel="noopener noreferrer"
            className="ad-cherry-chip fx-press"
          >
            <ExternalLink size={13} aria-hidden="true" />
            Ver página
          </NextLink>
          <NextLink
            href="/links"
            target="_blank"
            rel="noopener noreferrer"
            className="ad-cherry-chip fx-press"
          >
            Link para IG
          </NextLink>
          <button
            type="button"
            className="ad-cherry-chip fx-press"
            onClick={() => setQrOpen(true)}
          >
            <QrCode size={13} aria-hidden="true" />
            Código QR
          </button>
          <button
            type="button"
            className="ad-cherry-chip fx-press"
            onClick={() => void handleShareBookingLink()}
          >
            <Share2 size={13} aria-hidden="true" />
            Compartir
          </button>
        </VStack>
      </VStack>

      {qrOpen ? (
        <DashboardQrDialog
          isOpen={qrOpen}
          onOpenChange={setQrOpen}
          salonName={salonName}
          targetUrl={qrTargetUrl}
          canCustomizeBrand={canCustomizeBrand}
          onDownloaded={() => shareStatus.show('Código QR descargado')}
        />
      ) : null}
    </>
  );
}
