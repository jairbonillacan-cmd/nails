'use client';

import NextLink from 'next/link';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { ChevronLeft, MessageCircle, Timer } from 'lucide-react';
import { LANDING_ASSETS } from '../landing/landingContent';
import { BOOKING_STEPS, type BookingStep } from './bookingMachine';

export const STEP_LABELS: Readonly<Record<BookingStep, string>> = {
  service: 'Servicio',
  extras: 'Extras',
  schedule: 'Día y hora',
  staff: 'Artista',
  details: 'Tus datos',
};

export function formatHoldClock(totalSeconds: number): string {
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

interface BookingHeaderProps {
  salonName: string;
  step?: BookingStep;
  holdRemainingSec?: number;
  whatsappUrl: string;
  onBack?: (() => void) | null;
}

export function BookingHeader({
  salonName,
  step,
  holdRemainingSec = 0,
  whatsappUrl,
  onBack = null,
}: BookingHeaderProps) {
  const stepIndex = step ? BOOKING_STEPS.indexOf(step) : -1;
  const progress = stepIndex >= 0 ? ((stepIndex + 0.5) / BOOKING_STEPS.length) * 100 : null;

  return (
    <header className="rb-header">
      <nav className="rb-header-bar" aria-label="Reserva">
        <HStack align="center">
          {onBack ? (
            <button type="button" className="rb-ghost fx-press" onClick={onBack} aria-label="Paso anterior">
              <ChevronLeft size={20} aria-hidden="true" />
              <Text color="inherit" weight="semibold" className="rb-d">
                Atrás
              </Text>
            </button>
          ) : (
            <NextLink className="rb-ghost fx-press" href="/" aria-label="Volver al inicio">
              <ChevronLeft size={20} aria-hidden="true" />
              <Text color="inherit" weight="semibold" className="rb-d">
                Inicio
              </Text>
            </NextLink>
          )}
        </HStack>
        <NextLink href="/" aria-label={`${salonName}, inicio`} className="rb-logo-link">
          <img
            className="rb-logo"
            src={LANDING_ASSETS.logoBlack}
            alt={salonName}
            width={120}
            height={50}
            fetchPriority="high"
            decoding="async"
          />
        </NextLink>
        <HStack align="center" justify="end" gap={1}>
          {holdRemainingSec > 0 ? (
            <p
              className="rb-timer fx-tabular fx-pop"
              role="timer"
              aria-live="off"
              aria-label={
                holdRemainingSec <= 60
                  ? 'Menos de un minuto restante de apartado'
                  : 'Tiempo restante de apartado'
              }
              data-urgent={holdRemainingSec <= 60 ? 'true' : 'false'}
            >
              <Timer size={14} aria-hidden="true" />
              {formatHoldClock(holdRemainingSec)}
            </p>
          ) : null}
          <a
            className="rb-ghost fx-press"
            href={whatsappUrl}
            aria-label="Ayuda por WhatsApp"
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle size={20} aria-hidden="true" />
            <Text color="inherit" weight="semibold" className="rb-d">
              Ayuda
            </Text>
          </a>
        </HStack>
      </nav>
      {progress !== null ? (
        <progress
          className="rb-progress"
          aria-label="Progreso de la reserva"
          max={100}
          value={progress}
        />
      ) : null}
    </header>
  );
}

interface BookingHeroProps {
  step: BookingStep;
  completedSteps: ReadonlySet<BookingStep>;
  onGoToStep: (step: BookingStep) => void;
  isCompact?: boolean;
  holdRemainingSec?: number;
}

export function BookingHero({
  step,
  completedSteps,
  onGoToStep,
  isCompact = false,
  holdRemainingSec = 0,
}: BookingHeroProps) {
  const stepIndex = BOOKING_STEPS.indexOf(step);

  if (isCompact) {
    return (
      <VStack as="section" className="rb-hero" aria-labelledby="rb-title">
        <VStack gap={2} className="rb-wrap rb-hero-inner">
          <HStack justify="between" align="center" wrap="wrap" gap={2}>
            <Heading level={1} id="rb-title" color="inherit" className="lk-serif rb-hero-title">
              Reserva tu cita
            </Heading>
            <HStack align="center" gap={2}>
              {holdRemainingSec > 0 ? (
                <p
                  className="rb-timer fx-tabular fx-pop"
                  role="timer"
                  aria-live="off"
                  aria-label={
                    holdRemainingSec <= 60
                      ? 'Menos de un minuto restante de apartado'
                      : 'Tiempo restante de apartado'
                  }
                  data-urgent={holdRemainingSec <= 60 ? 'true' : 'false'}
                >
                  <Timer size={14} aria-hidden="true" />
                  {formatHoldClock(holdRemainingSec)}
                </p>
              ) : null}
              <Text color="inherit" type="supporting" weight="semibold">
                Paso {stepIndex + 1} de {BOOKING_STEPS.length} · {STEP_LABELS[step]}
              </Text>
            </HStack>
          </HStack>
        </VStack>
      </VStack>
    );
  }

  return (
    <VStack as="section" className="rb-hero" aria-labelledby="rb-title">
      <img
        className="rb-hero-cherries"
        src={LANDING_ASSETS.cherriesWhite}
        alt=""
        width={340}
        height={340}
        decoding="async"
      />
      <VStack gap={4} className="rb-wrap rb-hero-inner">
        <HStack justify="between" align="end" wrap="wrap" gap={2}>
          <VStack gap={1}>
            <Heading level={1} id="rb-title" color="inherit" className="lk-serif rb-hero-title">
              Reserva tu cita
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
          <Text color="inherit" className="rb-live rb-d">
            Horarios en tiempo real
          </Text>
        </HStack>

        <ol className="rb-stepper rb-d" aria-label="Pasos">
          {BOOKING_STEPS.map((item, index) => {
            const isCurrent = item === step;
            const isDone = completedSteps.has(item) && !isCurrent;
            const isReachable = index < stepIndex;
            return (
              <li key={item}>
                <button
                  type="button"
                  className="rb-step fx-press"
                  data-current={isCurrent ? 'true' : 'false'}
                  aria-current={isCurrent ? 'step' : undefined}
                  disabled={!isReachable}
                  onClick={() => onGoToStep(item)}
                >
                  <Text color="inherit" weight="bold" className="rb-step-dot" data-on={isCurrent || isDone ? 'true' : 'false'}>
                    {isDone ? '✓' : String(index + 1)}
                  </Text>
                  <VStack gap={0}>
                    <Text color="inherit" type="supporting" className="rb-step-kicker">
                      Paso {index + 1}
                    </Text>
                    <Text color="inherit" weight="semibold">
                      {STEP_LABELS[item]}
                    </Text>
                  </VStack>
                </button>
              </li>
            );
          })}
        </ol>

        <HStack justify="between" gap={2} className="rb-m rb-hero-mobile">
          <Text color="inherit">
            <Text color="inherit" weight="bold">
              Paso {stepIndex + 1} de {BOOKING_STEPS.length}
            </Text>{' '}
            · {STEP_LABELS[step]}
          </Text>
          <Text color="inherit" className="rb-live">
            En vivo
          </Text>
        </HStack>
      </VStack>
      <svg className="rb-hero-wave" viewBox="0 0 1440 40" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 40h1440V22c-120-14-240-20-360-12S840 34 720 34 480 14 360 10 120 20 0 26Z" />
      </svg>
    </VStack>
  );
}
