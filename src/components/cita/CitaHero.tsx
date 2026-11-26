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
): HeroCopy {
  switch (status) {
    case 'confirmed':
      return {
        title: 'Cita confirmada',
        statusLabel: 'Confirmada',
        tone: 'success',
        subtitle: `Tu lugar en ${salonName} está confirmado. Aquí tienes los detalles de tu visita.`,
      };
    case 'pending_payment':
      return {
        title: '¡Tu cita está apartada!',
        statusLabel: 'Anticipo pendiente',
        tone: 'warning',
        subtitle: hasPaymentProof
          ? 'Recibimos tu comprobante y lo estamos validando.'
          : 'Envía tu anticipo para confirmar tu horario.',
      };
    case 'pending_confirmation':
      return {
        title: '¡Tu cita está apartada!',
        statusLabel: hasPaymentProof ? 'Comprobante en revisión' : 'Pendiente de confirmación',
        tone: 'warning',
        subtitle: hasPaymentProof
          ? 'Ya tenemos tu comprobante. Te avisamos por WhatsApp en cuanto quede confirmada.'
          : 'Sube tu comprobante de anticipo aquí o mándalo por Instagram para confirmarla.',
      };
    case 'completed':
      return {
        title: '¡Gracias por visitarnos!',
        statusLabel: 'Completada',
        tone: 'info',
        subtitle: `Esperamos que hayas amado tu set en ${salonName}. Cuéntanos cómo te fue.`,
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
        subtitle: 'Si necesitas reagendar una nueva visita, puedes reservar en línea.',
      };
  }
}

export function CitaHero({
  status,
  bookingCode,
  salonName,
  hasPaymentProof,
}: CitaHeroProps) {
  const copy = getHeroCopy(status, salonName, hasPaymentProof);
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

  return (
    <VStack as="section" className="rb-hero ck-hero" aria-labelledby="ck-title">
      <img
        className="rb-hero-cherries"
        src={LANDING_ASSETS.cherriesWhite}
        alt=""
        width={340}
        height={340}
        decoding="async"
      />
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
            {copyFeedback.message && copyOk ? (
              <Check size={14} aria-hidden="true" className="fx-pop" />
            ) : (
              <Copy size={14} aria-hidden="true" />
            )}
          </button>
          <Text
            color="inherit"
            type="supporting"
            role="status"
            aria-live="polite"
            className="ck-hero-status"
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
