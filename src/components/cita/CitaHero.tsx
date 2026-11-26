'use client';

import { useRef, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Check, Copy } from 'lucide-react';
import type { BookingStatus } from '@/lib/types';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import { LANDING_ASSETS } from '../landing/landingContent';

interface CitaHeroProps {
  status: BookingStatus;
  bookingCode: string;
  salonName: string;
  hasPaymentProof: boolean;
  requiresDeposit?: boolean;
}

interface HeroCopy {
  title: string;
  statusLabel: string;
  tone: 'success' | 'warning' | 'info' | 'error';
  subtitle: string;
}

function getHeroCopy(
  status: BookingStatus,
  salonName: string,
  hasPaymentProof: boolean,
  requiresDeposit: boolean,
): HeroCopy {
  switch (status) {
    case 'confirmed':
      return {
        title: 'Cita confirmada',
        statusLabel: 'Confirmada',
        tone: 'success',
        subtitle: `Todo listo para tu cita en ${salonName}. Aquí tienes tus accesos rápidos y detalles.`,
      };
    case 'pending_payment':
      return {
        title: '¡Tu cita está apartada!',
        statusLabel: hasPaymentProof ? 'Comprobante en revisión' : 'Anticipo pendiente',
        tone: 'warning',
        subtitle: hasPaymentProof
          ? 'Comprobante recibido · En revisión por el estudio. Te avisamos por WhatsApp al confirmar.'
          : 'Completa tu anticipo en línea o por SPEI para confirmar tu horario.',
      };
    case 'pending_confirmation':
      return {
        title: '¡Tu cita está apartada!',
        statusLabel: hasPaymentProof
          ? 'Comprobante en revisión'
          : requiresDeposit
            ? 'Anticipo pendiente'
            : 'Pendiente de confirmación',
        tone: 'warning',
        subtitle: hasPaymentProof
          ? 'Comprobante recibido · En revisión por el estudio. Te avisamos por WhatsApp en cuanto quede confirmada.'
          : requiresDeposit
            ? 'Envía tu anticipo por SPEI y sube tu comprobante aquí o mándalo por Instagram DM.'
            : 'El estudio está revisando tu solicitud y te confirmará por WhatsApp muy pronto.',
      };
    case 'completed':
      return {
        title: '¡Gracias por visitarnos!',
        statusLabel: 'Completada',
        tone: 'info',
        subtitle: `Esperamos que hayas amado tu set en ${salonName}. Cuéntanos cómo te fue y agenda tu próximo retoque.`,
      };
    case 'canceled':
      return {
        title: 'Cita cancelada',
        statusLabel: 'Cancelada',
        tone: 'error',
        subtitle: 'Esta cita fue cancelada y el horario quedó libre al instante.',
      };
    case 'no_show':
      return {
        title: 'Cita registrada como inasistencia',
        statusLabel: 'No asistió',
        tone: 'error',
        subtitle: 'Cuando estés lista para volver, puedes agendar una nueva cita en línea.',
      };
  }
}

export function CitaHero({
  status,
  bookingCode,
  salonName,
  hasPaymentProof,
  requiresDeposit = true,
}: CitaHeroProps) {
  const copy = getHeroCopy(status, salonName, hasPaymentProof, requiresDeposit);
  const copyFeedback = useEphemeralMessage(2400);
  const [copyOk, setCopyOk] = useState(false);
  const lastAnnouncementRef = useRef('');

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(bookingCode);
      setCopyOk(true);
      let msg = `Código ${bookingCode} copiado`;
      if (msg === lastAnnouncementRef.current) {
        msg += '\u00A0';
      }
      lastAnnouncementRef.current = msg;
      copyFeedback.show(msg);
    } catch {
      setCopyOk(false);
      let msg = 'No se pudo copiar el código automáticamente';
      if (msg === lastAnnouncementRef.current) {
        msg += '\u00A0';
      }
      lastAnnouncementRef.current = msg;
      copyFeedback.show(msg);
    }
  };

  const isCopiedActive = Boolean(copyFeedback.message && copyOk);

  return (
    <VStack as="section" className="rb-hero ck-hero" aria-labelledby="ck-title">
      <VStack gap={3} className="rb-wrap rb-hero-inner fx-fade-up">
        <HStack gap={2} align="center" wrap="wrap" className="ck-hero-meta">
          <Text color="inherit" className="ck-status-pill fx-pop" data-tone={copy.tone}>
            {copy.statusLabel}
          </Text>
          <button
            type="button"
            className="ck-code-btn fx-press"
            aria-label={`Copiar código de reserva ${bookingCode}`}
            onClick={() => void handleCopyCode()}
          >
            <Text color="inherit" weight="bold" hasTabularNumbers>
              {bookingCode}
            </Text>
            {isCopiedActive ? (
              <>
                <Check size={14} aria-hidden="true" className="fx-pop" />
                <Text color="inherit" type="supporting" weight="semibold">
                  Copiado
                </Text>
              </>
            ) : (
              <Copy size={14} aria-hidden="true" />
            )}
          </button>
          <Text
            color="inherit"
            type="supporting"
            role="status"
            aria-live="polite"
            className={copyFeedback.message && !copyOk ? 'ck-hero-status' : 'rb-sr-only'}
          >
            {copyFeedback.message ?? ''}
          </Text>
        </HStack>

        <VStack gap={1.5}>
          <Heading
            level={1}
            id="ck-title"
            color="inherit"
            textWrap="balance"
            className="lk-serif rb-hero-title"
          >
            {copy.title}
          </Heading>
          <img
            className="rb-hero-stroke"
            src={LANDING_ASSETS.strokePorcelain}
            alt=""
            width={180}
            height={20}
            decoding="async"
          />
        </VStack>

        <Text color="inherit" textWrap="pretty" className="ck-hero-sub">
          {copy.subtitle}
        </Text>
      </VStack>
      <svg
        className="rb-hero-wave"
        viewBox="0 0 1440 40"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M0 40h1440V22c-120-14-240-20-360-12S840 34 720 34 480 14 360 10 120 20 0 26Z" />
      </svg>
    </VStack>
  );
}
